/**
 * Dropdown Menu Reducer
 *
 * State management for dropdown menu with keyboard navigation.
 *
 * @packageDocumentation
 */

import type { Reducer } from '../../../types.js';
import { Effect } from '../../../effect.js';
import type {
	DropdownMenuState,
	DropdownMenuAction,
	DropdownMenuDependencies
} from './dropdown-menu.types.js';

/**
 * Find next non-disabled, non-separator item index.
 */
function findNextEnabledIndex(
	items: DropdownMenuState['items'],
	startIndex: number,
	direction: 'up' | 'down'
): number {
	const increment = direction === 'down' ? 1 : -1;

	// Loop through all items
	for (let i = 0; i < items.length; i++) {
		const currentIndex = (startIndex + increment * (i + 1) + items.length) % items.length;
		const item = items[currentIndex];

		// Skip disabled and separator items
		if (!item.disabled && !item.isSeparator) {
			return currentIndex;
		}
	}

	// No enabled items found
	return -1;
}

/**
 * Dropdown menu reducer with keyboard navigation.
 *
 * Handles:
 * - Open/close/toggle
 * - Arrow key navigation (skip disabled items)
 * - Home/End navigation
 * - Enter to select
 * - Escape to close
 * - Item selection with onSelect callback
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: createInitialDropdownMenuState(items),
 *   reducer: dropdownMenuReducer,
 *   dependencies: {
 *     onSelect: (item) => console.log('Selected:', item.label)
 *   }
 * });
 *
 * // User clicks trigger
 * store.dispatch({ type: 'toggled' });
 *
 * // User presses arrow down
 * store.dispatch({ type: 'arrowDown' });
 *
 * // User presses enter
 * store.dispatch({ type: 'itemSelected', index: store.state.highlightedIndex });
 * ```
 */
export const dropdownMenuReducer: Reducer<
	DropdownMenuState,
	DropdownMenuAction,
	DropdownMenuDependencies
> = (state, action, deps) => {
	switch (action.type) {
		case 'opened': {
			return [
				{
					...state,
					isOpen: true,
					presentation: {
						status: 'presenting' as const,
						content: true,
						duration: 150
					},
					highlightedIndex: -1 // Reset highlight when opening
				},
				Effect.afterDelay(150, (dispatch) =>
					dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })
				)
			];
		}

		case 'closed': {
			// Guard: Only allow dismissal if we're in presented state
			if (state.presentation.status !== 'presented') {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					presentation: {
						status: 'dismissing' as const,
						content: state.presentation.content,
						duration: 100
					},
					highlightedIndex: -1
				},
				Effect.afterDelay(100, (dispatch) =>
					dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })
				)
			];
		}

		case 'toggled': {
			if (state.isOpen) {
				// Closing - guard and start dismissal
				if (state.presentation.status !== 'presented') {
					return [state, Effect.none()];
				}
				return [
					{
						...state,
						presentation: {
							status: 'dismissing' as const,
							content: state.presentation.content,
							duration: 100
						},
						highlightedIndex: -1
					},
					Effect.afterDelay(100, (dispatch) =>
						dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })
					)
				];
			} else {
				// Opening - start presentation
				return [
					{
						...state,
						isOpen: true,
						presentation: {
							status: 'presenting' as const,
							content: true,
							duration: 150
						},
						highlightedIndex: -1
					},
					Effect.afterDelay(150, (dispatch) =>
						dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })
					)
				];
			}
		}

		case 'itemHighlighted': {
			// Validate index and ensure item is not disabled/separator
			const item = state.items[action.index];
			if (!item || item.disabled || item.isSeparator) {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					highlightedIndex: action.index
				},
				Effect.none()
			];
		}

		case 'itemSelected': {
			const item = state.items[action.index];

			// Ignore if item is disabled, separator, or doesn't exist
			if (!item || item.disabled || item.isSeparator) {
				return [state, Effect.none()];
			}

			// Close menu after selection
			const newState: DropdownMenuState = {
				...state,
				isOpen: false,
				highlightedIndex: -1
			};

			// Call onSelect callback if provided
			if (deps.onSelect) {
				return [
					newState,
					Effect.run(async (dispatch) => {
						deps.onSelect!(item);
					})
				];
			}

			return [newState, Effect.none()];
		}

		case 'arrowDown': {
			if (!state.isOpen) {
				return [state, Effect.none()];
			}

			// If nothing highlighted, find first enabled item
			if (state.highlightedIndex === -1) {
				const firstIndex = findNextEnabledIndex(state.items, -1, 'down');
				return [
					{
						...state,
						highlightedIndex: firstIndex
					},
					Effect.none()
				];
			}

			// Find next enabled item
			const nextIndex = findNextEnabledIndex(
				state.items,
				state.highlightedIndex,
				'down'
			);

			return [
				{
					...state,
					highlightedIndex: nextIndex
				},
				Effect.none()
			];
		}

		case 'arrowUp': {
			if (!state.isOpen) {
				return [state, Effect.none()];
			}

			// If nothing highlighted, find last enabled item
			if (state.highlightedIndex === -1) {
				const lastIndex = findNextEnabledIndex(state.items, state.items.length, 'up');
				return [
					{
						...state,
						highlightedIndex: lastIndex
					},
					Effect.none()
				];
			}

			// Find previous enabled item
			const prevIndex = findNextEnabledIndex(
				state.items,
				state.highlightedIndex,
				'up'
			);

			return [
				{
					...state,
					highlightedIndex: prevIndex
				},
				Effect.none()
			];
		}

		case 'home': {
			if (!state.isOpen) {
				return [state, Effect.none()];
			}

			// Jump to first enabled item
			const firstIndex = findNextEnabledIndex(state.items, -1, 'down');

			return [
				{
					...state,
					highlightedIndex: firstIndex
				},
				Effect.none()
			];
		}

		case 'end': {
			if (!state.isOpen) {
				return [state, Effect.none()];
			}

			// Jump to last enabled item
			const lastIndex = findNextEnabledIndex(state.items, state.items.length, 'up');

			return [
				{
					...state,
					highlightedIndex: lastIndex
				},
				Effect.none()
			];
		}

		case 'escape': {
			if (!state.isOpen) {
				return [state, Effect.none()];
			}

			// Guard: Only allow dismissal if we're in presented state
			if (state.presentation.status !== 'presented') {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					presentation: {
						status: 'dismissing' as const,
						content: state.presentation.content,
						duration: 100
					},
					highlightedIndex: -1
				},
				Effect.afterDelay(100, (dispatch) =>
					dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })
				)
			];
		}

		case 'presentation': {
			if (action.event.type === 'presentationCompleted') {
				return [
					{
						...state,
						presentation: {
							status: 'presented' as const,
							content:
								state.presentation.status === 'presenting' ? state.presentation.content : true
						}
					},
					Effect.none()
				];
			}

			if (action.event.type === 'dismissalCompleted') {
				return [
					{
						...state,
						isOpen: false,
						presentation: { status: 'idle' as const }
					},
					Effect.none()
				];
			}

			return [state, Effect.none()];
		}

		default:
			return [state, Effect.none()];
	}
};
