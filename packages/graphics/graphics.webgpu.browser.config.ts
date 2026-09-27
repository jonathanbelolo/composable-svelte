import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { svelte } from '@sveltejs/vite-plugin-svelte';

/**
 * Isolated WebGPU qualification on a real GPU adapter. Headless Chromium exposes no WebGPU adapter by
 * default (and `--enable-unsafe-webgpu` alone yields the SwiftShader fallback), so this configuration asks
 * for the Metal backend explicitly. The first test fails if the adapter is a fallback: a software adapter
 * is not qualification.
 */
export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ['browser'] },
  optimizeDeps: {
    // One module instance each for Babylon (WGSL shaders load on demand; a mid-run pre-bundle reload re-instantiates
    // Babylon modules under a live WebGPU device) and for core (app and test-only internal accessors).
    exclude: ['@babylonjs/core', '@composable-svelte/core'],
    // Core's own third-party imports, pre-bundled up front so they are not discovered (and reloaded) mid-run.
    include: ['esm-env', 'motion']
  },
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ launchOptions: { args: ['--enable-unsafe-webgpu', '--use-angle=metal', '--enable-features=Vulkan,WebGPUService'] } }),
      instances: [{ browser: 'chromium', viewport: { width: 800, height: 600 } }]
    },
    include: ['tests/webgpu/*.browser.ts'],
    // Each file in its own isolated run order; no cross-file reloads mid-measurement.
    fileParallelism: false
  }
});
