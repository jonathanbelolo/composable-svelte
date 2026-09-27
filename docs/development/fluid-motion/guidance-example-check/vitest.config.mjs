// Server-compiles .svelte / .svelte.ts so node tests can import modules that reach the
// application entry point (same approach as examples/fluid-motion-reference).
import { defineConfig } from 'vitest/config';
import { compile, compileModule } from 'svelte/compiler';

const components = {
  name: 'guidance-server-components',
  enforce: 'pre',
  transform(code, id) {
    const filename = id.split('?')[0];
    if (!filename.endsWith('.svelte')) return null;
    const result = compile(code, { filename, generate: 'server' });
    return { code: result.js.code, map: result.js.map };
  }
};
const runes = {
  name: 'guidance-server-runes',
  enforce: 'post',
  transform(code, id) {
    const filename = id.split('?')[0];
    if (!/\.svelte\.(ts|js)$/.test(filename)) return null;
    const result = compileModule(code, { filename, generate: 'server' });
    return { code: result.js.code, map: result.js.map };
  }
};
export default defineConfig({ plugins: [components, runes], test: { environment: 'node', include: ['tests/**/*.test.ts'], exclude: ['tests/**/*.browser.test.ts'] } });
