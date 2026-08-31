/**
 * `RoleGate` must not report "denied" for "not yet known", and `AuthGuard`'s
 * fallback must be able to say why.
 *
 * `RoleGate` read only `store.state.subject` and never the status. In
 * `unresolved` — the initial state — and in a cold `resolving`, the subject is
 * `anonymousSubject`, so a standalone gate rendered its fallback ("Not
 * authorized") before the session had been resolved at all. Only the README's
 * nesting-inside-AuthGuard composition hid that, and nothing enforced it.
 *
 * Separately, `SessionState.error` was unreachable through the components:
 * `AuthGuard`'s `fallback` took no parameters, so a `loginFailed` message had
 * nowhere to go. `reducer.ts` records a logout error "so the app can surface
 * 'sign-out may not have reached the server'" — the package shipped no surface
 * that could.
 */

import { describe, it, expect } from 'vitest';
import { createRawSnippet, mount, unmount } from 'svelte';
import { createStore } from '@composable-svelte/core';
import AuthGuard from '../src/lib/components/AuthGuard.svelte';
import type { AuthError } from '../src/lib/errors/types.js';
import RoleGate from '../src/lib/components/RoleGate.svelte';
import { sessionReducer, createInitialSessionState } from '../src/lib/session/reducer.js';
import type { SessionDependencies, SessionState } from '../src/lib/session/types.js';

const inertDeps: SessionDependencies = {
	fetchLogin: () => new Promise(() => {}),
	fetchLogout: () => new Promise(() => {}),
	fetchSession: () => new Promise(() => {})
};

const snippet = (html: string) => createRawSnippet(() => ({ render: () => html }));

function makeStore(initialState?: SessionState) {
	return createStore({
		initialState: initialState ?? createInitialSessionState(),
		reducer: sessionReducer,
		dependencies: inertDeps
	});
}

function mountIn(Component: unknown, props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(Component as never, { target, props });
	return { target, dispose: () => (unmount(component), target.remove()) };
}

describe('RoleGate before the session is resolved', () => {
	it('renders neither children nor fallback while unresolved', () => {
		const { target, dispose } = mountIn(RoleGate, {
			store: makeStore(),
			roles: ['agent'],
			children: snippet('<span data-testid="allowed">allowed</span>'),
			fallback: snippet('<span data-testid="denied">not authorized</span>')
		});

		try {
			expect(target.querySelector('[data-testid="allowed"]')).toBeNull();
			expect(
				target.querySelector('[data-testid="denied"]'),
				'"not authorized" before the session was even resolved'
			).toBeNull();
		} finally {
			dispose();
		}
	});

	it('renders its pending snippet while unresolved, when given one', () => {
		const { target, dispose } = mountIn(RoleGate, {
			store: makeStore(),
			roles: ['agent'],
			children: snippet('<span data-testid="allowed">allowed</span>'),
			fallback: snippet('<span data-testid="denied">not authorized</span>'),
			pending: snippet('<span data-testid="pending">…</span>')
		});

		try {
			expect(target.querySelector('[data-testid="pending"]')).not.toBeNull();
		} finally {
			dispose();
		}
	});
});

describe('AuthGuard fallback', () => {
	it('receives the session error, so a failed login can be surfaced', () => {
		const store = makeStore({
			status: 'loginFailed',
			subject: { kind: 'anonymous' },
			error: { code: 'unknown', message: 'Login failed (503)', status: 503 },
			epoch: 1
		});

		const { target, dispose } = mountIn(AuthGuard, {
			store,
			children: snippet('<span data-testid="secret">secret</span>'),
			// The snippet now receives the structured failure, so a real sign-in
			// surface can branch on `code` — offer "resend confirmation" for
			// `email_unverified`, hide the retry button for `account_locked` —
			// rather than pattern-matching a sentence.
			fallback: createRawSnippet<[{ error: AuthError | null }]>((arg) => ({
				render: () =>
					`<span data-testid="signin" data-code="${arg().error?.code ?? 'none'}">${
						arg().error?.message ?? 'no error'
					}</span>`
			}))
		});

		try {
			const el = target.querySelector('[data-testid="signin"]');
			expect(el, 'fallback did not render').not.toBeNull();
			expect(el!.textContent, 'the error never reached the fallback').toBe('Login failed (503)');
			expect(el!.getAttribute('data-code'), 'the code is what a surface branches on').toBe(
				'unknown'
			);
		} finally {
			dispose();
		}
	});
});
