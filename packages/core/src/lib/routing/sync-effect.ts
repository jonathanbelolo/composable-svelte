/**
 * URL Sync Effect - State → URL Updates
 *
 * This module provides effects that update the browser URL when state changes.
 * Part of Phase 7: URL Synchronization (Browser History Integration)
 *
 * @module routing/sync-effect
 */

import { Effect } from '../effect.js';
import type { Effect as EffectType } from '../types.js';

/**
 * Normalize query string for comparison.
 *
 * Sorts parameters alphabetically to ensure consistent comparison
 * regardless of parameter order.
 *
 * @param query - Query string (without leading '?')
 * @returns Normalized query string with sorted parameters
 *
 * @example
 * ```typescript
 * normalizeQueryString('b=2&a=1');
 * // → 'a=1&b=2'
 *
 * normalizeQueryString('');
 * // → ''
 * ```
 */
function normalizeQueryString(query: string): string {
	if (!query) return '';
	return query.split('&').sort().join('&');
}



/**
 * Options for URL sync effect.
 */
export interface URLSyncOptions {
	/**
	 * Use replaceState instead of pushState (no history entry).
	 * @default false
	 */
	replace?: boolean;

	/**
	 * Debounce URL updates to prevent thrashing.
	 * Only use for high-frequency state updates (e.g., slider, typing).
	 * @default undefined (no debouncing)
	 */
	debounceMs?: number;

	/**
	 * Optional: Serialize query parameters.
	 * If provided, query params will be included in URL.
	 *
	 * @param state - Application state
	 * @returns Query string (without leading '?'), or empty string if no params
	 */
	serializeQuery?: <State>(state: State) => string;
}

/**
 * Create an effect that syncs state to URL.
 *
 * Compares current URL with expected URL (from state).
 * If different, updates URL using history.pushState or history.replaceState.
 *
 * Browser reads and resources are deferred to execution. Store destruction,
 * a replacement sync, or browser traversal retires a pending debounced write.
 * Replacement preserves history state; new entries start with null state.
 * Existing fragments are preserved at settlement unless the target includes one.
 * A factory is one cancellation channel per store, including scoped children.
 * Use separate factories for independent channels; they still share the browser URL.
 * Canonicalizing traversal responses must use replace:true until managed routing
 * captures traversal provenance; pushing corrections can trap the Back button.
 *
 * @param serialize - Function to serialize state to URL path
 * @param options - URL sync options (replace, debounce)
 * @returns Effect creator function
 *
 * @example
 * ```typescript
 * // Basic usage (no debouncing)
 * const urlSyncEffect = createURLSyncEffect<AppState, AppAction>(
 *   (state) => serializeDestination(state.destination, config)
 * );
 *
 * const appReducer = (state, action, deps) => {
 *   const [newState, coreEffect] = coreReducer(state, action, deps);
 *   const urlEffect = urlSyncEffect(newState);
 *   return [newState, Effect.batch(coreEffect, urlEffect)];
 * };
 *
 * // With replace (no history entry)
 * const urlSyncEffect = createURLSyncEffect<AppState, AppAction>(
 *   (state) => serializeDestination(state.destination, config),
 *   { replace: true }
 * );
 *
 * // With debouncing (for high-frequency updates)
 * const urlSyncEffect = createURLSyncEffect<AppState, AppAction>(
 *   (state) => serializeDestination(state.destination, config),
 *   { debounceMs: 300 }
 * );
 * ```
 */
export function createURLSyncEffect<State, Action>(
	serialize: (state: State) => string,
	options: URLSyncOptions = {}
): (state: State) => EffectType<Action> {
	// Identity is factory-local; resource ownership lives in each executing store.
	const delay = options.debounceMs ?? 0;
	if (typeof delay !== 'number' || !Number.isFinite(delay) || delay < 0) {
		throw new TypeError('debounceMs must be a finite non-negative number');
	}
	// Factory allocation metadata survives independent module instances without a registry.
	const identity = globalThis.crypto.getRandomValues(new Uint32Array(4));
	const effectId = `composable-url-sync-${Array.from(identity, n => n.toString(16).padStart(8, '0')).join('')}`;
	return (state) => {
		const serializedPath = serialize(state);
		const hashIndex = serializedPath.indexOf('#');
		const expectedPath = hashIndex < 0 ? serializedPath : serializedPath.slice(0, hashIndex);
		const explicitHash = hashIndex < 0 ? undefined : serializedPath.slice(hashIndex);
		const expectedQuery = options.serializeQuery?.(state) ?? '';
		const url = (expectedQuery ? `${expectedPath}?${expectedQuery}` : expectedPath) + (explicitHash ?? '');
		return Effect.cancellable<Action>(effectId, async (_dispatch, signal) => {
			if (signal?.aborted || typeof window === 'undefined') return;
			const matches = () => window.location.pathname === expectedPath &&
				normalizeQueryString(window.location.search.slice(1)) === normalizeQueryString(expectedQuery) &&
				(explicitHash === undefined || window.location.hash === explicitHash);
			// Even a matching target crosses the cancellation boundary, retiring a stale write.
			if (matches()) return;
			if (delay > 0) {
				const interrupted = await new Promise<boolean>((resolve) => {
					let settled = false;
					const finish = (cancelled: boolean) => {
						if (settled) return;
						settled = true;
						window.clearTimeout(timer);
						window.removeEventListener('popstate', interrupt);
						signal?.removeEventListener('abort', interrupt);
						resolve(cancelled);
					};
					const interrupt = () => finish(true);
					const timer = window.setTimeout(() => finish(false), delay);
					window.addEventListener('popstate', interrupt);
					signal?.addEventListener('abort', interrupt, { once: true });
					if (signal?.aborted) interrupt();
				});
				if (interrupted || signal?.aborted) return;
			}
			if (signal?.aborted || matches()) return;
			// pushState/replaceState do not emit popstate; no marker or history patch is needed.
			const method = options.replace ? 'replaceState' : 'pushState';
			const target = url.includes('#') ? url : url + window.location.hash;
			window.history[method](options.replace ? window.history.state : null, '', target);
		});
	};
}
