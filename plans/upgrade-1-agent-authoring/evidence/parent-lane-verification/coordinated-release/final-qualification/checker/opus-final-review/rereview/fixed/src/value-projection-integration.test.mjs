import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {createValueDomain} from './taint-values.mjs';
import {createAuthorityValues} from './authority-values.mjs';
import {createExpressionEvaluator} from './expression-values.mjs';

function first(value) { assert.equal(value.size, 1); return [...value][0]; }
function expression(code) {
  const source = ts.createSourceFile('fixture.ts', `(${code})`, ts.ScriptTarget.Latest, true);
  assert.deepEqual(source.parseDiagnostics, []);
  return source.statements[0].expression;
}
function harness() {
  const domain = createValueDomain();
  const authority = createAuthorityValues(domain);
  const heaps = new Map(); let next = 0;
  const identifiers = new Map([
    ['window', authority.global('window')], ['document', authority.global('document')],
    ['collection', authority.authority('element-collection')],
    ['core', authority.external('@composable-svelte/core', '*')],
    ['state', domain.atom('state', 'root')], ['local', domain.atom('local', 'fresh')],
    ['key', domain.atom('local', 'key')]
  ]);
  const evaluator = createExpressionEvaluator({
    domain,
    identifier: (node) => identifiers.get(node.text) ?? authority.global(node.text),
    functionValue: (node) => domain.atom('function', String(node.pos)),
    classValue: (node) => domain.atom('class', String(node.pos)),
    thisValue: () => domain.empty(),
    allocate(node, options) { if (!heaps.has(node)) heaps.set(node, `heap-${++next}`); return domain.allocate(heaps.get(node), options); },
    property: (receiver, key) => authority.member(receiver, key),
    invoke: () => domain.empty(), assign() {}, unsupported() {}
  });
  return {domain, authority, evaluator};
}

test('opaque spreads project browser collections, document/window members, and core namespace exports', () => {
  const {domain, authority, evaluator} = harness();
  const array = evaluator(expression('[...collection]'));
  assert.deepEqual(authority.member(array, '0'), authority.authority('element'));
  assert.deepEqual(authority.member(array, '*'), authority.authority('element'));

  const documentCopy = evaluator(expression('({...document})'));
  assert.deepEqual(authority.member(documentCopy, 'body'), authority.authority('element'));
  assert.deepEqual(authority.member(documentCopy, 'defaultView'), authority.authority('window'));
  const windowCopy = evaluator(expression('({...window})'));
  assert.deepEqual(authority.member(windowCopy, 'document'), authority.authority('document'));

  const namespaceCopy = evaluator(expression('({...core})'));
  const effect = authority.member(namespaceCopy, 'Effect');
  assert.deepEqual(authority.externalParts(first(effect)), {specifier: '@composable-svelte/core', imported: 'Effect', path: []});
  assert.equal(authority.anchor(first(effect)).kind, 'effect');
  assert.equal(domain.describe(first(effect)).kind, 'external');
});

test('dynamic projection is explicit unknown-member and finite widening never becomes clean or anchored', () => {
  const {domain, authority, evaluator} = harness();
  const wildcard = evaluator(expression('core[key]'));
  assert.equal(domain.describe(first(wildcard)).kind, 'unknown-member');
  assert.equal(authority.anchor(first(wildcard)), null);
  assert.deepEqual(authority.member(wildcard, 'anything'), wildcard);

  let external = authority.member(authority.external('@composable-svelte/core', 'Effect'), 'run');
  external = authority.member(external, 'result');
  external = authority.member(external, 'deeper');
  assert.equal(domain.describe(first(external)).kind, 'unknown-member');

  let global = authority.member(authority.global('Object'), 'assign');
  global = authority.member(global, 'result');
  global = authority.member(global, 'deeper');
  assert.equal(domain.describe(first(global)).kind, 'unknown-member');

  let control = authority.member(authority.member(authority.global('history'), 'pushState'), 'call');
  control = authority.member(control, 'apply');
  control = authority.member(control, 'bind');
  assert.equal(domain.describe(first(control)).kind, 'unknown-member');
});

test('bare listeners equal window listeners and DOM traversal retains the correct authority', () => {
  const {authority} = harness();
  assert.deepEqual(authority.global('addEventListener'), authority.member(authority.global('window'), 'addEventListener'));
  const body = authority.member(authority.global('document'), 'body');
  assert.deepEqual(authority.member(body, 'ownerDocument'), authority.global('document'));
  const children = authority.member(body, 'children');
  assert.deepEqual(authority.member(children, '0'), authority.authority('element'));
  assert.deepEqual(authority.member(authority.member(body, 'parentElement'), 'nextElementSibling'), authority.authority('element'));
});

test('later static object keys shadow spread fields while fresh nested copies retain untouched state descendants', () => {
  const {domain, authority, evaluator} = harness();
  const copy = evaluator(expression('({...state, nested: {...state.nested, fresh: local}})'));
  const nested = authority.member(copy, 'nested');
  assert.deepEqual(authority.member(nested, 'fresh'), domain.atom('local', 'fresh'));
  assert.deepEqual(authority.member(nested, 'untouched'), domain.atom('state', 'root'));
  assert.deepEqual(authority.member(copy, 'untouched'), domain.atom('state', 'root'));
  assert.equal(authority.member(copy, 'nested').has(first(domain.atom('state', 'root'))), false,
    'the later static nested field shadows the earlier spread field');
});

test('structured external identities distinguish literal export names and only anchor declared member paths', () => {
  const {domain, authority} = harness();
  const literalExport = authority.external('@composable-svelte/core', 'Effect.run');
  const effect = authority.external('@composable-svelte/core', 'Effect');
  const projectedRun = authority.member(effect, 'run');
  assert.notDeepEqual(literalExport, projectedRun);
  assert.deepEqual(authority.externalParts(first(literalExport)), {
    specifier: '@composable-svelte/core', imported: 'Effect.run', path: []
  });
  assert.deepEqual(authority.externalParts(first(projectedRun)), {
    specifier: '@composable-svelte/core', imported: 'Effect', path: ['run']
  });
  assert.deepEqual(authority.anchor(first(projectedRun)), {
    kind: 'effect-constructor', result: 'effect', deferredArguments: [0]
  });
  assert.equal(authority.anchor(first(authority.member(effect, 'unknown'))), null);
  assert.equal(authority.anchor(first(literalExport)), null);
  assert.equal(authority.anchor(first(effect)).kind, 'effect');
  assert.equal(domain.describe(first(projectedRun)).kind, 'external');
});
