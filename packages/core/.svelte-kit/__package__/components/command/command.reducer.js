/**
 * Command Palette Reducer
 *
 * Manages command palette state including search, filtering, and keyboard navigation.
 */
import { Effect } from '../../effect.js';
import { defaultFilterFunction } from './command.types.js';
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
export const commandReducer = (state, action, deps) => {
    const animationDuration = 0.15; // Modal-like animation duration in seconds
    switch (action.type) {
        case 'opened': {
            // Start presentation animation
            return [
                {
                    ...state,
                    isOpen: true,
                    query: '',
                    filteredCommands: state.commands,
                    selectedIndex: 0,
                    presentation: {
                        status: 'presenting',
                        content: true,
                        duration: animationDuration
                    }
                },
                // Dispatch completion after animation
                Effect.run(async (dispatch) => {
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
                    Effect.run(async (dispatch) => {
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
                    filteredCommands: state.commands,
                    selectedIndex: 0,
                    presentation: { status: 'idle' }
                },
                Effect.none()
            ];
        }
        case 'toggled': {
            // Toggle by dispatching open or close
            const newIsOpen = !state.isOpen;
            if (newIsOpen) {
                // Dispatch 'opened' action to trigger animation
                return commandReducer(state, { type: 'opened' }, deps);
            }
            else {
                // Dispatch 'closed' action to trigger animation
                return commandReducer(state, { type: 'closed' }, deps);
            }
        }
        case 'queryChanged': {
            const filterFn = deps?.filterFunction ?? defaultFilterFunction;
            let filtered = filterFn(state.commands, action.query);
            // Apply max results limit
            if (state.maxResults && filtered.length > state.maxResults) {
                filtered = filtered.slice(0, state.maxResults);
            }
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
            const filterFn = deps?.filterFunction ?? defaultFilterFunction;
            let filtered = filterFn(action.commands, state.query);
            // Apply max results limit
            if (state.maxResults && filtered.length > state.maxResults) {
                filtered = filtered.slice(0, state.maxResults);
            }
            return [
                {
                    ...state,
                    commands: action.commands,
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
            const prevIndex = state.selectedIndex === 0
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
            const newState = {
                ...state,
                isOpen: false,
                query: '',
                filteredCommands: state.commands,
                selectedIndex: 0
            };
            // Execute command via dependency or callback
            const effect = Effect.run(async (dispatch) => {
                if (deps?.onCommandExecute) {
                    deps.onCommandExecute(command, dispatch);
                }
                else if (command.onSelect) {
                    command.onSelect();
                }
                else if (command.action) {
                    dispatch(command.action);
                }
            });
            return [newState, effect];
        }
        case 'clearQuery': {
            return [
                {
                    ...state,
                    query: '',
                    filteredCommands: state.commands,
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
                    filteredCommands: state.commands,
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
                        filteredCommands: state.commands,
                        selectedIndex: 0,
                        presentation: { status: 'idle' }
                    },
                    Effect.none()
                ];
            }
            return [state, Effect.none()];
        }
        default: {
            const _exhaustive = action;
            return [state, Effect.none()];
        }
    }
};
