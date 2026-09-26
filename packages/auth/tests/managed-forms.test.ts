/**
 * `LoginForm`, `MfaChallengeForm` and `SignupForm` in `mode="managed"` — browser mode.
 *
 * Every managed view here is genuine: bound from a real `createAuthFeature`
 * store by `composition.bind`, or handed to a `defineViews` content snippet by
 * `FeatureViews`. No `Store` is fabricated and no prop is cast.
 *
 * The props are proved at compile time by `test-components/ManagedFormProps.svelte`,
 * which svelte-check compiles; plain `tsc` cannot see real component props.
 * Here, two things. The retirement: a managed view's state becomes `undefined` when its
 * owner goes, and a form still mounted over it renders nothing and reports no
 * subscriber error. The rebinding: a form handed a different view follows it,
 * in a fresh `Form` subtree, and stops hearing the old one even while the old
 * one is still live.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { createStore, type Store } from '@composable-svelte/core';
import type { PresentationView } from '@composable-svelte/core/application';

import MfaChallengeForm from '../src/lib/components/MfaChallengeForm.svelte';
import ForgotPasswordForm from '../src/lib/components/ForgotPasswordForm.svelte';
import LoginFormStoreSwap from './test-components/LoginFormStoreSwap.svelte';
import ManagedAuthRecipe from './test-components/ManagedAuthRecipe.svelte';
import ManagedFormSwap from './test-components/ManagedFormSwap.svelte';
import SignupFormStoreSwap from './test-components/SignupFormStoreSwap.svelte';
import ManagedRecoveryFooter from './test-components/ManagedRecoveryFooter.svelte';
import EmailVerificationStoreSwap from './test-components/EmailVerificationStoreSwap.svelte';
import MagicLinkRequestStoreSwap from './test-components/MagicLinkRequestStoreSwap.svelte';
import {
	createAuthFeature,
	type AuthFeature,
	type AuthFeatureAction,
	type AuthFeatureDependencies,
	type AuthFeatureState
} from '../src/lib/application/index.js';
import {
	createInitialMfaChallengeState,
	createForgotPasswordStore,
	createLoginStore,
	createMfaChallengeStore,
	createSignupStore,
	type LoginAction,
	type LoginState,
	type MfaChallengeAction,
	type MfaChallengeState,
	type SignupAction,
	type SignupState
} from '../src/lib/flows/index.js';
import { createInitialSessionState } from '../src/lib/session/index.js';
import { controlledAuthDeps, settle, snapshot } from './fixtures/managed-auth-drivers.js';

const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');

type AuthStore = Store<AuthFeatureState, AuthFeatureAction>;

const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
	vi.restoreAllMocks();
});

function createAuthStore(
	auth: AuthFeature,
	deps: AuthFeatureDependencies,
	initial: Partial<AuthFeatureState> = {}
): AuthStore {
	const initialState: AuthFeatureState = {
		...auth.initialState(),
		session: { ...createInitialSessionState(), status: 'anonymous' },
		...initial
	};
	const store = createStore({
		initialState,
		reducer: auth.composition.reducer,
		execution: auth.composition.execution,
		dependencies: deps
	});
	cleanups.push(() => store.destroy());
	return store;
}

function mountTarget(): HTMLDivElement {
	const target = document.createElement('div');
	document.body.appendChild(target);
	cleanups.push(() => target.remove());
	return target;
}

/** Subscriber and effect failures are reported, not thrown; this makes them fail. */
function watchErrors() {
	return vi.spyOn(console, 'error');
}

function loginView(auth: AuthFeature, store: AuthStore): PresentationView<LoginState, LoginAction> {
	const view = auth.composition.bind(store, auth.loginSlot);
	if (view === undefined) throw new Error('no live login flow');
	return view;
}

function mfaView(auth: AuthFeature, store: AuthStore): PresentationView<MfaChallengeState, MfaChallengeAction> {
	const view = auth.composition.bind(store, auth.mfaSlot);
	if (view === undefined) throw new Error('no live MFA flow');
	return view;
}

function type(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}

const emailField = (target: Element) => target.querySelector<HTMLInputElement>('input[name="email"]');
const passwordField = (target: Element) => target.querySelector<HTMLInputElement>('input[name="password"]');
const confirmField = (target: Element) =>
	target.querySelector<HTMLInputElement>('input[name="confirmPassword"]');
const codeField = (target: Element) => target.querySelector<HTMLInputElement>('input[name="code"]');
const submitButton = (target: Element) => target.querySelector<HTMLButtonElement>('button[type="submit"]');

function signupView(auth: AuthFeature, store: AuthStore): PresentationView<SignupState, SignupAction> {
	const view = auth.composition.bind(store, auth.signupSlot);
	if (view === undefined) throw new Error('no live signup flow');
	return view;
}

const buttonNamed = (target: Element, name: string) =>
	[...target.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);

