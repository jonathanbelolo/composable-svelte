/**
 * Managed `MfaEnrolment` and `MfaManagementPanel`, mounted through the genuine
 * `FeatureViews`/`FeatureOutlet` recipe with requests held open by
 * `controlledAuthDeps`. The headless rules are in `managed-mfa-settings.test.ts`;
 * this is what the mounted views add: the mount effect's single start, the
 * once-only codes on screen until the user acknowledges them (once), the
 * account's `mfaEnabled` read, and an old subtree's click or input — landing
 * while it is still attached, before the flush — reaching only its own retired
 * view. Clicks on detached elements are not used as evidence: Svelte delegates
 * events, so those never run a handler at all.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import { createStore, type Store } from '@composable-svelte/core';

import ManagedAuthRecipe from './test-components/ManagedAuthRecipe.svelte';
import {
	createAuthFeature,
	type AuthFeature,
	type AuthFeatureAction,
	type AuthFeatureDependencies,
	type AuthFeatureState,
	type AuthMfaOutcome
} from '../src/lib/application/index.js';
import type { AuthError } from '../src/lib/errors/types.js';
import { createInitialSessionState } from '../src/lib/session/index.js';
import { subjectFromSession } from '../src/lib/subject/index.js';
import { createMfaEnrolmentStore, type MfaEnrolmentAction } from '../src/lib/flows/index.js';
import MfaEnrolment from '../src/lib/components/MfaEnrolment.svelte';
import MfaEnrolmentStoreSwap from './test-components/MfaEnrolmentStoreSwap.svelte';
import { controlledAuthDeps, settle, snapshot } from './fixtures/managed-auth-drivers.js';

type AuthStore = Store<AuthFeatureState, AuthFeatureAction>;

const START = { enrolmentId: 'enr-1', secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/Acme:ada?secret=JBSWY3DPEHPK3PXP' };
const CODES = ['aaa-111', 'bbb-222'];
const NEEDS_PROOF: AuthError = { code: 'reauthentication_required', message: 'Confirm it is still you.', methods: ['password'] };

const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
	vi.restoreAllMocks();
});

const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');

/** Signed in: managed settings open only for an authenticated subject. */
function createAuthStore(auth: AuthFeature, deps: AuthFeatureDependencies): AuthStore {
	const initialState: AuthFeatureState = {
		...auth.initialState(),
		session: { ...createInitialSessionState(), status: 'authenticated', subject: subjectFromSession(ada) }
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

function mountRecipe(auth: AuthFeature, store: AuthStore, mfaEnabled?: boolean) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	cleanups.push(() => target.remove());
	const component = mount(ManagedAuthRecipe, { target, props: { auth, store, mfaEnabled } });
	cleanups.push(() => void unmount(component));
	return { target, component };
}

/** Every outcome a reduction left behind, in order: what a parent routes on. */
function outcomes(store: AuthStore): AuthMfaOutcome[] {
	const seen: AuthMfaOutcome[] = [];
	store.subscribeToActions?.(() => {
		if (store.state.mfaOutcome !== null) seen.push(store.state.mfaOutcome);
	});
	return seen;
}

const buttonNamed = (target: Element, name: string) =>
	[...target.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);

function type(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}

describe('managed MfaEnrolment through FeatureViews', () => {
	it('starts once, retries once, holds the codes until acknowledged, and routes the acknowledgement', async () => {
		const errors = vi.spyOn(console, 'error');
		const auth = createAuthFeature();
		const { deps, beginEnrolments, confirmEnrolments } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen = outcomes(store);
		store.dispatch({ type: 'openMfaEnrolment' });
		const { target } = mountRecipe(auth, store);

		await vi.waitFor(() => expect(beginEnrolments).toHaveLength(1));
		expect(target.textContent).toContain('Preparing your setup key');
		store.dispatch({ type: 'openMfaEnrolment' });
		await settle();
		expect(beginEnrolments, 'one start per mounted owner').toHaveLength(1);

		beginEnrolments[0]!.reject({ code: 'unknown', message: 'Setup is unavailable.' });
		await settle();
		expect(target.textContent).toContain('Could not start setup');
		expect(beginEnrolments, 'a failed start is not re-issued by the mount effect').toHaveLength(1);
		buttonNamed(target, 'Try again')!.click();
		await vi.waitFor(() => expect(beginEnrolments).toHaveLength(2));
		await settle();
		expect(beginEnrolments, 'one retry, one request').toHaveLength(2);

		beginEnrolments[1]!.resolve(START);
		await settle();
		expect(target.querySelector('.mfa-enrolment__key')?.textContent).toBe(START.secret);

		type(target.querySelector<HTMLInputElement>('input[name="code"]')!, '123456');
		target.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
		await vi.waitFor(() => expect(confirmEnrolments).toHaveLength(1));
		expect(confirmEnrolments[0]!.enrolmentId).toBe('enr-1');
		expect(confirmEnrolments[0]!.code).toBe('123456');
		confirmEnrolments[0]!.resolve({ recoveryCodes: CODES });
		await settle();

		// Enrolled, and nothing has been acknowledged for the user.
		for (const code of CODES) expect(target.textContent).toContain(code);
		expect(seen).toEqual([]);
		expect(store.state.mfaEnrolment?.status).toBe('enrolled');

		// A double click: both land before Svelte flushes, so the second reaches the
		// same, still-attached handler — and the feature refuses it.
		const acknowledge = buttonNamed(target, 'I have saved them')!;
		acknowledge.click();
		expect(acknowledge.isConnected, 'the second click is not a detached no-op').toBe(true);
		acknowledge.click();
		await tick();
		expect(seen).toEqual([{ kind: 'enrolmentAcknowledged' }]);
		// Still on screen: leaving is the parent's decision, taken on that outcome.
		for (const code of CODES) expect(target.textContent).toContain(code);
		expect(buttonNamed(target, 'I have saved them'), 'accepted once, offered once').toBeUndefined();
		store.dispatch({ type: 'closeMfaEnrolment' });
		await tick();
		expect(target.querySelector('.mfa-enrolment')).toBeNull();
		expect(errors).not.toHaveBeenCalled();
	});

	it('a restarted owner starts its own enrolment exactly once; the old start is aborted', async () => {
		const auth = createAuthFeature();
		const { deps, beginEnrolments } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openMfaEnrolment' });
		mountRecipe(auth, store);
		await vi.waitFor(() => expect(beginEnrolments).toHaveLength(1));

		store.dispatch({ type: 'restartMfaEnrolment' });
		await vi.waitFor(() => expect(beginEnrolments).toHaveLength(2));
		expect(beginEnrolments[0]!.signal?.aborted).toBe(true);
		beginEnrolments[0]!.resolve(START);
		await settle();
		expect(beginEnrolments).toHaveLength(2);
		expect(store.state.mfaEnrolment?.status).toBe('starting');
	});
});

describe('managed MfaManagementPanel through FeatureViews', () => {
	it('waits for the account, routes each success and a visible re-authentication demand', async () => {
		const errors = vi.spyOn(console, 'error');
		const auth = createAuthFeature();
		const { deps, disableMfas, regenerateCodes } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		const seen = outcomes(store);
		store.dispatch({ type: 'openMfaManagement' });
		const { target, component } = mountRecipe(auth, store);

		// Unknown: no guess, and neither button.
		expect(target.textContent).toContain('Reading your account');
		expect(buttonNamed(target, 'Turn off')).toBeUndefined();
		component.observeAccount(true);
		flushSync();
		expect(buttonNamed(target, 'Turn off')).toBeDefined();

		buttonNamed(target, 'Get new recovery codes')!.click();
		await vi.waitFor(() => expect(regenerateCodes).toHaveLength(1));
		expect(buttonNamed(target, 'Turn off')!.disabled, 'one operation at a time').toBe(true);
		regenerateCodes[0]!.resolve({ recoveryCodes: CODES });
		await settle();
		expect(seen).toEqual([{ kind: 'recoveryCodesRegenerated' }]);
		expect(target.textContent).toContain('These replace your previous codes');
		buttonNamed(target, 'I have saved them')!.click();
		await tick();
		expect(target.textContent).not.toContain(CODES[0]!);

		buttonNamed(target, 'Turn off')!.click();
		await vi.waitFor(() => expect(disableMfas).toHaveLength(1));
		disableMfas[0]!.reject(NEEDS_PROOF);
		await settle();
		expect(seen.at(-1)).toEqual({ kind: 'reauthenticationRequired', operation: 'disable', methods: ['password'] });
		// Visible whether or not the parent routes it, and still actionable.
		const alert = target.querySelector('[role="alert"]');
		expect(alert?.getAttribute('data-error-code')).toBe('reauthentication_required');
		expect(alert?.textContent).toContain('Nothing was turned off.');
		expect(buttonNamed(target, 'Turn off')!.disabled).toBe(false);

		buttonNamed(target, 'Turn off')!.click();
		await vi.waitFor(() => expect(disableMfas).toHaveLength(2));
		disableMfas[1]!.resolve();
		await settle();
		expect(seen.at(-1)).toEqual({ kind: 'disabled' });
		expect(seen.filter((outcome) => outcome.kind === 'disabled')).toHaveLength(1);
		// The account still says `true` until re-read; the flow's own result wins.
		expect(target.textContent).toContain('Your recovery codes no longer work');
		expect(target.querySelector('[role="alert"]')).toBeNull();
		component.observeAccount(false);
		flushSync();
		expect(buttonNamed(target, 'Turn off')).toBeUndefined();
		expect(errors).not.toHaveBeenCalled();
	});

	it("an old subtree's click before the flush reaches its own retired view, not the replacement", async () => {
		const auth = createAuthFeature();
		const { deps, disableMfas, regenerateCodes } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openMfaManagement' });
		const { target } = mountRecipe(auth, store, true);
		const oldTurnOff = buttonNamed(target, 'Turn off')!;
		const oldRegenerate = buttonNamed(target, 'Get new recovery codes')!;

		// The replacement is live in the store, but the DOM has not flushed: the
		// old subtree is still attached and its handlers still run.
		store.dispatch({ type: 'restartMfaManagement' });
		expect(oldTurnOff.isConnected, 'still attached: a real click, not a detached no-op').toBe(true);
		oldTurnOff.click();
		oldRegenerate.click();
		flushSync();
		await settle();
		expect(oldTurnOff.isConnected).toBe(false);
		expect(disableMfas, 'the retired view dropped it').toHaveLength(0);
		expect(regenerateCodes).toHaveLength(0);
		expect(store.state.mfaManagement?.status).toBe('idle');
		expect(store.state.mfaOutcome).toBeNull();

		// Control: the replacement's own button does reach the replacement.
		buttonNamed(target, 'Turn off')!.click();
		await vi.waitFor(() => expect(disableMfas).toHaveLength(1));
	});
});

describe('MfaEnrolment kept mounted across owners', () => {
	it("an old form's input before the flush reaches its own retired view, not the new owner's form", async () => {
		const auth = createAuthFeature();
		const { deps, beginEnrolments } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openMfaEnrolment' });
		const { target } = mountRecipe(auth, store);
		await vi.waitFor(() => expect(beginEnrolments).toHaveLength(1));
		beginEnrolments[0]!.resolve(START);
		await settle();
		const oldCode = target.querySelector<HTMLInputElement>('input[name="code"]')!;

		store.dispatch({ type: 'restartMfaEnrolment' });
		expect(oldCode.isConnected, 'still attached before the flush').toBe(true);
		oldCode.value = '999999';
		oldCode.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		await settle();
		expect(store.state.mfaEnrolment?.form.data.code, 'the new owner heard the old form').toBe('');
	});

	it('the same component instance starts exactly once per owner as its view changes', async () => {
		const auth = createAuthFeature();
		const { deps, beginEnrolments } = controlledAuthDeps();
		const store = createAuthStore(auth, deps);
		store.dispatch({ type: 'openMfaEnrolment' });
		const first = auth.composition.bind(store, auth.mfaEnrolmentSlot)!;
		const target = document.createElement('div');
		document.body.appendChild(target);
		cleanups.push(() => target.remove());
		const swap = mount(MfaEnrolmentStoreSwap, { target, props: { initial: first } });
		cleanups.push(() => void unmount(swap));
		await vi.waitFor(() => expect(beginEnrolments).toHaveLength(1));
		first.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'code', value: '1' } });
		flushSync();
		await settle();
		expect(beginEnrolments, 'unrelated updates to the same owner start nothing').toHaveLength(1);

		store.dispatch({ type: 'restartMfaEnrolment' });
		flushSync();
		await settle();
		expect(beginEnrolments, 'the retired owner does not start again').toHaveLength(1);
		const second = auth.composition.bind(store, auth.mfaEnrolmentSlot)!;
		swap.show(second);
		await vi.waitFor(() => expect(beginEnrolments).toHaveLength(2));
		beginEnrolments[1]!.reject({ code: 'unknown', message: 'Setup is unavailable.' });
		await settle();
		expect(beginEnrolments, 'a failed start of the new owner is not repeated').toHaveLength(2);
	});
});

