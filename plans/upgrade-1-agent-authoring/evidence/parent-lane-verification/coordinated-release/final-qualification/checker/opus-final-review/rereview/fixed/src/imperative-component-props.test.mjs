import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {buildGraph} from './graph.mjs';
import {analyzeSemantics} from './semantics.mjs';

function fixture(t, files, options = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'semantics-orchestration-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {
    'package.json': JSON.stringify({name: 'fixture', dependencies: {
      '@composable-svelte/core': '0.13.0-next.1', svelte: '5.57.0'
    }}),
    'tsconfig.json': '{}',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core', version: '0.13.0-next.1',
      exports: {'.': './index.js', './application': './application.js'}
    }),
    'node_modules/svelte/package.json': JSON.stringify({
      name: 'svelte', version: '5.57.0', exports: {'.': './index.js', './transition': './transition.js'}
    }),
    ...files
  };
  for (const [path, source] of Object.entries(all)) {
    mkdirSync(dirname(join(projectRoot, path)), {recursive: true});
    writeFileSync(join(projectRoot, path), source);
  }
  const roots = options.roots ?? ['entry.ts'];
  const graph = buildGraph({projectRoot, roots, tsconfig: 'tsconfig.json', opaquePackages: [
    {name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'},
    {name: 'svelte', version: '5.57.0', provenance: 'registry'}
  ]});
  assert.deepEqual(graph.errors, []);
  return analyzeSemantics({projectRoot, graph, ...options.analysis});
}


const service = `function createService(request = (url, init) => fetch(url, init)) {
 return {async list() { return request('/api/records', {}); }};
}`;
const plain = '<p>App</p>';
const entry = (imports = "import {mount} from 'svelte';", call = 'mount') => `${imports}
 import App from './App.svelte'; ${service}
 ${call}(App, {target: document.body, props: {dependencies: {records: createService()}}});`;
const analyze = (t, source, app = plain, extra = {}) => fixture(t, {'entry.ts':source, 'App.svelte':app, ...extra});
const detectors = r => r.findings.map(f => f.detector);
const quiet = r => {assert.equal(r.complete,true,JSON.stringify(r.errors));assert.deepEqual(r.findings,[]);};
const refuses = r => {assert.equal(r.complete,false);assert.ok(r.errors.some(e=>e.construct==='unsupported-imperative-component'),JSON.stringify(r.errors));};

