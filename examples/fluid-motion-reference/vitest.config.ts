import { defineConfig } from 'vitest/config';

/**
 * Node: the SSR test only. It starts its own Vite SSR server with the Svelte plugin (the repository's
 * existing method; the Svelte plugin cannot run inside a Node Vitest config under Vite 6). Domain,
 * plan and browser evidence tests run under vitest.browser.config.ts.
 */
export default defineConfig({
  test: {
    root: import.meta.dirname,
    environment: 'node',
    include: ['tests/**/*.ssr.test.ts']
  }
});
