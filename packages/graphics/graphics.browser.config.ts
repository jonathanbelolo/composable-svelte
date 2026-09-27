import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ['browser'] },
  optimizeDeps: {
    include: [
      '@babylonjs/core',
      '@babylonjs/core/Engines/engineStore.js',
      '@babylonjs/core/Materials/Textures/texture.js'
    ]
  },
  test: {
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }]
    },
    include: [
      'tests/shaders/gpu-presets.browser.ts',
      'tests/babylon-native.browser.ts',
      'tests/representation-retained.browser.ts',
      'tests/scene-focus.browser.ts'
    ]
  }
});
