import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The Playwright provider is the workspace's existing one (installed for @composable-svelte/core);
// the example adds no dependency of its own.
const core = fileURLToPath(new URL('../../packages/core/package.json', import.meta.url));
const { playwright } = (await import(pathToFileURL(createRequire(core).resolve('@vitest/browser-playwright')).href)) as typeof import('@vitest/browser-playwright');

export default defineConfig({
  plugins: [svelte()],
  // Evidence tests read the framework's test-only diagnostics from the same built modules the app uses.
  server: { fs: { allow: ['../..'] } },
  // Graphics imports Babylon's engine store (and, on demand, its WebGPU engine); pre-bundled up front so the
  // dev server does not re-optimize and reload mid-run. Test server only; the product build is unaffected.
  optimizeDeps: { include: ['@composable-svelte/graphics > @babylonjs/core/Engines/engineStore.js', '@composable-svelte/graphics > @babylonjs/core/Engines/webgpuEngine.js'] },
  test: {
    root: import.meta.dirname,
    include: ['tests/**/*.test.ts'],
    // Evidence files measure frame timing, long tasks and composited pixels; running them concurrently in one
    // browser made each file's WebGL work contaminate the others' windows. Timing is recorded per window.
    fileParallelism: false,
    exclude: ['tests/**/*.ssr.test.ts'],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium', viewport: { width: 1280, height: 900 } }],
      headless: true,
      // Evidence screenshots are taken explicitly; expected-failure gap witnesses would otherwise litter tests/.
      screenshotFailures: false
    }
  }
});
