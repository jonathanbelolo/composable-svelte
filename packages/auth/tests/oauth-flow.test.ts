/**
 * The two OAuth flow reducers.
 *
 * Two arms carry this file. The first is `stores the record before it
 * redirects`: leaving before the nonce is stored lands a legitimate sign-in on
 * a callback page with no record, which is then reported to the user as a CSRF
 * failure — the worst available way to be wrong here.
 *
 * The second is `never reaches the backend with a state it could not verify`.
 * The whole security value of the callback half is that a bad `state` stops the
 * exchange, and a gate that reports rather than gates would pass every other
 * test in here.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';

import {
	oauthStartReducer,
	createInitialOAuthStartState,
	oauthCallbackReducer,
	createInitialOAuthCallbackState,
	oauthParamsFromUrl,
	createMemoryPendingOAuthStorage,
	normaliseReturnTo
} from '../src/lib/flows/index.js';
import type {
	OAuthStartDependencies,
	OAuthStartState,
	OAuthCallbackDependencies,
	OAuthCallbackState,
	OAuthCallbackParams,
	PendingOAuth,
	PendingOAuthStorage
} from '../src/lib/flows/index.js';
import type { AuthError } from '../src/lib/errors/types.js';
import type { SessionSnapshot } from '../src/lib/subject/types.js';

const session: SessionSnapshot = {
	subject_id: '11111111-2222-3333-4444-555555555555',
	display_name: 'Ada',
	roles: ['member']
};

const AUTHORIZE = 'https://provider.example/authorize?client_id=x';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function startStore(
	deps: Partial<OAuthStartDependencies> = {},
	initial?: Partial<OAuthStartState>
) {
	return createTestStore({
		initialState: { ...createInitialOAuthStartState(), ...initial },
		reducer: oauthStartReducer,
		dependencies: {
			beginOAuth: vi.fn(async () => ({ authorizeUrl: AUTHORIZE, state: 'st_1' })),
			pendingOAuth: createMemoryPendingOAuthStorage(),
			redirect: vi.fn(),
			...deps
		} satisfies OAuthStartDependencies
	});
}

function callbackStore(
	deps: Partial<OAuthCallbackDependencies> = {},
	initial?: Partial<OAuthCallbackState>
) {
	return createTestStore({
		initialState: { ...createInitialOAuthCallbackState(), ...initial },
		reducer: oauthCallbackReducer,
		dependencies: {
			completeOAuth: vi.fn(async () => session),
			pendingOAuth: createMemoryPendingOAuthStorage(),
			...deps
		} satisfies OAuthCallbackDependencies
	});
}

function params(over: Partial<OAuthCallbackParams> = {}): OAuthCallbackParams {
	return { code: null, state: null, error: null, errorDescription: null, ...over };
}

/** A storage seeded with one record, for the callback half. */
function seeded(pending: PendingOAuth): PendingOAuthStorage {
	const storage = createMemoryPendingOAuthStorage();
	storage.put(pending);
	return storage;
}

// ============================================================
// Starting
// ============================================================

