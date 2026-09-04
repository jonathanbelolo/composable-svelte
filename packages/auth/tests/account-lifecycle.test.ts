/**
 * The four components for changing, confirming and ending an account.
 *
 * Each carries one arm a plausible implementation gets wrong.
 *
 * `ChangeEmailForm`: the account's `pendingEmail` must reach the flow **only
 * when it changes**. The effect re-runs whenever the store settles, so
 * re-dispatching the unchanged prop lets a stale `null` — still in props
 * because the account has not been re-read — undo the request the instant it
 * succeeded.
 *
 * `DeleteAccountPanel`: pressing Delete must not delete. The confirmation lives
 * in the reducer, and the panel has to respect it rather than route around it.
 *
 * `SessionRefresh`: an ending is reported with `resolveSession`, never
 * `logout` — a 401 may be a proxy's, and a resolve fails closed anyway where a
 * logout would POST to a session that may still be alive.
 */

import { describe, it, expect, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createStore } from '@composable-svelte/core';

import ChangeEmailForm from '../src/lib/components/ChangeEmailForm.svelte';
import EmailChangeConfirmation from '../src/lib/components/EmailChangeConfirmation.svelte';
import DeleteAccountPanel from '../src/lib/components/DeleteAccountPanel.svelte';
import DeleteAccountWithConfirm from './test-components/DeleteAccountWithConfirm.svelte';
import SessionRefresh from '../src/lib/components/SessionRefresh.svelte';
import {
	changeEmailReducer,
	createInitialChangeEmailState,
	changeEmailConfirmReducer,
	createInitialChangeEmailConfirmState,
	deleteAccountReducer,
	createInitialDeleteAccountState,
	sessionRefreshReducer,
	createInitialSessionRefreshState,
	createInitialSessionState,
	type ChangeEmailDependencies,
	type ChangeEmailConfirmDependencies,
	type DeleteAccountDependencies,
	type SessionRefreshDependencies,
	type SessionRefreshAction
} from '../src/lib/index.js';
import { createMockClock } from '@composable-svelte/core';
import type { AuthError } from '../src/lib/errors/types.js';

const NEEDS_PROOF: AuthError = {
	code: 'reauthentication_required',
	message: 'Confirm it is still you.',
	methods: ['password']
};

function mountTarget(): HTMLDivElement {
	const target = document.createElement('div');
	document.body.appendChild(target);
	return target;
}

const collapse = (target: HTMLElement) => (target.textContent ?? '').replace(/\s+/g, ' ');
const button = (target: HTMLElement, label: string) =>
	[...target.querySelectorAll('button')].find((b) =>
		(b.textContent ?? '').replace(/\s+/g, ' ').includes(label)
	);

// ---------------------------------------------------------------------------

