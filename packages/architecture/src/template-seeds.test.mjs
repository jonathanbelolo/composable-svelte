import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compile} from 'svelte/compiler';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {buildGraph} from './graph.mjs';
import {buildSemanticContext} from './semantic-context.mjs';
import {buildValueFlow} from './semantic-flow.mjs';
import {createFrameworkSeeds} from './framework-seeds.mjs';
import {buildExecutionZones} from './semantic-zones.mjs';
import {evaluateSemanticRules} from './rules/semantic-rules.mjs';
import {createTemplateSeeds} from './template-seeds.mjs';

function fixture(t, files, roots = ['App.svelte']) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'template-seeds-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {
    'package.json': JSON.stringify({name: 'fixture', dependencies: {'@composable-svelte/core': '0.13.0-next.1', svelte: '5.57.0'}}),
    'tsconfig.json': '{}',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core', version: '0.13.0-next.1',
      exports: {'.': './index.js', './application': './application.js'}
    }),
    'node_modules/svelte/package.json': JSON.stringify({name: 'svelte', version: '5.57.0', exports: {'.': './index.js'}}),
    ...files
  };
  for (const [name, value] of Object.entries(all)) {
    mkdirSync(dirname(join(projectRoot, name)), {recursive: true});
    writeFileSync(join(projectRoot, name), value);
  }
  const graph = buildGraph({
    projectRoot, roots, tsconfig: 'tsconfig.json',
    opaquePackages: [
      {name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'},
      {name: 'svelte', version: '5.57.0', provenance: 'registry'}
    ]
  });
  assert.deepEqual(graph.errors, []);
  const context = buildSemanticContext({projectRoot, graph});
  const framework = createFrameworkSeeds(context);
  let template;
  const flow = buildValueFlow(context, {
    onInvoke: (call, api) => {
      const fw = framework.onInvoke(call, api);
      const tm = template ? template.onInvoke(call, api) : api.domain.empty();
      return api.domain.join(fw, tm);
    },
    onProperty: framework.onProperty
  });
  template = createTemplateSeeds(context, flow);

  assert.equal(typeof flow.revision, 'number');
  let rev = -1;
  let passes = 0;
  while (flow.revision !== rev && passes < 10) {
    rev = flow.revision;
    template.apply();
    flow.solve();
    passes++;
  }
  assert.ok(passes < 10, 'flow revision stabilized in bounded passes');

  const zones = buildExecutionZones(context, flow, framework, {
    wiringSites: template.wiringSites,
    callbackSites: template.callbackSites,
    lifecycleSites: template.lifecycleSites
  });
  const named = (name) => [...context.functions.values()].find((r) => r.node.name?.text === name);
  const zoneNames = (name) => new Set(zones.values.get(named(name)?.id)?.keys() ?? []);
  const result = evaluateSemanticRules({context, flow, zones});
  return {context, flow, framework, template, zones, named, zoneNames, result};
}

