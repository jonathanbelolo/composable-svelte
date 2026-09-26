import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildGraph} from './graph.mjs';
import {parseSemanticModules} from './semantic-parse.mjs';

function setupTestProject(files) {
  const root = mkdtempSync(join(tmpdir(), 'sem-parse-test-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'test-app',
    version: '1.0.0',
    type: 'module',
    dependencies: {
      svelte: '5.57.0'
    }
  }, null, 2));

  const sveltePkgDir = join(root, 'node_modules', 'svelte');
  mkdirSync(sveltePkgDir, {recursive: true});
  writeFileSync(join(sveltePkgDir, 'package.json'), JSON.stringify({
    name: 'svelte',
    version: '5.57.0',
    exports: {
      '.': './src/index.js'
    }
  }, null, 2));

  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ESNext',
      module: 'ESNext'
    }
  }, null, 2));

  for (const [relPath, content] of Object.entries(files)) {
    const absPath = join(root, relPath);
    mkdirSync(join(absPath, '..'), {recursive: true});
    writeFileSync(absPath, content);
  }

  const opaquePackages = [{name: 'svelte', version: '5.57.0', provenance: 'registry'}];
  return {root, opaquePackages, cleanup: () => rmSync(root, {recursive: true, force: true})};
}

test('parseSemanticModules parses module scripts, instance scripts, and template expressions', () => {
  const svelteCode = `<script module lang="ts">
  export const MODULE_VAL = 42;
</script>
<script lang="ts">
  import {MODULE_VAL} from './module.svelte';
  let count = 0;
</script>
<main>
  <h1>{count + MODULE_VAL}</h1>
</main>`;

  const project = setupTestProject({
    'src/module.svelte': svelteCode
  });
  try {
    const graph = buildGraph({
      projectRoot: project.root,
      roots: ['src/module.svelte'],
      tsconfig: 'tsconfig.json',
      opaquePackages: project.opaquePackages
    });
    assert.equal(graph.complete, true);
    assert.equal(graph.errors.length, 0);

    const {modules, errors} = parseSemanticModules({projectRoot: project.root, graph});
    assert.equal(errors.length, 0);
    assert.equal(modules.length, 1);

    const mod = modules[0];
    assert.equal(mod.path, 'src/module.svelte');
    assert.equal(mod.kind, 'svelte');

    const moduleUnit = mod.units.find((u) => u.kind === 'module');
    const viewUnit = mod.units.find((u) => u.kind === 'view');
    const templateUnits = mod.units.filter((u) => u.kind === 'template');

    assert.ok(moduleUnit, 'module script unit must exist');
    assert.ok(viewUnit, 'instance script unit must exist');
    assert.equal(templateUnits.length, 1, 'template expression unit must exist');

    assert.equal(viewUnit.scope.parent, moduleUnit.scope);
  } finally {
    project.cleanup();
  }
});

test('preserves Unicode and UTF-16 script and template offsets', () => {
  const svelteCode = `<script lang="ts">
  const greeting = '👋 🌍';
</script>
<div>{greeting + ' ✨'}</div>`;

  const project = setupTestProject({
    'src/unicode.svelte': svelteCode
  });
  try {
    const graph = buildGraph({
      projectRoot: project.root,
      roots: ['src/unicode.svelte'],
      tsconfig: 'tsconfig.json',
      opaquePackages: project.opaquePackages
    });
    const {modules, errors} = parseSemanticModules({projectRoot: project.root, graph});
    assert.equal(errors.length, 0);
    const mod = modules[0];

    const tmplUnit = mod.units.find((u) => u.kind === 'template');
    assert.ok(tmplUnit);
    const exprSlice = mod.text.slice(tmplUnit.start, tmplUnit.end);
    assert.equal(exprSlice, "greeting + ' ✨'");

    const span = mod.span(tmplUnit.start, tmplUnit.end);
    assert.equal(span.start.line, 4);
    assert.equal(span.start.offset, tmplUnit.start);
    const expressionStatement = tmplUnit.sourceFile.statements[0];
    assert.deepEqual(tmplUnit.nodeSpan(expressionStatement.expression), span, 'synthetic parentheses clamp to the original expression');

    const viewUnit = mod.units.find((u) => u.kind === 'view');
    const declaration = viewUnit.sourceFile.statements[0];
    const declarationSpan = viewUnit.nodeSpan(declaration);
    assert.equal(mod.text.slice(declarationSpan.start.offset, declarationSpan.end.offset), "const greeting = '👋 🌍';");
  } finally {
    project.cleanup();
  }
});

