/**
 * Managed change-email request and change-email confirmation flows through `createAuthFeature`.
 *
 * Covers:
 * - Slot operations: openChangeEmail, restartChangeEmail, closeChangeEmail,
 *   openChangeEmailConfirm, restartChangeEmailConfirm, closeChangeEmailConfirm.
 * - Guard: changeEmail settings slot refuses to open when anonymous or while a temporary flow is live.
 * - Sibling independence: changeEmail lives alongside account, connectedAccounts, and MFA settings.
 * - Single-reduction outcome pulse:
 *   - changeEmailOutcome pulses { kind: 'requested', email } on changeRequestSucceeded,
 *     { kind: 'resent' } on resendSucceeded, { kind: 'reauthenticationRequired', methods } on
 *     changeRequestFailed / resendFailed with reauthentication_required.
 *   - changeEmailConfirmOutcome pulses { kind: 'confirmed', email } on confirmationSucceeded,
 *     { kind: 'failed', error } on confirmationFailed.
 * - Replay guards: settled actions cannot pulse duplicate outcomes.
 * - Safe error rendering: email_taken is presented as a helpful status offer rather than destructive error.
 * - Session preservation: confirmed change preserves accepted session without mutation.
 * - Usable sign-in route: signed-out confirmation 401 offers "Sign in", dispatching signInRequested
 *   to present a fresh login form.
 * - Token cancellation & stale attempt drops: token change in EmailChangeConfirmation aborts in-flight
 *   confirmation effect and increments attempt; late responses from previous attempts are dropped.
 * - Owner retirement & logout: subject switch or logout retires changeEmail and drops late results.
 * - Sibling independence: two mounted auth instances on the same page operate without cross-talk.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createStore, type Store } from '@composable-svelte/core';

import ManagedAuthRecipe from './test-components/ManagedAuthRecipe.svelte';
import {
	createAuthFeature,
	type AuthFeature,
	type AuthFeatureAction,
	type AuthFeatureDependencies,
	type AuthFeatureState
} from '../src/lib/application/index.js';
import {
	createInitialChangeEmailState,
	createInitialChangeEmailConfirmState,
	createInitialLoginState,
	createInitialMfaManagementState,
	createInitialAccountState,
	createInitialConnectedAccountsState
} from '../src/lib/flows/index.js';
import { createInitialSessionState, type SessionState } from '../src/lib/session/index.js';
import { subjectFromSession } from '../src/lib/subject/index.js';
import type { AuthError } from '../src/lib/errors/types.js';
import {
	controlledAuthDeps,
	settle,
	snapshot
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
	store: AuthStore,
	options: {
		changeEmailConfirmToken?: string | null | undefined;
		pendingEmail?: string | null | undefined;
	} = {}
) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(ManagedAuthRecipe, {
		target,
		props: {
			auth,
			store,
			changeEmailConfirmToken: options.changeEmailConfirmToken,
			pendingEmail: options.pendingEmail
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

describe('managed change-email and change-email-confirm - headless rules', () => {
	it('opens, restarts, and closes changeEmail and changeEmailConfirm slots', () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		expect(store.state.changeEmail).toBeNull();
		expect(store.state.changeEmailConfirm).toBeNull();

		// Open changeEmail (settings slot)
		store.dispatch({ type: 'openChangeEmail' });
		expect(store.state.changeEmail?.status).toBe('idle');

		// Restart changeEmail
		store.dispatch({ type: 'restartChangeEmail' });
		expect(store.state.changeEmail?.status).toBe('idle');

		// Close changeEmail
		store.dispatch({ type: 'closeChangeEmail' });
		expect(store.state.changeEmail).toBeNull();

		// Open changeEmailConfirm (temporary slot) with token
		store.dispatch({ type: 'openChangeEmailConfirm', token: 'token-abc' });
		expect(store.state.changeEmailConfirm?.status).toBe('idle');
		expect(store.state.changeEmailConfirm?.token).toBe('token-abc');

		// Restart changeEmailConfirm with new token
		store.dispatch({ type: 'restartChangeEmailConfirm', token: 'token-xyz' });
		expect(store.state.changeEmailConfirm?.status).toBe('idle');
		expect(store.state.changeEmailConfirm?.token).toBe('token-xyz');

		// Close changeEmailConfirm
		store.dispatch({ type: 'closeChangeEmailConfirm' });
		expect(store.state.changeEmailConfirm).toBeNull();
	});

	it('refuses changeEmail settings slot while anonymous', () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const anonStore = createStore({
			initialState: auth.initialState(),
			reducer: auth.composition.reducer,
			execution: auth.composition.execution,
			dependencies: deps
		});
		cleanups.push(() => anonStore.destroy());

		anonStore.dispatch({ type: 'openChangeEmail' });
		expect(anonStore.state.changeEmail).toBeNull();
	});

	it('refuses changeEmail settings slot when a temporary flow is live', () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();

		// With live login
		const loginStore = createAuthStore(auth, deps, {
			login: createInitialLoginState()
		});
		loginStore.dispatch({ type: 'openChangeEmail' });
		expect(loginStore.state.changeEmail).toBeNull();

		// With live changeEmailConfirm
		const confirmStore = createAuthStore(auth, deps, {
			changeEmailConfirm: createInitialChangeEmailConfirmState('tok')
		});
		confirmStore.dispatch({ type: 'openChangeEmail' });
		expect(confirmStore.state.changeEmail).toBeNull();
	});

	it('maintains sibling coexistence between changeEmail, account, connectedAccounts, and MFA settings', () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);

		store.dispatch({ type: 'openChangeEmail' });
		store.dispatch({ type: 'openAccount' });
		store.dispatch({ type: 'openConnectedAccounts' });
		store.dispatch({ type: 'openMfaManagement' });

		expect(store.state.changeEmail?.status).toBe('idle');
		expect(store.state.account?.status).toBe('idle');
		expect(store.state.connectedAccounts?.status).toBe('idle');
		expect(store.state.mfaManagement?.status).toBe('idle');

		// Dispatching within changeEmail does not disturb other settings
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: {
					type: 'form',
					action: { type: 'fieldChanged', field: 'email', value: 'next@example.com' }
				}
			}
		});

		expect(store.state.changeEmail?.form.data.email).toBe('next@example.com');
		expect(store.state.account?.status).toBe('idle');
		expect(store.state.connectedAccounts?.status).toBe('idle');
		expect(store.state.mfaManagement?.status).toBe('idle');
	});

	it('openChangeEmailConfirm works while anonymous and while authenticated, closing temporary flows', () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();

		// Anonymous
		const anonStore = createStore({
			initialState: auth.initialState(),
			reducer: auth.composition.reducer,
			execution: auth.composition.execution,
			dependencies: deps
		});
		cleanups.push(() => anonStore.destroy());
		anonStore.dispatch({ type: 'openChangeEmailConfirm', token: 'anon-tok' });
		expect(anonStore.state.changeEmailConfirm?.status).toBe('idle');

		// Authenticated with live login: restartChangeEmailConfirm closes login
		const liveStore = createAuthStore(auth, deps, {
			login: createInitialLoginState()
		});
		liveStore.dispatch({ type: 'restartChangeEmailConfirm', token: 'auth-tok' });
		expect(liveStore.state.login).toBeNull();
		expect(liveStore.state.changeEmailConfirm?.status).toBe('idle');
	});

	function submitForm(store: AuthStore, email: string) {
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: {
					type: 'form',
					action: { type: 'fieldChanged', field: 'email', value: email }
				}
			}
		});
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: {
					type: 'form',
					action: { type: 'submissionStarted' }
				}
			}
		});
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: {
					type: 'form',
					action: { type: 'submissionSucceeded', submissionId: 1 }
				}
			}
		});
	}

	it('changeEmail pulses single-reduction outcome on request, resend, and reauth, with replay suppression', () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, {
			changeEmail: createInitialChangeEmailState()
		});

		// 1. changeRequestSucceeded pulses requested outcome
		submitForm(store, 'new@example.com');
		expect(store.state.changeEmail?.status).toBe('submitting');

		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'changeRequestSucceeded', email: 'new@example.com' }
			}
		});
		expect(store.state.changeEmailOutcome).toEqual({ kind: 'requested', email: 'new@example.com' });

		// Next action clears outcome
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'form', action: { type: 'fieldBlurred', field: 'email' } }
			}
		});
		expect(store.state.changeEmailOutcome).toBeNull();

		// Replay of changeRequestSucceeded when not submitting is ignored and does NOT pulse outcome
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'changeRequestSucceeded', email: 'new@example.com' }
			}
		});
		expect(store.state.changeEmailOutcome).toBeNull();

		// 2. resendSucceeded pulses resent outcome
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'resendRequested' }
			}
		});
		expect(store.state.changeEmail?.resendStatus).toBe('sending');

		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'resendSucceeded' }
			}
		});
		expect(store.state.changeEmailOutcome).toEqual({ kind: 'resent' });

		// Next action clears outcome
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'form', action: { type: 'fieldBlurred', field: 'email' } }
			}
		});
		expect(store.state.changeEmailOutcome).toBeNull();

		// Replay of resendSucceeded when not sending is ignored
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'resendSucceeded' }
			}
		});
		expect(store.state.changeEmailOutcome).toBeNull();

		// 3. Reauthentication required on request
		submitForm(store, 'reauth@example.com');
		expect(store.state.changeEmail?.status).toBe('submitting');

		const reauthErr: AuthError = {
			code: 'reauthentication_required',
			message: 'Verify identity',
			methods: ['password', 'totp']
		};
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'changeRequestFailed', error: reauthErr }
			}
		});
		expect(store.state.changeEmailOutcome).toEqual({
			kind: 'reauthenticationRequired',
			methods: ['password', 'totp']
		});
	});

	it('resendFailed with reauthentication_required pulses reauthenticationRequired outcome even after request succeeded', () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, {
			changeEmail: createInitialChangeEmailState()
		});

		// 1. Submit request and succeed (which sets pendingEmail and clears error)
		submitForm(store, 'pending@example.com');
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'changeRequestSucceeded', email: 'pending@example.com' }
			}
		});
		expect(store.state.changeEmailOutcome).toEqual({ kind: 'requested', email: 'pending@example.com' });

		// Clear outcome on next action
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'form', action: { type: 'fieldBlurred', field: 'email' } }
			}
		});
		expect(store.state.changeEmailOutcome).toBeNull();
		expect(store.state.changeEmail?.error).toBeNull();

		// 2. Resend fails with reauthentication_required
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'resendRequested' }
			}
		});
		expect(store.state.changeEmail?.resendStatus).toBe('sending');

		const reauthErr: AuthError = {
			code: 'reauthentication_required',
			message: 'Please reauthenticate',
			methods: ['totp']
		};
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'resendFailed', error: reauthErr }
			}
		});

		// Verified: child.error was inspected, so reauthenticationRequired is emitted even though flow.error was null
		expect(store.state.changeEmailOutcome).toEqual({
			kind: 'reauthenticationRequired',
			methods: ['totp']
		});
		expect(store.state.changeEmail?.resendError).toEqual(reauthErr);
	});

	it('resendFailed with non-reauth error does not pulse reauthenticationRequired when prior request had reauth error', () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		// Initial state has pendingEmail already observed, but a new request failed with reauthentication_required
		const reauthErr: AuthError = {
			code: 'reauthentication_required',
			message: 'Verify identity',
			methods: ['password']
		};
		const store = createAuthStore(auth, deps, {
			changeEmail: {
				...createInitialChangeEmailState(),
				pendingEmail: 'existing@example.com',
				error: reauthErr
			}
		});

		// Clear initial outcome if any
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'form', action: { type: 'fieldBlurred', field: 'email' } }
			}
		});
		expect(store.state.changeEmailOutcome).toBeNull();
		expect(store.state.changeEmail?.error).toEqual(reauthErr);

		// Resend fails with a non-reauth error (e.g. rate_limit)
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'resendRequested' }
			}
		});
		expect(store.state.changeEmail?.resendStatus).toBe('sending');

		const rateLimitErr: AuthError = {
			code: 'rate_limited',
			message: 'Too many requests'
		};
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'resendFailed', error: rateLimitErr }
			}
		});

		// Verified: child.error was inspected (rate_limit), NOT flow.error (which was reauthErr).
		// No false reauthenticationRequired outcome is emitted.
		expect(store.state.changeEmailOutcome).toBeNull();
		expect(store.state.changeEmail?.resendError).toEqual(rateLimitErr);
	});

	it('new submission cancels in-flight resend and suppresses late resend results', () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, {
			changeEmail: {
				...createInitialChangeEmailState(),
				pendingEmail: 'first@example.com'
			}
		});

		// Request resend for first email
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'resendRequested' }
			}
		});
		expect(store.state.changeEmail?.resendStatus).toBe('sending');

		// User submits new change request for second email
		submitForm(store, 'second@example.com');
		expect(store.state.changeEmail?.status).toBe('submitting');
		expect(store.state.changeEmail?.resendStatus).toBe('idle');

		// Late resendSucceeded arrives from previous resend
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: { type: 'resendSucceeded' }
			}
		});
		// Suppressed: resendStatus remains idle, no outcome pulsed
		expect(store.state.changeEmail?.resendStatus).toBe('idle');
		expect(store.state.changeEmailOutcome).toBeNull();

		// Late resendFailed arrives from previous resend
		store.dispatch({
			type: 'changeEmail',
			action: {
				type: 'presented',
				action: {
					type: 'resendFailed',
					error: { code: 'network', message: 'Offline' }
				}
			}
		});
		// Suppressed: resendStatus remains idle, resendError remains null
		expect(store.state.changeEmail?.resendStatus).toBe('idle');
		expect(store.state.changeEmail?.resendError).toBeNull();
	});

	it('subject switch and logout retire changeEmail settings flow', () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, {
			changeEmail: createInitialChangeEmailState()
		});

		expect(store.state.changeEmail).not.toBeNull();

		// Subject switch to Bob retires changeEmail
		store.dispatch({
			type: 'session',
			action: {
				type: 'sessionEstablished',
				session: bob
			}
		});
		expect(store.state.changeEmail).toBeNull();
		expect(store.state.changeEmailOutcome).toBeNull();

		// Open again and verify logout clears it
		store.dispatch({ type: 'openChangeEmail' });
		expect(store.state.changeEmail).not.toBeNull();

		store.dispatch({
			type: 'session',
			action: { type: 'logout' }
		});
		expect(store.state.changeEmail).toBeNull();
	});

	it('changeEmailConfirm pulses outcome on success and failure with replay suppression and session preservation', () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const store = createAuthStore(auth, deps, {
			changeEmailConfirm: createInitialChangeEmailConfirmState('tok-1')
		});

		// confirmationSucceeded pulses confirmed outcome and preserves current session
		store.dispatch({
			type: 'changeEmailConfirm',
			action: {
				type: 'presented',
				action: { type: 'confirmationRequested', token: 'tok-1' }
			}
		});
		store.dispatch({
			type: 'changeEmailConfirm',
			action: {
				type: 'presented',
				action: { type: 'confirmationSucceeded', email: 'confirmed@example.com' }
			}
		});
		expect(store.state.changeEmailConfirmOutcome).toEqual({
			kind: 'confirmed',
			email: 'confirmed@example.com'
		});
		// Session remains Ada
		expect(store.state.session.subject.kind).toBe('authenticated');
		if (store.state.session.subject.kind === 'authenticated') {
			expect(store.state.session.subject.id).toBe(ada.subject_id);
		}

		// Next action clears outcome
		store.dispatch({ type: 'closeChangeEmailConfirm' });
		expect(store.state.changeEmailConfirmOutcome).toBeNull();

		// Open fresh confirm for failure test
		store.dispatch({ type: 'openChangeEmailConfirm', token: 'tok-err' });
		store.dispatch({
			type: 'changeEmailConfirm',
			action: {
				type: 'presented',
				action: { type: 'confirmationRequested', token: 'tok-err' }
			}
		});
		const failErr: AuthError = { code: 'token_expired', message: 'Link expired' };
		store.dispatch({
			type: 'changeEmailConfirm',
			action: {
				type: 'presented',
				action: { type: 'confirmationFailed', error: failErr }
			}
		});
		expect(store.state.changeEmailConfirmOutcome).toEqual({
			kind: 'failed',
			error: failErr
		});
	});

	it('signInRequested from changeEmailConfirm routes to fresh login form', () => {
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const store = createStore({
			initialState: {
				...auth.initialState(),
				changeEmailConfirm: createInitialChangeEmailConfirmState('tok-sign-in')
			},
			reducer: auth.composition.reducer,
			execution: auth.composition.execution,
			dependencies: deps
		});
		cleanups.push(() => store.destroy());

		expect(store.state.changeEmailConfirm).not.toBeNull();
		expect(store.state.login).toBeNull();

		store.dispatch({
			type: 'changeEmailConfirm',
			action: {
				type: 'presented',
				action: { type: 'signInRequested' }
			}
		});

		expect(store.state.changeEmailConfirm).toBeNull();
		expect(store.state.login?.status).toBe('idle');
	});
});

describe('managed change-email request - mounted DOM behavior', () => {
	it('submits change-email request, shows pending email, pulses outcome, and permits resend', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			changeEmail: createInitialChangeEmailState()
		});
		const { target } = mountRecipe(auth, store);

		const input = target.querySelector<HTMLInputElement>('.change-email__input');
		const submit = target.querySelector<HTMLButtonElement>('.change-email__submit');
		expect(input).not.toBeNull();
		expect(submit).not.toBeNull();

		// Enter new email and submit
		input!.value = 'new-address@example.com';
		input!.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		submit!.click();
		flushSync();

		await vi.waitFor(() => {
			expect(driver.requestEmailChanges).toHaveLength(1);
			expect(driver.requestEmailChanges[0]!.newEmail).toBe('new-address@example.com');
		});

		expect(store.state.changeEmail?.status).toBe('submitting');
		expect(submit!.disabled).toBe(true);

		// Resolve request
		driver.requestEmailChanges[0]!.resolve();
		await settle();
		flushSync();

		// Pending email rendered in status box
		const pendingText = target.querySelector('.change-email__pending-body');
		expect(pendingText).not.toBeNull();
		expect(pendingText!.textContent).toContain('new-address@example.com');

		// Outcome pulsed
		expect(store.state.changeEmailOutcome).toEqual({
			kind: 'requested',
			email: 'new-address@example.com'
		});

		// Next action clears outcome
		input!.dispatchEvent(new Event('blur', { bubbles: true }));
		flushSync();
		expect(store.state.changeEmailOutcome).toBeNull();

		// Resend link
		const resendBtn = target.querySelector<HTMLButtonElement>('.change-email__secondary');
		expect(resendBtn).not.toBeNull();
		resendBtn!.click();
		flushSync();

		await vi.waitFor(() => {
			expect(driver.resendEmailChanges).toHaveLength(1);
		});

		driver.resendEmailChanges[0]!.resolve();
		await settle();
		flushSync();

		expect(target.querySelector('.change-email__note')?.textContent).toBe('Sent again.');
		expect(store.state.changeEmailOutcome).toEqual({ kind: 'resent' });
	});

	it('handles email_taken error safely without destructive red banner', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			changeEmail: createInitialChangeEmailState()
		});
		const { target } = mountRecipe(auth, store);

		const input = target.querySelector<HTMLInputElement>('.change-email__input')!;
		const submit = target.querySelector<HTMLButtonElement>('.change-email__submit')!;

		input.value = 'taken@example.com';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		submit.click();
		flushSync();

		await vi.waitFor(() => expect(driver.requestEmailChanges).toHaveLength(1));
		driver.requestEmailChanges[0]!.reject({
			code: 'email_taken',
			message: 'This email is already in use.',
			email: 'taken@example.com'
		});
		await settle();
		flushSync();

		// Shows taken box, NOT the red destructive error
		expect(target.querySelector('.change-email__taken')).not.toBeNull();
		expect(target.querySelector('.change-email__taken')?.textContent).toContain('taken@example.com');
		expect(target.querySelector('.change-email__error')).toBeNull();
	});

	it('handles reauthentication_required error with outcome pulse and renders alert markup', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			changeEmail: createInitialChangeEmailState()
		});
		const { target } = mountRecipe(auth, store);

		const input = target.querySelector<HTMLInputElement>('.change-email__input')!;
		const submit = target.querySelector<HTMLButtonElement>('.change-email__submit')!;

		input.value = 'reauth@example.com';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		submit.click();
		flushSync();

		await vi.waitFor(() => expect(driver.requestEmailChanges).toHaveLength(1));
		driver.requestEmailChanges[0]!.reject({
			code: 'reauthentication_required',
			message: 'Please reauthenticate',
			methods: ['password', 'totp']
		});
		await settle();
		flushSync();

		expect(store.state.changeEmailOutcome).toEqual({
			kind: 'reauthenticationRequired',
			methods: ['password', 'totp']
		});
		const alert = target.querySelector('.change-email__error[role="alert"]');
		expect(alert).not.toBeNull();
		expect(alert?.textContent).toBe('Please reauthenticate');
	});

	it('drops in-flight request results after closeChangeEmail and logout', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			changeEmail: createInitialChangeEmailState()
		});
		const { target } = mountRecipe(auth, store);

		const input = target.querySelector<HTMLInputElement>('.change-email__input')!;
		const submit = target.querySelector<HTMLButtonElement>('.change-email__submit')!;

		input.value = 'stale@example.com';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		submit.click();
		flushSync();

		await vi.waitFor(() => expect(driver.requestEmailChanges).toHaveLength(1));
		const inFlight = driver.requestEmailChanges[0]!;

		// Close flow while in-flight
		store.dispatch({ type: 'closeChangeEmail' });
		flushSync();
		expect(target.querySelector('.change-email')).toBeNull();

		// Late resolve arrives
		inFlight.resolve();
		await settle();
		flushSync();

		// Remains closed and outcome was not pulsed
		expect(store.state.changeEmail).toBeNull();
		expect(store.state.changeEmailOutcome).toBeNull();
	});

	it('managed ChangeEmailForm receives unchanged pendingEmail prop across restartChangeEmail and shows pending notice', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		// Mount recipe with pendingEmail prop
		const { target } = mountRecipe(auth, store, { pendingEmail: 'existing-pending@example.com' });

		// Open changeEmail
		store.dispatch({ type: 'openChangeEmail' });
		flushSync();

		// Flow observed the pendingEmail prop and renders pending notice
		expect(store.state.changeEmail?.pendingEmail).toBe('existing-pending@example.com');
		const pendingSection = target.querySelector('.change-email__pending');
		expect(pendingSection).not.toBeNull();
		expect(pendingSection?.textContent).toContain('existing-pending@example.com');

		// Restart changeEmail: fresh flow created with initial null pendingEmail
		store.dispatch({ type: 'restartChangeEmail' });
		flushSync();

		// With owner-aware lastObserved, the newly owned flow receives the unchanged pendingEmail prop
		expect(store.state.changeEmail?.pendingEmail).toBe('existing-pending@example.com');
		const restartedPending = target.querySelector('.change-email__pending');
		expect(restartedPending).not.toBeNull();
		expect(restartedPending?.textContent).toContain('existing-pending@example.com');
	});
});

describe('managed change-email confirmation - mounted DOM behavior', () => {
	it('mounts with token, triggers confirmation, pulses outcome, and preserves session', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			changeEmailConfirm: createInitialChangeEmailConfirmState(null)
		});
		const { target } = mountRecipe(auth, store, { changeEmailConfirmToken: 'valid-token' });

		await vi.waitFor(() => {
			expect(driver.confirmEmailChanges).toHaveLength(1);
			expect(driver.confirmEmailChanges[0]!.token).toBe('valid-token');
		});

		expect(target.textContent).toContain('Confirming…');

		// Resolve with new address
		driver.confirmEmailChanges[0]!.resolve('confirmed@example.com');
		await settle();
		flushSync();

		expect(target.textContent).toContain('Done — your account now uses confirmed@example.com');
		expect(store.state.changeEmailConfirmOutcome).toEqual({
			kind: 'confirmed',
			email: 'confirmed@example.com'
		});
		// Session remains Ada
		expect(store.state.session.subject.kind).toBe('authenticated');
		if (store.state.session.subject.kind === 'authenticated') {
			expect(store.state.session.subject.id).toBe(ada.subject_id);
		}
	});

	it('unauthenticated confirmation failure provides usable sign-in route to login form', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createStore({
			initialState: {
				...auth.initialState(),
				session: { ...createInitialSessionState(), status: 'anonymous' },
				changeEmailConfirm: createInitialChangeEmailConfirmState(null)
			},
			reducer: auth.composition.reducer,
			execution: auth.composition.execution,
			dependencies: driver.deps
		});
		cleanups.push(() => store.destroy());

		const { target } = mountRecipe(auth, store, { changeEmailConfirmToken: 'token-401' });

		await vi.waitFor(() => expect(driver.confirmEmailChanges).toHaveLength(1));
		driver.confirmEmailChanges[0]!.reject({
			code: 'invalid_credentials',
			message: 'Not signed in'
		});
		await settle();
		flushSync();

		expect(target.textContent).toContain('Sign in first, then follow the link again');
		const signInBtn = target.querySelector<HTMLButtonElement>('.email-change-confirm__primary');
		expect(signInBtn).not.toBeNull();
		expect(signInBtn!.textContent?.trim()).toBe('Sign in');

		// Clicking "Sign in" dispatches signInRequested, which replaces confirm with login
		signInBtn!.click();
		flushSync();

		expect(store.state.changeEmailConfirm).toBeNull();
		expect(store.state.login).not.toBeNull();
		expect(target.querySelector('.login-form')).not.toBeNull();
	});

	it('token replacement while confirming cancels in-flight effect, drops stale attempt, and confirms new token', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			changeEmailConfirm: createInitialChangeEmailConfirmState(null)
		});
		const { target, component } = mountRecipe(auth, store, { changeEmailConfirmToken: 'token-old' });

		await vi.waitFor(() => expect(driver.confirmEmailChanges).toHaveLength(1));
		const oldRequest = driver.confirmEmailChanges[0]!;

		// Replace token
		component.setChangeEmailConfirmToken('token-new');
		flushSync();

		expect(oldRequest.signal?.aborted).toBe(true);

		// Old request rejects late -> dropped by attempt check
		oldRequest.reject({ code: 'token_expired', message: 'Old token dead' });
		await settle();
		flushSync();

		expect(store.state.changeEmailConfirm?.error).toBeNull();

		// New token triggers second confirmation
		await vi.waitFor(() => expect(driver.confirmEmailChanges).toHaveLength(2));
		expect(driver.confirmEmailChanges[1]!.token).toBe('token-new');

		// Second confirmation resolves
		driver.confirmEmailChanges[1]!.resolve('fresh@example.com');
		await settle();
		flushSync();

		expect(target.textContent).toContain('Done — your account now uses fresh@example.com');
		expect(store.state.changeEmailConfirmOutcome).toEqual({
			kind: 'confirmed',
			email: 'fresh@example.com'
		});
	});

	it('displays token_expired error and explains how to get a new link', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps, {
			changeEmailConfirm: createInitialChangeEmailConfirmState(null)
		});
		const { target } = mountRecipe(auth, store, { changeEmailConfirmToken: 'expired-token' });

		await vi.waitFor(() => expect(driver.confirmEmailChanges).toHaveLength(1));
		driver.confirmEmailChanges[0]!.reject({
			code: 'token_expired',
			message: 'Expired link'
		});
		await settle();
		flushSync();

		const errorAlert = target.querySelector('.email-change-confirm__error');
		expect(errorAlert).not.toBeNull();
		expect(errorAlert!.textContent).toContain('That link is no longer valid');
		expect(store.state.changeEmailConfirmOutcome).toEqual({
			kind: 'failed',
			error: { code: 'token_expired', message: 'Expired link' }
		});
	});

	it('maintains complete isolation between two mounted auth instances on the same page', async () => {
		const authLeft = createAuthFeature();
		const authRight = createAuthFeature();
		const driverLeft = controlledAuthDeps();
		const driverRight = controlledAuthDeps();

		const storeLeft = createAuthStore(authLeft, driverLeft.deps, {
			changeEmail: createInitialChangeEmailState()
		});
		const storeRight = createStore({
			initialState: {
				...authRight.initialState(),
				changeEmailConfirm: createInitialChangeEmailConfirmState(null)
			},
			reducer: authRight.composition.reducer,
			execution: authRight.composition.execution,
			dependencies: driverRight.deps
		});
		cleanups.push(() => storeRight.destroy());

		const leftMount = mountRecipe(authLeft, storeLeft);
		const rightMount = mountRecipe(authRight, storeRight, { changeEmailConfirmToken: 'right-token' });

		// Left is changeEmail, Right is changeEmailConfirm
		expect(leftMount.target.querySelector('.change-email')).not.toBeNull();
		expect(leftMount.target.querySelector('.email-change-confirm')).toBeNull();
		expect(rightMount.target.querySelector('.email-change-confirm')).not.toBeNull();
		expect(rightMount.target.querySelector('.change-email')).toBeNull();

		// Right confirm fires driverRight only
		await vi.waitFor(() => expect(driverRight.confirmEmailChanges).toHaveLength(1));
		expect(driverLeft.confirmEmailChanges).toHaveLength(0);
		expect(driverLeft.requestEmailChanges).toHaveLength(0);

		// Resolve Right
		driverRight.confirmEmailChanges[0]!.resolve('right@example.com');
		await settle();
		flushSync();

		expect(storeRight.state.changeEmailConfirmOutcome).toEqual({
			kind: 'confirmed',
			email: 'right@example.com'
		});
		expect(storeLeft.state.changeEmailOutcome).toBeNull();
		expect(leftMount.target.querySelector('.change-email')).not.toBeNull();
	});

	it('uses seeded token from state when token prop is omitted in managed mode', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		// Open changeEmailConfirm with seeded token
		store.dispatch({ type: 'openChangeEmailConfirm', token: 'seeded-token-123' });
		expect(store.state.changeEmailConfirm?.token).toBe('seeded-token-123');

		// Mount recipe without passing changeEmailConfirmToken prop (so token prop is undefined)
		const { target } = mountRecipe(auth, store);

		await vi.waitFor(() => expect(driver.confirmEmailChanges).toHaveLength(1));
		expect(driver.confirmEmailChanges[0]!.token).toBe('seeded-token-123');

		driver.confirmEmailChanges[0]!.resolve('confirmed-seeded@example.com');
		await settle();
		flushSync();

		expect(target.textContent).toContain('confirmed-seeded@example.com');
		expect(store.state.changeEmailConfirmOutcome).toEqual({
			kind: 'confirmed',
			email: 'confirmed-seeded@example.com'
		});
	});

	it('remounting after an attempt does not re-dispatch confirmation for the same token', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		store.dispatch({ type: 'openChangeEmailConfirm', token: 'single-use-token' });

		// Mount first instance
		const { target: target1, unmount: unmount1 } = mountRecipe(auth, store);

		await vi.waitFor(() => expect(driver.confirmEmailChanges).toHaveLength(1));
		expect(driver.confirmEmailChanges[0]!.token).toBe('single-use-token');

		// Request fails
		driver.confirmEmailChanges[0]!.reject({
			code: 'token_expired',
			message: 'Link expired'
		});
		await settle();
		flushSync();
		expect(target1.textContent).toContain('That link is no longer valid');

		// Unmount
		unmount1();

		// Remount with same store/token
		const { target: target2 } = mountRecipe(auth, store);
		flushSync();
		await settle();

		// Does NOT dispatch confirmationRequested again: calls remain 1
		expect(driver.confirmEmailChanges).toHaveLength(1);
		expect(target2.textContent).toContain('That link is no longer valid');
	});

	it('confirms token exactly once when tokenProvided was dispatched while idle before the view mounts', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createStore({
			initialState: {
				...auth.initialState(),
				session: signedIn(ada)
			},
			reducer: auth.composition.reducer,
			execution: auth.composition.execution,
			dependencies: driver.deps
		});
		cleanups.push(() => store.destroy());

		// Open changeEmailConfirm with null token initially
		store.dispatch({ type: 'openChangeEmailConfirm', token: null });
		expect(store.state.changeEmailConfirm?.status).toBe('idle');
		expect(store.state.changeEmailConfirm?.attempt).toBe(0);

		// Dispatch tokenProvided while idle BEFORE the view mounts
		store.dispatch({
			type: 'changeEmailConfirm',
			action: {
				type: 'presented',
				action: { type: 'tokenProvided', token: 'pre-mount-token' }
			}
		});
		// Crucial assertion: tokenProvided while idle does NOT count as a real attempt
		expect(store.state.changeEmailConfirm?.attempt).toBe(0);
		expect(store.state.changeEmailConfirm?.token).toBe('pre-mount-token');
		expect(driver.confirmEmailChanges).toHaveLength(0);

		// Now mount the managed view
		const { target } = mountRecipe(auth, store);

		// Managed view mounts, sees attempt === 0, and dispatches confirmation exactly once
		await vi.waitFor(() => expect(driver.confirmEmailChanges).toHaveLength(1));
		expect(driver.confirmEmailChanges[0]!.token).toBe('pre-mount-token');
		expect(store.state.changeEmailConfirm?.attempt).toBe(1);

		driver.confirmEmailChanges[0]!.resolve('pre-mount@example.com');
		await settle();
		flushSync();

		expect(target.textContent).toContain('Done — your account now uses pre-mount@example.com');
		expect(store.state.changeEmailConfirmOutcome).toEqual({
			kind: 'confirmed',
			email: 'pre-mount@example.com'
		});
	});

	it('mount old -> one call -> unmount -> tokenProvided new while old confirming -> remount -> exactly one new request; cancel old and drop late result', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		store.dispatch({ type: 'openChangeEmailConfirm', token: 'old-token' });

		// 1. Mount first instance with old token
		const { unmount: unmount1 } = mountRecipe(auth, store);

		await vi.waitFor(() => expect(driver.confirmEmailChanges).toHaveLength(1));
		expect(driver.confirmEmailChanges[0]!.token).toBe('old-token');
		expect(store.state.changeEmailConfirm?.status).toBe('confirming');
		expect(store.state.changeEmailConfirm?.attempt).toBe(1);

		// 2. Unmount while old confirmation is still in flight
		unmount1();

		// 3. Parent dispatches tokenProvided('new-token') while old confirmation is in progress
		store.dispatch({
			type: 'changeEmailConfirm',
			action: {
				type: 'presented',
				action: { type: 'tokenProvided', token: 'new-token' }
			}
		});

		// Reducer cancels old request and resets status to idle with new token and incremented attempt
		expect(store.state.changeEmailConfirm?.status).toBe('idle');
		expect(store.state.changeEmailConfirm?.token).toBe('new-token');
		expect(store.state.changeEmailConfirm?.attempt).toBe(2);
		expect(driver.confirmEmailChanges[0]!.signal?.aborted).toBe(true);

		// 4. Remount view with same store: must initiate exactly one new request for 'new-token'
		const { target: target2 } = mountRecipe(auth, store);

		await vi.waitFor(() => expect(driver.confirmEmailChanges).toHaveLength(2));
		expect(driver.confirmEmailChanges[1]!.token).toBe('new-token');
		expect(store.state.changeEmailConfirm?.status).toBe('confirming');
		expect(store.state.changeEmailConfirm?.attempt).toBe(3);

		// 5. Old call finishes late (stale result): must be dropped and not pulse outcome
		driver.confirmEmailChanges[0]!.resolve('old-late@example.com');
		await settle();
		flushSync();

		expect(store.state.changeEmailConfirmOutcome).toBeNull();
		expect(store.state.changeEmailConfirm?.status).toBe('confirming');

		// 6. New request succeeds: pulses confirmed outcome and updates UI
		driver.confirmEmailChanges[1]!.resolve('new-confirmed@example.com');
		await settle();
		flushSync();

		expect(target2.textContent).toContain('new-confirmed@example.com');
		expect(store.state.changeEmailConfirmOutcome).toEqual({
			kind: 'confirmed',
			email: 'new-confirmed@example.com'
		});
	});

	it('failed old attempt -> tokenProvided new while idle -> mount -> new request exactly once', async () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		store.dispatch({ type: 'openChangeEmailConfirm', token: 'expired-token' });

		// 1. Mount first instance
		const { unmount: unmount1 } = mountRecipe(auth, store);

		await vi.waitFor(() => expect(driver.confirmEmailChanges).toHaveLength(1));
		expect(driver.confirmEmailChanges[0]!.token).toBe('expired-token');

		// Old attempt fails
		driver.confirmEmailChanges[0]!.reject({
			code: 'token_expired',
			message: 'Link expired'
		});
		await settle();
		flushSync();

		expect(store.state.changeEmailConfirm?.status).toBe('idle');
		expect(store.state.changeEmailConfirm?.error?.code).toBe('token_expired');
		expect(store.state.changeEmailConfirm?.attempt).toBe(1);

		// Unmount after failure
		unmount1();

		// 2. Dispatch tokenProvided('fresh-token') while idle
		store.dispatch({
			type: 'changeEmailConfirm',
			action: {
				type: 'presented',
				action: { type: 'tokenProvided', token: 'fresh-token' }
			}
		});

		expect(store.state.changeEmailConfirm?.status).toBe('idle');
		expect(store.state.changeEmailConfirm?.error).toBeNull();
		expect(store.state.changeEmailConfirm?.attempt).toBe(0);
		expect(store.state.changeEmailConfirm?.token).toBe('fresh-token');

		// 3. Remount view: must start new request exactly once
		const { target: target2 } = mountRecipe(auth, store);

		await vi.waitFor(() => expect(driver.confirmEmailChanges).toHaveLength(2));
		expect(driver.confirmEmailChanges[1]!.token).toBe('fresh-token');
		expect(store.state.changeEmailConfirm?.status).toBe('confirming');
		expect(store.state.changeEmailConfirm?.attempt).toBe(1);

		driver.confirmEmailChanges[1]!.resolve('fresh@example.com');
		await settle();
		flushSync();

		expect(target2.textContent).toContain('fresh@example.com');
		expect(store.state.changeEmailConfirmOutcome).toEqual({
			kind: 'confirmed',
			email: 'fresh@example.com'
		});
	});

	it('hand-dispatching confirmationSucceeded while idle leaves settled null and emits no parent outcome', () => {
		const auth = createAuthFeature();
		const driver = controlledAuthDeps();
		const store = createAuthStore(auth, driver.deps);

		store.dispatch({ type: 'openChangeEmailConfirm', token: null });
		expect(store.state.changeEmailConfirm?.status).toBe('idle');

		// Hand-dispatch confirmationSucceeded while idle
		store.dispatch({
			type: 'changeEmailConfirm',
			action: {
				type: 'presented',
				action: { type: 'confirmationSucceeded', email: 'idle-replayed@example.com' }
			}
		});

		// State mutated by hand dispatch
		expect(store.state.changeEmailConfirm?.status).toBe('confirmed');
		expect(store.state.changeEmailConfirm?.email).toBe('idle-replayed@example.com');
		// settled is null because flow was not confirming
		expect(store.state.changeEmailConfirm?.settled).toBeNull();
		// Parent outcome is NOT emitted
		expect(store.state.changeEmailConfirmOutcome).toBeNull();
	});
});
