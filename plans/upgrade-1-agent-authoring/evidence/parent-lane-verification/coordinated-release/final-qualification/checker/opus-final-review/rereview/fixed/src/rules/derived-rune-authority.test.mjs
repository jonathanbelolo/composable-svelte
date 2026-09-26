import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import ts from 'typescript';
import {buildGraph} from '../graph.mjs';
import {buildSemanticContext} from '../semantic-context.mjs';
import {buildValueFlow} from '../semantic-flow.mjs';
import {createFrameworkSeeds} from '../framework-seeds.mjs';
import {buildExecutionZones} from '../semantic-zones.mjs';
import {evaluateSemanticRules} from './semantic-rules.mjs';
import {derivedRune} from '../svelte-runes.mjs';

function fixture(t, input, options = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'derived-rune-authority-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));

  const files = {
    'package.json': JSON.stringify({
      dependencies: {
        '@composable-svelte/core': '0.13.0-next.1',
        svelte: '5.0.0'
      }
    }),
    'tsconfig.json': '{}',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core',
      version: '0.13.0-next.1',
      exports: {
        '.': './index.js',
        './application': './application.js'
      }
    }),
    'node_modules/@composable-svelte/core/index.js': 'export {};',
    'node_modules/@composable-svelte/core/application.js': 'export {};',
    'node_modules/svelte/package.json': JSON.stringify({
      name: 'svelte',
      version: '5.0.0',
      exports: {'.': './index.js'}
    }),
    'node_modules/svelte/index.js': 'export function importedOpaqueFn() {}; export function $derived() {};'
  };

  let roots;
  if (typeof input === 'string') {
    const entry = options.entry ?? (options.svelte ? 'App.svelte' : 'entry.ts');
    files[entry] = input;
    roots = [entry];
  } else {
    Object.assign(files, input);
    roots = options.roots ?? Object.keys(input);
  }

  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(projectRoot, name)), {recursive: true});
    writeFileSync(join(projectRoot, name), text);
  }

  const graph = buildGraph({
    projectRoot,
    roots,
    tsconfig: 'tsconfig.json',
    opaquePackages: [
      {name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'},
      {name: 'svelte', version: '5.0.0', provenance: 'registry'}
    ]
  });
  assert.deepEqual(graph.errors, []);
  const context = buildSemanticContext({projectRoot, graph});
  assert.equal(context.complete, true, JSON.stringify(context.errors));
  const framework = createFrameworkSeeds(context);
  const flow = buildValueFlow(context, {onInvoke: framework.onInvoke, onProperty: framework.onProperty});
  assert.equal(flow.complete, true, JSON.stringify(flow.errors));
  const zones = buildExecutionZones(context, flow, framework, {});
  const result = evaluateSemanticRules({context, flow, zones});

  return {
    projectRoot,
    context,
    flow,
    framework,
    zones,
    result,
    errors: result.errors,
    findings: result.findings
  };
}

function findOffset(source, substr) {
  const idx = source.indexOf(substr);
  assert.ok(idx !== -1, `Substring "${substr}" not found in source text.`);
  return idx;
}

function assertHasViewAuthority(bindingName, context, flow) {
  const binding = context.symbols.bindings.find((b) => b.name === bindingName);
  assert.ok(binding, `Binding "${bindingName}" should exist.`);
  const val = flow.bindingValue(binding);
  const descriptions = [...val].map((atom) => flow.domain.describe(atom));
  assert.ok(
    descriptions.some((d) => d.kind === 'authority' && d.id === 'view'),
    `Binding "${bindingName}" must carry view authority; found: ${JSON.stringify(descriptions)}`
  );
}

function assertNoViewAuthority(bindingName, context, flow) {
  const binding = context.symbols.bindings.find((b) => b.name === bindingName);
  assert.ok(binding, `Binding "${bindingName}" should exist.`);
  const val = flow.bindingValue(binding);
  const descriptions = [...val].map((atom) => flow.domain.describe(atom));
  assert.ok(
    !descriptions.some((d) => d.kind === 'authority' && d.id === 'view'),
    `Binding "${bindingName}" must not carry view authority; found: ${JSON.stringify(descriptions)}`
  );
}

