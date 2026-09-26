import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {buildGraph} from '../graph.mjs';
import {buildSemanticContext} from '../semantic-context.mjs';
import {buildValueFlow} from '../semantic-flow.mjs';
import {createFrameworkSeeds} from '../framework-seeds.mjs';
import {buildExecutionZones} from '../semantic-zones.mjs';
import {evaluateSemanticRules} from './semantic-rules.mjs';

function fixture(t, source, {svelte = false, callbacks = []} = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'semantic-rules-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const entry = svelte ? 'App.svelte' : 'entry.ts';
  const files = {
    'package.json': JSON.stringify({dependencies: {'@composable-svelte/core': '0.13.0-next.1', svelte: '5.0.0'}}),
    'tsconfig.json': '{}',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({name: '@composable-svelte/core', version: '0.13.0-next.1', exports: {'.': './index.js', './application': './application.js'}}),
    'node_modules/svelte/package.json': JSON.stringify({name: 'svelte', version: '5.0.0', exports: {'.': './index.js'}}),
    [entry]: source
  };
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(projectRoot, name)), {recursive: true});
    writeFileSync(join(projectRoot, name), text);
  }
  const graph = buildGraph({projectRoot, roots: [entry], tsconfig: 'tsconfig.json', opaquePackages: [
    {name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'},
    {name: 'svelte', version: '5.0.0', provenance: 'registry'}
  ]});
  assert.deepEqual(graph.errors, []);
  const context = buildSemanticContext({projectRoot, graph});
  assert.equal(context.complete, true, JSON.stringify(context.errors));
  const framework = createFrameworkSeeds(context);
  const flow = buildValueFlow(context, {onInvoke: framework.onInvoke, onProperty: framework.onProperty});
  assert.equal(flow.complete, true, JSON.stringify(flow.errors));
  const named = (name) => [...context.functions.values()].find((fn) => fn.node.name?.text === name);
  const callbackSites = callbacks.map((name) => {
    const fn = named(name); assert.ok(fn, `callback ${name}`);
    return {node: fn.node, value: flow.domain.atom('function', fn.id)};
  });
  const zones = buildExecutionZones(context, flow, framework, {callbackSites});
  const result = evaluateSemanticRules({context, flow, zones});
  return {result, detector: (name) => result.findings.filter((f) => f.detector === name)};
}

test('routing recognizes extracted browser methods while a local same-name helper and managed dispatch are clean', (t) => {
  const f = fixture(t, `
    const navigate = history.pushState;
    navigate({}, '', '/bad');
    function pushState() { return '/local'; }
    pushState();
    import {useApplication as useApp} from '@composable-svelte/core/application';
    const app = useApp({});
    function click() { app.store.dispatch({type: 'navigate', to: '/good'}); }
    click();
  `);
  assert.equal(f.detector('history-write').length, 1);
  assert.equal(f.detector('authority-escape').length, 0);
});

test('presentation distinguishes imported lifecycle aliases from event callbacks and local lookalikes', (t) => {
  const f = fixture(t, `<script>
    import {onMount as mounted} from 'svelte';
    import {useApplication as useApp} from '@composable-svelte/core/application';
    const app = useApp({});
    function lifecycle() { app.store.dispatch({type: 'bad'}); }
    function click() { app.store.dispatch({type: 'good'}); }
    function onMount(fn) { return fn; }
    function local() { app.store.dispatch({type: 'local'}); }
    mounted(lifecycle); onMount(local);
  </script><button onclick={click}>go</button>`, {svelte: true, callbacks: ['click']});
  assert.equal(f.detector('lifecycle-dispatch').length, 1);
});

test('reducer helper zones retain impurity and shallow-copy state descendants', (t) => {
  const f = fixture(t, `
    import {defineApplication as defineApp} from '@composable-svelte/core/application';
    function clock() { return Date.now(); }
    function bad(state) { const next = {...state}; next.items.push(clock()); return [next]; }
    defineApp(bad, {});
  `);
  assert.ok(f.detector('impure-primitive').length >= 1);
  assert.equal(f.detector('state-mutation').length, 1);
});

test('fresh copied descendants and local framework-like names remain clean decisions', (t) => {
  const f = fixture(t, `
    import {defineApplication as defineApp} from '@composable-svelte/core/application';
    function clean(state) { const next = {...state, items: [...state.items]}; next.items.push(1); return [next]; }
    function defineApplication(fn) { return fn; }
    function local(state) { return [state, Math.random()]; }
    defineApplication(local); defineApp(clean, {});
  `);
  assert.equal(f.detector('state-mutation').length, 0);
  assert.equal(f.detector('impure-primitive').length, 0);
});

