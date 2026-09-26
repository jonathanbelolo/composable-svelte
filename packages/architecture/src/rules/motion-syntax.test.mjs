import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test, {after, before} from 'node:test';
import {buildGraph} from '../graph.mjs';
import {evaluateMotionSyntax} from './motion-syntax.mjs';

const OPAQUE_PACKAGES = [{name: 'svelte', version: '5.57.0', provenance: 'registry'}];

function setupProject(files) {
  const root = mkdtempSync(join(tmpdir(), 'motion-test-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'test-fixture',
    dependencies: {svelte: '5.57.0'}
  }, null, 2));
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {baseUrl: '.'}
  }, null, 2));

  const sveltePkg = join(root, 'node_modules', 'svelte');
  mkdirSync(sveltePkg, {recursive: true});
  writeFileSync(join(sveltePkg, 'package.json'), JSON.stringify({
    name: 'svelte',
    version: '5.57.0',
    exports: {
      '.': './index.js',
      './transition': './transition.js',
      './animate': './animate.js',
      './motion': './motion.js',
      './easing': './easing.js'
    }
  }, null, 2));
  for (const f of ['index.js', 'transition.js', 'animate.js', 'motion.js', 'easing.js']) {
    writeFileSync(join(sveltePkg, f), 'export {};');
  }

  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(root, relPath);
    mkdirSync(join(fullPath, '..'), {recursive: true});
    writeFileSync(fullPath, content);
  }
  return root;
}

