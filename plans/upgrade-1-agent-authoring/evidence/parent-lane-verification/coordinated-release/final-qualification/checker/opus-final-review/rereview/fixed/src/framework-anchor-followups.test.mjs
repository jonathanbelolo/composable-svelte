import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {buildGraph} from './graph.mjs';
import {buildSemanticContext} from './semantic-context.mjs';
import {buildValueFlow} from './semantic-flow.mjs';
import {createFrameworkSeeds} from './framework-seeds.mjs';
import {createTypeSeeds} from './semantic-types.mjs';
import {buildExecutionZones} from './semantic-zones.mjs';
import {lookupAnchor} from './anchors.mjs';

const CORE = '@composable-svelte/core';
const APP = `${CORE}/application`;

function fixture(t, source, {types = false} = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'anchor-followups-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const files = {
    'package.json': JSON.stringify({name: 'fixture', dependencies: {[CORE]: '0.13.0-next.1'}}),
    'tsconfig.json': '{}',
    'entry.ts': source,
    [`node_modules/${CORE}/package.json`]: JSON.stringify({
      name: CORE, version: '0.13.0-next.1',
      exports: {'.': './index.js', './application': './application.js', './navigation': './navigation.js'}
    })
  };
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(projectRoot, name)), {recursive: true});
    writeFileSync(join(projectRoot, name), text);
  }
  const graph = buildGraph({
    projectRoot, roots: ['entry.ts'], tsconfig: 'tsconfig.json',
    opaquePackages: [{name: CORE, version: '0.13.0-next.1', provenance: 'registry'}]
  });
  assert.deepEqual(graph.errors, []);
  const context = buildSemanticContext({projectRoot, graph});
  assert.equal(context.complete, true, JSON.stringify(context.errors));
  const framework = createFrameworkSeeds(context);
  const flow = buildValueFlow(context, {onInvoke: framework.onInvoke, onProperty: framework.onProperty});
  let typeSeeds = null;
  if (types) {
    typeSeeds = createTypeSeeds(context, flow);
    typeSeeds.apply();
    flow.solve();
  }
  assert.equal(flow.complete, true, JSON.stringify(flow.errors));
  const binding = (name) => {
    const matches = context.symbols.bindings.filter((candidate) => candidate.name === name);
    assert.equal(matches.length, 1, `unique binding ${name}`);
    return matches[0];
  };
  const authorities = (name) => new Set([...flow.bindingValue(binding(name))]
    .map((atom) => flow.domain.describe(atom))
    .filter((item) => item.kind === 'authority')
    .map((item) => item.id));
  const named = (name) => [...context.functions.values()].find((fn) => fn.node.name?.text === name);
  return {context, framework, flow, typeSeeds, binding, authorities, named};
}

test('scopeTo overloads and fluent terminals preserve their distinct public transitions', (t) => {
  const f = fixture(t, `
    import {scopeTo as rootScope} from '@composable-svelte/core';
    import {scopeTo as appScope} from '@composable-svelte/core/application';
    import {scopeTo as navScope} from '@composable-svelte/core/navigation';
    declare const store: unknown;
    declare const projection: unknown;
    declare const slot: unknown;
    const rootBuilder = rootScope(store);
    const nestedBuilder = appScope(store).into('destination');
    const legacyCase = nestedBuilder.case('edit');
    const legacyOptional = navScope(store).into('panel').optional();
    const managed = appScope(projection, slot);
  `);
  assert.deepEqual(f.authorities('rootBuilder'), new Set(['scope-builder']));
  assert.deepEqual(f.authorities('nestedBuilder'), new Set(['scope-builder']));
  assert.deepEqual(f.authorities('legacyCase'), new Set(['legacy-view']));
  assert.deepEqual(f.authorities('legacyOptional'), new Set(['legacy-view']));
  assert.deepEqual(f.authorities('managed'), new Set(['view']));
  const legacy = f.flow.bindingValue(f.binding('legacyCase'));
  assert.ok(f.flow.authority.member(legacy, 'dispatch').size > 0);
  assert.equal(f.flow.authority.member(legacy, 'subscribe').size, 0);
  assert.equal(f.flow.authority.member(legacy, 'select').size, 0);
  for (const specifier of [CORE, APP, `${CORE}/navigation`]) {
    const anchor = lookupAnchor(specifier, 'scopeTo');
    assert.equal(anchor?.kind, 'view-scope');
    assert.deepEqual(anchor.overloads?.map((item) => item.arity), [2, 1]);
  }
});

test('managedDismissDependency defers cleanup into effect work while argument factories execute eagerly', (t) => {
  const f = fixture(t, `
    import {managedDismissDependency} from '@composable-svelte/core/application';
    function makeCleanup() {
      const token = 'created';
      return function cleanup(signal) { return fetch('/cleanup/' + token); };
    }
    const dismiss = managedDismissDependency(makeCleanup());
    const producedEffect = dismiss();
  `);
  const zones = buildExecutionZones(f.context, f.flow, f.framework);
  const zoneNames = (name) => new Set(zones.values.get(f.named(name)?.id)?.keys() ?? []);
  assert.ok(zoneNames('makeCleanup').has('module'));
  assert.equal(zoneNames('makeCleanup').has('effect'), false);
  assert.ok(zoneNames('cleanup').has('effect'));
  assert.equal(zoneNames('cleanup').has('module'), false);
  assert.ok(f.authorities('dismiss').has('dismiss-dependency'));
  assert.ok(f.authorities('producedEffect').has('effect'));
});

test('type-only ManagedComposition resolves only from the application public identity', (t) => {
  const f = fixture(t, `
    import type {ManagedComposition} from '@composable-svelte/core/application';
    let composition: ManagedComposition<any, any, any>;
  `, {types: true});
  assert.deepEqual(f.authorities('composition'), new Set(['composition']));
  assert.equal(lookupAnchor(APP, 'ManagedComposition')?.authority, 'composition');
  assert.equal(lookupAnchor(CORE, 'ManagedComposition'), null);
  assert.equal(lookupAnchor(`${CORE}/navigation`, 'ManagedComposition'), null);
});

test('application component anchors expose exact public child and attribute signatures', () => {
  const root = lookupAnchor(APP, 'ApplicationRoot');
  assert.equal(root?.kind, 'root-component');
  assert.equal(root.attributes?.definition?.role, 'definition');
  assert.deepEqual(root.attributes?.options?.dependencyPaths, [['dependencies']]);
  assert.deepEqual(root.attributes?.options?.dataPaths, [['initial']]);
  assert.deepEqual(root.childSnippet?.parameters, [{index: 0, result: 'app'}]);

  const host = lookupAnchor(APP, 'ApplicationHost');
  assert.equal(host?.kind, 'host-component');
  assert.equal(host.attributes?.app?.role, 'app-input');
  assert.deepEqual(host.childSnippet?.parameters, []);

  const views = lookupAnchor(APP, 'FeatureViews');
  assert.equal(views?.kind, 'feature-views-component');
  assert.equal(views.attributes?.store?.role, 'store-input');
  assert.equal(views.attributes?.definition?.role, 'view-definition-input');
  assert.deepEqual(views.childSnippet?.parameters, [{index: 0, result: 'views'}]);

  const outlet = lookupAnchor(APP, 'FeatureOutlet');
  assert.equal(outlet?.kind, 'feature-outlet-component');
  assert.equal(outlet.attributes?.view?.role, 'feature-handle-input');
  assert.equal(outlet.childSnippet, null);
});
