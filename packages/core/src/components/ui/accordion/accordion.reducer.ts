/**
 * Accordion Reducer
 *
 * State management for accordion component (collapsible sections).
 *
 * @packageDocumentation
 */

import type { Reducer } from '../../../types.js';
import { Effect } from '../../../effect.js';
import type {
	AccordionState,
	AccordionAction,
	AccordionDependencies
} from './accordion.types.js';

/**
 * Accordion reducer with expand/collapse logic.
 *
 * Handles:
 * - Single and multiple item expansion
 * - Radio behavior (single item at a time)
 * - Expand all / collapse all
 * - Disabled items
 * - Callbacks for expand/collapse
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: createInitialAccordionState(items),
 *   reducer: accordionReducer,
 *   dependencies: {
 *     onExpand: (id) => console.log('Expanded:', id),
 *     onCollapse: (id) => console.log('Collapsed:', id)
 *   }
 * });
 * ```
 */
export const accordionReducer: Reducer<
	AccordionState,
	AccordionAction,
	AccordionDependencies
> = (state, action, deps) => {
	switch (action.type) {
		case 'itemToggled': {
			// In composition mode, items array may be empty - check if disabled via items array if present
			const item = state.items.find((i) => i.id === action.id);
			if (item && item.disabled) {
				return [state, Effect.none<AccordionAction>()];
			}

			const isExpanded = state.expandedIds.includes(action.id);

			if (isExpanded) {
				// Collapsing - check if collapsible
				if (!state.collapsible && state.expandedIds.length === 1) {
					return [state, Effect.none<AccordionAction>()]; // Can't collapse last item
				}

				const newExpandedIds = state.expandedIds.filter((id) => id !== action.id);

				const effect = deps?.onCollapse
					? Effect.run<AccordionAction>(async () => {
							deps.onCollapse?.(action.id);
						})
					: Effect.none<AccordionAction>();

				return [
					{
						...state,
						expandedIds: newExpandedIds
					},
					effect
				];
			} else {
				// Expanding
				let newExpandedIds: string[];

				if (state.allowMultiple) {
					// Add to existing expanded items
					newExpandedIds = [...state.expandedIds, action.id];
				} else {
					// Replace existing expanded items (radio behavior)
					newExpandedIds = [action.id];
				}

				const effect = deps?.onExpand
					? Effect.run<AccordionAction>(async () => {
							deps.onExpand?.(action.id);
						})
					: Effect.none<AccordionAction>();

				return [
					{
						...state,
						expandedIds: newExpandedIds
					},
					effect
				];
			}
		}

		case 'itemExpanded': {
			const item = state.items.find((i) => i.id === action.id);
			if (item && item.disabled) {
				return [state, Effect.none<AccordionAction>()];
			}

			// Already expanded?
			if (state.expandedIds.includes(action.id)) {
				return [state, Effect.none<AccordionAction>()];
			}

			let newExpandedIds: string[];

			if (state.allowMultiple) {
				newExpandedIds = [...state.expandedIds, action.id];
			} else {
				newExpandedIds = [action.id];
			}

			const effect = deps?.onExpand
				? Effect.run<AccordionAction>(async () => {
						deps.onExpand?.(action.id);
					})
				: Effect.none<AccordionAction>();

			return [
				{
					...state,
					expandedIds: newExpandedIds
				},
				effect
			];
		}

		case 'itemCollapsed': {
			const item = state.items.find((i) => i.id === action.id);
			if (item && item.disabled) {
				return [state, Effect.none<AccordionAction>()];
			}

			// Not expanded?
			if (!state.expandedIds.includes(action.id)) {
				return [state, Effect.none<AccordionAction>()];
			}

			// Check if collapsible
			if (!state.collapsible && state.expandedIds.length === 1) {
				return [state, Effect.none<AccordionAction>()];
			}

			const newExpandedIds = state.expandedIds.filter((id) => id !== action.id);

			const effect = deps?.onCollapse
				? Effect.run<AccordionAction>(async () => {
						deps.onCollapse?.(action.id);
					})
				: Effect.none<AccordionAction>();

			return [
				{
					...state,
					expandedIds: newExpandedIds
				},
				effect
			];
		}

		case 'allExpanded': {
			// Expand all non-disabled items
			const allIds = state.items.filter((item) => !item.disabled).map((item) => item.id);

			// If allowMultiple is false, can't expand all
			if (!state.allowMultiple) {
				return [state, Effect.none<AccordionAction>()];
			}

			const newlyExpandedIds = allIds.filter((id) => !state.expandedIds.includes(id));

			// Create effects for newly expanded items
			const effects = deps?.onExpand
				? newlyExpandedIds.map((id) =>
						Effect.run<AccordionAction>(async () => {
							deps.onExpand?.(id);
						})
					)
				: [];

			return [
				{
					...state,
					expandedIds: allIds
				},
				effects.length > 0 ? Effect.batch(...effects) : Effect.none<AccordionAction>()
			];
		}

		case 'allCollapsed': {
			// Check if collapsible
			if (!state.collapsible) {
				return [state, Effect.none<AccordionAction>()];
			}

			const collapsedIds = state.expandedIds;

			// Create effects for collapsed items
			const effects = deps?.onCollapse
				? collapsedIds.map((id) =>
						Effect.run<AccordionAction>(async () => {
							deps.onCollapse?.(id);
						})
					)
				: [];

			return [
				{
					...state,
					expandedIds: []
				},
				effects.length > 0 ? Effect.batch(...effects) : Effect.none<AccordionAction>()
			];
		}

		case 'itemsChanged': {
			// Guard: if items reference hasn't changed, return same state
			if (state.items === action.items) {
				return [state, Effect.none<AccordionAction>()];
			}

			// Update items, preserve expanded state for items that still exist
			const newItemIds = new Set(action.items.map((i) => i.id));
			const newExpandedIds = state.expandedIds.filter((id) => newItemIds.has(id));

			return [
				{
					...state,
					items: action.items,
					expandedIds: newExpandedIds
				},
				Effect.none<AccordionAction>()
			];
		}

		case 'itemRegistered': {
			// Register item in composition mode (when items prop not provided)
			// Check if item already exists
			const existingItem = state.items.find((i) => i.id === action.id);
			if (existingItem) {
				return [state, Effect.none<AccordionAction>()];
			}

			// Add item to items array
			const newItem: import('./accordion.types.js').AccordionItem = {
				id: action.id,
				title: '', // Not used in composition mode
				content: '', // Not used in composition mode
				...(action.disabled !== undefined && { disabled: action.disabled })
			};

			return [
				{
					...state,
					items: [...state.items, newItem]
				},
				Effect.none<AccordionAction>()
			];
		}

		case 'itemUnregistered': {
			// Unregister item when component unmounts
			const newItems = state.items.filter((i) => i.id !== action.id);
			const newExpandedIds = state.expandedIds.filter((id) => id !== action.id);

			return [
				{
					...state,
					items: newItems,
					expandedIds: newExpandedIds
				},
				Effect.none<AccordionAction>()
			];
		}

		default: {
			const _exhaustive: never = action;
			return [state, Effect.none<AccordionAction>()];
		}
	}
};
