/**
 * Collapsible Reducer
 *
 * State management for collapsible component (single expandable section).
 *
 * @packageDocumentation
 */

import type { Reducer } from '../../../types.js';
import { Effect } from '../../../effect.js';
import type {
	CollapsibleState,
	CollapsibleAction,
	CollapsibleDependencies
} from './collapsible.types.js';

/**
 * Collapsible reducer with expand/collapse logic.
 *
 * Handles:
 * - Toggle between expanded/collapsed
 * - Explicit expand/collapse
 * - Disabled state
 * - Callbacks for expand/collapse
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: createInitialCollapsibleState(false),
 *   reducer: collapsibleReducer,
 *   dependencies: {
 *     onExpand: () => console.log('Expanded'),
 *     onCollapse: () => console.log('Collapsed')
 *   }
 * });
 * ```
 */
export const collapsibleReducer: Reducer<
	CollapsibleState,
	CollapsibleAction,
	CollapsibleDependencies
> = (state, action, deps) => {
	switch (action.type) {
		case 'toggled': {
			if (state.disabled) {
				return [state, Effect.none<CollapsibleAction>()];
			}

			const newIsExpanded = !state.isExpanded;

			const effect =
				newIsExpanded && deps?.onExpand
					? Effect.run<CollapsibleAction>(async () => {
							deps.onExpand?.();
						})
					: !newIsExpanded && deps?.onCollapse
						? Effect.run<CollapsibleAction>(async () => {
								deps.onCollapse?.();
							})
						: Effect.none<CollapsibleAction>();

			return [
				{
					...state,
					isExpanded: newIsExpanded
				},
				effect
			];
		}

		case 'expanded': {
			if (state.disabled || state.isExpanded) {
				return [state, Effect.none<CollapsibleAction>()];
			}

			const effect = deps?.onExpand
				? Effect.run<CollapsibleAction>(async () => {
						deps.onExpand?.();
					})
				: Effect.none<CollapsibleAction>();

			return [
				{
					...state,
					isExpanded: true
				},
				effect
			];
		}

		case 'collapsed': {
			if (state.disabled || !state.isExpanded) {
				return [state, Effect.none<CollapsibleAction>()];
			}

			const effect = deps?.onCollapse
				? Effect.run<CollapsibleAction>(async () => {
						deps.onCollapse?.();
					})
				: Effect.none<CollapsibleAction>();

			return [
				{
					...state,
					isExpanded: false
				},
				effect
			];
		}

		case 'disabledChanged': {
			return [
				{
					...state,
					disabled: action.disabled
				},
				Effect.none<CollapsibleAction>()
			];
		}

		default: {
			const _exhaustive: never = action;
			return [state, Effect.none<CollapsibleAction>()];
		}
	}
};
