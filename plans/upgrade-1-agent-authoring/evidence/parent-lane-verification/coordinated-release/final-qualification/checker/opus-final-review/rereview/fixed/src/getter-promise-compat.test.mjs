import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import ts from 'typescript';
import {buildGraph} from './graph.mjs';
import {analyzeSemantics} from './semantics.mjs';
import {buildSemanticContext} from './semantic-context.mjs';
import {buildValueFlow} from './semantic-flow.mjs';

// Bounded compatibility: alias getters and local synchronous Promise executors. Supported forms must carry authority
// exactly like their plain equivalents; every other form, and any path by which authority could leave through a
// getter, a settle function, a resolution, a rejection or an executor exception, must stay refused.
const PACKAGES = {
  '@composable-svelte/core': {version: '0.13.0-next.1', exports: {'.': './index.js', './application': './application.js'}},
  svelte: {version: '5.57.0', exports: {'.': './index.js'}},
  ext: {version: '1.0.0', exports: {'.': './index.js'}}
};
function project(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'getter-promise-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const all = {
    'package.json': JSON.stringify({name: 'fixture', dependencies: Object.fromEntries(Object.entries(PACKAGES).map(([name, {version}]) => [name, version]))}),
    'tsconfig.json': '{}',
    ...Object.fromEntries(Object.entries(PACKAGES).map(([name, {version, exports}]) => [`node_modules/${name}/package.json`, JSON.stringify({name, version, exports})])),
    ...files
  };
  for (const [name, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, name)), {recursive: true});
    writeFileSync(join(root, name), text);
  }
  const graph = buildGraph({projectRoot: root, roots: [Object.keys(files)[0]], tsconfig: 'tsconfig.json',
    opaquePackages: Object.entries(PACKAGES).map(([name, {version}]) => ({name, version, provenance: 'registry'}))});
  assert.deepEqual(graph.errors, []);
  return {root, graph};
}
function analyze(t, files) {
  const {root, graph} = project(t, files);
  const result = analyzeSemantics({projectRoot: root, graph});
  return {
    complete: result.complete,
    errors: result.errors.map((error) => error.construct ?? error.code),
    findings: result.findings.map((finding) => finding.detector).sort()
  };
}
const core = `import {createStore, Effect} from '@composable-svelte/core';\n`;
const inReducer = (pre, body) => ({'entry.ts': `${core}${pre}\nexport const store = createStore({initialState: {}, reducer: (state: any, action: any) => {\n${body}\nreturn [state, Effect.none()]; }});\n`});
const module = (source) => ({'entry.ts': source});

