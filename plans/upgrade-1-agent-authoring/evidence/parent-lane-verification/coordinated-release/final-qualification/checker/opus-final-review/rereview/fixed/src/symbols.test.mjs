import test from 'node:test';
import assert from 'node:assert/strict';
import {dirname, join} from 'node:path';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import ts from 'typescript';
import {buildGraph} from './graph.mjs';
import {parseSemanticModules} from './semantic-parse.mjs';
import {buildSymbols} from './symbols.mjs';

function fixture(t, files) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'symbols-test-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {'package.json': '{"name":"symbols-fixture","type":"module"}', 'tsconfig.json': '{}', ...files};
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(projectRoot, path)), {recursive: true});
    writeFileSync(join(projectRoot, path), text);
  }
  const graph = buildGraph({projectRoot, roots: Object.keys(files), tsconfig: 'tsconfig.json'});
  assert.deepEqual(graph.errors, []);
  const parsed = parseSemanticModules({projectRoot, graph});
  assert.deepEqual(parsed.errors, []);
  return {projectRoot, graph, modules: parsed.modules, symbols: buildSymbols({modules: parsed.modules})};
}

function identifierAt(module, fragment, occurrence = 0) {
  let offset = -1;
  for (let index = 0; index <= occurrence; index += 1) offset = module.text.indexOf(fragment, offset + 1);
  assert.ok(offset >= 0, fragment);
  const found = [];
  for (const unit of module.units) {
    const walk = (node) => {
      if (ts.isIdentifier(node) && unit.base + node.getStart(unit.sourceFile) === offset) found.push(node);
      ts.forEachChild(node, walk);
    };
    walk(unit.sourceFile);
  }
  assert.equal(found.length, 1, `one identifier at ${fragment}`);
  return found[0];
}

function binding(symbols, name) {
  const matches = symbols.bindings.filter((value) => value.name === name);
  assert.equal(matches.length, 1, `one binding named ${name}`);
  return matches[0];
}

test('destructured declarations retain paths, defaults, rest, initializers and assignments', (t) => {
  const source = `
const {a: renamed = fallback, nested: {leaf}, ...restObject} = source;
const [first = fallback2, , ...restArray] = values;
function f({p: param = paramDefault}, [head, ...tail], ...args) { return [param, head, tail, args]; }
({renamed, leaf} = next);
[first, ...restArray] = later;
`;
  const {symbols} = fixture(t, {'entry.ts': source});
  assert.deepEqual(symbols.errors, []);
  assert.deepEqual(binding(symbols, 'renamed').declarations[0].path, ['a']);
  assert.equal(binding(symbols, 'renamed').declarations[0].defaults.length, 1);
  assert.equal(binding(symbols, 'renamed').initializers.length, 1);
  assert.deepEqual(binding(symbols, 'leaf').declarations[0].path, ['nested', 'leaf']);
  assert.equal(binding(symbols, 'restObject').declarations[0].rest, true);
  assert.deepEqual(binding(symbols, 'first').declarations[0].path, ['0']);
  assert.equal(binding(symbols, 'first').declarations[0].defaults.length, 1);
  assert.equal(binding(symbols, 'restArray').declarations[0].rest, true);
  assert.deepEqual(binding(symbols, 'param').declarations[0].path, ['p']);
  assert.equal(binding(symbols, 'param').declarations[0].defaults.length, 1);
  assert.equal(binding(symbols, 'tail').declarations[0].rest, true);
  assert.equal(binding(symbols, 'args').declarations[0].rest, true);
  for (const name of ['renamed', 'leaf', 'first', 'restArray']) assert.equal(binding(symbols, name).assignments.length, 1, name);
});

test('declaration order, var, loops, catch, named expressions and class methods keep lexical identity', (t) => {
  const source = `
before; const before = 1;
function declared(param = before, ...rest) { { var hoisted = 1; let block = 2; } hoisted; block; return param + rest.length; }
const named = function self(q) { return q ? self(q - 1) : q; }; self;
class Box { method(m) { let local = m; return local; } get value() { return before; } set value(v) { before = v; } }
const Expr = class Inner { method() { return Inner; } }; Inner;
for (let item of items) { item; } item;
try {} catch ({message: caught}) { caught; } caught;
`;
  const {modules, symbols} = fixture(t, {'entry.ts': source});
  assert.deepEqual(symbols.errors, []);
  const module = modules[0];
  assert.equal(symbols.bindingOf(identifierAt(module, 'before; const')), binding(symbols, 'before'));
  assert.ok(symbols.bindingOf(identifierAt(module, 'hoisted;')));
  assert.equal(symbols.bindingOf(identifierAt(module, 'block; return')), null);
  assert.ok(symbols.bindingOf(identifierAt(module, 'self(q - 1)')));
  assert.equal(symbols.bindingOf(identifierAt(module, 'self;', 0)), null);
  assert.ok(symbols.bindingOf(identifierAt(module, 'Inner; }')));
  assert.equal(symbols.bindingOf(identifierAt(module, 'Inner;', 1)), null);
  assert.ok(symbols.bindingOf(identifierAt(module, 'item; }')));
  assert.equal(symbols.bindingOf(identifierAt(module, 'item;', 1)), null);
  assert.ok(symbols.bindingOf(identifierAt(module, 'caught; }')));
  assert.equal(symbols.bindingOf(identifierAt(module, 'caught;', 1)), null);
  assert.ok(symbols.functions.some(({node}) => ts.isFunctionExpression(node)));
  assert.ok(symbols.functions.some(({node}) => ts.isMethodDeclaration(node)));
  assert.ok(symbols.functions.some(({node}) => ts.isGetAccessorDeclaration(node)));
  assert.ok(symbols.functions.some(({node}) => ts.isSetAccessorDeclaration(node)));
  for (const unit of module.units) {
    const visit = (node) => {
      assert.ok(symbols.scopeOf(node), `scope for ${ts.SyntaxKind[node.kind]}`);
      assert.equal(symbols.unitOf(node), unit);
      ts.forEachChild(node, visit);
    };
    visit(unit.sourceFile);
  }
});

