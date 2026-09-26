/**
 * Managed magic-link request and sign-in views rendered by the server, through the same
 * `FeatureViews`/`FeatureOutlet` recipe the browser suite mounts.
 *
 * Asserts:
 * - Rendering does no browser work: mount effects do not run on the server, and
 *   no magic-link request or sign-in exchange is initiated.
 * - The token is NOT spent on mount or GET under SSR.
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
	createInitialMagicLinkRequestState,
	createInitialMagicLinkSignInState
} from '../../src/lib/flows/index.js';
import { controlledAuthDeps, settle } from '../fixtures/managed-auth-drivers.js';

function serve(auth: AuthFeature, initial: Partial<AuthFeatureState>) {
	const driver = controlledAuthDeps();
	const store = createStore({
		initialState: { ...auth.initialState(), ...initial },
		reducer: auth.composition.reducer,
		execution: auth.composition.execution,
		dependencies: driver.deps
	});
	const html = render(ManagedAuthRecipe, { props: { auth, store } }).body;
	return { html, store, driver };
}

function magicRequests(driver: ReturnType<typeof controlledAuthDeps>): number {
	return driver.requestMagicLinks.length + driver.signInWithMagicLinks.length;
}

describe('managed magic-link views under SSR', () => {
	it('renders magic-link request view without executing browser effects or requests', async () => {
		const auth = createAuthFeature();
		const { html, store, driver } = serve(auth, {
			magicLinkRequest: createInitialMagicLinkRequestState()
		});
		await settle();

		expect(html).toContain('Email me a link');
		expect(html).toContain('magic-request__form');
		expect(magicRequests(driver), 'no magic link requests during SSR render').toBe(0);
		expect(store.state.magicLinkRequest?.status).toBe('idle');
		store.destroy();
	});

	it('renders magic-link sign-in view with token WITHOUT spending the token', async () => {
		const auth = createAuthFeature();
		const { html, store, driver } = serve(auth, {
			magicLinkSignIn: createInitialMagicLinkSignInState('ssr-token-abc')
		});
		await settle();

		// Crucial SSR invariant: token MUST NOT be spent on GET/mount
		expect(magicRequests(driver), 'zero requests on SSR render').toBe(0);
		expect(html).toContain('Sign in');
		expect(html).toContain('Press the button to finish signing in on this device.');
		expect(store.state.magicLinkSignIn?.status).toBe('idle');
		store.destroy();
	});

	it('renders magic-link sign-in view for missing token under SSR', async () => {
		const auth = createAuthFeature();
		const { html, store, driver } = serve(auth, {
			magicLinkSignIn: createInitialMagicLinkSignInState(null)
		});
		await settle();

		expect(html).toContain('Nothing to sign in with');
		expect(html).toContain('Send me a new link');
		expect(magicRequests(driver)).toBe(0);
		store.destroy();
	});

	it('keeps two SSR request roots completely isolated', async () => {
		const auth = createAuthFeature();
		const rootOne = serve(auth, {
			magicLinkRequest: createInitialMagicLinkRequestState()
		});
		const rootTwo = serve(auth, {
			magicLinkSignIn: createInitialMagicLinkSignInState('root-two-token')
		});
		await settle();

		expect(rootOne.html).toContain('magic-request__form');
		expect(rootOne.html).not.toContain('magic-signin');

		expect(rootTwo.html).toContain('magic-signin');
		expect(rootTwo.html).not.toContain('magic-request__form');

		expect(magicRequests(rootOne.driver) + magicRequests(rootTwo.driver)).toBe(0);
		rootOne.store.destroy();
		rootTwo.store.destroy();
	});
});
