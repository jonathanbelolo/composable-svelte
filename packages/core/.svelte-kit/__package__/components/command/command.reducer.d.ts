/**
 * Command Palette Reducer
 *
 * Manages command palette state including search, filtering, and keyboard navigation.
 */
import type { Reducer } from '../../types.js';
import type { CommandState, CommandAction, CommandDependencies } from './command.types.js';
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
export declare const commandReducer: Reducer<CommandState, CommandAction, CommandDependencies>;
//# sourceMappingURL=command.reducer.d.ts.map