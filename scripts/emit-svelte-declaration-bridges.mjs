#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// NodeNext resolves an arbitrary extension as *.d.<extension>.ts. Svelte's
// bundler tooling still consumes *.svelte.d.ts, so retain both declaration forms.
export async function emitSvelteDeclarationBridges(directory) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      count += await emitSvelteDeclarationBridges(path);
    } else if (entry.isFile() && entry.name.endsWith('.svelte.d.ts')) {
      const declaration = await readFile(path, 'utf8');
      // The original source map names the original generated declaration file.
      const bridge = declaration.replace(/^\/\/# sourceMappingURL=.*(?:\r?\n|$)/gm, '');
      await writeFile(path.slice(0, -'.svelte.d.ts'.length) + '.d.svelte.ts', bridge);
      count++;
    }
  }
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const count = await emitSvelteDeclarationBridges(resolve(process.argv[2] ?? 'dist'));
  console.log(`Emitted ${count} NodeNext Svelte declaration bridges`);
}