function presentedTypes(seen: readonly AuthFeatureAction[], slot: 'login' | 'mfa' | 'signup'): string[] {
	return seen.flatMap((action) =>
		action.type === slot && action.action.type === 'presented' ? [action.action.action.type] : []
	);
}

describe('the managed recipe through FeatureViews', () => {
	it('replaces, branches to MFA, starts over, signs in and dismisses without a subscriber error', async () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const { deps, logins, challenges } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen: AuthFeatureAction[] = [];
		store.subscribeToActions?.((action) => void seen.push(action));
		const target = mountTarget();
		const component = mount(ManagedAuthRecipe, { target, props: { auth, store } });
		cleanups.push(() => void unmount(component));
		await tick();
		expect(target.querySelector('.login-form')).toBeNull();

		store.dispatch({ type: 'openLogin' });
		await tick();
		const first = emailField(target)!;
		type(first, 'mallory@example.com');
		expect(store.state.login?.form.data.email).toBe('mallory@example.com');

		// Replacement: a fresh owner gets a fresh form, not the old field.
		store.dispatch({ type: 'restartLogin' });
		await tick();
		expect(emailField(target)).not.toBe(first);
		expect(emailField(target)!.value).toBe('');

		// Branch: `mfa_required` retires the login and opens the challenge.
		type(emailField(target)!, 'ada@example.com');
		type(passwordField(target)!, 'correct-horse');
		submitButton(target)!.click();
		await vi.waitFor(() => expect(logins).toHaveLength(1));
		logins[0]!.reject({ code: 'mfa_required', message: 'Second factor.', challengeId: 'chal-1', methods: ['totp'] });
		await settle();
		expect(target.querySelector('.login-form')).toBeNull();
		expect(target.querySelector('.mfa-challenge')).not.toBeNull();

		// An expired challenge offers "Back to sign in", which is the feature's input.
		type(codeField(target)!, '123456');
		submitButton(target)!.click();
		await vi.waitFor(() => expect(challenges).toHaveLength(1));
		challenges[0]!.reject({ code: 'token_expired', message: 'Expired.' });
		await settle();
		const back = [...target.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Back to sign in');
		back!.click();
		await tick();
		expect(presentedTypes(seen, 'mfa')).toContain('startOverRequested');
		expect(store.state.mfa).toBeNull();
		expect(target.querySelector('.mfa-challenge')).toBeNull();
		expect(emailField(target)!.value).toBe('');

		// Success: the feature hands over and retires the flow; the form goes with it.
		type(emailField(target)!, 'ada@example.com');
		type(passwordField(target)!, 'correct-horse');
		submitButton(target)!.click();
		await vi.waitFor(() => expect(logins).toHaveLength(2));
		logins[1]!.resolve(ada);
		await settle();
		expect(store.state.session.status).toBe('authenticated');
		expect(target.querySelector('.login-form')).toBeNull();

		// Dismissal, through the view and through the feature.
		store.dispatch({ type: 'openLogin' });
		await tick();
		expect(target.querySelector('.login-form')).not.toBeNull();
		loginView(auth, store).dismiss();
		await tick();
		expect(target.querySelector('.login-form')).toBeNull();
		store.dispatch({ type: 'openLogin' });
		await tick();
		store.dispatch({ type: 'cancelSignIn' });
		await tick();
		expect(target.querySelector('.login-form')).toBeNull();

		expect(errors).not.toHaveBeenCalled();
	});
});

