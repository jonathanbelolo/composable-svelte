/**
 * The email-verification flow.
 *
 * No form, so no scoped form reducer — see `types.ts`. What replaces it is a
 * guard: confirming runs at most once per token, because the surface dispatches
 * from mount and a component effect can re-run for reasons that have nothing to
 * do with the token.
 */

import { createStore, Effect } from '@composable-svelte/core';
import type { Reducer, Store } from '@composable-svelte/core';

import { toAuthError } from '../../errors/helpers.js';
import type {
	EmailVerificationAction,
	EmailVerificationDependencies,
	EmailVerificationState
} from './types.js';

/**
 * Cancellation ids.
 *
 * Two, not one: confirming and resending are independent, and a resend must not
 * cancel a confirmation that is still in flight. Fixed within each, so a second
 * resend supersedes the first rather than racing it.
 */
const VERIFY_EFFECT_ID = 'auth/flows/email-verification/verify';
const RESEND_EFFECT_ID = 'auth/flows/email-verification/resend';

export function createInitialEmailVerificationState(
	email: string | null = null
): EmailVerificationState {
	return {
		status: 'idle',
		error: null,
		session: null,
		resendStatus: 'idle',
		resendError: null,
		email
	};
}

export const emailVerificationReducer: Reducer<
	EmailVerificationState,
	EmailVerificationAction,
	EmailVerificationDependencies
> = (state, action, deps) => {
	switch (action.type) {
		case 'verificationRequested': {
			// Refused once it has succeeded, and while one is already running. The
			// surface dispatches this from mount, and an effect re-runs for reasons
			// unrelated to the token — a prop changing, a parent re-rendering. A
			// second exchange of a single-use token is how a working link becomes a
			// spent one.
			if (state.status !== 'idle') {
				return [state, Effect.none()];
			}

			const { token } = action;

			return [
				{ ...state, status: 'verifying', error: null },
				Effect.cancellable<EmailVerificationAction>(
					VERIFY_EFFECT_ID,
					async (dispatch, signal) => {
						try {
							const session = await deps.verifyEmail(token, signal);
							dispatch({ type: 'verificationSucceeded', session });
						} catch (error) {
							dispatch({ type: 'verificationFailed', error: toAuthError(error) });
						}
					}
				)
			];
		}

		case 'verificationSucceeded': {
			return [
				{ ...state, status: 'verified', error: null, session: action.session },
				Effect.none()
			];
		}

		case 'verificationFailed': {
			// Back to `idle`, not to a failed status — `error` is what says it went
			// wrong, as in the other flows. It also means a *new* token can be
			// tried, which is exactly what happens when the user follows the link
			// from a resent mail without reloading.
			return [{ ...state, status: 'idle', error: action.error }, Effect.none()];
		}

		case 'resendRequested': {
			// Nowhere to send it, so there is nothing to do. Not an error: the
			// surface simply does not offer a resend when it never learned the
			// address.
			if (state.email === null || state.resendStatus === 'sending') {
				return [state, Effect.none()];
			}

			const email = state.email;

			return [
				{ ...state, resendStatus: 'sending', resendError: null },
				Effect.cancellable<EmailVerificationAction>(
					RESEND_EFFECT_ID,
					async (dispatch, signal) => {
						try {
							await deps.resendVerification(email, signal);
							dispatch({ type: 'resendSucceeded' });
						} catch (error) {
							dispatch({ type: 'resendFailed', error: toAuthError(error) });
						}
					}
				)
			];
		}

		case 'resendSucceeded': {
			return [{ ...state, resendStatus: 'sent', resendError: null }, Effect.none()];
		}

		case 'resendFailed': {
			return [{ ...state, resendStatus: 'idle', resendError: action.error }, Effect.none()];
		}

		case 'errorDismissed': {
			// `state` unchanged when there is nothing to clear: an identical object
			// still notifies every subscriber.
			if (state.error === null && state.resendError === null) {
				return [state, Effect.none()];
			}
			return [{ ...state, error: null, resendError: null }, Effect.none()];
		}

		default: {
			const _exhaustive: never = action;
			void _exhaustive;
			return [state, Effect.none()];
		}
	}
};

/**
 * A store for one confirmation.
 *
 * @example
 * ```ts
 * import { createEmailVerificationStore, tokenFromUrl } from '@composable-svelte/auth';
 * import { createHttpAuthDeps } from '@composable-svelte/auth/http';
 *
 * const verification = createEmailVerificationStore(createHttpAuthDeps(), 'ada@example.com');
 * const token = tokenFromUrl(window.location.href);
 * if (token !== null) verification.dispatch({ type: 'verificationRequested', token });
 * ```
 */
export function createEmailVerificationStore(
	deps: EmailVerificationDependencies,
	email: string | null = null
): Store<EmailVerificationState, EmailVerificationAction> {
	return createStore({
		initialState: createInitialEmailVerificationState(email),
		reducer: emailVerificationReducer,
		dependencies: deps
	});
}

/**
 * The confirmation token from a URL, or `null`.
 *
 * A convenience, not a requirement — the token is an ordinary query parameter
 * and a router will already have parsed it. It exists because the alternative
 * is every consumer writing the same `URLSearchParams` line, and because taking
 * a full URL rather than reading `window.location` keeps it usable on a server
 * and in a test.
 */
export function tokenFromUrl(url: string, parameter = 'token'): string | null {
	try {
		const value = new URL(url).searchParams.get(parameter);
		// An empty parameter is a missing one. `?token=` reaches here when a mail
		// client mangles the link, and sending "" to the backend just produces a
		// confusing failure.
		return value === null || value === '' ? null : value;
	} catch {
		// Not a URL at all. Callers pass `window.location.href`, but a test or a
		// server-side caller can pass anything.
		return null;
	}
}