test('type-only declarations and imports remain distinguishable from runtime values', (t) => {
  const files = {
    'types.ts': 'export interface Remote {} export type Mixed = string; export const runtime = 1;',
    'entry.ts': `import type {Remote} from './types'; import {type Mixed, runtime as alias} from './types';
interface Local {} type Alias = Local; interface Merged {} const Merged = 1;
declare namespace Ambient { var hidden: number; namespace Nested { interface Value {} } }
const remote: Remote = {}; const mixed: Mixed = ''; const ambientValue: Ambient.Nested.Value = {}; alias; Merged; hidden;`
  };
  const {modules, symbols} = fixture(t, files);
  assert.deepEqual(symbols.errors, []);
  const entry = modules.find((module) => module.path === 'entry.ts');
  const imported = new Map(symbols.imports.filter(({unit}) => unit === entry.units[0]).map((item) => [item.binding.name, item]));
  assert.equal(imported.get('Remote').typeOnly, true);
  assert.equal(imported.get('Mixed').typeOnly, true);
  assert.equal(imported.get('alias').typeOnly, false);
  assert.equal(binding(symbols, 'Local').declarations.every(({typeOnly}) => typeOnly), true);
  assert.equal(binding(symbols, 'Alias').declarations.every(({typeOnly}) => typeOnly), true);
  const ambient = binding(symbols, 'Ambient');
  const nested = binding(symbols, 'Nested');
  const hidden = binding(symbols, 'hidden');
  assert.equal(ambient.declarations.every(({typeOnly}) => typeOnly), true);
  assert.equal(nested.declarations.every(({typeOnly}) => typeOnly), true);
  assert.equal(ambient.scope.kind, 'module');
  assert.equal(nested.scope.kind, 'ambient-namespace');
  assert.equal(hidden.scope.kind, 'ambient-namespace');
  assert.equal(hidden.declarations.every(({typeOnly}) => typeOnly), true);
  const merged = binding(symbols, 'Merged');
  assert.deepEqual(merged.declarations.map(({typeOnly}) => typeOnly), [true, false]);
  assert.equal(merged.initializers.length, 1);
  assert.equal(symbols.bindingOf(identifierAt(entry, 'alias;')), imported.get('alias').binding);
  assert.equal(symbols.bindingOf(identifierAt(entry, 'Ambient.Nested')), ambient);
  assert.equal(symbols.bindingOf(identifierAt(entry, 'hidden;')), null, 'ambient members do not leak to module runtime lookup');
});

test('fresh parses produce deterministic globally unique binding IDs', (t) => {
  const {projectRoot, graph} = fixture(t, {'b.ts': 'export const same = 2;', 'a.ts': 'export const same = 1; const local = same;'});
  const run = () => {
    const parsed = parseSemanticModules({projectRoot, graph});
    assert.deepEqual(parsed.errors, []);
    const symbols = buildSymbols({modules: parsed.modules});
    assert.deepEqual(symbols.errors, []);
    return symbols.bindings.map(({id}) => id);
  };
  const first = run();
  const second = run();
  assert.deepEqual(first, second);
  assert.equal(new Set(first).size, first.length);
  assert.ok(first.some((id) => id.startsWith('a.ts:binding:')));
  assert.ok(first.some((id) => id.startsWith('b.ts:binding:')));
});

test('implicit arguments, dynamic with and runtime namespaces fail while explicit names and ambient namespaces do not', (t) => {
  const files = {
    'entry.ts': `namespace Runtime { export const x = 1; } declare namespace Types { interface X {} } interface Shape { arguments: string }
import {arguments as importedArguments} from './named'; importedArguments;
function bad() { return arguments[0]; } function explicit(arguments: unknown[]) { return arguments[0]; }
const object = {arguments: 1}; const {arguments: renamed} = object; renamed; enum Keys { arguments }
class Named { get arguments() { return 1; } set arguments(value: number) {} }
arguments: while (condition) { if (condition) break arguments; continue arguments; }`,
    'named.ts': 'const value = 1; export {value as arguments};',
    'dynamic.js': 'with (object) { value; }'
  };
  const {symbols} = fixture(t, files);
  assert.deepEqual(symbols.errors.map(({construct}) => construct), ['with-statement', 'ts-namespace-value', 'arguments-object']);
});