// -----------------------------------------------------------------------------
// 1. Fixed: No error at $derived, binding carries view authority
// -----------------------------------------------------------------------------

test('fixed: $derived and $derived.by in a .svelte component retain view authority without call errors', (t) => {
  const source = `<script>
    import {useApplication, optionalSlot} from '@composable-svelte/core/application';
    import {scopeTo} from '@composable-svelte/core';
    const app = useApplication({});
    const slot = optionalSlot();
    const v1 = $derived(scopeTo(app.store, slot));
    const v2 = $derived.by(() => scopeTo(app.store, slot));
  </script>
  <p>{v1 ? 'yes' : 'no'}</p>`;

  const f = fixture(t, source, {svelte: true});
  assert.deepEqual(f.result.errors, []);
  assertHasViewAuthority('v1', f.context, f.flow);
  assertHasViewAuthority('v2', f.context, f.flow);
});

test('fixed: $derived and $derived.by in a .svelte.ts module retain view authority without call errors', (t) => {
  const source = `
    import {useApplication, optionalSlot} from '@composable-svelte/core/application';
    import {scopeTo} from '@composable-svelte/core';
    const app = useApplication({});
    const slot = optionalSlot();
    export const v1 = $derived(scopeTo(app.store, slot));
    export const v2 = $derived.by(() => scopeTo(app.store, slot));
  `;

  const f = fixture(t, source, {entry: 'module.svelte.ts'});
  assert.deepEqual(f.result.errors, []);
  assertHasViewAuthority('v1', f.context, f.flow);
  assertHasViewAuthority('v2', f.context, f.flow);
});

test('fixed: $derived and $derived.by in a .svelte.js module retain view authority without call errors', (t) => {
  const source = `
    import {useApplication, optionalSlot} from '@composable-svelte/core/application';
    import {scopeTo} from '@composable-svelte/core';
    const app = useApplication({});
    const slot = optionalSlot();
    export const v1 = $derived(scopeTo(app.store, slot));
    export const v2 = $derived.by(() => scopeTo(app.store, slot));
  `;

  const f = fixture(t, source, {entry: 'module.svelte.js'});
  assert.deepEqual(f.result.errors, []);
  assertHasViewAuthority('v1', f.context, f.flow);
  assertHasViewAuthority('v2', f.context, f.flow);
});

// -----------------------------------------------------------------------------
// 2. Must still report downstream and inner violations
// -----------------------------------------------------------------------------

test('must still report: passing derived binding to opaque callee reports store-authority-to-opaque-callee at opaque call', (t) => {
  const source = `<script lang="ts">
    import {useApplication, optionalSlot} from '@composable-svelte/core/application';
    import {scopeTo} from '@composable-svelte/core';
    declare function opaque(val: any): void;
    const app = useApplication({});
    const slot = optionalSlot();
    const v1 = $derived(scopeTo(app.store, slot));
    const v2 = $derived.by(() => scopeTo(app.store, slot));
    opaque(v1);
    opaque(v2);
  </script><p>view</p>`;

  const f = fixture(t, source, {svelte: true});
  const off1 = findOffset(source, 'opaque(v1)');
  const off2 = findOffset(source, 'opaque(v2)');

  const err1 = f.result.errors.find((e) => e.span?.start?.offset === off1);
  const err2 = f.result.errors.find((e) => e.span?.start?.offset === off2);

  assert.ok(err1, 'Error expected at opaque(v1)');
  assert.equal(err1.construct, 'store-authority-to-opaque-callee');

  assert.ok(err2, 'Error expected at opaque(v2)');
  assert.equal(err2.construct, 'store-authority-to-opaque-callee');

  // Verify no error at $derived calls
  const derivedOff1 = findOffset(source, '$derived(scopeTo');
  const derivedOff2 = findOffset(source, '$derived.by(() =>');
  assert.ok(!f.result.errors.some((e) => e.span?.start?.offset === derivedOff1));
  assert.ok(!f.result.errors.some((e) => e.span?.start?.offset === derivedOff2));
});

