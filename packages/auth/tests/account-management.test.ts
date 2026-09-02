/**
 * The two settings panels — browser mode.
 *
 * `MfaManagementPanel`'s load-bearing arm is that it will not guess. Both of its
 * branches offer *different* buttons, so an unknown account must produce
 * neither, or someone whose authenticator was never on is offered a "Turn off".
 *
 * `ConnectedAccountsPanel`'s is that the advisory is an advisory. The client
 * cannot tell whether detaching the last provider strands the user — a magic
 * link is also a way in, and nothing in `AccountSnapshot` says whether the
 * backend offers them — so the warning is words, and the button still works.
 */

import { describe, it, expect, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { userEvent } from 'vitest/browser';
import { createStore } from '@composable-svelte/core';

import MfaManagementPanel from '../src/lib/components/MfaManagementPanel.svelte';
import AccountReconciliationSwap from './test-components/AccountReconciliationSwap.svelte';
import ConnectedAccountsPanel from '../src/lib/components/ConnectedAccountsPanel.svelte';
import {
	connectedAccountsReducer,
	createInitialConnectedAccountsState,
	createInitialMfaManagementState,
	createInitialOAuthStartState,
	createMemoryPendingOAuthStorage,
	mfaManagementReducer,
	oauthStartReducer
} from '../src/lib/flows/index.js';
import type {
	ConnectedAccountsDependencies,
	MfaManagementDependencies,
	OAuthStartAction,
	OAuthStartDependencies
} from '../src/lib/flows/index.js';
import type { AuthError } from '../src/lib/errors/types.js';

const CODES = ['aaa-111', 'bbb-222'];

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

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

/** Whitespace-collapsed — templates wrap prose across lines, `toContain` does not. */
const collapse = (target: HTMLElement) => (target.textContent ?? '').replace(/\s+/g, ' ');

const buttons = (target: HTMLElement) => [...target.querySelectorAll('button')];
const button = (target: HTMLElement, label: string) =>
	buttons(target).find((b) => (b.textContent ?? '').replace(/\s+/g, ' ').includes(label));

function mountMfa(
	deps: Partial<MfaManagementDependencies> = {},
	props: Record<string, unknown> = {}
) {
	const target = mountTarget();
	const store = createStore({
		initialState: createInitialMfaManagementState(),
		reducer: mfaManagementReducer,
		dependencies: {
			disableMfa: vi.fn(async () => undefined),
			regenerateRecoveryCodes: vi.fn(async () => ({ recoveryCodes: CODES })),
			...deps
		} satisfies MfaManagementDependencies
	});
	const onChanged = vi.fn();
	const onReauthenticationRequired = vi.fn();
	const component = mount(MfaManagementPanel, {
		target,
		props: { store, onChanged, onReauthenticationRequired, ...props } as never
	});
	return {
		target,
		store,
		onChanged,
		onReauthenticationRequired,
		text: () => collapse(target),
		button: (label: string) => button(target, label),
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

function mountConnected(
	deps: Partial<ConnectedAccountsDependencies> = {},
	props: Record<string, unknown> = {},
	oauthDeps: Partial<OAuthStartDependencies> = {}
) {
	const target = mountTarget();
	const store = createStore({
		initialState: createInitialConnectedAccountsState(),
		reducer: connectedAccountsReducer,
		dependencies: {
			unlinkOAuthProvider: vi.fn(async () => undefined),
			...deps
		} satisfies ConnectedAccountsDependencies
	});
	const dispatched: OAuthStartAction[] = [];
	const real = createStore({
		initialState: createInitialOAuthStartState(),
		reducer: oauthStartReducer,
		dependencies: {
			beginOAuth: vi.fn(async () => ({
				authorizeUrl: 'https://provider.example/authorize',
				state: 'nonce-1'
			})),
			pendingOAuth: createMemoryPendingOAuthStorage(),
			redirect: vi.fn(),
			...oauthDeps
		} satisfies OAuthStartDependencies
	});
	const oauthStore = {
		get state() {
			return real.state;
		},
		dispatch(action: OAuthStartAction) {
			dispatched.push(action);
			real.dispatch(action);
		}
	};
	const onUnlinked = vi.fn();
	const onReauthenticationRequired = vi.fn();
	const component = mount(ConnectedAccountsPanel, {
		target,
		props: {
			store,
			oauthStore,
			onUnlinked,
			onReauthenticationRequired,
			available: [
				{ id: 'github', label: 'GitHub' },
				{ id: 'google', label: 'Google' }
			],
			...props
		} as never
	});
	return {
		target,
		store,
		dispatched,
		onUnlinked,
		onReauthenticationRequired,
		text: () => collapse(target),
		button: (label: string) => button(target, label),
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

// ============================================================
// The authenticator panel
// ============================================================

describe('MfaManagementPanel', () => {
	it('offers neither button until it knows whether MFA is on', async () => {
		// The arm this file exists for. Unlike `ChangePasswordForm`, whose two
		// branches offer the same button under different wording, these offer
		// different buttons — so a default would put "Turn off" in front of
		// someone who never turned it on.
		const h = mountMfa({}, { mfaEnabled: undefined });
		try {
			flushSync();
			expect(h.text()).toContain('Reading your account');
			expect(h.button('Turn off'), 'offered to turn off an unknown authenticator').toBeUndefined();
			expect(h.button('Get new recovery codes')).toBeUndefined();
		} finally {
			h.cleanup();
		}
	});

	it('turns it off, and stops claiming it is on before the account is re-read', async () => {
		// The account lags a successful disable by a round trip. A panel trusting
		// it alone would still be offering "Turn off" in that window.
		const disableMfa = vi.fn(async () => undefined);
		const h = mountMfa({ disableMfa }, { mfaEnabled: true });
		try {
			flushSync();
			await userEvent.click(h.button('Turn off')!);
			await vi.waitFor(() => {
				expect(h.store.state.status).toBe('disabled');
			});
			flushSync();

			expect(disableMfa).toHaveBeenCalled();
			// `mfaEnabled` is deliberately left `true` — the prop has not been
			// updated, which is exactly the window being tested.
			expect(h.button('Turn off'), 'still offered to turn off what is already off').toBeUndefined();
			expect(h.text()).toContain('no longer work');
			expect(h.onChanged).toHaveBeenCalled();
		} finally {
			h.cleanup();
		}
	});

	it('says the new codes replace the old ones', async () => {
		// Not cosmetic: someone who regenerated has an older list saved that has
		// just stopped working, and a panel that does not say so leaves them
		// holding dead codes they trust.
		const h = mountMfa({}, { mfaEnabled: true });
		try {
			flushSync();
			await userEvent.click(h.button('Get new recovery codes')!);
			await vi.waitFor(() => {
				expect(h.store.state.recoveryCodes).not.toBeNull();
			});
			flushSync();

			expect(h.text()).toContain('Save your recovery codes');
			expect(h.text(), 'a replacement set was presented as a first set').toContain(
				'replace your previous codes'
			);
			expect(h.text()).toContain('aaa-111');
			expect(h.onChanged).toHaveBeenCalled();
		} finally {
			h.cleanup();
		}
	});

	it('takes the codes away when the user says they have saved them', async () => {
		const h = mountMfa({}, { mfaEnabled: true });
		try {
			flushSync();
			await userEvent.click(h.button('Get new recovery codes')!);
			await vi.waitFor(() => expect(h.store.state.recoveryCodes).not.toBeNull());
			flushSync();

			await userEvent.click(h.button('I have saved them')!);
			flushSync();
			expect(h.text()).not.toContain('aaa-111');
		} finally {
			h.cleanup();
		}
	});

	it('routes a demand for proof rather than showing a red failure', async () => {
		// The `mfa_required` lesson, third customer. A consumer routing to a
		// confirmation prompt should not be shown "something went wrong" on the way.
		const h = mountMfa(
			{ disableMfa: vi.fn(async () => Promise.reject(NEEDS_PROOF)) },
			{ mfaEnabled: true }
		);
		try {
			flushSync();
			await userEvent.click(h.button('Turn off')!);
			await vi.waitFor(() => {
				expect(h.onReauthenticationRequired).toHaveBeenCalled();
			});
			flushSync();

			expect(h.onReauthenticationRequired).toHaveBeenCalledWith({
				operation: 'disable',
				methods: ['password']
			});
			expect(h.target.querySelector('[role="alert"]'), 'a routed demand was shown as a failure')
				.toBeNull();
			// Still on, and still offering the button — the demand is not a refusal.
			expect(h.button('Turn off')).toBeDefined();
		} finally {
			h.cleanup();
		}
	});

	it('shows an ordinary refusal, and says what did not happen', async () => {
		const h = mountMfa(
			{
				disableMfa: vi.fn(async () =>
					Promise.reject({ code: 'unknown', message: 'Service unavailable.' } satisfies AuthError)
				)
			},
			{ mfaEnabled: true, onReauthenticationRequired: undefined }
		);
		try {
			flushSync();
			await userEvent.click(h.button('Turn off')!);
			await vi.waitFor(() => {
				expect(h.store.state.error).not.toBeNull();
			});
			flushSync();

			expect(h.target.querySelector('[role="alert"]')).not.toBeNull();
			expect(h.text()).toContain('Service unavailable.');
			expect(h.text(), 'left the user unsure whether MFA was turned off').toContain(
				'Nothing was turned off'
			);
		} finally {
			h.cleanup();
		}
	});

	it('disables both buttons while either is in flight', async () => {
		const gate = deferred<void>();
		const h = mountMfa({ disableMfa: vi.fn(async () => gate.promise) }, { mfaEnabled: true });
		try {
			flushSync();
			await userEvent.click(h.button('Turn off')!);
			flushSync();

			expect(h.button('Get new recovery codes')?.disabled).toBe(true);
			expect(h.button('Turning off…')?.disabled).toBe(true);

			gate.resolve();
			await vi.waitFor(() => expect(h.store.state.status).toBe('disabled'));
		} finally {
			h.cleanup();
		}
	});
});

// ============================================================
// The connected-accounts panel
// ============================================================

describe('ConnectedAccountsPanel', () => {
	it('warns that a provider looks like the only way in, and detaches anyway', async () => {
		// The arm the whole design turns on. A disabled button here would be wrong
		// for every backend that offers magic links, and the client cannot tell.
		const unlinkOAuthProvider = vi.fn(async () => undefined);
		const h = mountConnected(
			{ unlinkOAuthProvider },
			{ providers: ['github'], hasPassword: false }
		);
		try {
			flushSync();
			expect(h.text()).toContain('only account connected');

			const disconnect = h.button('Disconnect');
			expect(disconnect, 'the advisory had been turned into a block').toBeDefined();
			expect(disconnect!.disabled).toBe(false);

			await userEvent.click(disconnect!);
			await vi.waitFor(() => {
				expect(unlinkOAuthProvider).toHaveBeenCalledWith('github', expect.anything());
			});
		} finally {
			h.cleanup();
		}
	});

	it('does not warn when there is a password to fall back on', async () => {
		const h = mountConnected({}, { providers: ['github'], hasPassword: true });
		try {
			flushSync();
			expect(h.text()).not.toContain('only account connected');
		} finally {
			h.cleanup();
		}
	});

	it('drops the row immediately, before the account has been re-read', async () => {
		// Without the local `unlinked` list the row stays until the surface's
		// re-read lands, offering a second click that can only fail.
		const h = mountConnected({}, { providers: ['github', 'google'], hasPassword: true });
		try {
			flushSync();
			expect(h.text()).toContain('GitHub');

			await userEvent.click(buttons(h.target).find((b) => {
				const row = b.closest('li');
				return row !== null && (row.textContent ?? '').includes('GitHub');
			})!);
			await vi.waitFor(() => {
				expect(h.store.state.unlinked).toEqual(['github']);
			});
			flushSync();

			// `providers` is deliberately unchanged — that is the window.
			const rows = [...h.target.querySelectorAll('li')].map((li) => li.textContent ?? '');
			expect(rows.join(' '), 'a detached provider was still listed').not.toContain('GitHub');
			expect(rows.join(' ')).toContain('Google');
			expect(h.onUnlinked).toHaveBeenCalledTimes(1);
		} finally {
			h.cleanup();
		}
	});

	it('sends someone to a provider as a link, not a sign-in', async () => {
		// The whole reuse: one redirect path, one pending record, two outcomes.
		// `intent: 'signIn'` here would sign the user in again as a side effect of
		// pressing Connect in their settings.
		const h = mountConnected({}, { providers: [], hasPassword: true, returnTo: '/settings' });
		try {
			flushSync();
			await userEvent.click(h.button('Connect GitHub')!);
			flushSync();

			expect(h.dispatched[0]).toEqual({
				type: 'authorizationRequested',
				provider: 'github',
				intent: 'link',
				returnTo: '/settings'
			});
		} finally {
			h.cleanup();
		}
	});

	it('offers only what is not attached already', async () => {
		const h = mountConnected({}, { providers: ['github'], hasPassword: true });
		try {
			flushSync();
			expect(h.button('Connect Google')).toBeDefined();
			expect(h.button('Connect GitHub'), 'offered to attach something already attached')
				.toBeUndefined();
		} finally {
			h.cleanup();
		}
	});

	it('claims nothing about an account it has not read', async () => {
		const h = mountConnected({}, { providers: undefined });
		try {
			flushSync();
			expect(h.text()).toContain('Reading your account');
			expect(h.text(), 'claimed an unread account had no providers').not.toContain(
				'No accounts are connected'
			);
			expect(h.button('Connect GitHub'), 'offered a link before knowing what was linked')
				.toBeUndefined();
		} finally {
			h.cleanup();
		}
	});

	it('shows a refusal beside the provider it is about', async () => {
		const h = mountConnected(
			{
				unlinkOAuthProvider: vi.fn(async () =>
					Promise.reject({
						code: 'unknown',
						message: 'That is the only way into this account.'
					} satisfies AuthError)
				)
			},
			{ providers: ['github'], hasPassword: false, onReauthenticationRequired: undefined }
		);
		try {
			flushSync();
			await userEvent.click(h.button('Disconnect')!);
			await vi.waitFor(() => {
				expect(h.store.state.error).not.toBeNull();
			});
			flushSync();

			expect(h.text()).toContain('only way into this account');
			// Still listed — the refusal means nothing was detached.
			expect(h.text()).toContain('GitHub');
		} finally {
			h.cleanup();
		}
	});

	it('surfaces a failure to start the redirect', async () => {
		// The redirect half's trouble, rendered here rather than left to the
		// `OAuthSignIn` that is not on this page. Without it, pressing Connect and
		// having the backend refuse leaves a button that goes quiet and says
		// nothing.
		const h = mountConnected(
			{},
			{ providers: [], hasPassword: true },
			{
				beginOAuth: vi.fn(async () =>
					Promise.reject({
						code: 'unknown',
						message: 'GitHub sign-in is not configured.'
					} satisfies AuthError)
				)
			}
		);
		try {
			flushSync();
			await userEvent.click(h.button('Connect GitHub')!);
			await vi.waitFor(() => {
				expect(h.text(), 'the redirect failed silently').toContain(
					'GitHub sign-in is not configured.'
				);
			});
			// Offered again, rather than left disabled on a dead attempt.
			expect(h.button('Connect GitHub')?.disabled).toBe(false);
		} finally {
			h.cleanup();
		}
	});
});

// ============================================================
// Reconciling with the account read
// ============================================================

describe('when the account catches up', () => {
	// Both panels hold local knowledge that covers the window before a re-read
	// lands, and both had it outlive that window. Neither failure was covered:
	// the reference client masked the first by remounting the store after the
	// OAuth callback, and reached the second through a path no test walked.

	function mountSwap(which: 'connected' | 'mfa', initial: Record<string, unknown>) {
		const target = mountTarget();
		const connectedStore = createStore({
			initialState: createInitialConnectedAccountsState(),
			reducer: connectedAccountsReducer,
			dependencies: { unlinkOAuthProvider: vi.fn(async () => undefined) }
		});
		const mfaStore = createStore({
			initialState: createInitialMfaManagementState(),
			reducer: mfaManagementReducer,
			dependencies: {
				disableMfa: vi.fn(async () => undefined),
				regenerateRecoveryCodes: vi.fn(async () => ({ recoveryCodes: CODES }))
			}
		});
		const oauthStore = createStore({
			initialState: createInitialOAuthStartState(),
			reducer: oauthStartReducer,
			dependencies: {
				beginOAuth: vi.fn(async () => ({ authorizeUrl: 'https://p.example/a', state: 'n' })),
				pendingOAuth: createMemoryPendingOAuthStorage(),
				redirect: vi.fn()
			}
		});
		const component = mount(AccountReconciliationSwap, {
			target,
			props: {
				which,
				connectedStore,
				mfaStore,
				oauthStore,
				available: [
					{ id: 'github', label: 'GitHub' },
					{ id: 'google', label: 'Google' }
				],
				initialProviders: [],
				initialMfaEnabled: false,
				...initial
			} as never
		});
		return {
			target,
			connectedStore,
			mfaStore,
			component: component as unknown as {
				reread(next: { providers?: readonly string[]; mfaEnabled?: boolean }): void;
			},
			text: () => collapse(target),
			button: (label: string) => button(target, label),
			cleanup: () => {
				unmount(component);
				target.remove();
			}
		};
	}

	it('shows a re-attached provider again, instead of hiding it forever', async () => {
		// `unlinked` only ever grew, so a provider disconnected and then
		// reconnected was missing from the list *and* offered under Connect at
		// the same time — both derive from the same value.
		const h = mountSwap('connected', { initialProviders: ['github', 'google'] });
		try {
			flushSync();
			await userEvent.click(
				buttons(h.target).find((b) => {
					const row = b.closest('li');
					return row !== null && (row.textContent ?? '').includes('GitHub');
				})!
			);
			await vi.waitFor(() => expect(h.connectedStore.state.unlinked).toEqual(['github']));
			flushSync();

			// The read lands: github is gone, so the entry has done its job.
			h.component.reread({ providers: ['google'] });
			flushSync();
			expect(
				h.connectedStore.state.unlinked,
				'the entry outlived the read it existed to cover'
			).toEqual([]);

			// And now it comes back.
			h.component.reread({ providers: ['google', 'github'] });
			flushSync();

			const rows = [...h.target.querySelectorAll('li')].map((li) => li.textContent ?? '').join(' ');
			expect(rows, 'a re-attached provider stayed hidden').toContain('GitHub');
			expect(
				h.button('Connect GitHub'),
				'offered to connect a provider that is already connected'
			).toBeUndefined();
		} finally {
			h.cleanup();
		}
	});

	it('keeps saying MFA is off until the read actually says otherwise', async () => {
		// The other direction, and the reason the reconciliation reports only
		// *changes*: the stale `true` still sitting in props must not undo the
		// disable the moment it succeeds.
		const h = mountSwap('mfa', { initialMfaEnabled: true });
		try {
			flushSync();
			await userEvent.click(h.button('Turn off')!);
			await vi.waitFor(() => expect(h.mfaStore.state.status).toBe('disabled'));
			flushSync();

			expect(h.mfaStore.state.status, 'a stale prop undid the disable').toBe('disabled');
			expect(h.text()).toContain('no longer work');
		} finally {
			h.cleanup();
		}
	});

	it('comes back from disabled when the account reports an authenticator again', async () => {
		// `disabled` was terminal with no way out, and the reference client
		// reached it: one store kept across an enrolment left the panel saying
		// "two-factor is off" for an account that had just turned it on, with two
		// buttons whose dispatches the guards silently ate.
		const h = mountSwap('mfa', { initialMfaEnabled: true });
		try {
			flushSync();
			await userEvent.click(h.button('Turn off')!);
			await vi.waitFor(() => expect(h.mfaStore.state.status).toBe('disabled'));

			h.component.reread({ mfaEnabled: false });
			flushSync();
			h.component.reread({ mfaEnabled: true });
			flushSync();

			expect(h.mfaStore.state.status, 'the store never left its dead end').toBe('idle');
			expect(h.text(), 'the panel still claimed two-factor was off').toContain(
				'Two-factor authentication is on'
			);
			expect(h.button('Turn off'), 'the way back was not offered').toBeDefined();
		} finally {
			h.cleanup();
		}
	});
});
