import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	plugins: [svelte()],
	// Svelte 5 resolves to its server build under Vitest unless the browser
	// condition is forced, and `mount()` throws there. Component tests need it.
	resolve: {
		conditions: ['browser']
	},
	test: {
		globals: true,
		environment: 'jsdom',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/**',
				'dist/**',
				'**/*.config.*',
				'**/*.d.ts',
				'**/*.test.ts',
				'**/*.spec.ts'
			]
		}
	}
});
