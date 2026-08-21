/**
 * Command Palette Reducer
 *
 * Manages command palette state including search, filtering, and keyboard navigation.
 */

import { Effect } from '../../effect.js';
import type { Reducer } from '../../types.js';
import type {
	CommandState,
	CommandAction,
	CommandDependencies,
	CommandItem,
	CommandGroup
} from './command.types.js';
import { applyFilter, getSelectedCommand } from './command.types.js';

/**
 * Whether two command lists are equivalent.
 *
 * `Command.svelte` dispatches `commandsUpdated` from an unguarded `$effect`,
 * and `dispatch` reads store state inside that effect's tracking scope — so
 * returning a fresh state object on every dispatch re-triggers the effect
 * forever (`effect_update_depth_exceeded`). Comparing by reference is not
 * enough: `commands={[...]}` inline is a new array on every render.
 */
function sameCommands(a: CommandItem[], b: CommandItem[]): boolean {
	if (a === b) return true;
	if (a.length !== b.length) return false;
	return a.every((command, i) => {
		const other = b[i]!;
		return (
			command.id === other.id &&
			command.label === other.label &&
			command.description === other.description &&
			command.group === other.group &&
			command.disabled === other.disabled
		);
	});
}

/**
 * Are two group lists equal by value?
 *
 * Same reasoning as `sameCommands` — `groups={[...]}` inline is a fresh array
 * every render, and `groups` now travels in the same guarded effect.
 */
function sameGroups(a: CommandGroup[] | undefined, b: CommandGroup[] | undefined): boolean {
	if (a === b) return true;
	if (!a || !b) return false;
	if (a.length !== b.length) return false;
	return a.every((group, i) => group.id === b[i]!.id && group.label === b[i]!.label);
}

/**
 * Command Palette Reducer.
 *
 * Handles:
 * - Opening/closing the palette
 * - Search query updates with filtering
 * - Keyboard navigation (up/down arrows)
 * - Command execution
 *
 * @example
 * ```typescript
 * const reducer = commandReducer;
 * const store = createStore({
 *   initialState: createInitialCommandState({ commands }),
 *   reducer,
 *   dependencies: { onCommandExecute: (cmd, dispatch) => dispatch(cmd.action) }
 * });
 * ```
 */
