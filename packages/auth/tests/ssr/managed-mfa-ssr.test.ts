/**
 * Managed MFA settings views rendered by the server, through the same
 * `FeatureViews`/`FeatureOutlet` recipe the browser suite mounts.
 *
 * Two claims. Rendering does no work: the enrolment's mount effect never runs,
 * and no begin, confirm, disable or regenerate request is made — the stores
 * keep core's default of deferring effects on the server as well. And two
 * roots rendered in one process stay apart: each shows only its own secret or
 * codes.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { createStore } from '@composable-svelte/core';

import ManagedAuthRecipe from '../test-components/ManagedAuthRecipe.svelte';
import { createAuthFeature, type AuthFeature, type AuthFeatureState } from '../../src/lib/application/index.js';
import { createInitialMfaEnrolmentState, createInitialMfaManagementState } from '../../src/lib/flows/index.js';
import { controlledAuthDeps, settle } from '../fixtures/managed-auth-drivers.js';

function serve(auth: AuthFeature, initial: Partial<AuthFeatureState>, mfaEnabled?: boolean) {
	const driver = controlledAuthDeps();
	const store = createStore({
		initialState: { ...auth.initialState(), ...initial },
		reducer: auth.composition.reducer,
		execution: auth.composition.execution,
		dependencies: driver.deps
	});
	const html = render(ManagedAuthRecipe, { props: { auth, store, mfaEnabled } }).body;
	return { html, store, driver };
}

function requests(driver: ReturnType<typeof controlledAuthDeps>): number {
	return (
		driver.beginEnrolments.length +
		driver.confirmEnrolments.length +
		driver.disableMfas.length +
		driver.regenerateCodes.length
	);
}

describe('managed MFA views under SSR', () => {
	it('renders an idle enrolment and an unknown panel without starting anything', async () => {
		const auth = createAuthFeature();
		const { html, store, driver } = serve(auth, {
			mfaEnrolment: createInitialMfaEnrolmentState(),
			mfaManagement: createInitialMfaManagementState()
		});
		await settle();
		expect(html).toContain('Preparing your setup key');
		expect(html).toContain('Reading your account');
		expect(html).not.toContain('Turn off');
		expect(requests(driver), 'no MFA request during render').toBe(0);
		expect(store.state.mfaEnrolment?.status, 'no enrolmentRequested dispatched').toBe('idle');
		store.destroy();
	});

	it('performs no operation even when a server store is dispatched to', async () => {
		const auth = createAuthFeature();
		const { store, driver } = serve(auth, { mfaManagement: createInitialMfaManagementState() }, true);
		const view = auth.composition.bind(store, auth.mfaManagementSlot)!;
		view.dispatch({ type: 'regenerateRequested' });
		await settle();
		expect(requests(driver), 'server effects are deferred').toBe(0);
		store.destroy();
	});

	it('keeps two roots rendered in one process apart', async () => {
		const auth = createAuthFeature();
		const enrolling = {
			...createInitialMfaEnrolmentState(),
			status: 'confirming' as const,
			enrolmentId: 'enr-one',
			secret: 'SECRETONEAAAAAAA',
			otpauthUri: 'otpauth://totp/one'
		};
		const one = serve(auth, { mfaEnrolment: enrolling });
		const two = serve(
			auth,
			{ mfaManagement: { ...createInitialMfaManagementState(), recoveryCodes: ['two-code-1', 'two-code-2'] } },
			true
		);
		await settle();
		expect(one.html).toContain('SECRETONEAAAAAAA');
		expect(one.html).not.toContain('two-code-1');
		expect(one.html).not.toContain('Two-factor authentication is on');
		expect(two.html).toContain('two-code-1');
		expect(two.html).toContain('Turn off');
		expect(two.html).not.toContain('SECRETONEAAAAAAA');
		expect(requests(one.driver) + requests(two.driver)).toBe(0);
		one.store.destroy();
		two.store.destroy();
	});
});
