/**
 * `ForgotPasswordForm` and `ResetPasswordForm` — browser mode.
 *
 * The arm that matters most is `says the same thing whether or not the address
 * exists`. The reducer test asserts the *state* is identical; this asserts the
 * rendered words are, which is where the leak would actually happen — a
 * well-meaning "we couldn't find that address" is one line of markup away.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { userEvent } from 'vitest/browser';
import { createStore } from '@composable-svelte/core';

import ForgotPasswordForm from '../src/lib/components/ForgotPasswordForm.svelte';
import ResetPasswordForm from '../src/lib/components/ResetPasswordForm.svelte';
import {
	createInitialForgotPasswordState,
	forgotPasswordReducer
} from '../src/lib/flows/forgot-password/reducer.js';
import {
	createInitialResetPasswordState,
	resetPasswordReducer
} from '../src/lib/flows/reset-password/reducer.js';
import type { ForgotPasswordDependencies } from '../src/lib/flows/forgot-password/types.js';
import type { ResetPasswordDependencies } from '../src/lib/flows/reset-password/types.js';
import { createInitialSessionState, sessionReducer } from '../src/lib/session/reducer.js';
import type { SessionDependencies } from '../src/lib/session/types.js';
import type { AuthError } from '../src/lib/errors/types.js';
import type { SessionSnapshot } from '../src/lib/subject/types.js';

const session: SessionSnapshot = {
	subject_id: 'cc000000-0000-4000-8000-00000000000c',
	display_name: 'Ada',
	roles: ['member']
};

const GOOD = 'correct-horse-battery';
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

// ============================================================
// Forgot password
// ============================================================

function mountForgot(deps: ForgotPasswordDependencies, props: Record<string, unknown> = {}) {
	const target = mountTarget();
	const flowStore = createStore({
		initialState: createInitialForgotPasswordState(),
		reducer: forgotPasswordReducer,
		dependencies: deps
	});
	const component = mount(ForgotPasswordForm, {
		target,
		props: { flowStore, ...props } as never
	});
	return {
		target,
		component,
		flowStore,
		text: () => target.textContent ?? '',
		email: () => target.querySelector('input[type="email"]') as HTMLInputElement,
		submit: () => target.querySelector('button[type="submit"]') as HTMLButtonElement,
		banner: () => target.querySelector('[data-error-code]'),
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

async function ask(h: ReturnType<typeof mountForgot>, email: string) {
	await userEvent.fill(h.email(), email);
	flushSync();
	await userEvent.click(h.submit());
}

describe('asking for a reset link', () => {
	it('says the same thing whether or not the address exists', async () => {
		// The oracle, at the surface. The reducer test proves the state matches;
		// this proves the *words* do, which is where a leak would appear — one
		// helpful "we couldn't find that address" and the form is an account
		// checker.
		const rendered: string[] = [];

		for (const email of ['real@example.com', 'nobody@example.com']) {
			const h = mountForgot({ requestPasswordReset: vi.fn(async () => undefined) });
			try {
				await ask(h, email);
				await vi.waitFor(() => {
					flushSync();
					expect(h.text()).toContain('is on its way');
				});
				// Normalise away the address itself, which of course differs.
				rendered.push(h.text().replace(email, '<ADDRESS>').replace(/\s+/g, ' ').trim());
			} finally {
				h.cleanup();
			}
		}

		expect(rendered[0], 'the two outcomes read differently').toBe(rendered[1]);
	});

	it('phrases it conditionally, never as a confirmation', async () => {
		// "We sent you a link" is a claim nothing here can support.
		const h = mountForgot({ requestPasswordReset: vi.fn(async () => undefined) });
		try {
			await ask(h, 'ada@example.com');
			await vi.waitFor(() => {
				flushSync();
				expect(h.text()).toContain('is on its way');
			});

			expect(h.text()).toContain('If there is an account');
			expect(h.text(), 'claimed an account exists').not.toMatch(/we sent you|your account/i);
		} finally {
			h.cleanup();
		}
	});

	it('leaves the form up so a mistyped address can be corrected', async () => {
		const onSent = vi.fn();
		const h = mountForgot({ requestPasswordReset: vi.fn(async () => undefined) }, { onSent });

		try {
			await ask(h, 'typo@example.com');
			await vi.waitFor(() => {
				flushSync();
				expect(onSent).toHaveBeenCalledWith('typo@example.com');
			});

			expect(h.email(), 'the form was replaced by a terminal panel').not.toBeNull();
			expect(h.submit()).not.toBeNull();

			await ask(h, 'right@example.com');
			await vi.waitFor(() => {
				flushSync();
				expect(onSent).toHaveBeenCalledWith('right@example.com');
			});
			expect(onSent, 'each acceptance is worth reporting').toHaveBeenCalledTimes(2);
		} finally {
			h.cleanup();
		}
	});

	it('reports a repeat of the same address, not just a different one', async () => {
		// The commonest repeat there is: the mail did not arrive, so the user
		// presses send again with the address already in the field. The backend
		// accepts it again, and a consumer showing a "sent" toast must be told —
		// otherwise the second press looks broken. Comparing addresses rather
		// than attempts swallowed exactly this.
		const onSent = vi.fn();
		const requestPasswordReset = vi.fn(async () => undefined);
		const h = mountForgot({ requestPasswordReset }, { onSent });

		try {
			await ask(h, 'ada@example.com');
			await vi.waitFor(() => {
				flushSync();
				expect(onSent).toHaveBeenCalledTimes(1);
			});

			// Same address, pressed again.
			await userEvent.click(h.submit());
			await vi.waitFor(() => {
				flushSync();
				expect(onSent, 'a repeat of the same address was swallowed').toHaveBeenCalledTimes(2);
			});

			expect(requestPasswordReset).toHaveBeenCalledTimes(2);
			expect(onSent).toHaveBeenLastCalledWith('ada@example.com');
		} finally {
			h.cleanup();
		}
	});

	it('reports a rate limit rather than claiming a mail was sent', async () => {
		const h = mountForgot({
			requestPasswordReset: vi.fn(async () => {
				throw { code: 'rate_limited', message: 'Too many requests.' } satisfies AuthError;
			})
		});

		try {
			await ask(h, 'ada@example.com');
			await vi.waitFor(() => {
				flushSync();
				expect(h.banner()).not.toBeNull();
			});

			expect(h.banner()!.getAttribute('data-error-code')).toBe('rate_limited');
			expect(h.text(), 'a failure was dressed up as a success').not.toContain('is on its way');
		} finally {
			h.cleanup();
		}
	});
});

// ============================================================
// Reset password
// ============================================================

function mountReset(
	deps: ResetPasswordDependencies,
	props: Record<string, unknown> = {},
	token: string | null = 'tok_1'
) {
	const target = mountTarget();
	const flowStore = createStore({
		initialState: createInitialResetPasswordState(token),
		reducer: resetPasswordReducer,
		dependencies: deps
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
	const component = mount(ResetPasswordForm, {
		target,
		// `onRequestNewLink` is required, so the harness always has one; a test
		// that cares passes its own spy.
		props: { flowStore, sessionStore, onRequestNewLink: () => {}, ...props } as never
	});
	const inputs = () => [...target.querySelectorAll('input')] as HTMLInputElement[];
	return {
		target,
		component,
		sessionActions,
		text: () => target.textContent ?? '',
		password: () => inputs().find((i) => i.name === 'password'),
		confirm: () => inputs().find((i) => i.name === 'confirmPassword'),
		submit: () => target.querySelector('button[type="submit"]') as HTMLButtonElement,
		banner: () => target.querySelector('[data-error-code]'),
		button: (label: string) =>
			[...target.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label)),
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

async function setPassword(h: ReturnType<typeof mountReset>, password = GOOD, confirm = password) {
	await userEvent.fill(h.password()!, password);
	await userEvent.fill(h.confirm()!, confirm);
	flushSync();
	await userEvent.click(h.submit());
}

describe('setting a new password', () => {
	it('hands over a session when the reset issues one', async () => {
		const onSuccess = vi.fn();
		const h = mountReset({ resetPassword: vi.fn(async () => session) }, { onSuccess });

		try {
			await setPassword(h);
			await vi.waitFor(() => {
				flushSync();
				expect(h.sessionActions.map((a) => a.type)).toEqual(['sessionEstablished']);
			});
			expect(onSuccess).toHaveBeenCalledTimes(1);
			expect(h.text()).toContain('You are signed in');
		} finally {
			h.cleanup();
		}
	});

	it('establishes nothing when it issues none, and still says it worked', async () => {
		const onSignIn = vi.fn();
		const h = mountReset({ resetPassword: vi.fn(async () => null) }, { onSignIn });

		try {
			await setPassword(h);
			await vi.waitFor(() => {
				flushSync();
				expect(h.text()).toContain('Password changed');
			});

			expect(h.sessionActions, 'a session was established without one existing').toEqual([]);
			expect(h.text()).toContain('Sign in with your new password');

			const panel = h.target.querySelector('[role="status"]') as HTMLElement;
			expect(document.activeElement, 'focus was stranded').toBe(panel);

			await userEvent.click(h.button('Sign in')!);
			expect(onSignIn).toHaveBeenCalledTimes(1);
		} finally {
			h.cleanup();
		}
	});

	it('does not show a form it knows will fail', async () => {
		// A dead link cannot be fixed by resubmitting, so leaving the form up
		// invites the user to try. Both the missing and the expired case end in
		// the same offer.
		const onRequestNewLink = vi.fn();
		const h = mountReset(
			{ resetPassword: vi.fn() as unknown as ResetPasswordDependencies['resetPassword'] },
			{ onRequestNewLink },
			null
		);

		try {
			flushSync();
			expect(h.text()).toContain('This link is incomplete');
			expect(h.password(), 'a form was offered with no token to submit against').toBeUndefined();

			await userEvent.click(h.button('Send me a new link')!);
			expect(onRequestNewLink).toHaveBeenCalledTimes(1);
		} finally {
			h.cleanup();
		}
	});

	it('switches to the same offer when the backend rejects the link', async () => {
		const h = mountReset({
			resetPassword: vi.fn(async () => {
				throw EXPIRED;
			})
		});

		try {
			expect(h.password(), 'the form should be up before the link is known bad').toBeDefined();

			await setPassword(h);
			await vi.waitFor(() => {
				flushSync();
				expect(h.text()).toContain('This link has expired');
			});

			expect(h.banner()!.getAttribute('data-error-code')).toBe('token_expired');
			expect(h.password(), 'a form was left up that cannot succeed').toBeUndefined();
		} finally {
			h.cleanup();
		}
	});

	it('always offers a way out of a dead link', async () => {
		// It used to be possible to render this branch with no control at all: the
		// panel said "Ask for a new one to continue" and gave the user nothing to
		// do it with. `onRequestNewLink` is required now, so the branch cannot be
		// reached without one — this asserts the control is actually there.
		const h = mountReset(
			{ resetPassword: vi.fn() as unknown as ResetPasswordDependencies['resetPassword'] },
			{},
			null
		);

		try {
			flushSync();
			const actions = [...h.target.querySelectorAll('button, a')];
			expect(actions.length, 'a dead-end panel with nothing to act on').toBeGreaterThan(0);
			expect(h.button('Send me a new link')).toBeDefined();
		} finally {
			h.cleanup();
		}
	});

	it('shows the mismatch on blur, and the criteria all along', async () => {
		// Both inherited: the cross-field rule from the core fix, the checklist
		// from the shared policy module.
		const h = mountReset({
			resetPassword: vi.fn() as unknown as ResetPasswordDependencies['resetPassword']
		});

		try {
			const described = h.password()!.getAttribute('aria-describedby');
			expect(described, 'the requirements describe nothing').toBeTruthy();
			expect(h.target.querySelector(`#${CSS.escape(described!.split(' ')[0]!)}`)).not.toBeNull();

			await userEvent.fill(h.password()!, GOOD);
			await userEvent.fill(h.confirm()!, 'something-else-entirely');
			h.confirm()!.blur();

			await vi.waitFor(() => {
				flushSync();
				expect(h.confirm()!.getAttribute('aria-invalid')).toBe('true');
			});
		} finally {
			h.cleanup();
		}
	});

	it('takes the token from a prop as well as from the store', async () => {
		const resetPassword: ResetPasswordDependencies['resetPassword'] = vi.fn(async () => null);
		const h = mountReset({ resetPassword }, { token: 'from-prop' }, null);

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(h.password(), 'the prop token never reached the store').toBeDefined();
			});

			await setPassword(h);
			await vi.waitFor(() => {
				expect(resetPassword).toHaveBeenCalledWith('from-prop', GOOD, expect.anything());
			});
		} finally {
			h.cleanup();
		}
	});

	it('lets a consumer replace the done panel', async () => {
		const h = mountReset(
			{ resetPassword: vi.fn(async () => session) },
			{
				done: createRawSnippet<[{ signedIn: boolean }]>((getArgs) => ({
					render: () => `<p data-testid="custom">signedIn=${getArgs().signedIn}</p>`
				}))
			}
		);

		try {
			await setPassword(h);
			await vi.waitFor(() => {
				flushSync();
				expect(h.target.querySelector('[data-testid="custom"]')).not.toBeNull();
			});
			expect(h.target.querySelector('[data-testid="custom"]')!.textContent).toBe('signedIn=true');
			expect(h.text(), 'the default panel rendered as well').not.toContain('Password changed');
		} finally {
			h.cleanup();
		}
	});
});

describe('Pattern A: neither form animates anything', () => {
	it('resolves no transition or animation on their controls', async () => {
		const forgot = mountForgot({ requestPasswordReset: vi.fn(async () => undefined) });
		try {
			for (const element of [forgot.email(), forgot.submit()]) {
				expect(getComputedStyle(element).transitionDuration).toBe('0s');
				expect(getComputedStyle(element).animationName).toBe('none');
			}
		} finally {
			forgot.cleanup();
		}

		const reset = mountReset({
			resetPassword: vi.fn() as unknown as ResetPasswordDependencies['resetPassword']
		});
		try {
			for (const element of [reset.password()!, reset.confirm()!, reset.submit()]) {
				expect(getComputedStyle(element).transitionDuration).toBe('0s');
				expect(getComputedStyle(element).animationName).toBe('none');
			}
		} finally {
			reset.cleanup();
		}
	});
});
