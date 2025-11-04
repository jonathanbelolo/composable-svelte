/**
 * Command Palette Types
 *
 * Defines the state, actions, and types for a reducer-driven command palette
 * with search, keyboard navigation, and action dispatch.
 */
import type { PresentationState, PresentationEvent } from '../../navigation/types.js';
/**
 * Command item representing an executable action.
 */
export interface CommandItem {
    /**
     * Unique identifier for the command.
     */
    id: string;
    /**
     * Display label for the command.
     */
    label: string;
    /**
     * Optional description or subtitle.
     */
    description?: string;
    /**
     * Optional keywords for search matching.
     */
    keywords?: string[];
    /**
     * Optional icon (component or string).
     */
    icon?: any;
    /**
     * Optional group this command belongs to.
     */
    group?: string;
    /**
     * Whether this command is disabled.
     */
    disabled?: boolean;
    /**
     * Action to dispatch when this command is selected.
     */
    action?: any;
    /**
     * Optional callback when selected (alternative to action).
     */
    onSelect?: () => void;
    /**
     * Optional keyboard shortcut display (e.g., "⌘K").
     */
    shortcut?: string;
}
/**
 * Command group for organizing related commands.
 */
export interface CommandGroup {
    /**
     * Unique identifier for the group.
     */
    id: string;
    /**
     * Display label for the group.
     */
    label: string;
    /**
     * Commands in this group.
     */
    items: CommandItem[];
}
/**
 * Command Palette State.
 */
export interface CommandState {
    /**
     * All available commands.
     */
    commands: CommandItem[];
    /**
     * Optional grouped commands.
     */
    groups?: CommandGroup[];
    /**
     * Current search query.
     */
    query: string;
    /**
     * Filtered/visible commands based on search.
     */
    filteredCommands: CommandItem[];
    /**
     * Index of the currently selected command (for keyboard nav).
     */
    selectedIndex: number;
    /**
     * Whether the command palette is open.
     */
    isOpen: boolean;
    /**
     * Presentation state for animation lifecycle.
     */
    presentation: PresentationState<true>;
    /**
     * Whether search is case-sensitive.
     */
    caseSensitive: boolean;
    /**
     * Maximum number of results to show.
     */
    maxResults?: number;
}
/**
 * Command Palette Actions.
 */
export type CommandAction = {
    type: 'opened';
} | {
    type: 'closed';
} | {
    type: 'toggled';
} | {
    type: 'queryChanged';
    query: string;
} | {
    type: 'commandsUpdated';
    commands: CommandItem[];
} | {
    type: 'nextCommand';
} | {
    type: 'previousCommand';
} | {
    type: 'selectCommand';
    index: number;
} | {
    type: 'executeCommand';
    index?: number;
} | {
    type: 'clearQuery';
} | {
    type: 'reset';
} | {
    type: 'presentation';
    event: PresentationEvent;
};
/**
 * Command Palette Dependencies.
 */
export interface CommandDependencies {
    /**
     * Callback when a command is executed.
     * Receives the command item and can dispatch actions.
     */
    onCommandExecute?: (command: CommandItem, dispatch: (action: any) => void) => void;
    /**
     * Optional custom filter function.
     * If not provided, uses default fuzzy search.
     */
    filterFunction?: (commands: CommandItem[], query: string) => CommandItem[];
}
/**
 * Create initial command palette state.
 */
export declare function createInitialCommandState(config?: {
    commands?: CommandItem[];
    groups?: CommandGroup[];
    isOpen?: boolean;
    caseSensitive?: boolean;
    maxResults?: number;
}): CommandState;
/**
 * Default fuzzy filter function for commands.
 * Matches query against label, description, and keywords.
 */
export declare function defaultFilterFunction(commands: CommandItem[], query: string): CommandItem[];
/**
 * Get the currently selected command.
 */
export declare function getSelectedCommand(state: CommandState): CommandItem | null;
//# sourceMappingURL=command.types.d.ts.map