test('must still report: $derived(opaque(store)) reports store-authority-to-opaque-callee at inner opaque call', (t) => {
  const source = `<script lang="ts">
    import {useApplication} from '@composable-svelte/core/application';
    declare function opaque(val: any): any;
    const app = useApplication({});
    const v = $derived(opaque(app.store));
  </script><p>{v}</p>`;

  const f = fixture(t, source, {svelte: true});
  const innerOff = findOffset(source, 'opaque(app.store)');
  const err = f.result.errors.find((e) => e.span?.start?.offset === innerOff);
  assert.ok(err, 'Error expected at inner opaque call');
  assert.equal(err.construct, 'store-authority-to-opaque-callee');

  const outerOff = findOffset(source, '$derived(opaque');
  assert.ok(!f.result.errors.some((e) => e.span?.start?.offset === outerOff));
});

test('must still report: dispatch inside $derived and $derived.by reports lifecycle-dispatch', (t) => {
  const source = `<script>
    import {useApplication} from '@composable-svelte/core/application';
    const app = useApplication({});
    const d1 = $derived(app.store.dispatch({type: 'bad1'}));
    const d2 = $derived.by(() => app.store.dispatch({type: 'bad2'}));
  </script><p>view</p>`;

  const f = fixture(t, source, {svelte: true});
  const off1 = findOffset(source, 'app.store.dispatch({type: \'bad1\'})');
  const off2 = findOffset(source, 'app.store.dispatch({type: \'bad2\'})');

  const find1 = f.result.findings.find((item) => item.span?.start?.offset === off1);
  const find2 = f.result.findings.find((item) => item.span?.start?.offset === off2);

  assert.ok(find1, 'lifecycle-dispatch finding expected at d1 dispatch');
  assert.equal(find1.detector, 'lifecycle-dispatch');

  assert.ok(find2, 'lifecycle-dispatch finding expected at d2 dispatch');
  assert.equal(find2.detector, 'lifecycle-dispatch');
});

// -----------------------------------------------------------------------------
// 3. No exemption: errors remain at call
// -----------------------------------------------------------------------------

test('no exemption: free $derived in plain .ts errors at call when carrying authority', (t) => {
  const source = `
    import {useApplication, optionalSlot} from '@composable-svelte/core/application';
    import {scopeTo} from '@composable-svelte/core';
    const app = useApplication({});
    const slot = optionalSlot();
    const v = $derived(scopeTo(app.store, slot));
  `;

  const f = fixture(t, source, {entry: 'plain.ts'});
  const off = findOffset(source, '$derived(scopeTo');
  const err = f.result.errors.find((e) => e.span?.start?.offset === off);
  assert.ok(err, 'Expected error at free $derived in plain .ts');
  assert.equal(err.construct, 'store-authority-to-opaque-callee');
});

test('no exemption: $derived imported from opaque package in .svelte.ts errors at call', (t) => {
  const source = `
    import {$derived} from 'svelte';
    import {useApplication, optionalSlot} from '@composable-svelte/core/application';
    import {scopeTo} from '@composable-svelte/core';
    const app = useApplication({});
    const slot = optionalSlot();
    const v = $derived(scopeTo(app.store, slot));
  `;

  const f = fixture(t, source, {entry: 'state.svelte.ts'});
  const off = findOffset(source, '$derived(scopeTo');
  const err = f.result.errors.find((e) => e.span?.start?.offset === off);
  assert.ok(err, 'Expected error at imported $derived in .svelte.ts');
  assert.equal(err.construct, 'store-authority-to-opaque-callee');
});

test('no exemption: unsupported syntax forms carrying authority report store-authority-to-opaque-callee', (t) => {
  const cases = [
    {name: 'element access', code: "const c1 = $derived['by'](scopeTo(app.store, slot));", target: "$derived['by'](scopeTo"},
    {name: 'unsupported member', code: 'const c2 = $derived.foo(scopeTo(app.store, slot));', target: '$derived.foo(scopeTo'},
    {name: 'optional chaining', code: 'const c3 = $derived?.(scopeTo(app.store, slot));', target: '$derived?.(scopeTo'},
    {name: 'spread element', code: 'const c4 = $derived(...[scopeTo(app.store, slot)]);', target: '$derived(...['},
    {name: 'multiple arguments', code: "const c5 = $derived(scopeTo(app.store, slot), 'extra');", target: '$derived(scopeTo'}
  ];

  for (const c of cases) {
    const source = `<script>
      import {useApplication, optionalSlot} from '@composable-svelte/core/application';
      import {scopeTo} from '@composable-svelte/core';
      const app = useApplication({});
      const slot = optionalSlot();
      ${c.code}
    </script><p>view</p>`;

    const f = fixture(t, source, {svelte: true});
    const off = findOffset(source, c.target);
    const err = f.result.errors.find((e) => e.span?.start?.offset === off);
    assert.ok(err, `Expected error for ${c.name} at offset ${off}`);
    assert.equal(err.construct, 'store-authority-to-opaque-callee', `For case: ${c.name}`);
  }
});

