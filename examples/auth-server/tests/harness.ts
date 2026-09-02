/**
 * One server per test file, on an ephemeral port.
 *
 * `createServer()` closes over a fresh `createStore()`, so isolation is "build
 * another one" rather than "reset the one" — there is nothing to reset, because
 * the state *is* the instance. `port: 0` means files running in parallel cannot
 * collide, which is also why the OAuth `authorize_url` has to derive its origin
 * from the request rather than a constant.
 */

import { createHttpAuthDeps } from '@composable-svelte/auth/http';
import type { AuthDependencies } from '@composable-svelte/auth';
import type { FastifyInstance } from 'fastify';

import { createServer, type ServerOptions } from '../src/server.js';
import type { Store } from '../src/store.js';
import { createCookieJar, type CookieJar } from './cookie-jar.js';

export interface Harness {
	app: FastifyInstance;
	/** For reading the outbox — the links this server would have emailed. */
	store: Store;
	baseUrl: string;
	jar: CookieJar;
	/** The real client adapter, pointed at the real server. */
	deps: AuthDependencies;
	/** `fetch` carrying the jar, for asserting on raw responses. */
	fetch: typeof fetch;
	stop(): Promise<void>;
}

export async function startServer(options: ServerOptions = {}): Promise<Harness> {
	const { app, store } = await createServer(options);
	await app.listen({ port: 0, host: '127.0.0.1' });

	const address = app.server.address();
	if (address === null || typeof address === 'string') {
		throw new Error('the server did not bind a TCP port');
	}
	const baseUrl = `http://127.0.0.1:${address.port}`;

	const jar = createCookieJar();
	// The adapter calls the global `fetch`, so the jar has to be installed there.
	// Node has no cookie store of its own; see `cookie-jar.ts` for what that
	// does and does not prove.
	const original = globalThis.fetch;
	globalThis.fetch = jar.fetch;

	return {
		app,
		store,
		baseUrl,
		jar,
		deps: createHttpAuthDeps(baseUrl),
		fetch: jar.fetch,
		async stop() {
			globalThis.fetch = original;
			await app.close();
		}
	};
}
