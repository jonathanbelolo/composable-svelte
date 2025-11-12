import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { resolve } from 'path';

export default defineConfig({
	plugins: [svelte()],

	test: {
		// Setup file for mocks
		setupFiles: ['./tests/setup.ts'],

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
		},

		// Server configuration for dependencies
		server: {
			deps: {
				// Don't process pdfjs-dist - use mock instead
				external: ['pdfjs-dist']
			}
		}
	},

	resolve: {
		alias: {
			'$lib': resolve(__dirname, 'src/lib'),
			// Mock pdfjs-dist to avoid Node.js dependencies in tests
			'pdfjs-dist': resolve(__dirname, 'tests/__mocks__/pdfjs-dist.ts')
		},
		// Prefer browser builds over Node.js builds
		conditions: ['browser', 'module', 'import', 'default']
	}
});
