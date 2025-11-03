import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { playwright } from '@vitest/browser-playwright';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    svelte(),
    dts({
      include: ['src/**/*.ts', 'src/**/*.svelte.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts']
    })
  ],

  // ============================================================================
  // Browser Mode Configuration (Vitest 4)
  // ============================================================================
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [
        { browser: 'chromium' }
      ],
      headless: true,
    },

    // Test file patterns
    include: ['tests/**/*.{test,spec}.{js,ts}'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.spec.ts',
        '**/*.test.ts',
      ]
    }
  },

  // ============================================================================
  // Build Configuration
  // ============================================================================
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index'
    },
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      external: ['svelte', 'svelte/internal'],
      output: {
        preserveModules: false
      }
    }
  },
  resolve: {
    alias: {
      '$lib': resolve(__dirname, 'src')
    }
  }
});