function assertSupported(t, files, expectedFindings) {
  const result = analyze(t, files);
  assert.equal(result.complete, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
  if (expectedFindings) assert.deepEqual(result.findings, [...expectedFindings].sort());
  return result;
}
function assertRefused(t, files, construct) {
  const result = analyze(t, files);
  assert.equal(result.complete, false, `${construct} must refuse: ${JSON.stringify(result)}`);
  assert.ok(result.errors.includes(construct), `expected ${construct}, got ${JSON.stringify(result.errors)}`);
  return result;
}

// ---- getters ---------------------------------------------------------------------------------------------------

test('an alias getter carries authority exactly like the equivalent data property', (t) => {
  const pairs = [
    [`const loc = window.location; const o = {l: loc};`, `const loc = window.location; const o = { get l() { return loc; } };`, `o.l.href = '/x';`],
    [`const loc = window.location; const o = {l: loc};`, `const loc = window.location; const o = { get l() { return loc; } };`, `const {l} = o; l.href = '/x';`],
    [`const loc = window.location; const o = {l: loc};`, `const loc = window.location; const o = { get l() { return loc; } };`, `const c = {...o}; c.l.href = '/x';`],
    [`const clock = Date; const o = {c: clock};`, `const clock = Date; const o = { get c() { return clock; } };`, `const t = o.c.now();`],
    [`let x: any = 1; const o = {v: x}; x = window.location;`, `let x: any = 1; const o = { get v() { return x; } }; x = window.location;`, `o.v.href = '/x';`],
    [`function nav() { history.pushState({}, '', '/x'); } const o = {go: nav};`, `function nav() { history.pushState({}, '', '/x'); } const o = { get go() { return nav; } };`, `o.go();`],
    [`function nav<T>(v?: T) { history.pushState({}, '', '/x'); } const o = {go: nav};`, `function nav<T>(v?: T) { history.pushState({}, '', '/x'); } const o = { get go() { return nav<number>; } };`, `o.go();`]
  ];
  for (const [data, alias, body] of pairs) {
    const control = assertSupported(t, inReducer(data, body));
    assert.ok(control.findings.length > 0, `control must detect: ${data}`);
    assertSupported(t, inReducer(alias, body), control.findings);
  }
});

test('alias getters keep store and opaque-escape detection, across modules and in dispatched payloads', (t) => {
  assertSupported(t, module(`import {sink} from 'ext';\nconst loc = window.location; const o = { get l() { return loc; } };\nsink(o);\n`), ['authority-escape']);
  assertSupported(t, {'entry.ts': `${core}let s: any; const o = { get s() { return s; } };\ns = createStore({initialState: {}, reducer: (state: any, action: any) => { const x = o.s; return [state, Effect.none()]; }});\n`}, ['store-authority-in-reducer']);
  assertSupported(t, {
    'entry.ts': `${core}import {o} from './other';\nexport const store = createStore({initialState: {}, reducer: (state: any) => { o.l.href = '/x'; return [state, Effect.none()]; }});\n`,
    'other.ts': `const loc = window.location;\nexport const o = { get l() { return loc; } };\n`
  }, ['impure-primitive', 'location-write']);
  // Real dependency shape: read-only views over local test-double state.
  assertSupported(t, module(`${core}export function deps() {\n  const streams: string[] = []; let aborted = 0;\n  return { get activeStreams() { return streams; }, get abortedStreamsCount() { return aborted; }, abort: () => { aborted++; } };\n}\nexport const store = createStore({initialState: {}, reducer: (s: any) => [s, Effect.none()], dependencies: deps()});\n`), []);
});

test('every getter that is not a plain local alias stays refused', (t) => {
  assertRefused(t, inReducer(`const o = { get now() { return Date.now(); } };`, `const t = o.now;`), 'GetAccessor');
  assertRefused(t, inReducer(`const o = { get l() { return window.location; } };`, `o.l.href = '/x';`), 'GetAccessor');
  assertRefused(t, inReducer(`const o = { get l() { return location; } };`, `o.l.href = '/x';`), 'GetAccessor');
  assertRefused(t, module(`const o = { x: 1, get y() { return this.x; } };\nexport const v = o.y;\n`), 'GetAccessor');
  assertRefused(t, module(`let n = 0; const o = { get y() { n++; return n; } };\nexport const v = o.y;\n`), 'GetAccessor');
  assertRefused(t, module(`export const o = { get a() { return arguments; } };\n`), 'arguments-object');
  assertRefused(t, module(`let n = 0; const o = { set y(v: number) { n = v; } };\nexport {o};\n`), 'SetAccessor');
  assertRefused(t, module(`const k = String(Math.random()); const n = 1; const o = { get [k]() { return n; } };\nexport {o};\n`), 'ComputedPropertyName');
  assertRefused(t, module(`const n = 1; class C { get y() { return n; } }\nexport const v = new C().y;\n`), 'class-accessor');
  assertRefused(t, {'App.svelte': `<script lang="ts">\nlet n = $state(0); const o = { get n() { return n; } };\n</script>\n<p>{o.n}</p>\n`}, 'GetAccessor');
});

// ---- Promise executors -----------------------------------------------------------------------------------------

test('a resolved plain value reaches await through the existing async-result flow', (t) => {
  const {root, graph} = project(t, module(`export async function go() {\n  const data = {n: 1};\n  const v = await new Promise<{n: number}>((resolve) => { resolve(data); });\n  return v;\n}\n`));
  const context = buildSemanticContext({projectRoot: root, graph});
  const flow = buildValueFlow(context);
  assert.equal(flow.complete, true, JSON.stringify(flow.errors));
  let awaited = null, literal = null;
  for (const {node} of context.nodes) {
    if (ts.isAwaitExpression(node)) awaited = node;
    if (ts.isObjectLiteralExpression(node)) literal = node;
  }
  const expected = flow.value(literal);
  assert.equal(expected.size, 1);
  assert.ok([...flow.value(awaited)].some((atom) => expected.has(atom)), 'await yields the resolved heap');
});

test('executor bodies keep their zone: impure work in a reducer or view is still reported', (t) => {
  const reducer = analyze(t, inReducer(``, `new Promise(() => { fetch('/x'); });`));
  assert.ok(reducer.findings.includes('impure-primitive'), JSON.stringify(reducer));
  assertSupported(t, {'App.svelte': `<script lang="ts">\nconst p = new Promise(() => { fetch('/x'); });\n</script>\n<p>x</p>\n`}, ['view-io']);
  // A named executor defined elsewhere still inherits the constructing reducer's decision zone.
  const named = analyze(t, inReducer(`const run = () => { fetch('/x'); };`, `new Promise(run);`));
  assert.ok(named.findings.includes('impure-primitive'), JSON.stringify(named));
});

test('supported executor shapes: stored closure-confined settle functions and plain rejections', (t) => {
  assertSupported(t, module(`export function make(delay: boolean) {\n  let pending: ((v: {id: string}) => void) | null = null;\n  return {\n    resolveLater(snapshot: {id: string} = {id: 'a'}) { if (pending) { const resolve = pending; pending = null; resolve(snapshot); } },\n    fetchAccount: async (signal?: AbortSignal) => {\n      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');\n      if (delay) return new Promise<{id: string}>((resolve, reject) => {\n        pending = resolve;\n        signal?.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')); });\n      });\n      return {id: 'b'};\n    }\n  };\n}\n`), []);
  assertSupported(t, module(`const exec = (r: any) => r(1);\nexport const a = new Promise(exec);\nfunction make(e: any) { return new Promise(e); }\nexport const b = make((r: any) => r([1, 2]));\nfunction pick() { return (r: any) => r({ok: true}); }\nexport const c = new Promise(pick());\n`), []);
  assertSupported(t, module(`function call(f: any, v: any) { f(v); }\nexport async function go() { return await new Promise((r) => call(r, {n: 1})); }\n`), []);
  assertSupported(t, module(`export const a = new Promise(() => { throw {code: 'x'}; });\nexport const b = new Promise(() => { throw new Error('no'); });\n`), []);
});

test('authority can never be resolved through an executor, whatever path reaches the settle function', (t) => {
  const cases = [
    `export async function go() { const v: any = await new Promise(r => r(window.location)); v.href = '/x'; }\n`,
    `let res: any = null;\nconst p = new Promise(r => { res = r; });\nexport function fire() { const f = res; f(window.history); }\nexport async function use() { const h: any = await p; h.pushState({}, '', '/x'); }\n`,
    `function call(f: any, v: any) { f(v); }\nexport async function use() { const h: any = await new Promise(r => call(r, window.history)); h.back(); }\n`,
    `async function load(): Promise<any> { return new Promise(r => r(window.location)); }\nexport async function go() { const v = await load(); v.href = '/x'; }\n`,
    `export async function go() { const v: any = await new Promise((...rs: any[]) => rs[0](window.location)); v.href = '/x'; }\n`,
    `export const p = new Promise(r => r({nested: {l: window.location}}));\n`,
    `async function f() { return 1; }\nexport const p = new Promise(r => r(f()));\n`,
    `let fire: any;\nexport const p = new Promise(r => { fire = r; });\nexport const go = () => fire(window.location);\n`,
    `export const p = new Promise(r => r(() => history.back()));\n`
  ];
  for (const source of cases) assertRefused(t, module(source), 'promise-resolution');
  assertRefused(t, module(`export const p = new Promise(r => r({ then(cb: any) { cb(1); } }));\n`), 'promise-thenable');
});

test('rejections and executor exceptions may carry only plain data', (t) => {
  assertRefused(t, module(`export async function go() { try { await new Promise((_, rej) => rej(window.location)); } catch (e: any) { e.href = '/x'; } }\n`), 'promise-rejection');
  assertRefused(t, module(`let fail: any;\nexport const p = new Promise((_, rej) => { fail = rej; });\nexport const go = () => fail(window.history);\n`), 'promise-rejection');
  assertRefused(t, module(`export const p = new Promise((_, rej) => rej(() => fetch('/x')));\n`), 'promise-rejection');
  const throwing = [
    `export async function go() { try { await new Promise(() => { throw window.location; }); } catch (e: any) { e.href = '/x'; } }\n`,
    `function boom(): never { throw window.location; }\nexport const p = new Promise(() => { boom(); });\n`,
    `export const p = new Promise(() => { [1].forEach(() => { throw window.location; }); });\n`,
    `import {sink} from 'ext';\nexport const p = new Promise(() => { sink(() => { throw window.location; }); });\n`,
    `function boom(x: any): never { throw x; }\nconst b = boom.bind(null, window.location);\nexport const p = new Promise(() => { b(); });\n`,
    `class C { constructor() { throw window.location; } }\nexport const p = new Promise(() => { new C(); });\n`,
    `export const p = new Promise(() => { try { throw window.location; } catch { } });\n`
  ];
  for (const source of throwing) assertRefused(t, module(source), 'promise-executor-throw');
});

test('settle functions must stay closure-confined and be invoked directly with at most one argument', (t) => {
  const escapes = [
    `export const p = new Promise(r => setTimeout(r, 1));\n`,
    `import {sink} from 'ext';\nexport const p = new Promise(r => sink(r));\n`,
    `const holder: any = {};\nexport const p = new Promise(r => { holder.r = r; });\nexport {holder};\n`,
    `export let box: any;\nexport const p = new Promise(r => { box = {r}; });\n`,
    `export function make() { let out: any; new Promise(r => { out = r; }); return out; }\n`,
    `const list: any[] = [];\nexport const p = new Promise(r => { list.push(r); });\nexport {list};\n`,
    `export const p = new Promise(r => { new Promise(q => q(r)); });\n`,
    `import {sink} from 'ext';\nexport const p = new Promise((...rs: any[]) => { sink(rs); });\n`,
    // Property writes into objects with no inspectable literal origin: an externally supplied parameter and a global.
    `export function attach(target: any) { return new Promise(r => { target.settle = r; }); }\n`,
    `export const p = new Promise(r => { (window as any).settle = r; });\n`
  ];
  for (const source of escapes) assertRefused(t, module(source), 'promise-settle-escape');
  assertRefused(t, module(`export const p = new Promise(r => { const b = (r as any).bind(null); b(1); });\n`), 'promise-operation');
  assertRefused(t, module(`export const p = new Promise(r => { (r as any).call(null, 1); });\n`), 'promise-operation');
  assertRefused(t, module(`const xs: any[] = [1];\nexport const p = new Promise(r => (r as any)(...xs));\n`), 'promise-settle');
  assertRefused(t, module(`export const p = new Promise(function () { (arguments as any)[0](window.location); });\n`), 'arguments-object');
});

test('each settle kind reaching one call site is checked, and settle functions never reach templates', (t) => {
  // A call site that may resolve or reject is checked as a rejection too, whatever the order of the alternatives.
  for (const pick of ['ok ? rej : res', 'ok ? res : rej']) {
    assertRefused(t, inReducer(``, `new Promise((res, rej) => { const ok = action.ok; const f = ${pick}; f(state); });`), 'promise-rejection');
  }
  assertRefused(t, module(`export const p = new Promise((res, rej) => { const f = Math.random() > 0.5 ? res : rej; f({ then(cb: any) { cb(1); } }); });\n`), 'promise-thenable');
  // Svelte, the DOM and components invoke template values; none of them is an inspected callee.
  const script = `let fire: any; const p = new Promise(r => { fire = r; });`;
  assertRefused(t, {'App.svelte': `<script lang="ts">\n${script}\n</script>\n<button onclick={fire}>x</button>\n`}, 'promise-settle-escape');
  assertRefused(t, {'App.svelte': `<script lang="ts">\n${script}\n</script>\n<input bind:value={fire} />\n`}, 'promise-settle-escape');
  assertRefused(t, {'App.svelte': `<script lang="ts">\nimport Child from './Child.svelte';\n${script}\n</script>\n<Child onDone={fire} />\n`,
    'Child.svelte': `<script lang="ts">\nlet {onDone}: any = $props();\n</script>\n<button onclick={() => onDone({ok: 1})}>x</button>\n`}, 'promise-settle-escape');
  // A closure that settles with local data stays supported in templates.
  assertSupported(t, {'App.svelte': `<script lang="ts">\n${script}\n</script>\n<button onclick={() => fire({ok: 1})}>x</button>\n`}, []);
});

test('only one local synchronous executor passed to new Promise is supported', (t) => {
  assertRefused(t, module(`import {exec} from 'ext';\nexport const p = new Promise(exec);\n`), 'promise-operation');
  assertRefused(t, module(`export const p = new Promise(async r => { r(1); });\n`), 'promise-operation');
  assertRefused(t, module(`export const p = (Promise as any)((r: any) => r(1));\n`), 'promise-operation');
  assertRefused(t, module(`const args: any[] = [(r: any) => r(1)];\nexport const p = new Promise(...(args as [any]));\n`), 'promise-operation');
  assertRefused(t, module(`export const p = new Promise(r => r(1)).then(x => x);\n`), 'promise-operation');
  assertRefused(t, module(`export const w = (Promise as any).withResolvers();\n`), 'promise-operation');
  assertRefused(t, module(`export const p = new Promise(function* (r: any) { r(1); } as any);\n`), 'promise-operation');
});

test('a resolver invoked by an opaque callee has the same unmodeled argument as any opaque callback (named limitation)', (t) => {
  // Values an uninspected package passes into a callback are unresolved-callback behavior in both forms; executor
  // support adds no new channel. Both analyze completely and neither can observe the external value.
  const viaPromise = assertSupported(t, module(`import {sink} from 'ext';\nexport async function go() { const v: any = await new Promise(r => sink((x: any) => r(x))); v.href = '/x'; }\n`));
  const viaCapture = assertSupported(t, module(`import {sink} from 'ext';\nexport function go() { let v: any; sink((x: any) => { v = x; }); v.href = '/x'; }\n`));
  assert.deepEqual(viaPromise.findings, viaCapture.findings);
});

test('documentation controls: pre-existing base gaps are unchanged by this work (escalated separately, not accepted)', (t) => {
  // Accessor descriptors bypass the object-literal getter rules in the base checker (assessment G17).
  assertSupported(t, inReducer(`const o: any = {}; Object.defineProperty(o, 'now', {get() { return Date.now(); }});`, `const t = o.now;`), []);
  // Action payload data is not linked to the reducer action parameter, for data properties and getters alike (G21).
  const payload = (member) => ({'entry.ts': `${core}const loc = window.location;\nexport const store = createStore({initialState: {}, reducer: (state: any, action: any) => { action.p.href = '/x'; return [state, Effect.none()]; }});\nstore.dispatch({type: 'a', ${member}});\n`});
  assert.deepEqual(analyze(t, payload('get p() { return loc; }')).findings, analyze(t, payload('p: loc')).findings);
  // A plain synchronous throw into a catch binding carries no value (P8-parity); executor throws are refused instead.
  assertSupported(t, module(`export function go() { try { throw window.location; } catch (e: any) { e.href = '/x'; } }\n`), []);
});