test('Root direct children app seed vs nested and differently named snippets', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {ApplicationRoot} from '@composable-svelte/core/application';
    let directApp = null, nestedApp = null, otherApp = null;
    function directWork() {} function nestedWork() {} function otherWork() {}
  </script>
  <ApplicationRoot>
    {#snippet children(app)}{@const a = (directApp = app)}{@const w = directWork()}{/snippet}
    {#snippet other(app)}{@const b = (otherApp = app)}{@const w = otherWork()}{/snippet}
    {#if true}
      {#snippet children(app)}{@const c = (nestedApp = app)}{@const w = nestedWork()}{/snippet}
    {/if}
  </ApplicationRoot>`});
  assert.deepEqual(f.zoneNames('directWork'), new Set(['view']));
  assert.deepEqual(f.zoneNames('otherWork'), new Set());
  assert.deepEqual(f.zoneNames('nestedWork'), new Set());
  const bDirect = f.context.symbols.bindingOf([...f.context.symbols.bindings].find((b) => b.name === 'directApp')?.declarations[0]?.name);
  const bOther = f.context.symbols.bindingOf([...f.context.symbols.bindings].find((b) => b.name === 'otherApp')?.declarations[0]?.name);
  const bNested = f.context.symbols.bindingOf([...f.context.symbols.bindings].find((b) => b.name === 'nestedApp')?.declarations[0]?.name);
  assert.ok([...f.flow.bindingValue(bDirect)].some((a) => f.flow.domain.describe(a).kind === 'authority' && f.flow.domain.describe(a).id === 'app'));
  assert.ok(![...f.flow.bindingValue(bOther)].some((a) => f.flow.domain.describe(a).kind === 'authority'));
  assert.ok(![...f.flow.bindingValue(bNested)].some((a) => f.flow.domain.describe(a).kind === 'authority'));
});

test('Root dotted anchor resolves while shadowed identifier receives no authority', (t) => {
  const fDotted = fixture(t, {'App.svelte': `<script>
    import * as CS from '@composable-svelte/core/application';
    let appVal = null;
  </script>
  <CS.ApplicationRoot>
    {#snippet children(app)}{@const a = (appVal = app)}{/snippet}
  </CS.ApplicationRoot>`});
  const bDotted = fDotted.context.symbols.bindingOf([...fDotted.context.symbols.bindings].find((b) => b.name === 'appVal')?.declarations[0]?.name);
  assert.ok([...fDotted.flow.bindingValue(bDotted)].some((a) => fDotted.flow.domain.describe(a).kind === 'authority' && fDotted.flow.domain.describe(a).id === 'app'));

  const fShadow = fixture(t, {'App.svelte': `<script>
    function ApplicationRoot() {}
    let appVal = null;
  </script>
  <ApplicationRoot>
    {#snippet children(app)}{@const a = (appVal = app)}{/snippet}
  </ApplicationRoot>`});
  const bShadow = fShadow.context.symbols.bindingOf([...fShadow.context.symbols.bindings].find((b) => b.name === 'appVal')?.declarations[0]?.name);
  assert.ok(![...fShadow.flow.bindingValue(bShadow)].some((a) => fShadow.flow.domain.describe(a).kind === 'authority'));
});

test('FeatureViews views seed and FeatureOutlet activation vs unused definition', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {defineViews, FeatureViews, FeatureOutlet} from '@composable-svelte/core/application';
    function mainWork() {}
    function unusedWork() {}
    const views = defineViews(null, {
      main: {content: mainSnippet},
      unused: {content: unusedSnippet}
    });
  </script>
  {#snippet mainSnippet({store, views})}{@const w = mainWork()}{/snippet}
  {#snippet unusedSnippet({store, views})}{@const u = unusedWork()}{/snippet}
  <FeatureViews definition={views}>
    {#snippet children(v)}
      <FeatureOutlet view={v.main} />
    {/snippet}
  </FeatureViews>`});
  assert.deepEqual(f.zoneNames('mainWork'), new Set(['view']));
  assert.deepEqual(f.zoneNames('unusedWork'), new Set());
});

test('Host children execution edge without minting app or store authority', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {ApplicationHost} from '@composable-svelte/core/application';
    function hostWork() {}
    let childArg = 'init';
  </script>
  <ApplicationHost>
    {#snippet children(arg)}{@const w = hostWork()}{@const c = (childArg = arg)}{/snippet}
  </ApplicationHost>`});
  assert.deepEqual(f.zoneNames('hostWork'), new Set(['view']));
  const bArg = f.context.symbols.bindingOf([...f.context.symbols.bindings].find((b) => b.name === 'childArg')?.declarations[0]?.name);
  for (const a of f.flow.bindingValue(bArg)) {
    const d = f.flow.domain.describe(a);
    assert.notEqual(d.id, 'app');
    assert.notEqual(d.id, 'store');
  }
});

test('options dependencies registered in wiringSites without invocation', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {ApplicationRoot} from '@composable-svelte/core/application';
    function makeApi() {}
    const opts = {dependencies: {api: makeApi}};
  </script>
  <ApplicationRoot options={opts}>
    {#snippet children(app)}{/snippet}
  </ApplicationRoot>`});
  assert.ok(f.template.wiringSites.length > 0);
  assert.deepEqual(f.zoneNames('makeApi'), new Set(['wiring']));
  assert.ok(!f.zoneNames('makeApi').has('view'));
  assert.ok(!f.zoneNames('makeApi').has('decision'));
});

test('native bind:this identifier and property target vs component bind:this', (t) => {
  const f = fixture(t, {
    'Comp.svelte': '<script>export let prop = 1;</script>',
    'App.svelte': `<script>
      import Comp from './Comp.svelte';
      let nativeRef;
      let compRef;
      const obj = {elem: null};
    </script>
    <input bind:this={nativeRef} />
    <div bind:this={obj.elem} />
    <Comp bind:this={compRef} />`
  });
  const bNative = f.context.symbols.bindingOf([...f.context.symbols.bindings].find((b) => b.name === 'nativeRef')?.declarations[0]?.name);
  assert.ok([...f.flow.bindingValue(bNative)].some((a) => f.flow.domain.describe(a).id === 'element'));
  const bObj = f.context.symbols.bindingOf([...f.context.symbols.bindings].find((b) => b.name === 'obj')?.declarations[0]?.name);
  const elemProp = f.flow.domain.read(f.flow.bindingValue(bObj), 'elem');
  assert.ok([...elemProp].some((a) => f.flow.domain.describe(a).id === 'element'));
  const bComp = f.context.symbols.bindingOf([...f.context.symbols.bindings].find((b) => b.name === 'compRef')?.declarations[0]?.name);
  assert.ok(![...f.flow.bindingValue(bComp)].some((a) => f.flow.domain.describe(a).id === 'element'));
});

test('use:action={parameter} passes element and parameter and records callbackSites', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    let receivedEl = null, receivedParam = null;
    function tooltip(el, param) { receivedEl = el; receivedParam = param; }
  </script>
  <button use:tooltip={42}>Btn</button>`});
  const bEl = f.context.symbols.bindingOf([...f.context.symbols.bindings].find((b) => b.name === 'receivedEl')?.declarations[0]?.name);
  const bParam = f.context.symbols.bindingOf([...f.context.symbols.bindings].find((b) => b.name === 'receivedParam')?.declarations[0]?.name);
  assert.ok([...f.flow.bindingValue(bEl)].some((a) => f.flow.domain.describe(a).id === 'element'));
  assert.ok([...f.flow.bindingValue(bParam)].some((a) => f.flow.domain.describe(a).id === JSON.stringify(42)));
  assert.deepEqual(f.zoneNames('tooltip'), new Set(['view']));
});

test('AttachTag invokes callback with element authority in view zone', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    let elCapture = null;
    function attachCallback(el) { elCapture = el; }
  </script>
  <div {@attach attachCallback}></div>`});
  const bEl = f.context.symbols.bindingOf([...f.context.symbols.bindings].find((b) => b.name === 'elCapture')?.declarations[0]?.name);
  assert.ok([...f.flow.bindingValue(bEl)].some((a) => f.flow.domain.describe(a).id === 'element'));
  assert.deepEqual(f.zoneNames('attachCallback'), new Set(['view']));
});