test('public mount stores a service with a default fetch closure', t => quiet(analyze(t,entry())));
test('public hydrate and renamed mount retain imported identity', t => {
 quiet(analyze(t,entry("import {hydrate as start} from 'svelte';",'start')));
 quiet(analyze(t,entry("import * as ui from 'svelte'; const start=ui.mount;",'start')));
});
test('literal options aliases and spreads preserve prop transfer', t => {
 const src=`import {mount} from 'svelte';import App from './App.svelte';${service}
 const props={dependencies:{records:createService()}};const target={target:document.body};
 const options={...target,props};mount(App,options);`;
 quiet(analyze(t,src));
 assert.deepEqual(detectors(analyze(t,src,`<script>let {dependencies}=$props();dependencies.records.list();</script>`)),['view-io']);
});
test('component instance calls of supplied service remain view I/O', t => {
 const r=analyze(t,entry(),`<script>let {dependencies}=$props();dependencies.records.list();</script>`);
 assert.equal(r.complete,true,JSON.stringify(r.errors));assert.deepEqual(detectors(r),['view-io']);
});
test('component event use of supplied service remains view I/O', t => {
 const r=analyze(t,entry(),`<script>let {dependencies}=$props();</script><button onclick={()=>dependencies.records.list()}>Load</button>`);
 assert.equal(r.complete,true,JSON.stringify(r.errors));assert.deepEqual(detectors(r),['view-io']);
});
test('legacy exported props receive the same service identity', t => {
 const r=analyze(t,entry(),`<script>export let dependencies;dependencies.records.list();</script>`);
 assert.equal(r.complete,true,JSON.stringify(r.errors));assert.deepEqual(detectors(r),['view-io']);
});
test('eager props method and eager factory/default work remain module I/O', t => {
 for(const src of [entry().replace('records: createService()', 'records: createService().list()'),
 entry().replace("return {async list()", "fetch('/factory'); return {async list()"),
 entry().replace('(url, init) => fetch(url, init)', "fetch('/default')")]) {
  const r=analyze(t,src);assert.ok(detectors(r).includes('module-load-io'),JSON.stringify(r));
 }
});
test('local fake mount and unrelated imported mount execute their actual methods', t => {
 const fake=`export function mount(component,options){options.props.dependencies.records.list();}`;
 for(const imports of [fake.replace('export ',''),"import {mount} from './fake';"]) {
  const r=analyze(t,entry(imports),plain,{'fake.ts':fake});assert.ok(detectors(r).includes('module-load-io'),JSON.stringify(r));
 }
});
test('a separate opaque external call retains callable prop execution', t => {
 const r=analyze(t,entry()+`import {flushSync} from 'svelte';flushSync(createService().list);`);
 assert.ok(detectors(r).includes('module-load-io'),JSON.stringify(r));
});
test('mixed public and local callable alternatives cannot gain a storage exemption', t => {
 const src=entry("import {mount as real} from 'svelte';function fake(c,o){o.props.dependencies.records.list();} const mount=flag?real:fake;");
 const r=analyze(t,src);refuses(r);assert.ok(detectors(r).includes('module-load-io'));
});
test('unknown components and unsupported callback options explicitly refuse', t => {
 refuses(analyze(t,entry().replace('mount(App,','mount(unknownComponent,')));
 refuses(analyze(t,entry().replace('target: document.body,','target: document.body, events: {ready: () => fetch("/event")},')));
});
test('unknown props, mutable option aliases, and indirect call forms refuse', t => {
 refuses(analyze(t,entry().replace('props: {dependencies: {records: createService()}}','props: unknownProps')));
 refuses(analyze(t,entry().replace('mount(App,','mount.call(null, App,')));
 refuses(analyze(t,`import {mount} from 'svelte';import App from './App.svelte';${service}
 const options={target:document.body,props:{}}; options.props={dependencies:{records:createService()}};mount(App,options);`));
});
test('Root dependency wiring remains quiet while direct effect fetch remains forbidden', t => {
 quiet(analyze(t,entry(),`<script>import {ApplicationRoot} from '@composable-svelte/core/application';let {dependencies}=$props();</script><ApplicationRoot options={{dependencies}} />`));
 const r=analyze(t,entry(),`<script>import {Effect} from '@composable-svelte/core';let {dependencies}=$props();const work=Effect.run(()=>fetch('/direct'));</script>`);
 assert.ok(detectors(r).includes('effect-body-primitive'),JSON.stringify(r));
});

test('independent: mounted props forwarded to nested component retain effect identity', t => {
 const r=analyze(t,entry(),`<script>import Child from './Child.svelte';let {dependencies}=$props();</script><Child records={dependencies.records} />`,{'Child.svelte':`<script>let {records}=$props();records.list();</script>`});
 assert.equal(r.complete,true,JSON.stringify(r.errors));assert.ok(detectors(r).includes('view-io'));
});
test('independent: two mount sites union services without losing unsafe use', t => {
 const src=entry()+`mount(App,{target:document.body,props:{dependencies:{records:{list:()=>fetch('/second')}}}});`;
 const r=analyze(t,src,`<script>let {dependencies}=$props();dependencies.records.list();</script>`);
 assert.equal(r.complete,true,JSON.stringify(r.errors));assert.ok(detectors(r).includes('view-io'));
});
test('independent: destructured mounted callback remains view owned when invoked', t => {
 const src=`import {mount} from 'svelte';import App from './App.svelte';mount(App,{target:document.body,props:{load:()=>fetch('/unsafe')}});`;
 const r=analyze(t,src,`<script>let {load:run}=$props();</script><button onclick={run}>Run</button>`);
 assert.equal(r.complete,true,JSON.stringify(r.errors));assert.ok(detectors(r).includes('view-io'));
});
