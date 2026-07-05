/**
 * Component smoke tests — browser mode.
 *
 * Mounts AuthGuard/RoleGate against a real createStore and asserts the
 * gating renders react to dispatched session actions.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { createStore } from '@composable-svelte/core';
import AuthGuard from '../src/lib/components/AuthGuard.svelte';
import RoleGate from '../src/lib/components/RoleGate.svelte';
import {
	createInitialSessionState,
	sessionReducer
} from '../src/lib/session/reducer';
import type { SessionDependencies } from '../src/lib/session/types';
import type { SessionSnapshot } from '../src/lib/subject/types';

const session: SessionSnapshot = {
	subject_id: '3f2a58f0-0000-0000-0000-000000000001',
	display_name: 'Booking Agent',
	roles: ['agent']
};

// The smoke tests drive the reducer synchronously: each initiator action is
// followed by a manual feedback dispatch in the same tick. The inert deps'
// own (microtask-later) feedback is discarded by the stale-feedback guards.
const inertDeps: SessionDependencies = {
	fetchLogin: async () => session,
	fetchLogout: async () => undefined,
	fetchSession: async () => null
};

function makeStore() {
	return createStore({
		initialState: createInitialSessionState(),
		reducer: sessionReducer,
		dependencies: inertDeps
	});
}

function snippet(html: string) {
	return createRawSnippet(() => ({ render: () => html }));
}

function mountTarget(): HTMLDivElement {
	const target = document.createElement('div');
	document.body.appendChild(target);
	return target;
}

describe('AuthGuard', () => {
	it('renders pending → children → fallback across the session lifecycle', () => {
		const store = makeStore();
		const target = mountTarget();
		const onAnonymous = vi.fn();

		const component = mount(AuthGuard, {
			target,
			props: {
				store,
				onAnonymous,
				children: snippet('<span data-testid="secret">secret</span>'),
				fallback: snippet('<span data-testid="signin">sign in</span>'),
				pending: snippet('<span data-testid="pending">…</span>')
			}
		});

		try {
			// unresolved → pending
			expect(target.querySelector('[data-testid="pending"]')).not.toBeNull();
			expect(target.querySelector('[data-testid="secret"]')).toBeNull();

			// authenticated → children
			store.dispatch({ type: 'resolveSession' });
			store.dispatch({ type: 'sessionResolved', session });
			flushSync();
			expect(target.querySelector('[data-testid="secret"]')).not.toBeNull();
			expect(target.querySelector('[data-testid="signin"]')).toBeNull();
			expect(onAnonymous).not.toHaveBeenCalled();

			// logged out → fallback + onAnonymous fires
			store.dispatch({ type: 'logout' });
			store.dispatch({ type: 'loggedOut' });
			flushSync();
			expect(target.querySelector('[data-testid="signin"]')).not.toBeNull();
			expect(target.querySelector('[data-testid="secret"]')).toBeNull();
			expect(onAnonymous).toHaveBeenCalled();
		} finally {
			unmount(component);
			target.remove();
		}
	});
});

describe('RoleGate', () => {
	it('gates children on the subject role-set', () => {
		const store = makeStore();
		const target = mountTarget();

		const component = mount(RoleGate, {
			target,
			props: {
				store,
				roles: ['admin'],
				children: snippet('<span data-testid="admin-only">admin</span>'),
				fallback: snippet('<span data-testid="denied">denied</span>')
			}
		});

		try {
			// Anonymous subject holds no roles → fallback.
			expect(target.querySelector('[data-testid="denied"]')).not.toBeNull();

			// Authenticated as 'agent' — still not 'admin' → fallback.
			store.dispatch({ type: 'resolveSession' });
			store.dispatch({ type: 'sessionResolved', session });
			flushSync();
			expect(target.querySelector('[data-testid="admin-only"]')).toBeNull();

			// Authenticated with the required role → children (re-resolve:
			// feedback only applies while its resolve is in flight).
			store.dispatch({ type: 'resolveSession' });
			store.dispatch({
				type: 'sessionResolved',
				session: { ...session, roles: ['admin'] }
			});
			flushSync();
			expect(target.querySelector('[data-testid="admin-only"]')).not.toBeNull();
			expect(target.querySelector('[data-testid="denied"]')).toBeNull();
		} finally {
			unmount(component);
			target.remove();
		}
	});
});
