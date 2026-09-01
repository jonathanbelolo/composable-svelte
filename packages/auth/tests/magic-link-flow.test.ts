/**
 * The two magic-link reducers.
 *
 * The arm that carries this file is `spends the token only when asked`. The
 * whole reason this flow does not mirror `email-verification` is that a mail
 * scanner following the link would otherwise spend a single-use sign-in token
 * before its owner ever saw the page — so "mounting does nothing" is the
 * feature, not an omission, and it needs an assertion rather than a comment.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';

import {
	magicLinkRequestReducer,
	createInitialMagicLinkRequestState,
	magicLinkSignInReducer,
	createInitialMagicLinkSignInState
} from '../src/lib/flows/index.js';
import type {
	MagicLinkRequestDependencies,
	MagicLinkRequestState,
	MagicLinkSignInDependencies,
	MagicLinkSignInState
} from '../src/lib/flows/index.js';
import type { AuthError } from '../src/lib/errors/types.js';
import type { SessionSnapshot } from '../src/lib/subject/types.js';

const session: SessionSnapshot = {
	subject_id: '11111111-2222-3333-4444-555555555555',
	display_name: 'Ada',
	roles: ['member']
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function requestStore(
	deps: Partial<MagicLinkRequestDependencies> = {},
	initial?: Partial<MagicLinkRequestState>
) {
	return createTestStore({
		initialState: { ...createInitialMagicLinkRequestState(), ...initial },
		reducer: magicLinkRequestReducer,
		dependencies: {
			requestMagicLink: vi.fn(async () => undefined),
			...deps
		} satisfies MagicLinkRequestDependencies
	});
}

function signInStore(
	deps: Partial<MagicLinkSignInDependencies> = {},
	initial?: Partial<MagicLinkSignInState>
) {
	return createTestStore({
		initialState: { ...createInitialMagicLinkSignInState('tok_1'), ...initial },
		reducer: magicLinkSignInReducer,
		dependencies: {
			signInWithMagicLink: vi.fn(async () => session),
			...deps
		} satisfies MagicLinkSignInDependencies
	});
}

async function submitEmail(store: ReturnType<typeof requestStore>, email = 'ada@example.com') {
	await store.send({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: email } });
	await store.send({ type: 'form', action: { type: 'submitTriggered' } });
	await store.receive({ type: 'form' }); // formValidationStarted
	await store.receive({ type: 'form' }); // formValidationCompleted
	await store.receive({ type: 'form' }); // submissionStarted
	await store.receive({ type: 'form' }); // submissionSucceeded
}

// ============================================================
// Asking
// ============================================================

describe('asking for a link', () => {
	it('sends the request and names the address it went to', async () => {
		const requestMagicLink = vi.fn<MagicLinkRequestDependencies['requestMagicLink']>(
			async () => undefined
		);
		const store = requestStore({ requestMagicLink });

		await submitEmail(store);
		await store.receive({ type: 'requestSent' }, (s) => {
			expect(s.status).toBe('sent');
			expect(s.requestedFor).toBe('ada@example.com');
		});

		expect(requestMagicLink).toHaveBeenCalledWith('ada@example.com', expect.anything());
		store.assertNoPendingActions();
	});

	it('clears the previous address before a new attempt', async () => {
		// Otherwise the confirmation names an inbox from a previous try, which is
		// exactly the stale claim that sends someone to check the wrong one.
		//
		// Asserted while the request is still open. Letting it resolve first would
		// assert nothing: `requestSent` writes the new address immediately, so the
		// window where a stale one could survive has already closed.
		const slow = deferred<void>();
		const store = requestStore(
			{ requestMagicLink: vi.fn(() => slow.promise) },
			{ status: 'sent', requestedFor: 'old@example.com' }
		);

		await submitEmail(store, 'new@example.com');

		expect(store.state.status).toBe('submitting');
		expect(store.state.requestedFor, 'a stale address survived into a new attempt').toBeNull();

		slow.resolve();
		await store.receive({ type: 'requestSent' }, (s) => {
			expect(s.requestedFor).toBe('new@example.com');
		});
	});

	it('never reaches the backend with an untrimmed address', async () => {
		// Not because the reducer trims — it does not, and a trim there would be
		// dead code. `z.string().email()` rejects surrounding whitespace, so the
		// form never submits and `requestMagicLink` is never called.
		//
		// Worth pinning because the obvious "fix" is a `.trim()` in the reducer,
		// which would look like it was doing something. The real gap is that a
		// pasted address with a trailing space is refused rather than cleaned, and
		// that is true of every email field in this package — recorded in the
		// hardening backlog rather than fixed in one of five places.
		const requestMagicLink = vi.fn<MagicLinkRequestDependencies['requestMagicLink']>(
			async () => undefined
		);
		const store = requestStore({ requestMagicLink });

		await store.send({
			type: 'form',
			action: { type: 'fieldChanged', field: 'email', value: '  ada@example.com  ' }
		});
		await store.send({ type: 'form', action: { type: 'submitTriggered' } });
		await store.receive({ type: 'form' }); // formValidationStarted
		await store.receive({ type: 'form' }, (s) => {
			// formValidationCompleted — with an error, so nothing is submitted.
			expect(s.status).toBe('idle');
		});

		expect(requestMagicLink).not.toHaveBeenCalled();
		store.assertNoPendingActions();
	});

	it('reports a refusal without claiming anything was sent', async () => {
		const store = requestStore({
			requestMagicLink: vi.fn(async () => {
				throw {
					code: 'rate_limited',
					message: 'Too many links requested.',
					retryAfterSeconds: 60
				} satisfies AuthError;
			})
		});

		await submitEmail(store);
		await store.receive({ type: 'requestFailed' }, (s) => {
			expect(s.status).toBe('idle');
			expect(s.requestedFor, 'a failed request still named an inbox').toBeNull();
			expect(s.error).toMatchObject({ code: 'rate_limited', retryAfterSeconds: 60 });
		});
	});

	it('supersedes a request still in flight rather than sending two', async () => {
		const slow = deferred<void>();
		const requestMagicLink = vi
			.fn<MagicLinkRequestDependencies['requestMagicLink']>()
			.mockReturnValueOnce(slow.promise)
			.mockResolvedValueOnce(undefined);
		const store = requestStore({ requestMagicLink });

		await submitEmail(store, 'first@example.com');
		await submitEmail(store, 'second@example.com');
		await store.receive({ type: 'requestSent' }, (s) => {
			expect(s.requestedFor).toBe('second@example.com');
		});

		slow.resolve();
		await store.finish();

		expect(requestMagicLink).toHaveBeenCalledTimes(2);
		expect(store.state.requestedFor, 'the abandoned request overwrote the live one').toBe(
			'second@example.com'
		);
	});
});

// ============================================================
// Using
// ============================================================

describe('using a link', () => {
	it('spends the token only when asked', async () => {
		// The arm this flow exists for. Nothing happens on entry: a mail scanner
		// that opens the page issues a GET and stops here, leaving the token for
		// whoever the mail was actually for.
		const signInWithMagicLink = vi.fn<MagicLinkSignInDependencies['signInWithMagicLink']>(
			async () => session
		);
		const store = signInStore({ signInWithMagicLink }, { token: null });

		await store.send({ type: 'tokenProvided', token: 'tok_1' }, (s) => {
			expect(s.status, 'holding a token started work') .toBe('idle');
		});
		expect(signInWithMagicLink, 'the token was spent without a press').not.toHaveBeenCalled();

		await store.send({ type: 'signInRequested' }, (s) => {
			expect(s.status).toBe('submitting');
		});
		await store.receive({ type: 'signInSucceeded' }, (s) => {
			expect(s.status).toBe('succeeded');
			expect(s.session).toEqual(session);
		});

		expect(signInWithMagicLink).toHaveBeenCalledWith('tok_1', expect.anything());
		store.assertNoPendingActions();
	});

	it('does not spend a token twice on a double press', async () => {
		// The second spend fails, so a user who double-clicks would be told a link
		// that just worked is no longer valid.
		const slow = deferred<SessionSnapshot>();
		const signInWithMagicLink = vi
			.fn<MagicLinkSignInDependencies['signInWithMagicLink']>()
			.mockReturnValue(slow.promise);
		const store = signInStore({ signInWithMagicLink });

		await store.send({ type: 'signInRequested' });
		await store.send({ type: 'signInRequested' });
		await store.send({ type: 'signInRequested' });

		expect(signInWithMagicLink, 'a double press spent the token again').toHaveBeenCalledTimes(1);

		slow.resolve(session);
		await store.receive({ type: 'signInSucceeded' });
		store.assertNoPendingActions();
	});

	it('does nothing with no token to spend', async () => {
		const signInWithMagicLink = vi.fn<MagicLinkSignInDependencies['signInWithMagicLink']>(
			async () => session
		);
		const store = signInStore({ signInWithMagicLink }, { token: null });

		await store.send({ type: 'signInRequested' }, (s) => {
			expect(s.status).toBe('idle');
		});
		expect(signInWithMagicLink).not.toHaveBeenCalled();
		store.assertNoPendingActions();
	});

	it('stays usable after a failure that a retry could fix', async () => {
		// Unlike the OAuth callback, which is terminal. An OAuth code is spent at
		// the provider before the app hears about it; a `network` failure here may
		// mean the request never arrived, so the token is untouched and pressing
		// again is a real recovery.
		const signInWithMagicLink = vi
			.fn<MagicLinkSignInDependencies['signInWithMagicLink']>()
			.mockRejectedValueOnce({ code: 'network', message: 'Offline.' } satisfies AuthError)
			.mockResolvedValueOnce(session);
		const store = signInStore({ signInWithMagicLink });

		await store.send({ type: 'signInRequested' });
		await store.receive({ type: 'signInFailed' }, (s) => {
			expect(s.status, 'a recoverable failure was made terminal').toBe('idle');
			expect(s.error?.code).toBe('network');
		});

		await store.send({ type: 'signInRequested' });
		await store.receive({ type: 'signInSucceeded' }, (s) => {
			expect(s.status).toBe('succeeded');
		});

		expect(signInWithMagicLink).toHaveBeenCalledTimes(2);
	});

	it('keeps a second factor intact when the backend asks for one', async () => {
		// Proving control of a mailbox is not proving possession of a device, and
		// a backend may reasonably want both.
		const store = signInStore({
			signInWithMagicLink: vi.fn(async () => {
				throw {
					code: 'mfa_required',
					message: 'Enter the code from your authenticator app.',
					challengeId: 'chal_magic',
					methods: ['totp']
				} satisfies AuthError;
			})
		});

		await store.send({ type: 'signInRequested' });
		await store.receive({ type: 'signInFailed' }, (s) => {
			expect(s.error).toMatchObject({ code: 'mfa_required', challengeId: 'chal_magic' });
		});
	});

	it('refuses a token that arrives after signing in', async () => {
		const signInWithMagicLink = vi.fn<MagicLinkSignInDependencies['signInWithMagicLink']>(
			async () => session
		);
		const store = signInStore({ signInWithMagicLink }, { status: 'succeeded', session });

		await store.send({ type: 'tokenProvided', token: 'tok_2' }, (s) => {
			expect(s.token, 'a spent flow accepted a fresh token').toBe('tok_1');
		});
		await store.send({ type: 'signInRequested' });
		expect(signInWithMagicLink).not.toHaveBeenCalled();
		store.assertNoPendingActions();
	});

	it('leaves an untouched state identical when there is nothing to dismiss', async () => {
		const store = signInStore();
		const before = store.state;
		await store.send({ type: 'errorDismissed' });
		expect(store.state).toBe(before);
	});
});
