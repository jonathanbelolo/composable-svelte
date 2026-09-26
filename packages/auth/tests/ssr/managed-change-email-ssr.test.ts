/**
 * Managed change-email request and change-email confirmation views rendered by the server,
 * through the same `FeatureViews`/`FeatureOutlet` recipe the browser suite mounts.
 *
 * Asserts:
 * - Rendering does no client work: mount effects do not run on the server, and no
 *   requestEmailChange, resendEmailChange, or confirmEmailChange request is initiated.
 * - Confirmation token is NOT consumed/spent on mount or GET under SSR.
 * - Two roots rendered in one process remain completely isolated.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { createStore } from '@composable-svelte/core';

import ManagedAuthRecipe from '../test-components/ManagedAuthRecipe.svelte';
import {
	createAuthFeature,
	type AuthFeature,
	type AuthFeatureState
} from '../../src/lib/application/index.js';
import {
	createInitialChangeEmailState,
	createInitialChangeEmailConfirmState
} from '../../src/lib/flows/index.js';
import { createInitialSessionState } from '../../src/lib/session/index.js';
import { subjectFromSession } from '../../src/lib/subject/index.js';
import { controlledAuthDeps, settle, snapshot } from '../fixtures/managed-auth-drivers.js';

const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');

function serve(
	auth: AuthFeature,
	initial: Partial<AuthFeatureState>,
	options: { changeEmailConfirmToken?: string | null | undefined } = {}
) {
	const driver = controlledAuthDeps();
	const store = createStore({
		initialState: {
			...auth.initialState(),
			session: { ...createInitialSessionState(), status: 'authenticated' as const, subject: subjectFromSession(ada) },
			...initial
		},
		reducer: auth.composition.reducer,
		execution: auth.composition.execution,
		dependencies: driver.deps
	});
	const html = render(ManagedAuthRecipe, {
		props: {
			auth,
			store,
			changeEmailConfirmToken: options.changeEmailConfirmToken
		}
	}).body;
	return { html, store, driver };
}

function emailChangeRequests(driver: ReturnType<typeof controlledAuthDeps>): number {
	return driver.requestEmailChanges.length + driver.resendEmailChanges.length + driver.confirmEmailChanges.length;
}

describe('managed change-email views under SSR', () => {
	it('renders change-email request view without executing client effects or requests', async () => {
		const auth = createAuthFeature();
		const { html, store, driver } = serve(auth, {
			changeEmail: createInitialChangeEmailState()
		});
		await settle();

		expect(html).toContain('New email address');
		expect(html).toContain('change-email__form');
		expect(html).toContain('Send confirmation link');
		expect(emailChangeRequests(driver), 'no email change requests during SSR render').toBe(0);
		expect(store.state.changeEmail?.status).toBe('idle');
		store.destroy();
	});

	it('renders email change confirmation view with token WITHOUT consuming the token', async () => {
		const auth = createAuthFeature();
		const { html, store, driver } = serve(
			auth,
			{
				changeEmailConfirm: createInitialChangeEmailConfirmState('ssr-token-abc')
			},
			{ changeEmailConfirmToken: 'ssr-token-abc' }
		);
		await settle();

		// Crucial SSR invariant: token MUST NOT be confirmed/spent on GET/mount during SSR
		expect(emailChangeRequests(driver), 'zero requests on SSR render').toBe(0);
		expect(html).toContain('Confirming your new address');
		expect(html).toContain('email-change-confirm');
		expect(store.state.changeEmailConfirm?.status).toBe('idle');
		store.destroy();
	});

	it('renders email change confirmation view for missing token under SSR', async () => {
		const auth = createAuthFeature();
		const { html, store, driver } = serve(
			auth,
			{
				changeEmailConfirm: createInitialChangeEmailConfirmState(null)
			},
			{ changeEmailConfirmToken: null }
		);
		await settle();

		expect(html).toContain('This page needs the link from the email we sent you.');
		expect(emailChangeRequests(driver)).toBe(0);
		store.destroy();
	});

	it('keeps two SSR request roots completely isolated', async () => {
		const auth = createAuthFeature();
		const rootOne = serve(auth, {
			changeEmail: createInitialChangeEmailState()
		});
		const rootTwo = serve(
			auth,
			{
				changeEmailConfirm: createInitialChangeEmailConfirmState('root-two-token')
			},
			{ changeEmailConfirmToken: 'root-two-token' }
		);
		await settle();

		expect(rootOne.html).toContain('change-email__form');
		expect(rootOne.html).not.toContain('email-change-confirm');

		expect(rootTwo.html).toContain('email-change-confirm');
		expect(rootTwo.html).not.toContain('change-email__form');

		expect(emailChangeRequests(rootOne.driver)).toBe(0);
		expect(emailChangeRequests(rootTwo.driver)).toBe(0);

		rootOne.store.destroy();
		rootTwo.store.destroy();
	});
});
