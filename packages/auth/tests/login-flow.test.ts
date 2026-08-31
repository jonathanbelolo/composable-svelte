/**
 * The sign-in flow.
 *
 * The assertion this file exists for is `preserves the structured failure` — a
 * rejected `mfa_required` must arrive with its `challengeId` intact. Route the
 * auth call through core's `config.onSubmit` instead and it cannot: the form
 * reducer catches the throw and keeps `error.message`, a string. That single
 * test is what proves the flow-owns-submission split was necessary rather than
 * decorative.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';

import {
	loginReducer,
	createInitialLoginState,
	type LoginDependencies,
	type LoginState
} from '../src/lib/flows/index.js';
import type { SessionSnapshot } from '../src/lib/subject/index.js';

const session: SessionSnapshot = {
	subject_id: '11111111-2222-3333-4444-555555555555',
	display_name: 'Ada',
	roles: ['admin']
};

/** Hold an effect in flight, so a race can be arranged deterministically. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function makeStore(deps: LoginDependencies, initial?: Partial<LoginState>) {
	return createTestStore({
		initialState: { ...createInitialLoginState(), ...initial },
		reducer: loginReducer,
		dependencies: deps
	});
}

/** Fill both fields and submit, which is what a user does. */
async function submitCredentials(
	store: ReturnType<typeof makeStore>,
	email = 'ada@example.com',
	password = 'hunter2'
) {
	await store.send({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: email } });
	await store.send({
		type: 'form',
		action: { type: 'fieldChanged', field: 'password', value: password }
	});
	await store.send({ type: 'form', action: { type: 'submitTriggered' } });
	await store.receive({ type: 'form' }); // formValidationStarted
	await store.receive({ type: 'form' }); // formValidationCompleted
	await store.receive({ type: 'form' }); // submissionStarted
	await store.receive({ type: 'form' }); // submissionSucceeded — the flow takes over here
}

describe('signing in', () => {
	it('calls the dependency with what was typed', async () => {
		const login = vi.fn(async () => session);
		const store = makeStore({ login });

		await submitCredentials(store);
		await store.receive({ type: 'loginSucceeded' }, (state) => {
			expect(state.status).toBe('succeeded');
			expect(state.session).toEqual(session);
			expect(state.error).toBeNull();
		});

		expect(login).toHaveBeenCalledTimes(1);
		expect(login.mock.calls[0]![0]).toEqual({
			email: 'ada@example.com',
			password: 'hunter2',
			rememberMe: false
		});
		store.assertNoPendingActions();
	});

	it('does not call the dependency when the fields are invalid', async () => {
		// The form's job is to stop this. An empty password must not reach the
		// network, and validation failure must not leave the flow "submitting".
		const login = vi.fn(async () => session);
		const store = makeStore({ login });

		await store.send({
			type: 'form',
			action: { type: 'fieldChanged', field: 'email', value: 'not-an-email' }
		});
		await store.send({ type: 'form', action: { type: 'submitTriggered' } });
		await store.receive({ type: 'form' }); // formValidationStarted
		await store.receive({ type: 'form' }, (state) => {
			expect(state.status).toBe('idle');
		}); // formValidationCompleted, with errors

		expect(login).not.toHaveBeenCalled();
		store.assertNoPendingActions();
	});
});

describe('when sign-in fails', () => {
	it('preserves the structured failure, which a string could not carry', async () => {
		// The reason this flow owns the submission. Core's form reducer would have
		// caught this throw and kept `error.message` — so `challengeId`, and the
		// entire MFA branch, would be unreachable.
		const login = vi.fn(async () => {
			throw {
				code: 'mfa_required',
				message: 'Enter your authenticator code.',
				challengeId: 'chal_abc',
				methods: ['totp']
			};
		});
		const store = makeStore({ login });

		await submitCredentials(store);
		await store.receive({ type: 'loginFailed' }, (state) => {
			expect(state.error?.code).toBe('mfa_required');
			expect(
				state.error?.code === 'mfa_required' && state.error.challengeId,
				'the challenge id was flattened away'
			).toBe('chal_abc');
			expect(state.status, 'the form must be usable again').toBe('idle');
		});
	});

	it('classifies a bare throw rather than losing it', async () => {
		const login = vi.fn(async () => {
			throw new Error('the backend fell over');
		});
		const store = makeStore({ login });

		await submitCredentials(store);
		await store.receive({ type: 'loginFailed' }, (state) => {
			expect(state.error?.code).toBe('unknown');
			expect(state.error?.message).toBe('the backend fell over');
		});
	});

	it('clears the failure as soon as a field is edited', async () => {
		// Core never clears its own `submitError` on `fieldChanged`, so without
		// this the banner complains about a password the user is already fixing.
		const login = vi.fn(async () => {
			throw { code: 'invalid_credentials', message: 'Wrong password.' };
		});
		const store = makeStore({ login });

		await submitCredentials(store);
		await store.receive({ type: 'loginFailed' }, (state) => {
			expect(state.error).not.toBeNull();
		});

		await store.send(
			{ type: 'form', action: { type: 'fieldChanged', field: 'password', value: 'hunter3' } },
			(state) => {
				expect(state.error, 'a stale failure survived the correction').toBeNull();
			}
		);
	});

	it('can be dismissed without touching the fields', async () => {
		const store = makeStore(
			{ login: vi.fn(async () => session) },
			{ error: { code: 'invalid_credentials', message: 'Wrong password.' } }
		);

		await store.send({ type: 'errorDismissed' }, (state) => {
			expect(state.error).toBeNull();
		});
	});

	it('dismissing nothing changes nothing', async () => {
		// An identical object still notifies every subscriber.
		const store = makeStore({ login: vi.fn(async () => session) });
		const before = store.state;

		await store.send({ type: 'errorDismissed' });

		expect(store.state).toBe(before);
	});
});

describe('a second submit while the first is in flight', () => {
	it('supersedes rather than races', async () => {
		// The fixed cancellation id. Two sign-ins landing in either order would
		// otherwise be decided by the network.
		const first = deferred<SessionSnapshot>();
		const second = deferred<SessionSnapshot>();
		const calls: Array<{ email: string }> = [];
		const login = vi.fn(async (credentials: { email: string }) => {
			calls.push({ email: credentials.email });
			return calls.length === 1 ? first.promise : second.promise;
		});
		const store = makeStore({ login });

		await submitCredentials(store, 'first@example.com');
		await submitCredentials(store, 'second@example.com');

		expect(login).toHaveBeenCalledTimes(2);

		// The superseded request resolves late and must not land.
		first.resolve({ subject_id: 'first-user' });
		second.resolve(session);

		await store.receive({ type: 'loginSucceeded' }, (state) => {
			expect(state.session?.subject_id, 'the superseded sign-in landed').toBe(
				session.subject_id
			);
		});

		store.assertNoPendingActions();
	});
});
