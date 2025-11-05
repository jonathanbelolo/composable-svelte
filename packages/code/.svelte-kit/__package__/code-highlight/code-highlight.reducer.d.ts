/**
 * CodeHighlight reducer
 *
 * Pure reducer function following Composable Svelte architecture
 * - ALL state in store (no component $state)
 * - Pure functions with immutable updates
 * - Effects as data structures
 * - Exhaustiveness checking
 */
import type { Reducer } from '@composable-svelte/core';
import type { CodeHighlightState, CodeHighlightAction, CodeHighlightDependencies } from './code-highlight.types';
/**
 * CodeHighlight reducer
 *
 * Handles all state transitions for the code highlighting component
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: createInitialState({ code: 'const x = 5;' }),
 *   reducer: codeHighlightReducer,
 *   dependencies: { highlightCode }
 * });
 * ```
 */
export declare const codeHighlightReducer: Reducer<CodeHighlightState, CodeHighlightAction, CodeHighlightDependencies>;
//# sourceMappingURL=code-highlight.reducer.d.ts.map