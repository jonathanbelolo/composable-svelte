/**
 * Batch B auth proof fixture: a persistent, parent-owned session plus optional
 * login and MFA flows as managed child slots — on existing core only.
 *
 * Nothing here is new API. `ManagedIntegrationBuilder` and `optionalSlot` are
 * core's, `sessionReducer` / `loginReducer` / `mfaChallengeReducer` are this
 * package's, unchanged. What the fixture adds is the parent core reducer, and
 * that reducer is the claim under test: the handoff `LoginForm` performs in a
 * `$effect` (and `onMfaRequired` performs through a callback) can instead be
 * done by the parent consuming the lifted child business actions, with no
 * component mounted.
 *
 * Ordering it relies on: a managed composition runs the child slots first and
 * the parent core second, over the child's result, in the same reduction. So
 * when the core sees `{ type: 'login', action: { type: 'presented', action:
 * { type: 'loginSucceeded' } } }`, `state.login` already says `succeeded`.
 *
 * Test-only. It is not exported from the package and is not a shipped recipe;
 * whether auth ships a composition fragment like this is a T2 decision.
 */

import { Effect, scope, type PresentationAction, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, optionalSlot } from '@composable-svelte/core/application';

import { isMfaRequired } from '../../src/lib/errors/index.js';
import {
	createInitialLoginState,
	createInitialMfaChallengeState,
	loginReducer,
	mfaChallengeReducer,
	type LoginAction,
	type LoginDependencies,
	type LoginState,
	type MfaChallengeAction,
	type MfaChallengeDependencies,
	type MfaChallengeState
} from '../../src/lib/flows/index.js';
import {
	createInitialSessionState,
	sessionReducer,
	type SessionAction,
	type SessionDependencies,
	type SessionState
} from '../../src/lib/session/index.js';
import type { SessionSnapshot } from '../../src/lib/subject/index.js';

/** Parent-owned navigation. The flows never choose where the user goes next. */
export type AuthRoute = 'signIn' | 'mfa' | 'home';

export interface AuthShellState {
	/** Persistent: not a slot, never retired while the shell lives. */
	session: SessionState;
	/** One sign-in attempt, present only while it is on screen. */
	login: LoginState | null;
	/** One second-factor challenge, present only while it is on screen. */
	mfa: MfaChallengeState | null;
	route: AuthRoute;
}

export type AuthShellAction =
	| { type: 'session'; action: SessionAction }
	| { type: 'login'; action: PresentationAction<LoginAction> }
	| { type: 'mfa'; action: PresentationAction<MfaChallengeAction> }
	/**
	 * Present a sign-in flow if none is showing. Refused while a login or MFA
	 * flow is live: an open is idempotent, never a silent reset of an attempt
	 * whose request is still in flight.
	 */
	| { type: 'signInOpened' }
	/** Replace any live flow with a fresh sign-in (retires the old owners). */
	| { type: 'signInRestarted' }
	/** Remove both flows (retires their owners). */
	| { type: 'signInCancelled' };

export type AuthShellDependencies = SessionDependencies & LoginDependencies & MfaChallengeDependencies;

export function createInitialAuthShellState(overrides: Partial<AuthShellState> = {}): AuthShellState {
	return {
		session: createInitialSessionState(),
		login: null,
		mfa: null,
		route: 'signIn',
		...overrides
	};
}

export const loginSlot = optionalSlot<AuthShellState, AuthShellAction>()('login');
export const mfaSlot = optionalSlot<AuthShellState, AuthShellAction>()('mfa');

type SessionSlice = Reducer<AuthShellState, AuthShellAction, AuthShellDependencies>;

/** The session is an ordinary scoped child: its effects carry root authority. */
function sessionSliceOf(
	session: Reducer<SessionState, SessionAction, SessionDependencies>
): SessionSlice {
	return scope<AuthShellState, AuthShellAction, SessionState, SessionAction, AuthShellDependencies>(
		(state) => state.session,
		(state, next) => ({ ...state, session: next }),
		(action) => (action.type === 'session' ? action.action : null),
		(action) => ({ type: 'session', action }),
		session
	);
}

