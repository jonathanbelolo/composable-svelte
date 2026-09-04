import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

/**
 * The reference client.
 *
 * **Everything is same-origin from the browser's view**, which is the whole
 * point of the proxy below. `createHttpAuthDeps()` defaults to `baseUrl: ''`,
 * and its own documentation warns that a cross-site base URL never carries the
 * `SameSite=Lax` session cookie — so pointing the app at
 * `http://localhost:4100` directly would test a configuration nobody should
 * ship. Proxying keeps the default path exercised, unmodified.
 *
 * **`/callback` is deliberately not under `/auth`.** The proxy would swallow
 * it, and the OAuth return would never reach the page.
 */
export default defineConfig({
	plugins: [svelte()],
	root: 'app',
	build: { outDir: '../dist-app', emptyOutDir: true },
	server: {
		port: 4101,
		strictPort: true,
		proxy: {
			// **`changeOrigin: false` is load-bearing, not a default worth relying
			// on.** The fixture builds its OAuth `authorize_url` and `redirect_uri`
			// from `request.headers.host`, because a hardcoded origin breaks the
			// moment it listens on an ephemeral port. Vite 6 rewrites `Host` to the
			// proxy target unless told otherwise, which sent the browser back to
			// the *fixture's* origin instead of the app's — a real 404 found by
			// clicking the button.
			'/auth': { target: 'http://127.0.0.1:4100', changeOrigin: false },
			'/provider': { target: 'http://127.0.0.1:4100', changeOrigin: false },
			'/__test__': { target: 'http://127.0.0.1:4100', changeOrigin: false }
		}
	},
	preview: {
		port: 4101,
		strictPort: true,
		proxy: {
			// **`changeOrigin: false` is load-bearing, not a default worth relying
			// on.** The fixture builds its OAuth `authorize_url` and `redirect_uri`
			// from `request.headers.host`, because a hardcoded origin breaks the
			// moment it listens on an ephemeral port. Vite 6 rewrites `Host` to the
			// proxy target unless told otherwise, which sent the browser back to
			// the *fixture's* origin instead of the app's — a real 404 found by
			// clicking the button.
			'/auth': { target: 'http://127.0.0.1:4100', changeOrigin: false },
			'/provider': { target: 'http://127.0.0.1:4100', changeOrigin: false },
			'/__test__': { target: 'http://127.0.0.1:4100', changeOrigin: false }
		}
	}
});
