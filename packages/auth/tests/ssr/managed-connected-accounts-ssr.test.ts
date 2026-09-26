/**
 * Managed account and connected-accounts views rendered on the server, through the same
 * `FeatureViews`/`FeatureOutlet` recipe the browser suite mounts.
 *
 * Three claims:
 * 1. Rendering does no work: account mount effect never runs during SSR, and no fetchAccount
 *    or unlinkOAuthProvider request is made — stores keep core's default of deferring effects.
 * 2. Truthful rendering: undefined account snapshot renders "Reading your account…" with no false
 *    empty state or false buttons.
 * 3. Server isolation: two roots rendered in one process stay isolated, each showing only its own
 *    snapshot without cross-root contamination.
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
	createInitialAccountState,
	createInitialConnectedAccountsState
} from '../../src/lib/flows/index.js';
import { createInitialSessionState } from '../../src/lib/session/index.js';
import { subjectFromSession } from '../../src/lib/subject/index.js';
import { controlledAuthDeps, settle, snapshot } from '../fixtures/managed-auth-drivers.js';

const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');
const bob = snapshot('bbbbbbbb-0000-0000-0000-000000000002', 'Bob');

function serve(auth: AuthFeature, initial: Partial<AuthFeatureState>) {
	const driver = controlledAuthDeps();
	const initialState: AuthFeatureState = {
		...auth.initialState(),
		session: { ...createInitialSessionState(), status: 'authenticated', subject: subjectFromSession(ada) },
		...initial
	};
	const store = createStore({
		initialState,
		reducer: auth.composition.reducer,
		execution: auth.composition.execution,
		dependencies: driver.deps
	});
	const html = render(ManagedAuthRecipe, { props: { auth, store } }).body;
	return { html, store, driver };
}

function requests(driver: ReturnType<typeof controlledAuthDeps>): number {
	return driver.fetchAccounts.length + driver.unlinkOAuths.length;
}

describe('managed account and connected-accounts under SSR', () => {
	it('renders truthful idle state without starting fetch or unlink requests', async () => {
		const auth = createAuthFeature();
		const { html, store, driver } = serve(auth, {
			account: createInitialAccountState(),
			connectedAccounts: createInitialConnectedAccountsState()
		});
		await settle();

		expect(html).toContain('Reading your account');
		expect(html).not.toContain('No accounts are connected');
		expect(html).not.toContain('Disconnect');
		expect(requests(driver), 'no network requests during SSR').toBe(0);
		expect(store.state.account?.status, 'accountRequested not dispatched on server').toBe('idle');
		expect(store.state.connectedAccounts?.status).toBe('idle');
		store.destroy();
	});

	it('performs no async operations even when a server store is dispatched to', async () => {
		const auth = createAuthFeature();
		const { store, driver } = serve(auth, {
			account: createInitialAccountState(),
			connectedAccounts: createInitialConnectedAccountsState()
		});
		const accView = auth.composition.bind(store, auth.accountSlot)!;
		accView.dispatch({ type: 'accountRequested' });
		const connView = auth.composition.bind(store, auth.connectedAccountsSlot)!;
		connView.dispatch({ type: 'unlinkRequested', provider: 'github' });
		await settle();

		expect(requests(driver), 'server effects are deferred').toBe(0);
		store.destroy();
	});

	it('keeps two roots rendered in one process apart', async () => {
		const auth = createAuthFeature();
		const one = serve(auth, {
			account: {
				...createInitialAccountState(),
				status: 'loaded',
				account: {
					email: 'ada@example.com',
					emailVerified: true,
					hasPassword: true,
					mfaEnabled: false,
					providers: ['github', 'google'],
					pendingEmail: null
				}
			},
			connectedAccounts: createInitialConnectedAccountsState()
		});

		const two = serve(auth, {
			account: {
				...createInitialAccountState(),
				status: 'loaded',
				account: {
					email: 'bob@example.com',
					emailVerified: true,
					hasPassword: false,
					mfaEnabled: false,
					providers: ['github'],
					pendingEmail: null
				}
			},
			connectedAccounts: createInitialConnectedAccountsState()
		});

		await settle();

		expect(one.html).toContain('ada@example.com');
		expect(one.html).toContain('Google');
		expect(one.html).not.toContain('bob@example.com');

		expect(two.html).toContain('bob@example.com');
		expect(two.html).not.toContain('ada@example.com');
		expect(two.html).not.toContain('<span class="connected-accounts__name">Google</span>');
		expect(two.html).toContain('Connect Google');

		expect(requests(one.driver) + requests(two.driver)).toBe(0);
		one.store.destroy();
		two.store.destroy();
	});
});
