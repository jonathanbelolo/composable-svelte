import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Preprocess Svelte files with Vite for TypeScript support
	preprocess: vitePreprocess(),

	// Configure compiler options for Svelte 5
	compilerOptions: {
		// Enable runes mode for Svelte 5
		runes: true
	}
};

export default config;