test('no exemption: .by.call classifier returns null and does not invent an authority leak', (t) => {
  const source = `<script>
    function f() { return 1; }
    $derived.by.call(null, f);
  </script><p>view</p>`;

  const f = fixture(t, source, {svelte: true});
  const off = findOffset(source, '$derived.by.call(null, f)');
  const callRecord = f.context.nodes.find(
    (r) => r.node && ts.isCallExpression(r.node) && r.unit.nodeSpan(r.node).start.offset === off
  );
  assert.ok(callRecord, 'Call expression node for $derived.by.call should exist.');
  const classified = derivedRune(callRecord.node, f.context);
  assert.equal(classified, null, '$derived.by.call must not be classified as a derived rune.');

  // Without authority arguments, no authority leak error should be invented
  assert.ok(!f.result.errors.some((e) => e.construct === 'store-authority-to-opaque-callee'));
});

test('opaque callback with no authority: $derived.by(importedOpaqueFn) classifies as by, has no error at call, and binding has no view authority', (t) => {
  const source = `<script>
    import {importedOpaqueFn} from 'svelte';
    const v = $derived.by(importedOpaqueFn);
  </script><p>{v}</p>`;

  const f = fixture(t, source, {svelte: true});
  const off = findOffset(source, '$derived.by(importedOpaqueFn)');

  // Classifier classifies it as by
  const callRecord = f.context.nodes.find(
    (r) => r.node && ts.isCallExpression(r.node) && r.unit.nodeSpan(r.node).start.offset === off
  );
  assert.ok(callRecord, 'Call expression node for $derived.by should exist.');
  const classified = derivedRune(callRecord.node, f.context);
  assert.deepEqual(classified, {form: 'by'});

  // No error at the call
  assert.ok(!f.result.errors.some((e) => e.span?.start?.offset === off));
  assert.deepEqual(f.result.errors, []);

  // Binding has no view authority
  assertNoViewAuthority('v', f.context, f.flow);
});

test('no exemption: $derived.by(scopeTo(...)) non-callable authority argument falls through and reports store-authority-to-opaque-callee', (t) => {
  const source = `<script>
    import {useApplication, optionalSlot} from '@composable-svelte/core/application';
    import {scopeTo} from '@composable-svelte/core';
    const app = useApplication({});
    const slot = optionalSlot();
    const v = $derived.by(scopeTo(app.store, slot));
  </script><p>{v ? 'yes' : 'no'}</p>`;

  const f = fixture(t, source, {svelte: true});
  const off = findOffset(source, '$derived.by(scopeTo');
  const err = f.result.errors.find((e) => e.span?.start?.offset === off);
  assert.ok(err, 'Expected store-authority-to-opaque-callee at uncallable $derived.by argument');
  assert.equal(err.construct, 'store-authority-to-opaque-callee');
});

test('no exemption: $derived.by.call(null, scopeTo(...)) reports store-authority-to-opaque-callee at call', (t) => {
  const source = `<script>
    import {useApplication, optionalSlot} from '@composable-svelte/core/application';
    import {scopeTo} from '@composable-svelte/core';
    const app = useApplication({});
    const slot = optionalSlot();
    $derived.by.call(null, scopeTo(app.store, slot));
  </script><p>view</p>`;

  const f = fixture(t, source, {svelte: true});
  const off = findOffset(source, '$derived.by.call(null, scopeTo');
  const callRecord = f.context.nodes.find(
    (r) => r.node && ts.isCallExpression(r.node) && r.unit.nodeSpan(r.node).start.offset === off
  );
  assert.ok(callRecord, 'Call expression node for $derived.by.call should exist.');
  const classified = derivedRune(callRecord.node, f.context);
  assert.equal(classified, null, '$derived.by.call must not be classified as a derived rune.');

  const err = f.result.errors.find((e) => e.span?.start?.offset === off);
  assert.ok(err, 'Expected store-authority-to-opaque-callee error at $derived.by.call with authority argument');
  assert.equal(err.construct, 'store-authority-to-opaque-callee');
});