/** Where the user belongs when no flow is on screen: the route follows the session. */
function restingRoute(session: SessionState): AuthRoute {
	return session.status === 'authenticated' ? 'home' : 'signIn';
}

/** A dismissed child is gone before the parent sees its lifted action. */
function visibleRoute(state: AuthShellState): AuthRoute {
	if (state.mfa !== null) return 'mfa';
	if (state.login !== null) return 'signIn';
	return restingRoute(state.session);
}

/**
 * Hand a completed flow's snapshot to the session, through the session reducer.
 *
 * The reducer keeps its own refusals (today only `loggingOut`); the parent
 * does not restate them, it reads the outcome. Acceptance is the transition
 * itself — the session state changed — not "the session is authenticated",
 * which is also true when a switch of account is refused and the previous
 * account stays signed in. This relies on a refusal returning the session
 * state unchanged, as `sessionReducer` does; a reducer that recorded its
 * refusal in a new state would need an explicit accepted result, which is a
 * T2 question. Either way the flow is finished and removed: a refused result
 * must not linger as a `succeeded` flow. A refusal stays on `signIn`; that is
 * this fixture's policy.
 */
function establish(
	sessionSlice: SessionSlice,
	state: AuthShellState,
	snapshot: SessionSnapshot,
	deps: AuthShellDependencies
): [AuthShellState, Effect<AuthShellAction>] {
	const [next, effect] = sessionSlice(
		state,
		{ type: 'session', action: { type: 'sessionEstablished', session: snapshot } },
		deps
	);
	const accepted = next.session !== state.session;
	return [{ ...next, login: null, mfa: null, route: accepted ? 'home' : 'signIn' }, effect];
}

/**
 * The parent core over a given session reducer. Production code has one,
 * `sessionReducer`; the parameter exists so a test can put a stricter session
 * under the same parent and observe how the parent reads a refusal.
 *
 * Runs after the slots, so `state.login` / `state.mfa` are already the child's
 * result.
 */
