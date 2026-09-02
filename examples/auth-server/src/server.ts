/**
 * A reference backend for `@composable-svelte/auth`.
 *
 * Its job is to be a conformance fixture for a documented wire contract, so the
 * client's HTTP adapter can be tested against something real instead of against
 * `globalThis.fetch` stubs. It is **not** an auth system: state is in memory,
 * nothing is persisted, and there is no deployment story.
 *
 * What it is good for, and a stub is not: the session cookie actually exists,
 * the OAuth redirect actually happens, and the branches the client cannot decide
 * for itself — a demand for re-authentication, a refusal to unlink the last way
 * into an account — are decided here, by a server, as the client's design says
 * they must be.
 *
 * **`createServer` never calls `listen`.** That is what lets a test build a
 * whole server per file on an ephemeral port and close it afterwards, which in
 * turn is why there is no reset endpoint in the vitest suite: the state is the
 * instance. `examples/ssr-server` gets this wrong — it calls `start()` at module
 * scope and exports nothing, so it cannot be booted by a test at all.
 */

import cookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';

import { installErrorHandlers } from './errors.js';
import { createStore, type Store } from './store.js';
import { accountRoutes } from './routes/account.js';
import { credentialRoutes } from './routes/credentials.js';
import { mfaRoutes } from './routes/mfa.js';
import { oauthRoutes } from './routes/oauth.js';
import { sessionRoutes } from './routes/session.js';
import { testingRoutes } from './routes/testing.js';

export interface ServerOptions {
	/**
	 * How long a proven credential keeps a session "fresh", in milliseconds.
	 *
	 * A boot-time option, never a request parameter — that distinction is the
	 * line between configuration and a backdoor. If a header or query string
	 * could flip it, a client would be choosing the server's security policy and
	 * the fixture would stop modelling anything.
	 */
	freshnessMs?: number | undefined;
	/**
	 * How an anonymous `GET /auth/session` answers.
	 *
	 * The client accepts **either** 401 or 204, interchangeably. Making it an
	 * option turns a "both are fine" clause of the contract into something a test
	 * actually exercises both ways.
	 */
	anonymousStatus?: 401 | 204 | undefined;
	/**
	 * Whether changing a password rotates the session.
	 *
	 * Both are legal and the client handles both — a rotated session crosses into
	 * its session store, `null` means this device kept its own. Default `true`,
	 * because the rotating branch is the one with handover logic worth testing.
	 */
	rotateSessionOnPasswordChange?: boolean | undefined;
	/**
	 * Where the identity provider sends the browser back.
	 *
	 * **Must not live under `/auth`.** In the Playwright topology the app runs on
	 * Vite and `/auth` is proxied to this server, so a callback at
	 * `/auth/callback` would be swallowed by the proxy and never reach the page.
	 */
	callbackPath?: string | undefined;
	/**
	 * Add `Secure` to the session cookie.
	 *
	 * Off by default because this fixture is served over plain http. A real
	 * deployment turns it on — and must, because without it the cookie travels
	 * in clear. See `session.ts` for why leaving it off is invisible on
	 * `localhost` and fatal anywhere else.
	 */
	secureCookie?: boolean | undefined;
	/** Register `POST /__test__/reset`. Off by default — see `routes/testing.ts`. */
	testing?: boolean | undefined;
	logger?: boolean | undefined;
}

export interface ServerContext {
	store: Store;
	freshnessMs: number;
	anonymousStatus: 401 | 204;
	rotateSessionOnPasswordChange: boolean;
	callbackPath: string;
	secureCookie: boolean;
}

/**
 * The store comes back alongside the app.
 *
 * A test needs to read the outbox — the tokens this server would have emailed —
 * and that is the honest way to do it: a real integration suite reads a mail
 * catcher, it does not have the endpoint hand the token back in the response.
 * Doing that would turn every link request into an account-existence oracle,
 * which is the exact property these flows are shaped to avoid.
 */
export interface Server {
	app: FastifyInstance;
	store: Store;
}

export async function createServer(options: ServerOptions = {}): Promise<Server> {
	const store = createStore();
	await store.seed();

	const context: ServerContext = {
		store,
		freshnessMs: options.freshnessMs ?? 300_000,
		anonymousStatus: options.anonymousStatus ?? 401,
		rotateSessionOnPasswordChange: options.rotateSessionOnPasswordChange ?? true,
		callbackPath: options.callbackPath ?? '/callback',
		secureCookie: options.secureCookie ?? false
	};

	const app = Fastify({ logger: options.logger ?? false });

	await app.register(cookie);

	// Before any route, so nothing can leak Fastify's default envelope — which
	// uses `error` as a *string* and is therefore discarded by the client.
	installErrorHandlers(app);

	await app.register(sessionRoutes, { context });
	await app.register(credentialRoutes, { context });
	await app.register(mfaRoutes, { context });
	await app.register(accountRoutes, { context });
	await app.register(oauthRoutes, { context });

	// Registered only when asked for. When it is off the routes do not exist at
	// all, so they 404 through the normal handler — there is no runtime check on
	// a header that could be tricked.
	if (options.testing === true) {
		await app.register(testingRoutes, { context });
	}

	return { app, store };
}
