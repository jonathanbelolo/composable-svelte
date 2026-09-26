/**
 * Managed account summary and connected-accounts inventory flows through `createAuthFeature`.
 *
 * Covers:
 * - Slot operations: openAccount, restartAccount, closeAccount, openConnectedAccounts,
 *   restartConnectedAccounts, closeConnectedAccounts.
 * - Guard: settings slots refuse to open when anonymous or while a temporary flow is live.
 * - Sibling independence: account and connectedAccounts live alongside MFA settings without conflict.
 * - Subject switch retirement: changing subject or session expiry retires account and connectedAccounts,
 *   dropping in-flight fetch and unlink results.
 * - Logout retirement: logout clears account and connectedAccounts and aborts in-flight requests.
 * - Single-reduction outcome pulse: connectedAccountsOutcome pulses { kind: 'unlinked', provider }
 *   on unlinkSucceeded, { kind: 'reauthenticationRequired', provider, methods } on unlinkFailed with
 *   reauthentication_required, and resets to null on subsequent actions.
 * - Replay guards: settled unlink actions cannot pulse duplicate outcomes.
 * - Late effect drops: retired owner's late arrival is dropped without reducing or pulsing.
 * - No client-side denial rule: no frontend rule denies unlink based on password or provider count.
 * - Truthful consumption: account snapshot is undefined before read; panel renders "Reading your account…"
 *   with no false empty state.
 * - Mount effect: starts account read once per owned mounted view on client; never in SSR.
 * - Deliberate reload: reloadRequested re-reads account snapshot truthfully.
 * - Unlink reconciliation: local unlinked knowledge hides provider immediately, and is pruned upon
 *   account re-read via providersObserved, allowing re-attached provider to re-appear.
 * - Preflush event safety: old subtree click before flush reaches only retired view.
 * - Linking via onLink or oauthStore: reuses oauthStart (intent: 'link'); disabled when unavailable.
 * - Standalone mode: backward-compatible standalone props and callbacks work intact.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createStore, type Store } from '@composable-svelte/core';

import ManagedAuthRecipe from './test-components/ManagedAuthRecipe.svelte';
import ConnectedAccountsPanel from '../src/lib/components/ConnectedAccountsPanel.svelte';
import {
	createAuthFeature,
	type AuthFeature,
	type AuthFeatureAction,
	type AuthFeatureDependencies,
	type AuthFeatureState
} from '../src/lib/application/index.js';
import type {
	ConnectedAccountsAction,
	ConnectedAccountsState
} from '../src/lib/flows/index.js';
import {
	connectedAccountsReducer,
	createInitialAccountState,
	createInitialConnectedAccountsState,
	createInitialMfaManagementState,
	createInitialOAuthStartState,
	createInitialLoginState
} from '../src/lib/flows/index.js';
import { createInitialSessionState, type SessionState } from '../src/lib/session/index.js';
import { subjectFromSession } from '../src/lib/subject/index.js';
import type { AccountSnapshot } from '../src/lib/deps.js';
import type { AuthError } from '../src/lib/errors/types.js';
import type { OAuthProvider } from '../src/lib/flows/oauth-pending.js';
import {
	controlledAuthDeps,
	settle,
	snapshot
} from './fixtures/managed-auth-drivers.js';

type AuthStore = Store<AuthFeatureState, AuthFeatureAction>;

const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');
const bob = snapshot('bbbbbbbb-0000-0000-0000-000000000002', 'Bob');

const ADA_ACCOUNT: AccountSnapshot = {
	email: 'ada@example.com',
	emailVerified: true,
	hasPassword: true,
	mfaEnabled: false,
	providers: ['github', 'google'],
	pendingEmail: null
};

const SINGLE_PROVIDER_ACCOUNT: AccountSnapshot = {
	email: 'ada@example.com',
	emailVerified: true,
	hasPassword: false,
	mfaEnabled: false,
	providers: ['github'],
	pendingEmail: null
};

const NEEDS_PROOF: AuthError = {
	code: 'reauthentication_required',
	message: 'Confirm it is still you.',
	methods: ['password', 'totp']
};

function signedIn(who: typeof ada): SessionState {
	return { ...createInitialSessionState(), status: 'authenticated', subject: subjectFromSession(who) };
}

const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
	vi.restoreAllMocks();
});

function createAuthStore(
	auth: AuthFeature,
	deps: AuthFeatureDependencies,
	initialState?: Partial<AuthFeatureState>
): AuthStore {
	const store = createStore({
		initialState: {
			...auth.initialState(),
			session: signedIn(ada),
			...initialState
		},
		reducer: auth.composition.reducer,
		execution: auth.composition.execution,
		dependencies: deps
	});
	cleanups.push(() => store.destroy());
	return store;
}

function mountRecipe(
	auth: AuthFeature,
	store: AuthStore,
	options: {
		onLink?: ((provider: OAuthProvider) => void) | undefined;
		providers?: readonly { id: string; label: string }[] | undefined;
	} = {}
) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(ManagedAuthRecipe, {
		target,
		props: {
			auth,
			store,
			onLink: options.onLink,
			providers: options.providers
		}
	});
	cleanups.push(() => {
		unmount(component);
		target.remove();
	});
	return { target, component };
}

function observeOutcomes(store: AuthStore) {
	const seen: Array<{ action: AuthFeatureAction; outcome: AuthFeatureState['connectedAccountsOutcome'] }> = [];
	store.subscribeToActions?.((action) => seen.push({ action, outcome: store.state.connectedAccountsOutcome }));
	return seen;
}

const buttonNamed = (target: Element, name: string) =>
	[...target.querySelectorAll('button')].find((b) => b.textContent?.trim().includes(name));

function disconnectButton(target: Element, providerLabel: string): HTMLButtonElement | null {
	const rows = target.querySelectorAll('.connected-accounts__row');
	for (const row of rows) {
		const name = row.querySelector('.connected-accounts__name');
		if (name?.textContent?.trim() === providerLabel) {
			return row.querySelector<HTMLButtonElement>('button.connected-accounts__destructive');
		}
	}
	return null;
}

function connectButton(target: Element, providerLabel: string): HTMLButtonElement | null {
	const buttons = target.querySelectorAll<HTMLButtonElement>('button.connected-accounts__secondary');
	for (const btn of buttons) {
		if (btn.textContent?.includes(`Connect ${providerLabel}`)) {
			return btn;
		}
	}
	return null;
}

describe('managed account and connected-accounts - headless rules', () => {
	it('opens, restarts, and closes account and connected-accounts slots', () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		expect(store.state.account).toBeNull();
		expect(store.state.connectedAccounts).toBeNull();

		store.dispatch({ type: 'openAccount' });
		expect(store.state.account?.status).toBe('idle');

		store.dispatch({ type: 'openConnectedAccounts' });
		expect(store.state.connectedAccounts?.status).toBe('idle');

		store.dispatch({ type: 'restartAccount' });
		expect(store.state.account?.status).toBe('idle');

		store.dispatch({ type: 'restartConnectedAccounts' });
		expect(store.state.connectedAccounts?.status).toBe('idle');

		store.dispatch({ type: 'closeAccount' });
		expect(store.state.account).toBeNull();

		store.dispatch({ type: 'closeConnectedAccounts' });
		expect(store.state.connectedAccounts).toBeNull();
	});

	it('refuses settings slots while anonymous or when temporary flow is live', () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();

		// Anonymous session: settings slots refused
		const anonStore = createStore({
			initialState: auth.initialState(),
			reducer: auth.composition.reducer,
			execution: auth.composition.execution,
			dependencies: deps
		});
		cleanups.push(() => anonStore.destroy());

		anonStore.dispatch({ type: 'openAccount' });
		expect(anonStore.state.account).toBeNull();
		anonStore.dispatch({ type: 'openConnectedAccounts' });
		expect(anonStore.state.connectedAccounts).toBeNull();

		// Authenticated but temporary flow (login) is live: settings slots refused
		const liveStore = createAuthStore(auth, deps, {
			login: createInitialLoginState()
		});
		liveStore.dispatch({ type: 'openAccount' });
		expect(liveStore.state.account).toBeNull();
		liveStore.dispatch({ type: 'openConnectedAccounts' });
		expect(liveStore.state.connectedAccounts).toBeNull();
	});

	it('maintains sibling independence between account, connectedAccounts, and MFA settings', () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		store.dispatch({ type: 'openAccount' });
		store.dispatch({ type: 'openConnectedAccounts' });
		store.dispatch({ type: 'openMfaManagement' });

		expect(store.state.account?.status).toBe('idle');
		expect(store.state.connectedAccounts?.status).toBe('idle');
		expect(store.state.mfaManagement?.status).toBe('idle');

		// Dispatching within connectedAccounts does not disturb account or MFA
		store.dispatch({
			type: 'connectedAccounts',
			action: {
				type: 'presented',
				action: { type: 'unlinkRequested', provider: 'github' }
			}
		});
		expect(store.state.connectedAccounts?.status).toBe('unlinking');
		expect(store.state.account?.status).toBe('idle');
		expect(store.state.mfaManagement?.status).toBe('idle');

		// Closing MFA does not close account or connectedAccounts
		store.dispatch({ type: 'closeMfaManagement' });
		expect(store.state.mfaManagement).toBeNull();
		expect(store.state.account).not.toBeNull();
		expect(store.state.connectedAccounts).not.toBeNull();
	});

	it('retires account and connected-accounts upon subject switch or logout and drops in-flight results', async () => {
		const auth = createAuthFeature();
		const { deps, fetchAccounts, unlinkOAuths } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		store.dispatch({ type: 'openAccount' });
		store.dispatch({ type: 'openConnectedAccounts' });

		// Trigger in-flight fetch and unlink
		const accView = auth.composition.bind(store, auth.accountSlot)!;
		accView.dispatch({ type: 'accountRequested' });
		const connView = auth.composition.bind(store, auth.connectedAccountsSlot)!;
		connView.dispatch({ type: 'unlinkRequested', provider: 'github' });

		await vi.waitFor(() => {
			expect(fetchAccounts).toHaveLength(1);
			expect(unlinkOAuths).toHaveLength(1);
		});

		const oldFetch = fetchAccounts[0]!;
		const oldUnlink = unlinkOAuths[0]!;

		// Switch subject to Bob
		store.dispatch({
			type: 'session',
			action: {
				type: 'sessionEstablished',
				session: bob
			}
		});

		expect(store.state.account).toBeNull();
		expect(store.state.connectedAccounts).toBeNull();
		expect(oldFetch.signal?.aborted).toBe(true);
		expect(oldUnlink.signal?.aborted).toBe(true);

		// Late resolutions are dropped
		oldFetch.resolve(ADA_ACCOUNT);
		oldUnlink.resolve();
		await settle();

		expect(store.state.account).toBeNull();
		expect(store.state.connectedAccounts).toBeNull();
		expect(store.state.connectedAccountsOutcome).toBeNull();

		// Now test logout retirement
		store.dispatch({ type: 'openAccount' });
		store.dispatch({ type: 'openConnectedAccounts' });
		expect(store.state.account).not.toBeNull();
		expect(store.state.connectedAccounts).not.toBeNull();

		store.dispatch({ type: 'session', action: { type: 'logout' } });
		expect(store.state.account).toBeNull();
		expect(store.state.connectedAccounts).toBeNull();
	});

	it('pulses single-reduction outcomes for unlink success and backend reauth, resetting next turn', async () => {
		const auth = createAuthFeature();
		const { deps, unlinkOAuths } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen = observeOutcomes(store);

		store.dispatch({ type: 'openConnectedAccounts' });
		const view = auth.composition.bind(store, auth.connectedAccountsSlot)!;

		// 1. Unlink success pulse
		view.dispatch({ type: 'unlinkRequested', provider: 'github' });
		await vi.waitFor(() => expect(unlinkOAuths).toHaveLength(1));
		unlinkOAuths[0]!.resolve();
		await settle();

		const unlinkPulse = seen.find(({ outcome }) => outcome?.kind === 'unlinked');
		expect(unlinkPulse).toBeDefined();
		expect(unlinkPulse?.outcome).toEqual({ kind: 'unlinked', provider: 'github' });
		// Next action clears it
		store.dispatch({ type: 'closeConnectedAccounts' });
		expect(store.state.connectedAccountsOutcome).toBeNull();

		// 2. Reauth required pulse
		store.dispatch({ type: 'openConnectedAccounts' });
		const view2 = auth.composition.bind(store, auth.connectedAccountsSlot)!;
		view2.dispatch({ type: 'unlinkRequested', provider: 'google' });
		await vi.waitFor(() => expect(unlinkOAuths).toHaveLength(2));
		unlinkOAuths[1]!.reject(NEEDS_PROOF);
		await settle();

		const reauthPulse = seen.find(({ outcome }) => outcome?.kind === 'reauthenticationRequired');
		expect(reauthPulse).toBeDefined();
		expect(reauthPulse?.outcome).toEqual({
			kind: 'reauthenticationRequired',
			provider: 'google',
			methods: ['password', 'totp']
		});
		store.dispatch(reauthPulse!.action);
		expect(seen.filter(({ outcome }) => outcome?.kind === 'reauthenticationRequired')).toHaveLength(1);
		expect(store.state.connectedAccountsOutcome).toBeNull();

		// 3. Regular error does NOT pulse outcome
		store.dispatch({ type: 'restartConnectedAccounts' });
		const view3 = auth.composition.bind(store, auth.connectedAccountsSlot)!;
		view3.dispatch({ type: 'unlinkRequested', provider: 'google' });
		await vi.waitFor(() => expect(unlinkOAuths).toHaveLength(3));
		unlinkOAuths[2]!.reject({ code: 'network', message: 'Failed to reach server' });
		await settle();

		expect(store.state.connectedAccounts?.error?.code).toBe('network');
		expect(store.state.connectedAccountsOutcome).toBeNull();
	});

	it('refuses replay into settled or idle connectedAccounts flow', async () => {
		const auth = createAuthFeature();
		const { deps, unlinkOAuths } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen = observeOutcomes(store);

		store.dispatch({ type: 'openConnectedAccounts' });
		const view = auth.composition.bind(store, auth.connectedAccountsSlot)!;

		view.dispatch({ type: 'unlinkRequested', provider: 'github' });
		await vi.waitFor(() => expect(unlinkOAuths).toHaveLength(1));
		unlinkOAuths[0]!.resolve();
		await settle();

		expect(seen.filter(({ outcome }) => outcome?.kind === 'unlinked')).toHaveLength(1);

		// Replay the exact unlinkSucceeded action
		const acceptedAction = seen.find(({ outcome }) => outcome?.kind === 'unlinked')!.action;
		store.dispatch(acceptedAction);
		await settle();

		expect(seen.filter(({ outcome }) => outcome?.kind === 'unlinked')).toHaveLength(1);
		expect(store.state.connectedAccountsOutcome).toBeNull();
	});

	it('drops late effect from retired connectedAccounts owner without outcome pulse', async () => {
		const auth = createAuthFeature();
		const { deps, unlinkOAuths } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen = observeOutcomes(store);

		store.dispatch({ type: 'openConnectedAccounts' });
		const view = auth.composition.bind(store, auth.connectedAccountsSlot)!;
		view.dispatch({ type: 'unlinkRequested', provider: 'github' });
		await vi.waitFor(() => expect(unlinkOAuths).toHaveLength(1));
		const oldReq = unlinkOAuths[0]!;

		// Restart connectedAccounts while request in flight
		store.dispatch({ type: 'restartConnectedAccounts' });
		expect(oldReq.signal?.aborted).toBe(true);
		expect(store.state.connectedAccounts?.status).toBe('idle');

		// Old request resolves late
		oldReq.resolve();
		await settle();

		expect(store.state.connectedAccounts?.unlinked).toEqual([]);
		expect(seen.filter(({ outcome }) => outcome !== null)).toHaveLength(0);
	});
});

describe('managed ConnectedAccountsPanel - mounted DOM behavior', () => {
	it('starts account read on mount once, renders truthfully without false empty state, and deliberate reload updates snapshot', async () => {
		const auth = createAuthFeature();
		const { deps, fetchAccounts } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		store.dispatch({ type: 'openAccount' });
		store.dispatch({ type: 'openConnectedAccounts' });

		const { target } = mountRecipe(auth, store);
		flushSync();

		// Truthful before read lands: "Reading your account…", not "No accounts connected"
		expect(target.textContent).toContain('Reading your account');
		expect(buttonNamed(target, 'Disconnect')).toBeUndefined();

		// Mount effect triggered accountRequested once
		await vi.waitFor(() => expect(fetchAccounts).toHaveLength(1));
		expect(fetchAccounts[0]!.signal?.aborted).toBe(false);

		// Resolve read
		fetchAccounts[0]!.resolve(ADA_ACCOUNT);
		await settle();
		flushSync();

		expect(target.textContent).not.toContain('Reading your account');
		expect(target.textContent).toContain('GitHub');
		expect(target.textContent).toContain('Google');
		const disconnectButtons = target.querySelectorAll('button.connected-accounts__destructive');
		expect(disconnectButtons.length).toBe(2);

		// Deliberate reload via reloadRequested
		const accView = auth.composition.bind(store, auth.accountSlot)!;
		accView.dispatch({ type: 'reloadRequested' });
		await vi.waitFor(() => expect(fetchAccounts).toHaveLength(2));

		fetchAccounts[1]!.resolve({
			...ADA_ACCOUNT,
			providers: ['github'] // Google was detached on backend
		});
		await settle();
		flushSync();

		expect(target.textContent).toContain('GitHub');
		expect(disconnectButton(target, 'Google')).toBeNull();
	});

	it('disconnect click detaches provider immediately, pulses unlinked, and account re-read prunes local unlinked knowledge', async () => {
		const auth = createAuthFeature();
		const { deps, fetchAccounts, unlinkOAuths } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen = observeOutcomes(store);

		store.dispatch({ type: 'openAccount' });
		store.dispatch({ type: 'openConnectedAccounts' });

		const { target } = mountRecipe(auth, store);
		flushSync();

		await vi.waitFor(() => expect(fetchAccounts).toHaveLength(1));
		fetchAccounts[0]!.resolve(ADA_ACCOUNT);
		await settle();
		flushSync();

		// Click Disconnect for GitHub
		const disconnectGithub = disconnectButton(target, 'GitHub');
		expect(disconnectGithub).not.toBeNull();
		disconnectGithub!.click();
		flushSync();

		await vi.waitFor(() => expect(unlinkOAuths).toHaveLength(1));
		expect(unlinkOAuths[0]!.provider).toBe('github');
		expect(store.state.connectedAccounts?.status).toBe('unlinking');

		// Resolve unlink
		unlinkOAuths[0]!.resolve();
		await settle();
		flushSync();

		// 1. Immediately removed from view via local unlinked array
		expect(disconnectButton(target, 'GitHub')).toBeNull();
		expect(store.state.connectedAccounts?.unlinked).toContain('github');

		// 2. Parent receives unlinked outcome pulse
		const pulse = seen.find(({ outcome }) => outcome?.kind === 'unlinked');
		expect(pulse?.outcome).toEqual({ kind: 'unlinked', provider: 'github' });

		// 3. Parent responds by reloading account
		const accView = auth.composition.bind(store, auth.accountSlot)!;
		accView.dispatch({ type: 'reloadRequested' });
		await vi.waitFor(() => expect(fetchAccounts).toHaveLength(2));

		// Backend returns account without GitHub
		fetchAccounts[1]!.resolve({
			...ADA_ACCOUNT,
			providers: ['google']
		});
		await settle();
		flushSync();

		// 4. Local knowledge is pruned via providersObserved: unlinked no longer contains github
		expect(store.state.connectedAccounts?.unlinked).toEqual([]);

		// 5. If GitHub is re-attached on backend and account re-read lands, GitHub reappears in linked!
		accView.dispatch({ type: 'reloadRequested' });
		await vi.waitFor(() => expect(fetchAccounts).toHaveLength(3));
		fetchAccounts[2]!.resolve({
			...ADA_ACCOUNT,
			providers: ['github', 'google']
		});
		await settle();
		flushSync();

		expect(disconnectButton(target, 'GitHub')).not.toBeNull();
	});

	it('displays backend reauthentication requirement and re-enables disconnect button', async () => {
		const auth = createAuthFeature();
		const { deps, fetchAccounts, unlinkOAuths } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen = observeOutcomes(store);

		store.dispatch({ type: 'openAccount' });
		store.dispatch({ type: 'openConnectedAccounts' });

		const { target } = mountRecipe(auth, store);
		flushSync();

		await vi.waitFor(() => expect(fetchAccounts).toHaveLength(1));
		fetchAccounts[0]!.resolve(ADA_ACCOUNT);
		await settle();
		flushSync();

		const disconnectGoogle = disconnectButton(target, 'Google');
		expect(disconnectGoogle).not.toBeNull();
		disconnectGoogle!.click();
		flushSync();

		await vi.waitFor(() => expect(unlinkOAuths).toHaveLength(1));
		unlinkOAuths[0]!.reject(NEEDS_PROOF);
		await settle();
		flushSync();

		// Reauth outcome was pulsed to parent
		expect(seen.find(({ outcome }) => outcome?.kind === 'reauthenticationRequired')?.outcome).toEqual({
			kind: 'reauthenticationRequired',
			provider: 'google',
			methods: ['password', 'totp']
		});

		// Visible in panel alert
		const alert = target.querySelector('[role="alert"]');
		expect(alert).not.toBeNull();
		expect(alert?.getAttribute('data-error-code')).toBe('reauthentication_required');
		expect(alert?.textContent).toContain('Confirm it is still you.');

		// Disconnect button is re-enabled for retry
		const retryBtn = disconnectButton(target, 'Google');
		expect(retryBtn).not.toBeNull();
		expect(retryBtn?.disabled).toBe(false);
	});

	it('routes old subtree clicks before flush to retired view, not the replacement', async () => {
		const auth = createAuthFeature();
		const { deps, fetchAccounts, unlinkOAuths } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		store.dispatch({ type: 'openAccount' });
		store.dispatch({ type: 'openConnectedAccounts' });

		const { target } = mountRecipe(auth, store);
		flushSync();

		await vi.waitFor(() => expect(fetchAccounts).toHaveLength(1));
		fetchAccounts[0]!.resolve(ADA_ACCOUNT);
		await settle();
		flushSync();

		const oldDisconnectGithub = disconnectButton(target, 'GitHub');
		expect(oldDisconnectGithub).not.toBeNull();
		expect(oldDisconnectGithub!.isConnected).toBe(true);

		// Replacement is live in store, but DOM has not flushed
		store.dispatch({ type: 'restartConnectedAccounts' });
		expect(oldDisconnectGithub!.isConnected).toBe(true);

		// Click on old element
		oldDisconnectGithub!.click();
		flushSync();
		await settle();

		expect(oldDisconnectGithub!.isConnected).toBe(false);
		expect(unlinkOAuths, 'retired view dropped it').toHaveLength(0);
		expect(store.state.connectedAccounts?.status).toBe('idle');
		expect(store.state.connectedAccountsOutcome).toBeNull();
	});

	it('linking reuses onLink port or oauthStore, and safely disables link button when unavailable', async () => {
		const auth = createAuthFeature();
		const { deps, fetchAccounts } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		store.dispatch({ type: 'openAccount' });
		store.dispatch({ type: 'openConnectedAccounts' });

		let linkedProvider: OAuthProvider | null = null;
		const { target } = mountRecipe(auth, store, {
			onLink: (p) => {
				linkedProvider = p;
			}
		});
		flushSync();

		await vi.waitFor(() => expect(fetchAccounts).toHaveLength(1));
		fetchAccounts[0]!.resolve({
			...ADA_ACCOUNT,
			providers: ['github'] // only github linked, google is linkable
		});
		await settle();
		flushSync();

		const connectGoogle = connectButton(target, 'Google');
		expect(connectGoogle).not.toBeNull();
		expect(connectGoogle?.disabled).toBe(false);

		connectGoogle!.click();
		flushSync();
		expect(linkedProvider).toBe('google');
	});

	it('disables connect button when oauthStore is absent and onLink is not provided', async () => {
		const auth = createAuthFeature();
		const { deps, fetchAccounts } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		store.dispatch({ type: 'openAccount' });
		store.dispatch({ type: 'openConnectedAccounts' });

		// Mount with onLink undefined
		const { target } = mountRecipe(auth, store, { onLink: undefined });
		flushSync();

		await vi.waitFor(() => expect(fetchAccounts).toHaveLength(1));
		fetchAccounts[0]!.resolve({
			...ADA_ACCOUNT,
			providers: ['github']
		});
		await settle();
		flushSync();

		// oauthStart is not open in store, so oauthStartView is undefined
		const connectGoogle = connectButton(target, 'Google');
		expect(connectGoogle).not.toBeNull();
		expect(connectGoogle?.disabled).toBe(true);
	});

	it('does not deny unlink when user has only one provider and no password (backend is authority)', async () => {
		const auth = createAuthFeature();
		const { deps, fetchAccounts, unlinkOAuths } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		store.dispatch({ type: 'openAccount' });
		store.dispatch({ type: 'openConnectedAccounts' });

		const { target } = mountRecipe(auth, store);
		flushSync();

		await vi.waitFor(() => expect(fetchAccounts).toHaveLength(1));
		fetchAccounts[0]!.resolve(SINGLE_PROVIDER_ACCOUNT);
		await settle();
		flushSync();

		// Advisory warning is visible
		expect(target.querySelector('.connected-accounts__note')).not.toBeNull();

		// But disconnect button is NEVER disabled by client-side rule
		const disconnectGithub = disconnectButton(target, 'GitHub');
		expect(disconnectGithub).not.toBeNull();
		expect(disconnectGithub?.disabled).toBe(false);

		disconnectGithub!.click();
		flushSync();
		await vi.waitFor(() => expect(unlinkOAuths).toHaveLength(1));
	});

	it('supports standalone binding with reactive store, props, and callbacks intact', async () => {
		let unlinkedCalled = 0;
		let reauthDemand: { provider: string; methods: readonly string[] } | null = null;
		let linkTarget: string | null = null;

		const target = document.createElement('div');
		document.body.appendChild(target);

		let shouldFailReauth = false;
		const standaloneStore = createStore({
			initialState: createInitialConnectedAccountsState(),
			reducer: connectedAccountsReducer,
			dependencies: {
				unlinkOAuthProvider: async (provider: string) => {
					if (shouldFailReauth) {
						throw {
							code: 'reauthentication_required',
							message: 'Confirm it is you.',
							methods: ['password', 'totp']
						};
					}
				}
			}
		});

		const component = mount(ConnectedAccountsPanel, {
			target,
			props: {
				mode: 'standalone',
				store: standaloneStore,
				providers: ['github', 'google'],
				hasPassword: true,
				available: [
					{ id: 'github', label: 'GitHub' },
					{ id: 'google', label: 'Google' }
				],
				onUnlinked: () => {
					unlinkedCalled++;
				},
				onReauthenticationRequired: (demand) => {
					reauthDemand = demand;
				},
				onLink: (provider) => {
					linkTarget = provider;
				}
			}
		});
		cleanups.push(() => {
			unmount(component);
			target.remove();
			standaloneStore.destroy();
		});

		flushSync();
		expect(target.textContent).toContain('GitHub');
		expect(target.textContent).toContain('Google');

		// 1. Unlink success triggers onUnlinked callback via component effect
		const disconnectGithub = disconnectButton(target, 'GitHub');
		expect(disconnectGithub).not.toBeNull();
		disconnectGithub!.click();
		flushSync();
		expect(standaloneStore.state.status).toBe('unlinking');

		await vi.waitFor(() => expect(unlinkedCalled).toBe(1));
		expect(standaloneStore.state.unlinked).toContain('github');

		// 2. Connecting unlinked provider triggers onLink callback
		const connectGithub = target.querySelector<HTMLButtonElement>('button.connected-accounts__secondary');
		expect(connectGithub).not.toBeNull();
		expect(connectGithub?.textContent).toContain('Connect GitHub');
		connectGithub!.click();
		flushSync();
		expect(linkTarget).toBe('github');

		// 3. Reauth failure triggers onReauthenticationRequired callback
		shouldFailReauth = true;
		const disconnectGoogle = disconnectButton(target, 'Google');
		expect(disconnectGoogle).not.toBeNull();
		disconnectGoogle!.click();
		flushSync();

		await vi.waitFor(() => expect(reauthDemand).not.toBeNull());
		expect(reauthDemand).toEqual({ provider: 'google', methods: ['password', 'totp'] });
	});

	it('startOAuthLink refuses when unauthenticated and resets temporary flows when authenticated', async () => {
		const auth = createAuthFeature();
		const { deps, beginOAuths, redirects } = controlledAuthDeps();

		// 1. Unauthenticated -> refused / unchanged
		const unauthStore = createAuthStore(auth, deps, {
			session: createInitialSessionState()
		});
		unauthStore.dispatch({ type: 'startOAuthLink', provider: 'github' });
		expect(unauthStore.state.oauthStart).toBeNull();
		expect(beginOAuths).toHaveLength(0);

		// 2. Authenticated -> starts oauthStart with intent 'link' and executes redirect
		const authStore = createAuthStore(auth, deps);

		// Open a live temporary flow (e.g. login)
		authStore.dispatch({ type: 'openLogin' });
		expect(authStore.state.login).not.toBeNull();

		// startOAuthLink clears temporary flows and starts link
		authStore.dispatch({ type: 'startOAuthLink', provider: 'github', returnTo: '/dashboard' });
		expect(authStore.state.login).toBeNull();
		expect(authStore.state.oauthStart).not.toBeNull();
		expect(authStore.state.oauthStart?.provider).toBe('github');

		await vi.waitFor(() => expect(beginOAuths).toHaveLength(1));
		expect(beginOAuths[0]!.provider).toBe('github');

		beginOAuths[0]!.resolve({
			authorizeUrl: 'https://auth.example/github?client_id=123',
			state: 'oauth-state'
		});
		await settle();
		expect(redirects).toContain('https://auth.example/github?client_id=123');

		const pending = deps.pendingOAuth.take();
		expect(pending).toEqual({
			provider: 'github',
			intent: 'link',
			state: 'oauth-state',
			returnTo: '/dashboard'
		});
	});

	it('retiring oauthStart during beginOAuth in startOAuthLink aborts request and drops late results', async () => {
		const auth = createAuthFeature();
		const { deps, beginOAuths, redirects, pendingOAuth } = controlledAuthDeps();
		const authStore = createAuthStore(auth, deps);

		authStore.dispatch({ type: 'startOAuthLink', provider: 'github', returnTo: '/dashboard' });
		await vi.waitFor(() => expect(beginOAuths).toHaveLength(1));
		const request = beginOAuths[0]!;
		expect(request.provider).toBe('github');
		expect(request.signal?.aborted).toBe(false);

		// Close oauthStart while request is in flight
		authStore.dispatch({ type: 'closeOAuthStart' });
		expect(authStore.state.oauthStart).toBeNull();
		expect(request.signal?.aborted).toBe(true);

		// Late resolution must be dropped
		request.resolve({
			authorizeUrl: 'https://auth.example/github?client_id=123',
			state: 'oauth-state'
		});
		await settle();
		expect(redirects).toHaveLength(0);
		expect(pendingOAuth.take()).toBeNull();
	});

	it('restart and sign-in with same provider drops stale link start and stores sign-in record', async () => {
		const auth = createAuthFeature();
		const { deps, beginOAuths, redirects, pendingOAuth } = controlledAuthDeps();
		const authStore = createAuthStore(auth, deps);

		// 1. User starts linking GitHub
		authStore.dispatch({ type: 'startOAuthLink', provider: 'github', returnTo: '/dashboard' });
		await vi.waitFor(() => expect(beginOAuths).toHaveLength(1));
		const linkRequest = beginOAuths[0]!;
		expect(linkRequest.provider).toBe('github');

		// 2. User cancels/restarts and opens OAuth start for sign-in
		authStore.dispatch({ type: 'restartOAuthStart' });
		expect(linkRequest.signal?.aborted).toBe(true);

		// User starts sign-in with the same provider (github)
		authStore.dispatch({
			type: 'oauthStart',
			action: {
				type: 'presented',
				action: {
					type: 'authorizationRequested',
					provider: 'github',
					intent: 'signIn',
					returnTo: '/home'
				}
			}
		});
		await vi.waitFor(() => expect(beginOAuths).toHaveLength(2));
		const signInRequest = beginOAuths[1]!;

		// Stale link request resolves now: must be dropped and ignored
		linkRequest.resolve({
			authorizeUrl: 'https://auth.example/github?client_id=link',
			state: 'state-link'
		});
		await settle();
		expect(redirects).toHaveLength(0);
		expect(pendingOAuth.take()).toBeNull();

		// Legitimate sign-in request resolves
		signInRequest.resolve({
			authorizeUrl: 'https://auth.example/github?client_id=signin',
			state: 'state-signin'
		});
		await settle();
		expect(redirects).toContain('https://auth.example/github?client_id=signin');
		const record = pendingOAuth.take();
		expect(record?.intent).toBe('signIn');
		expect(record?.state).toBe('state-signin');
	});

	it('logout during startOAuthLink aborts in-flight request and drops late results', async () => {
		const auth = createAuthFeature();
		const { deps, beginOAuths, redirects, pendingOAuth } = controlledAuthDeps();
		const authStore = createAuthStore(auth, deps);

		authStore.dispatch({ type: 'startOAuthLink', provider: 'github' });
		await vi.waitFor(() => expect(beginOAuths).toHaveLength(1));
		const request = beginOAuths[0]!;

		// Logout retires all settings and temporary flows
		authStore.dispatch({ type: 'session', action: { type: 'logout' } });
		expect(request.signal?.aborted).toBe(true);

		request.resolve({
			authorizeUrl: 'https://auth.example/github?client_id=123',
			state: 'oauth-state'
		});
		await settle();
		expect(redirects).toHaveLength(0);
		expect(pendingOAuth.take()).toBeNull();
	});

	it('supports genuine oauthStore port for linking in managed ConnectedAccountsPanel', async () => {
		const target = document.createElement('div');
		document.body.appendChild(target);

		const auth = createAuthFeature();
		const { deps, beginOAuths, redirects, pendingOAuth } = controlledAuthDeps();
		const authStore = createAuthStore(auth, deps);

		authStore.dispatch({ type: 'openConnectedAccounts' });
		authStore.dispatch({ type: 'openOAuthStart' });

		const connectedView = auth.composition.bind(authStore, auth.connectedAccountsSlot)!;
		const oauthView = auth.composition.bind(authStore, auth.oauthStartSlot)!;

		const component = mount(ConnectedAccountsPanel, {
			target,
			props: {
				mode: 'managed',
				store: connectedView,
				oauthStore: oauthView,
				providers: ['google'],
				available: [
					{ id: 'github', label: 'GitHub' },
					{ id: 'google', label: 'Google' }
				]
			}
		});
		cleanups.push(() => {
			unmount(component);
			target.remove();
		});

		flushSync();
		const connectGithub = target.querySelector<HTMLButtonElement>('button.connected-accounts__secondary');
		expect(connectGithub).not.toBeNull();
		expect(connectGithub?.textContent).toContain('Connect GitHub');

		connectGithub!.click();
		flushSync();

		await vi.waitFor(() => expect(beginOAuths).toHaveLength(1));
		expect(beginOAuths[0]!.provider).toBe('github');

		beginOAuths[0]!.resolve({
			authorizeUrl: 'https://auth.example/github?client_id=managed',
			state: 'managed-state'
		});
		await settle();
		expect(redirects).toContain('https://auth.example/github?client_id=managed');
		const record = pendingOAuth.take();
		expect(record?.intent).toBe('link');
	});

	it('supports genuine oauthStore port for linking in ConnectedAccountsPanel', async () => {
		const target = document.createElement('div');
		document.body.appendChild(target);

		let dispatchedOAuthAction: any = null;
		const mockOAuthStore = {
			state: createInitialOAuthStartState(),
			dispatch(action: any) {
				dispatchedOAuthAction = action;
			}
		};

		const connectedStore = createStore({
			initialState: createInitialConnectedAccountsState(),
			reducer: connectedAccountsReducer,
			dependencies: {
				unlinkOAuthProvider: async () => {}
			}
		});

		const component = mount(ConnectedAccountsPanel, {
			target,
			props: {
				mode: 'standalone',
				store: connectedStore,
				oauthStore: mockOAuthStore,
				providers: ['google'],
				available: [
					{ id: 'github', label: 'GitHub' },
					{ id: 'google', label: 'Google' }
				]
			}
		});
		cleanups.push(() => {
			unmount(component);
			target.remove();
			connectedStore.destroy();
		});

		flushSync();
		const connectGithub = target.querySelector<HTMLButtonElement>('button.connected-accounts__secondary');
		expect(connectGithub).not.toBeNull();
		expect(connectGithub?.textContent).toContain('Connect GitHub');

		connectGithub!.click();
		flushSync();

		expect(dispatchedOAuthAction).toEqual({
			type: 'authorizationRequested',
			provider: 'github',
			intent: 'link',
			returnTo: null
		});
	});

	it('renders Try again reload button on failed account read and dispatches reloadRequested', async () => {
		const target = document.createElement('div');
		document.body.appendChild(target);

		let reloaded = false;
		const mockAccountStore = {
			state: {
				...createInitialAccountState(),
				status: 'failed' as const,
				error: { code: 'network' as const, message: 'Could not connect.' }
			},
			dispatch(action: any) {
				if (action.type === 'reloadRequested') {
					reloaded = true;
				}
			}
		};

		const connectedStore = createStore({
			initialState: createInitialConnectedAccountsState(),
			reducer: connectedAccountsReducer,
			dependencies: {
				unlinkOAuthProvider: async () => {}
			}
		});

		const component = mount(ConnectedAccountsPanel, {
			target,
			props: {
				mode: 'standalone',
				store: connectedStore,
				accountStore: mockAccountStore,
				available: [{ id: 'github', label: 'GitHub' }]
			}
		});
		cleanups.push(() => {
			unmount(component);
			target.remove();
			connectedStore.destroy();
		});

		flushSync();
		expect(target.textContent).toContain('Could not load account details.');
		const tryAgainButton = target.querySelector<HTMLButtonElement>('button.connected-accounts__secondary');
		expect(tryAgainButton).not.toBeNull();
		expect(tryAgainButton?.textContent).toContain('Try again');

		tryAgainButton!.click();
		flushSync();
		expect(reloaded).toBe(true);
	});

	it('unmounts DOM on subject switch and supports restartAccount', async () => {
		const auth = createAuthFeature();
		const { deps, fetchAccounts } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const { target } = mountRecipe(auth, store, {
			providers: [{ id: 'github', label: 'GitHub' }]
		});

		store.dispatch({ type: 'openAccount' });
		store.dispatch({ type: 'openConnectedAccounts' });
		flushSync();

		await vi.waitFor(() => expect(fetchAccounts).toHaveLength(1));
		fetchAccounts[0]!.resolve(ADA_ACCOUNT);
		await settle();
		flushSync();

		expect(target.querySelector('.connected-accounts')).not.toBeNull();

		// Subject switch: retires and unmounts from DOM
		store.dispatch({
			type: 'session',
			action: {
				type: 'sessionEstablished',
				session: bob
			}
		});
		flushSync();
		await settle();

		expect(target.querySelector('.connected-accounts')).toBeNull();
		expect(store.state.connectedAccounts).toBeNull();
		expect(store.state.account).toBeNull();

		// Open account on new subject, and dispatch accountRequested to start reading
		store.dispatch({ type: 'openAccount' });
		const newAccView = auth.composition.bind(store, auth.accountSlot)!;
		newAccView.dispatch({ type: 'accountRequested' });
		flushSync();
		await vi.waitFor(() => expect(fetchAccounts).toHaveLength(2));
		fetchAccounts[1]!.resolve(ADA_ACCOUNT);
		await settle();
		flushSync();
		expect(store.state.account?.status).toBe('loaded');

		store.dispatch({ type: 'restartAccount' });
		flushSync();
		expect(store.state.account?.status).toBe('idle');
	});
});