test('exact local props into $props and export let with no same-name leakage', (t) => {
  const f = fixture(t, {
    'Child.svelte': `<script>
      let {title} = $props();

      function leak() { let title = 'inner'; let legacy = 'inner'; }
    </script>
    <div>{title}</div>`,
    'Legacy.svelte': '<script>export let legacy; function shadow() { let legacy = \'inner\'; }</script>',
    'App.svelte': `<script>
      import Legacy from './Legacy.svelte';
      import Child from './Child.svelte';
    </script>
    <Child title="hello-title" /><Legacy legacy="hello-legacy" />`
  });
  const childMod = f.context.modules.find((m) => m.path.endsWith('Child.svelte'));
  const viewUnit = childMod.units.find((u) => u.kind === 'view');
  const bTitle = viewUnit.scope.bindings.get('title');
  const bLegacy = f.context.modules.find((m) => m.path.endsWith('Legacy.svelte')).units.find((u) => u.kind === 'view').scope.bindings.get('legacy');
  assert.ok([...f.flow.bindingValue(bTitle)].some((a) => f.flow.domain.describe(a).id === JSON.stringify('hello-title')));
  assert.ok([...f.flow.bindingValue(bLegacy)].some((a) => f.flow.domain.describe(a).id === JSON.stringify('hello-legacy')));
});

test('local children snippet stays inert until child component renders it', (t) => {
  const fInert = fixture(t, {
    'Unrendered.svelte': '<script>let {children} = $props();</script><div>No render</div>',
    'App.svelte': `<script>
      import Unrendered from './Unrendered.svelte';
      function inertWork() {}
    </script>
    <Unrendered>
      {#snippet children()}{@const w = inertWork()}{/snippet}
    </Unrendered>`
  });
  assert.deepEqual(fInert.zoneNames('inertWork'), new Set());

  const fActive = fixture(t, {
    'Rendered.svelte': '<script>let {children} = $props();</script>{@render children()}',
    'App.svelte': `<script>
      import Rendered from './Rendered.svelte';
      function activeWork() {}
    </script>
    <Rendered>
      {#snippet children()}{@const w = activeWork()}{/snippet}
    </Rendered>`
  });
  assert.deepEqual(fActive.zoneNames('activeWork'), new Set(['view']));
});

