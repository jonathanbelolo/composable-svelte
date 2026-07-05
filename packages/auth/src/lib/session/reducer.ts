/**
 * Session reducer.
 *
 * All async runs in `Effect.run` over the injected {@link SessionDependencies}
 * — the reducer itself is pure. Failure paths are fail-closed: any resolve or
 * logout failure lands the client in `anonymous`.
 */

import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import { anonymousSubject, subjectFromSession } from '../subject/helpers.js';
import type { SessionAction, SessionDependencies, SessionState } from './types.js';

/** Initial state: nothing known, anonymous subject. */
export function createInitialSessionState(): SessionState {
	return {
		status: 'unresolved',
		subject: anonymousSubject,
		error: null
	};
}

function errorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

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
			return [
				{ ...state, status: 'resolving', error: null },
				Effect.run(async (dispatch) => {
					try {
						const session = await deps.fetchSession();
						dispatch({ type: 'sessionResolved', session });
					} catch (error) {
						dispatch({
							type: 'sessionResolveFailed',
							error: errorMessage(error, 'Session resolution failed')
						});
					}
				})
			];
		}

		case 'sessionResolved': {
			// Stale-feedback guard: only apply while the matching resolve is in
			// flight. A login or logout dispatched mid-resolve supersedes the
			// resolve — its late result must not clobber the newer state.
			if (state.status !== 'resolving') {
				return [state, Effect.none()];
			}
			if (action.session === null) {
				return [
					{ status: 'anonymous', subject: anonymousSubject, error: null },
					Effect.none()
				];
			}
			return [
				{
					status: 'authenticated',
					subject: subjectFromSession(action.session),
					error: null
				},
				Effect.none()
			];
		}

		case 'sessionResolveFailed': {
			// Stale-feedback guard: same as `sessionResolved`.
			if (state.status !== 'resolving') {
				return [state, Effect.none()];
			}
			// Fail-closed: an unreachable/failing session endpoint means anonymous.
			return [
				{ status: 'anonymous', subject: anonymousSubject, error: action.error },
				Effect.none()
			];
		}

		case 'login': {
			// Guard: one login at a time, and never while a logout is in
			// flight. Login DURING `resolving` is allowed — explicit user
			// intent supersedes the background resolve, whose stale feedback
			// is then discarded by the `sessionResolved` guard.
			if (state.status === 'loggingIn' || state.status === 'loggingOut') {
				return [state, Effect.none()];
			}
			const seededUserId = action.seededUserId;
			return [
				{ ...state, status: 'loggingIn', error: null },
				Effect.run(async (dispatch) => {
					try {
						const session = await deps.fetchLogin(seededUserId);
						dispatch({ type: 'loginSucceeded', session });
					} catch (error) {
						dispatch({
							type: 'loginFailed',
							error: errorMessage(error, 'Login failed')
						});
					}
				})
			];
		}

		case 'loginSucceeded': {
			// Stale-feedback guard: only apply while the matching login is in
			// flight (a logout dispatched mid-login must not be overridden).
			if (state.status !== 'loggingIn') {
				return [state, Effect.none()];
			}
			return [
				{
					status: 'authenticated',
					subject: subjectFromSession(action.session),
					error: null
				},
				Effect.none()
			];
		}

		case 'loginFailed': {
			// Stale-feedback guard: same as `loginSucceeded`.
			if (state.status !== 'loggingIn') {
				return [state, Effect.none()];
			}
			return [
				{ status: 'loginFailed', subject: anonymousSubject, error: action.error },
				Effect.none()
			];
		}

		case 'logout': {
			// Guard: one logout at a time — a double dispatch fires a single
			// request. Logout from any other status (including mid-resolve or
			// mid-login) is always honored: it is the user's exit hatch, and
			// the stale feedback of the superseded operation is discarded by
			// the feedback guards above.
			if (state.status === 'loggingOut') {
				return [state, Effect.none()];
			}
			return [
				{ ...state, status: 'loggingOut', error: null },
				Effect.run(async (dispatch) => {
					try {
						await deps.fetchLogout();
						dispatch({ type: 'loggedOut' });
					} catch (error) {
						// Fail-closed: the client still goes anonymous. The cookie is
						// HttpOnly and server-owned; the failure is recorded so the app
						// can surface "sign-out may not have reached the server".
						dispatch({
							type: 'loggedOut',
							error: errorMessage(error, 'Logout request failed')
						});
					}
				})
			];
		}

		case 'loggedOut': {
			// Stale-feedback guard: only apply while the matching logout is in
			// flight.
			if (state.status !== 'loggingOut') {
				return [state, Effect.none()];
			}
			return [
				{
					status: 'anonymous',
					subject: anonymousSubject,
					error: action.error ?? null
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