describe('managed recovery forms through FeatureViews', () => {
	it('keeps the standalone no-footer form free of a managed sign-in action', async () => {
		const store = createForgotPasswordStore(controlledAuthDeps().deps);
		cleanups.push(() => store.destroy());
		const target = mountTarget();
		const component = mount(ForgotPasswordForm, { target, props: { flowStore: store } });
		cleanups.push(() => void unmount(component));
		await tick();
		expect(target.querySelector('.forgot-form')).not.toBeNull();
		expect(buttonNamed(target, 'Back to sign in')).toBeUndefined();
	});

	it('uses a configurable default sign-in label and lets a custom footer replace that action', async () => {
		const auth = createAuthFeature();
		const deps = controlledAuthDeps().deps;
		const defaultStore = createAuthStore(auth, deps);
		const customStore = createAuthStore(auth, deps);
		defaultStore.dispatch({ type: 'openForgotPassword' });
		customStore.dispatch({ type: 'openForgotPassword' });
		const defaultTarget = mountTarget();
		const customTarget = mountTarget();
		const defaultView = auth.composition.bind(defaultStore, auth.forgotPasswordSlot)!;
		const customView = auth.composition.bind(customStore, auth.forgotPasswordSlot)!;
		const first = mount(ManagedRecoveryFooter, { target: defaultTarget, props: { view: defaultView } });
		const second = mount(ManagedRecoveryFooter, { target: customTarget, props: { view: customView, custom: true } });
		cleanups.push(() => void unmount(first), () => void unmount(second));
		await tick();
		expect(buttonNamed(defaultTarget, 'Return to account')).not.toBeUndefined();
		expect(buttonNamed(customTarget, 'Return to account')).toBeUndefined();
		expect(buttonNamed(customTarget, 'Custom return')).not.toBeUndefined();
		buttonNamed(defaultTarget, 'Return to account')!.click();
		buttonNamed(customTarget, 'Custom return')!.click();
		expect(defaultStore.state.login).not.toBeNull();
		expect(customStore.state.login).not.toBeNull();
	});

	it('keeps forgot-password editable after a sent result and routes back to login', async () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const { deps, forgotPasswords } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const target = mountTarget();
		const component = mount(ManagedAuthRecipe, { target, props: { auth, store } });
		cleanups.push(() => void unmount(component));
		store.dispatch({ type: 'openForgotPassword' });
		await tick();
		type(emailField(target)!, 'grace@example.com');
		submitButton(target)!.click();
		await vi.waitFor(() => expect(forgotPasswords).toHaveLength(1));
		forgotPasswords[0]!.resolve();
		await settle();
		expect(target.textContent).toContain('If there is an account for');
		expect(emailField(target)).not.toBeNull();
		type(emailField(target)!, 'grace@example.com');
		submitButton(target)!.click();
		await vi.waitFor(() => expect(forgotPasswords).toHaveLength(2));
		forgotPasswords[1]!.resolve();
		await settle();
		buttonNamed(target, 'Back to sign in')!.click();
		await tick();
		expect(target.querySelector('.forgot-form')).toBeNull();
		expect(target.querySelector('.login-form')).not.toBeNull();
		expect(errors).not.toHaveBeenCalled();
	});

	it('shows reset no-session and expired-link navigation without a component handoff', async () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const { deps, resetPasswords } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const target = mountTarget();
		const component = mount(ManagedAuthRecipe, { target, props: { auth, store } });
		cleanups.push(() => void unmount(component));
		store.dispatch({ type: 'openResetPassword', token: 'token-a' });
		await tick();
		type(passwordField(target)!, 'correct-horse-battery-staple');
		type(confirmField(target)!, 'correct-horse-battery-staple');
		submitButton(target)!.click();
		await vi.waitFor(() => expect(resetPasswords).toHaveLength(1));
		resetPasswords[0]!.resolve(null);
		await settle();
		expect(target.textContent).toContain('Sign in with your new password');
		expect(store.state.handoff).toBeNull();
		buttonNamed(target, 'Sign in')!.click();
		await tick();
		expect(target.querySelector('.reset-form')).toBeNull();
		expect(target.querySelector('.login-form')).not.toBeNull();

		store.dispatch({ type: 'restartResetPassword', token: 'token-b' });
		await tick();
		type(passwordField(target)!, 'correct-horse-battery-staple');
		type(confirmField(target)!, 'correct-horse-battery-staple');
		submitButton(target)!.click();
		await vi.waitFor(() => expect(resetPasswords).toHaveLength(2));
		resetPasswords[1]!.reject({ code: 'token_expired', message: 'Expired.' });
		await settle();
		expect(target.textContent).toContain('This link has expired');
		buttonNamed(target, 'Send me a new link')!.click();
		await tick();
		expect(target.querySelector('.reset-form')).toBeNull();
		expect(target.querySelector('.forgot-form')).not.toBeNull();
		expect(errors).not.toHaveBeenCalled();
	});
});

