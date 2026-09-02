/**
 * The three flows that change or end an account — the reducers.
 *
 * Each carries one arm a plausible implementation gets wrong.
 *
 * `change-email`: **the pending address must yield to what the account
 * reports**, and yield by returning the *identical* state object when nothing
 * changed. The surface dispatches the observation from an effect, so a fresh
 * object each time re-triggers it forever — the defect this package has now
 * fixed in `mfaObserved` and `providersObserved` before it.
 *
 * `delete-account`: **the confirmation step lives in the reducer**, not only in
 * the markup. A consumer who renders their own dialog, or none at all, must not
 * be able to delete an account with one dispatch.
 *
 * `session-refresh`: **a network failure is not a sign-out.** Only
 * `invalid_credentials` means "stop asking"; anything else keeps the expiry and
 * retries, because signing someone out of a working session when their wifi
 * drops is worse than a late refresh.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';
import { createMockClock } from '@composable-svelte/core';

import {
	changeEmailReducer,
	createInitialChangeEmailState,
	deleteAccountReducer,
	createInitialDeleteAccountState,
	sessionRefreshReducer,
	createInitialSessionRefreshState,
	type ChangeEmailDependencies,
	type DeleteAccountDependencies,
	type SessionRefreshDependencies
} from '../src/lib/index.js';
import type { AuthError } from '../src/lib/errors/types.js';

// ---------------------------------------------------------------------------
// change-email
// ---------------------------------------------------------------------------

function changeEmailStore(deps: Partial<ChangeEmailDependencies> = {}) {
	return createTestStore({
		initialState: createInitialChangeEmailState(),
		reducer: changeEmailReducer,
		dependencies: {
			requestEmailChange: vi.fn(async () => undefined),
			resendEmailChange: vi.fn(async () => undefined),
			...deps
		} satisfies ChangeEmailDependencies
	});
}

describe('change-email', () => {
	it('records the pending address and clears the field', async () => {
		const store = changeEmailStore();

		await store.send({
			type: 'form',
			action: { type: 'fieldChanged', field: 'email', value: 'new@example.com' }
		});
		await store.send({ type: 'form', action: { type: 'submitTriggered' } });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'changeRequestSucceeded', email: 'new@example.com' }, (s) => {
			expect(s.pendingEmail).toBe('new@example.com');
			// Cleared, because the panel now says "we sent a link to …" and leaving
			// the value in the field says it twice.
			expect(s.form.data.email).toBe('');
			expect(s.status).toBe('idle');
		});
	});

	it('surfaces email_taken without losing anything', async () => {
		const taken: AuthError = {
			code: 'email_taken',
			message: 'That address already has an account.',
			email: 'taken@example.com'
		};
		const store = changeEmailStore({
			requestEmailChange: vi.fn(async () => {
				throw taken;
			})
		});

		await store.send({
			type: 'form',
			action: { type: 'fieldChanged', field: 'email', value: 'taken@example.com' }
		});
		await store.send({ type: 'form', action: { type: 'submitTriggered' } });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'changeRequestFailed', error: taken }, (s) => {
			expect(s.status).toBe('idle');
			expect(s.error).toEqual(taken);
			expect(s.pendingEmail, 'a refusal must not invent a pending change').toBeNull();
		});
	});

	it('refuses a resend when nothing is pending, returning the identical state', async () => {
		const resendEmailChange = vi.fn(async () => undefined);
		const store = changeEmailStore({ resendEmailChange });
		const before = store.state;

		await store.send({ type: 'resendRequested' });

		// `toBe`, not `toEqual`. A new object here re-triggers the surface effect
		// that dispatched it, forever.
		expect(store.state).toBe(before);
		expect(resendEmailChange).not.toHaveBeenCalled();
	});

	it('returns the identical state when the observed address is unchanged', async () => {
		const store = changeEmailStore();
		await store.send({ type: 'pendingEmailObserved', email: 'a@example.com' }, (s) => {
			expect(s.pendingEmail).toBe('a@example.com');
		});

		const settled = store.state;
		await store.send({ type: 'pendingEmailObserved', email: 'a@example.com' });
		expect(store.state).toBe(settled);
	});

	it('lets the account overrule a remembered pending address', async () => {
		// Someone confirmed the change in another tab; the account now reports
		// nothing pending, and this store's memory of it is wrong.
		const store = changeEmailStore();
		await store.send({ type: 'pendingEmailObserved', email: 'a@example.com' });
		await store.send({ type: 'pendingEmailObserved', email: null }, (s) => {
			expect(s.pendingEmail).toBeNull();
		});
	});
});

// ---------------------------------------------------------------------------
// delete-account
// ---------------------------------------------------------------------------

function deleteStore(deps: Partial<DeleteAccountDependencies> = {}) {
	return createTestStore({
		initialState: createInitialDeleteAccountState(),
		reducer: deleteAccountReducer,
		dependencies: {
			deleteAccount: vi.fn(async () => undefined),
			...deps
		} satisfies DeleteAccountDependencies
	});
}

describe('delete-account', () => {
	it('will not delete without a confirmation, whatever the markup does', async () => {
		const deleteAccount = vi.fn(async () => undefined);
		const store = deleteStore({ deleteAccount });

		await store.send({ type: 'deletionRequested' });

		expect(deleteAccount, 'one dispatch deleted an account').not.toHaveBeenCalled();
		expect(store.state.status).toBe('idle');
	});

	it('deletes once confirmed', async () => {
		const deleteAccount = vi.fn(async () => undefined);
		const store = deleteStore({ deleteAccount });

		await store.send({ type: 'confirmationRequested' }, (s) => {
			expect(s.status).toBe('confirming');
		});
		await store.send({ type: 'deletionRequested' }, (s) => {
			expect(s.status).toBe('deleting');
		});
		await store.receive({ type: 'deletionSucceeded' }, (s) => {
			expect(s.status).toBe('deleted');
		});
		expect(deleteAccount).toHaveBeenCalledTimes(1);
	});

	it('refuses to cancel once the request is out', async () => {
		// A deferred rather than a never-settling promise, so the effect is
		// arranged rather than abandoned — an effect left hanging at the end of a
		// test leaks into whatever runs next.
		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const store = deleteStore({ deleteAccount: vi.fn(() => held) });

		await store.send({ type: 'confirmationRequested' });
		await store.send({ type: 'deletionRequested' });
		const inFlight = store.state;

		// A confirmation that could be cancelled after the request went out would
		// lie about what happened.
		await store.send({ type: 'confirmationDismissed' });
		expect(store.state).toBe(inFlight);

		release();
		await store.receive({ type: 'deletionSucceeded' });
	});

	it('supports the re-authentication loop: refuse, prove, ask again', async () => {
		const demand: AuthError = {
			code: 'reauthentication_required',
			message: 'Confirm it is still you.',
			methods: ['password']
		};
		let calls = 0;
		const store = deleteStore({
			deleteAccount: vi.fn(async () => {
				calls += 1;
				if (calls === 1) throw demand;
			})
		});

		await store.send({ type: 'confirmationRequested' });
		await store.send({ type: 'deletionRequested' });
		await store.receive({ type: 'deletionFailed', error: demand }, (s) => {
			// Back to idle, not to a failed status — so it can be asked again.
			expect(s.status).toBe('idle');
			expect(s.error).toEqual(demand);
		});

		await store.send({ type: 'confirmationRequested' });
		await store.send({ type: 'deletionRequested' });
		await store.receive({ type: 'deletionSucceeded' }, (s) => {
			expect(s.status).toBe('deleted');
		});
	});
});

// ---------------------------------------------------------------------------
// session-refresh
// ---------------------------------------------------------------------------

const NOW = Date.parse('2026-01-01T12:00:00.000Z');

function refreshStore(deps: Partial<SessionRefreshDependencies> = {}) {
	const clock = createMockClock(NOW);
	const store = createTestStore({
		initialState: createInitialSessionRefreshState(),
		reducer: sessionRefreshReducer,
		dependencies: {
			refreshSession: vi.fn(async () => ({ expiresAt: null })),
			clock,
			leadMs: 60_000,
			tickMs: 30_000,
			...deps
		} satisfies SessionRefreshDependencies
	});
	return { store, clock };
}

const inMinutes = (n: number) => new Date(NOW + n * 60_000).toISOString();

describe('session-refresh', () => {
	it('does nothing while the expiry is far off, and returns the identical state', async () => {
		const refreshSession = vi.fn(async () => ({ expiresAt: null }));
		const { store } = refreshStore({ refreshSession });

		await store.send({ type: 'expiryObserved', expiresAt: inMinutes(30) });
		const settled = store.state;
		await store.send({ type: 'ticked' });

		expect(store.state).toBe(settled);
		expect(refreshSession).not.toHaveBeenCalled();
	});

	it('refreshes once inside the lead window', async () => {
		const refreshSession = vi.fn(async () => ({ expiresAt: inMinutes(45) }));
		const { store, clock } = refreshStore({ refreshSession });

		await store.send({ type: 'expiryObserved', expiresAt: inMinutes(2) });
		await store.send({ type: 'ticked' });
		expect(refreshSession, 'two minutes out, lead is one').not.toHaveBeenCalled();

		clock.advance(90_000);
		await store.send({ type: 'ticked' }, (s) => {
			expect(s.status).toBe('refreshing');
		});
		await store.receive({ type: 'refreshSucceeded', expiresAt: inMinutes(45) }, (s) => {
			expect(s.status).toBe('idle');
			expect(s.expiresAt).toBe(inMinutes(45));
		});
	});

	it('never refreshes when the backend advertises no expiry', async () => {
		const refreshSession = vi.fn(async () => ({ expiresAt: null }));
		const { store, clock } = refreshStore({ refreshSession });

		clock.advance(60 * 60_000);
		await store.send({ type: 'ticked' });

		expect(refreshSession).not.toHaveBeenCalled();
	});

	it('is inert on a malformed expiry rather than crashing', async () => {
		const refreshSession = vi.fn(async () => ({ expiresAt: null }));
		const { store } = refreshStore({ refreshSession });

		await store.send({ type: 'expiryObserved', expiresAt: 'not-a-date' });
		await store.send({ type: 'ticked' });

		expect(refreshSession).not.toHaveBeenCalled();
		expect(store.state.status).toBe('idle');
	});

	it('keeps the expiry and retries after a network failure', async () => {
		const offline: AuthError = { code: 'network', message: 'Could not reach the server.' };
		const { store } = refreshStore({
			refreshSession: vi.fn(async () => {
				throw offline;
			})
		});

		await store.send({ type: 'expiryObserved', expiresAt: inMinutes(0) });
		await store.send({ type: 'ticked' });
		await store.receive({ type: 'refreshFailed', error: offline }, (s) => {
			// Not `ended`. A dropped connection may mean the request never arrived.
			expect(s.status).toBe('idle');
			expect(s.expiresAt, 'the expiry was thrown away on a maybe').toBe(inMinutes(0));
		});
	});

	it('ends only on invalid_credentials, and stops asking', async () => {
		const gone: AuthError = { code: 'invalid_credentials', message: 'Your session has ended.' };
		const refreshSession = vi.fn(async () => {
			throw gone;
		});
		const { store } = refreshStore({ refreshSession });

		await store.send({ type: 'expiryObserved', expiresAt: inMinutes(0) });
		await store.send({ type: 'ticked' });
		await store.receive({ type: 'refreshFailed', error: gone }, (s) => {
			expect(s.status).toBe('ended');
			expect(s.expiresAt).toBeNull();
		});

		const ended = store.state;
		await store.send({ type: 'ticked' });
		expect(store.state, 'it kept asking after the session ended').toBe(ended);
		expect(refreshSession).toHaveBeenCalledTimes(1);
	});

	it('leaves `ended` when a session exists again', async () => {
		// A fresh sign-in, so this is not a dead end.
		const gone: AuthError = { code: 'invalid_credentials', message: 'gone' };
		const { store } = refreshStore({
			refreshSession: vi.fn(async () => {
				throw gone;
			})
		});

		await store.send({ type: 'expiryObserved', expiresAt: inMinutes(0) });
		await store.send({ type: 'ticked' });
		await store.receive({ type: 'refreshFailed', error: gone });

		await store.send({ type: 'expiryObserved', expiresAt: inMinutes(30) }, (s) => {
			expect(s.status).toBe('idle');
		});
	});

	it('never produces a session snapshot', async () => {
		// The arm that goes red if someone "helpfully" widens `refreshSession` to
		// return a SessionSnapshot: a refresh landing after a sign-out would then
		// sign the user back in.
		const { store, clock } = refreshStore({
			refreshSession: vi.fn(async () => ({ expiresAt: inMinutes(45) }))
		});

		await store.send({ type: 'expiryObserved', expiresAt: inMinutes(0) });
		clock.advance(1000);
		await store.send({ type: 'ticked' });
		await store.receive({ type: 'refreshSucceeded', expiresAt: inMinutes(45) });

		expect(Object.keys(store.state).sort()).toEqual(['error', 'expiresAt', 'status']);
	});
});
