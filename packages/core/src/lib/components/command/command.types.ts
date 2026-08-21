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
export type CommandAction =
	| { type: 'opened' }
	| { type: 'closed' }
	// `toggled` was removed: `open` is $bindable, so a consumer opens and closes
	// by binding it. The action was only reachable from inside the palette —
	// where it could only ever close — so it did half of what its name said.

	| { type: 'queryChanged'; query: string }
	| { type: 'commandsUpdated'; commands: CommandItem[]; groups?: CommandGroup[] | undefined }
	| { type: 'nextCommand' } // Arrow down
	| { type: 'previousCommand' } // Arrow up
	| { type: 'selectCommand'; index: number }
	| { type: 'executeCommand'; index?: number } // Execute selected or specific command
	| { type: 'clearQuery' }
	| { type: 'reset' }
	| { type: 'presentation'; event: PresentationEvent };

/**
 * Command Palette Dependencies.
 */
export interface CommandDependencies {
	/**
	 * Callback when a command is executed.
	 * Receives the command item and can dispatch actions.
	 */
	onCommandExecute?: ((command: CommandItem, dispatch: (action: any) => void) => void) | undefined;

	/**
	 * Optional custom filter function.
	 * If not provided, uses default fuzzy search.
	 */
	filterFunction?: ((commands: CommandItem[], query: string) => CommandItem[]) | undefined;
}

/**
 * Create initial command palette state.
 */
export function createInitialCommandState(config?: {
	commands?: CommandItem[] | undefined;
	groups?: CommandGroup[] | undefined;
	isOpen?: boolean | undefined;
	caseSensitive?: boolean | undefined;
	maxResults?: number | undefined;
}): CommandState {
	const commands = config?.commands ?? [];

	return {
		commands,
		...(config?.groups !== undefined && { groups: config.groups }),
		query: '',
		// Bounded from the start. This used to hand back the unbounded list, so
		// a palette exceeded its own `maxResults` before the user typed anything.
		// Through the same path every other reset uses, so the initial list is
		// grouped and bounded exactly like the ones that follow it.
		filteredCommands: applyFilter(
			{
				...(config?.groups !== undefined && { groups: config.groups }),
				...(config?.maxResults !== undefined && { maxResults: config.maxResults }),
				caseSensitive: config?.caseSensitive ?? false
			},
			commands,
			'',
			undefined
		),
		selectedIndex: 0,
		isOpen: config?.isOpen ?? false,
		// Must agree with `isOpen`. `Command.svelte` renders on
		// `presentation.status !== 'idle'`, and its prop-sync effect is guarded
		// on `$store.isOpen !== open` — already satisfied at mount, so nothing
		// ever dispatched `opened` to move presentation off idle. An
		// initially-open palette therefore rendered nothing at all.
		//
		// `presented`, not `presenting`: this is the state the reducer settles
		// on once an open animation finishes (`command.reducer.ts:309-317`), and
		// there is no prior frame for an initially-open palette to animate from.
		//
		// Coupled invariant: because this skips the `presenting` branch of
		// `Command.svelte`'s animation effect, that component must seed
		// `lastAnimatedContent` from this value or the palette loses its
		// *dismissal* animation. It does, and the parity test in
		// `tests/command-initially-open.test.ts` pins it.
		//
		// (`presenting` would also work — the component dispatches
		// `presentationCompleted` itself once `animateModalIn` resolves, so it
		// does not stall. It is simply the wrong description of an already-open
		// palette.)
		presentation: config?.isOpen
			? ({ status: 'presented', content: true } as const)
			: ({ status: 'idle' } as const),
		caseSensitive: config?.caseSensitive ?? false,
		...(config?.maxResults !== undefined && { maxResults: config.maxResults })
	};
}

/**
 * The single place `filteredCommands` is computed.
 *
 * Filter, then order by group, then bound by `maxResults`. It exists because
 * `maxResults` was applied by two cases and ignored by six others plus the
 * state factory — so the palette silently exceeded its own limit after every
 * open, close, clear, reset and execute.
 *
 * Ordering happens HERE and not in the view, which is load-bearing:
 * `nextCommand`, `selectCommand` and `executeCommand` all index into
 * `filteredCommands`, so sorting anywhere else would make the highlighted item
 * and the executed item disagree.
 */
export function applyFilter(
	state: Pick<CommandState, 'groups' | 'maxResults' | 'caseSensitive'>,
	commands: CommandItem[],
	query: string,
	deps?: CommandDependencies
): CommandItem[] {
	const filtered = deps?.filterFunction
		? deps.filterFunction(commands, query)
		: defaultFilterFunction(commands, query, { caseSensitive: state.caseSensitive });

	// Ungrouped first, then each declared group in order, then any command whose
	// group matches no declaration — each bucket keeping its original order.
	const order = new Map((state.groups ?? []).map((g, i) => [g.id, i]));
	const rank = (command: CommandItem) => {
		if (!command.group) return -1;
		return order.get(command.group) ?? order.size;
	};
	const ordered =
		state.groups && state.groups.length > 0
			? filtered
					.map((command, i) => ({ command, i }))
					.sort((x, y) => rank(x.command) - rank(y.command) || x.i - y.i)
					.map(({ command }) => command)
			: filtered;

	return state.maxResults ? ordered.slice(0, state.maxResults) : ordered;
}

/**
 * Default fuzzy filter function for commands.
 * Matches query against label, description, and keywords.
 */
export function defaultFilterFunction(
	commands: CommandItem[],
	query: string,
	options?: { caseSensitive?: boolean }
): CommandItem[] {
	if (!query.trim()) {
		return commands;
	}

	// `caseSensitive` was state nothing read: this lowercased unconditionally.
	// A consumer-supplied `filterFunction` stays two-argument and owns its own
	// semantics — passing it a flag it never asked for would be a new lie.
	const caseSensitive = options?.caseSensitive ?? false;
	const fold = (value: string) => (caseSensitive ? value : value.toLowerCase());
	const needle = fold(query);

	return commands.filter((command) => {
		if (command.disabled) {
			return false;
		}

		// Search in label
		if (fold(command.label).includes(needle)) {
			return true;
		}

		// Search in description
		if (command.description && fold(command.description).includes(needle)) {
			return true;
		}

		// Search in keywords
		if (command.keywords?.some((keyword) => fold(keyword).includes(needle))) {
			return true;
		}

		return false;
	});
}

/**
 * Get the currently selected command.
 */
export function getSelectedCommand(state: CommandState): CommandItem | null {
	if (state.selectedIndex < 0 || state.selectedIndex >= state.filteredCommands.length) {
		return null;
	}

	return state.filteredCommands[state.selectedIndex] ?? null;
}
