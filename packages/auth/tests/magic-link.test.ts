/**
 * The two magic-link components — browser mode.
 *
 * The arm that carries this file is `mounting the page spends nothing`. A mail
 * scanner opening the link issues a GET and renders this component; if merely
 * rendering it spent the token, the link would be dead before its owner saw it.
 * That property is the whole reason this component exists rather than reusing
 * `EmailVerification`, so it is asserted rather than commented.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { userEvent } from 'vitest/browser';
import { createStore } from '@composable-svelte/core';

import MagicLinkRequestForm from '../src/lib/components/MagicLinkRequestForm.svelte';
import MagicLinkSignIn from '../src/lib/components/MagicLinkSignIn.svelte';
import MagicLinkTokenSwap from './test-components/MagicLinkTokenSwap.svelte';
import {
	magicLinkRequestReducer,
	createInitialMagicLinkRequestState,
	magicLinkSignInReducer,
	createInitialMagicLinkSignInState
} from '../src/lib/flows/index.js';
import type {
	MagicLinkRequestDependencies,
	MagicLinkSignInDependencies,
	MagicLinkSignInState
} from '../src/lib/flows/index.js';
import { createInitialSessionState, sessionReducer } from '../src/lib/session/reducer.js';
import type { SessionDependencies } from '../src/lib/session/types.js';
import type { AuthError } from '../src/lib/errors/types.js';
import type { SessionSnapshot } from '../src/lib/subject/types.js';

const session: SessionSnapshot = {
	subject_id: 'bb000000-0000-4000-8000-00000000000b',
	display_name: 'Ada',
	roles: ['member']
};

const inertSessionDeps: SessionDependencies = {
	fetchLogin: async () => session,
	fetchLogout: async () => undefined,
	fetchSession: async () => null
};

function mountTarget(): HTMLDivElement {
	const target = document.createElement('div');
	document.body.appendChild(target);
	return target;
}

function sessionSpy() {
	const real = createStore({
		initialState: createInitialSessionState(),
		reducer: sessionReducer,
		dependencies: inertSessionDeps
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

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

function mountRequest(
	deps: Partial<MagicLinkRequestDependencies> = {},
	props: Record<string, unknown> = {}
) {
	const target = mountTarget();
	const flowStore = createStore({
		initialState: createInitialMagicLinkRequestState(),
		reducer: magicLinkRequestReducer,
		dependencies: {
			requestMagicLink: vi.fn(async () => undefined),
			...deps
		} satisfies MagicLinkRequestDependencies
	});
	const onSent = vi.fn();
	const component = mount(MagicLinkRequestForm, {
		target,
		props: { flowStore, onSent, ...props } as never
	});
	return {
		target,
		flowStore,
		onSent,
		email: () => target.querySelector('input[type="email"]') as HTMLInputElement,
		submit: () => target.querySelector('button[type="submit"]') as HTMLButtonElement,
		text: () => target.textContent ?? '',
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

function mountSignIn(
	deps: Partial<MagicLinkSignInDependencies> = {},
	props: Record<string, unknown> = {},
	initial?: Partial<MagicLinkSignInState>
) {
	const target = mountTarget();
	const flowStore = createStore({
		initialState: { ...createInitialMagicLinkSignInState('tok_1'), ...initial },
		reducer: magicLinkSignInReducer,
		dependencies: {
			signInWithMagicLink: vi.fn(async () => session),
			...deps
		} satisfies MagicLinkSignInDependencies
	});
	const spy = sessionSpy();
	const onRequestNewLink = vi.fn();
	const onSuccess = vi.fn();
	const component = mount(MagicLinkSignIn, {
		target,
		props: {
			flowStore,
			sessionStore: spy.store,
			onRequestNewLink,
			onSuccess,
			...props
		} as never
	});
	return {
		target,
		flowStore,
		sessionActions: spy.actions,
		onRequestNewLink,
		onSuccess,
		buttons: () => [...target.querySelectorAll('button')],
		text: () => target.textContent ?? '',
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

// ============================================================
// Asking
// ============================================================

describe('MagicLinkRequestForm', () => {
	it('confirms without saying whether the account exists', async () => {
		const h = mountRequest();
		try {
			await userEvent.fill(h.email(), 'ada@example.com');
			flushSync();
			await userEvent.click(h.submit());

			await vi.waitFor(() => {
				flushSync();
				expect(h.text()).toContain('ada@example.com');
			});

			// The wording is the point. Anything that confirmed an account exists
			// would be an account checker with a friendly face.
			expect(h.text()).toContain('has an account');
			expect(h.text()).not.toMatch(/we sent you|your account/i);
		} finally {
			h.cleanup();
		}
	});

	it('reports every accepted request, not just the first', async () => {
		// `ForgotPasswordForm` shipped this keyed on the address, so someone who
		// asked twice for the same inbox produced one callback and the consumer
		// never learned about the second.
		const h = mountRequest();
		try {
			for (const _ of [1, 2]) {
				await userEvent.fill(h.email(), 'ada@example.com');
				flushSync();
				await userEvent.click(h.submit());
				await vi.waitFor(() => {
					flushSync();
					expect(h.text()).toContain('has an account');
				});
			}

			expect(h.onSent, 'a repeated request was swallowed').toHaveBeenCalledTimes(2);
			expect(h.onSent).toHaveBeenLastCalledWith('ada@example.com');
		} finally {
			h.cleanup();
		}
	});

	it('offers another link rather than a dead end once one is sent', async () => {
		const h = mountRequest();
		try {
			await userEvent.fill(h.email(), 'ada@example.com');
			flushSync();
			await userEvent.click(h.submit());
			await vi.waitFor(() => {
				flushSync();
				expect(h.submit().textContent).toContain('Send another link');
			});
			expect(h.submit().disabled).toBe(false);
		} finally {
			h.cleanup();
		}
	});

	it('animates nothing', async () => {
		const h = mountRequest();
		try {
			const style = getComputedStyle(h.submit());
			expect(style.transitionDuration).toBe('0s');
			expect(style.animationName).toBe('none');
		} finally {
			h.cleanup();
		}
	});
});

// ============================================================
// Using
// ============================================================

describe('MagicLinkSignIn', () => {
	it('mounting the page spends nothing', async () => {
		// The arm this component exists for. A mail scanner following the link
		// renders exactly this and stops; the token survives for its owner.
		const signInWithMagicLink = vi.fn<MagicLinkSignInDependencies['signInWithMagicLink']>(
			async () => session
		);
		const h = mountSignIn({ signInWithMagicLink });

		try {
			flushSync();
			await new Promise((resolve) => setTimeout(resolve, 50));
			flushSync();

			expect(signInWithMagicLink, 'rendering the page spent the token').not.toHaveBeenCalled();
			expect(h.sessionActions).toEqual([]);
			expect(h.text()).toContain('Sign in');
		} finally {
			h.cleanup();
		}
	});

	it('signs in on a press, and hands the session over once', async () => {
		const signInWithMagicLink = vi.fn<MagicLinkSignInDependencies['signInWithMagicLink']>(
			async () => session
		);
		const h = mountSignIn({ signInWithMagicLink });

		try {
			await userEvent.click(h.buttons()[0]!);
			await vi.waitFor(() => {
				flushSync();
				expect(h.sessionActions.map((a) => a.type)).toEqual(['sessionEstablished']);
			});

			expect(signInWithMagicLink).toHaveBeenCalledWith('tok_1', expect.anything());
			expect(h.onSuccess).toHaveBeenCalledTimes(1);
			expect(h.text()).toContain("You're signed in");
		} finally {
			h.cleanup();
		}
	});

	it('names who the link was for when the surface knows', async () => {
		const h = mountSignIn({}, { email: 'ada@example.com' });
		try {
			flushSync();
			expect(h.text()).toContain('ada@example.com');
		} finally {
			h.cleanup();
		}
	});

	it('withdraws the button for a link that cannot work, and offers a new one', async () => {
		for (const [name, initial] of [
			['no token at all', { token: null }],
			[
				'a spent link',
				{
					token: 'tok_1',
					error: { code: 'token_expired' as const, message: 'That link is no longer valid.' }
				}
			]
		] as const) {
			const signInWithMagicLink = vi.fn<MagicLinkSignInDependencies['signInWithMagicLink']>(
				async () => session
			);
			const h = mountSignIn({ signInWithMagicLink }, {}, initial);
			try {
				flushSync();
				const clickable = h.buttons();
				expect(clickable.length, `"${name}" left nothing to click`).toBeGreaterThan(0);

				await userEvent.click(clickable[0]!);
				expect(h.onRequestNewLink, `"${name}" offered no new link`).toHaveBeenCalled();
				expect(
					signInWithMagicLink,
					`"${name}" still offered to spend a dead token`
				).not.toHaveBeenCalled();
			} finally {
				h.cleanup();
			}
		}
	});

	it('takes a token that arrives after mount', async () => {
		// `tokenProvided` existed, was documented as "hand the flow the token from
		// the URL", and had no caller anywhere in the package. All four siblings —
		// `ResetPasswordForm`, `EmailVerification`, `MfaChallengeForm`,
		// `OAuthCallback` — take their value as a prop and dispatch it; this one
		// took nothing, so a router resolving its parameters after mount, or a
		// link opened into a running app, had no way in.
		const target = mountTarget();
		const flowStore = createStore({
			initialState: createInitialMagicLinkSignInState(null),
			reducer: magicLinkSignInReducer,
			dependencies: { signInWithMagicLink: vi.fn(async () => session) }
		});
		const component = mount(MagicLinkTokenSwap, {
			target,
			props: { flowStore, sessionStore: sessionSpy().store, initialToken: null } as never
		});

		try {
			flushSync();
			expect(target.textContent).toContain('Nothing to sign in with');

			// The router catches up.
			component.swap('tok_late');
			flushSync();

			expect(flowStore.state.token, 'a late token never reached the flow').toBe('tok_late');
			expect(target.textContent).toContain('Press the button');
		} finally {
			unmount(component);
			target.remove();
		}
	});

	it('stops offering the press when a second factor is needed and nothing handles it', async () => {
		// The exact species this package's MFA work exists to close, reintroduced
		// in a new component: the user was told "enter the code from your
		// authenticator app", given nowhere to enter it, and offered a "Sign in"
		// button that re-spends a token the backend has already consumed.
		const signInWithMagicLink = vi.fn<MagicLinkSignInDependencies['signInWithMagicLink']>(
			async () => session
		);
		const h = mountSignIn(
			{ signInWithMagicLink },
			{},
			{
				error: {
					code: 'mfa_required',
					message: 'Enter the code from your authenticator app.',
					challengeId: 'c1',
					methods: ['totp']
				} satisfies AuthError
			}
		);

		try {
			flushSync();
			const labels = h.buttons().map((b) => b.textContent?.trim() ?? '');
			expect(labels, 'still offered to re-spend a consumed token').not.toContain('Sign in');
			expect(labels.length, 'left the user with nothing to click').toBeGreaterThan(0);

			await userEvent.click(h.buttons()[0]!);
			expect(h.onRequestNewLink).toHaveBeenCalled();
			expect(signInWithMagicLink, 'a consumed token was spent again').not.toHaveBeenCalled();
		} finally {
			h.cleanup();
		}
	});

	it('keeps the button for a failure a retry could fix', async () => {
		// The counterpart of the arm above, and the reason `linkIsDead` branches on
		// the code rather than on "is there an error". A network blip may mean the
		// request never arrived, so the token is untouched.
		const h = mountSignIn(
			{},
			{},
			{ error: { code: 'network', message: 'Offline.' } }
		);
		try {
			flushSync();
			expect(h.text()).not.toContain('Send me a new link');
			expect(h.buttons().some((b) => b.textContent?.includes('Sign in'))).toBe(true);
		} finally {
			h.cleanup();
		}
	});

	it('disables the button while it is spending the token', async () => {
		const slow = deferred<SessionSnapshot>();
		const h = mountSignIn({ signInWithMagicLink: vi.fn(() => slow.promise) });
		try {
			await userEvent.click(h.buttons()[0]!);
			await vi.waitFor(() => {
				flushSync();
				expect(h.buttons()[0]!.disabled, 'the button stayed pressable mid-flight').toBe(true);
			});
			expect(h.text()).toContain('Signing in…');
		} finally {
			slow.resolve(session);
			h.cleanup();
		}
	});

	it('keeps the footer on the branch where the user is most stuck', async () => {
		const h = mountSignIn(
			{},
			{ footer: createRawSnippet(() => ({ render: () => '<a href="/help">Get help</a>' })) },
			{ token: null }
		);
		try {
			flushSync();
			expect(
				h.target.querySelector('a[href="/help"]'),
				'the footer was dropped on the dead-link branch'
			).not.toBeNull();
		} finally {
			h.cleanup();
		}
	});

	it('hands a second factor over without showing a failure banner', async () => {
		const onMfaRequired = vi.fn();
		const h = mountSignIn(
			{},
			{ onMfaRequired },
			{
				error: {
					code: 'mfa_required',
					message: 'Enter your code.',
					challengeId: 'chal_magic',
					methods: ['totp']
				} satisfies AuthError
			}
		);
		try {
			await vi.waitFor(() => {
				flushSync();
				expect(onMfaRequired).toHaveBeenCalledWith({
					challengeId: 'chal_magic',
					methods: ['totp']
				});
			});
			expect(h.target.querySelector('[role="alert"]')).toBeNull();
		} finally {
			h.cleanup();
		}
	});

	it('animates nothing', async () => {
		const h = mountSignIn();
		try {
			const style = getComputedStyle(h.buttons()[0]!);
			expect(style.transitionDuration).toBe('0s');
			expect(style.animationName).toBe('none');
		} finally {
			h.cleanup();
		}
	});
});