describe('managed email verification through FeatureViews', () => {
	it('rebinds the visible resend action to its captured view, not a previous sibling', async () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const { deps, resends } = controlledAuthDeps();
		const one = createAuthStore(auth, deps);
		const two = createAuthStore(auth, deps);
		one.dispatch({ type: 'openEmailVerification', email: 'a@example.com' });
		two.dispatch({ type: 'openEmailVerification', email: 'b@example.com' });
		const old = auth.composition.bind(one, auth.emailVerificationSlot)!;
		const current = auth.composition.bind(two, auth.emailVerificationSlot)!;
		const target = mountTarget();
		const swap = mount(EmailVerificationStoreSwap, { target, props: { initial: old } });
		cleanups.push(() => void unmount(swap));
		await tick();
		const oldButton = buttonNamed(target, 'Send another link')!;

		// The prop now names `current`, but the swap is not flushed: the old
		// subtree is still in the document. Its click belongs to the view it was
		// rendered for, not to whatever `flowStore` reads at click time.
		swap.show(current);
		expect(oldButton.isConnected, 'the old subtree is still attached before the flush').toBe(true);
		oldButton.click();
		expect(one.state.emailVerification?.resendStatus, 'the old click reached A').toBe('sending');
		expect(two.state.emailVerification?.resendStatus, 'the old click did not reach B').toBe('idle');
		await vi.waitFor(() => expect(resends).toHaveLength(1));
		expect(resends[0]!.email).toBe('a@example.com');

		flushSync();
		expect(oldButton.isConnected, 'the swap removed the old subtree').toBe(false);
		const currentButton = buttonNamed(target, 'Send another link')!;
		expect(currentButton).not.toBe(oldButton);
		expect(target.textContent).toContain('b@example.com');
		currentButton.click();
		expect(two.state.emailVerification?.resendStatus, 'the new click reached B').toBe('sending');
		await vi.waitFor(() => expect(resends).toHaveLength(2));
		expect(resends[1]!.email).toBe('b@example.com');
		expect(resends[0]!.signal?.aborted, "B's resend left A's in flight").toBe(false);
		expect(errors).not.toHaveBeenCalled();
	});

	it('exchanges the same token again for a fresh owner swapped into one kept-mounted instance', async () => {
		// `FeatureOutlet` remounts on a restart, which resets every component
		// local. Here the instance survives, so only the per-owner reset of the
		// once-only guard can owe the new owner its exchange.
		const errors = watchErrors();
		const auth = createAuthFeature();
		const { deps, verifications } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openEmailVerification', email: 'ada@example.com' });
		const first = auth.composition.bind(store, auth.emailVerificationSlot)!;
		const target = mountTarget();
		const swap = mount(EmailVerificationStoreSwap, { target, props: { initial: first, token: 'same-token' } });
		cleanups.push(() => void unmount(swap));
		await vi.waitFor(() => expect(verifications).toHaveLength(1));
		expect(verifications[0]!.token).toBe('same-token');
		verifications[0]!.reject({ code: 'token_expired', message: 'Expired.' });
		await settle();
		flushSync();
		expect(verifications, 'a failed token re-exchanged within its owner').toHaveLength(1);
		const firstRoot = target.querySelector('.email-verification')!;
		expect(firstRoot.querySelector('[data-error-code="token_expired"]')).not.toBeNull();

		store.dispatch({ type: 'restartEmailVerification', email: 'ada@example.com' });
		const second = auth.composition.bind(store, auth.emailVerificationSlot)!;
		expect(second).not.toBe(first);
		swap.show(second);
		flushSync();
		await vi.waitFor(() => expect(verifications).toHaveLength(2));
		expect(verifications[1]!.token).toBe('same-token');
		expect(second.state?.status, 'the exchange went to the fresh owner').toBe('verifying');
		expect(target.querySelector('.email-verification'), 'a fresh owner gets a fresh subtree').not.toBe(firstRoot);

		verifications[1]!.reject({ code: 'token_expired', message: 'Expired.' });
		await settle();
		await settle();
		expect(verifications, 'one exchange per owner, not per failure').toHaveLength(2);
		expect(store.state.emailVerification?.error?.code).toBe('token_expired');
		expect(errors).not.toHaveBeenCalled();
	});

	it('renders nothing over a retired view kept mounted, and nothing reaches its replacement', async () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const { deps, verifications, resends } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openEmailVerification', email: 'ada@example.com' });
		const retiring = auth.composition.bind(store, auth.emailVerificationSlot)!;
		const target = mountTarget();
		const swap = mount(EmailVerificationStoreSwap, { target, props: { initial: retiring, token: 'link-token' } });
		cleanups.push(() => void unmount(swap));
		await vi.waitFor(() => expect(verifications).toHaveLength(1));
		expect(target.querySelector('.email-verification')).not.toBeNull();

		const seen: AuthFeatureAction[] = [];
		store.subscribeToActions?.((action) => void seen.push(action));
		store.dispatch({ type: 'restartEmailVerification', email: 'ada@example.com' });
		flushSync();
		expect(retiring.state).toBeUndefined();
		expect(verifications[0]!.signal?.aborted, 'the retired exchange was cancelled').toBe(true);
		expect(target.querySelector('.email-verification'), 'a retired view renders nothing').toBeNull();
		expect(target.querySelector('button')).toBeNull();

		// The component is still mounted with its token; the replacement is idle
		// and a live flow in the same slot. Nothing from the retired instance may
		// start its exchange or reach it any other way.
		await settle();
		flushSync();
		expect(verifications, 'no exchange for the replacement').toHaveLength(1);
		expect(resends).toHaveLength(0);
		expect(store.state.emailVerification?.status).toBe('idle');
		expect(seen.map((action) => action.type), 'only the restart was dispatched').toEqual(['restartEmailVerification']);
		expect(errors).not.toHaveBeenCalled();
	});

	it('exchanges a token once on mount, offers sign-in without a session and retires safely', async () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const { deps, verifications } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openEmailVerification', email: 'ada@example.com' });
		const target = mountTarget();
		const component = mount(ManagedAuthRecipe, { target, props: { auth, store } });
		cleanups.push(() => void unmount(component));
		await vi.waitFor(() => expect(verifications).toHaveLength(1));
		expect(verifications[0]!.token).toBe('test-verification-token');
		store.dispatch({ type: 'openEmailVerification', email: 'ignored@example.com' });
		await tick();
		expect(verifications).toHaveLength(1);
		verifications[0]!.resolve(null);
		await settle();
		expect(target.textContent).toContain('Your address is confirmed');
		expect(store.state.handoff).toBeNull();
		buttonNamed(target, 'Sign in')!.click();
		await tick();
		expect(target.querySelector('.email-verification')).toBeNull();
		expect(target.querySelector('.login-form')).not.toBeNull();
		expect(errors).not.toHaveBeenCalled();
	});

	it('keeps resend independent of a failed token and renders the new-mail result', async () => {
		const auth = createAuthFeature();
		const { deps, verifications, resends } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openEmailVerification', email: 'ada@example.com' });
		const target = mountTarget();
		const component = mount(ManagedAuthRecipe, { target, props: { auth, store } });
		cleanups.push(() => void unmount(component));
		await vi.waitFor(() => expect(verifications).toHaveLength(1));
		verifications[0]!.reject({ code: 'token_expired', message: 'Expired.' });
		await settle();
		buttonNamed(target, 'Send another link')!.click();
		await vi.waitFor(() => expect(resends).toHaveLength(1));
		expect(resends[0]!.email).toBe('ada@example.com');
		resends[0]!.resolve();
		await settle();
		expect(target.textContent).toContain('Sent. Check');
		expect(store.state.emailVerification?.error?.code).toBe('token_expired');
	});

	it('exchanges the same token exactly once for each fresh owner after a restart', async () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const { deps, verifications } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openEmailVerification', email: 'ada@example.com' });
		const target = mountTarget();
		const component = mount(ManagedAuthRecipe, { target, props: { auth, store } });
		cleanups.push(() => void unmount(component));
		await vi.waitFor(() => expect(verifications).toHaveLength(1));
		verifications[0]!.reject({ code: 'token_expired', message: 'Expired.' });
		await settle();
		expect(verifications, 'a failed token re-exchanged within its owner').toHaveLength(1);

		store.dispatch({ type: 'restartEmailVerification', email: 'ada@example.com' });
		await vi.waitFor(() => expect(verifications).toHaveLength(2));
		expect(verifications[1]!.token).toBe('test-verification-token');
		verifications[1]!.reject({ code: 'token_expired', message: 'Expired.' });
		await settle();
		await settle();
		expect(verifications, 'one exchange per fresh owner').toHaveLength(2);
		expect(store.state.emailVerification?.error?.code).toBe('token_expired');
		expect(errors).not.toHaveBeenCalled();
	});
});

