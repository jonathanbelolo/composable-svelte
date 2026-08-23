/**
 * Re-login from an authenticated session must not blank the UI.
 *
 * `AuthGuard`'s own header states the rule: pending is for "anything else (no
 * authenticated subject to keep showing)", and the README repeats it —
 * "the pending snippet shows only when there is no authenticated subject to
 * keep showing".
 *
 * The code did not implement that. `showChildren` enumerated `resolving` and
 * `loggingOut` and omitted `loggingIn`, while `reducer.ts:122` builds the
 * `loggingIn` state with `{ ...state, ... }` — deliberately preserving an
 * authenticated subject, because `loginFailed` restores it (`reducer.ts:171-180`)
 * precisely when the old session is still valid.
 *
 * So the one flow the reducer works hardest to keep alive — account switching
 * from a signed-in state, which is the README's headline picker flow — was the
 * one where the guard unmounted the authenticated UI for the whole attempt and
 * then remounted it. `isRevalidating` was structurally unreachable for it.
 */

import { describe, it, expect } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { createStore } from '@composable-svelte/core';
import AuthGuard from '../src/lib/components/AuthGuard.svelte';
import { sessionReducer, createInitialSessionState } from '../src/lib/session/reducer.js';
import type { SessionDependencies, SessionState } from '../src/lib/session/types.js';
import { subjectFromSession } from '../src/lib/subject/helpers.js';
import type { SessionSnapshot } from '../src/lib/subject/types.js';

const session: SessionSnapshot = {
	subject_id: '3f2a58f0-0000-0000-0000-000000000001',
	display_name: 'Booking Agent',
	roles: ['agent']
};

const inertDeps: SessionDependencies = {
	fetchLogin: () => new Promise(() => {}),
	fetchLogout: async () => undefined,
	fetchSession: async () => null
};

const authenticatedState = (): SessionState => ({
	...createInitialSessionState(),
	status: 'authenticated',
	subject: subjectFromSession(session)
});

function snippet(html: string) {
	return createRawSnippet(() => ({ render: () => html }));
}

describe('AuthGuard during a re-login', () => {
	it('does not blank the authenticated UI when a re-login starts', () => {
		const store = createStore({
			initialState: authenticatedState(),
			reducer: sessionReducer,
			dependencies: inertDeps
		});
		const target = document.createElement('div');
		document.body.appendChild(target);

		const component = mount(AuthGuard, {
			target,
			props: {
				store,
				children: snippet('<span data-testid="secret">secret</span>'),
				fallback: snippet('<span data-testid="signin">sign in</span>'),
				pending: snippet('<span data-testid="pending">…</span>')
			}
		});

		try {
			expect(target.querySelector('[data-testid="secret"]')).not.toBeNull();

			// Switch account while signed in. The reducer retains the subject.
			store.dispatch({ type: 'login', seededUserId: 'someone-else' });
			flushSync();

			expect(store.state.status, 'precondition').toBe('loggingIn');
			expect(store.state.subject.kind, 'precondition: the subject is retained').toBe(
				'authenticated'
			);

			expect(
				target.querySelector('[data-testid="pending"]'),
				'the authenticated UI was blanked for the whole re-login'
			).toBeNull();
			expect(target.querySelector('[data-testid="secret"]')).not.toBeNull();
		} finally {
			unmount(component);
			target.remove();
		}
	});

	it('reports isRevalidating to children while the re-login is in flight', () => {
		// Mounted mid-flight, matching the existing `resolving` test: a raw
		// snippet's `render` does not re-run, so the flag is asserted by
		// starting in the state rather than by transitioning into it.
		const store = createStore({
			initialState: { ...authenticatedState(), status: 'loggingIn' as const, epoch: 1 },
			reducer: sessionReducer,
			dependencies: inertDeps
		});
		const target = document.createElement('div');
		document.body.appendChild(target);

		const component = mount(AuthGuard, {
			target,
			props: {
				store,
				children: createRawSnippet<[{ isRevalidating: boolean }]>((arg) => ({
					render: () =>
						`<span data-testid="secret" data-revalidating="${arg().isRevalidating}">secret</span>`
				})),
				pending: snippet('<span data-testid="pending">…</span>')
			}
		});

		try {
			const secret = target.querySelector('[data-testid="secret"]');
			expect(secret, 'children did not render during the re-login').not.toBeNull();
			expect(
				secret!.getAttribute('data-revalidating'),
				'isRevalidating was unreachable for a re-login'
			).toBe('true');
		} finally {
			unmount(component);
			target.remove();
		}
	});
});