test('resource ownership distinguishes deferred services, eager factories, and injected Effect work', (t) => {
  const f = fixture(t, `
    import {createStore as makeStore, Effect as Fx} from '@composable-svelte/core';
    function reducer(state, action, deps) { return [state, Fx.run(() => deps.load())]; }
    function deferred() { return fetch('/later'); }
    function eagerFactory() { const pending = fetch('/eager'); return {load: () => pending}; }
    makeStore({reducer, dependencies: {deferred, eager: eagerFactory()}});
  `);
  assert.equal(f.detector('module-load-io').length, 1);
  assert.equal(f.detector('effect-body-primitive').length, 0);
});

test('Effect bodies performing resources directly are rejected', (t) => {
  const f = fixture(t, `
    import {Effect as Fx} from '@composable-svelte/core';
    import {defineApplication as defineApp} from '@composable-svelte/core/application';
    function direct() { return fetch('/bad'); }
    function reducer(state) { return [state, Fx.run(direct)]; }
    defineApp(reducer, {});
  `);
  assert.equal(f.detector('effect-body-primitive').length, 1);
});

test('motion catches frame scheduling and extracted web animation but ignores local same names', (t) => {
  const f = fixture(t, `
    requestAnimationFrame(() => {});
    const play = document.body.animate;
    play([], {});
    function animate() { return 1; }
    animate();
  `);
  assert.equal(f.detector('frame-scheduler').length, 1);
  assert.equal(f.detector('web-animations').length, 1);
});

test('tick promise callbacks are lifecycle work while ordinary then and event callbacks remain user intent', (t) => {
  const f = fixture(t, `<script>
    import {tick as nextTick} from 'svelte';
    import {useApplication as useApp} from '@composable-svelte/core/application';
    const app = useApp({});
    function afterTick() { app.store.dispatch({type: 'bad'}); }
    function click() { app.store.dispatch({type: 'good'}); }
    function tick() { return {then(fn) { return fn; }}; }
    function ordinary() { app.store.dispatch({type: 'ordinary'}); }
    nextTick().then(afterTick); tick().then(ordinary);
  </script><button onclick={click}>go</button>`, {svelte: true, callbacks: ['click']});
  assert.equal(f.detector('lifecycle-dispatch').length, 1);
});

test('direct dispatch in a derived rune is lifecycle orchestration while state projection is clean', (t) => {
  const f = fixture(t, `<script>
    import {useApplication as useApp} from '@composable-svelte/core/application';
    const app = useApp({});
    const bad = $derived(app.store.dispatch({type: 'bad'}));
    const good = $derived(app.store.state.title);
  </script><p>{good}</p>`, {svelte: true});
  assert.equal(f.detector('lifecycle-dispatch').length, 1);
  assert.equal(f.detector('state-mirror').length, 0);
});

test('code strings, reflection, and proxy wrapping fail closed', (t) => {
  const f = fixture(t, `
    eval('1 + 1');
    Reflect.get(window, 'location');
    new Proxy(window, {});
  `);
  assert.deepEqual(new Set(f.result.errors.map((e) => e.construct)), new Set([
    'code-from-string', 'reflection', 'proxy-of-authority'
  ]));
});

test('dynamic browser events, opaque store escape, and location assignment are diagnosed', (t) => {
  const f = fixture(t, `
    import {useApplication as useApp} from '@composable-svelte/core/application';
    const app = useApp({});
    export function listen(eventName) { window.addEventListener(eventName, () => {}); }
    unknownConsumer(app.store);
    location.href = '/bad';
  `);
  assert.deepEqual(new Set(f.result.errors.map((e) => e.construct)), new Set([
    'dynamic-traversal-event', 'store-authority-to-opaque-callee'
  ]));
  assert.equal(f.detector('location-write').length, 1);
});

test('normalized call/apply forms preserve store reducer and Effect callback semantics', (t) => {
  const f = fixture(t, `
    import {createStore, Effect} from '@composable-svelte/core';
    function reducer(state) { return [state, Math.random()]; }
    function directEffect() { return fetch('/bad'); }
    createStore.call(null, {reducer});
    Effect.run.call(null, directEffect);
  `);
  assert.equal(f.detector('impure-primitive').length, 1);
  assert.equal(f.detector('effect-body-primitive').length, 1);
});