function mountChangeEmail(
	deps: Partial<ChangeEmailDependencies> = {},
	props: Record<string, unknown> = {}
) {
	const target = mountTarget();
	const flowStore = createStore({
		initialState: createInitialChangeEmailState(),
		reducer: changeEmailReducer,
		dependencies: {
			requestEmailChange: vi.fn(async () => undefined),
			resendEmailChange: vi.fn(async () => undefined),
			...deps
		} satisfies ChangeEmailDependencies
	});
	const onReauthenticationRequired = vi.fn();
	const component = mount(ChangeEmailForm, {
		target,
		props: { flowStore, onReauthenticationRequired, ...props } as never
	});
	return {
		target,
		flowStore,
		onReauthenticationRequired,
		text: () => collapse(target),
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

describe('ChangeEmailForm', () => {
	it('says the account is still on its old address while one is pending', () => {
		const h = mountChangeEmail({}, { currentEmail: 'ada@example.com' });
		try {
			h.flowStore.dispatch({ type: 'changeRequestSucceeded', email: 'new@example.com' });
			flushSync();

			expect(h.text()).toContain('ada@example.com');
			expect(h.text()).toContain('new@example.com');
			expect(h.text(), 'a pending change must not read as done').toContain('Nothing changes');
		} finally {
			h.cleanup();
		}
	});

	it('does not undo a request that the account has not caught up with', () => {
		// The arm that matters, and the one whose *sequencing* is the whole point:
		// the mount effect must settle first, or the test is asserting against a
		// reconciliation that has not run yet.
		const h = mountChangeEmail({}, { pendingEmail: null });
		try {
			flushSync();
			expect(h.flowStore.state.pendingEmail).toBeNull();

			// A request succeeds. The prop is still `null` — the account has not
			// been re-read — and the effect must NOT re-dispatch it, or the stale
			// value undoes the request the instant it lands.
			h.flowStore.dispatch({ type: 'changeRequestSucceeded', email: 'new@example.com' });
			flushSync();

			expect(h.flowStore.state.pendingEmail, 'a stale prop undid the request').toBe(
				'new@example.com'
			);
		} finally {
			h.cleanup();
		}
	});

	it('takes what the account says when it changes', () => {
		// The other direction: someone confirmed in another tab, the account is
		// re-read, and this store's memory of a pending change is now wrong.
		const h = mountChangeEmail({}, { pendingEmail: 'from-account@example.com' });
		try {
			flushSync();
			expect(h.flowStore.state.pendingEmail).toBe('from-account@example.com');
		} finally {
			h.cleanup();
		}
	});

	it('renders a taken address as an offer, not a red failure', () => {
		const h = mountChangeEmail();
		try {
			h.flowStore.dispatch({
				type: 'changeRequestFailed',
				error: { code: 'email_taken', message: 'That address already has an account.', email: 'x@y.z' }
			});
			flushSync();

			expect(h.text()).toContain('x@y.z');
			expect(h.text(), 'an offer, not a scolding').toContain('sign in to it instead');
		} finally {
			h.cleanup();
		}
	});

	it('reports a re-authentication demand once per demand, and hides the banner', () => {
		const h = mountChangeEmail();
		try {
			h.flowStore.dispatch({ type: 'changeRequestFailed', error: NEEDS_PROOF });
			flushSync();
			expect(h.onReauthenticationRequired).toHaveBeenCalledTimes(1);
			expect(h.onReauthenticationRequired).toHaveBeenCalledWith({ methods: ['password'] });
			expect(h.text(), 'a handled demand was painted as a failure').not.toContain(
				NEEDS_PROOF.message
			);

			// Leaving and re-entering a demand reports again — once per demand, not
			// once per distinct error object.
			h.flowStore.dispatch({ type: 'errorDismissed' });
			flushSync();
			h.flowStore.dispatch({ type: 'changeRequestFailed', error: NEEDS_PROOF });
			flushSync();
			expect(h.onReauthenticationRequired).toHaveBeenCalledTimes(2);
		} finally {
			h.cleanup();
		}
	});
});

// ---------------------------------------------------------------------------

describe('EmailChangeConfirmation', () => {
	function mountConfirm(deps: Partial<ChangeEmailConfirmDependencies> = {}, props: Record<string, unknown> = {}) {
		const target = mountTarget();
		const flowStore = createStore({
			initialState: createInitialChangeEmailConfirmState(),
			reducer: changeEmailConfirmReducer,
			dependencies: {
				confirmEmailChange: vi.fn(async () => 'new@example.com'),
				...deps
			} satisfies ChangeEmailConfirmDependencies
		});
		const onSignIn = vi.fn();
		const onConfirmed = vi.fn();
		const component = mount(EmailChangeConfirmation, {
			target,
			props: { flowStore, onSignIn, onConfirmed, ...props } as never
		});
		return {
			target,
			flowStore,
			onSignIn,
			onConfirmed,
			text: () => collapse(target),
			cleanup: () => {
				unmount(component);
				target.remove();
			}
		};
	}

	it('confirms on mount when it has a token', async () => {
		// Typed with its real signature: `vi.fn(async () => …)` infers a
		// zero-parameter mock, so `calls[0][0]` is an index into an empty tuple.
		const confirmEmailChange = vi.fn<ChangeEmailConfirmDependencies['confirmEmailChange']>(
			async () => 'new@example.com'
		);
		const h = mountConfirm({ confirmEmailChange }, { token: 'tok' });
		try {
			flushSync();
			await vi.waitFor(() => expect(confirmEmailChange).toHaveBeenCalledTimes(1));
			// The second argument is the effect's AbortSignal, not something this
			// component chooses — assert the token and leave the rest alone.
			expect(confirmEmailChange.mock.calls[0]?.[0]).toBe('tok');
		} finally {
			h.cleanup();
		}
	});

	it('does nothing without a token, and says why', () => {
		const confirmEmailChange = vi.fn(async () => 'new@example.com');
		const h = mountConfirm({ confirmEmailChange }, { token: null });
		try {
			flushSync();
			expect(confirmEmailChange).not.toHaveBeenCalled();
			expect(h.text()).toContain('needs the link');
		} finally {
			h.cleanup();
		}
	});

	it('offers a way in when there is no session, rather than a dead end', () => {
		const h = mountConfirm({}, { token: 'tok' });
		try {
			flushSync();
			h.flowStore.dispatch({
				type: 'confirmationFailed',
				error: { code: 'invalid_credentials', message: 'You are not signed in.' }
			});
			flushSync();

			const signIn = button(h.target, 'Sign in');
			expect(signIn, 'a 401 with no route out is the dead end this prop exists to prevent').toBeDefined();
			signIn!.click();
			expect(h.onSignIn).toHaveBeenCalledTimes(1);
		} finally {
			h.cleanup();
		}
	});

	it('reports the new address once', () => {
		const h = mountConfirm({}, { token: null });
		try {
			h.flowStore.dispatch({ type: 'confirmationSucceeded', email: 'new@example.com' });
			flushSync();
			h.flowStore.dispatch({ type: 'errorDismissed' });
			flushSync();

			expect(h.onConfirmed).toHaveBeenCalledTimes(1);
			expect(h.onConfirmed).toHaveBeenCalledWith('new@example.com');
			expect(h.text()).toContain('new@example.com');
		} finally {
			h.cleanup();
		}
	});
});

// ---------------------------------------------------------------------------

describe('DeleteAccountPanel', () => {
	function mountDelete(deps: Partial<DeleteAccountDependencies> = {}, props: Record<string, unknown> = {}) {
		const target = mountTarget();
		const store = createStore({
			initialState: createInitialDeleteAccountState(),
			reducer: deleteAccountReducer,
			dependencies: {
				deleteAccount: vi.fn(async () => undefined),
				...deps
			} satisfies DeleteAccountDependencies
		});
		const dispatched: unknown[] = [];
		const sessionStore = { dispatch: (a: unknown) => dispatched.push(a) };
		const onDeleted = vi.fn();
		const onReauthenticationRequired = vi.fn();
		const component = mount(DeleteAccountPanel, {
			target,
			props: { store, sessionStore, onDeleted, onReauthenticationRequired, ...props } as never
		});
		return {
			target,
			store,
			dispatched,
			onDeleted,
			onReauthenticationRequired,
			text: () => collapse(target),
			button: (label: string) => button(target, label),
			cleanup: () => {
				unmount(component);
				target.remove();
			}
		};
	}

	it('asks before deleting — one press is not enough', async () => {
		const deleteAccount = vi.fn(async () => undefined);
		const h = mountDelete({ deleteAccount }, { email: 'ada@example.com' });
		try {
			h.button('Delete my account')!.click();
			flushSync();

			expect(deleteAccount, 'one press deleted an account').not.toHaveBeenCalled();
			expect(h.text()).toContain('Are you sure');
			expect(h.text(), 'the copy must name what is being deleted').toContain('ada@example.com');

			h.button('Delete permanently')!.click();
			await vi.waitFor(() => expect(deleteAccount).toHaveBeenCalledTimes(1));
		} finally {
			h.cleanup();
		}
	});

	it('can be backed out of', () => {
		const deleteAccount = vi.fn(async () => undefined);
		const h = mountDelete({ deleteAccount });
		try {
			h.button('Delete my account')!.click();
			flushSync();
			h.button('Keep my account')!.click();
			flushSync();

			expect(h.store.state.status).toBe('idle');
			expect(deleteAccount).not.toHaveBeenCalled();
		} finally {
			h.cleanup();
		}
	});

	it('tells the session store exactly once when the account is gone', () => {
		const h = mountDelete();
		try {
			h.store.dispatch({ type: 'confirmationRequested' });
			h.store.dispatch({ type: 'deletionSucceeded' });
			flushSync();

			expect(h.dispatched).toEqual([{ type: 'logout' }]);
			expect(h.onDeleted).toHaveBeenCalledTimes(1);
		} finally {
			h.cleanup();
		}
	});

	it('hands the confirmation to a snippet, and stands aside', async () => {
		// The seam, actually exercised. The previous version of this test passed
		// no snippet at all and asserted the *inline* markup — which the test
		// above already covers — so it could never have failed.
		const target = mountTarget();
		const deleteAccount = vi.fn(async () => undefined);
		const store = createStore({
			initialState: createInitialDeleteAccountState(),
			reducer: deleteAccountReducer,
			dependencies: { deleteAccount } satisfies DeleteAccountDependencies
		});
		const component = mount(DeleteAccountWithConfirm, {
			target,
			props: { store, sessionStore: { dispatch: () => {} } } as never
		});
		try {
			store.dispatch({ type: 'confirmationRequested' });
			flushSync();

			expect(target.querySelector('[data-testid="custom-confirm"]')).not.toBeNull();
			expect(
				collapse(target),
				'the inline confirmation rendered alongside the snippet'
			).not.toContain('Are you sure');

			button(target, 'Yes, wipe it')!.click();
			await vi.waitFor(() => expect(deleteAccount).toHaveBeenCalledTimes(1));
		} finally {
			unmount(component);
			target.remove();
		}
	});

	it('reports a demand for proof and hides the banner', () => {
		const h = mountDelete();
		try {
			h.store.dispatch({ type: 'confirmationRequested' });
			h.store.dispatch({ type: 'deletionFailed', error: NEEDS_PROOF });
			flushSync();

			expect(h.onReauthenticationRequired).toHaveBeenCalledTimes(1);
			expect(h.text()).not.toContain(NEEDS_PROOF.message);
		} finally {
			h.cleanup();
		}
	});
});

// ---------------------------------------------------------------------------

describe('SessionRefresh', () => {
	function mountRefresh(props: Record<string, unknown> = {}) {
		const target = mountTarget();
		const flowStore = createStore({
			initialState: createInitialSessionRefreshState(),
			reducer: sessionRefreshReducer,
			dependencies: {
				refreshSession: vi.fn(async () => ({ expiresAt: null })),
				clock: createMockClock(0),
				leadMs: 60_000,
				tickMs: 30_000
			} satisfies SessionRefreshDependencies
		});
		const dispatched: unknown[] = [];
		let sessionState = { ...createInitialSessionState(), expiresAt: null as string | null };
		const sessionStore = {
			get state() {
				return sessionState;
			},
			dispatch: (a: unknown) => dispatched.push(a)
		};
		// A recording wrapper: what this component tells the *flow* is the thing
		// under test, and it is otherwise invisible — the component renders
		// nothing and the reducer turns `watchStarted` into a subscription.
		const toFlow: string[] = [];
		const recordingFlowStore = {
			get state() {
				return flowStore.state;
			},
			dispatch(action: SessionRefreshAction) {
				toFlow.push(action.type);
				flowStore.dispatch(action);
			}
		};
		const component = mount(SessionRefresh, {
			target,
			props: { flowStore: recordingFlowStore, sessionStore, ...props } as never
		});
		return {
			target,
			flowStore,
			toFlow,
			dispatched,
			setExpiry: (value: string | null) => {
				sessionState = { ...sessionState, expiresAt: value };
			},
			cleanup: () => {
				unmount(component);
				target.remove();
			}
		};
	}

	it('starts the watch on mount and stops it on unmount', () => {
		// This previously ended in `expect(true).toBe(true)` and could not fail.
		// A navigated-away page holding a live interval is exactly what the
		// unmount half prevents.
		const h = mountRefresh();
		flushSync();
		expect(h.toFlow).toContain('watchStarted');
		expect(h.toFlow).not.toContain('watchStopped');

		h.cleanup();
		expect(h.toFlow, 'unmount left the watch running').toContain('watchStopped');
	});

	it('reports an ending with resolveSession, never logout', () => {
		const h = mountRefresh();
		try {
			flushSync();
			h.flowStore.dispatch({
				type: 'refreshFailed',
				error: { code: 'invalid_credentials', message: 'gone' }
			});
			flushSync();

			expect(h.flowStore.state.status).toBe('ended');
			expect(
				h.dispatched.filter((a) => (a as { type: string }).type === 'resolveSession')
			).toHaveLength(1);
			expect(
				h.dispatched.filter((a) => (a as { type: string }).type === 'logout'),
				'a logout would POST to a session that may still be alive'
			).toHaveLength(0);
		} finally {
			h.cleanup();
		}
	});

	it('renders the ended snippet only when the session has ended', () => {
		const h = mountRefresh();
		try {
			flushSync();
			expect(h.target.textContent?.trim()).toBe('');
		} finally {
			h.cleanup();
		}
	});
});
