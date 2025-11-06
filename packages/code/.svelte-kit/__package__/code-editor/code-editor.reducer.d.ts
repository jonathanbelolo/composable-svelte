/**
 * CodeEditor Reducer
 *
 * Pure reducer function following Composable Svelte architecture
 * - ALL state in store (no component $state)
 * - Pure functions with immutable updates
 * - Effects as data structures
 * - Exhaustiveness checking
 */
import type { Reducer } from '@composable-svelte/core';
import type { CodeEditorState, CodeEditorAction, CodeEditorDependencies } from './code-editor.types';
/**
 * CodeEditor Reducer
 *
 * Handles all state transitions for the code editor component
 *
 * @example
 * ```typescript
 * const store = createStore({
 *   initialState: createInitialState({ value: 'const x = 5;' }),
 *   reducer: codeEditorReducer,
 *   dependencies: {
 *     onSave: async (value) => await api.saveCode(value),
 *     formatter: async (code, lang) => await prettier.format(code)
 *   }
 * });
 * ```
 */
export declare const codeEditorReducer: Reducer<CodeEditorState, CodeEditorAction, CodeEditorDependencies>;
//# sourceMappingURL=code-editor.reducer.d.ts.map