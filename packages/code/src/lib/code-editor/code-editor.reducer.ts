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
} from './code-editor.types.js';

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
			// Clears any previous load failure: picking a language is the retry.
			return [{ ...state, language: action.language, error: null }, Effect.none()];

		// Cursor & Selection
		case 'cursorMoved':
			return [{ ...state, cursorPosition: action.position }, Effect.none()];

		case 'selectionChanged':
			return [{ ...state, selection: action.selection }, Effect.none()];

		// Editing actions
		// === Command markers ===
		//
		// These five carry no state change. They are *commands*: the view
		// subscribes to the action stream and performs the corresponding
		// CodeMirror operation, which then reports back through the update
		// listener as `valueChanged` / `selectionChanged` / `historyChanged`.
		//
		// Returning the identical `state` is deliberate — `dispatchCore` only
		// notifies subscribers when the object changes, so a command costs no
		// re-render. `undo` used to set `canRedo` and `redo` used to set
		// `canUndo` (inverted), and nothing read either.
		case 'undo':
		case 'redo':
		case 'focus':
		case 'blur':
		case 'insertText':
		case 'deleteSelection':
		case 'selectAll':
			return [state, Effect.none()];

		case 'languageLoadFailed':
			// Makes the error banner reachable. It was declared, initialised, and
			// set by nothing — while the one place a failure occurred swallowed it.
			return [
				{ ...state, error: `Failed to load ${action.language}: ${action.error}` },
				Effect.none()
			];

		case 'historyChanged':
			// Reported by the editor's update listener, edge-triggered on the
			// boolean flipping — not on every keystroke.
			if (state.canUndo === action.canUndo && state.canRedo === action.canRedo) {
				return [state, Effect.none()];
			}
			return [{ ...state, canUndo: action.canUndo, canRedo: action.canRedo }, Effect.none()];

		// Configuration
		case 'themeChanged':
			return [{ ...state, theme: action.theme }, Effect.none()];

		case 'toggleLineNumbers':
			return [{ ...state, showLineNumbers: !state.showLineNumbers }, Effect.none()];

		case 'toggleAutocomplete':
			return [{ ...state, enableAutocomplete: !state.enableAutocomplete }, Effect.none()];

		case 'toggleFolding':
			return [{ ...state, enableFolding: !state.enableFolding }, Effect.none()];

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