test('Root inside unused outer snippet remains inactive', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {ApplicationRoot} from '@composable-svelte/core/application';
    function outerWork() {}
  </script>
  {#snippet outer()}
    <ApplicationRoot>
      {#snippet children(app)}{@const w = outerWork()}{/snippet}
    </ApplicationRoot>
  {/snippet}`});
  assert.deepEqual(f.zoneNames('outerWork'), new Set());
});

test('repeated apply and solve idempotence', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {ApplicationRoot} from '@composable-svelte/core/application';
    const opts = {dependencies: {foo: () => {}}};
  </script>
  <ApplicationRoot options={opts}>
    {#snippet children(app)}{/snippet}
  </ApplicationRoot>`});
  const rev1 = f.flow.revision;
  const sitesCount1 = f.template.wiringSites.length;
  f.template.apply();
  f.flow.solve();
  assert.equal(f.flow.revision, rev1);
  assert.equal(f.template.wiringSites.length, sitesCount1);
});

test('deterministic unsupported construct errors', (t) => {
  const fBadBind = fixture(t, {'App.svelte': '<script>let a, b;</script><div bind:this={a + b} />'});
  assert.ok(fBadBind.template.errors.some((e) => e.construct === 'unmodelled-bind-target'));

  const fBadUse = fixture(t, {'App.svelte': '<script>function act() {}</script><div use:act />'});
  assert.deepEqual(fBadUse.template.errors, []);
  assert.deepEqual(fBadUse.zoneNames('act'), new Set(['view']));

  const fImplicit = fixture(t, {
    'Child.svelte': '<script>let props = $props();</script>',
    'App.svelte': `<script>import Child from './Child.svelte';</script><Child><button>Click</button></Child>`
  });
  assert.ok(fImplicit.template.errors.some((e) => e.construct === 'implicit-children-fragment'));

  const fBadOutlet = fixture(t, {'App.svelte': `<script>
    import {FeatureOutlet} from '@composable-svelte/core/application';
    const badView = {unknown: true};
  </script>
  <FeatureOutlet view={badView} />`});
  assert.ok(fBadOutlet.template.errors.some((e) => e.construct === 'uncorrelated-view-handle'));
});

test('assert no Host or genuine-capability claim', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {ApplicationRoot, ApplicationHost} from '@composable-svelte/core/application';
  </script>
  <ApplicationRoot><ApplicationHost /></ApplicationRoot>`});
  assert.equal(f.template.errors.length, 0);
  for (const site of f.template.callbackSites) {
    assert.ok(site.node && site.value);
  }
});

function clean(f) {
  assert.deepEqual(f.context.errors, []);
  assert.deepEqual(f.flow.errors, []);
  assert.deepEqual(f.template.errors, []);
}
function bindingValue(f, name, module = 'App.svelte') {
  const b = [...f.context.symbols.bindings].find((b) => b.name === name && b.declarations.some((d) => d.unit && f.context.units.get(d.unit)?.path === module));
  assert.ok(b, name);
  return f.flow.bindingValue(b);
}
function hasAuthority(f, value, kind) {
  return [...value].some((a) => f.flow.domain.describe(a).kind === 'authority' && f.flow.domain.describe(a).id === kind);
}

test('explicit framework children transfer destructured authority and own execution edges', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {ApplicationRoot, ApplicationHost, FeatureViews, defineViews} from '@composable-svelte/core/application';
    const plan = defineViews(null, {main: {headless: true}});
    let storeCapture, viewsCapture; function rootWork() {} function hostWork() {} function viewsWork() {}
  </script>
  {#snippet rootChild({store})}{@const x = (storeCapture = store)}{@const y = rootWork()}{/snippet}
  {#snippet hostChild()}{@const x = hostWork()}{/snippet}
  {#snippet viewsChild(v)}{@const x = (viewsCapture = v)}{@const y = viewsWork()}{/snippet}
  <ApplicationRoot children={rootChild}/><ApplicationHost children={hostChild}/>
  <FeatureViews definition={plan} children={viewsChild}/>`});
  clean(f);
  assert.ok(hasAuthority(f, bindingValue(f, 'storeCapture'), 'store'));
  assert.ok(hasAuthority(f, bindingValue(f, 'viewsCapture'), 'views'));
  for (const name of ['rootWork', 'hostWork', 'viewsWork']) assert.deepEqual(f.zoneNames(name), new Set(['view']));
});

