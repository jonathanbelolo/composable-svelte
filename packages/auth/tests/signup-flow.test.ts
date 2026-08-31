/**
 * The signup flow.
 *
 * Two assertions carry this file. The first is that a signup has **two**
 * terminal states and both are successes — a backend requiring email
 * confirmation cannot return a session, and treating that as a failure is the
 * commonest way to get signup wrong.
 *
 * The second is that the criteria shown to a user and the schema that rejects
 * them cannot disagree. They are derived from the same constants, and
 * `agrees with the schema on every sample` is what keeps them that way.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';

import {
	signupReducer,
	createInitialSignupState,
	signupSchema,
	meetsPasswordCriteria,
	evaluatePasswordCriteria,
	passwordCriteria,
	PASSWORD_MIN_LENGTH,
	PASSWORD_MAX_LENGTH,
	type SignupDependencies,
	type SignupState
} from '../src/lib/flows/index.js';
import type { SessionSnapshot } from '../src/lib/subject/index.js';
import type { AuthError } from '../src/lib/errors/index.js';

const session: SessionSnapshot = {
	subject_id: '22222222-3333-4444-5555-666666666666',
	display_name: 'Grace',
	roles: ['member']
};

const GOOD_PASSWORD = 'correct-horse-battery';

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function makeStore(deps: SignupDependencies, initial?: Partial<SignupState>) {
	return createTestStore({
		initialState: { ...createInitialSignupState(), ...initial },
		reducer: signupReducer,
		dependencies: deps
	});
}

/** Fill the three fields and submit, which is what a user does. */
async function submit(
	store: ReturnType<typeof makeStore>,
	email = 'grace@example.com',
	password = GOOD_PASSWORD,
	confirmPassword = password
) {
	for (const [field, value] of [
		['email', email],
		['password', password],
		['confirmPassword', confirmPassword]
	] as const) {
		await store.send({ type: 'form', action: { type: 'fieldChanged', field, value } });
	}
	await store.send({ type: 'form', action: { type: 'submitTriggered' } });
	await store.receive({ type: 'form' }); // formValidationStarted
	await store.receive({ type: 'form' }); // formValidationCompleted
}

describe('the password policy', () => {
	it('agrees with the schema on every sample', () => {
		// The whole reason the criteria are derived from the schema's constants.
		// A checklist that says "you are done" while validation says otherwise is
		// worse than no checklist, and the two drift the moment either is edited
		// by hand.
		const samples = [
			'',
			'short',
			'exactly11ch',
			'a'.repeat(PASSWORD_MIN_LENGTH - 1),
			'a'.repeat(PASSWORD_MIN_LENGTH),
			'a'.repeat(PASSWORD_MAX_LENGTH),
			'a'.repeat(PASSWORD_MAX_LENGTH + 1),
			GOOD_PASSWORD,
			'🔒'.repeat(20)
		];

		for (const password of samples) {
			const schemaAccepts = signupSchema.safeParse({
				email: 'a@b.com',
				password,
				confirmPassword: password
			}).success;

			expect(meetsPasswordCriteria(password), `disagreed on ${JSON.stringify(password)}`).toBe(
				schemaAccepts
			);
		}
	});

	it('asks for length and nothing else', () => {
		// NIST 800-63B: composition rules push people toward `Passw0rd!`. If a
		// character-class rule is ever added, this fails and the decision gets
		// made deliberately rather than by drift.
		expect(passwordCriteria.map((c) => c.id)).toEqual(['length', 'maximum']);

		const longButPlain = 'aaaaaaaaaaaaaaaa';
		expect(meetsPasswordCriteria(longButPlain), 'a long lowercase passphrase was refused').toBe(
			true
		);
	});

	it('reports each criterion separately, so a UI can show progress', () => {
		const evaluated = evaluatePasswordCriteria('short');

		expect(evaluated.map((e) => e.met)).toEqual([false, true]);
		expect(evaluated[0]!.criterion.label).toContain(String(PASSWORD_MIN_LENGTH));
	});
});

