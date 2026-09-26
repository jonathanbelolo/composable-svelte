import { expect, test } from '@playwright/test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

test('production output excludes the lifetime fixture', async () => {
  async function inspect(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      expect(path).not.toContain('lifetime');
      if (entry.isDirectory()) await inspect(path);
      else if (/\.(?:html|js|css)$/.test(entry.name)) {
        const source = await readFile(path, 'utf8');
        expect(source).not.toContain('data-lifetime-harness');
        expect(source).not.toContain('__lifetime/load');
        expect(source).not.toContain('Mount application');
      }
    }
  }
  await inspect('dist');
});