test('bare actions, dotted actions and attachment factory returns respect snippet execution', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    let actionEl, attachEl;
    function act(el) { actionEl = el; }
    function inertAction(el) { fetch('/inert'); }
    function attachment(el) { attachEl = el; fetch('/active'); }
    function factory() { return attachment; }
    const actions = {act};
  </script>
  {#snippet unused()}<div use:inertAction></div>{/snippet}
  {#snippet rendered()}<div use:actions.act {@attach factory()}></div>{/snippet}
  {@render rendered()}`});
  clean(f);
  assert.deepEqual(f.zoneNames('act'), new Set(['view']));
  assert.deepEqual(f.zoneNames('attachment'), new Set(['view']));
  assert.deepEqual(f.zoneNames('inertAction'), new Set());
  assert.ok(hasAuthority(f, bindingValue(f, 'actionEl'), 'element'));
  assert.ok(hasAuthority(f, bindingValue(f, 'attachEl'), 'element'));
  assert.equal(f.result.findings.filter((x) => x.detector === 'view-io').length, 1);
});

test('native event attributes and legacy directives activate callbacks only in rendered snippets', (t) => {
  for (const syntax of ['onclick={active}', 'on:click={active}']) {
    const f = fixture(t, {'App.svelte': `<script>
      function active() { fetch('/active'); }
      function inactive() { fetch('/inactive'); }
    </script>
    {#snippet visible()}<button ${syntax}>go</button>{/snippet}
    {#snippet hidden()}<button ${syntax.replace('active}', 'inactive}')}>no</button>{/snippet}
    {@render visible()}`});
    clean(f);
    assert.deepEqual(f.zoneNames('active'), new Set(['view']));
    assert.deepEqual(f.zoneNames('inactive'), new Set());
    assert.equal(f.template.lifecycleSites.length, 0);
    assert.equal(f.result.findings.filter((x) => x.detector === 'view-io').length, 1);
  }
});

test('native event names on unrendered local component props do not execute', (t) => {
  const f = fixture(t, {
    'Child.svelte': '<script>let {onclick} = $props();</script><div>inert</div>',
    'App.svelte': `<script>import Child from './Child.svelte'; function callback() { fetch('/inert'); }</script><Child onclick={callback}/>`
  });
  clean(f);
  assert.deepEqual(f.zoneNames('callback'), new Set());
  assert.equal(f.result.findings.length, 0);
});

test('nested definitions preserve child handle paths and cases union only declared content', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {defineViews, FeatureViews, FeatureOutlet} from '@composable-svelte/core/application';
    function outerWork() {} function caseOneWork() {} function caseTwoWork() {} function unusedWork() {} function metadataWork() {}
    let nestedStore, nestedViews;
    const nested = defineViews(null, {route: {cases: {one: {content: one}, two: {content: two}}}, unused: {content: unused}});
    const declarations = {outer: {content: outer, children: nested, metadata: {content: metadata}}};
    const plan = defineViews(null, {...declarations});
  </script>
  {#snippet outer({store, views})}{@const a = outerWork()}<FeatureOutlet view={views.route}/>{/snippet}
  {#snippet one({store, views})}{@const a = (nestedStore = store)}{@const b = (nestedViews = views)}{@const c = caseOneWork()}{/snippet}
  {#snippet two({store})}{@const a = caseTwoWork()}{/snippet}
  {#snippet unused(props)}{@const a = unusedWork()}{/snippet}
  {#snippet metadata(props)}{@const a = metadataWork()}{/snippet}
  <FeatureViews definition={plan}>{#snippet children(views)}<FeatureOutlet view={views.outer}/>{/snippet}</FeatureViews>`});
  clean(f);
  for (const name of ['outerWork', 'caseOneWork', 'caseTwoWork']) assert.deepEqual(f.zoneNames(name), new Set(['view']));
  for (const name of ['unusedWork', 'metadataWork']) assert.deepEqual(f.zoneNames(name), new Set());
  assert.ok(hasAuthority(f, bindingValue(f, 'nestedStore'), 'view'));
  assert.ok(hasAuthority(f, bindingValue(f, 'nestedViews'), 'views'));
});

test('defineViews seeds potential render props in the exact imported component', (t) => {
  const f = fixture(t, {
    'Render.svelte': '<script>let {store, views} = $props(); function shadow() { let store; }</script>',
    'Other.svelte': '<script>let {store} = $props();</script>',
    'App.svelte': `<script>
      import {defineViews} from '@composable-svelte/core/application';
      import Render from './Render.svelte'; import Other from './Other.svelte';
      const plan = defineViews(null, {main: {render: Render}});
    </script><Other/>`
  });
  clean(f);
  assert.ok(hasAuthority(f, bindingValue(f, 'store', 'Render.svelte'), 'view'));
  assert.ok(hasAuthority(f, bindingValue(f, 'views', 'Render.svelte'), 'views'));
  assert.equal(hasAuthority(f, bindingValue(f, 'store', 'Other.svelte'), 'view'), false);
  const shadow = [...f.context.symbols.bindings].filter((b) => b.name === 'store' && b.declarations.some((d) => f.context.units.get(d.unit)?.path === 'Render.svelte'));
  assert.equal(shadow.length, 2);
  assert.equal(shadow.filter((b) => hasAuthority(f, f.flow.bindingValue(b), 'view')).length, 1);
});

test('Root dependency factories are wiring while eager dependency calls execute in view', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {ApplicationRoot} from '@composable-svelte/core/application';
    function registered() {} function eager() { return {}; } function irrelevant() {}
    const dependencies = {registered}; const base = {dependencies};
  </script><ApplicationRoot options={{...base, dependencies: {...dependencies, api: eager()}, irrelevant}}/>`});
  clean(f);
  assert.deepEqual(f.zoneNames('registered'), new Set(['wiring']));
  assert.deepEqual(f.zoneNames('eager'), new Set(['view']));
  assert.deepEqual(f.zoneNames('irrelevant'), new Set());
});

test('dynamic native boundaries and unknown bind receivers fail explicitly', (t) => {
  const dynamic = fixture(t, {'App.svelte': '<script>let tag = "div", element;</script><svelte:element this={tag} bind:this={element}/>'});
  assert.ok(dynamic.template.errors.some((e) => e.construct === 'unsupported-dynamic-element'));
  const receiver = fixture(t, {'App.svelte': '<script>let object;</script><div bind:this={object.element}/>'});
  assert.ok(receiver.template.errors.some((e) => e.construct === 'unmodelled-bind-target'));
});

test('definitions alone do not expose consumed handles or execute content', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {defineViews, FeatureOutlet} from '@composable-svelte/core/application';
    function contentWork() { fetch('/unused'); }
    const plan = defineViews(null, {main: {content: body}});
  </script>{#snippet body({store})}{@const x = contentWork()}{/snippet}<FeatureOutlet view={plan.main}/>`});
  assert.deepEqual(f.zoneNames('contentWork'), new Set());
  assert.ok(f.template.errors.some((e) => e.construct === 'uncorrelated-view-handle'));
});

