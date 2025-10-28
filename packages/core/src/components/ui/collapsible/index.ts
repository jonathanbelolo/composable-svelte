/**
 * Collapsible component exports.
 *
 * @packageDocumentation
 */

export { default as Collapsible } from './Collapsible.svelte';
export { default as CollapsibleTrigger } from './CollapsibleTrigger.svelte';
export { default as CollapsibleContent } from './CollapsibleContent.svelte';

export type {
	CollapsibleState,
	CollapsibleAction,
	CollapsibleDependencies
} from './collapsible.types.js';

export { createInitialCollapsibleState } from './collapsible.types.js';
export { collapsibleReducer } from './collapsible.reducer.js';
