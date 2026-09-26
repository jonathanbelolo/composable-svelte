import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {buildGraph} from './graph.mjs';
import {analyzeSemantics} from './semantics.mjs';

// TS instantiation expressions (`reducer<Row>`) are erased at runtime, so they must be exactly as transparent to
// authority flow as `!`, `as` and `satisfies`: never an unsupported construct, and never a way to hide authority.
function analyze(t, files) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'instantiation-expression-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {
    'package.json': JSON.stringify({name: 'fixture', dependencies: {'@composable-svelte/core': '0.13.0-next.1', svelte: '5.57.0'}}),
    'tsconfig.json': '{}',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core', version: '0.13.0-next.1', exports: {'.': './index.js', './application': './application.js'}
    }),
    'node_modules/svelte/package.json': JSON.stringify({name: 'svelte', version: '5.57.0', exports: {'.': './index.js'}}),
    ...files
  };
  for (const [path, source] of Object.entries(all)) {
    mkdirSync(dirname(join(projectRoot, path)), {recursive: true});
    writeFileSync(join(projectRoot, path), source);
  }
  const graph = buildGraph({
    projectRoot,
    roots: [Object.keys(files)[0]],
    tsconfig: 'tsconfig.json',
    opaquePackages: [
      {name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'},
      {name: 'svelte', version: '5.57.0', provenance: 'registry'}
    ]
  });
  assert.deepEqual(graph.errors, []);
  return analyzeSemantics({projectRoot, graph});
}

const detector = (result, name) => result.findings.filter((finding) => finding.detector === name);
const mentionsInstantiation = (result) => result.errors.some((error) => /ExpressionWithTypeArguments/.test(error.message));

test('instantiation expressions analyze completely and leave clean code clean', (t) => {
  const result = analyze(t, {
    'entry.ts': `
      import {defineApplication} from '@composable-svelte/core/application';
      type Row = {count: number};
      function identity<T>(value: T): T { return value; }
      function rowReducer<S>(state: S, action: {type: 'noop'}) { return [state]; }
      const pick = identity<number>;
      export const value = pick(1) + (identity<number>)(2);
      defineApplication(rowReducer<Row>, {});
      defineApplication((rowReducer<Row>), {});
    `
  });
  assert.equal(result.complete, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.findings, []);
});

test('heritage clauses keep their own rejection; only expression-position instantiation is erased', (t) => {
  const result = analyze(t, {
    'entry.ts': `
      class Base<T> { value?: T; }
      export class Box extends Base<number> {}
    `
  });
  assert.equal(result.complete, false);
  assert.ok(result.errors.some((error) => error.construct === 'class-inheritance'), JSON.stringify(result.errors));
  assert.equal(mentionsInstantiation(result), false);
});

test('store authority reaching a reducer through an instantiation expression is still reported', (t) => {
  const source = (alias) => `
    import {defineApplication, useApplication} from '@composable-svelte/core/application';
    const app = useApplication({});
    function readLive<T>(): T { return app.store.state as T; }
    const typedRead = ${alias};
    function storeReducer(state: any, action: any) {
      const live = typedRead();
      return [{...state, live}];
    }
    defineApplication(storeReducer, {});
  `;
  const control = analyze(t, {'entry.ts': source('readLive')});
  const instantiated = analyze(t, {'entry.ts': source('readLive<{count: number}>')});
  assert.equal(control.complete, true, JSON.stringify(control.errors));
  assert.equal(instantiated.complete, true, JSON.stringify(instantiated.errors));
  const expected = detector(control, 'store-authority-in-reducer');
  assert.ok(expected.length > 0, 'control must detect the leak');
  const actual = detector(instantiated, 'store-authority-in-reducer');
  assert.equal(actual.length, expected.length);
  for (const finding of actual) assert.equal(finding.rule, 'reducers/pure-decisions');
});

test('a reducer passed as an instantiation expression is still checked for store authority', (t) => {
  const source = (argument) => `
    import {defineApplication, useApplication} from '@composable-svelte/core/application';
    const app = useApplication({});
    function storeReducer<S>(state: S, action: unknown) {
      const live = app.store.state;
      return [{...state, live}];
    }
    defineApplication(${argument}, {});
  `;
  const control = analyze(t, {'entry.ts': source('storeReducer')});
  const instantiated = analyze(t, {'entry.ts': source('storeReducer<{count: number}>')});
  assert.equal(instantiated.complete, true, JSON.stringify(instantiated.errors));
  const expected = detector(control, 'store-authority-in-reducer');
  assert.ok(expected.length > 0, 'control must detect the leak');
  assert.equal(detector(instantiated, 'store-authority-in-reducer').length, expected.length);
});