test('same-named Root shadows are lexical and do not activate children', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {ApplicationRoot} from '@composable-svelte/core/application';
    function shadowWork() {}
  </script>
  {#snippet outer(ApplicationRoot)}<ApplicationRoot>{#snippet children(app)}{@const x = shadowWork()}{/snippet}</ApplicationRoot>{/snippet}
  {@render outer(null)}`});
  clean(f);
  assert.deepEqual(f.zoneNames('shadowWork'), new Set());
});

test('native bind property authority reaches a motion rule finding', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    const refs = {};
    function play() { refs.target.animate([{opacity:0}, {opacity:1}], 100); }
  </script><div bind:this={refs.target}></div><button onclick={play}>go</button>`});
  clean(f);
  assert.equal(f.result.findings.filter((x) => x.detector === 'web-animations').length, 1);
});

test('use argument functions stay values until the selected action invokes them', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    let selectedParameter; function parameter() { fetch('/never'); }
    function action(element, arg) { selectedParameter = arg; }
  </script><div use:action={parameter}></div>`});
  clean(f);
  assert.deepEqual(f.zoneNames('action'), new Set(['view']));
  assert.deepEqual(f.zoneNames('parameter'), new Set());
  assert.ok([...bindingValue(f, 'selectedParameter')].some((a) => f.flow.domain.describe(a).id === f.named('parameter').id));
  assert.equal(f.result.findings.filter((x) => x.detector === 'view-io').length, 0);
});

test('template-to-child render uses existing snippet argument and destructuring transfer', (t) => {
  const f = fixture(t, {
    'Child.svelte': '<script>let {children, value} = $props();</script>{@render children({value})}',
    'App.svelte': `<script>
      import Child from './Child.svelte'; import {ApplicationRoot} from '@composable-svelte/core/application';
      let captured; function work() {}
    </script><ApplicationRoot>{#snippet children(app)}<Child value={app}>{#snippet children({value})}{@const x = (captured = value)}{@const y = work()}{/snippet}</Child>{/snippet}</ApplicationRoot>`
  });
  clean(f);
  assert.ok(hasAuthority(f, bindingValue(f, 'captured'), 'app'));
  assert.equal(f.context.renderCalls.size, 1);
  assert.ok([...f.context.snippets.values()].some((s) => [...f.context.units.keys()].some((u) => f.context.snippetFor(u) === s)));
  assert.deepEqual(f.zoneNames('work'), new Set(['view']));
});

