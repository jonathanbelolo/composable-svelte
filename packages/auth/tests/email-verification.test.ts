/**
 * `EmailVerification` — browser mode.
 *
 * This component starts work on **mount**, which nothing else in the package
 * does, and that is where its risk is. A Svelte effect re-runs for reasons
 * unrelated to its subject; a confirmation token is single-use. So the arm that
 * matters most here is `asks about a token once, however often the effect
 * runs` — a duplicate exchange spends a working link and then blames the user
 * for it.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { userEvent } from 'vitest/browser';
import { createStore } from '@composable-svelte/core';

import EmailVerification from '../src/lib/components/EmailVerification.svelte';
import {
	createInitialEmailVerificationState,
	emailVerificationReducer
} from '../src/lib/flows/email-verification/reducer.js';
import type { EmailVerificationDependencies } from '../src/lib/flows/email-verification/types.js';
import { createInitialSessionState, sessionReducer } from '../src/lib/session/reducer.js';
import type { SessionDependencies } from '../src/lib/session/types.js';
import type { AuthError } from '../src/lib/errors/types.js';
import type { SessionSnapshot } from '../src/lib/subject/types.js';

const session: SessionSnapshot = {
	subject_id: 'ab000000-0000-4000-8000-00000000000b',
	display_name: 'Ada',
	roles: ['member']
};

const EXPIRED: AuthError = { code: 'token_expired', message: 'That link is no longer valid.' };

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

function mountVerification(
	deps: Partial<EmailVerificationDependencies>,
	props: Record<string, unknown> = {},
	email: string | null = 'ada@example.com'
) {
	const target = mountTarget();
	const flowStore = createStore({
		initialState: createInitialEmailVerificationState(email),
		reducer: emailVerificationReducer,
		dependencies: {
			verifyEmail: vi.fn(async () => null),
			resendVerification: vi.fn(async () => undefined),
			...deps
		}
	});
	const realSession = createStore({
		initialState: createInitialSessionState(),
		reducer: sessionReducer,
		dependencies: inertSessionDeps
	});
	const sessionActions: Array<{ type: string }> = [];
	const sessionStore = {
		dispatch(action: Parameters<typeof realSession.dispatch>[0]) {
			sessionActions.push(action);
			realSession.dispatch(action);
		}
	};

	const component = mount(EmailVerification, {
		target,
		props: { flowStore, sessionStore, ...props } as never
	});

	return {
		target,
		component,
		flowStore,
		sessionActions,
		text: () => target.textContent ?? '',
		banner: () => target.querySelector('[data-error-code]'),
		button: (label: string) =>
			[...target.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label)),
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

describe('starting on mount', () => {
	it('asks about the token it was given', async () => {
		const verifyEmail = vi.fn(async () => null);
		const h = mountVerification({ verifyEmail }, { token: 'tok_1' });

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(h.text()).toContain('Email confirmed');
			});
			expect(verifyEmail).toHaveBeenCalledWith('tok_1', expect.anything());
		} finally {
			h.cleanup();
		}
	});

	it('asks about a token once, however often the effect runs', async () => {
		// The arm this file exists for. Effects re-run on unrelated changes, and a
		// confirmation token is single-use: exchanging it twice spends a working
		// link and reports the second failure as the user's problem.
		const verifyEmail = vi.fn(async () => null);
		const h = mountVerification({ verifyEmail }, { token: 'tok_1' });

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(verifyEmail).toHaveBeenCalledTimes(1);
			});

			// Poke the store repeatedly; every dispatch re-runs the effect.
			for (let i = 0; i < 5; i++) {
				h.flowStore.dispatch({ type: 'errorDismissed' });
				flushSync();
			}
			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(verifyEmail, 'the token was exchanged more than once').toHaveBeenCalledTimes(1);
		} finally {
			h.cleanup();
		}
	});

	it('asks about nothing when there is no token', async () => {
		// Reaching this page directly is not an error; it is an offer to resend.
		const verifyEmail = vi.fn(async () => null);
		const h = mountVerification({ verifyEmail }, { token: null });

		try {
			flushSync();
			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(verifyEmail).not.toHaveBeenCalled();
			expect(h.text()).toContain('Confirm your email');
			expect(h.banner(), 'a missing token was reported as a failure').toBeNull();
			expect(h.button('Send another link'), 'no way forward offered').toBeDefined();
		} finally {
			h.cleanup();
		}
	});
});

describe('when it works', () => {
	it('hands over a session and moves focus, when one was issued', async () => {
		const onSuccess = vi.fn();
		const h = mountVerification(
			{ verifyEmail: vi.fn(async () => session) },
			{ token: 'tok_1', onSuccess }
		);

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(h.sessionActions.map((a) => a.type)).toEqual(['sessionEstablished']);
			});
			expect(onSuccess).toHaveBeenCalledTimes(1);
			expect(h.text()).toContain('You are signed in');

			const panel = h.target.querySelector('[role="status"]') as HTMLElement;
			expect(document.activeElement, 'focus was stranded').toBe(panel);
		} finally {
			h.cleanup();
		}
	});

	it('establishes nothing when confirming issued no session', async () => {
		// Still a success. The address is confirmed and the user has to sign in —
		// dispatching `sessionEstablished` here would sign in nobody in particular.
		const onSignIn = vi.fn();
		const h = mountVerification(
			{ verifyEmail: vi.fn(async () => null) },
			{ token: 'tok_1', onSignIn }
		);

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(h.text()).toContain('Email confirmed');
			});

			expect(h.sessionActions, 'a session was established without one existing').toEqual([]);
			expect(h.text()).toContain('You can sign in now');

			await userEvent.click(h.button('Sign in')!);
			expect(onSignIn).toHaveBeenCalledTimes(1);
		} finally {
			h.cleanup();
		}
	});

	it('lets a consumer replace the panel, and says whether they are signed in', async () => {
		const h = mountVerification(
			{ verifyEmail: vi.fn(async () => session) },
			{
				token: 'tok_1',
				verified: createRawSnippet<[{ signedIn: boolean }]>((getArgs) => ({
					render: () => `<p data-testid="custom">signedIn=${getArgs().signedIn}</p>`
				}))
			}
		);

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(h.target.querySelector('[data-testid="custom"]')).not.toBeNull();
			});
			expect(h.target.querySelector('[data-testid="custom"]')!.textContent).toBe('signedIn=true');
			expect(h.text(), 'the default panel rendered as well').not.toContain('Email confirmed');
		} finally {
			h.cleanup();
		}
	});
});

describe('when the link is dead', () => {
	it('says so and offers another, without pretending the resend fixed it', async () => {
		const resendVerification = vi.fn(async () => undefined);
		const h = mountVerification(
			{
				verifyEmail: vi.fn(async () => {
					throw EXPIRED;
				}),
				resendVerification
			},
			{ token: 'stale' }
		);

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(h.banner()).not.toBeNull();
			});
			expect(h.banner()!.getAttribute('data-error-code')).toBe('token_expired');
			expect(h.banner()!.getAttribute('role')).toBe('alert');
			expect(h.text()).toContain('That link did not work');

			await userEvent.click(h.button('Send another link')!);
			await vi.waitFor(() => {
				flushSync();
				expect(h.text()).toContain('Sent.');
			});

			expect(resendVerification).toHaveBeenCalledWith('ada@example.com', expect.anything());
			// The old link is still dead; a successful resend does not change that.
			expect(h.banner(), 'the dead-link message vanished on resend').not.toBeNull();
		} finally {
			h.cleanup();
		}
	});

	it('offers no resend when it never learned an address', async () => {
		// Non-vacuity for the arm above: the button is conditional, so a surface
		// with nowhere to send must not render a control that does nothing.
		const h = mountVerification(
			{
				verifyEmail: vi.fn(async () => {
					throw EXPIRED;
				})
			},
			{ token: 'stale' },
			null
		);

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(h.banner()).not.toBeNull();
			});
			expect(h.button('Send another link')).toBeUndefined();
		} finally {
			h.cleanup();
		}
	});

	it('reports a failed resend separately from the dead link', async () => {
		const h = mountVerification(
			{
				verifyEmail: vi.fn(async () => {
					throw EXPIRED;
				}),
				resendVerification: vi.fn(async () => {
					throw { code: 'rate_limited', message: 'Too many requests.' } satisfies AuthError;
				})
			},
			{ token: 'stale' }
		);

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(h.banner()).not.toBeNull();
			});

			await userEvent.click(h.button('Send another link')!);
			await vi.waitFor(() => {
				flushSync();
				expect(h.target.querySelectorAll('[data-error-code]').length).toBe(2);
			});

			const codes = [...h.target.querySelectorAll('[data-error-code]')].map((el) =>
				el.getAttribute('data-error-code')
			);
			expect(codes).toEqual(['token_expired', 'rate_limited']);
			expect(h.button('Send another link'), 'a failed resend must be retryable').toBeDefined();
		} finally {
			h.cleanup();
		}
	});
});

describe('Pattern A: it animates nothing', () => {
	it('resolves no transition or animation on its controls', async () => {
		const h = mountVerification({}, { token: null });
		try {
			flushSync();
			const button = h.button('Send another link')!;
			const computed = getComputedStyle(button);
			expect(computed.transitionDuration).toBe('0s');
			expect(computed.animationName).toBe('none');
		} finally {
			h.cleanup();
		}
	});
});
