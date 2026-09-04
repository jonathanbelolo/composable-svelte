/**
 * Managing what an account already has — the reducers.
 *
 * Three subjects, and each carries one arm that a plausible implementation gets
 * wrong.
 *
 * `mfa-management`: **stale recovery codes must leave the screen before the
 * request goes out**, not after it comes back. Codes are shown once and copied
 * by hand; a set that is still on screen while a replacement is in flight is a
 * set someone writes down and cannot use.
 *
 * `connected-accounts`: **the client does not judge whether detaching is safe**.
 * The obvious `hasPassword || providers.length > 1` rule locks out every account
 * whose backend offers magic links, so the request is sent and the backend
 * refuses.
 *
 * The OAuth intent: **a pending record without one is rejected, not defaulted**.
 * Defaulting to `signIn` turns an abandoned link attempt into a sign-in nobody
 * asked for.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';

import {
	connectedAccountsReducer,
	createInitialConnectedAccountsState,
	createInitialMfaManagementState,
	createMemoryPendingOAuthStorage,
	createPendingOAuthStorage,
	createInitialOAuthStartState,
	createInitialOAuthCallbackState,
	mfaManagementReducer,
	oauthCallbackReducer,
	oauthStartReducer
} from '../src/lib/flows/index.js';
import type {
	ConnectedAccountsDependencies,
	ConnectedAccountsState,
	MfaManagementDependencies,
	MfaManagementState,
	OAuthCallbackDependencies,
	OAuthStartDependencies,
	PendingOAuth
} from '../src/lib/flows/index.js';
import type { AuthError } from '../src/lib/errors/types.js';
import type { SessionSnapshot } from '../src/lib/subject/types.js';

const CODES = ['aaa-111', 'bbb-222', 'ccc-333'];
const FRESH = ['ddd-444', 'eee-555', 'fff-666'];

const NEEDS_PROOF: AuthError = {
	code: 'reauthentication_required',
	message: 'Confirm it is still you.',
	methods: ['password', 'totp']
};

const SESSION: SessionSnapshot = {
	subject_id: '99999999-8888-7777-6666-555555555555',
	display_name: 'Ada',
	roles: ['member']
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function mfaStore(
	deps: Partial<MfaManagementDependencies> = {},
	initial?: Partial<MfaManagementState>
) {
	return createTestStore({
		initialState: { ...createInitialMfaManagementState(), ...initial },
		reducer: mfaManagementReducer,
		dependencies: {
			disableMfa: vi.fn(async () => undefined),
			regenerateRecoveryCodes: vi.fn(async () => ({ recoveryCodes: FRESH })),
			...deps
		} satisfies MfaManagementDependencies
	});
}

function linkStore(
	deps: Partial<ConnectedAccountsDependencies> = {},
	initial?: Partial<ConnectedAccountsState>
) {
	return createTestStore({
		initialState: { ...createInitialConnectedAccountsState(), ...initial },
		reducer: connectedAccountsReducer,
		dependencies: {
			unlinkOAuthProvider: vi.fn(async () => undefined),
			...deps
		} satisfies ConnectedAccountsDependencies
	});
}

// ============================================================
// MFA management
// ============================================================

describe('managing an authenticator', () => {
	it('takes the old codes off screen before the new ones are asked for', async () => {
		// The arm this file exists for. Recovery codes are copied by hand from the
		// screen; a set still showing while its replacement is in flight is a set
		// someone writes down and then cannot use.
		const gate = deferred<{ recoveryCodes: readonly string[] }>();
		const store = mfaStore(
			{ regenerateRecoveryCodes: vi.fn(async () => gate.promise) },
			{ recoveryCodes: CODES }
		);

		await store.send({ type: 'regenerateRequested' }, (s) => {
			expect(s.status).toBe('regenerating');
			expect(s.recoveryCodes, 'the superseded codes were still on screen').toBeNull();
		});

		gate.resolve({ recoveryCodes: FRESH });
		await store.receive({ type: 'regenerateSucceeded' }, (s) => {
			expect(s.recoveryCodes).toEqual(FRESH);
			// Back to idle, not a status of its own — `recoveryCodes !== null` is
			// the single fact about codes being on screen.
			expect(s.status).toBe('idle');
		});
		await store.assertNoPendingActions();
	});

	it('leaves nothing on screen when a regeneration fails', async () => {
		// The half the clearing above buys. The old codes are still valid at the
		// backend, but they were shown once and saved; re-showing them beside a
		// failure invites the belief that they are the new set.
		const store = mfaStore(
			{ regenerateRecoveryCodes: vi.fn(async () => Promise.reject(NEEDS_PROOF)) },
			{ recoveryCodes: CODES }
		);

		await store.send({ type: 'regenerateRequested' });
		await store.receive({ type: 'regenerateFailed' }, (s) => {
			expect(s.recoveryCodes).toBeNull();
			expect(s.status).toBe('idle');
			expect(s.operation).toBe('regenerate');
		});
		await store.assertNoPendingActions();
	});

	it('drops the codes when the authenticator is turned off', async () => {
		// Codes for an authenticator that no longer exists are dead. Leaving them
		// up is worse than showing nothing: they look like something to keep.
		const store = mfaStore({}, { recoveryCodes: CODES });

		await store.send({ type: 'disableRequested' }, (s) => {
			expect(s.recoveryCodes).toBeNull();
		});
		await store.receive({ type: 'disableSucceeded' }, (s) => {
			expect(s.status).toBe('disabled');
			expect(s.recoveryCodes).toBeNull();
		});
		await store.assertNoPendingActions();
	});

	it('refuses either operation while the other is in flight', async () => {
		// Two effect ids, one guard. Disabling mid-regeneration issues codes for an
		// authenticator about to stop existing, and which of the two the backend
		// applies first is not something a client should bet on.
		const gate = deferred<void>();
		const disableMfa = vi.fn(async () => gate.promise);
		const regenerateRecoveryCodes = vi.fn(async () => ({ recoveryCodes: FRESH }));
		const store = mfaStore({ disableMfa, regenerateRecoveryCodes });

		await store.send({ type: 'disableRequested' }, (s) => {
			expect(s.status).toBe('disabling');
		});
		await store.send({ type: 'regenerateRequested' }, (s) => {
			expect(s.status).toBe('disabling');
		});
		expect(regenerateRecoveryCodes, 'a regeneration escaped the shared guard').not.toHaveBeenCalled();

		gate.resolve();
		await store.receive({ type: 'disableSucceeded' });
		await store.assertNoPendingActions();
	});

	it('refuses both once the authenticator is off', async () => {
		const disableMfa = vi.fn(async () => undefined);
		const regenerateRecoveryCodes = vi.fn(async () => ({ recoveryCodes: FRESH }));
		const store = mfaStore({ disableMfa, regenerateRecoveryCodes }, { status: 'disabled' });

		await store.send({ type: 'disableRequested' });
		await store.send({ type: 'regenerateRequested' });

		expect(disableMfa).not.toHaveBeenCalled();
		expect(
			regenerateRecoveryCodes,
			'offered to reissue codes for an authenticator that is off'
		).not.toHaveBeenCalled();
		await store.assertNoPendingActions();
	});

	it('names which operation was refused, and forgets it on dismissal', async () => {
		// `operation` is documented as null exactly when `error` is. A consumer
		// routing to a re-authentication prompt has to know what to retry, and
		// "whichever button they pressed" is not recoverable from another screen.
		const store = mfaStore({ disableMfa: vi.fn(async () => Promise.reject(NEEDS_PROOF)) });

		await store.send({ type: 'disableRequested' });
		await store.receive({ type: 'disableFailed' }, (s) => {
			expect(s.operation).toBe('disable');
			expect(s.error?.code).toBe('reauthentication_required');
			// Back to idle, which is what makes the retry after the prompt possible.
			expect(s.status).toBe('idle');
		});

		await store.send({ type: 'errorDismissed' }, (s) => {
			expect(s.error).toBeNull();
			expect(s.operation, 'the operation outlived the error it belonged to').toBeNull();
		});
		await store.assertNoPendingActions();
	});

	it('lets the user put the codes away', async () => {
		const store = mfaStore({}, { recoveryCodes: CODES });
		await store.send({ type: 'recoveryCodesAcknowledged' }, (s) => {
			expect(s.recoveryCodes).toBeNull();
			expect(s.status).toBe('idle');
		});
		await store.assertNoPendingActions();
	});
});

// ============================================================
// Connected accounts
// ============================================================

describe('detaching a provider', () => {
	it('asks the backend even when it looks like the only way in', async () => {
		// The arm the whole design turns on. `hasPassword: false` with one provider
		// is exactly the case a client-side rule would refuse — and it is also
		// exactly the case a magic-link backend allows. The client cannot tell, so
		// it does not try.
		const unlinkOAuthProvider = vi.fn(async () => undefined);
		const store = linkStore({ unlinkOAuthProvider });

		await store.send({ type: 'unlinkRequested', provider: 'github' }, (s) => {
			expect(s.status).toBe('unlinking');
			expect(s.provider).toBe('github');
		});
		await store.receive({ type: 'unlinkSucceeded' }, (s) => {
			expect(s.unlinked).toEqual(['github']);
			expect(s.status).toBe('idle');
		});

		expect(unlinkOAuthProvider).toHaveBeenCalledWith('github', expect.anything());
		await store.assertNoPendingActions();
	});

	it('shows the backend refusal against the provider it is about', async () => {
		// `provider` is kept on failure, unlike `oauth-start`, which nulls it. There
		// the error is one banner over a row of buttons; here it belongs beside the
		// row, and a null leaves the panel unable to say which one was refused.
		const refusal: AuthError = {
			code: 'unknown',
			message: 'That is the only way into this account.'
		};
		const store = linkStore({
			unlinkOAuthProvider: vi.fn(async () => Promise.reject(refusal))
		});

		await store.send({ type: 'unlinkRequested', provider: 'google' });
		await store.receive({ type: 'unlinkFailed' }, (s) => {
			expect(s.status).toBe('idle');
			expect(s.provider, 'the panel could not say which provider was refused').toBe('google');
			expect(s.error?.message).toContain('only way in');
			// Not detached — the row stays, which is the point of the refusal.
			expect(s.unlinked).toEqual([]);
		});
		await store.assertNoPendingActions();
	});

	it('refuses a second detachment of something already gone', async () => {
		const unlinkOAuthProvider = vi.fn(async () => undefined);
		const store = linkStore({ unlinkOAuthProvider }, { unlinked: ['github'] });

		await store.send({ type: 'unlinkRequested', provider: 'github' }, (s) => {
			expect(s.status).toBe('idle');
		});
		expect(
			unlinkOAuthProvider,
			'sent a detach for a provider the panel already shows as gone'
		).not.toHaveBeenCalled();
		await store.assertNoPendingActions();
	});

	it('ignores an answer that belongs to a different provider', async () => {
		const store = linkStore({}, { status: 'unlinking', provider: 'github' });

		await store.send({ type: 'unlinkSucceeded', provider: 'google' }, (s) => {
			expect(s.unlinked, 'a stale answer detached the wrong provider').toEqual([]);
			expect(s.status).toBe('unlinking');
		});
		await store.assertNoPendingActions();
	});

	it('records a provider once however often it comes and goes', async () => {
		const store = linkStore({}, { status: 'unlinking', provider: 'github', unlinked: ['github'] });
		await store.send({ type: 'unlinkSucceeded', provider: 'github' }, (s) => {
			expect(s.unlinked).toEqual(['github']);
		});
		await store.assertNoPendingActions();
	});
});

// ============================================================
// The intent that runs through the shared redirect
// ============================================================

describe('linking through the OAuth redirect', () => {
	function startStore(deps: Partial<OAuthStartDependencies> = {}) {
		const pendingOAuth = deps.pendingOAuth ?? createMemoryPendingOAuthStorage();
		return {
			pendingOAuth,
			store: createTestStore({
				initialState: createInitialOAuthStartState(),
				reducer: oauthStartReducer,
				dependencies: {
					beginOAuth: vi.fn(async () => ({
						authorizeUrl: 'https://provider.example/authorize',
						state: 'nonce-1'
					})),
					pendingOAuth,
					redirect: vi.fn(),
					...deps
				} satisfies OAuthStartDependencies
			})
		};
	}

	it('writes the intent into the record the callback will read', async () => {
		const { store, pendingOAuth } = startStore();

		await store.send({ type: 'authorizationRequested', provider: 'github', intent: 'link' });
		await store.receive({ type: 'authorizationReady' }, (s) => {
			expect(s.status).toBe('redirecting');
		});

		expect(pendingOAuth.take()?.intent).toBe('link');
		await store.assertNoPendingActions();
	});

	it('defaults to signing in, so every existing caller keeps working', async () => {
		const { store, pendingOAuth } = startStore();

		await store.send({ type: 'authorizationRequested', provider: 'github' });
		await store.receive({ type: 'authorizationReady' });

		expect(pendingOAuth.take()?.intent).toBe('signIn');
		await store.assertNoPendingActions();
	});

	it('rejects a stored record with no intent rather than assuming one', () => {
		// Defaulting here would turn an abandoned link attempt — or a record
		// written by an older version of this package — into a sign-in nobody
		// asked for. Refusing it lands on `oauth_state_mismatch`, which is the
		// honest verdict when the record cannot be trusted.
		//
		// Through the real `sessionStorage` path, because the memory storage does
		// not validate: it is the thing being tested that lives there.
		sessionStorage.clear();
		const storage = createPendingOAuthStorage();
		storage.put({ provider: 'github', intent: 'signIn', state: 'nonce-1', returnTo: null });

		// The key, recovered rather than hard-coded, so a rename cannot leave this
		// test quietly passing against a record nothing reads.
		const key = Object.keys(sessionStorage)[0];
		expect(key, 'the pending storage wrote nothing to recover a key from').toBeDefined();

		const written = JSON.parse(sessionStorage.getItem(key!)!) as Record<string, unknown>;
		const stripped = { ...written };
		// Nested one level in some storage encodings; strip wherever it lives.
		delete stripped['intent'];
		if (
			typeof stripped['value'] === 'object' &&
			stripped['value'] !== null
		) {
			const value = { ...(stripped['value'] as Record<string, unknown>) };
			delete value['intent'];
			stripped['value'] = value;
		}
		expect(
			JSON.stringify(stripped),
			'the record carried no intent to strip — the write is not what this asserts against'
		).not.toBe(JSON.stringify(written));

		sessionStorage.setItem(key!, JSON.stringify(stripped));

		expect(storage.take(), 'an intent-less record was accepted and defaulted').toBeNull();
		sessionStorage.clear();
	});

	function callbackStore(deps: Partial<OAuthCallbackDependencies>, record: PendingOAuth | null) {
		const pendingOAuth = createMemoryPendingOAuthStorage();
		if (record !== null) pendingOAuth.put(record);
		return createTestStore({
			initialState: createInitialOAuthCallbackState(),
			reducer: oauthCallbackReducer,
			dependencies: {
				completeOAuth: vi.fn(async () => SESSION),
				pendingOAuth,
				...deps
			} satisfies OAuthCallbackDependencies
		});
	}

	it('attaches the provider without establishing a second session', async () => {
		// The whole difference from a sign-in. Linking adds a way into the account
		// you are already in; a session here would be a sign-in nobody asked for.
		const completeOAuth = vi.fn(async () => SESSION);
		const linkOAuthProvider = vi.fn(async () => undefined);
		const store = callbackStore(
			{ completeOAuth, linkOAuthProvider },
			{ provider: 'github', intent: 'link', state: 'nonce-1', returnTo: '/settings' }
		);

		await store.send({
			type: 'callbackReceived',
			params: { code: 'abc', state: 'nonce-1', error: null, errorDescription: null }
		});
		await store.receive({ type: 'exchangeSucceeded' }, (s) => {
			expect(s.status).toBe('completed');
			expect(s.intent).toBe('link');
			expect(s.session, 'linking a provider established a session').toBeNull();
			expect(s.returnTo).toBe('/settings');
		});

		expect(linkOAuthProvider).toHaveBeenCalledWith('github', 'abc', 'nonce-1', expect.anything());
		expect(completeOAuth, 'a link went through the sign-in exchange').not.toHaveBeenCalled();
		await store.assertNoPendingActions();
	});

	it('still signs in when that is what the record says', async () => {
		const completeOAuth = vi.fn(async () => SESSION);
		const linkOAuthProvider = vi.fn(async () => undefined);
		const store = callbackStore(
			{ completeOAuth, linkOAuthProvider },
			{ provider: 'github', intent: 'signIn', state: 'nonce-1', returnTo: null }
		);

		await store.send({
			type: 'callbackReceived',
			params: { code: 'abc', state: 'nonce-1', error: null, errorDescription: null }
		});
		await store.receive({ type: 'exchangeSucceeded' }, (s) => {
			expect(s.intent).toBe('signIn');
			expect(s.session).toEqual(SESSION);
		});

		expect(completeOAuth).toHaveBeenCalled();
		expect(linkOAuthProvider).not.toHaveBeenCalled();
		await store.assertNoPendingActions();
	});

	it('says a link failed, not a sign-in', async () => {
		// Without the intent on the failure action, someone already signed in is
		// told their sign-in did not work.
		const store = callbackStore(
			{
				linkOAuthProvider: vi.fn(async () =>
					Promise.reject({ code: 'unknown', message: 'nope' } satisfies AuthError)
				)
			},
			{ provider: 'github', intent: 'link', state: 'nonce-1', returnTo: null }
		);

		await store.send({
			type: 'callbackReceived',
			params: { code: 'abc', state: 'nonce-1', error: null, errorDescription: null }
		});
		await store.receive({ type: 'exchangeFailed' }, (s) => {
			expect(s.status).toBe('failed');
			expect(s.intent, 'a failed link was reported as a failed sign-in').toBe('link');
		});
		await store.assertNoPendingActions();
	});

	it('reports a link it has no way to finish instead of crashing', async () => {
		// `linkOAuthProvider` is optional, so an app that never offers linking need
		// not supply it. A returning link record then has to become a message, not
		// a `TypeError` on a page whose only other state is "one moment…".
		const store = callbackStore(
			{},
			{ provider: 'github', intent: 'link', state: 'nonce-1', returnTo: null }
		);

		await store.send({
			type: 'callbackReceived',
			params: { code: 'abc', state: 'nonce-1', error: null, errorDescription: null }
		});
		await store.receive({ type: 'exchangeFailed' }, (s) => {
			expect(s.status).toBe('failed');
			expect(s.intent).toBe('link');
			expect(s.error?.message).toContain('Nothing has changed');
		});
		await store.assertNoPendingActions();
	});

	it('cannot say which kind of return it was when the record is unreadable', async () => {
		// The one branch that genuinely does not know — and it must not guess,
		// because the guess would be shown as a claim.
		const store = callbackStore({}, null);

		await store.send({
			type: 'callbackReceived',
			params: { code: 'abc', state: 'nonce-1', error: null, errorDescription: null }
		});
		await store.receive({ type: 'exchangeFailed' }, (s) => {
			expect(s.error?.code).toBe('oauth_state_mismatch');
			expect(s.intent).toBeNull();
		});
		await store.assertNoPendingActions();
	});
});
