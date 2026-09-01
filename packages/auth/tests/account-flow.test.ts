/**
 * The account read model and the first action that acts on a signed-in user.
 *
 * Two arms carry this file. `refuses a second load` is the guard `mfa-enrolment`
 * needed for the same reason — a mount effect re-fires — and `reloads on
 * demand` is its counterpart, because a guard that also blocked the deliberate
 * refresh would leave a settings panel showing `hasPassword: false` after the
 * password had just been set.
 *
 * The other is `never asks for a current password`. That is the whole
 * re-authentication design: the client cannot know whether an account has one,
 * so it does not ask, and the backend says what it needs.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';

import {
	accountReducer,
	createInitialAccountState,
	changePasswordReducer,
	createInitialChangePasswordState
} from '../src/lib/flows/index.js';
import type {
	AccountDependencies,
	AccountState,
	ChangePasswordDependencies,
	ChangePasswordState
} from '../src/lib/flows/index.js';
import type { AccountSnapshot } from '../src/lib/deps.js';
import type { AuthError } from '../src/lib/errors/types.js';
import type { SessionSnapshot } from '../src/lib/subject/types.js';

const session: SessionSnapshot = {
	subject_id: '11111111-2222-3333-4444-555555555555',
	display_name: 'Ada',
	roles: ['member']
};

const ACCOUNT: AccountSnapshot = {
	email: 'ada@example.com',
	emailVerified: true,
	hasPassword: true,
	mfaEnabled: false,
	providers: []
};

const PASSWORD = 'correct-horse-battery-staple';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function accountStore(
	deps: Partial<AccountDependencies> = {},
	initial?: Partial<AccountState>
) {
	return createTestStore({
		initialState: { ...createInitialAccountState(), ...initial },
		reducer: accountReducer,
		dependencies: {
			fetchAccount: vi.fn(async () => ACCOUNT),
			...deps
		} satisfies AccountDependencies
	});
}

function passwordStore(
	deps: Partial<ChangePasswordDependencies> = {},
	initial?: Partial<ChangePasswordState>
) {
	return createTestStore({
		initialState: { ...createInitialChangePasswordState(), ...initial },
		reducer: changePasswordReducer,
		dependencies: {
			changePassword: vi.fn(async () => null),
			...deps
		} satisfies ChangePasswordDependencies
	});
}

async function submitPassword(store: ReturnType<typeof passwordStore>, value = PASSWORD) {
	for (const field of ['password', 'confirmPassword'] as const) {
		await store.send({ type: 'form', action: { type: 'fieldChanged', field, value } });
	}
	await store.send({ type: 'form', action: { type: 'submitTriggered' } });
	await store.receive({ type: 'form' }); // formValidationStarted
	await store.receive({ type: 'form' }); // formValidationCompleted
	await store.receive({ type: 'form' }); // submissionStarted
	await store.receive({ type: 'form' }); // submissionSucceeded
}

// ============================================================
// The read model
// ============================================================

describe('reading the account', () => {
	it('loads what the session does not carry', async () => {
		const fetchAccount = vi.fn<AccountDependencies['fetchAccount']>(async () => ACCOUNT);
		const store = accountStore({ fetchAccount });

		await store.send({ type: 'accountRequested' }, (s) => {
			expect(s.status).toBe('loading');
		});
		await store.receive({ type: 'accountLoaded' }, (s) => {
			expect(s.status).toBe('loaded');
			expect(s.account).toEqual(ACCOUNT);
		});

		expect(fetchAccount).toHaveBeenCalledTimes(1);
		store.assertNoPendingActions();
	});

	it('refuses a second load', async () => {
		// The surface dispatches this from a mount effect, and an effect re-runs
		// for reasons unrelated to its subject. Every settings page hits this
		// endpoint on arrival; a second request is pure waste.
		const fetchAccount = vi.fn<AccountDependencies['fetchAccount']>(async () => ACCOUNT);
		const store = accountStore({ fetchAccount }, { status: 'loaded', account: ACCOUNT });

		await store.send({ type: 'accountRequested' }, (s) => {
			expect(s.status).toBe('loaded');
		});

		expect(fetchAccount).not.toHaveBeenCalled();
		store.assertNoPendingActions();
	});

	it('reloads on demand, which the guard must not block', async () => {
		// The counterpart, and the reason `reloadRequested` exists as its own
		// action. Without it a settings panel would still say "Set a password"
		// after the password had just been set.
		const changed: AccountSnapshot = { ...ACCOUNT, hasPassword: false };
		const fetchAccount = vi
			.fn<AccountDependencies['fetchAccount']>()
			.mockResolvedValueOnce(changed)
			.mockResolvedValueOnce(ACCOUNT);
		const store = accountStore({ fetchAccount });

		await store.send({ type: 'accountRequested' });
		await store.receive({ type: 'accountLoaded' }, (s) => {
			expect(s.account?.hasPassword).toBe(false);
		});

		await store.send({ type: 'reloadRequested' }, (s) => {
			expect(s.status).toBe('loading');
			expect(s.account, 'the panel blanked while refreshing').toEqual(changed);
		});
		await store.receive({ type: 'accountLoaded' }, (s) => {
			expect(s.account?.hasPassword).toBe(true);
		});

		expect(fetchAccount).toHaveBeenCalledTimes(2);
	});

	it('keeps an account that is still true when a refresh fails', async () => {
		const fetchAccount = vi
			.fn<AccountDependencies['fetchAccount']>()
			.mockRejectedValueOnce({ code: 'network', message: 'Offline.' } satisfies AuthError);
		const store = accountStore({ fetchAccount }, { status: 'loaded', account: ACCOUNT });

		await store.send({ type: 'reloadRequested' });
		await store.receive({ type: 'accountFailed' }, (s) => {
			expect(s.status, 'a failed refresh threw away a good account').toBe('loaded');
			expect(s.account).toEqual(ACCOUNT);
			expect(s.error?.code).toBe('network');
		});
	});

	it('does not re-arm a mount guard when the first load fails', async () => {
		// The runaway this status exists to prevent. A surface reads
		// `status === 'idle'` from a mount effect; an earlier version returned to
		// `idle` on failure, which re-armed that condition — fail, re-dispatch,
		// fail. Measured with the documented pattern against a down endpoint: the
		// test runner hung for ten minutes.
		const fetchAccount = vi.fn<AccountDependencies['fetchAccount']>(async () => {
			throw { code: 'network', message: 'Offline.' } satisfies AuthError;
		});
		const store = accountStore({ fetchAccount });

		await store.send({ type: 'accountRequested' });
		await store.receive({ type: 'accountFailed' }, (s) => {
			expect(s.status, 'a mount effect reading `idle` would fire again').toBe('failed');
			expect(s.account).toBeNull();
		});

		// The mount effect fires again — a store change re-runs it — and is
		// refused, because `failed` is not `idle`.
		await store.send({ type: 'accountRequested' }, (s) => {
			expect(s.status).toBe('failed');
		});
		expect(fetchAccount, 'the guard let a second load through').toHaveBeenCalledTimes(1);
		store.assertNoPendingActions();
	});

	it('retries through the unguarded reload', async () => {
		// The counterpart: a "try again" button must still work from `failed`.
		const fetchAccount = vi
			.fn<AccountDependencies['fetchAccount']>()
			.mockRejectedValueOnce({ code: 'network', message: 'Offline.' } satisfies AuthError)
			.mockResolvedValueOnce(ACCOUNT);
		const store = accountStore({ fetchAccount });

		await store.send({ type: 'accountRequested' });
		await store.receive({ type: 'accountFailed' });

		await store.send({ type: 'reloadRequested' });
		await store.receive({ type: 'accountLoaded' }, (s) => {
			expect(s.status).toBe('loaded');
			expect(s.account).toEqual(ACCOUNT);
		});
	});
});

// ============================================================
// Changing the password
// ============================================================

describe('changing the password', () => {
	it('never asks for a current password', async () => {
		// The re-authentication design in one assertion. The client cannot know
		// whether the account has a password — an OAuth or magic-link account
		// never set one — so it sends only the new value and lets the backend
		// decide whether that is enough.
		const changePassword = vi.fn<ChangePasswordDependencies['changePassword']>(async () => null);
		const store = passwordStore({ changePassword });

		await submitPassword(store);
		await store.receive({ type: 'changeSucceeded' }, (s) => {
			expect(s.status).toBe('changed');
		});

		expect(changePassword).toHaveBeenCalledWith(PASSWORD, expect.anything());
		expect(
			changePassword.mock.calls[0],
			'something was sent besides the new password and a signal'
		).toHaveLength(2);
	});

	it('hands over a rotated session, and treats none as success too', async () => {
		const rotated = passwordStore({ changePassword: vi.fn(async () => session) });
		await submitPassword(rotated);
		await rotated.receive({ type: 'changeSucceeded' }, (s) => {
			expect(s.status).toBe('changed');
			expect(s.session).toEqual(session);
		});

		const kept = passwordStore({ changePassword: vi.fn(async () => null) });
		await submitPassword(kept);
		await kept.receive({ type: 'changeSucceeded' }, (s) => {
			expect(s.status, 'no rotated session was read as a failure').toBe('changed');
			expect(s.session).toBeNull();
		});
	});

	it('clears the fields once the password is live', async () => {
		// Unlike every sign-in flow, this panel stays on screen afterwards — so
		// leaving a working password sitting in two inputs is a real exposure.
		const store = passwordStore();

		await submitPassword(store);
		await store.receive({ type: 'changeSucceeded' }, (s) => {
			expect(s.form.data.password, 'a live password was left in the field').toBe('');
			expect(s.form.data.confirmPassword).toBe('');
		});
	});

	it('carries a re-authentication demand through intact', async () => {
		const store = passwordStore({
			changePassword: vi.fn(async () => {
				throw {
					code: 'reauthentication_required',
					message: 'Confirm it is you before changing this.',
					methods: ['password', 'totp']
				} satisfies AuthError;
			})
		});

		await submitPassword(store);
		await store.receive({ type: 'changeFailed' }, (s) => {
			expect(s.error).toMatchObject({
				code: 'reauthentication_required',
				methods: ['password', 'totp']
			});
			// Back to `idle`, and the fields are deliberately *not* cleared — the
			// user is about to confirm and should not retype what they entered.
			expect(s.status).toBe('idle');
			expect(s.form.data.password).toBe(PASSWORD);
		});
	});

	it('spends one request when submitted twice', async () => {
		const slow = deferred<SessionSnapshot | null>();
		const changePassword = vi
			.fn<ChangePasswordDependencies['changePassword']>()
			.mockReturnValue(slow.promise);
		const store = passwordStore({ changePassword });

		await submitPassword(store);
		await store.send({ type: 'form', action: { type: 'submitTriggered' } });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });

		expect(changePassword).toHaveBeenCalledTimes(2);

		slow.resolve(null);
		await store.receive({ type: 'changeSucceeded' });
		store.assertNoPendingActions();
	});

	it('refuses a password that does not meet the shared policy', async () => {
		const changePassword = vi.fn<ChangePasswordDependencies['changePassword']>(async () => null);
		const store = passwordStore({ changePassword });

		for (const field of ['password', 'confirmPassword'] as const) {
			await store.send({ type: 'form', action: { type: 'fieldChanged', field, value: 'short' } });
		}
		await store.send({ type: 'form', action: { type: 'submitTriggered' } });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' }, (s) => {
			expect(s.status).toBe('idle');
		});

		expect(changePassword).not.toHaveBeenCalled();
		store.assertNoPendingActions();
	});

	it('refuses a confirmation that does not match', async () => {
		const changePassword = vi.fn<ChangePasswordDependencies['changePassword']>(async () => null);
		const store = passwordStore({ changePassword });

		await store.send({
			type: 'form',
			action: { type: 'fieldChanged', field: 'password', value: PASSWORD }
		});
		await store.send({
			type: 'form',
			action: { type: 'fieldChanged', field: 'confirmPassword', value: `${PASSWORD}x` }
		});
		await store.send({ type: 'form', action: { type: 'submitTriggered' } });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' }, (s) => {
			expect(s.form.fields.confirmPassword.error).toBe('Passwords do not match');
		});

		expect(changePassword).not.toHaveBeenCalled();
	});

	it('does not trim either password field', async () => {
		// Whitespace is legitimate password content, and trimming one field and
		// not the other would produce a spurious "Passwords do not match".
		const changePassword = vi.fn<ChangePasswordDependencies['changePassword']>(async () => null);
		const store = passwordStore({ changePassword });
		const padded = `  ${PASSWORD}  `;

		await submitPassword(store, padded);
		await store.receive({ type: 'changeSucceeded' });

		expect(changePassword).toHaveBeenCalledWith(padded, expect.anything());
	});
});
