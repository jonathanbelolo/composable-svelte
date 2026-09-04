/**
 * Session lifetime, driven by an injected clock.
 *
 * Two effect ids: the watch is long-running and cancellable on unmount, the
 * refresh is a fixed id so a second attempt supersedes rather than racing.
 */

import {
	createStore,
	createSystemClock,
	Effect,
	type Reducer,
	type Store
} from '@composable-svelte/core';

import { toAuthError } from '../../errors/helpers.js';
import type {
	SessionRefreshAction,
	SessionRefreshDependencies,
	SessionRefreshState
} from './types.js';

const WATCH_EFFECT_ID = 'auth/flows/session-refresh/watch';
const REFRESH_EFFECT_ID = 'auth/flows/session-refresh/refresh';

/** Refresh this long before the advertised expiry. */
export const DEFAULT_LEAD_MS = 60_000;
/** How often the watch looks. Also the rate floor — there is no second limiter. */
export const DEFAULT_TICK_MS = 30_000;

export function createInitialSessionRefreshState(): SessionRefreshState {
	return { status: 'idle', expiresAt: null, error: null };
}

export const sessionRefreshReducer: Reducer<
	SessionRefreshState,
	SessionRefreshAction,
	SessionRefreshDependencies
> = (state, action, deps) => {
	const refresh = (): readonly [SessionRefreshState, Effect<SessionRefreshAction>] => [
		{ ...state, status: 'refreshing', error: null },
		Effect.cancellable<SessionRefreshAction>(REFRESH_EFFECT_ID, async (dispatch, signal) => {
			try {
				const { expiresAt } = await deps.refreshSession(signal);
				dispatch({ type: 'refreshSucceeded', expiresAt });
			} catch (error) {
				dispatch({ type: 'refreshFailed', error: toAuthError(error) });
			}
		})
	];

	switch (action.type) {
		case 'watchStarted': {
			return [
				state,
				Effect.subscription<SessionRefreshAction>(WATCH_EFFECT_ID, (dispatch) => {
					// The timer lives in an effect rather than a component, because all
					// auth I/O lives in store effects and because `Effect.subscription`
					// is cancellable by id with cleanup on store destroy.
					let timer: ReturnType<typeof setInterval> | undefined;

					const start = (): void => {
						timer ??= setInterval(() => dispatch({ type: 'ticked' }), deps.tickMs);
					};
					const stop = (): void => {
						if (timer !== undefined) {
							clearInterval(timer);
							timer = undefined;
						}
					};

					const onVisibility = (): void => {
						if (document.visibilityState === 'visible') {
							start();
							// A tab returning after an hour re-evaluates immediately rather
							// than waiting up to a full tick — and it may be returning past
							// the expiry.
							dispatch({ type: 'ticked' });
						} else {
							// A backgrounded tab burns no timer at all. Browsers throttle
							// these to about once a minute anyway; clearing is the honest
							// version of that.
							stop();
						}
					};

					if (typeof document === 'undefined') {
						// No document: nothing to watch and nothing to clean up. Effects do
						// not run during SSR, so this is belt and braces.
						return () => {};
					}

					if (document.visibilityState === 'visible') start();
					document.addEventListener('visibilitychange', onVisibility);

					return () => {
						stop();
						document.removeEventListener('visibilitychange', onVisibility);
					};
				})
			];
		}

		case 'watchStopped': {
			return [state, Effect.cancel(WATCH_EFFECT_ID)];
		}

		case 'ticked': {
			// Pure over the injected clock, which is what makes this testable with
			// `createMockClock` and no timers at all.
			if (state.status !== 'idle' || state.expiresAt === null) {
				return [state, Effect.none()];
			}

			const expiry = deps.clock.fromISO(state.expiresAt);
			// A backend that sent nonsense is inert rather than a crash.
			if (expiry === null) return [state, Effect.none()];

			if (expiry - deps.clock.now() > deps.leadMs) return [state, Effect.none()];

			return refresh();
		}

		case 'refreshRequested': {
			if (state.status !== 'idle') return [state, Effect.none()];
			return refresh();
		}

		case 'expiryObserved': {
			// Identical object when unchanged: the surface dispatches this from an
			// effect, and a fresh object each time re-triggers it forever.
			if (state.expiresAt === action.expiresAt) return [state, Effect.none()];

			// A value arriving while `ended` means a session exists again — a fresh
			// sign-in — so this is not a dead end. The `mfaObserved` shape.
			const status = state.status === 'ended' && action.expiresAt !== null ? 'idle' : state.status;
			return [{ ...state, status, expiresAt: action.expiresAt }, Effect.none()];
		}

		case 'refreshSucceeded': {
			return [{ status: 'idle', expiresAt: action.expiresAt, error: null }, Effect.none()];
		}

		case 'refreshFailed': {
			// **The only failure that means "stop asking".** A `network` blip may
			// mean the request never arrived, and turning that into a sign-out would
			// sign someone out of a working session because their wifi dropped. The
			// session reducer fails *closed* on a resolve, which is exactly why this
			// one must not fire on a maybe.
			const ended = action.error.code === 'invalid_credentials';

			return [
				ended
					? { status: 'ended', expiresAt: null, error: action.error }
					: { ...state, status: 'idle', error: action.error },
				Effect.none()
			];
		}

		case 'errorDismissed': {
			return [state.error === null ? state : { ...state, error: null }, Effect.none()];
		}

		default: {
			const _exhaustive: never = action;
			void _exhaustive;
			return [state, Effect.none()];
		}
	}
};

/**
 * A store for session-lifetime management.
 *
 * @example
 * ```ts
 * import { createSessionRefreshStore } from '@composable-svelte/auth';
 * import { createHttpAuthDeps } from '@composable-svelte/auth/http';
 *
 * const refresh = createSessionRefreshStore({
 *   refreshSession: createHttpAuthDeps().refreshSession
 * });
 * ```
 */
export function createSessionRefreshStore(
	deps: Pick<SessionRefreshDependencies, 'refreshSession'> &
		Partial<Omit<SessionRefreshDependencies, 'refreshSession'>>
): Store<SessionRefreshState, SessionRefreshAction> {
	return createStore({
		initialState: createInitialSessionRefreshState(),
		reducer: sessionRefreshReducer,
		dependencies: {
			refreshSession: deps.refreshSession,
			clock: deps.clock ?? createSystemClock(),
			leadMs: deps.leadMs ?? DEFAULT_LEAD_MS,
			tickMs: deps.tickMs ?? DEFAULT_TICK_MS
		}
	});
}
