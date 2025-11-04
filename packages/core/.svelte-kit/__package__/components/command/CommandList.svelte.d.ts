import type { Snippet } from 'svelte';
import type { Store } from '../../store.svelte.js';
import type { CommandState, CommandAction } from './command.types.js';
interface CommandListProps {
    /**
     * Store managing command state.
     */
    store: Store<CommandState, CommandAction>;
    /**
     * Content to render (typically CommandItem or CommandGroup components).
     */
    children?: Snippet;
    /**
     * Empty state message.
     */
    emptyMessage?: string;
    /**
     * Additional CSS classes.
     */
    class?: string;
}
/**
 * CommandList Component
 *
 * Scrollable list container for filtered commands.
 * Supports grouped and ungrouped display.
 */
declare const CommandList: import("svelte").Component<CommandListProps, {}, "">;
type CommandList = ReturnType<typeof CommandList>;
export default CommandList;
//# sourceMappingURL=CommandList.svelte.d.ts.map