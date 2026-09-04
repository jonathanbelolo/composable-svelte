/**
 * Command Palette Components
 *
 * Reducer-driven command palette with search, keyboard navigation, and action dispatch.
 *
 * @packageDocumentation
 */

export { default as Command } from './Command.svelte';
export { default as CommandInput } from './CommandInput.svelte';
export { default as CommandList } from './CommandList.svelte';
export { default as CommandGroup } from './CommandGroup.svelte';
export { default as CommandItem } from './CommandItem.svelte';
export * from './command.types.js';

/**
 * Reachable aliases for two types the component exports shadow.
 *
 * `export { default as CommandItem }` and `export * from './command.types.js'`
 * both bind the name `CommandItem` — the component wins in type position, so
 * `import type { CommandItem }` from this barrel resolves to the COMPONENT and
 * the data type could not be imported by name at all. Same for `CommandGroup`.
 * Exported public types that nobody can reach are the same defect class as an
 * exported function that does nothing.
 */
export type {
	CommandItem as CommandItemData,
	CommandGroup as CommandGroupData
} from './command.types.js';
export { commandReducer } from './command.reducer.js';