describe('starting a sign-in', () => {
	it('asks the backend, stores the nonce, and leaves', async () => {
		const pendingOAuth = createMemoryPendingOAuthStorage();
		const redirect = vi.fn();
		const store = startStore({ pendingOAuth, redirect });

		await store.send({ type: 'authorizationRequested', provider: 'github', returnTo: '/app' }, (s) => {
			expect(s.status).toBe('starting');
			expect(s.provider).toBe('github');
		});
		await store.receive({ type: 'authorizationReady' }, (s) => {
			expect(s.status).toBe('redirecting');
		});
		await store.finish();

		expect(redirect).toHaveBeenCalledWith(AUTHORIZE);
		store.assertNoPendingActions();
	});

	it('stores the record before it redirects', async () => {
		// Mutation-verified against moving `redirect` above `put`, which is the
		// reachable way to break this. Note what it does *not* catch: swapping the
		// single effect for an `Effect.batch` of two still passes, because a batch
		// happens to preserve order for synchronous members. The reducer uses one
		// effect anyway — batch's contract says "in parallel", and building on an
		// implementation accident is how a guard ends up right by luck.
		const pendingOAuth = createMemoryPendingOAuthStorage();
		let recordAtRedirect: PendingOAuth | null = null;
		const redirect = vi.fn(() => {
			recordAtRedirect = pendingOAuth.take();
		});
		const store = startStore({ pendingOAuth, redirect });

		await store.send({ type: 'authorizationRequested', provider: 'github', returnTo: '/app' });
		await store.receive({ type: 'authorizationReady' });
		await store.finish();

		expect(recordAtRedirect, 'redirected before the record was stored').not.toBeNull();
		expect(recordAtRedirect!).toEqual({
			provider: 'github',
			intent: 'signIn',
			state: 'st_1',
			returnTo: '/app'
		});
	});

	it('does not redirect when the record could not be stored', async () => {
		// A dropped record surfaces on the callback page as `oauth_state_mismatch`
		// — a security-shaped verdict on a storage fault, delivered somewhere with
		// no way to diagnose it. Better to fail here, where the buttons still are.
		const pendingOAuth: PendingOAuthStorage = {
			put: () => {
				throw new Error('sessionStorage is full');
			},
			take: () => null
		};
		const redirect = vi.fn();
		const store = startStore({ pendingOAuth, redirect });

		await store.send({ type: 'authorizationRequested', provider: 'github' });
		await store.receive({ type: 'authorizationReady' });
		await store.receive({ type: 'authorizationFailed' }, (s) => {
			expect(s.status).toBe('idle');
			expect(s.error?.code).toBe('unknown');
		});

		expect(redirect, 'left the page without a record to come back to').not.toHaveBeenCalled();
		store.assertNoPendingActions();
	});

	it('reports a redirect that refuses, instead of hanging on it', async () => {
		// `createBrowserRedirect` throws on a URL that is not `http(s):`, and a
		// consumer-supplied one may refuse for its own reasons. Unwrapped, that
		// throw escapes the effect and leaves the flow in `redirecting` — a status
		// only a navigation can leave — with `error` null and the button reading
		// "Taking you to GitHub…" permanently.
		//
		// The same species as the `take()` throw in the callback half, and it was
		// still open in the change that closed that one.
		const store = startStore({
			redirect: () => {
				throw new TypeError('refusing to navigate to javascript:');
			}
		});

		await store.send({ type: 'authorizationRequested', provider: 'github' });
		await store.receive({ type: 'authorizationReady' });
		await store.receive({ type: 'authorizationFailed' }, (s) => {
			expect(s.status, 'a refused redirect left the flow stuck').toBe('idle');
			expect(s.error, 'a refused redirect said nothing').not.toBeNull();
		});

		store.assertNoPendingActions();
	});

	it('reports a refused start without leaving', async () => {
		const redirect = vi.fn();
		const store = startStore({
			beginOAuth: vi.fn(async () => {
				throw { code: 'rate_limited', message: 'Slow down.', retryAfterSeconds: 30 } satisfies AuthError;
			}),
			redirect
		});

		await store.send({ type: 'authorizationRequested', provider: 'github' });
		await store.receive({ type: 'authorizationFailed' }, (s) => {
			expect(s.status).toBe('idle');
			expect(s.provider).toBeNull();
			expect(s.error).toEqual({
				code: 'rate_limited',
				message: 'Slow down.',
				retryAfterSeconds: 30
			});
		});

		expect(redirect).not.toHaveBeenCalled();
		store.assertNoPendingActions();
	});

	it('supersedes a start that is still in flight', async () => {
		// The second click has to land while the first request is still open, or
		// there is no supersession to test: with a mock that resolves instantly
		// the first start genuinely finishes — record stored, redirect issued —
		// before a second click is possible, and two redirects is then the
		// correct answer rather than a defect.
		//
		// There is deliberately no status guard on `authorizationRequested`.
		// `redirecting` is a state only a navigation leaves, so a guard would trap
		// the page whenever the navigation did not happen. The fixed effect id is
		// what keeps a second press from racing the first.
		const slow = deferred<{ authorizeUrl: string; state: string }>();
		const beginOAuth = vi
			.fn<OAuthStartDependencies['beginOAuth']>()
			.mockReturnValueOnce(slow.promise)
			.mockResolvedValueOnce({ authorizeUrl: 'https://b.example/x', state: 'st_b' });
		const redirect = vi.fn();
		const pendingOAuth = createMemoryPendingOAuthStorage();
		const store = startStore({ beginOAuth, redirect, pendingOAuth });

		await store.send({ type: 'authorizationRequested', provider: 'google' });
		await store.send({ type: 'authorizationRequested', provider: 'github' }, (s) => {
			expect(s.provider).toBe('github');
		});
		await store.receive({ type: 'authorizationReady' }, (s) => {
			expect(s.status).toBe('redirecting');
		});

		// The abandoned first answer arrives late. The provider guard is what
		// discards it; without one it would overwrite a live record with a stale
		// nonce and send the user somewhere they no longer chose.
		slow.resolve({ authorizeUrl: 'https://a.example/x', state: 'st_a' });
		await store.finish();

		expect(beginOAuth).toHaveBeenCalledTimes(2);
		expect(redirect, 'a superseded start still navigated').toHaveBeenCalledTimes(1);
		expect(redirect).toHaveBeenCalledWith('https://b.example/x');
	});

	it('drops a stale answer from a superseded provider', async () => {
		const store = startStore({}, { status: 'starting', provider: 'github' });

		await store.send(
			{
				type: 'authorizationReady',
				provider: 'google',
				intent: 'signIn',
				authorizeUrl: 'https://stale.example/x',
				state: 'st_stale',
				returnTo: null
			},
			(s) => {
				expect(s.status, 'a superseded answer moved the flow').toBe('starting');
			}
		);
		store.assertNoPendingActions();
	});

	it('leaves an untouched state identical when there is nothing to dismiss', async () => {
		const store = startStore();
		const before = store.state;
		await store.send({ type: 'errorDismissed' });
		expect(store.state).toBe(before);
	});
});

