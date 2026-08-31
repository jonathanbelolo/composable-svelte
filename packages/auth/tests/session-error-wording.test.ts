/**
 * What a user actually reads when a dependency throws something shapeless.
 *
 * Dependencies are injected, so anything can come out of one — and a rejected
 * promise with no argument, a thrown `{}`, or an `Error` with an empty message
 * are all things real code does. The reducer supplies wording for those, and the
 * first version of that supply decided by asking whether the *wrapped* message
 * was `''` or the literal string `'undefined'`.
 *
 * That was matching on a magic string, and it was wrong in both directions: a
 * thrown `null` reached the user as the word "null", a thrown `{}` as
 * "[object Object]", while an `Error` that legitimately said "undefined" would
 * have had its wording thrown away. These pin the corrected rule — ask about the
 * input, not about the output.
 */

import { describe, it, expect, vi } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';
import { sessionReducer, createInitialSessionState } from '../src/lib/session/index.js';
import type { SessionDependencies } from '../src/lib/session/index.js';

function storeThatFailsLoginWith(thrown: unknown) {
	const deps: SessionDependencies = {
		fetchLogin: vi.fn(async () => {
			throw thrown;
		}),
		fetchLogout: vi.fn(async () => {}),
		fetchSession: vi.fn(async () => null)
	};

	return createTestStore({
		initialState: createInitialSessionState(),
		reducer: sessionReducer,
		dependencies: deps
	});
}

async function messageAfterFailedLogin(thrown: unknown): Promise<string> {
	const store = storeThatFailsLoginWith(thrown);
	await store.send({ type: 'login', seededUserId: 'u1' });
	await store.receive({ type: 'loginFailed' });
	return store.state.error?.message ?? '(no error)';
}

describe('wording shown to a user when a dependency throws', () => {
	it('keeps what an Error said', async () => {
		expect(await messageAfterFailedLogin(new Error('That account is disabled.'))).toBe(
			'That account is disabled.'
		);
	});

	it('keeps what a thrown string said', async () => {
		expect(await messageAfterFailedLogin('Nope.')).toBe('Nope.');
	});

	it('substitutes wording for a thrown null', async () => {
		// Previously reached the user as the word "null".
		expect(await messageAfterFailedLogin(null)).toBe('Login failed');
	});

	it('substitutes wording for a thrown object', async () => {
		// Previously reached the user as "[object Object]".
		expect(await messageAfterFailedLogin({ status: 500 })).toBe('Login failed');
	});

	it('substitutes wording for an Error with nothing to say', async () => {
		expect(await messageAfterFailedLogin(new Error(''))).toBe('Login failed');
	});

	it('substitutes wording for a rejection with no argument', async () => {
		expect(await messageAfterFailedLogin(undefined)).toBe('Login failed');
	});

	it('never replaces the wording of an Error that legitimately says "undefined"', async () => {
		// The magic-string version would have thrown this away, because it asked
		// what the message *said* rather than where it came from.
		expect(await messageAfterFailedLogin(new Error('undefined'))).toBe('undefined');
	});

	it('leaves an error a dependency reported deliberately entirely alone', async () => {
		// A dependency that classifies its own failure must not have that undone —
		// this is the path the HTTP adapter will use to report `mfa_required`.
		const store = storeThatFailsLoginWith({
			code: 'account_locked',
			message: 'Locked until tomorrow.'
		});

		await store.send({ type: 'login', seededUserId: 'u1' });
		await store.receive({ type: 'loginFailed' });

		expect(store.state.error?.code).toBe('account_locked');
		expect(store.state.error?.message).toBe('Locked until tomorrow.');
	});
});
