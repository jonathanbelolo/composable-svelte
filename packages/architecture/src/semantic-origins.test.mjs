import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {buildOrigins} from './semantic-origins.mjs';

// Isolated origin-resolution tests: a small explicit symbol fixture, not a substitute
// for the later parser/symbol/taint integration tests.
function fixture(files, edges) {
  const imports = [];
  const modules = Object.entries(files).map(([path, text]) => {
    const scope = {id: `${path}:root`, parent: null, bindings: new Map()};
    const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const unit = {kind: 'module', sourceFile, base: 0, scope, start: 0, end: text.length};
    const add = (name) => {
      if (!scope.bindings.has(name)) scope.bindings.set(name, {id: `${path}:${name}`, name, scope});
      return scope.bindings.get(name);
    };
    for (const node of sourceFile.statements) {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        const record = (name, imported) => imports.push({binding: add(name.text), imported, specifier: node.moduleSpecifier.text, unit, node});
        if (clause?.name) record(clause.name, 'default');
        if (clause?.namedBindings) {
          if (ts.isNamespaceImport(clause.namedBindings)) record(clause.namedBindings.name, '*');
          else for (const item of clause.namedBindings.elements) record(item.name, (item.propertyName ?? item.name).text);
        }
      } else if (ts.isVariableStatement(node)) {
        for (const item of node.declarationList.declarations) if (ts.isIdentifier(item.name)) add(item.name.text);
      } else if (node.name && ts.isIdentifier(node.name)) add(node.name.text);
    }
    const locate = (offset) => {
      const prefix = text.slice(0, offset);
      return {offset, line: prefix.split('\n').length, column: offset - prefix.lastIndexOf('\n')};
    };
    return {path, text, kind: 'ts', units: [unit], scopes: [scope], span: (start, end) => ({start: locate(start), end: locate(end)})};
  });
  const graph = {modules: modules.map(({path}) => ({path, edges: Object.entries(edges[path] ?? {}).map(([specifier, target]) => ({specifier, target}))}))};
  const symbols = {imports, scopeOf: () => null};
  return {modules, ...buildOrigins({modules, symbols, graph})};
}
const local = (path) => ({type: 'module', path});
const pkg = (specifier) => ({type: 'package', specifier});
const origin = (specifier, name) => ({kind: 'external', specifier, name});

test('named aliases preserve exact external import identities', () => {
  const c = fixture({'a.ts': "import { Effect as E } from '@composable-svelte/core'; export {E};"}, {'a.ts': {'@composable-svelte/core': pkg('@composable-svelte/core')}});
  assert.deepEqual(c.errors, []);
  assert.deepEqual(c.resolveExport('a.ts', 'E'), [origin('@composable-svelte/core', 'Effect')]);
});

test('local barrels and cycles preserve origins without recursion loss', () => {
  const c = fixture({
    'a.ts': "export * from './b'; export {Effect as run} from '@composable-svelte/core';",
    'b.ts': "export * from './a';",
    'c.ts': "import {run} from './b'; export {run};"
  }, {'a.ts': {'./b': local('b.ts'), '@composable-svelte/core': pkg('@composable-svelte/core')}, 'b.ts': {'./a': local('a.ts')}, 'c.ts': {'./b': local('b.ts')}});
  assert.deepEqual(c.errors, []);
  assert.deepEqual(c.resolveExport('c.ts', 'run'), [origin('@composable-svelte/core', 'Effect')]);
});

test('namespace aliases retain inspected module identity', () => {
  const c = fixture({'a.ts': 'export function go() {}', 'b.ts': "export * as navigation from './a';", 'c.ts': "import {navigation} from './b'; export {navigation};"}, {'b.ts': {'./a': local('a.ts')}, 'c.ts': {'./b': local('b.ts')}});
  assert.deepEqual(c.errors, []);
  assert.deepEqual(c.resolveExport('c.ts', 'navigation'), [{kind: 'namespace', path: 'a.ts'}]);
  assert.equal(c.resolveExport('a.ts', 'go')[0].binding.id, 'a.ts:go');
});

test('default expressions and anonymous declarations keep executable nodes', () => {
  for (const text of ['export default () => history.back();', 'export default function() {history.back();}']) {
    const c = fixture({'a.ts': text}, {});
    const [value] = c.resolveExport('a.ts', 'default');
    assert.equal(value.kind, 'expression');
    assert.match(value.node.getText(value.unit.sourceFile), /history.back/);
    assert.deepEqual(c.errors, []);
  }
});

test('ambiguous star origins fail while a diamond sharing one origin stays valid', () => {
  for (const same of [false, true]) {
    const c = fixture({'a.ts': 'export const x = 1;', 'b.ts': same ? "export {x} from './a';" : 'export const x = 2;', 'barrel.ts': "export * from './a'; export * from './b';", 'entry.ts': "import {x} from './barrel';"}, {'b.ts': {'./a': local('a.ts')}, 'barrel.ts': {'./a': local('a.ts'), './b': local('b.ts')}, 'entry.ts': {'./barrel': local('barrel.ts')}});
    assert.deepEqual(c.errors.map((e) => e.construct), same ? [] : ['ambiguous-star-export']);
  }
});

test('explicit exports override ambiguous stars; stars do not export default', () => {
  const c = fixture({'a.ts': 'export const x = 1; export default x;', 'b.ts': 'export const x = 2;', 'c.ts': "export * from './a'; export * from './b'; export {x} from './a';"}, {'c.ts': {'./a': local('a.ts'), './b': local('b.ts')}});
  assert.equal(c.resolveExport('c.ts', 'x')[0].binding.id, 'a.ts:x');
  assert.deepEqual(c.resolveExport('c.ts', 'default'), []);
  assert.deepEqual(c.errors, []);
});

test('opaque stars and unresolved local imports cannot disappear into clean analysis', () => {
  const c = fixture({'a.ts': "export * from 'opaque';", 'b.ts': "import {missing} from './a';"}, {'a.ts': {opaque: pkg('opaque')}, 'b.ts': {'./a': local('a.ts')}});
  assert.deepEqual(c.errors.map((e) => e.construct), ['star-package-reexport', 'unresolved-import-origin']);
  assert.ok(c.errors.every((e) => e.span.end.offset > e.span.start.offset));
});

test('type imports keep their core origin for reducer annotation recognition', () => {
  const c = fixture({'a.ts': "import type {Reducer as R} from '@composable-svelte/core'; export type {R};"}, {'a.ts': {'@composable-svelte/core': pkg('@composable-svelte/core')}});
  assert.deepEqual(c.resolveExport('a.ts', 'R'), [origin('@composable-svelte/core', 'Reducer')]);
  assert.deepEqual(c.errors, []);
});
