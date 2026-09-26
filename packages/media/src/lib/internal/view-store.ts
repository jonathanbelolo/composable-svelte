/**
 * What a media component accepts as its `store`, and how it observes actions.
 *
 * Internal: not reachable from any `exports` entry.
 */
import type { Store } from '@composable-svelte/core';
import { isManagedChildView, observeChildActions, type ChildView } from '@composable-svelte/core/application';

/**
 * A standalone `Store`, or the managed `ChildView` a feature view receives
 * (`FeatureViewProps.store`, `composition.bind`, typed `scopeTo`).
 *
 * A managed view's state is `undefined` once its owner retires, so every
 * component reads it as `S | undefined` and renders nothing when it is gone.
 */
export type ViewStore<S, A> = Store<S, A> | ChildView<S, A>;

const warned = new WeakSet<object>();

/**
 * Observe the actions `source` reduces, on whichever path it supports.
 *
 * 1. A genuine managed view goes to `observeChildActions`: only its own owner's
 *    actions, after the turn commits, and silently inert once the owner retires.
 * 2. A store with `subscribeToActions` uses it, as before.
 * 3. Anything else still renders; the missing capability is announced once per
 *    source instead of throwing, because a custom `Store` without the optional
 *    `subscribeToActions` has always been a valid prop.
 *
 * For a component's own outputs (a callback prop, local display history). A
 * business result the application acts on belongs in the parent reducer.
 */
export function observeActions<S, A>(
	source: ViewStore<S, A>,
	listener: (action: A) => void,
	component: string
): () => void {
	if (isManagedChildView(source)) return observeChildActions(source, listener);
	if ('subscribeToActions' in source && typeof source.subscribeToActions === 'function') {
		return source.subscribeToActions((action) => listener(action));
	}
	if (!warned.has(source)) {
		warned.add(source);
		console.warn(
			`[${component}] this store cannot report actions, so callbacks such as onTranscript will not fire. ` +
				'Pass the store you created, or the feature view you were given, unchanged. Not observable: a wrapper ' +
				'or copy of a managed view, an ApplicationStore (render through FeatureViews or FeatureOutlet), a view ' +
				'from a second copy of @composable-svelte/core, or a custom Store without subscribeToActions.'
		);
	}
	return () => {};
}