describe('managed MagicLinkRequestForm through FeatureViews', () => {
	it('rebinds the visible back-to-sign-in action to its captured view, not a previous sibling or un-flushed replacement', async () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const one = createAuthStore(auth, deps);
		const two = createAuthStore(auth, deps);
		one.dispatch({ type: 'openMagicLinkRequest' });
		two.dispatch({ type: 'openMagicLinkRequest' });
		const old = auth.composition.bind(one, auth.magicLinkRequestSlot)!;
		const current = auth.composition.bind(two, auth.magicLinkRequestSlot)!;
		const target = mountTarget();
		const swap = mount(MagicLinkRequestStoreSwap, { target, props: { initial: old } });
		cleanups.push(() => void unmount(swap));
		await tick();
		const oldButton = buttonNamed(target, 'Back to sign in')!;
		expect(oldButton).not.toBeUndefined();

		// The prop now names `current`, but the swap is not flushed: the old
		// subtree is still in the document. Its click belongs to the view it was
		// rendered for, not to whatever `flowStore` reads at click time.
		swap.show(current);
		expect(oldButton.isConnected, 'the old subtree is still attached before the flush').toBe(true);
		oldButton.click();
		expect(one.state.login?.status, 'the old click transitioned store one to login').toBe('idle');
		expect(one.state.magicLinkRequest, 'store one magic link request retired').toBeNull();
		expect(two.state.login, 'store two was untouched').toBeNull();
		expect(two.state.magicLinkRequest?.status, 'store two remains in magic link request').toBe('idle');

		flushSync();
		expect(oldButton.isConnected, 'the swap removed the old subtree').toBe(false);
		const currentButton = buttonNamed(target, 'Back to sign in')!;
		expect(currentButton).not.toBe(oldButton);
		currentButton.click();
		expect(two.state.login?.status, 'the new click transitioned store two to login').toBe('idle');
		expect(two.state.magicLinkRequest, 'store two magic link request retired').toBeNull();
		expect(errors).not.toHaveBeenCalled();
	});
});