describe('creating an account', () => {
	it('signs in when the backend issues a session', async () => {
		const signup: SignupDependencies['signup'] = vi.fn(async () => ({
			kind: 'session' as const,
			session
		}));
		const store = makeStore({ signup });

		await submit(store);
		await store.receive({ type: 'form' }); // submissionStarted
		await store.receive({ type: 'form' }); // submissionSucceeded — the flow takes over
		await store.receive({ type: 'signupSucceeded' }, (state) => {
			expect(state.status).toBe('succeeded');
			expect(state.session).toEqual(session);
			expect(state.pendingEmail).toBeNull();
			expect(state.error).toBeNull();
		});

		expect(signup).toHaveBeenCalledWith(
			{ email: 'grace@example.com', password: GOOD_PASSWORD },
			expect.anything()
		);
		store.assertNoPendingActions();
	});

	it('waits on the mail when the backend issues no session', async () => {
		// The branch a one-terminal-state design gets wrong. This is a success:
		// the account exists, `error` stays null, and the surface owes the user a
		// "check your email" panel rather than a red banner.
		const signup: SignupDependencies['signup'] = vi.fn(async () => ({
			kind: 'verificationRequired' as const,
			email: 'grace@example.com'
		}));
		const store = makeStore({ signup });

		await submit(store);
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'verificationRequired' }, (state) => {
			expect(state.status).toBe('awaitingVerification');
			expect(state.pendingEmail).toBe('grace@example.com');
			expect(state.session, 'a session appeared without one being issued').toBeNull();
			expect(state.error, 'waiting on a mail is not a failure').toBeNull();
		});

		store.assertNoPendingActions();
	});

	it('does not reach the network when the passwords differ', async () => {
		// The rule that made this flow worth having a cross-field fix for. The
		// form has to stop it; the reducer must never see `submissionSucceeded`.
		const signup = vi.fn();
		const store = makeStore({ signup } as unknown as SignupDependencies);

		await submit(store, 'grace@example.com', GOOD_PASSWORD, 'something-else-entirely');

		expect(signup).not.toHaveBeenCalled();
		expect(store.state.status).toBe('idle');
		expect(store.state.form.fields.confirmPassword.error).toBe('Passwords do not match');
		store.assertNoPendingActions();
	});

	it('does not reach the network when the password is too short', async () => {
		const signup = vi.fn();
		const store = makeStore({ signup } as unknown as SignupDependencies);

		await submit(store, 'grace@example.com', 'short', 'short');

		expect(signup).not.toHaveBeenCalled();
		expect(store.state.form.fields.password.error).toContain(String(PASSWORD_MIN_LENGTH));
		store.assertNoPendingActions();
	});
});

describe('when signup fails', () => {
	it('keeps `email_taken` branchable rather than flattening it', async () => {
		// The arm this flow adds to the union. A surface reads `code` and offers
		// "sign in instead"; it cannot make that offer from a sentence.
		const failure: AuthError = {
			code: 'email_taken',
			message: 'An account already exists for that address.',
			email: 'grace@example.com'
		};
		const store = makeStore({
			signup: vi.fn(async () => {
				throw failure;
			})
		});

		await submit(store);
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'signupFailed' }, (state) => {
			expect(state.error?.code).toBe('email_taken');
			expect(
				state.error?.code === 'email_taken' && state.error.email,
				'the address was flattened away'
			).toBe('grace@example.com');
			expect(state.status, 'the form must be usable again').toBe('idle');
		});
	});

	it('classifies a bare throw rather than losing it', async () => {
		const store = makeStore({
			signup: vi.fn(async () => {
				throw new Error('the backend fell over');
			})
		});

		await submit(store);
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });
		await store.receive({ type: 'signupFailed' }, (state) => {
			expect(state.error?.code).toBe('unknown');
			expect(state.error?.message).toBe('the backend fell over');
		});
	});

	it('clears the failure as soon as a field is edited', async () => {
		const store = makeStore(
			{ signup: vi.fn() as unknown as SignupDependencies['signup'] },
			{ error: { code: 'email_taken', message: 'Already taken.' } }
		);

		await store.send(
			{ type: 'form', action: { type: 'fieldChanged', field: 'email', value: 'other@example.com' } },
			(state) => {
				expect(state.error, 'a stale failure survived the correction').toBeNull();
			}
		);
	});

	it('can be dismissed without touching the fields', async () => {
		const store = makeStore(
			{ signup: vi.fn() as unknown as SignupDependencies['signup'] },
			{ error: { code: 'email_taken', message: 'Already taken.' } }
		);

		await store.send({ type: 'errorDismissed' }, (state) => {
			expect(state.error).toBeNull();
		});
	});

	it('dismissing nothing changes nothing', async () => {
		const store = makeStore({ signup: vi.fn() as unknown as SignupDependencies['signup'] });
		const before = store.state;

		await store.send({ type: 'errorDismissed' });

		expect(store.state).toBe(before);
	});
});

describe('a second submit while the first is in flight', () => {
	it('supersedes rather than races', async () => {
		const first = deferred<{ kind: 'session'; session: SessionSnapshot }>();
		const second = deferred<{ kind: 'session'; session: SessionSnapshot }>();
		const calls: string[] = [];
		const signup: SignupDependencies['signup'] = vi.fn(async (credentials) => {
			calls.push(credentials.email);
			return calls.length === 1 ? first.promise : second.promise;
		});
		const store = makeStore({ signup });

		await submit(store, 'first@example.com');
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });

		await submit(store, 'second@example.com');
		await store.receive({ type: 'form' });
		await store.receive({ type: 'form' });

		expect(signup).toHaveBeenCalledTimes(2);

		first.resolve({ kind: 'session', session: { subject_id: 'first-user' } });
		second.resolve({ kind: 'session', session });

		await store.receive({ type: 'signupSucceeded' }, (state) => {
			expect(state.session?.subject_id, 'the superseded signup landed').toBe(session.subject_id);
		});

		store.assertNoPendingActions();
	});
});
