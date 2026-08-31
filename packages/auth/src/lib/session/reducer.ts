/**
 * Session reducer.
 *
 * All async runs in `Effect.run` over the injected {@link SessionDependencies}
 * — the reducer itself is pure. Failure paths are fail-closed: any resolve or
 * logout failure lands the client in `anonymous` (a failed RE-login restores
 * the prior authenticated session instead — see `loginFailed`).
 *
 * ## Feedback attribution (epoch + status)
 *
 * Every initiator (`resolveSession` / `login` / `logout`) increments
 * `state.epoch`; its effect closure captures that epoch and stamps it into
 * the feedback action. Feedback applies only when the status matches AND
 * `action.epoch === state.epoch`. The status guard alone cannot distinguish
 * WHICH in-flight request feedback belongs to — e.g. resolve → logout →
 * resolve leaves the store `resolving` again when the first (dead-session)
 * resolve lands, and slow login A → logout → login B leaves it `loggingIn`
 * when A's success lands. The epoch pins feedback to its own request.
 */

import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import { isAuthError, toAuthError } from '../errors/helpers.js';
import { anonymousSubject, subjectFromSession } from '../subject/helpers.js';
import type { AuthError } from '../errors/types.js';
import type { SessionAction, SessionDependencies, SessionState } from './types.js';

/** Initial state: nothing known, anonymous subject, epoch 0. */
export function createInitialSessionState(): SessionState {
	return {
		status: 'unresolved',
		subject: anonymousSubject,
		error: null,
		epoch: 0
	};
}

/**
 * Wrap what a dependency threw, keeping a fallback message for the shapeless
 * case.
 *
 * `toAuthError` handles the classification — an abort and a `fetch` TypeError
 * both become `network`, an `AuthError` a dependency reported deliberately
 * passes straight through. This only supplies wording when the thrown value had
 * none of its own, which happens when something non-`Error` is thrown.
 */
function asAuthError(thrown: unknown, fallback: string): AuthError {
	const error = toAuthError(thrown);
	return hasWordingOfItsOwn(thrown) ? error : { ...error, message: fallback };
}

/**
 * Whether the thrown value said anything a user could read.
 *
 * The first version of this asked whether the *wrapped* message was `''` or the
 * literal string `'undefined'`, which is matching on a magic string and got it
 * wrong in both directions: a thrown `null` became the word "null" and a thrown
 * `{}` became "[object Object]", both shown to the user, while an `Error` that
 * legitimately said "undefined" would have had its message replaced.
 *
 * Asking about the input instead is exact. An `Error` with something to say
 * keeps it, an `AuthError` keeps its own wording, a non-empty string is wording,
 * and everything else — `null`, `undefined`, `{}`, `''` — gets the fallback.
 */
function hasWordingOfItsOwn(thrown: unknown): boolean {
	if (isAuthError(thrown)) return true;
	if (thrown instanceof Error) return thrown.message !== '';
	return typeof thrown === 'string' && thrown !== '';
}

/**
 * The in-flight logout. Fixed rather than per-dispatch, because re-registering
 * the same id is what cancels the previous one.
 */
const LOGOUT_EFFECT_ID = 'auth/session/logout';