test('component alternatives fail explicitly rather than selecting one reachable component', (t) => {
  const f = fixture(t, {
    'First.svelte': '<script>let {children} = $props();</script>{@render children()}',
    'Second.svelte': '<script>let {children} = $props();</script><div>unused</div>',
    'App.svelte': `<script>
      import First from './First.svelte'; import Second from './Second.svelte';
      import {ApplicationRoot, ApplicationHost} from '@composable-svelte/core/application';
      let condition; const Local = condition ? First : Second;
      const Framework = condition ? ApplicationRoot : ApplicationHost;
    </script><Local>{#snippet children()}{/snippet}</Local><Framework>{#snippet children(value)}{/snippet}</Framework>`
  });
  assert.equal(f.template.errors.filter((e) => e.construct === 'unsupported-component-union').length, 2);
});

test('framework boundary prop spreads fail explicitly instead of silently dropping wiring or execution', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet, defineViews} from '@composable-svelte/core/application';
    const rootProps = {options: {dependencies: {factory() {}}}, children: child};
    const hostProps = {children: child};
    const viewProps = {definition: defineViews(null, {}), children: child};
    const outletProps = {view: {}};
  </script>{#snippet child(value)}{/snippet}
  <ApplicationRoot {...rootProps}/><ApplicationHost {...hostProps}/>
  <FeatureViews {...viewProps}/><FeatureOutlet {...outletProps}/>`});
  assert.equal(f.template.errors.filter((e) => e.construct === 'unsupported-framework-prop-spread').length, 4);
});

test('uninspectable consumed declaration syntax fails correlation explicitly', (t) => {
  const f = fixture(t, {'App.svelte': `<script>
    import {defineViews, FeatureViews, FeatureOutlet} from '@composable-svelte/core/application';
    function makeDeclarations() { return {main: {headless: true}}; }
    const plan = defineViews(null, makeDeclarations());
  </script><FeatureViews definition={plan}>{#snippet children(views)}<FeatureOutlet view={views.main}/>{/snippet}</FeatureViews>`});
  assert.ok(f.template.errors.some((e) => e.construct === 'uncorrelated-view-handle'));
});

test('native spread callbacks execute and ordered overrides discard replaced handlers', (t) => {
  for (const [attributes, expected] of [
    ['{...{onclick: unsafe}}', 1],
    ['{...{onclick: unsafe}} onclick={safe}', 0],
    ['onclick={unsafe} {...{onclick: safe}}', 0],
    ['{...(condition ? {onclick: unsafe} : {onclick: safe})}', 1],
    ['{...(condition ? {onclick: unsafe} : {})} onclick={safe}', 0]
  ]) {
    const f = fixture(t, {'App.svelte': `<script>
      let condition; function unsafe() { fetch('/event'); } function safe() {}
    </script><button ${attributes}>go</button>`});
    clean(f);
    assert.equal(f.result.findings.filter((x) => x.detector === 'view-io').length, expected, attributes);
  }
});

