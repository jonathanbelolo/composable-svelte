import type { Store } from '../../store.svelte.js';
import type { CommandState, CommandAction, CommandItem } from './command.types.js';
interface CommandItemProps {
    /**
     * Store managing command state.
     */
    store: Store<CommandState, CommandAction>;
    /**
     * Command data.
     */
    command: CommandItem;
    /**
     * Index in the filtered list.
     */
    index: number;
    /**
     * Additional CSS classes.
     */
    class?: string;
}
/**
 * CommandItem Component
 *
 * Individual command item with selection state.
 * Displays icon, label, description, and optional shortcut.
 */
declare const CommandItem: import("svelte").Component<CommandItemProps, {}, "">;
type CommandItem = ReturnType<typeof CommandItem>;
export default CommandItem;
//# sourceMappingURL=CommandItem.svelte.d.ts.map