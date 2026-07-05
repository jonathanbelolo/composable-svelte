/**
 * Session store factory.
 */

import type { Store } from '@composable-svelte/core';
import { createStore } from '@composable-svelte/core';
import { createInitialSessionState, sessionReducer } from './reducer.js';
import type { SessionAction, SessionDependencies, SessionState } from './types.js';

/**
 * Create the session store over injected auth I/O.
 *
 * @example
 * ```typescript
 * import { createSessionStore, createHttpSessionDeps } from '@composable-svelte/auth';
 *
 * const session = createSessionStore(createHttpSessionDeps());
 * session.dispatch({ type: 'resolveSession' }); // at app startup
 * ```
 */
export function createSessionStore(
	deps: SessionDependencies
): Store<SessionState, SessionAction> {
	return createStore({
		initialState: createInitialSessionState(),
		reducer: sessionReducer,
		dependencies: deps
	});
}