test('local component spread props use ordered replacement and retain real alternatives', (t) => {
  for (const [attributes, expected] of [
    ['{...props} onclick={safe}', 0],
    ['onclick={safe} {...props}', 1],
    ['{...(condition ? props : {onclick: safe})}', 1],
    ['{...(condition ? props : {})} onclick={safe}', 0]
  ]) {
    const f = fixture(t, {
      'Child.svelte': '<script>let {onclick} = $props();</script><button {onclick}>go</button>',
      'App.svelte': `<script>import Child from './Child.svelte';
        let condition; function unsafe() { fetch('/event'); } function safe() {} const props = {onclick: unsafe};
      </script><Child ${attributes}/>`
    });
    clean(f);
    assert.equal(f.result.findings.filter((x) => x.detector === 'view-io').length, expected, attributes);
  }
});

test('view declaration property order respects spread replacement and genuine conditional alternatives', (t) => {
  for (const [declarations, expected] of [
    ['{...base, main: {content: safe}}', 0],
    ['{main: {content: safe}, ...base}', 1],
    ['{...base, main: {content: safe}, ...base}', 1],
    ['condition ? base : {main: {content: safe}}', 1],
    ['{...(condition ? base : {}), main: {content: safe}}', 0]
  ]) {
    const f = fixture(t, {'App.svelte': `<script>
      import {defineViews, FeatureViews, FeatureOutlet} from '@composable-svelte/core/application';
      let condition; function load() { fetch('/never'); }
      const base = {main: {content: unsafe}}; const plan = defineViews(null, ${declarations});
    </script>{#snippet unsafe(props)}{@const x = load()}{/snippet}{#snippet safe(props)}safe{/snippet}
    <FeatureViews definition={plan}>{#snippet children(views)}<FeatureOutlet view={views.main}/>{/snippet}</FeatureViews>`});
    clean(f);
    assert.equal(f.result.findings.filter((x) => x.detector === 'view-io').length, expected, declarations);
  }
});

test('dynamic element events and dynamic prop keys fail explicitly', (t) => {
  const special = fixture(t, {'App.svelte': '<script>let tag = "button"; function load() { fetch("/event"); }</script><svelte:element this={tag} onclick={load}/>'});
  assert.ok(special.template.errors.some((e) => e.construct === 'unsupported-special-element-event'));
  for (const spread of ['{[key]: load}', 'makeProps()']) {
    const f = fixture(t, {'App.svelte': `<script>let key; function load() {} function makeProps() { return {onclick: load}; }</script><button {...${spread}}>go</button>`});
    assert.ok(f.template.errors.some((e) => e.construct === 'unsupported-prop-spread'));
  }
});

test('compiler-validated window, document and body event callbacks reach view rules', (t) => {
  for (const markup of [
    '<svelte:window onresize={load}/>',
    '<svelte:document onvisibilitychange={load}/>',
    '<svelte:body onkeydown={load}/>',
    '<svelte:window on:resize={load}/>'
  ]) {
    const source = `<script>function load() { fetch('/event'); }</script>${markup}`;
    assert.doesNotThrow(() => compile(source, {filename: 'App.svelte', generate: 'client'}));
    const f = fixture(t, {'App.svelte': source});
    clean(f);
    assert.deepEqual(f.zoneNames('load'), new Set(['view']));
    assert.equal(f.result.findings.filter((x) => x.detector === 'view-io').length, 1);
    assert.equal(f.template.lifecycleSites.length, 0);
  }
});

test('mutated spread aliases fail explicitly when static key shape is no longer trustworthy', (t) => {
  for (const mutation of ['props.onclick = load;', 'const alias = props; alias.onclick = load;']) {
    const f = fixture(t, {'App.svelte': `<script>function load() {} const props = {}; ${mutation}</script><button {...props}>go</button>`});
    assert.ok(f.template.errors.some((e) => e.construct === 'unsupported-prop-spread'));
  }
});

test('interpolated prop text does not transfer its embedded function as a callback', (t) => {
  const f = fixture(t, {
    'Child.svelte': '<script>let {value} = $props();</script><div>{value}</div>',
    'App.svelte': '<script>import Child from "./Child.svelte"; function callback() {}</script><Child value="prefix {callback}"/>'
  });
  clean(f);
  assert.equal([...bindingValue(f, 'value', 'Child.svelte')].some((atom) => f.flow.domain.describe(atom).kind === 'function'), false);
});
