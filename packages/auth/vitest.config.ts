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

		// Test file patterns
		include: ['tests/**/*.{test,spec}.{js,ts}'],

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
		alias: {
			'$lib': resolve(__dirname, 'src/lib')
		}
	}
});
