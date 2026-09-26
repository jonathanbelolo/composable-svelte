import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import ts from 'typescript';
import {buildGraph} from './graph.mjs';
import {parseSemanticModules} from './semantic-parse.mjs';
import {buildSymbols} from './symbols.mjs';
import {buildOrigins} from './semantic-origins.mjs';

function fixture(t, files) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'semantic-integration-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {'package.json': JSON.stringify({name: 'fixture', dependencies: {'@composable-svelte/core': '0.13.0-next.1'}}), 'tsconfig.json': '{}', 'node_modules/@composable-svelte/core/package.json': JSON.stringify({name: '@composable-svelte/core', version: '0.13.0-next.1', exports: {'.': './index.js'}}), ...files};
  for (const [name, value] of Object.entries(all)) {mkdirSync(dirname(join(projectRoot, name)), {recursive: true}); writeFileSync(join(projectRoot, name), value);}
  const graph = buildGraph({projectRoot, roots: Object.keys(files), tsconfig: 'tsconfig.json', opaquePackages: [{name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'}]});
  assert.deepEqual(graph.errors, []);
  const parsed = parseSemanticModules({projectRoot, graph});
  assert.deepEqual(parsed.errors, []);
  const symbols = buildSymbols({modules: parsed.modules});
  assert.deepEqual(symbols.errors, []);
  return {modules: parsed.modules, symbols, origins: buildOrigins({modules: parsed.modules, symbols, graph})};
}
function identifierAt(module, fragment) {
  const offset = module.text.indexOf(fragment);
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

test('local block, var and parameter scopes preserve shadowing and globals', (t) => {
  const c = fixture(t, {'entry.ts': 'function f(history: unknown) { { var location = 1; let document = 2; document; } location; history.back(); } document.title; history.go();'});
  const m = c.modules[0];
  assert.ok(c.symbols.bindingOf(identifierAt(m, 'history.back')));
  assert.equal(c.symbols.bindingOf(identifierAt(m, 'history.go')), null);
  assert.ok(c.symbols.bindingOf(identifierAt(m, 'location;')));
  assert.equal(c.symbols.bindingOf(identifierAt(m, 'document.title')), null);
});

test('for-of and catch bindings do not leak into subsequent statements', (t) => {
  const c = fixture(t, {'entry.ts': 'for (const history of entries) { history.title; } history.back(); try {} catch ({message: location}) { location.trim(); } location.assign("/");'});
  const m = c.modules[0];
  assert.ok(c.symbols.bindingOf(identifierAt(m, 'history.title')));
  assert.equal(c.symbols.bindingOf(identifierAt(m, 'history.back')), null);
  assert.ok(c.symbols.bindingOf(identifierAt(m, 'location.trim')));
  assert.equal(c.symbols.bindingOf(identifierAt(m, 'location.assign')), null);
});

test('bindings in different modules have distinct identities and resolve barrels', (t) => {
  const c = fixture(t, {'a.ts': 'export const history = {title: "a"};', 'b.ts': 'export const history = {title: "b"};', 'barrel.ts': 'export {history as a} from "./a"; export {history as b} from "./b";', 'entry.ts': 'import {a,b} from "./barrel"; a.title; b.title;'});
  assert.deepEqual(c.origins.errors, []);
  const a = c.origins.resolveExport('barrel.ts', 'a')[0];
  const b = c.origins.resolveExport('barrel.ts', 'b')[0];
  assert.equal(a.kind, 'binding'); assert.equal(b.kind, 'binding');
  assert.notEqual(a.binding.id, b.binding.id);
});

test('imported aliases retain core origin while nested same-name functions stay local', (t) => {
  const c = fixture(t, {'entry.ts': 'import {Effect as E} from "@composable-svelte/core"; E.none(); function f(E: {none():void}) { E.none(); }'});
  const m = c.modules[0];
  const imported = c.symbols.bindingOf(identifierAt(m, 'E.none(); function'));
  const shadow = c.symbols.bindingOf(identifierAt(m, 'E.none(); }'));
  assert.notEqual(imported, shadow);
  assert.deepEqual(c.origins.resolveBinding(imported), [{kind: 'external', specifier: '@composable-svelte/core', name: 'Effect'}]);
  assert.equal(c.origins.resolveBinding(shadow)[0].kind, 'binding');
});

test('Svelte keyed each expression uses item scope, fallback and sibling use outer scope', (t) => {
  const c = fixture(t, {'App.svelte': '<script>let entries = [];</script>{#each entries as history (history.id)}{history.title}{:else}{history.state}{/each}{history.length}'});
  const m = c.modules[0];
  const key = c.symbols.bindingOf(identifierAt(m, 'history.id'));
  assert.ok(key);
  assert.equal(c.symbols.bindingOf(identifierAt(m, 'history.title')), key);
  assert.equal(c.symbols.bindingOf(identifierAt(m, 'history.state')), null);
  assert.equal(c.symbols.bindingOf(identifierAt(m, 'history.length')), null);
});

test('Svelte snippet parameters stay local and snippet declarations are fragment-visible', (t) => {
  const c = fixture(t, {'App.svelte': '{@render content({title:"x"})}{#snippet content(history)}{history.title}{/snippet}{history.state}'});
  const m = c.modules[0];
  assert.ok(c.symbols.bindingOf(identifierAt(m, 'content({')));
  assert.ok(c.symbols.bindingOf(identifierAt(m, 'history.title')));
  assert.equal(c.symbols.bindingOf(identifierAt(m, 'history.state')), null);
});

test('Svelte module references cannot acquire instance-local browser shadows', (t) => {
  const c = fixture(t, {'App.svelte': '<script module>export const x = history.state;</script><script>let history = {title:"local"};</script>{history.title}'});
  const m = c.modules[0];
  assert.equal(c.symbols.bindingOf(identifierAt(m, 'history.state')), null);
  assert.ok(c.symbols.bindingOf(identifierAt(m, 'history.title')));
});
