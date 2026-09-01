/**
 * The two OAuth components — browser mode.
 *
 * The arm that matters most is `every branch a user can be stuck on has
 * something to click`. It enumerates the failures rather than sampling them,
 * because the dead-end species has now been found three separate times in this
 * package by reading, and reading is evidently not reliable enough.
 *
 * Second is `only the pressed provider says it is working` — the shared-flag
 * defect from `MfaEnrolment`, generalised: with four buttons on screen one
 * boolean disables all four and names none.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { userEvent } from 'vitest/browser';
import { createStore } from '@composable-svelte/core';

import OAuthSignIn from '../src/lib/components/OAuthSignIn.svelte';
import OAuthCallback from '../src/lib/components/OAuthCallback.svelte';
import {
	oauthStartReducer,
	createInitialOAuthStartState,
	oauthCallbackReducer,
	createInitialOAuthCallbackState,
	createMemoryPendingOAuthStorage
} from '../src/lib/flows/index.js';
import type {
	OAuthStartDependencies,
	OAuthCallbackDependencies,
	OAuthCallbackParams,
	OAuthCallbackState
} from '../src/lib/flows/index.js';
import { createInitialSessionState, sessionReducer } from '../src/lib/session/reducer.js';
import type { SessionDependencies } from '../src/lib/session/types.js';
import type { AuthError } from '../src/lib/errors/types.js';
import type { SessionSnapshot } from '../src/lib/subject/types.js';

const session: SessionSnapshot = {
	subject_id: 'aa000000-0000-4000-8000-00000000000a',
	display_name: 'Ada',
	roles: ['member']
};

const PROVIDERS = [
	{ id: 'google', label: 'Google' },
	{ id: 'github', label: 'GitHub' }
];

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

function mountSignIn(
	deps: Partial<OAuthStartDependencies> = {},
	props: Record<string, unknown> = {}
) {
	const target = mountTarget();
	const flowStore = createStore({
		initialState: createInitialOAuthStartState(),
		reducer: oauthStartReducer,
		dependencies: {
			beginOAuth: vi.fn(async () => ({
				authorizeUrl: 'https://provider.example/authorize',
				state: 'st_1'
			})),
			pendingOAuth: createMemoryPendingOAuthStorage(),
			redirect: vi.fn(),
			...deps
		} satisfies OAuthStartDependencies
	});
	const component = mount(OAuthSignIn, {
		target,
		props: { flowStore, providers: PROVIDERS, ...props } as never
	});
	return {
		target,
		flowStore,
		buttons: () => [...target.querySelectorAll('button')],
		labelled: (text: string) =>
			[...target.querySelectorAll('button')].find((b) => b.textContent?.includes(text)),
		text: () => target.textContent ?? '',
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

function params(over: Partial<OAuthCallbackParams> = {}): OAuthCallbackParams {
	return { code: null, state: null, error: null, errorDescription: null, ...over };
}

function mountCallback(
	deps: Partial<OAuthCallbackDependencies> = {},
	props: Record<string, unknown> = {},
	initial?: Partial<OAuthCallbackState>
) {
	const target = mountTarget();
	const flowStore = createStore({
		initialState: { ...createInitialOAuthCallbackState(), ...initial },
		reducer: oauthCallbackReducer,
		dependencies: {
			completeOAuth: vi.fn(async () => session),
			pendingOAuth: createMemoryPendingOAuthStorage(),
			...deps
		} satisfies OAuthCallbackDependencies
	});
	const spy = sessionSpy();
	const onSuccess = vi.fn();
	const onStartOver = vi.fn();
	const component = mount(OAuthCallback, {
		target,
		props: {
			flowStore,
			sessionStore: spy.store,
			onSuccess,
			onStartOver,
			...props
		} as never
	});
	return {
		target,
		flowStore,
		sessionActions: spy.actions,
		onSuccess,
		onStartOver,
		buttons: () => [...target.querySelectorAll('button')],
		text: () => target.textContent ?? '',
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

// ============================================================
// OAuthSignIn
// ============================================================

describe('OAuthSignIn', () => {
	it('offers one control per provider and starts the one pressed', async () => {
		const beginOAuth = vi.fn<OAuthStartDependencies['beginOAuth']>(async () => ({
			authorizeUrl: 'https://provider.example/authorize',
			state: 'st_1'
		}));
		const h = mountSignIn({ beginOAuth });

		try {
			expect(h.buttons()).toHaveLength(2);
			expect(h.text()).toContain('Continue with Google');
			expect(h.text()).toContain('Continue with GitHub');

			await userEvent.click(h.labelled('GitHub')!);
			await vi.waitFor(() => {
				flushSync();
				expect(beginOAuth).toHaveBeenCalledWith('github', expect.anything());
			});
		} finally {
			h.cleanup();
		}
	});

	it('only the pressed provider says it is working', async () => {
		// The shared-flag defect, generalised. One boolean across N buttons
		// disables all of them and names none — the same shape as the single
		// `copied` flag `MfaEnrolment` was using for two different things.
		const slow = deferred<{ authorizeUrl: string; state: string }>();
		const h = mountSignIn({ beginOAuth: vi.fn(() => slow.promise) });

		try {
			await userEvent.click(h.labelled('GitHub')!);
			await vi.waitFor(() => {
				flushSync();
				expect(h.text()).toContain('Connecting…');
			});

			const google = h.labelled('Google');
			expect(google, 'the untouched provider stopped offering itself').toBeDefined();
			expect(google!.textContent).toContain('Continue with Google');
			expect(google!.disabled, 'an unrelated provider was disabled').toBe(false);
		} finally {
			slow.resolve({ authorizeUrl: 'https://provider.example/authorize', state: 'st_1' });
			h.cleanup();
		}
	});

	it('leaves every provider clickable after a failure', async () => {
		const h = mountSignIn({
			beginOAuth: vi.fn(async () => {
				throw { code: 'rate_limited', message: 'Slow down.' } satisfies AuthError;
			})
		});

		try {
			await userEvent.click(h.labelled('GitHub')!);
			await vi.waitFor(() => {
				flushSync();
				expect(h.target.querySelector('[data-error-code]')).not.toBeNull();
			});

			expect(h.buttons()).toHaveLength(2);
			expect(h.buttons().every((b) => !b.disabled), 'a failure disabled the way out').toBe(true);
		} finally {
			h.cleanup();
		}
	});

	it('renders controls, not links', async () => {
		// A ctrl-click on an `<a>` would open the authorize page in a new tab,
		// whose `sessionStorage` is a *copy* taken at open time — so the record
		// written afterwards lands in the wrong tab and the callback can never
		// verify it. There is also no href to give: the URL does not exist until
		// `beginOAuth` answers.
		const h = mountSignIn();
		try {
			expect(h.target.querySelectorAll('a')).toHaveLength(0);
			expect(h.buttons().every((b) => b.type === 'button')).toBe(true);
		} finally {
			h.cleanup();
		}
	});

	it('renders nothing at all when there are no providers', async () => {
		// Including the heading. "Or continue with" over empty space is worse than
		// silence, and this is the one deliberate exception to rendering the
		// header unconditionally.
		const h = mountSignIn({}, { providers: [] });
		try {
			expect(h.buttons()).toHaveLength(0);
			expect(h.text()).not.toContain('Or continue with');
		} finally {
			h.cleanup();
		}
	});

	it('gives the icon snippet the provider it is for', async () => {
		const h = mountSignIn(
			{},
			{
				icon: createRawSnippet((provider: () => { provider: { id: string } }) => ({
					render: () => `<span data-icon="${provider().provider.id}"></span>`
				}))
			}
		);
		try {
			expect(h.target.querySelector('[data-icon="google"]')).not.toBeNull();
			expect(h.target.querySelector('[data-icon="github"]')).not.toBeNull();
		} finally {
			h.cleanup();
		}
	});

	it('animates nothing', async () => {
		// Pattern A. `animation-policy.test.ts` reads the source; this reads the
		// computed style, which is what a user actually gets.
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

// ============================================================
// OAuthCallback
// ============================================================

describe('OAuthCallback', () => {
	it('exchanges on mount, hands the session over, and offers a way onward', async () => {
		const pendingOAuth = createMemoryPendingOAuthStorage();
		pendingOAuth.put({ provider: 'github', state: 'st_1', returnTo: '/app' });
		const completeOAuth = vi.fn<OAuthCallbackDependencies['completeOAuth']>(async () => session);
		const h = mountCallback(
			{ completeOAuth, pendingOAuth },
			{ params: params({ code: 'c_1', state: 'st_1' }) }
		);

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(h.sessionActions.map((a) => a.type)).toEqual(['sessionEstablished']);
			});
			expect(completeOAuth).toHaveBeenCalledWith('github', 'c_1', 'st_1', expect.anything());

			const onward = h.buttons().find((b) => b.textContent?.includes('Continue'));
			expect(onward, 'a completed sign-in had nowhere to go').toBeDefined();
			await userEvent.click(onward!);
			expect(h.onSuccess).toHaveBeenCalledWith({ returnTo: '/app' });
		} finally {
			h.cleanup();
		}
	});

	it('exchanges exactly once, however often the store churns', async () => {
		const pendingOAuth = createMemoryPendingOAuthStorage();
		pendingOAuth.put({ provider: 'github', state: 'st_1', returnTo: null });
		const completeOAuth = vi.fn<OAuthCallbackDependencies['completeOAuth']>(async () => session);
		const h = mountCallback(
			{ completeOAuth, pendingOAuth },
			{ params: params({ code: 'c_1', state: 'st_1' }) }
		);

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(completeOAuth).toHaveBeenCalledTimes(1);
			});

			// Every later dispatch re-runs the effect's dependencies.
			for (let i = 0; i < 5; i++) {
				h.flowStore.dispatch({
					type: 'callbackReceived',
					params: params({ code: 'c_1', state: 'st_1' })
				});
			}
			flushSync();
			await new Promise((resolve) => setTimeout(resolve, 30));
			flushSync();

			expect(completeOAuth, 'a single-use code was spent twice').toHaveBeenCalledTimes(1);
			expect(h.sessionActions).toHaveLength(1);
		} finally {
			h.cleanup();
		}
	});

	it('every branch a user can be stuck on has something to click', async () => {
		// Enumerated rather than sampled. The dead-end species has been found in
		// this package three times by reading, so reading is not the check.
		const branches: Array<{ name: string; state: Partial<OAuthCallbackState> }> = [
			{
				name: 'cancelled at the provider',
				state: {
					status: 'failed',
					error: { code: 'oauth_denied', message: 'You cancelled that sign-in.' }
				}
			},
			{
				name: 'the nonce could not be verified',
				state: {
					status: 'failed',
					error: { code: 'oauth_state_mismatch', message: 'That link is no longer valid.' }
				}
			},
			{
				name: 'an unrecognised provider failure',
				state: { status: 'failed', error: { code: 'unknown', message: 'Something went wrong.' } }
			},
			{
				name: 'the network never answered',
				state: { status: 'failed', error: { code: 'network', message: 'Offline.' } }
			},
			{
				name: 'rate limited',
				state: {
					status: 'failed',
					error: { code: 'rate_limited', message: 'Too many attempts.', retryAfterSeconds: 60 }
				}
			},
			{
				name: 'a second factor with nothing handling it',
				state: {
					status: 'failed',
					error: {
						code: 'mfa_required',
						message: 'Enter your code.',
						challengeId: 'c1',
						methods: ['totp']
					}
				}
			},
			{ name: 'signed in', state: { status: 'completed', session, returnTo: null } }
		];

		for (const { name, state } of branches) {
			const h = mountCallback({}, { params: params({ code: 'c_1', state: 'st_1' }) }, state);
			try {
				flushSync();
				const clickable = h.buttons();
				expect(clickable.length, `"${name}" left the user with nothing to click`).toBeGreaterThan(0);
				await userEvent.click(clickable[clickable.length - 1]!);
				expect(
					h.onStartOver.mock.calls.length + h.onSuccess.mock.calls.length,
					`"${name}" has a button that does nothing`
				).toBeGreaterThan(0);
			} finally {
				h.cleanup();
			}
		}
	});

	it('offers a way back when the page was reached with no callback at all', async () => {
		const completeOAuth = vi.fn<OAuthCallbackDependencies['completeOAuth']>(async () => session);
		const h = mountCallback({ completeOAuth }, { params: null });

		try {
			flushSync();
			expect(h.text()).toContain('Nothing to finish here');
			expect(completeOAuth).not.toHaveBeenCalled();
			expect(h.buttons().length).toBeGreaterThan(0);

			await userEvent.click(h.buttons()[0]!);
			expect(h.onStartOver).toHaveBeenCalled();
		} finally {
			h.cleanup();
		}
	});

	it('shows a cancellation as a status, not a failure', async () => {
		// The `mfa_required` lesson. Pressing Cancel at Google broke nothing, and
		// a red `role="alert"` saying otherwise is both wrong and alarming.
		const h = mountCallback(
			{},
			{ params: params({ code: 'c', state: 's' }) },
			{ status: 'failed', error: { code: 'oauth_denied', message: 'You cancelled that sign-in.' } }
		);
		try {
			flushSync();
			expect(h.target.querySelector('[role="alert"]'), 'a cancellation raised an alert').toBeNull();
			expect(h.target.querySelector('[role="status"]')).not.toBeNull();
		} finally {
			h.cleanup();
		}
	});

	it('does raise an alert for a real failure', async () => {
		// The non-vacuity partner of the arm above: without this, deleting every
		// `role="alert"` in the component would pass.
		const h = mountCallback(
			{},
			{ params: params({ code: 'c', state: 's' }) },
			{
				status: 'failed',
				error: { code: 'oauth_state_mismatch', message: 'That link is no longer valid.' }
			}
		);
		try {
			flushSync();
			expect(h.target.querySelector('[role="alert"]')).not.toBeNull();
			expect(h.target.querySelector('[data-error-code="oauth_state_mismatch"]')).not.toBeNull();
		} finally {
			h.cleanup();
		}
	});

	it('keeps the footer on the branch where the user is most stuck', async () => {
		// It used to vanish on exactly this branch in `MfaChallengeForm`.
		const h = mountCallback(
			{},
			{
				params: params({ code: 'c', state: 's' }),
				footer: createRawSnippet(() => ({ render: () => '<a href="/help">Get help</a>' }))
			},
			{
				status: 'failed',
				error: { code: 'oauth_state_mismatch', message: 'That link is no longer valid.' }
			}
		);
		try {
			flushSync();
			expect(
				h.target.querySelector('a[href="/help"]'),
				'the footer was dropped on the stuck branch'
			).not.toBeNull();
		} finally {
			h.cleanup();
		}
	});

	it('hands a second factor to whoever is handling it, once per challenge', async () => {
		const onMfaRequired = vi.fn();
		const h = mountCallback(
			{},
			{ params: params({ code: 'c', state: 's' }), onMfaRequired },
			{
				status: 'failed',
				error: {
					code: 'mfa_required',
					message: 'Enter your code.',
					challengeId: 'chal_oauth',
					methods: ['totp']
				}
			}
		);

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(onMfaRequired).toHaveBeenCalledWith({
					challengeId: 'chal_oauth',
					methods: ['totp']
				});
			});
			expect(
				h.target.querySelector('[role="alert"]'),
				'a handled second factor showed a failure banner'
			).toBeNull();
		} finally {
			h.cleanup();
		}
	});

	it('animates nothing', async () => {
		const h = mountCallback({}, { params: null });
		try {
			const style = getComputedStyle(h.buttons()[0]!);
			expect(style.transitionDuration).toBe('0s');
			expect(style.animationName).toBe('none');
		} finally {
			h.cleanup();
		}
	});
});
