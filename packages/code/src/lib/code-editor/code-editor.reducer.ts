/**
 * CodeEditor Reducer
 *
 * Pure reducer function following Composable Svelte architecture
 * - ALL state in store (no component $state)
 * - Pure functions with immutable updates
 * - Effects as data structures
 * - Exhaustiveness checking
 */

import { Effect } from '@composable-svelte/core';
import type { Reducer } from '@composable-svelte/core';
import type {
	CodeEditorState,
	CodeEditorAction,
	CodeEditorDependencies
} from './code-editor.types';

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
export const codeEditorReducer: Reducer<
	CodeEditorState,
	CodeEditorAction,
	CodeEditorDependencies
> = (state, action, deps) => {
	switch (action.type) {
		// Content changes
		case 'valueChanged':
			return [
				{
					...state,
					value: action.value,
					cursorPosition: action.cursorPosition || state.cursorPosition,
					hasUnsavedChanges: action.value !== state.lastSavedValue
				},
				Effect.none()
			];

		case 'languageChanged':
			return [{ ...state, language: action.language }, Effect.none()];

		// Cursor & Selection
		case 'cursorMoved':
			return [{ ...state, cursorPosition: action.position }, Effect.none()];

		case 'selectionChanged':
			return [{ ...state, selection: action.selection }, Effect.none()];

		// Editing actions
		case 'undo':
			// Note: CodeMirror handles the actual undo operation internally
			// Our reducer just updates the state flags
			return [{ ...state, canRedo: true }, Effect.none()];

		case 'redo':
			// Note: CodeMirror handles the actual redo operation internally
			// Our reducer just updates the state flags
			return [{ ...state, canUndo: true }, Effect.none()];

		case 'insertText':
			// This action is primarily for testing or programmatic text insertion
			// The actual insertion would be handled by CodeMirror, which would then
			// dispatch a 'valueChanged' action
			return [state, Effect.none()];

		case 'deleteSelection':
			// Similar to insertText - handled by CodeMirror
			return [state, Effect.none()];

		case 'selectAll':
			// Handled by CodeMirror
			return [state, Effect.none()];

		// Configuration
		case 'themeChanged':
			return [{ ...state, theme: action.theme }, Effect.none()];

		case 'toggleLineNumbers':
			return [{ ...state, showLineNumbers: !state.showLineNumbers }, Effect.none()];

		case 'toggleAutocomplete':
			return [{ ...state, enableAutocomplete: !state.enableAutocomplete }, Effect.none()];

		case 'setReadOnly':
			return [{ ...state, readOnly: action.readOnly }, Effect.none()];

		case 'tabSizeChanged':
			return [{ ...state, tabSize: action.size }, Effect.none()];

		// Focus
		case 'focused':
			return [{ ...state, isFocused: true }, Effect.none()];

		case 'blurred':
			return [{ ...state, isFocused: false }, Effect.none()];

		// Save
		case 'save':
			// Guard: don't save if no changes
			if (!state.hasUnsavedChanges) {
				return [state, Effect.none()];
			}

			return [
				{ ...state, saveError: null },
				Effect.run(async (dispatch) => {
					try {
						if (deps.onSave) {
							await deps.onSave(state.value);
						}
						dispatch({ type: 'saved', value: state.value });
					} catch (e) {
						const error = e instanceof Error ? e.message : 'Save failed';
						dispatch({ type: 'saveFailed', error });
					}
				})
			];

		case 'saved':
			return [
				{
					...state,
					lastSavedValue: action.value,
					hasUnsavedChanges: false,
					saveError: null
				},
				Effect.none()
			];

		case 'saveFailed':
			return [{ ...state, saveError: action.error }, Effect.none()];

		// Format
		case 'format':
			// Guard: don't format if read-only
			if (state.readOnly) {
				return [state, Effect.none()];
			}

			return [
				{ ...state, formatError: null },
				Effect.run(async (dispatch) => {
					try {
						if (deps.formatter) {
							const formatted = await deps.formatter(state.value, state.language);
							dispatch({ type: 'formatted', value: formatted });
						} else {
							// No formatter provided - just no-op
							dispatch({ type: 'formatFailed', error: 'No formatter configured' });
						}
					} catch (e) {
						const error = e instanceof Error ? e.message : 'Format failed';
						dispatch({ type: 'formatFailed', error });
					}
				})
			];

		case 'formatted':
			return [
				{
					...state,
					value: action.value,
					hasUnsavedChanges: action.value !== state.lastSavedValue,
					formatError: null
				},
				Effect.none()
			];

		case 'formatFailed':
			return [{ ...state, formatError: action.error }, Effect.none()];

		default:
			// Exhaustiveness check - ensures all actions are handled
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const _never: never = action;
			return [state, Effect.none()];
	}
};
