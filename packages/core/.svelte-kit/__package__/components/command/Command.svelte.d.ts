import type { Snippet } from 'svelte';
import type { CommandItem } from './command.types.js';
interface CommandProps {
    /**
     * Available commands.
     */
    commands: CommandItem[];
    /**
     * Whether the command palette is open.
     * $bindable for two-way binding.
     */
    open?: boolean;
    /**
     * Callback when a command is executed.
     */
    onCommandExecute?: (command: CommandItem) => void;
    /**
     * Optional custom filter function.
     */
    filterFunction?: (commands: CommandItem[], query: string) => CommandItem[];
    /**
     * Maximum number of results to show.
     */
    maxResults?: number;
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Default content snippet.
     */
    children?: Snippet;
}
/**
 * Command Palette Component
 *
 * A reducer-driven command palette with search, keyboard navigation, and action dispatch.
 *
 * Features:
 * - Search/filter commands
 * - Keyboard navigation (Arrow Up/Down, Enter, Escape)
 * - Modal overlay with Motion One animations
 * - Custom filtering
 * - Action dispatch on command execution
 */
declare const Command: import("svelte").Component<CommandProps, {}, "open">;
type Command = ReturnType<typeof Command>;
export default Command;
//# sourceMappingURL=Command.svelte.d.ts.map