describe('a managed form kept mounted over its view', () => {
	it('renders nothing once the login view retires, then follows a new view in a fresh subtree', async () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const store = createAuthStore(auth, controlledAuthDeps().deps);
		store.dispatch({ type: 'openLogin' });
		const retiring = loginView(auth, store);
		const target = mountTarget();
		const swap = mount(ManagedFormSwap, { target, props: { initial: { kind: 'login', view: retiring } } });
		cleanups.push(() => void unmount(swap));
		flushSync();
		const first = emailField(target)!;
		type(first, 'first@example.com');
		expect(store.state.login?.form.data.email).toBe('first@example.com');

		store.dispatch({ type: 'cancelSignIn' });
		flushSync();
		expect(retiring.state).toBeUndefined();
		expect(target.querySelector('.login-form'), 'a retired view renders nothing').toBeNull();

		store.dispatch({ type: 'openLogin' });
		swap.show({ kind: 'login', view: loginView(auth, store) });
		flushSync();
		expect(emailField(target)).not.toBe(first);
		expect(emailField(target)!.value).toBe('');
		type(emailField(target)!, 'second@example.com');
		expect(store.state.login?.form.data.email).toBe('second@example.com');

		expect(errors).not.toHaveBeenCalled();
	});

	it('stops hearing a replaced view that is still live', async () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const one = createAuthStore(auth, deps);
		const two = createAuthStore(auth, deps);
		one.dispatch({ type: 'openLogin' });
		two.dispatch({ type: 'openLogin' });
		const old = loginView(auth, one);
		const current = loginView(auth, two);
		const target = mountTarget();
		const swap = mount(ManagedFormSwap, { target, props: { initial: { kind: 'login', view: old } } });
		cleanups.push(() => void unmount(swap));
		flushSync();
		const oldNode = emailField(target)!;
		oldNode.focus();
		expect(document.activeElement).toBe(oldNode);

		swap.show({ kind: 'login', view: current });
		flushSync();
		expect(emailField(target), 'the Form subtree is keyed by the view').not.toBe(oldNode);
		expect(one.state.login?.form.fields.email?.touched, 'the removal blur reaches A').toBe(true);
		expect(two.state.login?.form.fields.email?.touched, 'A removal blur stays with A').toBe(false);

		old.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: 'stale@example.com' } });
		flushSync();
		expect(old.state?.form.data.email, 'the old view is live and changed').toBe('stale@example.com');
		expect(emailField(target)!.value).toBe('');

		current.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: 'live@example.com' } });
		flushSync();
		expect(emailField(target)!.value, 'control: the current view is heard').toBe('live@example.com');

		type(emailField(target)!, 'typed@example.com');
		expect(two.state.login?.form.data.email).toBe('typed@example.com');
		expect(one.state.login?.form.data.email).toBe('stale@example.com');
		expect(errors).not.toHaveBeenCalled();
	});

	it('renders nothing once the MFA view retires, and follows a new challenge', async () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const store = createAuthStore(auth, controlledAuthDeps().deps, {
			mfa: createInitialMfaChallengeState('chal-1', ['totp'])
		});
		const retiring = mfaView(auth, store);
		const target = mountTarget();
		const swap = mount(ManagedFormSwap, { target, props: { initial: { kind: 'mfa', view: retiring } } });
		cleanups.push(() => void unmount(swap));
		flushSync();
		const first = codeField(target)!;
		type(first, '123');
		expect(store.state.mfa?.form.data.code).toBe('123');

		store.dispatch({ type: 'restartLogin' });
		flushSync();
		expect(retiring.state).toBeUndefined();
		expect(target.querySelector('.mfa-challenge')).toBeNull();

		const other = createAuthStore(auth, controlledAuthDeps().deps, {
			mfa: createInitialMfaChallengeState('chal-2', ['totp'])
		});
		const next = mfaView(auth, other);
		swap.show({ kind: 'mfa', view: next });
		flushSync();
		expect(codeField(target)).not.toBe(first);
		expect(codeField(target)!.value).toBe('');
		next.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'code', value: '654321' } });
		flushSync();
		expect(codeField(target)!.value).toBe('654321');
		expect(errors).not.toHaveBeenCalled();
	});

	it('keys the MFA Form subtree by view, and stops hearing a replaced view that is still live', () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const one = createAuthStore(auth, controlledAuthDeps().deps, {
			mfa: createInitialMfaChallengeState('chal-1', ['totp'])
		});
		const two = createAuthStore(auth, controlledAuthDeps().deps, {
			mfa: createInitialMfaChallengeState('chal-2', ['totp'])
		});
		const old = mfaView(auth, one);
		const current = mfaView(auth, two);
		const target = mountTarget();
		const swap = mount(ManagedFormSwap, { target, props: { initial: { kind: 'mfa', view: old } } });
		cleanups.push(() => void unmount(swap));
		flushSync();
		const oldNode = codeField(target)!;

		swap.show({ kind: 'mfa', view: current });
		flushSync();
		expect(codeField(target), 'a fresh Form subtree for the new view').not.toBe(oldNode);

		old.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'code', value: '111111' } });
		flushSync();
		expect(old.state?.form.data.code, 'the old view is live and changed').toBe('111111');
		expect(codeField(target)!.value).toBe('');
		current.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'code', value: '222222' } });
		flushSync();
		expect(codeField(target)!.value, 'control: the current view is heard').toBe('222222');
		expect(errors).not.toHaveBeenCalled();
	});

	it('"Back to sign in" dispatches startOverRequested, and the retired challenge renders nothing', async () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const store = createAuthStore(auth, controlledAuthDeps().deps, {
			mfa: createInitialMfaChallengeState(null)
		});
		const seen: AuthFeatureAction[] = [];
		store.subscribeToActions?.((action) => void seen.push(action));
		const target = mountTarget();
		const swap = mount(ManagedFormSwap, { target, props: { initial: { kind: 'mfa', view: mfaView(auth, store) } } });
		cleanups.push(() => void unmount(swap));
		flushSync();

		const back = [...target.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Back to sign in');
		back!.click();
		flushSync();
		expect(presentedTypes(seen, 'mfa')).toEqual(['startOverRequested']);
		expect(store.state.mfa).toBeNull();
		expect(store.state.login?.status).toBe('idle');
		expect(target.querySelector('.mfa-challenge')).toBeNull();
		expect(errors).not.toHaveBeenCalled();
	});
});