describe('standalone MfaEnrolment recovery panel', () => {
	/** A standalone store already `enrolled`, reached through its own actions. */
	function enrolledStore() {
		const store = createMfaEnrolmentStore(controlledAuthDeps().deps);
		store.dispatch({ type: 'enrolmentStarted', ...START });
		store.dispatch({ type: 'enrolmentConfirmed', recoveryCodes: CODES });
		cleanups.push(() => store.destroy());
		return store;
	}

	function mountStandalone(flowStore: ReturnType<typeof enrolledStore>, onDone?: () => void) {
		const target = document.createElement('div');
		document.body.appendChild(target);
		cleanups.push(() => target.remove());
		const component = mount(MfaEnrolment, { target, props: onDone ? { flowStore, onDone } : { flowStore } });
		cleanups.push(() => void unmount(component));
		return target;
	}

	it('offers no acknowledgement without onDone', () => {
		const store = enrolledStore();
		expect(store.state.status).toBe('enrolled');
		const target = mountStandalone(store);
		flushSync();
		for (const code of CODES) expect(target.textContent).toContain(code);
		expect(buttonNamed(target, 'I have saved them'), 'an inert button').toBeUndefined();
	});

	it('calls onDone once per click, and dispatches nothing', () => {
		const store = enrolledStore();
		const onDone = vi.fn();
		const seen: MfaEnrolmentAction[] = [];
		store.subscribeToActions?.((action) => void seen.push(action));
		const target = mountStandalone(store, onDone);
		flushSync();
		buttonNamed(target, 'I have saved them')!.click();
		expect(onDone).toHaveBeenCalledTimes(1);
		expect(seen.some((action) => action.type === 'recoveryCodesAcknowledged')).toBe(false);
	});
});