describe('returnTo', () => {
	it('keeps a same-origin path and drops everything else', () => {
		// The open-redirect gate. It needs no XSS: a consumer reading `returnTo`
		// from their own query string carries whatever a link put there.
		expect(normaliseReturnTo('/dashboard')).toBe('/dashboard');
		expect(normaliseReturnTo('/a/b?c=d#e')).toBe('/a/b?c=d#e');

		for (const hostile of [
			'https://evil.example',
			'http://evil.example',
			'//evil.example',
			'/\\evil.example',
			'javascript:alert(1)',
			'dashboard',
			'',
			null,
			undefined
		]) {
			expect(normaliseReturnTo(hostile), `${String(hostile)} was let through`).toBeNull();
		}
	});

	it('rejects the characters a browser strips before it resolves a URL', () => {
		// The WHATWG URL parser removes tab, LF and CR *before* resolving, so
		// `/<TAB>/evil.example` reads as a rooted path here and arrives at the
		// browser as `//evil.example` — protocol-relative, absolute, off-site.
		// Checking the raw string checks something the browser never sees.
		for (const hostile of [
			'/\t/evil.example',
			'/\n/evil.example',
			'/\r/evil.example',
			'/\t\\evil.example',
			'/\r\n/evil.example'
		]) {
			expect(normaliseReturnTo(hostile), `${JSON.stringify(hostile)} was let through`).toBeNull();
		}

		// A space is *not* stripped — it is percent-encoded and stays in the path
		// — so this really is a same-origin path and must survive.
		expect(normaliseReturnTo('/a b/c')).toBe('/a b/c');
		// Stripped, then kept: storing the raw form would park a value that means
		// one thing here and another when it is navigated to.
		expect(normaliseReturnTo('/dash\tboard')).toBe('/dashboard');
	});

	it('normalises on the way into storage, not only at the edge', async () => {
		const pendingOAuth = createMemoryPendingOAuthStorage();
		const store = startStore({ pendingOAuth });

		await store.send({
			type: 'authorizationRequested',
			provider: 'github',
			returnTo: 'https://evil.example'
		});
		await store.receive({ type: 'authorizationReady' });
		await store.finish();

		expect(pendingOAuth.take()?.returnTo).toBeNull();
	});
});

// ============================================================
// Coming back
// ============================================================