test('nested shadow scopes and binding units for each and snippets', () => {
  const svelteCode = `<script>
  let items = [[1, 2], [3, 4]];
</script>
{#snippet row(num)}
  <span>{num}</span>
{/snippet}
{#each items as subItems, i}
  {#each subItems as item, j}
    {@render row(item)}
  {/each}
{/each}`;

  const project = setupTestProject({
    'src/nested.svelte': svelteCode
  });
  try {
    const graph = buildGraph({
      projectRoot: project.root,
      roots: ['src/nested.svelte'],
      tsconfig: 'tsconfig.json',
      opaquePackages: project.opaquePackages
    });
    const {modules, errors} = parseSemanticModules({projectRoot: project.root, graph});
    assert.equal(errors.length, 0);
    const mod = modules[0];

    const bindingUnits = mod.units.filter((u) => u.kind === 'binding');
    assert.ok(bindingUnits.length >= 4, 'should create binding units for snippet param, each context, and indices');

    const snippetMarker = mod.markers.find((m) => m.kind === 'snippet-declaration');
    assert.ok(snippetMarker);
    assert.equal(snippetMarker.name, 'row');
    assert.notEqual(snippetMarker.scope, snippetMarker.declarationScope);
    const binding = (name) => bindingUnits.find((u) => mod.text.slice(u.start, u.end) === name);
    assert.equal(binding('row').scope, snippetMarker.declarationScope);
    assert.equal(binding('num').scope, snippetMarker.scope);
    assert.equal(binding('subItems').scope.parent, mod.scopes[1]);
    assert.equal(binding('i').scope, binding('subItems').scope);
    assert.equal(binding('item').scope.parent, binding('subItems').scope);
    assert.equal(binding('j').scope, binding('item').scope);
    const numIdentifier = binding('num').sourceFile.statements[0].declarationList.declarations[0].name;
    assert.equal(mod.text.slice(binding('num').nodeSpan(numIdentifier).start.offset, binding('num').nodeSpan(numIdentifier).end.offset), 'num');
  } finally {
    project.cleanup();
  }
});

test('await branches and component let bindings use isolated child scopes', () => {
  const svelteCode = `<script>let promise;</script>
{#await promise}<p>pending</p>{:then value}<p>{value}</p>{:catch reason}<p>{reason}</p>{/await}
<Widget let:item><span>{item}</span></Widget>`;
  const project = setupTestProject({'src/scopes.svelte': svelteCode});
  try {
    const graph = buildGraph({projectRoot: project.root, roots: ['src/scopes.svelte'], tsconfig: 'tsconfig.json', opaquePackages: project.opaquePackages});
    const {modules, errors} = parseSemanticModules({projectRoot: project.root, graph});
    assert.equal(errors.length, 0);
    const mod = modules[0];
    const bindingUnits = mod.units.filter((u) => u.kind === 'binding');
    const binding = (name) => bindingUnits.find((u) => mod.text.slice(u.start, u.end) === name);
    assert.ok(binding('value'));
    assert.ok(binding('reason'));
    assert.ok(binding('item'));
    assert.equal(binding('value').scope.parent, mod.scopes[1]);
    assert.equal(binding('reason').scope.parent, mod.scopes[1]);
    assert.notEqual(binding('value').scope, binding('reason').scope);
    assert.equal(binding('item').scope.parent, mod.scopes[1]);
    const scopedExpressions = mod.units.filter((u) => u.kind === 'template' && ['value', 'reason', 'item'].includes(mod.text.slice(u.start, u.end)));
    for (const unit of scopedExpressions) assert.equal(unit.scope, binding(mod.text.slice(unit.start, unit.end)).scope);
    const awaitMarker = mod.markers.find((marker) => marker.kind === 'await-block');
    assert.ok(awaitMarker);
    assert.equal(awaitMarker.scope, mod.scopes[1]);
    assert.equal(awaitMarker.thenScope, binding('value').scope);
    assert.equal(awaitMarker.catchScope, binding('reason').scope);
    assert.equal(awaitMarker.pendingScope.parent, mod.scopes[1]);
    assert.equal(mod.text.slice(awaitMarker.expression.start, awaitMarker.expression.end), 'promise');
  } finally {
    project.cleanup();
  }
});

