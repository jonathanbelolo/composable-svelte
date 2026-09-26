/**
 * What a chat component or hook accepts as its `store`, and how it notices
 * that a managed owner has retired.
 *
 * Package-internal: not re-exported from any entry point.
 *
 * Chat components need two capabilities, and both kinds of store have them:
 * `subscribe` (for `$store`) and `dispatch`. None of them observes actions.
 * Business results reach an application through its own reducer: under managed
 * composition the parent reducer receives every action its chat child reduces.
 * So nothing here imports a runtime value from `@composable-svelte/core`; the
 * union below is type-only.
 */
import type { Store } from '@composable-svelte/core';
import type { ChildView } from '@composable-svelte/core/application';

/**
 * A standalone `Store`, or the managed `ChildView` a feature view receives
 * (`FeatureViewProps.store`, `composition.bind`, typed `scopeTo`).
 *
 * A managed view's state is `undefined` once its owner retires (removed,
 * replaced, or the root destroyed). Every reader treats it as `S | undefined`,
 * and a component renders nothing once it is gone. A standalone `Store` never
 * reports `undefined`.
 */
export type ViewStore<S, A> = Store<S, A> | ChildView<S, A>;

/**
 * Call `onRetired` once, the first time `source` reports no state: a managed
 * owner retiring. Never fires for a standalone `Store`.
 *
 * Managed views notify synchronously on subscribe, and once more with
 * `undefined` when the owner retires. A source that is already retired
 * therefore fires immediately.
 *
 * @returns Stops watching. Idempotent, and safe to call from `onRetired`.
 */
export function watchRetirement<S, A>(source: ViewStore<S, A>, onRetired: () => void): () => void {
	return followOwner(source, () => {}, onRetired);
}

/**
 * `watchRetirement`, also handing each live state to `onState` until then —
 * the last state an owner had is all that is left to read once it retires.
 *
 * Both kinds of store notify synchronously on subscribe, so `onState` (or, for
 * a retired view, `onRetired`) has run once before this returns.
 */
export function followOwner<S, A>(
	source: ViewStore<S, A>,
	onState: (state: S) => void,
	onRetired: () => void
): () => void {
	let done = false;
	let unsubscribe: (() => void) | undefined;
	const stop = () => {
		const release = unsubscribe;
		unsubscribe = undefined;
		release?.();
	};
	const listener = (state: S | undefined) => {
		if (done) return;
		if (state !== undefined) return onState(state);
		done = true;
		stop();
		onRetired();
	};
	// Every member of the union accepts this listener, but TypeScript cannot
	// call a union of signatures whose parameters differ.
	const subscribe = source.subscribe as
		| ((listener: (state: S | undefined) => void) => () => void)
		| undefined;
	// The collaborative hooks only ever needed `dispatch`, so a hand-rolled
	// `{ dispatch }` cast to `Store` worked. It cannot retire; do not break it.
	if (typeof subscribe !== 'function') return () => {};
	unsubscribe = subscribe.call(source, listener);
	// Retired before `subscribe` returned: release what it just handed back.
	if (done) stop();
	return () => {
		done = true;
		stop();
	};
}