describe('finishing a sign-in', () => {
	it('verifies the nonce and exchanges the code', async () => {
		const completeOAuth = vi.fn(async () => session);
		const store = callbackStore({
			completeOAuth,
			pendingOAuth: seeded({ intent: 'signIn', provider: 'github', state: 'st_1', returnTo: '/app' })
		});

		await store.send(
			{ type: 'callbackReceived', params: params({ code: 'c_1', state: 'st_1' }) },
			(s) => {
				expect(s.status).toBe('exchanging');
			}
		);
		await store.receive({ type: 'exchangeSucceeded' }, (s) => {
			expect(s.status).toBe('completed');
			expect(s.session).toEqual(session);
			expect(s.returnTo).toBe('/app');
		});

		expect(completeOAuth).toHaveBeenCalledWith('github', 'c_1', 'st_1', expect.anything());
		store.assertNoPendingActions();
	});

	it('never reaches the backend with a state it could not verify', async () => {
		// The security arm. A gate that reported instead of gating would pass
		// every other test in this file.
		const cases: Array<{ name: string; storage: PendingOAuthStorage; sent: OAuthCallbackParams }> =
			[
				{
					name: 'a state that does not match',
					storage: seeded({ intent: 'signIn', provider: 'github', state: 'st_real', returnTo: null }),
					sent: params({ code: 'c_1', state: 'st_forged' })
				},
				{
					name: 'no state at all',
					storage: seeded({ intent: 'signIn', provider: 'github', state: 'st_real', returnTo: null }),
					sent: params({ code: 'c_1' })
				},
				{
					name: 'nothing pending',
					storage: createMemoryPendingOAuthStorage(),
					sent: params({ code: 'c_1', state: 'st_real' })
				},
				{
					name: 'a storage that cannot be read',
					storage: {
						put: () => {},
						take: () => {
							throw new Error('unreadable');
						}
					},
					sent: params({ code: 'c_1', state: 'st_real' })
				}
			];

		for (const { name, storage, sent } of cases) {
			const completeOAuth = vi.fn(async () => session);
			const store = callbackStore({ completeOAuth, pendingOAuth: storage });

			await store.send({ type: 'callbackReceived', params: sent });
			await store.receive({ type: 'exchangeFailed' }, (s) => {
				expect(s.status, name).toBe('failed');
				expect(s.error?.code, name).toBe('oauth_state_mismatch');
			});

			expect(completeOAuth, `${name} reached the backend`).not.toHaveBeenCalled();
			store.assertNoPendingActions();
		}
	});

	it('carries nothing but a message on a mismatch', async () => {
		// No nonce, and no hint of which of the three routes got here. Both would
		// cross SSR hydration as JSON and land in whatever logs an app keeps.
		const store = callbackStore({ pendingOAuth: createMemoryPendingOAuthStorage() });

		await store.send({ type: 'callbackReceived', params: params({ code: 'c', state: 's' }) });
		await store.receive({ type: 'exchangeFailed' }, (s) => {
			expect(Object.keys(s.error ?? {}).sort()).toEqual(['code', 'message']);
		});
	});

	it('takes the provider from the record, never from the URL', async () => {
		// The provider has to come from the trusted side of the gate, or the gate
		// is decorative — a forged callback could otherwise pick which backend
		// integration the code is redeemed against.
		const completeOAuth = vi.fn<OAuthCallbackDependencies['completeOAuth']>(async () => session);
		const store = callbackStore({
			completeOAuth,
			pendingOAuth: seeded({ intent: 'signIn', provider: 'github', state: 'st_1', returnTo: null })
		});

		await store.send({
			type: 'callbackReceived',
			params: params({ code: 'c_1', state: 'st_1' })
		});
		await store.receive({ type: 'exchangeSucceeded' });

		// The URL said nothing about the provider and could not have: a forged
		// callback would otherwise pick which backend integration redeems the code.
		expect(completeOAuth).toHaveBeenCalledWith('github', 'c_1', 'st_1', expect.anything());
	});

	it('treats a cancellation as a branch, not a failure', async () => {
		const completeOAuth = vi.fn(async () => session);
		const store = callbackStore({
			completeOAuth,
			pendingOAuth: seeded({ intent: 'signIn', provider: 'google', state: 'st_1', returnTo: null })
		});

		await store.send({ type: 'callbackReceived', params: params({ error: 'access_denied' }) });
		await store.receive({ type: 'exchangeFailed' }, (s) => {
			expect(s.error?.code).toBe('oauth_denied');
			expect(s.error).toMatchObject({ provider: 'google' });
		});

		expect(completeOAuth).not.toHaveBeenCalled();
	});

	it('still reads a cancellation when the state cannot be verified', async () => {
		// Pins the documented branch order. Gating the refusal behind the state
		// check would turn "you pressed Cancel" into a security alarm for anyone
		// whose record was overwritten by a second attempt in the same tab.
		const store = callbackStore({ pendingOAuth: createMemoryPendingOAuthStorage() });

		await store.send({
			type: 'callbackReceived',
			params: params({ error: 'access_denied', state: 'st_forged' })
		});
		await store.receive({ type: 'exchangeFailed' }, (s) => {
			expect(s.error?.code).toBe('oauth_denied');
		});
	});

	it('names a recognisable provider error and refuses an unrecognisable one', async () => {
		// `?error=` is whatever a link carries. Svelte escapes it, so this is not
		// a scripting hole — but a banner in the app's own chrome reading "Your
		// account is locked, call 1-800-…" is a phishing surface regardless.
		const store = callbackStore({
			pendingOAuth: seeded({ intent: 'signIn', provider: 'github', state: 'st_1', returnTo: null })
		});
		await store.send({ type: 'callbackReceived', params: params({ error: 'server_error' }) });
		await store.receive({ type: 'exchangeFailed' }, (s) => {
			expect(s.error?.code).toBe('unknown');
			expect(s.error?.message).toContain('server_error');
		});

		const hostile = 'Your account is locked. Call 1-800-555-0100 to restore it.';
		const store2 = callbackStore({
			pendingOAuth: seeded({ intent: 'signIn', provider: 'github', state: 'st_1', returnTo: null })
		});
		await store2.send({ type: 'callbackReceived', params: params({ error: hostile }) });
		await store2.receive({ type: 'exchangeFailed' }, (s) => {
			expect(s.error?.message, 'attacker prose was echoed').not.toContain('1-800');
			expect(s.error?.message).not.toContain('locked');
		});
	});

	it('exchanges once, and never again from a terminal state', async () => {
		// The guard is total on purpose. `email-verification` must leave `idle`
		// open so a fresh token can be tried; a fresh code here arrives only with
		// a new page load, which destroys this store.
		for (const status of ['completed', 'failed'] as const) {
			const completeOAuth = vi.fn(async () => session);
			const store = callbackStore(
				{
					completeOAuth,
					pendingOAuth: seeded({ intent: 'signIn', provider: 'github', state: 'st_1', returnTo: null })
				},
				{ status }
			);

			await store.send({
				type: 'callbackReceived',
				params: params({ code: 'c_1', state: 'st_1' })
			});

			expect(completeOAuth, `a ${status} flow exchanged again`).not.toHaveBeenCalled();
			store.assertNoPendingActions();
		}
	});

	it('keeps a second factor intact when the backend asks for one', async () => {
		const store = callbackStore({
			completeOAuth: vi.fn(async () => {
				throw {
					code: 'mfa_required',
					message: 'Enter the code from your authenticator app.',
					challengeId: 'chal_oauth',
					methods: ['totp']
				} satisfies AuthError;
			}),
			pendingOAuth: seeded({ intent: 'signIn', provider: 'github', state: 'st_1', returnTo: null })
		});

		await store.send({
			type: 'callbackReceived',
			params: params({ code: 'c_1', state: 'st_1' })
		});
		await store.receive({ type: 'exchangeFailed' }, (s) => {
			expect(s.error).toMatchObject({ code: 'mfa_required', challengeId: 'chal_oauth' });
		});
	});

	it('refuses a callback that came back without a code', async () => {
		const completeOAuth = vi.fn(async () => session);
		const store = callbackStore({
			completeOAuth,
			pendingOAuth: seeded({ intent: 'signIn', provider: 'github', state: 'st_1', returnTo: null })
		});

		await store.send({ type: 'callbackReceived', params: params({ state: 'st_1' }) });
		await store.receive({ type: 'exchangeFailed' }, (s) => {
			expect(s.error?.code).toBe('unknown');
		});
		expect(completeOAuth).not.toHaveBeenCalled();
	});
});

describe('oauthParamsFromUrl', () => {
	it('reads all four parameters', () => {
		const read = oauthParamsFromUrl(
			'https://app.example/auth/callback?code=c1&state=s1&error=access_denied&error_description=nope'
		);
		expect(read).toEqual({
			code: 'c1',
			state: 's1',
			error: 'access_denied',
			errorDescription: 'nope'
		});
	});

	it('treats an empty parameter as a missing one', () => {
		// The rule `tokenFromUrl` already applies: `?code=` reaches here when
		// something mangles a redirect, and sending "" onward only produces a
		// confusing failure further in.
		expect(oauthParamsFromUrl('https://app.example/cb?code=&state=').code).toBeNull();
		expect(oauthParamsFromUrl('https://app.example/cb?code=&state=').state).toBeNull();
	});

	it('answers all-nulls for something that is not a URL', () => {
		expect(oauthParamsFromUrl('not a url')).toEqual({
			code: null,
			state: null,
			error: null,
			errorDescription: null
		});
	});
});
