/**
 * The managed auth shell in plain Node: no DOM, no `window`, no component.
 *
 * `../managed-auth-composition.test.ts` runs in Chromium with nothing mounted.
 * This runs the same fixture where Svelte effects cannot exist at all, which
 * is the environment `LoginForm`'s `$effect` handoff never reaches. It is not
 * a render: no HTML is produced or hydrated here.
 *
 * Core skips effect execution on the server unless the store opts in with
 * `ssr: { deferEffects: false }`. Both sides are pinned: by default a store
 * performs no auth I/O at all, yet the parent handoff is pure reduction and
 * still applies; opted in, the whole login → MFA → session sequence completes
 * in two stores whose requests are interleaved in one process.
 *
 * What this does not show: a server request lifecycle. There is no HTTP
 * server, no per-request store factory, no cookie, no `renderToHTML` and no
 * hydration; "two stores in one process" is the extent of the isolation
 * claim, and the opted-in case is not a recommended server sign-in path.
 */

import { describe, it, expect } from 'vitest';
import { createStore } from '@composable-svelte/core';

import {
	authShell,
	createInitialAuthShellState,
	loginSlot,
	type AuthShellState
} from '../fixtures/managed-auth-shell.js';
import {
	controlledAuthDeps,
	settle,
	snapshot,
	submitCode,
	submitLogin
} from '../fixtures/managed-auth-drivers.js';

const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');
const bob = snapshot('bbbbbbbb-0000-0000-0000-000000000002', 'Bob');

function createShell(deps: ReturnType<typeof controlledAuthDeps>['deps'], runEffects: boolean) {
	return createStore({
		initialState: createInitialAuthShellState(),
		reducer: authShell.reducer,
		execution: authShell.execution,
		dependencies: deps,
		...(runEffects ? { ssr: { deferEffects: false } } : {})
	});
}

function subjectId(state: AuthShellState): string | null {
	return state.session.subject.kind === 'authenticated' ? state.session.subject.id : null;
}

describe('managed auth shell under Node', () => {
	it('has no DOM to lean on', () => {
		expect(typeof window).toBe('undefined');
		expect(typeof document).toBe('undefined');
	});

	it('by default performs no auth I/O, while the parent handoff still reduces', async () => {
		const { deps, logins } = controlledAuthDeps();
		const store = createShell(deps, false);

		store.dispatch({ type: 'signInOpened' });
		const view = authShell.bind(store, loginSlot)!;
		view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: 'ada@example.com' } });
		view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'password', value: 'correct-horse' } });
		view.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
		await settle();
		expect(logins, 'server effects are deferred: no request').toHaveLength(0);
		expect(store.state.login?.status).toBe('idle');

		// A result the server already holds is plain reduction, not an effect.
		store.dispatch(loginSlot.wrap({ type: 'loginSucceeded', session: ada }));
		expect(subjectId(store.state)).toBe(ada.subject_id);
		expect(store.state.route).toBe('home');
		store.destroy();
	});

	it('opted in, completes login → MFA → session in two concurrent stores without crossing', async () => {
		const first = controlledAuthDeps();
		const second = controlledAuthDeps();
		const storeA = createShell(first.deps, true);
		const storeB = createShell(second.deps, true);

		storeA.dispatch({ type: 'signInOpened' });
		storeB.dispatch({ type: 'signInOpened' });
		const [loginA, loginB] = await Promise.all([
			submitLogin(storeA, first.logins, 'ada@example.com'),
			submitLogin(storeB, second.logins, 'bob@example.com')
		]);

		loginA.resolve(ada);
		loginB.reject({ code: 'mfa_required', message: 'MFA', challengeId: 'chal-b', methods: ['totp'] });
		await settle();
		expect(storeA.state.route).toBe('home');
		expect(storeB.state.route).toBe('mfa');

		const challenge = await submitCode(storeB, second.challenges, '123456');
		challenge.resolve(bob);
		await settle();

		expect(subjectId(storeA.state)).toBe(ada.subject_id);
		expect(subjectId(storeB.state)).toBe(bob.subject_id);
		expect(first.challenges).toHaveLength(0);
		storeA.destroy();
		storeB.destroy();
	});
});
