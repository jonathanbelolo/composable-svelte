/**
 * The email-verification flow.
 *
 * The assertion this file exists for is `refuses a second exchange of the same
 * token`. Confirmation tokens are single-use, and this flow is started from a
 * component effect rather than a click — effects re-run for reasons that have
 * nothing to do with the token. A flow that exchanged it twice would turn a
 * working link into a spent one, and the second failure would look like the
 * user's fault.
 *
 * The other shape worth pinning: confirming and resending are independent, so a
 * failed confirmation with a resend in flight has to be representable. That is
 * the ordinary state of this page.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';

import {
	emailVerificationReducer,
	createInitialEmailVerificationState,
	tokenFromUrl,
	type EmailVerificationDependencies,
	type EmailVerificationState
} from '../src/lib/flows/index.js';
import type { SessionSnapshot } from '../src/lib/subject/index.js';
import type { AuthError } from '../src/lib/errors/index.js';

const session: SessionSnapshot = {
	subject_id: '99999999-8888-7777-6666-555555555555',
	display_name: 'Ada',
	roles: ['member']
};

const EXPIRED: AuthError = { code: 'token_expired', message: 'That link is no longer valid.' };

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function inert(): EmailVerificationDependencies {
	return {
		verifyEmail: vi.fn(async () => null),
		resendVerification: vi.fn(async () => undefined)
	};
}

function makeStore(
	deps: Partial<EmailVerificationDependencies> = {},
	initial?: Partial<EmailVerificationState>
) {
	return createTestStore({
		initialState: { ...createInitialEmailVerificationState('ada@example.com'), ...initial },
		reducer: emailVerificationReducer,
		dependencies: { ...inert(), ...deps }
	});
}

describe('confirming a token', () => {
	it('verifies without a session when the backend issues none', async () => {
		// A success. The address is confirmed and the user still has to sign in —
		// treating a null session as a failure is the obvious way to get this
		// wrong.
		const verifyEmail = vi.fn(async () => null);
		const store = makeStore({ verifyEmail });

		await store.send({ type: 'verificationRequested', token: 'tok_1' }, (state) => {
			expect(state.status).toBe('verifying');
		});
		await store.receive({ type: 'verificationSucceeded' }, (state) => {
			expect(state.status).toBe('verified');
			expect(state.session, 'a session appeared without one being issued').toBeNull();
			expect(state.error).toBeNull();
		});

		expect(verifyEmail).toHaveBeenCalledWith('tok_1', expect.anything());
		store.assertNoPendingActions();
	});

	it('carries the session when confirming also signs in', async () => {
		const store = makeStore({ verifyEmail: vi.fn(async () => session) });

		await store.send({ type: 'verificationRequested', token: 'tok_1' });
		await store.receive({ type: 'verificationSucceeded' }, (state) => {
			expect(state.status).toBe('verified');
			expect(state.session).toEqual(session);
		});
	});

	it('refuses a second exchange of the same token', async () => {
		// The reason this guard exists. The surface dispatches from mount, and a
		// component effect re-runs when a prop changes or a parent re-renders. A
		// single-use token exchanged twice is spent, and the user is told their
		// working link is broken.
		const verifyEmail = vi.fn(async () => null);
		const store = makeStore({ verifyEmail });

		await store.send({ type: 'verificationRequested', token: 'tok_1' });
		await store.receive({ type: 'verificationSucceeded' });

		// Whatever made it fire again.
		await store.send({ type: 'verificationRequested', token: 'tok_1' }, (state) => {
			expect(state.status, 'a verified token was exchanged again').toBe('verified');
		});

		expect(verifyEmail).toHaveBeenCalledTimes(1);
		store.assertNoPendingActions();
	});

	it('refuses a second request while the first is still running', async () => {
		const gate = deferred<SessionSnapshot | null>();
		const verifyEmail = vi.fn(async () => gate.promise);
		const store = makeStore({ verifyEmail });

		await store.send({ type: 'verificationRequested', token: 'tok_1' });
		await store.send({ type: 'verificationRequested', token: 'tok_1' });

		expect(verifyEmail).toHaveBeenCalledTimes(1);

		gate.resolve(null);
		await store.receive({ type: 'verificationSucceeded' });
		store.assertNoPendingActions();
	});

	it('allows a fresh token after a failure', async () => {
		// The counterpart to the guard, and why failure returns to `idle` rather
		// than to a terminal status: the user follows the link from a resent mail
		// without reloading the page, and that has to work.
		const verifyEmail = vi
			.fn<EmailVerificationDependencies['verifyEmail']>()
			.mockRejectedValueOnce(EXPIRED)
			.mockResolvedValueOnce(null);
		const store = makeStore({ verifyEmail });

		await store.send({ type: 'verificationRequested', token: 'stale' });
		await store.receive({ type: 'verificationFailed' }, (state) => {
			expect(state.status).toBe('idle');
			expect(state.error?.code).toBe('token_expired');
		});

		await store.send({ type: 'verificationRequested', token: 'fresh' });
		await store.receive({ type: 'verificationSucceeded' }, (state) => {
			expect(state.status).toBe('verified');
			expect(state.error, 'the old failure survived a success').toBeNull();
		});

		expect(verifyEmail).toHaveBeenCalledTimes(2);
	});

	it('classifies a bare throw rather than losing it', async () => {
		const store = makeStore({
			verifyEmail: vi.fn(async () => {
				throw new Error('the backend fell over');
			})
		});

		await store.send({ type: 'verificationRequested', token: 'tok_1' });
		await store.receive({ type: 'verificationFailed' }, (state) => {
			expect(state.error?.code).toBe('unknown');
			expect(state.error?.message).toBe('the backend fell over');
		});
	});
});

describe('resending', () => {
	it('runs alongside a failed confirmation', async () => {
		// Both at once is the ordinary state of this page, which is why the two
		// are tracked separately rather than sharing one status.
		const resendVerification = vi.fn(async () => undefined);
		const store = makeStore(
			{
				verifyEmail: vi.fn(async () => {
					throw EXPIRED;
				}),
				resendVerification
			},
			{ email: 'ada@example.com' }
		);

		await store.send({ type: 'verificationRequested', token: 'stale' });
		await store.receive({ type: 'verificationFailed' });

		await store.send({ type: 'resendRequested' }, (state) => {
			expect(state.resendStatus).toBe('sending');
			expect(state.error?.code, 'the confirmation failure was cleared by a resend').toBe(
				'token_expired'
			);
		});
		await store.receive({ type: 'resendSucceeded' }, (state) => {
			expect(state.resendStatus).toBe('sent');
			expect(state.error?.code, 'still true: that link is still dead').toBe('token_expired');
		});

		expect(resendVerification).toHaveBeenCalledWith('ada@example.com', expect.anything());
		store.assertNoPendingActions();
	});

	it('does nothing when it has no address to send to', async () => {
		// Not an error. A surface that never learned the address simply does not
		// offer the button, and dispatching anyway must not invent a failure.
		const resendVerification = vi.fn(async () => undefined);
		const store = makeStore({ resendVerification }, { email: null });

		await store.send({ type: 'resendRequested' }, (state) => {
			expect(state.resendStatus).toBe('idle');
			expect(state.resendError).toBeNull();
		});

		expect(resendVerification).not.toHaveBeenCalled();
		store.assertNoPendingActions();
	});

	it('does not stack requests', async () => {
		const gate = deferred<void>();
		const resendVerification = vi.fn(async () => gate.promise);
		const store = makeStore({ resendVerification });

		await store.send({ type: 'resendRequested' });
		await store.send({ type: 'resendRequested' });

		expect(resendVerification).toHaveBeenCalledTimes(1);

		gate.resolve();
		await store.receive({ type: 'resendSucceeded' });
		store.assertNoPendingActions();
	});

	it('keeps its failure apart from the confirmation failure', async () => {
		const store = makeStore({
			resendVerification: vi.fn(async () => {
				throw { code: 'rate_limited', message: 'Too many.' } satisfies AuthError;
			})
		});

		await store.send({ type: 'resendRequested' });
		await store.receive({ type: 'resendFailed' }, (state) => {
			expect(state.resendError?.code).toBe('rate_limited');
			expect(state.resendStatus, 'a failed resend must be retryable').toBe('idle');
			expect(state.error, 'a resend failure leaked into the confirmation error').toBeNull();
		});
	});
});

describe('learning the address later', () => {
	it('accepts one after the store was built', async () => {
		// Arriving with no token and no known address is the commonest way to
		// reach this page. Without this action the surface could not offer a
		// resend and had no way to be given an address — a dead end.
		const resendVerification = vi.fn(async () => undefined);
		const store = makeStore({ resendVerification }, { email: null });

		await store.send({ type: 'resendRequested' });
		expect(resendVerification, 'sent with nowhere to send it').not.toHaveBeenCalled();

		await store.send({ type: 'emailProvided', email: 'ada@example.com' }, (state) => {
			expect(state.email).toBe('ada@example.com');
		});

		await store.send({ type: 'resendRequested' });
		await store.receive({ type: 'resendSucceeded' });

		expect(resendVerification).toHaveBeenCalledWith('ada@example.com', expect.anything());
		store.assertNoPendingActions();
	});

	it('leaves a resend already in flight alone', async () => {
		// It is going to the old address, and cancelling would lose a mail the
		// user already asked for while `resendStatus` claimed otherwise.
		const gate = deferred<void>();
		const resendVerification = vi.fn(async () => gate.promise);
		const store = makeStore({ resendVerification }, { email: 'old@example.com' });

		await store.send({ type: 'resendRequested' });
		await store.send({ type: 'emailProvided', email: 'new@example.com' }, (state) => {
			expect(state.resendStatus, 'an in-flight resend was disturbed').toBe('sending');
			expect(state.email).toBe('new@example.com');
		});

		gate.resolve();
		await store.receive({ type: 'resendSucceeded' });
		expect(resendVerification).toHaveBeenCalledWith('old@example.com', expect.anything());
		store.assertNoPendingActions();
	});
});

describe('dismissing', () => {
	it('clears both channels, because the surface shows them together', async () => {
		const store = makeStore({}, { error: EXPIRED, resendError: EXPIRED });

		await store.send({ type: 'errorDismissed' }, (state) => {
			expect(state.error).toBeNull();
			expect(state.resendError).toBeNull();
		});
	});

	it('dismissing nothing changes nothing', async () => {
		const store = makeStore();
		const before = store.state;

		await store.send({ type: 'errorDismissed' });

		expect(store.state).toBe(before);
	});
});

describe('tokenFromUrl', () => {
	it('reads the parameter', () => {
		expect(tokenFromUrl('https://app.example.com/verify?token=abc123')).toBe('abc123');
		expect(tokenFromUrl('https://app.example.com/verify?t=abc', 't')).toBe('abc');
	});

	it('treats an empty parameter as a missing one', () => {
		// `?token=` is what a mail client mangling a link produces. Sending "" to
		// the backend only produces a confusing failure.
		expect(tokenFromUrl('https://app.example.com/verify?token=')).toBeNull();
	});

	it('returns null rather than throwing on anything that is not a URL', () => {
		// Callers pass `window.location.href`, but a server-side caller or a test
		// can pass anything, and a verification page that throws on mount shows
		// nothing at all.
		expect(tokenFromUrl('')).toBeNull();
		expect(tokenFromUrl('not a url')).toBeNull();
		expect(tokenFromUrl('https://app.example.com/verify')).toBeNull();
	});
});