// -----------------------------------------------------------------------------
// 4. Shadowed local helper named $derived: not compiler identity, body inspected
// -----------------------------------------------------------------------------

test('shadowed local helper named $derived is not compiler identity; inspected body retains authority flow', (t) => {
  const source = `<script lang="ts">
    import {useApplication, optionalSlot} from '@composable-svelte/core/application';
    import {scopeTo} from '@composable-svelte/core';
    declare function opaque(val: any): void;
    function $derived(x) { return x; }
    const app = useApplication({});
    const slot = optionalSlot();
    const v = $derived(scopeTo(app.store, slot));
    opaque(v);
  </script><p>view</p>`;

  const f = fixture(t, source, {svelte: true});
  const callOff = findOffset(source, '$derived(scopeTo');
  const callRecord = f.context.nodes.find(
    (r) => r.node && ts.isCallExpression(r.node) && r.unit.nodeSpan(r.node).start.offset === callOff
  );
  assert.ok(callRecord, 'Call expression node for shadowed $derived should exist.');
  const classified = derivedRune(callRecord.node, f.context);
  // Prove it is NOT granted compiler identity
  assert.equal(classified, null, 'Shadowed local $derived must not be classified as compiler rune.');

  // Call to $derived(scopeTo(...)) does not error as opaque callee because it is a known function with an inspected body
  assert.ok(!f.result.errors.some((e) => e.span?.start?.offset === callOff));

  // The return value retains view authority from the body return
  assertHasViewAuthority('v', f.context, f.flow);

  // opaque(v) reports authority violation
  const opaqueOff = findOffset(source, 'opaque(v)');
  const opaqueErr = f.result.errors.find((e) => e.span?.start?.offset === opaqueOff);
  assert.ok(opaqueErr, 'Expected error at opaque(v)');
  assert.equal(opaqueErr.construct, 'store-authority-to-opaque-callee');
});

// -----------------------------------------------------------------------------
// 5. Bound functions in $derived.by: inspectable targets permitted, uninspectable rejected
// -----------------------------------------------------------------------------

test('bound function in $derived.by: inspectable local function target is permitted and retains authority', (t) => {
  const source = `<script lang="ts">
    import {useApplication, optionalSlot} from '@composable-svelte/core/application';
    import {scopeTo} from '@composable-svelte/core';
    declare function opaque(val: any): void;
    const app = useApplication({});
    const slot = optionalSlot();
    function compute() { return scopeTo(app.store, slot); }
    const bound = compute.bind(null);
    const v = $derived.by(bound);
    opaque(v);
  </script><p>view</p>`;

  const f = fixture(t, source, {svelte: true});
  const byOff = findOffset(source, '$derived.by(bound)');

  // No error at $derived.by call
  assert.ok(!f.result.errors.some((e) => e.span?.start?.offset === byOff));

  // Binding v has view authority
  assertHasViewAuthority('v', f.context, f.flow);

  // opaque(v) reports authority violation
  const opaqueOff = findOffset(source, 'opaque(v)');
  const opaqueErr = f.result.errors.find((e) => e.span?.start?.offset === opaqueOff);
  assert.ok(opaqueErr, 'Expected error at opaque(v)');
  assert.equal(opaqueErr.construct, 'store-authority-to-opaque-callee');
});

test('bound function in $derived.by: uninspectable external bound target has no error at call', (t) => {
  const source = `<script>
    import {importedOpaqueFn} from 'svelte';
    const bound = importedOpaqueFn.bind(null);
    const v = $derived.by(bound);
  </script><p>{v}</p>`;

  const f = fixture(t, source, {svelte: true});
  const byOff = findOffset(source, '$derived.by(bound)');

  // No error at the call
  assert.ok(!f.result.errors.some((e) => e.span?.start?.offset === byOff));
  assert.deepEqual(f.result.errors, []);
  assertNoViewAuthority('v', f.context, f.flow);
});
