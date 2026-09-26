/** A compiled example of the managed/standalone native-command bridge. */
import type { Store } from '@composable-svelte/core';
import {
  isManagedChildView,
  observeChildActions,
  type ChildView
} from '@composable-svelte/core/application';

export type CommandSource<State, Action> = Store<State, Action> | ChildView<State, Action>;

/** Call from a mounted component; return the cleanup from its `onMount`. */
export function observeNativeCommands<State, Action>(
  source: CommandSource<State, Action>,
  run: (action: Action) => void
): () => void {
  if (isManagedChildView(source)) return observeChildActions(source, run);
  if ('subscribeToActions' in source && typeof source.subscribeToActions === 'function') {
    return source.subscribeToActions((action: Action) => run(action));
  }
  // A standalone Store may omit this optional hook. Its state still renders.
  console.warn('Native commands need a managed child view or Store.subscribeToActions.');
  return () => {};
}
