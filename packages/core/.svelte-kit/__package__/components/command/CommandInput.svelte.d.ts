import type { Store } from '../../store.svelte.js';
import type { CommandState, CommandAction } from './command.types.js';
interface CommandInputProps {
    /**
     * Store managing command state.
     */
    store: Store<CommandState, CommandAction>;
    /**
     * Placeholder text.
     */
    placeholder?: string;
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Whether to autofocus on mount.
     */
    autofocus?: boolean;
}
/**
 * CommandInput Component
 *
 * Search input for the command palette.
 * Dispatches queryChanged actions as user types.
 */
declare const CommandInput: import("svelte").Component<CommandInputProps, {}, "">;
type CommandInput = ReturnType<typeof CommandInput>;
export default CommandInput;
//# sourceMappingURL=CommandInput.svelte.d.ts.map