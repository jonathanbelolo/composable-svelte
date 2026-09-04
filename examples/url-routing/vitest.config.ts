import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	plugins: [svelte()],
	// Svelte 5 resolves to its server build under Vitest unless the browser
	// condition is forced, and `mount()` throws there. Component tests need it.
	// Same line maps and charts carry, for the same reason.
	resolve: {
		conditions: ['browser']
	},
	test: {
		globals: true,
		environment: 'jsdom',
		include: ['tests/**/*.{test,spec}.ts']
	}
});
