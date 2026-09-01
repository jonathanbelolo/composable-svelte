/**
 * The two components an authenticated user meets — browser mode.
 *
 * `SignOutButton` is the first component in this package that dispatches to the
 * session store; the guards both refuse to, and every flow component dispatches
 * to a flow store instead. So its arms are about that: it actually signs out,
 * it cannot be pressed twice, and it surfaces the fail-closed warning that
 * previously had nowhere to appear.
 *
 * `ChangePasswordForm`'s arm is `treats a re-authentication demand as a branch`.
 * That is the whole design: the client never asks for a current password
 * because it cannot know whether one exists, so the backend's demand has to
 * reach a prompt rather than a red banner.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { userEvent } from 'vitest/browser';
import { createStore } from '@composable-svelte/core';

import ChangePasswordForm from '../src/lib/components/ChangePasswordForm.svelte';
import SignOutButton from '../src/lib/components/SignOutButton.svelte';
import {
	changePasswordReducer,
	createInitialChangePasswordState
} from '../src/lib/flows/index.js';
import type {
	ChangePasswordDependencies,
	ChangePasswordState
} from '../src/lib/flows/index.js';
import { createInitialSessionState, sessionReducer } from '../src/lib/session/reducer.js';
import type { SessionDependencies, SessionState } from '../src/lib/session/types.js';
import type { AuthError } from '../src/lib/errors/types.js';
import type { SessionSnapshot } from '../src/lib/subject/types.js';

const session: SessionSnapshot = {
	subject_id: 'cc000000-0000-4000-8000-00000000000c',
	display_name: 'Ada',
	roles: ['member']
};

const PASSWORD = 'correct-horse-battery-staple';

function mountTarget(): HTMLDivElement {
	const target = document.createElement('div');
	document.body.appendChild(target);
	return target;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function sessionSpy() {
	const real = createStore({
		initialState: createInitialSessionState(),
		reducer: sessionReducer,
		dependencies: {
			fetchLogin: async () => session,
			fetchLogout: async () => undefined,
			fetchSession: async () => null
		} satisfies SessionDependencies
	});
	const actions: Array<{ type: string }> = [];
	return {
		actions,
		store: {
			dispatch(action: Parameters<typeof real.dispatch>[0]) {
				actions.push(action);
				real.dispatch(action);
			}
		}
	};
}

function mountSignOut(deps: Partial<SessionDependencies> = {}, initial?: Partial<SessionState>) {
	const target = mountTarget();
	const store = createStore({
		initialState: {
			...createInitialSessionState(),
			status: 'authenticated' as const,
			subject: { kind: 'authenticated' as const, id: session.subject_id, attributes: {} },
			...initial
		},
		reducer: sessionReducer,
		dependencies: {
			fetchLogin: async () => session,
			fetchLogout: vi.fn(async () => undefined),
			fetchSession: async () => null,
			...deps
		} satisfies SessionDependencies
	});
	const onSignedOut = vi.fn();
	const component = mount(SignOutButton, { target, props: { store, onSignedOut } as never });
	return {
		target,
		store,
		onSignedOut,
		button: () => target.querySelector('button') as HTMLButtonElement,
		// Whitespace-collapsed. The warning wraps across a line in the template,
		// so a phrase that reads as one sentence contains a newline and two tabs
		// — and `toContain` fails on prose that is on screen and correct.
		text: () => (target.textContent ?? '').replace(/\s+/g, ' '),
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

function mountChangePassword(
	deps: Partial<ChangePasswordDependencies> = {},
	props: Record<string, unknown> = {},
	initial?: Partial<ChangePasswordState>
) {
	const target = mountTarget();
	const flowStore = createStore({
		initialState: { ...createInitialChangePasswordState(), ...initial },
		reducer: changePasswordReducer,
		dependencies: {
			changePassword: vi.fn(async () => null),
			...deps
		} satisfies ChangePasswordDependencies
	});
	const spy = sessionSpy();
	const onChanged = vi.fn();
	const component = mount(ChangePasswordForm, {
		target,
		props: { flowStore, sessionStore: spy.store, onChanged, ...props } as never
	});
	return {
		target,
		flowStore,
		sessionActions: spy.actions,
		onChanged,
		password: () => target.querySelector('input[name="password"]') as HTMLInputElement,
		confirm: () => target.querySelector('input[name="confirmPassword"]') as HTMLInputElement,
		submit: () => target.querySelector('button[type="submit"]') as HTMLButtonElement,
		text: () => target.textContent ?? '',
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

async function fillAndSubmit(h: ReturnType<typeof mountChangePassword>, value = PASSWORD) {
	await userEvent.fill(h.password(), value);
	await userEvent.fill(h.confirm(), value);
	flushSync();
	await userEvent.click(h.submit());
}

// ============================================================
// SignOutButton
// ============================================================

describe('SignOutButton', () => {
	it('signs out, which nothing in this package could do before', async () => {
		const fetchLogout = vi.fn(async () => undefined);
		const h = mountSignOut({ fetchLogout });

		try {
			await userEvent.click(h.button());
			await vi.waitFor(() => {
				flushSync();
				expect(h.store.state.status).toBe('anonymous');
			});

			expect(fetchLogout).toHaveBeenCalledTimes(1);
			expect(h.store.state.subject.kind).toBe('anonymous');
			expect(h.onSignedOut).toHaveBeenCalledTimes(1);
		} finally {
			h.cleanup();
		}
	});

	it('cannot be pressed twice while it is working', async () => {
		const slow = deferred<void>();
		const fetchLogout = vi.fn(() => slow.promise);
		const h = mountSignOut({ fetchLogout });

		try {
			await userEvent.click(h.button());
			await vi.waitFor(() => {
				flushSync();
				expect(h.button().disabled, 'the button stayed pressable mid-flight').toBe(true);
			});
			expect(h.text()).toContain('Signing out…');

			// Native click, because `userEvent.click` on a disabled element waits
			// thirty seconds and reports a passing property as a failure.
			h.button().click();
			flushSync();
			expect(fetchLogout).toHaveBeenCalledTimes(1);
		} finally {
			slow.resolve();
			h.cleanup();
		}
	});

	it('says so when the sign-out did not reach the server', async () => {
		// The reducer is fail-closed: the client goes anonymous even when the
		// request failed, because the cookie is HttpOnly and it cannot verify
		// either way. Before this component that error had nowhere to appear
		// except `AuthGuard`'s fallback, after the UI had already switched.
		const h = mountSignOut({
			fetchLogout: vi.fn(async () => {
				throw new Error('network down');
			})
		});

		try {
			await userEvent.click(h.button());
			await vi.waitFor(() => {
				flushSync();
				expect(h.store.state.status).toBe('anonymous');
			});

			expect(h.text()).toContain("signed out on this device");
			expect(h.text()).toContain('still be signed in elsewhere');
			// Not an alert: the sign-out *did* happen here, and shouting suggests
			// otherwise.
			expect(h.target.querySelector('[role="alert"]')).toBeNull();
		} finally {
			h.cleanup();
		}
	});

	it('says nothing when the sign-out was clean', async () => {
		// The non-vacuity partner: without this, always rendering the warning
		// would pass the arm above.
		const h = mountSignOut();
		try {
			await userEvent.click(h.button());
			await vi.waitFor(() => {
				flushSync();
				expect(h.store.state.status).toBe('anonymous');
			});
			expect(h.text()).not.toContain('still be signed in elsewhere');
		} finally {
			h.cleanup();
		}
	});

	it('animates nothing', async () => {
		const h = mountSignOut();
		try {
			const style = getComputedStyle(h.button());
			expect(style.transitionDuration).toBe('0s');
			expect(style.animationName).toBe('none');
		} finally {
			h.cleanup();
		}
	});
});

// ============================================================
// ChangePasswordForm
// ============================================================

describe('ChangePasswordForm', () => {
	it('offers to set a password when the account has none', async () => {
		// The read model earning its keep. Offering to *change* something an
		// OAuth-only account never had is a small lie that makes the whole panel
		// untrustworthy.
		const without = mountChangePassword({}, { hasPassword: false });
		try {
			flushSync();
			expect(without.text()).toContain('Set a password');
			expect(without.text()).toContain('signs in another way today');
			expect(without.submit().textContent).toContain('Set password');
		} finally {
			without.cleanup();
		}

		const with_ = mountChangePassword({}, { hasPassword: true });
		try {
			flushSync();
			expect(with_.text()).toContain('Change your password');
			expect(with_.text()).not.toContain('signs in another way today');
			expect(with_.submit().textContent).toContain('Change password');
		} finally {
			with_.cleanup();
		}
	});

	it('treats a re-authentication demand as a branch, not a failure', async () => {
		// The design in one arm. The backend asks for proof, the consumer routes
		// to a prompt, and no red banner appears on the way there.
		const onReauthenticationRequired = vi.fn();
		const h = mountChangePassword(
			{
				changePassword: vi.fn(async () => {
					throw {
						code: 'reauthentication_required',
						message: 'Confirm it is you.',
						methods: ['password', 'totp']
					} satisfies AuthError;
				})
			},
			{ onReauthenticationRequired, hasPassword: true }
		);

		try {
			await fillAndSubmit(h);
			await vi.waitFor(() => {
				flushSync();
				expect(onReauthenticationRequired).toHaveBeenCalledWith({
					methods: ['password', 'totp']
				});
			});

			expect(
				h.target.querySelector('[data-error-code]'),
				'a demand for proof was shown as a failure'
			).toBeNull();
			// The fields keep what was typed — the user is about to confirm, not
			// to start again.
			expect(h.password().value).toBe(PASSWORD);
		} finally {
			h.cleanup();
		}
	});

	it('still shows the demand when nothing is handling it', async () => {
		// The non-vacuity partner. Suppressing the banner unconditionally would
		// leave a user staring at a form that silently refuses to submit.
		const h = mountChangePassword(
			{
				changePassword: vi.fn(async () => {
					throw {
						code: 'reauthentication_required',
						message: 'Confirm it is you.',
						methods: ['password']
					} satisfies AuthError;
				})
			},
			{ hasPassword: true }
		);

		try {
			await fillAndSubmit(h);
			await vi.waitFor(() => {
				flushSync();
				expect(
					h.target.querySelector('[data-error-code="reauthentication_required"]')
				).not.toBeNull();
			});
		} finally {
			h.cleanup();
		}
	});

	it('hands over a rotated session exactly once', async () => {
		const h = mountChangePassword({ changePassword: vi.fn(async () => session) });

		try {
			await fillAndSubmit(h);
			await vi.waitFor(() => {
				flushSync();
				expect(h.sessionActions.map((a) => a.type)).toEqual(['sessionEstablished']);
			});
			expect(h.onChanged).toHaveBeenCalledTimes(1);

			// Every later dispatch re-runs the effect's dependencies.
			await userEvent.fill(h.password(), 'something-else-entirely');
			flushSync();
			expect(h.sessionActions, 'the handoff fired again').toHaveLength(1);
		} finally {
			h.cleanup();
		}
	});

	it('reports success without a session, because that is success too', async () => {
		const h = mountChangePassword({ changePassword: vi.fn(async () => null) });

		try {
			await fillAndSubmit(h);
			await vi.waitFor(() => {
				flushSync();
				expect(h.onChanged).toHaveBeenCalledTimes(1);
			});
			expect(h.sessionActions, 'a session was invented').toEqual([]);
			expect(h.text()).toContain('Your password is set');
		} finally {
			h.cleanup();
		}
	});

	it('does not leave the new password in the fields', async () => {
		const h = mountChangePassword();
		try {
			await fillAndSubmit(h);
			await vi.waitFor(() => {
				flushSync();
				expect(h.text()).toContain('Your password is set');
			});
			expect(h.password().value, 'a live password was left on screen').toBe('');
			expect(h.confirm().value).toBe('');
		} finally {
			h.cleanup();
		}
	});

	it('renders the footer on every branch', async () => {
		const h = mountChangePassword(
			{},
			{ footer: createRawSnippet(() => ({ render: () => '<a href="/help">Get help</a>' })) },
			{ status: 'changed' }
		);
		try {
			flushSync();
			expect(h.target.querySelector('a[href="/help"]')).not.toBeNull();
		} finally {
			h.cleanup();
		}
	});

	it('animates nothing', async () => {
		const h = mountChangePassword();
		try {
			const style = getComputedStyle(h.submit());
			expect(style.transitionDuration).toBe('0s');
			expect(style.animationName).toBe('none');
		} finally {
			h.cleanup();
		}
	});
});
