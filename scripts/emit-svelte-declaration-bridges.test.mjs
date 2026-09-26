import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitSvelteDeclarationBridges } from './emit-svelte-declaration-bridges.mjs';

test('preserves originals and relative imports while emitting idempotent nested bridges', async () => {
 const root = await mkdtemp(join(tmpdir(), 'declaration-bridge-'));
 try {
  await mkdir(join(root, 'nested'));
  const original = "import type {Value} from './value.js';\nexport default Value;\n//# sourceMappingURL=Widget.svelte.d.ts.map";
  await writeFile(join(root, 'nested/Widget.svelte.d.ts'), original);
  await writeFile(join(root, 'state.svelte.ts'), 'export const value = 1;');
  assert.equal(await emitSvelteDeclarationBridges(root), 1);
  assert.equal(await readFile(join(root, 'nested/Widget.svelte.d.ts'), 'utf8'), original);
  assert.equal(await readFile(join(root, 'nested/Widget.d.svelte.ts'), 'utf8'), "import type {Value} from './value.js';\nexport default Value;\n");
  assert.equal(await emitSvelteDeclarationBridges(root), 1);
  assert.deepEqual((await readdir(root)).sort(), ['nested', 'state.svelte.ts']);
  assert.deepEqual((await readdir(join(root, 'nested'))).sort(), ['Widget.d.svelte.ts', 'Widget.svelte.d.ts']);
 } finally { await rm(root, {recursive:true,force:true}); }
});