export function createAuthShellCore(
	session: Reducer<SessionState, SessionAction, SessionDependencies> = sessionReducer
): Reducer<AuthShellState, AuthShellAction, AuthShellDependencies> {
	const sessionSlice = sessionSliceOf(session);
	return (state, action, deps) => {
		switch (action.type) {
			case 'session': {
				const [next, effect] = sessionSlice(state, action, deps);
				// Logout is the exit hatch even if the session is already anonymous:
				// it ends every sign-in attempt already under way. Removing
				// the flows retires their owners, so a result that lands later —
				// during `loggingOut` or after `loggedOut` — is dropped before any
				// reducer sees it. Without this, a result landing after `loggedOut`
				// meets an `anonymous` session, which accepts it and re-authenticates.
				// A flow opened after this point is new intent and is not retired.
				const retired: AuthShellState =
					action.action.type === 'logout'
						? { ...next, login: null, mfa: null, route: 'signIn' }
						: next;
				// Accepted session feedback, including initial hydration, chooses the
				// resting route when no flow is on screen. A live login/MFA keeps its
				// own route. Stale feedback leaves the route as it was.
				const settled =
					action.action.type === 'sessionResolved' ||
					action.action.type === 'sessionResolveFailed' ||
					action.action.type === 'loginSucceeded' ||
					action.action.type === 'loginFailed' ||
					action.action.type === 'loggedOut' ||
					action.action.type === 'sessionEstablished';
				return [settled && retired.session !== state.session
					? { ...retired, route: visibleRoute(retired) }
					: retired, effect];
			}

			case 'signInOpened': {
				if (state.login !== null || state.mfa !== null) return [state, Effect.none()];
				return [{ ...state, login: createInitialLoginState(), route: 'signIn' }, Effect.none()];
			}

			case 'signInRestarted': {
				return [
					{ ...state, login: createInitialLoginState(), mfa: null, route: 'signIn' },
					Effect.none()
				];
			}

			case 'signInCancelled': {
				// Back to wherever the session says: `home` when an account is still
				// signed in (a cancelled switch of account), `signIn` otherwise —
				// never a route whose flow was just removed.
				return [{ ...state, login: null, mfa: null, route: restingRoute(state.session) }, Effect.none()];
			}

			case 'login': {
				if (action.action.type === 'dismiss') {
					return [{ ...state, route: visibleRoute(state) }, Effect.none()];
				}
				// An absent flow ignores a root-authority result addressed to it.
				if (action.action.type !== 'presented' || state.login === null) return [state, Effect.none()];
				const child = action.action.action;
				const flow = state.login;
				// `flow.session === child.session`: the flow stored *this* result.
				// `loginReducer` accepts every `loginSucceeded` (no correlation), so
				// here it always has; the check keeps both handoffs to one rule.
				if (child.type === 'loginSucceeded' && flow.status === 'succeeded' && flow.session === child.session) {
					return establish(sessionSlice, state, child.session, deps);
				}
				if (child.type === 'loginFailed' && isMfaRequired(flow.error)) {
					// The branch `onMfaRequired` used to carry, now a state transition.
					return [
						{
							...state,
							login: null,
							mfa: createInitialMfaChallengeState(flow.error.challengeId, flow.error.methods),
							route: 'mfa'
						},
						Effect.none()
					];
				}
				return [state, Effect.none()];
			}

			case 'mfa': {
				if (action.action.type === 'dismiss') {
					return [{ ...state, route: visibleRoute(state) }, Effect.none()];
				}
				if (action.action.type !== 'presented' || state.mfa === null) return [state, Effect.none()];
				const child = action.action.action;
				const flow = state.mfa;
				// Hand over only a result the challenge just accepted. A stale
				// `challengeSucceeded` (old `attempt`) is refused by the reducer, but
				// a flow that is already `succeeded` — hydrated or hand-built — still
				// holds its earlier snapshot; reading `flow.session` alone would
				// re-establish it on any stale action. The reducer stores the
				// accepted action's snapshot, so identity says which one this was.
				// It cannot tell a root replay of the very same object; that is root
				// authority, and an exact accepted-result signal is a T2 question.
				if (child.type === 'challengeSucceeded' && flow.status === 'succeeded' && flow.session === child.session) {
					return establish(sessionSlice, state, child.session, deps);
				}
				return [state, Effect.none()];
			}

			default: {
				const _exhaustive: never = action;
				void _exhaustive;
				return [state, Effect.none()];
			}
		}
	};
}

export const authShellCore = createAuthShellCore();

/**
 * The composition.
 *
 * Every place the core writes a fresh flow into a slot either finds the slot
 * empty (a new owner is allocated) or is named in `replaceOn` (the old owner is
 * retired). Writing fresh state over an occupied slot without `replaceOn`
 * would reset what the user sees while the old owner — and its in-flight
 * request — stayed live and could land its result in the new flow.
 *
 * - `signInOpened` refuses an occupied slot.
 * - `signInRestarted` rewrites `login` in place: replaced.
 * - The MFA branch, a `login` action, writes a fresh challenge into `mfa`. If
 *   an old challenge is still there, it is replaced — and only then. Every
 *   other `login` action (each keystroke, the submit, a plain failure) leaves
 *   `mfa` alone, and replacing on those would retire a live challenge and
 *   abort its verification while the user types in the other slot.
 */
export const authShell = new ManagedIntegrationBuilder(authShellCore)
	.with(loginSlot, loginReducer, { replaceOn: (action) => action.type === 'signInRestarted' })
	.with(mfaSlot, mfaChallengeReducer, { replaceOn: mfaReplaced })
	.build();

/**
 * The parent wrote a fresh challenge over a live one. A `login` action never
 * reaches the MFA child, so a changed `mfa` under one is the parent's write;
 * an `mfa` action changes `mfa` through the child itself and is not a
 * replacement.
 */
function mfaReplaced(action: AuthShellAction, before: AuthShellState, after: AuthShellState): boolean {
	return action.type === 'login' && after.mfa !== before.mfa;
}
