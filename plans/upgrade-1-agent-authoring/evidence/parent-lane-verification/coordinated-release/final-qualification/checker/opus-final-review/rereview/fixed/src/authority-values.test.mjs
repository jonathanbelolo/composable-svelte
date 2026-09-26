import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createValueDomain} from './taint-values.mjs';
import {createAuthorityValues} from './authority-values.mjs';
function setup() {const d = createValueDomain(); return {d, v: createAuthorityValues(d)};}
function first(value) {assert.equal(value.size, 1); return [...value][0];}

test('browser aliases and DOM handles retain authority; ordinary projections do not', () => {
  const {d, v} = setup();
  for (const name of ['window', 'globalThis', 'self', 'top', 'parent', 'frames']) {
    assert.deepEqual(v.member(v.global(name), 'history'), v.global('history'));
  }
  assert.deepEqual(v.member(v.global('document'), 'defaultView'), v.global('window'));
  assert.deepEqual(v.member(v.global('document'), 'body'), v.authority('element'));
  assert.equal(v.member(v.authority('element'), 'style').size, 0);
  assert.equal(v.member(v.global('history'), 'state').size, 0);
  assert.deepEqual(d.describe(first(v.member(v.global('navigator'), 'clipboard'))), {kind: 'global', id: 'navigator.clipboard'});
});

test('store dispatch and subscriptions remain distinct from plain state reads', () => {
  const {d, v} = setup();
  const store = v.member(v.authority('app'), 'store');
  assert.deepEqual(store, v.authority('store'));
  assert.equal(v.member(store, 'state').size, 0);
  assert.equal(v.member(v.authority('app'), 'views').size, 0);
  assert.deepEqual(v.member(v.authority('views'), 'item'), v.authority('feature-handle'));
  assert.deepEqual(d.describe(first(v.member(store, 'dispatch'))), {kind: 'dispatch', id: 'store'});
  assert.deepEqual(v.methodParts(first(v.member(store, 'subscribe'))), [first(store), 'subscribe']);
  const local = d.allocate('local');
  assert.equal(v.member(local, 'subscribe').size, 0);
  assert.equal(v.member(local, 'animate').size, 0);
});

test('actual external identity recognizes anchors, arbitrary matching local names do not', () => {
  const {d, v} = setup();
  assert.equal(v.anchor(first(v.external('@composable-svelte/core', 'Effect'))).kind, 'effect');
  assert.equal(v.anchor(first(v.external('unrelated', 'Effect'))), null);
  assert.equal(v.anchor(first(d.atom('function', 'Effect'))), null);
  const effectRun = v.member(v.external('@composable-svelte/core', 'Effect'), 'run');
  assert.deepEqual(v.methodParts(first(v.member(effectRun, 'call'))), [first(effectRun), 'call']);
  const ns = v.external('@composable-svelte/core/application', '*');
  assert.equal(v.anchor(first(v.member(ns, 'defineApplication'))).kind, 'application-factory');
});

test('extracted browser methods and their invocation controls keep the original receiver', () => {
  const {v} = setup();
  const h = v.global('history');
  const push = v.member(h, 'pushState');
  assert.deepEqual(v.methodParts(first(push)), [first(h), 'pushState']);
  for (const name of ['call', 'apply', 'bind']) assert.deepEqual(v.methodParts(first(v.member(push, name))), [first(push), name]);
});

test('local heap contents and shallow state descendants survive member projection', () => {
  const {d, v} = setup();
  const h = d.allocate('h');
  d.write(h, 'history', v.global('history'));
  assert.deepEqual(v.member(h, 'history'), v.global('history'));
  assert.equal(v.member(h, 'location').size, 0);
  const copy = d.allocate('copy');
  const state = d.atom('state', 'reducer');
  d.spread(copy, state);
  assert.deepEqual(v.member(copy, 'items'), state);
});