describe('standalone controls', () => {
	it('a standalone store swap keeps one Form subtree, as before', () => {
		const deps = { login: async () => ada };
		const a = createLoginStore(deps, { email: 'first@example.com' });
		const b = createLoginStore(deps, { email: 'second@example.com' });
		const target = mountTarget();
		const probe = mount(LoginFormStoreSwap, { target, props: { a, b, sessionStore: { dispatch: () => {} } } });
		cleanups.push(() => void unmount(probe));
		flushSync();
		const node = emailField(target)!;
		probe.swap();
		flushSync();
		expect(emailField(target)).toBe(node);
		expect(node.value).toBe('second@example.com');
	});

	it('standalone "Back to sign in" calls onStartOver and dispatches nothing to the flow', () => {
		const flow = createMfaChallengeStore({ verifyMfaChallenge: async () => ada });
		const dispatched: MfaChallengeAction[] = [];
		const flowStore = {
			get state() {
				return flow.state;
			},
			dispatch(action: MfaChallengeAction) {
				dispatched.push(action);
				flow.dispatch(action);
			},
			subscribe: flow.subscribe.bind(flow)
		};
		const onStartOver = vi.fn();
		const target = mountTarget();
		const component = mount(MfaChallengeForm, {
			target,
			props: { flowStore, sessionStore: { dispatch: () => {} }, onStartOver }
		});
		cleanups.push(() => void unmount(component));
		flushSync();
		const back = [...target.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Back to sign in');
		back!.click();
		expect(onStartOver).toHaveBeenCalledTimes(1);
		expect(dispatched).toEqual([]);
	});
});

describe('managed SignupForm', () => {
	const password = 'correct-horse-battery-staple';

	function fillSignup(target: Element, email: string): void {
		type(emailField(target)!, email);
		type(passwordField(target)!, password);
		type(confirmField(target)!, password);
	}

	it('renders the mounted view, shows the verification panel, offers sign-in and hands a session over', async () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const { deps, signups } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen: AuthFeatureAction[] = [];
		store.subscribeToActions?.((action) => void seen.push(action));
		const target = mountTarget();
		const component = mount(ManagedAuthRecipe, { target, props: { auth, store } });
		cleanups.push(() => void unmount(component));
		await tick();
		expect(target.querySelector('.signup-form')).toBeNull();

		// Verification: the terminal panel, the pending address, no session.
		store.dispatch({ type: 'openSignup' });
		await tick();
		fillSignup(target, 'grace@example.com');
		expect(store.state.signup?.form.data.email).toBe('grace@example.com');
		submitButton(target)!.click();
		await vi.waitFor(() => expect(signups).toHaveLength(1));
		signups[0]!.resolve({ kind: 'verificationRequired', email: 'grace@example.com' });
		await settle();
		const panel = target.querySelector<HTMLElement>('.signup-form__verify');
		expect(panel?.textContent).toContain('grace@example.com');
		expect(document.activeElement).toBe(panel);
		expect(target.querySelector('form'), 'the form is replaced by the panel').toBeNull();
		expect(store.state.session.status).toBe('anonymous');
		expect(store.state.handoff).toBeNull();

		// email_taken: "Sign in instead" is the feature's input, and presents login.
		store.dispatch({ type: 'restartSignup' });
		await tick();
		expect(target.querySelector('.signup-form__verify')).toBeNull();
		fillSignup(target, 'ada@example.com');
		submitButton(target)!.click();
		await vi.waitFor(() => expect(signups).toHaveLength(2));
		signups[1]!.reject({ code: 'email_taken', message: 'That address is taken.' });
		await settle();
		expect(target.querySelector('[data-error-code="email_taken"]')).not.toBeNull();
		buttonNamed(target, 'Sign in instead')!.click();
		await tick();
		expect(presentedTypes(seen, 'signup')).toContain('signInRequested');
		expect(store.state.signup).toBeNull();
		expect(target.querySelector('.signup-form')).toBeNull();
		expect(target.querySelector('.login-form')).not.toBeNull();

		// Session: the feature hands over and retires the flow; the form goes with it.
		store.dispatch({ type: 'restartSignup' });
		await tick();
		expect(target.querySelector('.login-form')).toBeNull();
		fillSignup(target, 'ada@example.com');
		submitButton(target)!.click();
		await vi.waitFor(() => expect(signups).toHaveLength(3));
		signups[2]!.resolve({ kind: 'session', session: ada });
		await settle();
		expect(store.state.session.status).toBe('authenticated');
		expect(target.querySelector('.signup-form')).toBeNull();

		expect(errors).not.toHaveBeenCalled();
	});

	it('renders nothing once its view retires, then follows a new view in a fresh subtree', () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const store = createAuthStore(auth, controlledAuthDeps().deps);
		store.dispatch({ type: 'openSignup' });
		const retiring = signupView(auth, store);
		const target = mountTarget();
		const swap = mount(ManagedFormSwap, { target, props: { initial: { kind: 'signup', view: retiring } } });
		cleanups.push(() => void unmount(swap));
		flushSync();
		const first = emailField(target)!;
		type(first, 'first@example.com');
		expect(store.state.signup?.form.data.email).toBe('first@example.com');

		store.dispatch({ type: 'cancelSignIn' });
		flushSync();
		expect(retiring.state).toBeUndefined();
		expect(target.querySelector('.signup-form'), 'a retired view renders nothing').toBeNull();

		store.dispatch({ type: 'openSignup' });
		swap.show({ kind: 'signup', view: signupView(auth, store) });
		flushSync();
		expect(emailField(target)).not.toBe(first);
		expect(emailField(target)!.value).toBe('');
		type(emailField(target)!, 'second@example.com');
		expect(store.state.signup?.form.data.email).toBe('second@example.com');
		expect(errors).not.toHaveBeenCalled();
	});

	it("a departing live view A's blur stays with A; replacement B is untouched and heard", () => {
		const errors = watchErrors();
		const auth = createAuthFeature();
		const { deps } = controlledAuthDeps();
		const one = createAuthStore(auth, deps);
		const two = createAuthStore(auth, deps);
		one.dispatch({ type: 'openSignup' });
		two.dispatch({ type: 'openSignup' });
		const old = signupView(auth, one);
		const current = signupView(auth, two);
		const target = mountTarget();
		const swap = mount(ManagedFormSwap, { target, props: { initial: { kind: 'signup', view: old } } });
		cleanups.push(() => void unmount(swap));
		flushSync();
		const oldNode = emailField(target)!;
		oldNode.focus();
		expect(document.activeElement).toBe(oldNode);

		swap.show({ kind: 'signup', view: current });
		flushSync();
		expect(emailField(target), 'the Form subtree is keyed by the view').not.toBe(oldNode);
		expect(one.state.signup?.form.fields.email?.touched, 'the removal blur reaches A').toBe(true);
		expect(two.state.signup?.form.fields.email?.touched, 'A removal blur stays with A').toBe(false);

		old.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: 'stale@example.com' } });
		flushSync();
		expect(old.state?.form.data.email, 'the old view is live and changed').toBe('stale@example.com');
		expect(emailField(target)!.value).toBe('');

		current.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: 'live@example.com' } });
		flushSync();
		expect(emailField(target)!.value, 'control: the current view is heard').toBe('live@example.com');
		type(emailField(target)!, 'typed@example.com');
		expect(two.state.signup?.form.data.email).toBe('typed@example.com');
		expect(one.state.signup?.form.data.email).toBe('stale@example.com');
		expect(errors).not.toHaveBeenCalled();
	});

	it('standalone control: a store swap keeps one Form subtree, and the handoff stays the component\'s', async () => {
		const deps = { signup: async () => ({ kind: 'session', session: ada }) as const };
		const a = createSignupStore(deps, { email: 'first@example.com' });
		const b = createSignupStore(deps, { email: 'second@example.com' });
		const established: unknown[] = [];
		const target = mountTarget();
		const probe = mount(SignupFormStoreSwap, {
			target,
			props: { a, b, sessionStore: { dispatch: (action) => void established.push(action) } }
		});
		cleanups.push(() => void unmount(probe));
		flushSync();
		const node = emailField(target)!;
		probe.swap();
		flushSync();
		expect(emailField(target)).toBe(node);
		expect(node.value).toBe('second@example.com');

		type(passwordField(target)!, password);
		type(confirmField(target)!, password);
		submitButton(target)!.click();
		await vi.waitFor(() => expect(established).toEqual([{ type: 'sessionEstablished', session: ada }]));
		expect(a.state.status, 'the swapped-out store was not submitted').toBe('idle');
	});
});