export const sessionReducer: Reducer<SessionState, SessionAction, SessionDependencies> = (
	state,
	action,
	deps
) => {
	switch (action.type) {
		case 'resolveSession': {
			// Guard: an auth operation is already in flight — no duplicate I/O.
			if (
				state.status === 'resolving' ||
				state.status === 'loggingIn' ||
				state.status === 'loggingOut'
			) {
				return [state, Effect.none()];
			}
			const epoch = state.epoch + 1;
			return [
				{ ...state, status: 'resolving', error: null, epoch },
				Effect.run(async (dispatch) => {
					try {
						const session = await deps.fetchSession();
						dispatch({ type: 'sessionResolved', session, epoch });
					} catch (error) {
						dispatch({
							type: 'sessionResolveFailed',
							error: asAuthError(error, 'Session resolution failed'),
							epoch
						});
					}
				})
			];
		}

		case 'sessionResolved': {
			// Stale-feedback guard: only apply while the MATCHING resolve is in
			// flight — status must be `resolving` AND the feedback's epoch must
			// be the current one. A login/logout dispatched mid-resolve bumps
			// the epoch, so the superseded resolve's late result is discarded
			// even when a NEWER resolve has put the store back in `resolving`.
			if (state.status !== 'resolving' || action.epoch !== state.epoch) {
				return [state, Effect.none()];
			}
			if (action.session === null) {
				return [
					{ status: 'anonymous', subject: anonymousSubject, error: null, epoch: state.epoch },
					Effect.none()
				];
			}
			return [
				{
					status: 'authenticated',
					subject: subjectFromSession(action.session),
					error: null,
					epoch: state.epoch
				},
				Effect.none()
			];
		}

		case 'sessionResolveFailed': {
			// Stale-feedback guard: same as `sessionResolved`.
			if (state.status !== 'resolving' || action.epoch !== state.epoch) {
				return [state, Effect.none()];
			}
			// Fail-closed: an unreachable/failing session endpoint means anonymous.
			return [
				{ status: 'anonymous', subject: anonymousSubject, error: action.error, epoch: state.epoch },
				Effect.none()
			];
		}

		case 'login': {
			// Guard: one login at a time, and never while a logout is in
			// flight. Login DURING `resolving` is allowed — explicit user
			// intent supersedes the background resolve, whose stale feedback
			// is then discarded by the epoch + status guards.
			if (state.status === 'loggingIn' || state.status === 'loggingOut') {
				return [state, Effect.none()];
			}
			const seededUserId = action.seededUserId;
			const epoch = state.epoch + 1;
			return [
				{ ...state, status: 'loggingIn', error: null, epoch },
				Effect.run(async (dispatch) => {
					try {
						const session = await deps.fetchLogin(seededUserId);
						dispatch({ type: 'loginSucceeded', session, epoch });
					} catch (error) {
						dispatch({
							type: 'loginFailed',
							error: asAuthError(error, 'Login failed'),
							epoch
						});
					}
				})
			];
		}

		case 'loginSucceeded': {
			// Stale-feedback guard: only apply while the MATCHING login is in
			// flight (status + epoch). A logout dispatched mid-login bumps the
			// epoch, so a superseded login's late success cannot re-authenticate
			// — even when a newer login has put the store back in `loggingIn`.
			if (state.status !== 'loggingIn' || action.epoch !== state.epoch) {
				return [state, Effect.none()];
			}
			return [
				{
					status: 'authenticated',
					subject: subjectFromSession(action.session),
					error: null,
					epoch: state.epoch
				},
				Effect.none()
			];
		}

		case 'loginFailed': {
			// Stale-feedback guard: same as `loginSucceeded`.
			if (state.status !== 'loggingIn' || action.epoch !== state.epoch) {
				return [state, Effect.none()];
			}
			// A failed RE-login must not destroy a still-valid session: the
			// server only replaces the session cookie on a SUCCESSFUL login, so
			// when the subject entering `loggingIn` was authenticated, restore
			// it and surface the error. Fall to `loginFailed`/anonymous only
			// when there was no prior session to restore.
			if (state.subject.kind === 'authenticated') {
				return [
					{
						status: 'authenticated',
						subject: state.subject,
						error: action.error,
						epoch: state.epoch
					},
					Effect.none()
				];
			}
			return [
				{ status: 'loginFailed', subject: anonymousSubject, error: action.error, epoch: state.epoch },
				Effect.none()
			];
		}

		case 'logout': {
			// No guard on `loggingOut`, deliberately.
			//
			// There used to be one — "one logout at a time, a double dispatch
			// fires a single request" — and it made logout the only operation
			// with no way out of its own in-flight state. Every action is a
			// no-op from `loggingOut` except a matching `loggedOut`, and the
			// only thing that produces one is this effect. A `fetchLogout` that
			// never settled trapped the store permanently: the authenticated UI
			// stayed up with `isRevalidating: true`, and clicking sign out
			// again did nothing. The comment three lines above called logout
			// "the user's exit hatch".
			//
			// `Effect.cancellable` under a fixed id keeps what the guard was
			// protecting — re-dispatching cancels the in-flight request rather
			// than racing a second one alongside it — while letting the user
			// retry. The epoch below discards the superseded request's feedback
			// if it lands anyway.
			const epoch = state.epoch + 1;
			return [
				{ ...state, status: 'loggingOut', error: null, epoch },
				Effect.cancellable(LOGOUT_EFFECT_ID, async (dispatch, signal) => {
					try {
						await deps.fetchLogout(signal);
						dispatch({ type: 'loggedOut', epoch });
					} catch (error) {
						// Fail-closed: the client still goes anonymous. The cookie is
						// HttpOnly and server-owned; the failure is recorded so the app
						// can surface "sign-out may not have reached the server".
						dispatch({
							type: 'loggedOut',
							error: asAuthError(error, 'Logout request failed'),
							epoch
						});
					}
				})
			];
		}

		case 'loggedOut': {
			// Stale-feedback guard: only apply while the MATCHING logout is in
			// flight (status + epoch).
			if (state.status !== 'loggingOut' || action.epoch !== state.epoch) {
				return [state, Effect.none()];
			}
			return [
				{
					status: 'anonymous',
					subject: anonymousSubject,
					error: action.error ?? null,
					epoch: state.epoch
				},
				Effect.none()
			];
		}

		case 'loginStarted': {
			// Presentation only: a flow outside this store is signing in, and
			// `AuthGuard` should show its pending branch. Epoch bumps for the same
			// reason every initiator bumps it — a resolve already in flight must
			// not land on top of the session this flow is about to establish.
			//
			// Refused while `loggingOut` so it cannot resurrect a sign-out that is
			// already under way; `loggingIn` is idempotent.
			if (state.status === 'loggingOut' || state.status === 'loggingIn') {
				return [state, Effect.none()];
			}
			return [
				{ ...state, status: 'loggingIn', error: null, epoch: state.epoch + 1 },
				Effect.none()
			];
		}

		case 'sessionEstablished': {
			// The handover from a flow that owns its own async: credentials login,
			// an MFA challenge, an OAuth callback, a magic link. No epoch guard,
			// because this is not effect feedback from *this* store — the flow is
			// asserting a result it already has.
			//
			// One status is refused. A sign-in resolving after the user has hit
			// sign-out would otherwise re-authenticate them, and `loggingOut` is
			// the only window where that is possible. Everything else yields, on
			// the principle the `login` arm already states: explicit user intent
			// supersedes a background resolve.
			if (state.status === 'loggingOut') {
				return [state, Effect.none()];
			}
			return [
				{
					status: 'authenticated',
					subject: subjectFromSession(action.session),
					error: null,
					epoch: state.epoch
				},
				Effect.none()
			];
		}

		default: {
			const _exhaustive: never = action;
			void _exhaustive;
			return [state, Effect.none()];
		}
	}
};
