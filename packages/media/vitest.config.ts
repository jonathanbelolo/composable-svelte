import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { resolve } from 'path';

export default defineConfig({
	plugins: [svelte()],

	test: {
		// Browser mode configuration (like core package)
		browser: {
			enabled: true,
			provider: playwright(),
			instances: [{ browser: 'chromium' }],
			headless: true
		},

		// Test file patterns. `tests/ssr` runs in Node: vitest.ssr.config.ts.
		include: ['tests/**/*.{test,spec}.{js,ts}'],
		exclude: ['tests/ssr/**', 'node_modules/**'],

		// Suppress console output during tests (for CI/prepublish)
		silent: process.env.CI === 'true' || process.env.SILENT_TESTS === 'true',

		// Coverage configuration
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'lcov'],
			exclude: ['node_modules/', 'tests/', '**/*.spec.ts', '**/*.test.ts']
		}
	},

	resolve: {
		alias: [
			{ find: '$lib', replacement: resolve(__dirname, 'src/lib') },
			// The README recipes import the package by name, as a consumer does.
			// Mount them against source, so a test never runs a stale `dist`.
			// svelte-check still resolves the name to the built declarations.
			{ find: /^@composable-svelte\/media$/, replacement: resolve(__dirname, 'src/lib/index.ts') }
		]
	}
});
