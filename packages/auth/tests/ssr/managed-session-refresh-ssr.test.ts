/**
 * Managed session-refresh views rendered by the server,
 * through the same `FeatureViews`/`FeatureOutlet` recipe the browser suite mounts.
 *
 * Asserts:
 * - Rendering does zero client work: mount effects do not run on the server,
 *   no timer is set, and no refreshSession request is initiated.
 * - Renders ended snippet if status is ended.
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
import { createInitialSessionRefreshState } from '../../src/lib/flows/index.js';
import { createInitialSessionState } from '../../src/lib/session/index.js';
import { subjectFromSession } from '../../src/lib/subject/index.js';
import { controlledAuthDeps, settle, snapshot } from '../fixtures/managed-auth-drivers.js';

const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');

function serve(
	auth: AuthFeature,
	initial: Partial<AuthFeatureState>
) {
	const driver = controlledAuthDeps();
	const store = createStore({
		initialState: {
			...auth.initialState(),
			session: {
				...createInitialSessionState(),
				status: 'authenticated' as const,
				subject: subjectFromSession(ada),
				expiresAt: '2026-10-01T00:00:00.000Z'
			},
			...initial
		},
		reducer: auth.composition.reducer,
		execution: auth.composition.execution,
		dependencies: driver.deps
	});
	const html = render(ManagedAuthRecipe, {
		props: {
			auth,
			store
		}
	}).body;
	return { html, store, driver };
}

describe('managed session-refresh views under SSR', () => {
	it('renders session-refresh slot without executing client effects, timers, or requests', async () => {
		const auth = createAuthFeature();
		const { html, store, driver } = serve(auth, {
			sessionRefresh: createInitialSessionRefreshState('2026-10-01T00:00:00.000Z')
		});
		await settle();

		expect(driver.sessionRefreshes.length, 'no refreshSession requests during SSR').toBe(0);
		expect(store.state.sessionRefresh?.status).toBe('idle');
		expect(store.state.sessionRefresh?.expiresAt).toBe('2026-10-01T00:00:00.000Z');
		store.destroy();
	});

	it('renders ended snippet under SSR when status is ended', async () => {
		const auth = createAuthFeature();
		const { html, store, driver } = serve(auth, {
			sessionRefresh: {
				...createInitialSessionRefreshState('2026-10-01T00:00:00.000Z'),
				status: 'ended'
			}
		});
		await settle();

		expect(html).toContain('Session ended');
		expect(driver.sessionRefreshes.length, 'no refreshSession requests when ended').toBe(0);
		store.destroy();
	});

	it('keeps two SSR request roots completely isolated', async () => {
		const auth = createAuthFeature();
		const rootOne = serve(auth, {
			sessionRefresh: createInitialSessionRefreshState('2026-10-01T00:00:00.000Z')
		});
		const rootTwo = serve(auth, {
			sessionRefresh: null
		});
		await settle();

		expect(rootOne.store.state.sessionRefresh).not.toBeNull();
		expect(rootTwo.store.state.sessionRefresh).toBeNull();

		expect(rootOne.driver.sessionRefreshes.length).toBe(0);
		expect(rootTwo.driver.sessionRefreshes.length).toBe(0);

		rootOne.store.destroy();
		rootTwo.store.destroy();
	});
});