test('motion syntax rule test suite', async (t) => {
  let root;
  const files = {
    'src/runtime-alias.ts': `import { fade as customFade } from 'svelte/transition';\nexport const x = customFade;`,
    'src/reexport.ts': `export { tweened } from 'svelte/motion';`,
    'src/dynamic-ts.ts': `export async function load() { return import('svelte/animate'); }`,
    'src/type-only.ts': `import type { TransitionConfig } from 'svelte/transition';\nexport type { Tweened } from 'svelte/motion';\nexport const ok = 1;`,
    'src/allowed-easing.ts': `import { cubicOut } from 'svelte/easing';\nexport const ease = cubicOut;`,
    'src/domain-animate.ts': `const obj = { animate() { return 42; } };\nexport const res = obj.animate();`,
    'src/directives.svelte': `<script>let items = [{id: 1}];</script>\n<div transition:fade></div>\n<div in:fly></div>\n<div out:slide></div>\n{#each items as item (item.id)}\n  <div animate:flip></div>\n{/each}`,
    'src/dynamic-template.svelte': `<script>export let p;</script>\n{#await import('svelte/motion') then m}<div>{m}</div>{/await}`,
    'src/allowed-css.svelte': `<style>.box { transition: opacity 0.2s; }</style>\n<div style="transition: all 0.3s">CSS</div>`,
    'src/parse-error.svelte': `<div transition: >`
  };

  before(() => {
    root = setupProject(files);
  });

  after(() => {
    if (root) rmSync(root, {recursive: true, force: true});
  });

  const runCheck = (rootFile) => {
    const graph = buildGraph({projectRoot: root, roots: [rootFile], tsconfig: 'tsconfig.json', opaquePackages: OPAQUE_PACKAGES});
    return evaluateMotionSyntax({projectRoot: root, graph});
  };

  await t.test('detects runtime import alias in TS', () => {
    const res = runCheck('src/runtime-alias.ts');
    assert.equal(res.errors.length, 0);
    assert.equal(res.findings.length, 1);
    assert.equal(res.findings[0].detector, 'svelte-motion-import');
    assert.equal(res.findings[0].rule, 'motion/no-competing-playback');
    assert.equal(res.findings[0].path, 'src/runtime-alias.ts');
    assert.equal(res.findings[0].span.start.line, 1);
    const span = res.findings[0].span;
    assert.equal(files['src/runtime-alias.ts'].slice(span.start.offset, span.end.offset), "'svelte/transition'");
    assert.equal(res.findings[0].replacement, 'managed defineMotionRecipe/useMotion/useMotionGroup');
    assert.equal(res.findings[0].docs, 'application-motion.md');
  });

  await t.test('detects re-export of motion package', () => {
    const res = runCheck('src/reexport.ts');
    assert.equal(res.errors.length, 0);
    assert.equal(res.findings.length, 1);
    assert.equal(res.findings[0].detector, 'svelte-motion-import');
    assert.equal(res.findings[0].path, 'src/reexport.ts');
  });

  await t.test('detects literal dynamic import in TS', () => {
    const res = runCheck('src/dynamic-ts.ts');
    assert.equal(res.errors.length, 0);
    assert.equal(res.findings.length, 1);
    assert.equal(res.findings[0].detector, 'svelte-motion-import');
  });

  await t.test('skips type-only import and export neighbors', () => {
    const res = runCheck('src/type-only.ts');
    assert.equal(res.errors.length, 0);
    assert.equal(res.findings.length, 0);
  });

  await t.test('allows pure svelte/easing', () => {
    const res = runCheck('src/allowed-easing.ts');
    assert.equal(res.errors.length, 0);
    assert.equal(res.findings.length, 0);
  });

  await t.test('allows domain object .animate call', () => {
    const res = runCheck('src/domain-animate.ts');
    assert.equal(res.errors.length, 0);
    assert.equal(res.findings.length, 0);
  });

  await t.test('detects transition, in, out and animate directives with exact spans', () => {
    const res = runCheck('src/directives.svelte');
    assert.equal(res.errors.length, 0);
    assert.equal(res.findings.length, 4);
    assert.deepEqual(res.findings.map(({span}) => files['src/directives.svelte'].slice(span.start.offset, span.end.offset)),
      ['transition:fade', 'in:fly', 'out:slide', 'animate:flip']);
    for (const f of res.findings) {
      assert.equal(f.detector, 'transition-directive');
      assert.equal(f.path, 'src/directives.svelte');
      assert.ok(f.span.start.line >= 2 && f.span.start.line <= 6);
      assert.ok(f.span.start.offset < f.span.end.offset);
    }
  });

  await t.test('detects literal dynamic import in Svelte template', () => {
    const res = runCheck('src/dynamic-template.svelte');
    assert.equal(res.errors.length, 0);
    assert.equal(res.findings.length, 1);
    assert.equal(res.findings[0].detector, 'svelte-motion-import');
    assert.equal(res.findings[0].path, 'src/dynamic-template.svelte');
    const span = res.findings[0].span;
    assert.equal(files['src/dynamic-template.svelte'].slice(span.start.offset, span.end.offset), "'svelte/motion'");
  });

  await t.test('allows ordinary CSS transition in style tag and attribute', () => {
    const res = runCheck('src/allowed-css.svelte');
    assert.equal(res.errors.length, 0);
    assert.equal(res.findings.length, 0);
  });

  await t.test('deterministic repeat check', () => {
    const res1 = runCheck('src/directives.svelte');
    const res2 = runCheck('src/directives.svelte');
    assert.deepEqual(res1, res2);
  });

  await t.test('parse failure is never an empty clean pass', () => {
    const res = runCheck('src/parse-error.svelte');
    assert.ok(res.errors.length > 0);
    assert.equal(res.errors[0].path, 'src/parse-error.svelte');
  });

  await t.test('missing or incomplete graphs cannot produce a clean result', () => {
    for (const graph of [undefined, {modules: [], errors: [], complete: false}]) {
      const result = evaluateMotionSyntax({projectRoot: root, graph});
      assert.equal(result.errors[0].code, 'incomplete-graph');
    }
  });

  await t.test('source becoming unreadable is an error without absolute path leakage', () => {
    const path = 'src/allowed-css.svelte';
    const graph = buildGraph({projectRoot: root, roots: [path], tsconfig: 'tsconfig.json', opaquePackages: OPAQUE_PACKAGES});
    rmSync(join(root, path));
    const result = evaluateMotionSyntax({projectRoot: root, graph});
    assert.equal(result.errors[0].code, 'read-error');
    assert.equal(result.errors[0].path, path);
    assert.equal(JSON.stringify(result).includes(root), false);
  });
});
