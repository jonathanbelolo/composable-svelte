/**
 * Batch B auth proof: session + flows composed as a managed parent, headless.
 *
 * `LoginForm` hands a finished sign-in to the session store in a `$effect`,
 * and branches to MFA through the `onMfaRequired` callback. Neither runs
 * without a mounted component. This suite shows the same outcomes reached by
 * a parent reducer consuming lifted child business actions — using existing
 * core (`ManagedIntegrationBuilder`, `optionalSlot`, `createStore`) and the
 * package's existing reducers, with nothing mounted and no callbacks.
 *
 * Two kinds of input are kept apart throughout:
 *
 * - **Owner-stamped effect feedback.** A flow's request runs as an effect
 *   stamped with that flow's owner. Retire the owner (replace or remove the
 *   flow) and the runtime aborts the request and drops its dispatch before
 *   any reducer sees it — it never appears in `subscribeToActions`.
 * - **Manually dispatched domain actions.** `store.dispatch(...)` carries root
 *   authority. Ownership does not filter it; it is always reduced, and only the
 *   reducers' own guards (an empty slot, MFA's attempt correlation, the
 *   session's `loggingOut` refusal) decide what it may change.
 *
 * Every "never reduced" assertion is paired, in the same test, with a positive
 * control showing the recorder does see that action shape when it is live (or
 * when dispatched with root authority), so an empty list means dropped rather
 * than never looked for.
 *
 * Scope: a proof for the T2 decision, not a migration. `LoginForm` and the
 * package's public API are unchanged.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createStore, Effect, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, optionalSlot } from '@composable-svelte/core/application';

import {
	createInitialLoginState,
	createInitialMfaChallengeState,
	loginReducer
} from '../src/lib/flows/index.js';
import {
	createInitialSessionState,
	sessionReducer,
	type SessionAction,
	type SessionDependencies,
	type SessionState
} from '../src/lib/session/index.js';
import { subjectFromSession } from '../src/lib/subject/index.js';
import {
	authShell,
	authShellCore,
	createAuthShellCore,
	createInitialAuthShellState,
	loginSlot,
	mfaSlot,
	type AuthShellAction,
	type AuthShellDependencies,
	type AuthShellState
} from './fixtures/managed-auth-shell.js';
import {
	controlledAuthDeps,
	presented,
	recordActions,
	settle,
	snapshot,
	submitCode,
	submitLogin,
	type AuthShellStore
} from './fixtures/managed-auth-drivers.js';

const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');
const bob = snapshot('bbbbbbbb-0000-0000-0000-000000000002', 'Bob');
const mallory = snapshot('dddddddd-0000-0000-0000-000000000004', 'Mallory');
const invalidCredentials = { code: 'invalid_credentials', message: 'Wrong email or password.' };
const mfaRequired = (challengeId: string) => ({
	code: 'mfa_required',
	message: 'Enter your second factor.',
	challengeId,
	methods: ['totp']
});

const stores: AuthShellStore[] = [];
afterEach(() => {
	for (const store of stores.splice(0)) store.destroy();
});

function createShell(deps: AuthShellDependencies, initial: Partial<AuthShellState> = {}): AuthShellStore {
	const store = createStore({
		initialState: createInitialAuthShellState(initial),
		reducer: authShell.reducer,
		execution: authShell.execution,
		dependencies: deps
	});
	stores.push(store);
	return store;
}

function subjectId(state: AuthShellState): string | null {
	return state.session.subject.kind === 'authenticated' ? state.session.subject.id : null;
}

function signedInAs(who: typeof ada): Partial<AuthShellState> {
	return {
		session: { ...createInitialSessionState(), status: 'authenticated', subject: subjectFromSession(who) },
		route: 'home'
	};
}

describe('headless sign-in through the parent', () => {
	it('establishes the session and routes home from the lifted loginSucceeded', async () => {
		const { deps, logins } = controlledAuthDeps();
		const store = createShell(deps);
		const actions = recordActions(store);

		store.dispatch({ type: 'signInOpened' });
		const request = await submitLogin(store, logins);
		expect(request.credentials).toEqual({
			email: 'ada@example.com',
			password: 'correct-horse',
			rememberMe: false
		});
		expect(store.state.login?.status).toBe('submitting');
		expect(store.state.session.status, 'nothing hands over before the result').toBe('unresolved');

		request.resolve(ada);
		await settle();

		// The effect's dispatch reached the parent as a lifted child action…
		expect(presented(actions, 'login', 'loginSucceeded')).toHaveLength(1);
		// …and the parent core, not a component, did the handoff and navigation.
		expect(store.state.session.status).toBe('authenticated');
		expect(subjectId(store.state)).toBe(ada.subject_id);
		expect(store.state.login, 'the finished flow is retired').toBeNull();
		expect(store.state.route).toBe('home');
		expect(authShell.bind(store, loginSlot)).toBeUndefined();
	});

	it('branches to MFA on mfa_required and establishes the session on challengeSucceeded', async () => {
		const { deps, logins, challenges } = controlledAuthDeps();
		const store = createShell(deps);

		store.dispatch({ type: 'signInOpened' });
		const login = await submitLogin(store, logins);
		login.reject({
			code: 'mfa_required',
			message: 'Enter your second factor.',
			challengeId: 'chal-1',
			methods: ['recovery_code', 'totp']
		});
		await settle();

		// What `onMfaRequired` carried, now parent state — no callback involved.
		expect(store.state.login).toBeNull();
		expect(store.state.route).toBe('mfa');
		expect(store.state.mfa?.challengeId).toBe('chal-1');
		expect(store.state.mfa?.methods).toEqual(['recovery_code', 'totp']);
		expect(store.state.mfa?.method, 'prefers the authenticator').toBe('totp');
		expect(store.state.session.status).toBe('unresolved');

		const challenge = await submitCode(store, challenges, '123456');
		expect([challenge.challengeId, challenge.code, challenge.method]).toEqual(['chal-1', '123456', 'totp']);

		challenge.resolve(ada);
		await settle();

		expect(store.state.session.status).toBe('authenticated');
		expect(subjectId(store.state)).toBe(ada.subject_id);
		expect(store.state.mfa).toBeNull();
		expect(store.state.route).toBe('home');
	});
});

describe('opening sign-in over a live flow', () => {
	it('open → submit → open: the second open is refused, and the late success is the attempt on screen', async () => {
		const { deps, logins } = controlledAuthDeps();
		const store = createShell(deps);
		const actions = recordActions(store);

		store.dispatch({ type: 'signInOpened' });
		const request = await submitLogin(store, logins, 'ada@example.com');
		const view = authShell.bind(store, loginSlot)!;
		const before = store.state;

		// Refused rather than a reset: rewriting the slot in place would show a
		// fresh empty form while the old owner — and this request — stayed live
		// and could land its success into it.
		store.dispatch({ type: 'signInOpened' });
		expect(store.state, 'a refused open changes nothing').toBe(before);
		expect(request.signal?.aborted).toBe(false);
		expect(authShell.bind(store, loginSlot), 'same owner, same view').toBe(view);
		expect(store.state.login?.form.data.email).toBe('ada@example.com');

		request.resolve(ada);
		await settle();
		expect(presented(actions, 'login', 'loginSucceeded')).toHaveLength(1);
		expect(subjectId(store.state), 'the account that was on screen').toBe(ada.subject_id);
		expect(store.state.route).toBe('home');
	});

	it('open over a live MFA step is refused; restart retires it, so the old challenge result cannot reach a same-ID successor', async () => {
		const { deps, logins, challenges } = controlledAuthDeps();
		const store = createShell(deps);
		const actions = recordActions(store);

		store.dispatch({ type: 'signInOpened' });
		(await submitLogin(store, logins)).reject(mfaRequired('chal-1'));
		await settle();
		const oldChallenge = await submitCode(store, challenges, '111111');

		store.dispatch({ type: 'signInOpened' });
		expect(store.state.route, 'the open is refused while MFA is live').toBe('mfa');
		expect(oldChallenge.signal?.aborted).toBe(false);

		store.dispatch({ type: 'signInRestarted' });
		expect(oldChallenge.signal?.aborted, 'restart retires the MFA owner').toBe(true);
		expect(store.state.mfa).toBeNull();
		expect(store.state.login?.status).toBe('idle');

		// The server issues the same challenge ID again, and the new flow is
		// submitting its first attempt — so the old result's `attempt` (1) matches
		// the new flow's and MFA's own correlation cannot tell them apart. Only
		// the retired owner does.
		(await submitLogin(store, logins)).reject(mfaRequired('chal-1'));
		await settle();
		const newChallenge = await submitCode(store, challenges, '222222');
		expect(store.state.mfa?.attempt).toBe(1);
		expect(store.state.mfa?.status).toBe('submitting');

		oldChallenge.resolve(mallory);
		await settle();
		expect(presented(actions, 'mfa', 'challengeSucceeded'), 'the old result is never reduced').toHaveLength(0);
		expect(store.state.session.status).toBe('unresolved');
		expect(store.state.mfa?.status).toBe('submitting');

		newChallenge.resolve(ada);
		await settle();
		expect(presented(actions, 'mfa', 'challengeSucceeded'), 'positive control').toHaveLength(1);
		expect(subjectId(store.state)).toBe(ada.subject_id);
	});

	it('the MFA branch over an occupied MFA slot replaces the old challenge owner', async () => {
		// Not reachable through the shell's own actions (open is refused while MFA
		// is live, restart and the branch each clear the other slot); reachable
		// from a hydrated or hand-built state. The branch still must not rewrite
		// an occupied slot under a live owner.
		const { deps, logins, challenges } = controlledAuthDeps();
		const store = createShell(deps, {
			login: createInitialLoginState(),
			mfa: createInitialMfaChallengeState('chal-1', ['totp']),
			route: 'mfa'
		});
		const actions = recordActions(store);

		const oldChallenge = await submitCode(store, challenges, '111111');
		(await submitLogin(store, logins)).reject(mfaRequired('chal-1'));
		await settle();
		expect(oldChallenge.signal?.aborted, 'the branch replaced the MFA owner').toBe(true);
		expect(store.state.mfa?.status).toBe('idle');

		const newChallenge = await submitCode(store, challenges, '222222');
		oldChallenge.resolve(mallory);
		await settle();
		expect(presented(actions, 'mfa', 'challengeSucceeded')).toHaveLength(0);

		newChallenge.resolve(ada);
		await settle();
		expect(presented(actions, 'mfa', 'challengeSucceeded'), 'positive control').toHaveLength(1);
		expect(subjectId(store.state)).toBe(ada.subject_id);
	});

	it('login input while both slots are live leaves the MFA owner and its verification alone; only the branch replaces it', async () => {
		// Same hydrated shape as above. `replaceOn` must fire when the parent
		// writes a fresh challenge, not on every `login` action: a keystroke in
		// the sign-in form is not a new challenge.
		const { deps, logins, challenges } = controlledAuthDeps();
		const store = createShell(deps, {
			login: createInitialLoginState(),
			mfa: createInitialMfaChallengeState('chal-1', ['totp']),
			route: 'mfa'
		});
		const actions = recordActions(store);

		const oldChallenge = await submitCode(store, challenges, '111111');
		const mfaView = authShell.bind(store, mfaSlot)!;

		// Typing, submitting, the request starting, and a plain failure: every
		// login action short of the MFA branch.
		const failed = await submitLogin(store, logins, 'bob@example.com', 'wrong-horse');
		failed.reject(invalidCredentials);
		await settle();
		expect(store.state.login?.error?.code).toBe('invalid_credentials');
		const retyped = await submitLogin(store, logins, 'bob@example.com', 'correct-horse');
		expect(oldChallenge.signal?.aborted, 'login input did not retire the challenge').toBe(false);
		expect(authShell.bind(store, mfaSlot), 'the same MFA owner').toBe(mfaView);
		expect(mfaView.state?.status, 'the captured view is live').toBe('submitting');

		// The branch writes a fresh challenge over the live one: now it is replaced.
		retyped.reject(mfaRequired('chal-2'));
		await settle();
		expect(oldChallenge.signal?.aborted, 'the branch retired the challenge').toBe(true);
		expect(mfaView.state, 'the captured view retired with its owner').toBeUndefined();
		expect(store.state.mfa?.challengeId).toBe('chal-2');
		expect(store.state.mfa?.status).toBe('idle');

		// The old verification answers anyway: dropped. The new one lands.
		oldChallenge.resolve(mallory);
		await settle();
		expect(presented(actions, 'mfa', 'challengeSucceeded')).toHaveLength(0);
		expect(store.state.session.status).toBe('unresolved');

		const newChallenge = await submitCode(store, challenges, '222222');
		expect(newChallenge.challengeId).toBe('chal-2');
		newChallenge.resolve(bob);
		await settle();
		expect(presented(actions, 'mfa', 'challengeSucceeded'), 'positive control').toHaveLength(1);
		expect(subjectId(store.state)).toBe(bob.subject_id);
	});
});

describe('replacing or removing a flow while its request is in flight', () => {
	it('replacement retires the old owner: its request is aborted and its late result is dropped', async () => {
		const { deps, logins } = controlledAuthDeps();
		const store = createShell(deps);
		const actions = recordActions(store);

		store.dispatch({ type: 'signInOpened' });
		const first = await submitLogin(store, logins, 'ada@example.com');
		const firstView = authShell.bind(store, loginSlot)!;

		store.dispatch({ type: 'signInRestarted' });
		expect(first.signal?.aborted, 'the retired owner’s request is cancelled').toBe(true);
		expect(firstView.state, 'the captured view is retired with its owner').toBeUndefined();
		expect(store.state.login?.status).toBe('idle');
		expect(store.state.login?.form.data.email).toBe('');

		// The transport ignored the abort and answered anyway.
		first.resolve(mallory);
		await settle();
		expect(presented(actions, 'login', 'loginSucceeded'), 'never reduced').toHaveLength(0);
		expect(store.state.session.status).toBe('unresolved');
		expect(store.state.login?.status).toBe('idle');
		expect(store.state.route).toBe('signIn');

		// A dispatch through the retired view is dropped the same way…
		const before = actions.length;
		firstView.dispatch({ type: 'errorDismissed' });
		await settle();
		expect(actions).toHaveLength(before);
		// …while the same dispatch through the live view is reduced.
		authShell.bind(store, loginSlot)!.dispatch({ type: 'errorDismissed' });
		expect(actions, 'positive control').toHaveLength(before + 1);

		// The replacement is fully live.
		const second = await submitLogin(store, logins, 'bob@example.com');
		second.resolve(bob);
		await settle();
		expect(presented(actions, 'login', 'loginSucceeded'), 'positive control').toHaveLength(1);
		expect(subjectId(store.state)).toBe(bob.subject_id);
		expect(store.state.route).toBe('home');
	});

	it('removal by the parent drops the late login result and leaves the session alone', async () => {
		const { deps, logins } = controlledAuthDeps();
		const store = createShell(deps);
		const actions = recordActions(store);

		store.dispatch({ type: 'signInOpened' });
		const request = await submitLogin(store, logins);
		store.dispatch({ type: 'signInCancelled' });
		expect(request.signal?.aborted).toBe(true);
		expect(store.state.login).toBeNull();

		request.resolve(mallory);
		await settle();
		expect(presented(actions, 'login', 'loginSucceeded')).toHaveLength(0);
		expect(store.state.session.status).toBe('unresolved');
		expect(store.state.route).toBe('signIn');

		// Positive control: a flow opened afterwards has a new, live owner.
		store.dispatch({ type: 'signInOpened' });
		(await submitLogin(store, logins, 'bob@example.com')).resolve(bob);
		await settle();
		expect(presented(actions, 'login', 'loginSucceeded')).toHaveLength(1);
		expect(subjectId(store.state)).toBe(bob.subject_id);
	});

	it('cancelling a switch of account while signed in returns home, with the account unchanged', async () => {
		const { deps, logins } = controlledAuthDeps();
		const store = createShell(deps, signedInAs(ada));

		store.dispatch({ type: 'signInOpened' });
		expect(store.state.route).toBe('signIn');
		const request = await submitLogin(store, logins, 'bob@example.com');

		store.dispatch({ type: 'signInCancelled' });
		expect(request.signal?.aborted).toBe(true);
		expect(store.state.login).toBeNull();
		expect(store.state.route, 'no sign-in on screen, and Ada is still signed in').toBe('home');
		expect(subjectId(store.state)).toBe(ada.subject_id);
	});

	it('cancelling the MFA step while signed out leaves the MFA route for sign-in', () => {
		const { deps } = controlledAuthDeps();
		const store = createShell(deps, {
			mfa: createInitialMfaChallengeState('chal-1', ['totp']),
			route: 'mfa'
		});

		store.dispatch({ type: 'signInCancelled' });
		expect(store.state.mfa).toBeNull();
		expect(store.state.route, 'not a route whose flow was just removed').toBe('signIn');
	});

	it('dismissal through a login view returns to the still authenticated account', async () => {
		const { deps, logins } = controlledAuthDeps();
		const store = createShell(deps, signedInAs(ada));

		store.dispatch({ type: 'signInOpened' });
		const request = await submitLogin(store, logins, 'bob@example.com');
		expect(store.state.route).toBe('signIn');
		authShell.bind(store, loginSlot)!.dismiss();
		expect(request.signal?.aborted).toBe(true);
		expect(store.state.login).toBeNull();
		expect(store.state.route, 'no login screen remains').toBe('home');
		expect(subjectId(store.state)).toBe(ada.subject_id);

		request.resolve(bob);
		await settle();
		expect(subjectId(store.state)).toBe(ada.subject_id);
		expect(store.state.route).toBe('home');
	});

	it('dismissal through the MFA presentation view drops the late challenge result', async () => {
		const { deps, challenges } = controlledAuthDeps();
		const store = createShell(deps, {
			mfa: createInitialMfaChallengeState('chal-1', ['totp']),
			route: 'mfa'
		});
		const actions = recordActions(store);

		const request = await submitCode(store, challenges, '123456');
		authShell.bind(store, mfaSlot)!.dismiss();
		expect(request.signal?.aborted).toBe(true);
		expect(store.state.mfa).toBeNull();
		expect(store.state.route, 'no MFA screen remains').toBe('signIn');

		request.resolve(mallory);
		await settle();
		expect(presented(actions, 'mfa', 'challengeSucceeded')).toHaveLength(0);
		expect(store.state.session.status).toBe('unresolved');
		expect(store.state.route).toBe('signIn');

		// Positive control: the same shape, dispatched with root authority, is
		// recorded — and then ignored by the empty slot and the parent.
		store.dispatch(mfaSlot.wrap({ type: 'challengeSucceeded', session: mallory, attempt: 1 }));
		expect(presented(actions, 'mfa', 'challengeSucceeded')).toHaveLength(1);
		expect(store.state.session.status).toBe('unresolved');
	});
});

describe('session feedback and parent navigation', () => {
	it('keeps home during session revalidation and ignores stale resolution feedback', async () => {
		const { deps } = controlledAuthDeps();
		const store = createShell({ ...deps, fetchSession: async () => ada }, signedInAs(ada));

		store.dispatch({ type: 'session', action: { type: 'resolveSession' } });
		expect(store.state.session.status).toBe('resolving');
		expect(store.state.route, 'request initiation is not settled feedback').toBe('home');
		const currentEpoch = store.state.session.epoch;
		store.dispatch({
			type: 'session',
			action: { type: 'sessionResolved', session: null, epoch: currentEpoch - 1 }
		});
		expect(store.state.session.status, 'stale feedback is refused').toBe('resolving');
		expect(store.state.route, 'stale feedback cannot navigate').toBe('home');

		await settle();
		expect(store.state.session.status).toBe('authenticated');
		expect(store.state.route).toBe('home');
	});

	it('routes home to sign-in immediately when logout starts', () => {
		const { deps, logouts } = controlledAuthDeps();
		const store = createShell(deps, signedInAs(ada));

		store.dispatch({ type: 'session', action: { type: 'logout' } });
		expect(store.state.session.status).toBe('loggingOut');
		expect(logouts).toHaveLength(1);
		expect(store.state.route).toBe('signIn');
	});

	it('routes an authenticated session resolution home without a mounted flow', async () => {
		const { deps } = controlledAuthDeps();
		const store = createShell({ ...deps, fetchSession: async () => ada });

		store.dispatch({ type: 'session', action: { type: 'resolveSession' } });
		expect(store.state.route).toBe('signIn');
		await settle();
		expect(store.state.session.status).toBe('authenticated');
		expect(subjectId(store.state)).toBe(ada.subject_id);
		expect(store.state.route).toBe('home');
	});

	it('keeps a live login route during resolution, then follows the session after dismissal', async () => {
		const { deps } = controlledAuthDeps();
		const store = createShell({ ...deps, fetchSession: async () => ada });

		store.dispatch({ type: 'signInOpened' });
		store.dispatch({ type: 'session', action: { type: 'resolveSession' } });
		await settle();
		expect(subjectId(store.state)).toBe(ada.subject_id);
		expect(store.state.login).not.toBeNull();
		expect(store.state.route).toBe('signIn');

		authShell.bind(store, loginSlot)!.dismiss();
		expect(store.state.login).toBeNull();
		expect(store.state.route).toBe('home');
	});
});

describe('dismissal while another flow survives', () => {
	it('shows the surviving login when MFA is dismissed', () => {
		const { deps } = controlledAuthDeps();
		const store = createShell(deps, {
			login: createInitialLoginState(),
			mfa: createInitialMfaChallengeState('chal-1', ['totp']),
			route: 'mfa'
		});

		authShell.bind(store, mfaSlot)!.dismiss();
		expect(store.state.mfa).toBeNull();
		expect(store.state.login).not.toBeNull();
		expect(store.state.route).toBe('signIn');
	});

	it('keeps the surviving MFA route when login is dismissed', () => {
		const { deps } = controlledAuthDeps();
		const store = createShell(deps, {
			login: createInitialLoginState(),
			mfa: createInitialMfaChallengeState('chal-1', ['totp']),
			route: 'mfa'
		});

		authShell.bind(store, loginSlot)!.dismiss();
		expect(store.state.login).toBeNull();
		expect(store.state.mfa).not.toBeNull();
		expect(store.state.route).toBe('mfa');
	});
});

describe('overlapping sign-in requests within one live flow', () => {
	// A second submit while the first request is in flight. The flow is the
	// same, its owner is live throughout, so ownership plays no part here:
	// `loginReducer` runs every request under one effect ID, and starting the
	// second cancels the first. The transport below ignores the abort and
	// answers anyway. This is effect feedback only — a manual root dispatch of
	// the same shape is not filtered (see `a manual loginSucceeded into a live
	// flow is accepted`), and nothing here says what the backend does with two
	// requests in flight.
	const lateResults = [
		['success', (request: { resolve(value: typeof mallory): void }) => request.resolve(mallory)],
		['mfa_required', (request: { reject(reason: unknown): void }) => request.reject(mfaRequired('chal-old'))]
	] as const;

	it.each(lateResults)('the first request’s late %s is dropped once the second starts; the second lands', async (_, answer) => {
		const { deps, logins } = controlledAuthDeps();
		const store = createShell(deps);
		const actions = recordActions(store);

		store.dispatch({ type: 'signInOpened' });
		const view = authShell.bind(store, loginSlot)!;
		const first = await submitLogin(store, logins, 'mallory@example.com');
		const second = await submitLogin(store, logins, 'bob@example.com');
		expect(authShell.bind(store, loginSlot), 'one live owner throughout').toBe(view);
		expect(view.state?.status).toBe('submitting');
		expect(first.signal?.aborted, 'the second request cancelled the first').toBe(true);
		expect(second.signal?.aborted).toBe(false);
		expect(second.credentials.email).toBe('bob@example.com');

		answer(first);
		await settle();
		expect(presented(actions, 'login', 'loginSucceeded'), 'the old success is never reduced').toHaveLength(0);
		expect(presented(actions, 'login', 'loginFailed'), 'nor the old mfa_required').toHaveLength(0);
		expect(store.state.login?.status).toBe('submitting');
		expect(store.state.mfa).toBeNull();
		expect(store.state.route).toBe('signIn');
		expect(store.state.session.status).toBe('unresolved');

		second.resolve(bob);
		await settle();
		expect(presented(actions, 'login', 'loginSucceeded'), 'positive control').toHaveLength(1);
		expect(subjectId(store.state)).toBe(bob.subject_id);
		expect(store.state.route).toBe('home');
	});
});

describe('logout and an in-flight sign-in', () => {
	// Parent policy: `logout` removes both flows, retiring their owners. Both
	// orderings of the late result are dropped by ownership, before any reducer.
	// Without the policy the second ordering re-authenticates: `sessionReducer`
	// refuses `sessionEstablished` only while `loggingOut`, and after `loggedOut`
	// the session is `anonymous`, which accepts it.

	it('a result landing during loggingOut is dropped: the flow was retired by the logout', async () => {
		const { deps, logins, logouts } = controlledAuthDeps();
		const store = createShell(deps, signedInAs(ada));
		const actions = recordActions(store);
		const subjects: (string | null)[] = [];
		store.subscribe((state) => {
			subjects.push(subjectId(state));
		});

		// Switch account: a sign-in as Bob is in flight when Ada signs out.
		store.dispatch({ type: 'signInOpened' });
		const login = await submitLogin(store, logins, 'bob@example.com');
		store.dispatch({ type: 'session', action: { type: 'logout' } });
		expect(store.state.session.status).toBe('loggingOut');
		expect(store.state.login).toBeNull();
		expect(store.state.route, 'logout leaves no login screen to display').toBe('signIn');
		expect(login.signal?.aborted).toBe(true);

		login.resolve(bob);
		await settle();
		expect(presented(actions, 'login', 'loginSucceeded')).toHaveLength(0);
		expect(store.state.session.status).toBe('loggingOut');

		logouts[0]!.resolve();
		await settle();
		expect(store.state.session.status).toBe('anonymous');
		expect(store.state.route).toBe('signIn');
		expect(subjects, 'Bob was never signed in, not even for one notification').not.toContain(bob.subject_id);

		// Positive control: signing in after the sign-out is new intent, and lands.
		store.dispatch({ type: 'signInOpened' });
		(await submitLogin(store, logins, 'bob@example.com')).resolve(bob);
		await settle();
		expect(presented(actions, 'login', 'loginSucceeded')).toHaveLength(1);
		expect(subjectId(store.state)).toBe(bob.subject_id);
	});

	it('a result landing after loggedOut is dropped, where an anonymous session would have accepted it', async () => {
		const { deps, logins, logouts } = controlledAuthDeps();
		const store = createShell(deps, signedInAs(ada));
		const actions = recordActions(store);

		store.dispatch({ type: 'signInOpened' });
		const login = await submitLogin(store, logins, 'bob@example.com');
		store.dispatch({ type: 'session', action: { type: 'logout' } });
		logouts[0]!.resolve();
		await settle();
		expect(store.state.session.status, 'the sign-out completed first').toBe('anonymous');

		login.resolve(bob);
		await settle();
		expect(presented(actions, 'login', 'loginSucceeded')).toHaveLength(0);
		expect(store.state.session.status).toBe('anonymous');
		expect(subjectId(store.state)).toBeNull();

		// Positive control: the same result from a flow opened now is reduced
		// and, meeting the same `anonymous` session, signs in.
		store.dispatch({ type: 'signInOpened' });
		(await submitLogin(store, logins, 'bob@example.com')).resolve(bob);
		await settle();
		expect(presented(actions, 'login', 'loginSucceeded')).toHaveLength(1);
		expect(subjectId(store.state)).toBe(bob.subject_id);
	});

	it('logout during an MFA verification retires the challenge and leaves the MFA route', async () => {
		const { deps, logins, challenges, logouts } = controlledAuthDeps();
		const store = createShell(deps, signedInAs(ada));
		const actions = recordActions(store);

		store.dispatch({ type: 'signInOpened' });
		(await submitLogin(store, logins, 'bob@example.com')).reject(mfaRequired('chal-b'));
		await settle();
		const challenge = await submitCode(store, challenges, '123456');

		store.dispatch({ type: 'session', action: { type: 'logout' } });
		expect(challenge.signal?.aborted).toBe(true);
		expect(store.state.mfa).toBeNull();
		expect(store.state.route).toBe('signIn');
		logouts[0]!.resolve();
		await settle();

		challenge.resolve(bob);
		await settle();
		expect(presented(actions, 'mfa', 'challengeSucceeded')).toHaveLength(0);
		expect(store.state.session.status).toBe('anonymous');

		// Positive control: a challenge reached after the sign-out is live, and
		// its result is reduced.
		store.dispatch({ type: 'signInOpened' });
		(await submitLogin(store, logins, 'bob@example.com')).reject(mfaRequired('chal-c'));
		await settle();
		(await submitCode(store, challenges, '654321')).resolve(bob);
		await settle();
		expect(presented(actions, 'mfa', 'challengeSucceeded')).toHaveLength(1);
		expect(subjectId(store.state)).toBe(bob.subject_id);
	});

	it('a flow opened during loggingOut is live, and sessionReducer refuses its result', async () => {
		// The one path by which a flow result meets `loggingOut`. The parent does
		// not restate the refusal; it reads `sessionReducer`'s outcome and removes
		// the flow either way. (The refusal itself is pinned directly in
		// `session-established.test.ts`, "is refused while a sign-out is in flight".)
		const { deps, logins, logouts } = controlledAuthDeps();
		const store = createShell(deps, signedInAs(ada));
		const actions = recordActions(store);

		store.dispatch({ type: 'session', action: { type: 'logout' } });
		store.dispatch({ type: 'signInOpened' });
		const login = await submitLogin(store, logins, 'bob@example.com');
		login.resolve(bob);
		await settle();

		expect(presented(actions, 'login', 'loginSucceeded'), 'the owner is live: reduced').toHaveLength(1);
		expect(store.state.session.status, 'refused by sessionReducer').toBe('loggingOut');
		expect(store.state.login, 'a refused result does not linger as succeeded').toBeNull();
		expect(store.state.route).toBe('signIn');

		logouts[0]!.resolve();
		await settle();
		expect(store.state.session.status).toBe('anonymous');
		expect(subjectId(store.state)).toBeNull();
	});
});

describe('how the parent reads a handoff', () => {
	it('a stale challengeSucceeded into a hydrated, already-succeeded MFA flow does not hand its stored session over again', () => {
		const { deps } = controlledAuthDeps();
		const done = {
			...createInitialMfaChallengeState('chal-1', ['totp']),
			status: 'succeeded' as const,
			session: ada,
			attempt: 1
		};
		const store = createShell(deps, { mfa: done, route: 'mfa' });
		const actions = recordActions(store);

		// Old `attempt`, and the flow is not submitting: the challenge refuses it.
		store.dispatch(mfaSlot.wrap({ type: 'challengeSucceeded', session: mallory, attempt: 1 }));
		expect(presented(actions, 'mfa', 'challengeSucceeded'), 'reduced: root authority').toHaveLength(1);
		expect(store.state.mfa, 'refused by the challenge').toEqual(done);
		// The flow still holds Ada's snapshot from before. The parent hands over
		// only what the challenge just accepted, so nobody is signed in.
		expect(store.state.session.status).toBe('unresolved');
		expect(store.state.route).toBe('mfa');

		// Positive control, and the root-authority distinction: an unstamped
		// result is accepted by the challenge as an assertion, and handed over.
		store.dispatch(mfaSlot.wrap({ type: 'challengeSucceeded', session: bob }));
		expect(subjectId(store.state)).toBe(bob.subject_id);
		expect(store.state.mfa).toBeNull();
		expect(store.state.route).toBe('home');
	});

	describe('under a session that refuses a switch of account', () => {
		// `sessionReducer` refuses `sessionEstablished` only while `loggingOut`,
		// when the session is not `authenticated` either. A stricter session —
		// test-local, the same parent core over it — refuses while another
		// account is signed in, which is where "authenticated" and "accepted"
		// come apart.
		const strictSession: Reducer<SessionState, SessionAction, SessionDependencies> = (state, action, deps) =>
			action.type === 'sessionEstablished' && state.status === 'authenticated'
				? [state, Effect.none()]
				: sessionReducer(state, action, deps);
		const strictLoginSlot = optionalSlot<AuthShellState, AuthShellAction>()('login');
		const strict = new ManagedIntegrationBuilder(createAuthShellCore(strictSession))
			.with(strictLoginSlot, loginReducer)
			.build();

		async function signInThroughStrict(
			store: AuthShellStore,
			requests: ReturnType<typeof controlledAuthDeps>['logins'],
			email: string
		) {
			store.dispatch({ type: 'signInOpened' });
			const view = strict.bind(store, strictLoginSlot)!;
			const before = requests.length;
			view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: email } });
			view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'password', value: 'correct-horse' } });
			view.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
			await settle();
			expect(requests).toHaveLength(before + 1);
			return requests[before]!;
		}

		it('reads a refusal as a refusal although the previous account stays authenticated', async () => {
			const { deps, logins } = controlledAuthDeps();
			const store = createStore({
				initialState: createInitialAuthShellState(),
				reducer: strict.reducer,
				execution: strict.execution,
				dependencies: deps
			});
			stores.push(store);

			// Positive control: signed out, the handoff is accepted.
			(await signInThroughStrict(store, logins, 'ada@example.com')).resolve(ada);
			await settle();
			expect(subjectId(store.state)).toBe(ada.subject_id);
			expect(store.state.route).toBe('home');

			// Switching to Bob is refused. The session is still `authenticated` —
			// as Ada — which is not an acceptance of Bob.
			(await signInThroughStrict(store, logins, 'bob@example.com')).resolve(bob);
			await settle();
			expect(store.state.session.status).toBe('authenticated');
			expect(subjectId(store.state)).toBe(ada.subject_id);
			expect(store.state.login, 'a refused result does not linger').toBeNull();
			expect(store.state.route, 'refused: not sent home as if Bob had signed in').toBe('signIn');
		});
	});
});

describe('a child effect produced by the action that retires it', () => {
	// The shell never retires a flow on an action that also gives the child an
	// effect, so this uses a probe parent over the same production reducers and
	// core builder: when the validated credentials arrive while a session is
	// already authenticated, it removes the sign-in and re-resolves the session
	// instead. Not a recommended policy — it isolates the ownership rule.
	const probeLoginSlot = optionalSlot<AuthShellState, AuthShellAction>()('login');
	const probeCore: Reducer<AuthShellState, AuthShellAction, AuthShellDependencies> = (state, action, deps) => {
		const validated =
			action.type === 'login' &&
			action.action.type === 'presented' &&
			action.action.action.type === 'form' &&
			action.action.action.action.type === 'submissionSucceeded';
		if (validated && state.login?.status === 'submitting' && state.session.status === 'authenticated') {
			return authShellCore({ ...state, login: null }, { type: 'session', action: { type: 'resolveSession' } }, deps);
		}
		return authShellCore(state, action, deps);
	};
	const probe = new ManagedIntegrationBuilder(probeCore).with(probeLoginSlot, loginReducer).build();

	function createProbe(deps: AuthShellDependencies, initial: Partial<AuthShellState>) {
		const store = createStore({
			initialState: createInitialAuthShellState(initial),
			reducer: probe.reducer,
			execution: probe.execution,
			dependencies: deps
		});
		stores.push(store);
		return store;
	}

	function submitThroughProbe(store: AuthShellStore) {
		const view = probe.bind(store, probeLoginSlot)!;
		view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: 'bob@example.com' } });
		view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'password', value: 'correct-horse' } });
		view.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
	}

	function countingSessions(deps: AuthShellDependencies) {
		const calls = { count: 0 };
		return {
			calls,
			deps: { ...deps, fetchSession: async () => { calls.count++; return null; } }
		};
	}

	it('suppresses the child’s request while the parent’s follow-up effect runs', async () => {
		const { deps: base, logins } = controlledAuthDeps();
		const { deps, calls } = countingSessions(base);
		const store = createProbe(deps, { ...signedInAs(ada), login: createInitialLoginState() });
		const actions = recordActions(store);

		submitThroughProbe(store);
		await settle();

		// The retiring action reached both: the child reduced it (and returned its
		// request effect), the parent removed the child in the same reduction.
		expect(store.state.login).toBeNull();
		expect(logins, 'the child effect stamped with the retired owner never ran').toHaveLength(0);
		// The parent's effect is parent-owned: it ran, and its feedback was reduced.
		expect(calls.count).toBe(1);
		expect(actions.some((a) => a.type === 'session' && a.action.type === 'sessionResolved')).toBe(true);
		expect(store.state.session.status).toBe('anonymous');
	});

	it('positive control: without the retirement, the same submission makes the request', async () => {
		const { deps: base, logins } = controlledAuthDeps();
		const { deps, calls } = countingSessions(base);
		const store = createProbe(deps, { login: createInitialLoginState() });

		submitThroughProbe(store);
		await settle();

		expect(logins).toHaveLength(1);
		expect(store.state.login?.status).toBe('submitting');
		expect(calls.count).toBe(0);
	});
});

describe('same-ID MFA challenge freshness', () => {
	it('re-providing the same challenge ID starts a fresh attempt; the old result cannot land', async () => {
		const { deps, challenges } = controlledAuthDeps();
		const store = createShell(deps, {
			mfa: createInitialMfaChallengeState('chal-1', ['totp']),
			route: 'mfa'
		});
		const actions = recordActions(store);

		const first = await submitCode(store, challenges, '111111');
		const { attempt, formGeneration } = store.state.mfa!;

		authShell.bind(store, mfaSlot)!.dispatch({
			type: 'challengeProvided',
			challengeId: 'chal-1',
			methods: ['totp']
		});
		expect(first.signal?.aborted, 'the superseded verification is cancelled').toBe(true);
		expect(store.state.mfa?.status).toBe('idle');
		expect(store.state.mfa?.form.data.code, 'the old code is not resubmittable').toBe('');
		expect(store.state.mfa?.attempt).toBe((attempt ?? 0) + 1);
		expect(store.state.mfa?.formGeneration).toBe((formGeneration ?? 0) + 1);

		// Same owner, so ownership cannot help: cancellation and the attempt
		// correlation do. The superseded request answers anyway…
		first.resolve(mallory);
		await settle();
		expect(presented(actions, 'mfa', 'challengeSucceeded')).toHaveLength(0);

		// …and a manual replay of its stamped result is reduced but refused.
		store.dispatch(mfaSlot.wrap({ type: 'challengeSucceeded', session: mallory, attempt }));
		expect(presented(actions, 'mfa', 'challengeSucceeded')).toHaveLength(1);
		expect(store.state.mfa?.status).toBe('idle');
		expect(store.state.session.status).toBe('unresolved');

		const second = await submitCode(store, challenges, '222222');
		expect(second.code).toBe('222222');
		second.resolve(ada);
		await settle();
		expect(subjectId(store.state)).toBe(ada.subject_id);
		expect(store.state.route).toBe('home');
	});
});

describe('owner-stamped feedback versus manually dispatched domain actions', () => {
	it('a manual result for a removed flow is reduced, but the empty slot and parent ignore it', async () => {
		const { deps } = controlledAuthDeps();
		const store = createShell(deps);
		const actions = recordActions(store);

		store.dispatch({ type: 'signInOpened' });
		store.dispatch({ type: 'signInCancelled' });
		store.dispatch(loginSlot.wrap({ type: 'loginSucceeded', session: mallory }));

		expect(presented(actions, 'login', 'loginSucceeded'), 'root authority is not filtered').toHaveLength(1);
		expect(store.state.login).toBeNull();
		expect(store.state.session.status).toBe('unresolved');
	});

	it('a manual loginSucceeded into a live flow is accepted: loginReducer has no request correlation', async () => {
		// Pins current behaviour for the T2 record rather than endorsing it.
		// Login's result carries no attempt stamp (MFA's does), so a root
		// dispatch is indistinguishable from the flow's own feedback and the
		// parent hands it over. Root dispatch is trusted authority by design.
		const { deps, logins } = controlledAuthDeps();
		const store = createShell(deps);

		store.dispatch({ type: 'signInOpened' });
		store.dispatch(loginSlot.wrap({ type: 'loginSucceeded', session: mallory }));

		expect(logins, 'no request was made').toHaveLength(0);
		expect(subjectId(store.state)).toBe(mallory.subject_id);
		expect(store.state.route).toBe('home');
	});
});

describe('two store instances from one composition', () => {
	it('keep sessions, flows and in-flight requests isolated, including destroying one with both in flight', async () => {
		const a = controlledAuthDeps();
		const b = controlledAuthDeps();
		const storeA = createShell(a.deps);
		const storeB = createShell(b.deps);
		const actionsA = recordActions(storeA);
		const actionsB = recordActions(storeB);

		storeA.dispatch({ type: 'signInOpened' });
		storeB.dispatch({ type: 'signInOpened' });
		const loginA = await submitLogin(storeA, a.logins, 'ada@example.com');
		const loginB = await submitLogin(storeB, b.logins, 'bob@example.com');

		loginB.reject({ code: 'mfa_required', message: 'MFA', challengeId: 'chal-b', methods: ['totp'] });
		await settle();
		expect(storeB.state.route).toBe('mfa');
		expect(storeA.state.route).toBe('signIn');
		expect(storeA.state.login?.status).toBe('submitting');
		expect(storeA.state.mfa).toBeNull();

		// Views are per store: A's slot owner is not B's.
		expect(authShell.bind(storeA, mfaSlot)).toBeUndefined();
		expect(authShell.bind(storeB, loginSlot)).toBeUndefined();

		// Both stores have a request in flight when A is destroyed.
		const challengeB = await submitCode(storeB, b.challenges, '654321');
		expect(storeB.state.mfa?.status).toBe('submitting');

		storeA.destroy();
		expect(loginA.signal?.aborted).toBe(true);
		expect(challengeB.signal?.aborted, 'the sibling’s request survives').toBe(false);
		expect(storeB.state.mfa?.status).toBe('submitting');

		loginA.resolve(ada);
		challengeB.resolve(bob);
		await settle();

		expect(presented(actionsA, 'login', 'loginSucceeded'), 'the destroyed store reduced nothing').toHaveLength(0);
		expect(presented(actionsB, 'mfa', 'challengeSucceeded'), 'positive control').toHaveLength(1);
		expect(subjectId(storeB.state)).toBe(bob.subject_id);
		expect(storeB.state.route).toBe('home');
		expect(storeA.state.session.status, 'the destroyed store took nothing').toBe('unresolved');
		expect(subjectId(storeA.state)).toBeNull();
	});
});