export const commandReducer: Reducer<CommandState, CommandAction, CommandDependencies> = (
	state,
	action,
	deps
) => {
	const animationDuration = 0.15; // Modal-like animation duration in seconds

	switch (action.type) {
		case 'opened': {
			// Start presentation animation
			return [
				{
					...state,
					isOpen: true,
					query: '',
					filteredCommands: applyFilter(state, state.commands, '', deps),
					selectedIndex: 0,
					presentation: {
						status: 'presenting',
						content: true,
						duration: animationDuration
					}
				},
				// Dispatch completion after animation
				Effect.run<CommandAction>(async (dispatch) => {
					await new Promise((resolve) => setTimeout(resolve, animationDuration * 1000));
					dispatch({
						type: 'presentation',
						event: { type: 'presentationCompleted' }
					});
				})
			];
		}

		case 'closed': {
			// Start dismissal animation if already presented
			if (state.presentation.status === 'presented') {
				return [
					{
						...state,
						presentation: {
							status: 'dismissing',
							content: true,
							duration: animationDuration
						}
					},
					// Dispatch completion after animation
					Effect.run<CommandAction>(async (dispatch) => {
						await new Promise((resolve) => setTimeout(resolve, animationDuration * 1000));
						dispatch({
							type: 'presentation',
							event: { type: 'dismissalCompleted' }
						});
					})
				];
			}

			// Not yet presented, just close immediately
			return [
				{
					...state,
					isOpen: false,
					query: '',
					filteredCommands: applyFilter(state, state.commands, '', deps),
					selectedIndex: 0,
					presentation: { status: 'idle' }
				},
				Effect.none()
			];
		}

		case 'queryChanged': {
			const filtered = applyFilter(state, state.commands, action.query, deps);

			return [
				{
					...state,
					query: action.query,
					filteredCommands: filtered,
					// Reset selection to first result
					selectedIndex: filtered.length > 0 ? 0 : -1
				},
				Effect.none()
			];
		}

		case 'commandsUpdated': {
			// Both compared by value: this is dispatched from an unguarded
			// `$effect`, and `commands={[...]}` / `groups={[...]}` inline are
			// fresh arrays on every render. Returning the identical state is what
			// stops that effect re-triggering forever.
			if (sameCommands(state.commands, action.commands) && sameGroups(state.groups, action.groups)) {
				return [state, Effect.none()];
			}

			const nextState: CommandState = {
				...state,
				commands: action.commands,
				...(action.groups !== undefined && { groups: action.groups })
			};
			const filtered = applyFilter(nextState, action.commands, state.query, deps);

			return [
				{
					...nextState,
					filteredCommands: filtered,
					selectedIndex: Math.min(state.selectedIndex, filtered.length - 1)
				},
				Effect.none()
			];
		}

		case 'nextCommand': {
			if (state.filteredCommands.length === 0) {
				return [state, Effect.none()];
			}

			// Wrap around to beginning
			const nextIndex = (state.selectedIndex + 1) % state.filteredCommands.length;

			return [
				{
					...state,
					selectedIndex: nextIndex
				},
				Effect.none()
			];
		}

		case 'previousCommand': {
			if (state.filteredCommands.length === 0) {
				return [state, Effect.none()];
			}

			// Wrap around to end
			const prevIndex =
				state.selectedIndex === 0
					? state.filteredCommands.length - 1
					: state.selectedIndex - 1;

			return [
				{
					...state,
					selectedIndex: prevIndex
				},
				Effect.none()
			];
		}

		case 'selectCommand': {
			if (action.index < 0 || action.index >= state.filteredCommands.length) {
				return [state, Effect.none()];
			}

			return [
				{
					...state,
					selectedIndex: action.index
				},
				Effect.none()
			];
		}

		case 'executeCommand': {
			const commandIndex = action.index ?? state.selectedIndex;

			if (commandIndex < 0 || commandIndex >= state.filteredCommands.length) {
				return [state, Effect.none()];
			}

			const command = state.filteredCommands[commandIndex];

			if (!command || command.disabled) {
				return [state, Effect.none()];
			}

			// Close the palette after execution
			const newState: CommandState = {
				...state,
				isOpen: false,
				query: '',
				filteredCommands: applyFilter(state, state.commands, '', deps),
				selectedIndex: 0
			};

			// Execute command via dependency or callback
			const effect = Effect.run<CommandAction>(async (dispatch) => {
				if (deps?.onCommandExecute) {
					deps.onCommandExecute(command, dispatch);
				} else if (command.onSelect) {
					command.onSelect();
				} else if (command.action) {
					dispatch(command.action);
				}
			});

			// Route the dismissal through `closed` rather than hand-rolling it.
			// This case used to set `isOpen: false` and stop, leaving
			// `presentation` at `presented` — and the markup renders on
			// `presentation.status !== 'idle'`, so the palette stayed on screen
			// with the store believing it had closed. Executing a command is the
			// primary way a palette closes, so this was the most-used route.
			const [closedState, closeEffect] = commandReducer(newState, { type: 'closed' }, deps);

			return [closedState, Effect.batch(effect, closeEffect)];
		}

		case 'clearQuery': {
			return [
				{
					...state,
					query: '',
					filteredCommands: applyFilter(state, state.commands, '', deps),
					selectedIndex: 0
				},
				Effect.none()
			];
		}

		case 'reset': {
			return [
				{
					...state,
					query: '',
					filteredCommands: applyFilter(state, state.commands, '', deps),
					selectedIndex: 0,
					isOpen: false,
					presentation: { status: 'idle' }
				},
				Effect.none()
			];
		}

		case 'presentation': {
			if (action.event.type === 'presentationCompleted') {
				// Animation-in completed
				if (state.presentation.status !== 'presenting') {
					return [state, Effect.none()];
				}

				return [
					{
						...state,
						presentation: {
							status: 'presented',
							content: true
						}
					},
					Effect.none()
				];
			}

			if (action.event.type === 'dismissalCompleted') {
				// Animation-out completed - now actually close
				if (state.presentation.status !== 'dismissing') {
					return [state, Effect.none()];
				}

				return [
					{
						...state,
						isOpen: false,
						query: '',
						filteredCommands: applyFilter(state, state.commands, '', deps),
						selectedIndex: 0,
						presentation: { status: 'idle' }
					},
					Effect.none()
				];
			}

			return [state, Effect.none()];
		}

		default: {
			const _exhaustive: never = action;
			return [state, Effect.none()];
		}
	}
};
