/**
 * Managed OAuth start and callback views rendered by the server, through the same
 * `FeatureViews`/`FeatureOutlet` recipe the browser suite mounts.
 *
 * Asserts:
 * - Rendering does no browser work: mount effects do not run on the server, and
 *   no begin, complete, link or redirect request is initiated.
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
	createInitialOAuthStartState,
	createInitialOAuthCallbackState,
	type OAuthCallbackParams
} from '../../src/lib/flows/index.js';
import { controlledAuthDeps, settle } from '../fixtures/managed-auth-drivers.js';

function serve(
	auth: AuthFeature,
	initial: Partial<AuthFeatureState>,
	callbackParams?: OAuthCallbackParams | null
) {
	const driver = controlledAuthDeps();
	const store = createStore({
		initialState: { ...auth.initialState(), ...initial },
		reducer: auth.composition.reducer,
		execution: auth.composition.execution,
		dependencies: driver.deps
	});
	const html = render(ManagedAuthRecipe, { props: { auth, store, callbackParams } }).body;
	return { html, store, driver };
}

function oauthRequests(driver: ReturnType<typeof controlledAuthDeps>): number {
	return (
		driver.beginOAuths.length +
		driver.completeOAuths.length +
		driver.linkOAuths.length +
		driver.redirects.length
	);
}

describe('managed OAuth views under SSR', () => {
	it('renders OAuth start view without executing browser effects or requests', async () => {
		const auth = createAuthFeature();
		const { html, store, driver } = serve(auth, {
			oauthStart: createInitialOAuthStartState()
		});
		await settle();

		expect(html).toContain('Or continue with');
		expect(html).toContain('GitHub');
		expect(oauthRequests(driver), 'no OAuth requests or redirects during SSR render').toBe(0);
		expect(store.state.oauthStart?.status).toBe('idle');
		store.destroy();
	});

	it('renders OAuth callback view without executing mount effects or requests', async () => {
		const auth = createAuthFeature();
		const { html, store, driver } = serve(
			auth,
			{
				oauthCallback: createInitialOAuthCallbackState()
			},
			{
				code: 'server_code',
				state: 'server_state',
				error: null,
				errorDescription: null
			}
		);
		await settle();

		expect(html).toContain('Finishing your sign-in');
		expect(oauthRequests(driver), 'no OAuth requests or redirects during SSR render').toBe(0);
		expect(store.state.oauthCallback?.status).toBe('idle');
		store.destroy();
	});

	it('keeps two SSR request roots completely isolated', async () => {
		const auth = createAuthFeature();
		const rootOne = serve(
			auth,
			{
				oauthStart: createInitialOAuthStartState()
			}
		);
		const rootTwo = serve(
			auth,
			{
				oauthCallback: {
					...createInitialOAuthCallbackState(),
					status: 'failed',
					error: { code: 'oauth_denied', message: 'User denied sign-in on root two' }
				}
			},
			{
				code: null,
				state: 'st',
				error: 'access_denied',
				errorDescription: null
			}
		);
		await settle();

		expect(rootOne.html).toContain('Or continue with');
		expect(rootOne.html).not.toContain('User denied sign-in on root two');

		expect(rootTwo.html).toContain('Sign-in cancelled');
		expect(rootTwo.html).toContain('User denied sign-in on root two');
		expect(rootTwo.html).not.toContain('Or continue with');

		expect(oauthRequests(rootOne.driver) + oauthRequests(rootTwo.driver)).toBe(0);
		rootOne.store.destroy();
		rootTwo.store.destroy();
	});
});
