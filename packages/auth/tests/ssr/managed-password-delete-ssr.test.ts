/**
 * Managed change-password and delete-account views rendered by the server,
 * through the same `FeatureViews`/`FeatureOutlet` recipe the browser suite mounts.
 *
 * Asserts:
 * - Rendering does no client work: mount effects do not run on the server, and no
 *   changePassword or deleteAccount request is initiated.
 * - DeleteAccountPanel renders idle state without confirmation or deletion work.
 * - ChangePasswordForm renders input fields without submission.
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
	createInitialChangePasswordState,
	createInitialDeleteAccountState
} from '../../src/lib/flows/index.js';
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
			store
		}
	}).body;
	return { html, store, driver };
}

describe('managed change-password and delete-account views under SSR', () => {
	it('renders change-password view without executing client effects or requests', async () => {
		const auth = createAuthFeature();
		const { html, store, driver } = serve(auth, {
			changePassword: createInitialChangePasswordState()
		});
		await settle();

		expect(html).toContain('change-password');
		expect(html).toContain('New password');
		expect(html).toContain('Confirm new password');
		expect(html).toContain('Change password');
		expect(driver.changePasswords.length, 'no changePassword requests during SSR').toBe(0);
		expect(store.state.changePassword?.status).toBe('idle');
		store.destroy();
	});

	it('renders delete-account panel in idle state without executing requests', async () => {
		const auth = createAuthFeature();
		const { html, store, driver } = serve(auth, {
			deleteAccount: createInitialDeleteAccountState()
		});
		await settle();

		expect(html).toContain('delete-account');
		expect(html).toContain('Delete your account');
		expect(html).toContain('Delete my account');
		expect(html).not.toContain('Are you sure? There is no way back from this.');
		expect(driver.deleteAccounts.length, 'no deleteAccount requests during SSR').toBe(0);
		expect(store.state.deleteAccount?.status).toBe('idle');
		store.destroy();
	});

	it('renders delete-account panel in confirming state under SSR without deleting', async () => {
		const auth = createAuthFeature();
		const { html, store, driver } = serve(auth, {
			deleteAccount: { ...createInitialDeleteAccountState(), status: 'confirming' }
		});
		await settle();

		expect(html).toContain('Are you sure? There is no way back from this.');
		expect(html).toContain('Delete permanently');
		expect(html).toContain('Keep my account');
		expect(driver.deleteAccounts.length, 'confirming SSR state must not trigger delete').toBe(0);
		store.destroy();
	});

	it('keeps two SSR request roots completely isolated', async () => {
		const auth = createAuthFeature();
		const rootOne = serve(auth, {
			changePassword: createInitialChangePasswordState()
		});
		const rootTwo = serve(auth, {
			deleteAccount: createInitialDeleteAccountState()
		});
		await settle();

		expect(rootOne.html).toContain('change-password');
		expect(rootOne.html).not.toContain('delete-account');

		expect(rootTwo.html).toContain('delete-account');
		expect(rootTwo.html).not.toContain('change-password');

		expect(rootOne.driver.changePasswords.length).toBe(0);
		expect(rootOne.driver.deleteAccounts.length).toBe(0);
		expect(rootTwo.driver.changePasswords.length).toBe(0);
		expect(rootTwo.driver.deleteAccounts.length).toBe(0);

		rootOne.store.destroy();
		rootTwo.store.destroy();
	});
});
