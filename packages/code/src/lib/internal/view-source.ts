/**
 * The one place this package decides how a component hears its store.
 *
 * Package-internal: not re-exported from any entry point.
 *
 * Components here accept either:
 * - a standalone `Store`, or
 * - a managed `ChildView`, such as a `FeatureViewProps` store or the result
 *   of `scopeTo` / `composition.bind`.
 *
 * Two of them run native commands (CodeEditor's editing commands, NodeCanvas's
 * viewport commands), and CodeHighlight keeps a dedupe guard current. All three
 * need the actions their store reduces, and that capability has two sources:
 *
 * - **A genuine managed view:** `observeChildActions`. It delivers only this
 *   owner's actions, already unwrapped to the child's own type. A retired view
 *   is inert, not an error.
 * - **Anything else:** the store's own `subscribeToActions`, unchanged from
 *   before managed views existed.
 *
 * `subscribeToActions` is optional on `Store`, so a type-valid custom store can
 * lack it. That still renders and edits; only the action-driven behaviour is
 * lost, so it warns once per store and component rather than throwing. The
 * warning names the likely causes, because the most common one is not a custom
 * store at all but a managed view the registry does not recognise.
 *
 * Ordering comes from core, not from subscription order: both store kinds
 * notify state subscribers before action listeners within one reduction. So
 * an `onState` handler has already applied a value or a setting when an
 * action of the same turn arrives.
 */
import type { Store } from '@composable-svelte/core';
import {
	isManagedChildView,
	observeChildActions,
	type ChildView
} from '@composable-svelte/core/application';

/** What a component in this package accepts as its `store`. */
export type ViewSource<S, A> = Store<S, A> | ChildView<S, A>;

export interface ViewSourceBinding<S, A> {
	/**
	 * Committed state, synchronously. It is called once at bind time, then on
	 * every change, and always before any action of the same turn. It receives
	 * `undefined` once a managed owner has retired.
	 */
	readonly onState?: ((state: S | undefined) => void) | undefined;
	/** Each action this store reduces for the component, in order. */
	readonly onAction: (action: A) => void;
}

export interface ViewSourceIdentity {
	/** The component, for messages: `CodeEditor`. */
	readonly component: string;
	/** What stops working without actions: `undo / redo … cannot reach the editor`. */
	readonly loses: string;
}

const warned = new WeakMap<object, Set<string>>();

/** Once per store object and component, so a remount does not repeat it. */
function warnOnce(source: object, identity: ViewSourceIdentity): void {
	let components = warned.get(source);
	if (!components) {
		components = new Set();
		warned.set(source, components);
	}
	if (components.has(identity.component)) return;
	components.add(identity.component);
	console.warn(
		`[${identity.component}] this store is neither a managed child view nor a Store with ` +
			`subscribeToActions, so ${identity.loses}. It still renders and edits. Likely causes: ` +
			'a wrapper or copy of a managed view (pass the view you were given, unwrapped); ' +
			'an ApplicationStore (render the feature through FeatureViews or FeatureOutlet and ' +
			'pass its FeatureViewProps store); two copies of @composable-svelte/core, so a genuine ' +
			'view is not recognised (dedupe the dependency); or a custom Store without ' +
			'subscribeToActions (implement it).'
	);
}

/**
 * Whether `bindViewSource` can deliver this store's actions: a genuine managed
 * view, or a store with `subscribeToActions`.
 */
export function observesActions<S, A>(source: ViewSource<S, A>): boolean {
	return isManagedChildView(source) || hasSubscribeToActions(source);
}

function hasSubscribeToActions<S, A>(
	source: ViewSource<S, A>
): source is Store<S, A> & { subscribeToActions: NonNullable<Store<S, A>['subscribeToActions']> } {
	return 'subscribeToActions' in source && typeof source.subscribeToActions === 'function';
}

/**
 * Subscribe to a component's store: state first, then actions.
 *
 * @returns One cleanup that releases both subscriptions.
 */
export function bindViewSource<S, A>(
	source: ViewSource<S, A>,
	identity: ViewSourceIdentity,
	binding: ViewSourceBinding<S, A>
): () => void {
	const { onState, onAction } = binding;
	const stopState = onState ? source.subscribe(onState) : undefined;

	let stopActions: (() => void) | undefined;
	if (isManagedChildView(source)) {
		stopActions = observeChildActions(source, onAction);
	} else if (hasSubscribeToActions(source)) {
		stopActions = source.subscribeToActions((action) => onAction(action));
	} else {
		warnOnce(source, identity);
	}

	return () => {
		stopActions?.();
		stopState?.();
	};
}

/**
 * Warn, once per component instance, when the `store` prop changes identity.
 *
 * Components bind their store once, at mount. A managed view changes identity
 * when its owner is replaced, and a hand-bound view passed to an unkeyed
 * component would keep serving the retired owner, so every command is lost.
 * `FeatureViews` / `FeatureOutlet` remount per owner. A manual binding needs
 * `{#key view}`.
 */
export function warnStoreReplaced(component: string): void {
	console.warn(
		`[${component}] the store prop changed after mount. This component stays bound to the ` +
			'store it mounted with. Wrap it in {#key store} to rebind, as FeatureViews and ' +
			'FeatureOutlet do for each managed owner.'
	);
}