test('an instantiated argument supplies a defaulted parameter exactly like other erased wrappers, without hiding its own authority', (t) => {
  const source = (argument) => `
    import {defineApplication, useApplication} from '@composable-svelte/core/application';
    const app = useApplication({});
    function identity<T>(value?: T): T | undefined { return value; }
    function readStore<T>(): T { return app.store.state as T; }
    function makeReducer(read: () => unknown = () => app.store.state) {
      return function reducer(state: any, action: any) { return [{...state, live: read()}]; };
    }
    defineApplication(makeReducer(${argument}), {});
  `;
  const leaks = (argument) => {
    const result = analyze(t, {'entry.ts': source(argument)});
    assert.equal(result.complete, true, JSON.stringify(result.errors));
    return detector(result, 'store-authority-in-reducer').length;
  };
  // The authority-bearing default runs only when nothing is supplied.
  assert.ok(leaks('') > 0);
  for (const supplied of ['identity', 'identity!', '(identity as () => undefined)']) assert.equal(leaks(supplied), 0, supplied);
  assert.equal(leaks('identity<number>'), 0);
  // The supplied instantiated function's own authority still reaches the reducer.
  assert.ok(leaks('readStore') > 0);
  assert.equal(leaks('readStore<{count: number}>'), leaks('readStore'));
});

test('framework authority obtained through an instantiated hook still drives a lifecycle mirror', (t) => {
  const source = (hook) => `<script lang="ts">
    import {onMount} from 'svelte';
    import {useApplication} from '@composable-svelte/core/application';
    const use = ${hook};
    const app = use({});
    let localState = $state(0);
    onMount(() => {
      localState = app.store.state.count;
    });
  </script>
  <p>{localState}</p>`;
  const control = analyze(t, {'App.svelte': source('useApplication')});
  const instantiated = analyze(t, {'App.svelte': source('useApplication<{count: number}, never>')});
  assert.equal(instantiated.complete, true, JSON.stringify(instantiated.errors));
  const expected = detector(control, 'lifecycle-mirror');
  assert.ok(expected.length > 0, 'control must detect the mirror');
  assert.equal(detector(instantiated, 'lifecycle-mirror').length, expected.length);
});

test('code inside an instantiation expression is runtime code: bodies and direct calls are analyzed like their plain forms', (t) => {
  const inReducer = (pre, body) => ({'entry.ts': `import {createStore, Effect} from '@composable-svelte/core';\n${pre}\nexport const store = createStore({initialState: {}, reducer: (state: any, action: any) => {\n${body}\nreturn [state, Effect.none()]; }});\n`});
  const pairs = [
    [`const g = <T,>(x: T) => { location.href = String(x); return x; };`, `const g = (<T,>(x: T) => { location.href = String(x); return x; })<string>;`, `g('/x');`],
    [`const g = <T,>(x: T) => { fetch('/x'); return x; };`, `const g = (<T,>(x: T) => { fetch('/x'); return x; })<number>;`, `g(1);`],
    [``, ``, `(crypto.getRandomValues)(new Uint8Array(1));`, `(crypto.getRandomValues<Uint8Array>)(new Uint8Array(1));`],
    [``, ``, `(document.querySelector)('#x');`, `(document.querySelector<HTMLElement>)('#x');`]
  ];
  for (const [plainPre, instantiatedPre, plainBody, instantiatedBody = plainBody] of pairs) {
    const plain = analyze(t, inReducer(plainPre, plainBody));
    const instantiated = analyze(t, inReducer(instantiatedPre, instantiatedBody));
    assert.equal(plain.complete, true, JSON.stringify(plain.errors));
    assert.ok(plain.findings.length > 0, `control must detect: ${plainPre}${plainBody}`);
    assert.equal(instantiated.complete, true, JSON.stringify(instantiated.errors));
    assert.deepEqual(instantiated.findings.map((finding) => finding.detector).sort(), plain.findings.map((finding) => finding.detector).sort(),
      `${instantiatedPre}${instantiatedBody}`);
  }
});