test('keyed each markers bind browser-named values and dollar indices before key evaluation', () => {
  const svelteCode = `<script>let history = [{id: 1}];</script>
{#each history as history, $index (history.id)}<p>{history.id}:{$index}</p>{/each}`;
  const project = setupTestProject({'src/keyed.svelte': svelteCode});
  try {
    const graph = buildGraph({projectRoot: project.root, roots: ['src/keyed.svelte'], tsconfig: 'tsconfig.json', opaquePackages: project.opaquePackages});
    const {modules, errors} = parseSemanticModules({projectRoot: project.root, graph});
    assert.equal(errors.length, 0);
    const mod = modules[0];
    const marker = mod.markers.find((candidate) => candidate.kind === 'each-block');
    assert.ok(marker);
    assert.equal(marker.scope, mod.scopes[1]);
    assert.equal(marker.bodyScope.parent, marker.scope);
    assert.equal(mod.text.slice(marker.expression.start, marker.expression.end), 'history');
    assert.equal(mod.text.slice(marker.context.start, marker.context.end), 'history');
    assert.equal(marker.index, '$index');
    assert.equal(mod.text.slice(marker.indexSpan.start.offset, marker.indexSpan.end.offset), '$index');
    assert.equal(mod.text.slice(marker.key.start, marker.key.end), 'history.id');
    const bindingUnits = mod.units.filter((unit) => unit.kind === 'binding');
    const historyBinding = bindingUnits.find((unit) => mod.text.slice(unit.start, unit.end) === 'history');
    const indexBinding = bindingUnits.find((unit) => mod.text.slice(unit.start, unit.end) === '$index');
    assert.equal(historyBinding.scope, marker.bodyScope);
    assert.equal(indexBinding.scope, marker.bodyScope);
    const keyUnit = mod.units.find((unit) => unit.kind === 'template' && mod.text.slice(unit.start, unit.end) === 'history.id');
    assert.equal(keyUnit.scope, marker.bodyScope, 'key sees the each binding, not the outer browser authority name');
  } finally {
    project.cleanup();
  }
});

test('branches separate local scopes and do not leak branch bindings', () => {
  const svelteCode = `<script>
  let cond = true;
</script>
{#if cond}
  {@const x = 10}
  <p>{x}</p>
{:else}
  {@const x = 20}
  <p>{x}</p>
{/if}`;

  const project = setupTestProject({
    'src/branch.svelte': svelteCode
  });
  try {
    const graph = buildGraph({
      projectRoot: project.root,
      roots: ['src/branch.svelte'],
      tsconfig: 'tsconfig.json',
      opaquePackages: project.opaquePackages
    });
    const {modules, errors} = parseSemanticModules({projectRoot: project.root, graph});
    assert.equal(errors.length, 0);
    const mod = modules[0];

    const constMarkers = mod.markers.filter((m) => m.kind === 'const-tag');
    assert.equal(constMarkers.length, 2);
    assert.notEqual(constMarkers[0].scope.id, constMarkers[1].scope.id, 'consequent and alternate scopes must be distinct');
  } finally {
    project.cleanup();
  }
});