test('call apply and bind retain browser listener routing identity', (t) => {
  const f = fixture(t, `
    function traversed() {}
    window.addEventListener.call(window, 'popstate', traversed);
    window.addEventListener.apply(window, ['popstate', traversed]);
    const listen = window.addEventListener.bind(window);
    listen('popstate', traversed);
  `);
  assert.equal(f.detector('traversal-listener').length, 3, JSON.stringify(f.detector('traversal-listener').map((x) => x.span.start)));
});

test('extracted local helper call propagates its caller execution zone', (t) => {
  const f = fixture(t, `<script>
    function helper() { return fetch('/view'); }
    const invoke = helper.call;
    invoke(null);
  </script><p>view</p>`, {svelte: true});
  assert.equal(f.detector('view-io').length, 1);
  assert.equal(f.detector('module-load-io').length, 0);
});

test('an extracted mutator retains descendant state identity', (t) => {
  const f = fixture(t, `
    import {defineApplication} from '@composable-svelte/core/application';
    function reducer(state, action) { const push = state.items.push; push(action.value); return [state]; }
    defineApplication(reducer, {});
  `);
  assert.equal(f.detector('state-mutation').length, 1);
});

test('ambient declarations remain opaque and reject browser and store authority escapes', (t) => {
  const f = fixture(t, `
    import {useApplication} from '@composable-svelte/core/application';
    declare function opaque(value): void;
    const app = useApplication({});
    opaque(history);
    opaque(app.store);
  `);
  assert.equal(f.detector('authority-escape').length, 1);
  assert.ok(f.result.errors.some((error) => error.construct === 'store-authority-to-opaque-callee'));
});

// Corrective consumer-discovered resource-reference regressions.
test('capturing fetch as a deferred service default does not perform module I/O', (t) => {
 const f=fixture(t, `function service(request=globalThis.fetch){return {load:()=>request('/later')}};const deps=service();`);
 assert.equal(f.detector('module-load-io').length,0);
});
test('capturing fetch as a deferred service default does not perform view I/O', (t) => {
 const f=fixture(t, `<script>function service(request=globalThis.fetch){return {load:()=>request('/later')}};const deps=service();</script>`,{svelte:true});
 assert.equal(f.detector('view-io').length,0);
});
test('calling a captured default service outside an effect is still I/O', (t) => {
 const f=fixture(t, `function service(request=globalThis.fetch){return {load:()=>request('/now')}};service().load();`);
 assert.ok(f.detector('module-load-io').length>0);
});
test('binding fetch without invoking the result does not send a request', (t) => {
 const f=fixture(t, `const request=fetch.bind(globalThis);`);
 assert.equal(f.detector('module-load-io').length,0);
});
test('invoking a bound fetch remains module I/O', (t) => {
 const f=fixture(t, `const request=fetch.bind(globalThis);request('/now');`);
 assert.ok(f.detector('module-load-io').length>0);
});


test('resource invocations through aliases, defaults and call/apply/bind retain module and view findings', (t) => {
 const cases=[
  `const request=globalThis.fetch;request('/now');`,
  `fetch.call(globalThis,'/now');`,
  `fetch.apply(globalThis,['/now']);`,
  `const call=fetch.call;call(globalThis,'/now');`,
  `fetch.bind(globalThis)('/now');`,
  `const bound=fetch.bind(globalThis);bound.call(null,'/now');`,
  `function service(request=fetch('/now')){return request}service();`,
  `function service(request=fetch){return {load:()=>request('/now')}}service().load();`,
  `const Service=WebSocket;new Service('wss://example.test');`,
  `navigator.sendBeacon('/now','data');`,
  `setTimeout(()=>{},1);`
 ];
 for(const source of cases) {
  assert.ok(fixture(t,source).detector('module-load-io').length>0,source);
  assert.ok(fixture(t,`<script>${source}</script>`,{svelte:true}).detector('view-io').length>0,source);
 }
});

test('pure callable capture and binding remain clean while resource value reads remain significant', (t) => {
 for(const source of [
  `const request=globalThis.fetch;`,
  `const {fetch:request}=globalThis;`,
  `const Service=WebSocket;`,
  `const schedule=setTimeout;`,
  `const request=fetch.bind(globalThis);`,
  `const bind=fetch.bind;const request=bind(globalThis);`,
  `const bound=fetch.bind(globalThis);const request=bound.bind(null);`
 ]) {
  assert.equal(fixture(t,source).detector('module-load-io').length,0,source);
  assert.equal(fixture(t,`<script>${source}</script>`,{svelte:true}).detector('view-io').length,0,source);
 }
 for(const source of [`const storage=localStorage;`,`const permission=Notification.permission;`,`const clipboard=navigator.clipboard;`]) {
  assert.ok(fixture(t,source).detector('module-load-io').length>0,source);
 }
});
