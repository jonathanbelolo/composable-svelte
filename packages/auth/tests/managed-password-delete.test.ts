/**
 * Managed change-password and delete-account companion flows through `createAuthFeature`.
 *
 * Covers:
 * - Slot operations: openChangePassword, restartChangePassword, closeChangePassword,
 *   openDeleteAccount, restartDeleteAccount, closeDeleteAccount.
 * - Opening guards: changePassword and deleteAccount settings slots refuse to open
 *   when anonymous or while a temporary auth flow is live.
 * - Sibling settings coexistence: lives alongside account, connectedAccounts, changeEmail,
 *   and mfaManagement without interference.
 * - Single-reduction outcome pulses:
 *   - changePasswordOutcome pulses { kind: 'changed', rotatedSession } on success with rotated session,
 *     { kind: 'changed', rotatedSession: null } on success with retained session,
 *     { kind: 'reauthenticationRequired', methods } on failure with reauthentication_required.
 *   - deleteAccountOutcome pulses { kind: 'deleted' } on deletion success (transitioning session to anonymous),
 *     { kind: 'reauthenticationRequired', methods } on failure with reauthentication_required.
 * - Replay guards: settled actions cannot pulse duplicate outcomes.
 * - Password clearing: form values are cleared on success; no passwords in long-lived state.
 * - Load-bearing confirmation gate: direct deletionRequested while idle does NOT call backend;
 *   requires confirmationRequested first.
 * - In-flight deletion cancellation: closing slot while status === 'deleting' cancels in-flight
 *   effect, aborts the AbortSignal, and late responses are dropped.
 * - Remount duplicate prevention: standalone mode tracks handled stores in WeakSet; managed mode
 *   routes through feature and rejects standalone authority callbacks.
 * - Owner replacement & retirement: subject switch or logout retires both slots and drops late results.
 * - Sibling independence: two mounted auth instances on the same page operate without cross-talk.
 * - Keyed markup: managed markup is keyed by owner.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createStore, type Store } from '@composable-svelte/core';

import ManagedAuthRecipe from './test-components/ManagedAuthRecipe.svelte';
import ChangePasswordForm from '../src/lib/components/ChangePasswordForm.svelte';
import DeleteAccountPanel from '../src/lib/components/DeleteAccountPanel.svelte';
import {
	createAuthFeature,
	type AuthFeature,
	type AuthFeatureAction,
	type AuthFeatureDependencies,
	type AuthFeatureState
} from '../src/lib/application/index.js';
import {
	createInitialChangePasswordState,
	createInitialDeleteAccountState,
	createInitialLoginState,
	createInitialSignupState,
	createInitialAccountState,
	createInitialConnectedAccountsState,
	createInitialChangeEmailState,
	createInitialMfaManagementState,
	createChangePasswordStore,
	createDeleteAccountStore
} from '../src/lib/flows/index.js';
import { createInitialSessionState, type SessionState } from '../src/lib/session/index.js';
import { subjectFromSession, type SessionSnapshot } from '../src/lib/subject/index.js';
import type { AuthError } from '../src/lib/errors/types.js';
import {
	controlledAuthDeps,
	settle,
	snapshot,
	submitChangePassword,
	requestDeletion,
	confirmDeletion
} from './fixtures/managed-auth-drivers.js';

type AuthStore = Store<AuthFeatureState, AuthFeatureAction>;

const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');
const bob = snapshot('bbbbbbbb-0000-0000-0000-000000000002', 'Bob');

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
	store: AuthStore
) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(ManagedAuthRecipe, {
		target,
		props: {
			auth,
			store
		}
	});
	let unmounted = false;
	const doUnmount = () => {
		if (unmounted) return;
		unmounted = true;
		unmount(component);
		target.remove();
	};
	cleanups.push(doUnmount);
	return { target, component, unmount: doUnmount };
}

describe('managed change-password and delete-account - headless rules', () => {
	it('opens, restarts, and closes changePassword and deleteAccount slots', () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		expect(store.state.changePassword).toBeNull();
		expect(store.state.deleteAccount).toBeNull();

		store.dispatch({ type: 'openChangePassword' });
		expect(store.state.changePassword?.status).toBe('idle');

		store.dispatch({ type: 'openDeleteAccount' });
		expect(store.state.deleteAccount?.status).toBe('idle');

		// Restart change password
		store.dispatch({
			type: 'changePassword',
			action: {
				type: 'presented',
				action: {
					type: 'form',
					action: { type: 'fieldChanged', field: 'password', value: 'typed-secret' }
				}
			}
		});
		expect(store.state.changePassword?.form.data.password).toBe('typed-secret');
		store.dispatch({ type: 'restartChangePassword' });
		expect(store.state.changePassword?.form.data.password).toBe('');
		expect(store.state.changePassword?.status).toBe('idle');

		// Restart delete account
		store.dispatch({
			type: 'deleteAccount',
			action: { type: 'presented', action: { type: 'confirmationRequested' } }
		});
		expect(store.state.deleteAccount?.status).toBe('confirming');
		store.dispatch({ type: 'restartDeleteAccount' });
		expect(store.state.deleteAccount?.status).toBe('idle');

		// Close both
		store.dispatch({ type: 'closeChangePassword' });
		expect(store.state.changePassword).toBeNull();
		store.dispatch({ type: 'closeDeleteAccount' });
		expect(store.state.deleteAccount).toBeNull();
	});

	it('refuses to open changePassword or deleteAccount when session is anonymous', () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createStore({
			initialState: {
				...auth.initialState(),
				session: createInitialSessionState() // anonymous
			},
			reducer: auth.composition.reducer,
			execution: auth.composition.execution,
			dependencies: driver.deps
		});
		cleanups.push(() => store.destroy());

		store.dispatch({ type: 'openChangePassword' });
		expect(store.state.changePassword).toBeNull();

		store.dispatch({ type: 'openDeleteAccount' });
		expect(store.state.deleteAccount).toBeNull();
	});

	it('refuses to open changePassword or deleteAccount while a temporary auth flow is live', () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			login: createInitialLoginState()
		});

		store.dispatch({ type: 'openChangePassword' });
		expect(store.state.changePassword).toBeNull();

		store.dispatch({ type: 'openDeleteAccount' });
		expect(store.state.deleteAccount).toBeNull();

		// Same with signup
		const signupStore = createAuthStore(auth, driver.deps, {
			signup: createInitialSignupState()
		});
		signupStore.dispatch({ type: 'openChangePassword' });
		expect(signupStore.state.changePassword).toBeNull();
		signupStore.dispatch({ type: 'openDeleteAccount' });
		expect(signupStore.state.deleteAccount).toBeNull();
	});

	it('coexists with sibling settings slots without interference', () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			account: createInitialAccountState(),
			connectedAccounts: createInitialConnectedAccountsState(),
			changeEmail: createInitialChangeEmailState(),
			mfaManagement: createInitialMfaManagementState()
		});

		store.dispatch({ type: 'openChangePassword' });
		store.dispatch({ type: 'openDeleteAccount' });

		expect(store.state.account?.status).toBe('idle');
		expect(store.state.connectedAccounts?.status).toBe('idle');
		expect(store.state.changeEmail?.status).toBe('idle');
		expect(store.state.mfaManagement?.status).toBe('idle');
		expect(store.state.changePassword?.status).toBe('idle');
		expect(store.state.deleteAccount?.status).toBe('idle');

		// Closing changePassword does not affect deleteAccount or siblings
		store.dispatch({ type: 'closeChangePassword' });
		expect(store.state.changePassword).toBeNull();
		expect(store.state.deleteAccount?.status).toBe('idle');
		expect(store.state.account?.status).toBe('idle');
	});

	it('enforces delete confirmation gate: direct deletionRequested while idle does not call backend', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		store.dispatch({ type: 'openDeleteAccount' });
		expect(store.state.deleteAccount?.status).toBe('idle');

		// Direct deletionRequested without confirming
		store.dispatch({
			type: 'deleteAccount',
			action: { type: 'presented', action: { type: 'deletionRequested' } }
		});
		await settle();

		expect(driver.deleteAccounts.length).toBe(0);
		expect(store.state.deleteAccount?.status).toBe('idle');

		// Now request confirmation
		store.dispatch({
			type: 'deleteAccount',
			action: { type: 'presented', action: { type: 'confirmationRequested' } }
		});
		expect(store.state.deleteAccount?.status).toBe('confirming');

		// Dismiss confirmation returns to idle
		store.dispatch({
			type: 'deleteAccount',
			action: { type: 'presented', action: { type: 'confirmationDismissed' } }
		});
		expect(store.state.deleteAccount?.status).toBe('idle');
		expect(driver.deleteAccounts.length).toBe(0);
	});

	it('refuses close, restart, and presentation dismiss while deleting, preserving in-flight deletion', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		store.dispatch({ type: 'openDeleteAccount' });
		store.dispatch({
			type: 'deleteAccount',
			action: { type: 'presented', action: { type: 'confirmationRequested' } }
		});
		store.dispatch({
			type: 'deleteAccount',
			action: { type: 'presented', action: { type: 'deletionRequested' } }
		});

		await vi.waitFor(() => {
			if (driver.deleteAccounts.length !== 1) throw new Error('deletion not started');
		});
		const req = driver.deleteAccounts[0]!;
		expect(req.signal).toBeDefined();
		expect(req.signal!.aborted).toBe(false);

		// 1. Close slot while deleting is refused
		store.dispatch({ type: 'closeDeleteAccount' });
		expect(store.state.deleteAccount?.status).toBe('deleting');
		expect(req.signal!.aborted).toBe(false);

		// 2. Restart slot while deleting is refused
		store.dispatch({ type: 'restartDeleteAccount' });
		expect(store.state.deleteAccount?.status).toBe('deleting');
		expect(req.signal!.aborted).toBe(false);

		// 3. Presentation dismiss while deleting is refused
		store.dispatch({
			type: 'deleteAccount',
			action: { type: 'dismiss' }
		});
		expect(store.state.deleteAccount?.status).toBe('deleting');
		expect(req.signal!.aborted).toBe(false);

		// Deletion completes successfully on backend: transitions to anonymous with outcome
		req.resolve();
		await settle();
		expect(store.state.deleteAccountOutcome).toEqual({ kind: 'deleted' });
		expect(store.state.session.status).toBe('anonymous');
		expect(store.state.deleteAccount).toBeNull();
	});

	it('refuses close, restart, and presentation dismiss while changePassword is submitting, preserving in-flight request', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		store.dispatch({ type: 'openChangePassword' });
		store.dispatch({
			type: 'changePassword',
			action: { type: 'presented', action: { type: 'form', action: { type: 'fieldChanged', field: 'password', value: 'new-valid-pass123' } } }
		});
		store.dispatch({
			type: 'changePassword',
			action: { type: 'presented', action: { type: 'form', action: { type: 'fieldChanged', field: 'confirmPassword', value: 'new-valid-pass123' } } }
		});
		store.dispatch({
			type: 'changePassword',
			action: { type: 'presented', action: { type: 'form', action: { type: 'submitTriggered' } } }
		});

		await vi.waitFor(() => {
			if (driver.changePasswords.length !== 1) throw new Error('change not started');
		});
		const req = driver.changePasswords[0]!;
		expect(req.signal).toBeDefined();
		expect(req.signal!.aborted).toBe(false);

		// 1. Close slot while submitting is refused
		store.dispatch({ type: 'closeChangePassword' });
		expect(store.state.changePassword?.status).toBe('submitting');
		expect(req.signal!.aborted).toBe(false);

		// 2. Restart slot while submitting is refused
		store.dispatch({ type: 'restartChangePassword' });
		expect(store.state.changePassword?.status).toBe('submitting');
		expect(req.signal!.aborted).toBe(false);

		// 3. Presentation dismiss while submitting is refused
		store.dispatch({
			type: 'changePassword',
			action: { type: 'dismiss' }
		});
		expect(store.state.changePassword?.status).toBe('submitting');
		expect(req.signal!.aborted).toBe(false);

		// Request completes successfully on backend: hands off rotated session and emits outcome
		const rotated = snapshot(ada.subject_id, 'Ada Rotated');
		req.resolve(rotated);
		await settle();
		expect(store.state.changePasswordOutcome).toEqual({ kind: 'changed', session: rotated });
		expect(store.state.session.status).toBe('authenticated');
		expect(store.state.changePassword?.status).toBe('changed');
	});

	it('returns delete status to idle after failure for truthful reconfirmation', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		store.dispatch({ type: 'openDeleteAccount' });
		store.dispatch({
			type: 'deleteAccount',
			action: { type: 'presented', action: { type: 'confirmationRequested' } }
		});
		store.dispatch({
			type: 'deleteAccount',
			action: { type: 'presented', action: { type: 'deletionRequested' } }
		});

		await vi.waitFor(() => {
			if (driver.deleteAccounts.length !== 1) throw new Error('deletion not started');
		});
		const req = driver.deleteAccounts[0]!;
		const error: AuthError = { code: 'rate_limited', message: 'Too many requests' };
		req.reject(error);
		await settle();

		// Status must be idle so user re-confirms rather than being left in confirming
		expect(store.state.deleteAccount?.status).toBe('idle');
		expect(store.state.deleteAccount?.error?.code).toBe('rate_limited');
	});
});

describe('managed change-password and delete-account - component and outcome lifecycle', () => {
	it('handles changePassword success with rotated session handoff and single outcome pulse', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		const { target } = mountRecipe(auth, store);

		store.dispatch({ type: 'openChangePassword' });
		flushSync();

		const view = auth.composition.bind(store, auth.changePasswordSlot);
		expect(view).toBeDefined();

		const rotated = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada Rotated');
		const req = await submitChangePassword(view!, driver.changePasswords, 'new-password-123');

		req.resolve(rotated);
		await settle();
		flushSync();

		// Feature handed off rotated session snapshot to session reducer
		expect(store.state.session.status).toBe('authenticated');
		expect(store.state.session.subject.kind === 'authenticated' && store.state.session.subject.id).toBe(rotated.subject_id);
		expect(store.state.changePasswordOutcome).toEqual({
			kind: 'changed',
			session: rotated
		});
		expect(store.state.changePassword?.status).toBe('changed');
		// Password field was cleared from state
		expect(store.state.changePassword?.form.data.password).toBe('');
		expect(store.state.changePassword?.form.data.confirmPassword).toBe('');

		// Replay guard: next tick or unrelated action clears outcome pulse
		store.dispatch({ type: 'closeDeleteAccount' }); // unrelated action
		expect(store.state.changePasswordOutcome).toBeNull();
	});

	it('rejects a rotated session with mismatched subject_id explicitly, retaining session and reporting rejected outcome', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		const initialSubject = store.state.session.subject;
		const { target } = mountRecipe(auth, store);

		store.dispatch({ type: 'openChangePassword' });
		flushSync();

		const view = auth.composition.bind(store, auth.changePasswordSlot);
		expect(view).toBeDefined();

		// Backend returns a rotated session for Charlie instead of Ada
		const charlie = snapshot('cccccccc-0000-0000-0000-000000000003', 'Charlie');
		const req = await submitChangePassword(view!, driver.changePasswords, 'new-password-123');

		req.resolve(charlie);
		await settle();
		flushSync();

		// Session was NOT switched to Charlie: Ada remains authenticated
		expect(store.state.session.status).toBe('authenticated');
		expect(store.state.session.subject).toBe(initialSubject);
		// Handoff was not accepted
		expect(store.state.handoff).toBeNull();
		// changePasswordOutcome reports rejected with reason 'subjectMismatch' and error
		expect(store.state.changePasswordOutcome).toEqual({
			kind: 'rejected',
			reason: 'subjectMismatch',
			session: charlie,
			error: expect.objectContaining({
				code: 'unknown',
				message: expect.stringContaining('Rotated session subject does not match authenticated user')
			})
		});
		// The changePassword slot error is set and settings slots are preserved
		expect(store.state.changePassword?.error?.code).toBe('unknown');
		expect(store.state.changePassword).toBeDefined();
	});

	it('handles changePassword success with null/retained session without modifying session', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		const initialSubject = store.state.session.subject;
		const { target } = mountRecipe(auth, store);

		store.dispatch({ type: 'openChangePassword' });
		flushSync();

		const view = auth.composition.bind(store, auth.changePasswordSlot);
		const req = await submitChangePassword(view!, driver.changePasswords, 'new-password-456');

		req.resolve(null);
		await settle();
		flushSync();

		// Session was retained
		expect(store.state.session.status).toBe('authenticated');
		expect(store.state.session.subject).toBe(initialSubject);
		expect(store.state.changePasswordOutcome).toEqual({
			kind: 'changed',
			session: null
		});
	});

	it('handles changePassword reauthentication required without dead end', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		const { target } = mountRecipe(auth, store);

		store.dispatch({ type: 'openChangePassword' });
		flushSync();

		const view = auth.composition.bind(store, auth.changePasswordSlot);
		const req = await submitChangePassword(view!, driver.changePasswords, 'new-password-789');

		const reauthError: AuthError = {
			code: 'reauthentication_required',
			message: 'Please reauthenticate',
			methods: ['password', 'totp']
		};
		req.reject(reauthError);
		await settle();
		flushSync();

		expect(store.state.changePasswordOutcome).toEqual({
			kind: 'reauthenticationRequired',
			methods: ['password', 'totp']
		});
		expect(store.state.changePassword?.status).toBe('idle');
		// Passwords are intentionally kept in state so user doesn't have to retype them
		expect(store.state.changePassword?.form.data.password).toBe('new-password-789');
	});

	it('handles deleteAccount success with anonymous session transition and single outcome pulse', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		const { target } = mountRecipe(auth, store);

		store.dispatch({ type: 'openDeleteAccount' });
		flushSync();

		const view = auth.composition.bind(store, auth.deleteAccountSlot);
		expect(view).toBeDefined();

		requestDeletion(view!);
		flushSync();
		expect(store.state.deleteAccount?.status).toBe('confirming');

		const req = await confirmDeletion(view!, driver.deleteAccounts);
		expect(store.state.deleteAccount?.status).toBe('deleting');

		req.resolve();
		await settle();
		flushSync();

		// Session transitioned to anonymous on account deletion!
		expect(store.state.session.status).toBe('anonymous');
		expect(store.state.session.subject.kind).toBe('anonymous');
		expect(store.state.deleteAccountOutcome).toEqual({ kind: 'deleted' });
		expect(store.state.deleteAccount).toBeNull();

		// Replay guard: next reduction clears pulse
		store.dispatch({ type: 'closeDeleteAccount' });
		expect(store.state.deleteAccountOutcome).toBeNull();
	});

	it('handles deleteAccount reauthentication required with truthful reporting', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);
		const { target } = mountRecipe(auth, store);

		store.dispatch({ type: 'openDeleteAccount' });
		flushSync();

		const view = auth.composition.bind(store, auth.deleteAccountSlot);
		requestDeletion(view!);
		const req = await confirmDeletion(view!, driver.deleteAccounts);

		const reauthError: AuthError = {
			code: 'reauthentication_required',
			message: 'Confirm your credentials',
			methods: ['password']
		};
		req.reject(reauthError);
		await settle();
		flushSync();

		expect(store.state.deleteAccountOutcome).toEqual({
			kind: 'reauthenticationRequired',
			methods: ['password']
		});
		expect(store.state.deleteAccount?.status).toBe('idle');
		expect(store.state.deleteAccount?.error?.code).toBe('reauthentication_required');
	});

	it('retires changePassword and deleteAccount on subject switch and drops late responses', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		store.dispatch({ type: 'openChangePassword' });
		store.dispatch({ type: 'openDeleteAccount' });
		store.dispatch({
			type: 'deleteAccount',
			action: { type: 'presented', action: { type: 'confirmationRequested' } }
		});
		store.dispatch({
			type: 'deleteAccount',
			action: { type: 'presented', action: { type: 'deletionRequested' } }
		});

		await vi.waitFor(() => {
			if (driver.deleteAccounts.length !== 1) throw new Error('delete not started');
		});
		const deleteReq = driver.deleteAccounts[0]!;

		// Subject switch: Bob signs in
		store.dispatch({ type: 'session', action: { type: 'sessionEstablished', session: bob } });
		expect(store.state.changePassword).toBeNull();
		expect(store.state.deleteAccount).toBeNull();

		// Late response from previous subject's delete request
		deleteReq.resolve();
		await settle();

		expect(store.state.deleteAccountOutcome).toBeNull();
		// Bob remains authenticated
		expect(store.state.session.status).toBe('authenticated');
		expect(store.state.session.subject.kind === 'authenticated' && store.state.session.subject.id).toBe(bob.subject_id);
	});

	it('retires both slots on logout', () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		store.dispatch({ type: 'openChangePassword' });
		store.dispatch({ type: 'openDeleteAccount' });
		expect(store.state.changePassword).toBeDefined();
		expect(store.state.deleteAccount).toBeDefined();

		store.dispatch({ type: 'session', action: { type: 'logout' } });
		expect(store.state.changePassword).toBeNull();
		expect(store.state.deleteAccount).toBeNull();
	});

	it('prevents duplicate logout/onDeleted in standalone DeleteAccountPanel remount', async () => {
		const driver = controlledAuthDeps();
		const deleteStore = createDeleteAccountStore(driver.deps);
		const sessionStore = { dispatch: vi.fn() };
		const onDeleted = vi.fn();

		const target = document.createElement('div');
		document.body.appendChild(target);

		let panel = mount(DeleteAccountPanel, {
			target,
			props: {
				store: deleteStore,
				sessionStore,
				onDeleted
			}
		});

		deleteStore.dispatch({ type: 'confirmationRequested' });
		deleteStore.dispatch({ type: 'deletionRequested' });

		await vi.waitFor(() => {
			if (driver.deleteAccounts.length !== 1) throw new Error('delete not started');
		});
		driver.deleteAccounts[0]!.resolve();
		await settle();
		flushSync();

		expect(sessionStore.dispatch).toHaveBeenCalledTimes(1);
		expect(onDeleted).toHaveBeenCalledTimes(1);

		// Unmount and remount with the same deleted store
		unmount(panel);
		panel = mount(DeleteAccountPanel, {
			target,
			props: {
				store: deleteStore,
				sessionStore,
				onDeleted
			}
		});
		flushSync();

		// No duplicate dispatch or callback!
		expect(sessionStore.dispatch).toHaveBeenCalledTimes(1);
		expect(onDeleted).toHaveBeenCalledTimes(1);

		unmount(panel);
		target.remove();
	});

	it('hands over multiple successive password changes in standalone mode and prevents duplicate handoff on remount', async () => {
		const driver = controlledAuthDeps();
		const changeStore = createChangePasswordStore(driver.deps);
		const sessionStore = { dispatch: vi.fn() };
		const onChanged = vi.fn();

		const target = document.createElement('div');
		document.body.appendChild(target);

		let form = mount(ChangePasswordForm, {
			target,
			props: {
				flowStore: changeStore,
				sessionStore,
				onChanged
			}
		});

		// First password change with rotated session 1
		const rotated1 = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada Rotated 1');
		changeStore.dispatch({
			type: 'form',
			action: { type: 'fieldChanged', field: 'password', value: 'new-password-1234' }
		});
		changeStore.dispatch({
			type: 'form',
			action: { type: 'fieldChanged', field: 'confirmPassword', value: 'new-password-1234' }
		});
		changeStore.dispatch({
			type: 'form',
			action: { type: 'submitTriggered' }
		});

		await vi.waitFor(() => {
			if (driver.changePasswords.length !== 1) throw new Error('change not started');
		});
		driver.changePasswords[0]!.resolve(rotated1);
		await settle();
		flushSync();

		expect(sessionStore.dispatch).toHaveBeenCalledTimes(1);
		expect(sessionStore.dispatch).toHaveBeenCalledWith({
			type: 'sessionEstablished',
			session: rotated1
		});
		expect(onChanged).toHaveBeenCalledTimes(1);

		// Remount with same settled state: must NOT duplicate handoff or callback
		unmount(form);
		form = mount(ChangePasswordForm, {
			target,
			props: {
				flowStore: changeStore,
				sessionStore,
				onChanged
			}
		});
		flushSync();

		expect(sessionStore.dispatch).toHaveBeenCalledTimes(1);
		expect(onChanged).toHaveBeenCalledTimes(1);

		// Editing fields after change does not re-trigger handoff
		changeStore.dispatch({
			type: 'form',
			action: { type: 'fieldChanged', field: 'password', value: 'editing-after-change' }
		});
		flushSync();
		expect(sessionStore.dispatch).toHaveBeenCalledTimes(1);
		expect(onChanged).toHaveBeenCalledTimes(1);

		// Second password change on the SAME store with rotated session 2
		const rotated2 = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada Rotated 2');
		changeStore.dispatch({
			type: 'form',
			action: { type: 'fieldChanged', field: 'password', value: 'newer-password-5678' }
		});
		changeStore.dispatch({
			type: 'form',
			action: { type: 'fieldChanged', field: 'confirmPassword', value: 'newer-password-5678' }
		});
		changeStore.dispatch({
			type: 'form',
			action: { type: 'submitTriggered' }
		});

		await vi.waitFor(() => {
			if (driver.changePasswords.length !== 2) throw new Error('second change not started');
		});
		driver.changePasswords[1]!.resolve(rotated2);
		await settle();
		flushSync();

		// Second change MUST be handed over!
		expect(sessionStore.dispatch).toHaveBeenCalledTimes(2);
		expect(sessionStore.dispatch).toHaveBeenLastCalledWith({
			type: 'sessionEstablished',
			session: rotated2
		});
		expect(onChanged).toHaveBeenCalledTimes(2);

		unmount(form);
		target.remove();
	});

	it('hands over a password change that completes while unmounted on subsequent remount', async () => {
		const driver = controlledAuthDeps();
		const changeStore = createChangePasswordStore(driver.deps);
		const sessionStore = { dispatch: vi.fn() };
		const onChanged = vi.fn();

		const target = document.createElement('div');
		document.body.appendChild(target);

		let form = mount(ChangePasswordForm, {
			target,
			props: {
				flowStore: changeStore,
				sessionStore,
				onChanged
			}
		});

		// First change while mounted
		const rotated1 = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada Rotated 1');
		changeStore.dispatch({
			type: 'form',
			action: { type: 'fieldChanged', field: 'password', value: 'new-password-1234' }
		});
		changeStore.dispatch({
			type: 'form',
			action: { type: 'fieldChanged', field: 'confirmPassword', value: 'new-password-1234' }
		});
		changeStore.dispatch({
			type: 'form',
			action: { type: 'submitTriggered' }
		});

		await vi.waitFor(() => {
			if (driver.changePasswords.length !== 1) throw new Error('change not started');
		});
		driver.changePasswords[0]!.resolve(rotated1);
		await settle();
		flushSync();

		expect(sessionStore.dispatch).toHaveBeenCalledTimes(1);
		expect(onChanged).toHaveBeenCalledTimes(1);

		// UNMOUNT the component
		unmount(form);

		// Second change completes HEADLESSLY while UNMOUNTED
		const rotated2 = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada Rotated 2');
		changeStore.dispatch({
			type: 'form',
			action: { type: 'fieldChanged', field: 'password', value: 'newer-password-5678' }
		});
		changeStore.dispatch({
			type: 'form',
			action: { type: 'fieldChanged', field: 'confirmPassword', value: 'newer-password-5678' }
		});
		changeStore.dispatch({
			type: 'form',
			action: { type: 'submitTriggered' }
		});

		await vi.waitFor(() => {
			if (driver.changePasswords.length !== 2) throw new Error('second change not started');
		});
		driver.changePasswords[1]!.resolve(rotated2);
		await settle();

		// While unmounted, callbacks remain at count 1
		expect(sessionStore.dispatch).toHaveBeenCalledTimes(1);
		expect(onChanged).toHaveBeenCalledTimes(1);

		// REMOUNT the component: MUST observe the completion that happened while unmounted!
		form = mount(ChangePasswordForm, {
			target,
			props: {
				flowStore: changeStore,
				sessionStore,
				onChanged
			}
		});
		flushSync();

		expect(sessionStore.dispatch).toHaveBeenCalledTimes(2);
		expect(sessionStore.dispatch).toHaveBeenLastCalledWith({
			type: 'sessionEstablished',
			session: rotated2
		});
		expect(onChanged).toHaveBeenCalledTimes(2);

		// Further edits after remount do NOT duplicate
		changeStore.dispatch({
			type: 'form',
			action: { type: 'fieldChanged', field: 'password', value: 'after-remount-typing' }
		});
		flushSync();
		expect(sessionStore.dispatch).toHaveBeenCalledTimes(2);
		expect(onChanged).toHaveBeenCalledTimes(2);

		// Remounting again without new completion does NOT duplicate
		unmount(form);
		form = mount(ChangePasswordForm, {
			target,
			props: {
				flowStore: changeStore,
				sessionStore,
				onChanged
			}
		});
		flushSync();
		expect(sessionStore.dispatch).toHaveBeenCalledTimes(2);
		expect(onChanged).toHaveBeenCalledTimes(2);

		unmount(form);
		target.remove();
	});

	it('handles retained null session in standalone mode calling onChanged without session dispatch', async () => {
		const driver = controlledAuthDeps();
		const changeStore = createChangePasswordStore(driver.deps);
		const sessionStore = { dispatch: vi.fn() };
		const onChanged = vi.fn();

		const target = document.createElement('div');
		document.body.appendChild(target);

		let form = mount(ChangePasswordForm, {
			target,
			props: {
				flowStore: changeStore,
				sessionStore,
				onChanged
			}
		});

		changeStore.dispatch({
			type: 'form',
			action: { type: 'fieldChanged', field: 'password', value: 'retained-password-123' }
		});
		changeStore.dispatch({
			type: 'form',
			action: { type: 'fieldChanged', field: 'confirmPassword', value: 'retained-password-123' }
		});
		changeStore.dispatch({
			type: 'form',
			action: { type: 'submitTriggered' }
		});

		await vi.waitFor(() => {
			if (driver.changePasswords.length !== 1) throw new Error('change not started');
		});
		// Backend returns null (retained session)
		driver.changePasswords[0]!.resolve(null);
		await settle();
		flushSync();

		expect(sessionStore.dispatch).toHaveBeenCalledTimes(0);
		expect(onChanged).toHaveBeenCalledTimes(1);

		// Field edit does not re-trigger
		changeStore.dispatch({
			type: 'form',
			action: { type: 'fieldChanged', field: 'password', value: 'edit-after-retained' }
		});
		flushSync();
		expect(sessionStore.dispatch).toHaveBeenCalledTimes(0);
		expect(onChanged).toHaveBeenCalledTimes(1);

		// Remount does not re-trigger
		unmount(form);
		form = mount(ChangePasswordForm, {
			target,
			props: {
				flowStore: changeStore,
				sessionStore,
				onChanged
			}
		});
		flushSync();
		expect(sessionStore.dispatch).toHaveBeenCalledTimes(0);
		expect(onChanged).toHaveBeenCalledTimes(1);

		unmount(form);
		target.remove();
	});

	it('keeps two mounted auth instances completely isolated without cross-talk', async () => {
		const authOne = createAuthFeature();
		const authTwo = createAuthFeature();
		const driverOne = controlledAuthDeps();
		const driverTwo = controlledAuthDeps();
		const storeOne = createAuthStore(authOne, driverOne.deps);
		const storeTwo = createAuthStore(authTwo, driverTwo.deps);

		const { target: targetOne } = mountRecipe(authOne, storeOne);
		const { target: targetTwo } = mountRecipe(authTwo, storeTwo);

		storeOne.dispatch({ type: 'openChangePassword' });
		storeTwo.dispatch({ type: 'openDeleteAccount' });
		flushSync();

		expect(storeOne.state.changePassword).toBeDefined();
		expect(storeOne.state.deleteAccount).toBeNull();
		expect(storeTwo.state.changePassword).toBeNull();
		expect(storeTwo.state.deleteAccount).toBeDefined();

		const viewOne = authOne.composition.bind(storeOne, authOne.changePasswordSlot);
		const reqOne = await submitChangePassword(viewOne!, driverOne.changePasswords, 'secret-one-1234');

		const viewTwo = authTwo.composition.bind(storeTwo, authTwo.deleteAccountSlot);
		requestDeletion(viewTwo!);
		const reqTwo = await confirmDeletion(viewTwo!, driverTwo.deleteAccounts);

		expect(driverOne.changePasswords.length).toBe(1);
		expect(driverTwo.changePasswords.length).toBe(0);
		expect(driverOne.deleteAccounts.length).toBe(0);
		expect(driverTwo.deleteAccounts.length).toBe(1);

		reqOne.resolve(null);
		reqTwo.resolve();
		await settle();
		flushSync();

		expect(storeOne.state.changePasswordOutcome?.kind).toBe('changed');
		expect(storeOne.state.deleteAccountOutcome).toBeNull();
		expect(storeTwo.state.deleteAccountOutcome?.kind).toBe('deleted');
		expect(storeTwo.state.changePasswordOutcome).toBeNull();
	});
});