test('component, options, bind, use, attach, and legacy and modern event markers', () => {
  const svelteCode = `<svelte:options runes={true} />
<script>
  let elem;
  function act(node) {}
  function onClick() {}
</script>
<Widget value={elem} />
<button {@attach act} bind:this={elem} use:act on:click={onClick} onclick={onClick}>click</button>`;

  const project = setupTestProject({
    'src/markers.svelte': svelteCode
  });
  try {
    const graph = buildGraph({
      projectRoot: project.root,
      roots: ['src/markers.svelte'],
      tsconfig: 'tsconfig.json',
      opaquePackages: project.opaquePackages
    });
    const {modules, errors} = parseSemanticModules({projectRoot: project.root, graph});
    assert.equal(errors.length, 0);
    const mod = modules[0];

    const options = mod.markers.find((m) => m.kind === 'svelte-options');
    assert.ok(options);
    assert.equal(options.scope, mod.scopes[0], 'compiler options belong to module scope');
    assert.ok(mod.markers.some((m) => m.kind === 'component' && m.name === 'Widget'));
    assert.ok(mod.markers.some((m) => m.kind === 'attach-tag'));
    assert.ok(mod.markers.some((m) => m.kind === 'bind-directive' && m.isThis));
    assert.ok(mod.markers.some((m) => m.kind === 'use-directive' && m.name === 'act'));
    assert.ok(mod.markers.some((m) => m.kind === 'event-directive' && m.name === 'click'));
    assert.ok(mod.markers.some((m) => m.kind === 'attribute' && m.name === 'onclick'));
  } finally {
    project.cleanup();
  }
});

test('fails on missing graph or unreadable/broken files', () => {
  const badGraph = parseSemanticModules({projectRoot: '/nowhere', graph: null});
  assert.equal(badGraph.errors.length, 1);
  assert.equal(badGraph.errors[0].code, 'incomplete-graph');

  const incompleteGraph = parseSemanticModules({projectRoot: '/nowhere', graph: {complete: false, modules: [], errors: []}});
  assert.equal(incompleteGraph.errors.length, 1);
  assert.equal(incompleteGraph.errors[0].code, 'incomplete-graph');

  const contradictoryGraph = parseSemanticModules({projectRoot: '/nowhere', graph: {complete: true, modules: [], errors: [{code: 'broken'}]}});
  assert.equal(contradictoryGraph.errors[0].code, 'incomplete-graph');
});

test('reports approved source that becomes unreadable or malformed', () => {
  const project = setupTestProject({'src/changing.svelte': '<p>{value}</p>'});
  try {
    const graph = buildGraph({
      projectRoot: project.root,
      roots: ['src/changing.svelte'],
      tsconfig: 'tsconfig.json',
      opaquePackages: project.opaquePackages
    });
    assert.equal(graph.complete, true);

    rmSync(join(project.root, 'src/changing.svelte'));
    const unreadable = parseSemanticModules({projectRoot: project.root, graph});
    assert.equal(unreadable.modules.length, 0);
    assert.equal(unreadable.errors[0].code, 'parse-error');
    assert.equal(unreadable.errors[0].path, 'src/changing.svelte');
    assert.equal(JSON.stringify(unreadable).includes(project.root), false);

    writeFileSync(join(project.root, 'src/changing.svelte'), '<p>{</p>');
    const malformed = parseSemanticModules({projectRoot: project.root, graph});
    assert.equal(malformed.modules.length, 0);
    assert.equal(malformed.errors[0].code, 'parse-error');
    assert.equal(malformed.errors[0].path, 'src/changing.svelte');
  } finally {
    project.cleanup();
  }
});

test('plain TypeScript and JavaScript keep direct module units and original offsets', () => {
  const project = setupTestProject({
    'src/plain.ts': 'export const value: number = 1;',
    'src/plain.js': 'export const other = 2;'
  });
  try {
    const graph = buildGraph({
      projectRoot: project.root,
      roots: ['src/plain.ts', 'src/plain.js'],
      tsconfig: 'tsconfig.json',
      opaquePackages: project.opaquePackages
    });
    const {modules, errors} = parseSemanticModules({projectRoot: project.root, graph});
    assert.equal(errors.length, 0);
    assert.equal(modules.length, 2);
    for (const mod of modules) {
      assert.equal(mod.units.length, 1);
      assert.equal(mod.units[0].kind, 'module');
      assert.equal(mod.units[0].base, 0);
      assert.equal(mod.units[0].start, 0);
      assert.equal(mod.units[0].end, mod.text.length);
      assert.equal(mod.units[0].scope, mod.scopes[0]);
    }
    assert.equal(modules.find((mod) => mod.kind === 'ts').units[0].sourceFile.fileName, 'unit.ts');
    assert.equal(modules.find((mod) => mod.kind === 'js').units[0].sourceFile.fileName, 'unit.js');
  } finally {
    project.cleanup();
  }
});
