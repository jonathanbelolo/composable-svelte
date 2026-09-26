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
import VerificationTokenSwap from './test-components/VerificationTokenSwap.svelte';
import EmailVerificationWrapperChurn from './test-components/EmailVerificationWrapperChurn.svelte';
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

	it('does not lose a token that arrives while another is in flight', async () => {
		// The component records what it handed over. Recording a token the reducer
		// *refused* — because one was already running — would mean it was never
		// tried at all, silently and forever.
		//
		// The first link fails, which is the realistic pairing: a stale link is
		// open, a resent one arrives, and the second has to be picked up once the
		// first finishes. If the first had succeeded there would be nothing to
		// pick up — the address is already confirmed and exchanging another token
		// would spend it for nothing.
		let failFirst!: () => void;
		const first = new Promise<null>((_resolve, reject) => {
			failFirst = () => reject(EXPIRED);
		});
		const seen: string[] = [];
		const verifyEmail = vi.fn(async (token: string) => {
			seen.push(token);
			return seen.length === 1 ? first : null;
		});

		const target = mountTarget();
		const flowStore = createStore({
			initialState: createInitialEmailVerificationState('ada@example.com'),
			reducer: emailVerificationReducer,
			dependencies: { verifyEmail, resendVerification: vi.fn(async () => undefined) }
		});
		const component = mount(VerificationTokenSwap, {
			target,
			props: {
				flowStore,
				sessionStore: { dispatch: () => {} },
				initialToken: 'tok_1'
			} as never
		}) as unknown as { swap: (next: string) => void };

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(seen).toEqual(['tok_1']);
			});

			// A second link opened while the first is still being exchanged.
			component.swap('tok_2');
			flushSync();
			expect(seen, 'the reducer should have refused it').toEqual(['tok_1']);

			// The first finishes — badly. The second must not have been forgotten.
			failFirst();
			await vi.waitFor(() => {
				flushSync();
				expect(seen, 'a token that arrived mid-flight was dropped forever').toEqual([
					'tok_1',
					'tok_2'
				]);
			});
		} finally {
			unmount(component as never);
			target.remove();
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

	it('exchanges once and keeps focus when a standalone consumer rebuilds its wrapper', async () => {
		// A wrapper whose identity follows the flow's state is an ordinary
		// standalone call site. Keying on it would reopen the once-only guard on
		// every failure — fail, re-dispatch, fail — and remount the focused DOM.
		//
		// Only the first exchange fails. A second one never settles, so a
		// regression is one extra call and a stuck `verifying`, not an endless
		// fail/retry loop that keeps the timers busy.
		const verifyEmail = failOnceThenHang();
		const store = createStore({
			initialState: createInitialEmailVerificationState('ada@example.com'),
			reducer: emailVerificationReducer,
			dependencies: { verifyEmail, resendVerification: vi.fn(async () => undefined) }
		});
		const target = mountTarget();
		const component = mount(EmailVerificationWrapperChurn, { target, props: { store, token: 'stale' } });

		try {
			await vi.waitFor(() => expect(verifyEmail).toHaveBeenCalled());
			for (let turn = 0; turn < 10; turn++) await new Promise<void>((done) => setTimeout(done, 0));
			flushSync();
			expect(verifyEmail, 'a failed token was exchanged again').toHaveBeenCalledTimes(1);
			expect(target.querySelector('[data-error-code]')).not.toBeNull();

			const resend = [...target.querySelectorAll('button')].find((b) =>
				b.textContent?.includes('Send another link')
			)!;
			resend.focus();
			component.refresh();
			flushSync();
			const after = [...target.querySelectorAll('button')].find((b) =>
				b.textContent?.includes('Send another link')
			);
			expect(after, 'a new wrapper remounted the standalone DOM').toBe(resend);
			expect(document.activeElement).toBe(resend);

			resend.click();
			await vi.waitFor(() => {
				flushSync();
				expect(target.textContent).toContain('Sent.');
			});
			expect(verifyEmail).toHaveBeenCalledTimes(1);
		} finally {
			unmount(component);
			target.remove();
			store.destroy();
		}
	});

	it('dispatches to the store a standalone consumer switched to, without a second exchange', async () => {
		// One component instance, one owner: switching stores keeps the DOM and
		// the once-per-component token guard, but a click must reach the store
		// the consumer passes now, not the one it passed at mount.
		const verifyA = failOnceThenHang();
		const resendA = vi.fn(async (_email: string) => undefined);
		const a = createStore({
			initialState: createInitialEmailVerificationState('a@example.com'),
			reducer: emailVerificationReducer,
			dependencies: { verifyEmail: verifyA, resendVerification: resendA }
		});
		const verifyB = failOnceThenHang();
		const resendB = vi.fn(async (_email: string) => undefined);
		const b = createStore({
			initialState: createInitialEmailVerificationState('b@example.com'),
			reducer: emailVerificationReducer,
			dependencies: { verifyEmail: verifyB, resendVerification: resendB }
		});
		const target = mountTarget();
		const component = mount(EmailVerificationWrapperChurn, { target, props: { store: a, token: 'stale' } });

		try {
			await vi.waitFor(() => expect(verifyA).toHaveBeenCalledTimes(1));
			for (let turn = 0; turn < 10; turn++) await new Promise<void>((done) => setTimeout(done, 0));
			flushSync();
			const resend = [...target.querySelectorAll('button')].find((button) =>
				button.textContent?.includes('Send another link')
			)!;
			expect(target.textContent).toContain('a@example.com');

			component.use(b);
			flushSync();
			for (let turn = 0; turn < 10; turn++) await new Promise<void>((done) => setTimeout(done, 0));
			flushSync();
			expect(target.textContent, 'the switched store is rendered').toContain('b@example.com');
			expect(verifyB, 'the token was already handed over by this component').not.toHaveBeenCalled();
			expect(b.state.status).toBe('idle');
			const after = [...target.querySelectorAll('button')].find((button) =>
				button.textContent?.includes('Send another link')
			);
			expect(after, 'a store switch remounted the standalone DOM').toBe(resend);

			resend.click();
			await vi.waitFor(() => expect(resendB).toHaveBeenCalledTimes(1));
			expect(resendB).toHaveBeenCalledWith('b@example.com', expect.anything());
			expect(resendA, 'the click reached the store passed at mount').not.toHaveBeenCalled();
			expect(a.state.resendStatus).toBe('idle');
			expect(verifyA).toHaveBeenCalledTimes(1);
		} finally {
			unmount(component);
			target.remove();
			a.destroy();
			b.destroy();
		}
	});
});

/** A verifier whose first exchange fails and whose later ones never settle. */
function failOnceThenHang() {
	let calls = 0;
	return vi.fn((_token: string, _signal?: AbortSignal): Promise<SessionSnapshot | null> => {
		calls += 1;
		return calls === 1 ? Promise.reject(EXPIRED) : new Promise<never>(() => {});
	});
}

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
