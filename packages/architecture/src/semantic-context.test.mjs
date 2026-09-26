import test from 'node:test';
import assert from 'node:assert/strict';
import {dirname, join} from 'node:path';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import ts from 'typescript';
import {buildGraph} from './graph.mjs';
import {buildSemanticContext} from './semantic-context.mjs';

function fixture(t, files) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'semantic-context-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {'package.json': '{"name":"fixture","type":"module"}', 'tsconfig.json': '{}', ...files};
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(projectRoot, path)), {recursive: true});
    writeFileSync(join(projectRoot, path), text);
  }
  const graph = buildGraph({projectRoot, roots: Object.keys(files), tsconfig: 'tsconfig.json'});
  assert.deepEqual(graph.errors, []);
  const context = buildSemanticContext({projectRoot, graph});
  assert.equal(context.complete, true);
  assert.deepEqual(context.errors, []);
  return context;
}

function identifierAt(context, modulePath, fragment) {
  const module = context.modules.find((item) => item.path === modulePath);
  assert.ok(module);
  const offset = module.text.indexOf(fragment);
  assert.ok(offset >= 0, fragment);
  const found = context.nodes.filter(({node, unit}) =>
    ts.isIdentifier(node) && unit.base + node.getStart(unit.sourceFile) === offset);
  assert.equal(found.length, 1, `one identifier at ${fragment}`);
  return found[0].node;
}

test('context joins lexical identity, runtime classification, functions, classes, and source spans', (t) => {
  const context = fixture(t, {'entry.ts': `
type Model = { value: number };
const outer = 1;
class Box { method(parameter: Model) { const local = parameter.value; return outer + local; } }
`});
  const outerUse = identifierAt(context, 'entry.ts', 'outer +');
  const outerRecord = context.info(outerUse);
  assert.equal(outerRecord.runtime, true);
  assert.ok(outerRecord.function);
  assert.ok(outerRecord.class);
  assert.equal(context.functions.get(outerRecord.function.id), outerRecord.function);
  assert.equal(context.classes.get(outerRecord.class.id), outerRecord.class);
  assert.equal(context.isReference(outerUse), true);
  assert.equal(context.resolveName(context.symbols.scopeOf(outerUse), 'outer'), context.symbols.bindingOf(outerUse));
  assert.equal(context.span(outerUse).start.offset, context.modules[0].text.indexOf('outer +'));

  const modelUse = identifierAt(context, 'entry.ts', 'Model)');
  assert.equal(context.info(modelUse).runtime, false);
  assert.equal(context.isReference(modelUse), false);
  assert.throws(() => context.span(ts.factory.createIdentifier('foreign')), /outside the semantic context/);
});

test('reference classification distinguishes declarations and property labels from computed runtime keys', (t) => {
  const context = fixture(t, {'entry.ts': `
const key = 'field';
const value = 1;
const object = {[key]: value, plain: value, value};
class Box { [key]() { return value; } }
`});
  assert.equal(context.isReference(identifierAt(context, 'entry.ts', 'key =')), false);
  assert.equal(context.isReference(identifierAt(context, 'entry.ts', 'plain:')), false);
  assert.equal(context.isReference(identifierAt(context, 'entry.ts', 'value};')), true);
  assert.equal(context.isReference(identifierAt(context, 'entry.ts', 'key]: value')), true,
    'a computed object key reads the key binding');
  assert.equal(context.isReference(identifierAt(context, 'entry.ts', 'key]()')), true,
    'a computed class member name reads the key binding');
});
