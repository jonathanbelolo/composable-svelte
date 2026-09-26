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

/** Execute one write; report transport failure separately from dispatch failure. */
const runSaveEffect = (
	onSave: ((value: string, signal?: AbortSignal) => Promise<void>) | undefined,
	snapshot: string,
	attemptId: number
) =>
	Effect.run<CodeEditorAction>(async (dispatch, signal) => {
		if (signal?.aborted) return;
		let outcome: CodeEditorAction;
		try {
			if (onSave) {
				await onSave(snapshot, signal);
			}
			outcome = { type: 'saved', value: snapshot, attemptId };
		} catch (e) {
			const error = e instanceof Error ? e.message : 'Save failed';
			outcome = { type: 'saveFailed', error, attemptId };
		}
		if (!signal?.aborted) dispatch(outcome);
	});

/**
 * Whether two values are the same editor document.
 *
 * CodeMirror splits on `\r\n`, `\r` and `\n` and reads back with `\n`, so a
 * value written from state with Windows line breaks comes back from the editor
 * with Unix ones. Treating those as different would reject every edit of such
 * a document as stale. The exact comparison is tried first, and is the only
 * cost on the common path.
 */
const sameDocument = (a: string, b: string): boolean =>
	a === b || a.replace(/\r\n?/g, '\n') === b.replace(/\r\n?/g, '\n');

/** The revision an accepted value write moves state to. */
const nextRevision = (state: CodeEditorState): number => (state.valueRevision ?? 0) + 1;

/** Whether an editor report was made before a write state has since accepted. */
const isStaleReport = (
	state: CodeEditorState,
	report: Extract<CodeEditorAction, { type: 'valueChanged' }>
): boolean =>
	(report.baseValue !== undefined && !sameDocument(report.baseValue, state.value)) ||
	(report.baseRevision !== undefined && report.baseRevision !== (state.valueRevision ?? 0));

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
			// A report from the editor names the document and the revision it was
			// edited from. If state has moved on since, a newer write was reduced
			// first (a command's echo queued behind an external load, or the echo
			// of the editor applying that load). Applying it would overwrite the
			// newer value. The revision catches a newer write that restored the
			// same text, which the document alone cannot. Reports without these
			// fields are external writes and apply.
			if (isStaleReport(state, action)) return [state, Effect.none()];
			return [
				{
					...state,
					value: action.value,
					valueRevision: nextRevision(state),
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

		// Saves are serialized. While one is active, retain only the latest explicit
		// save request. Editing alone never queues persistence. readOnly changes
		// editor input behavior, not previously requested writes or their outcomes.
		case 'save': {
			if (state.isSaving) {
				// Even a reversion to the old baseline must follow an in-flight write.
				return [{ ...state, queuedSaveValue: state.value }, Effect.none()];
			}
			if (!state.hasUnsavedChanges) return [state, Effect.none()];
			const attemptId = (state.saveAttempt ?? 0) + 1;
			return [
				{ ...state, isSaving: true, saveAttempt: attemptId, queuedSaveValue: null, saveError: null },
				runSaveEffect(deps.onSave, state.value, attemptId)
			];
		}

		case 'saved': {
			if (action.attemptId === undefined ? state.isSaving : !state.isSaving || action.attemptId !== (state.saveAttempt ?? 0)) {
				return [state, Effect.none()];
			}
			const queued = state.queuedSaveValue ?? null;
			const hasQueued = queued !== null && queued !== action.value;
			const attemptId = (state.saveAttempt ?? 0) + (hasQueued ? 1 : 0);
			return [
				{ ...state, lastSavedValue: action.value, hasUnsavedChanges: state.value !== action.value,
					saveError: null, isSaving: hasQueued, saveAttempt: attemptId, queuedSaveValue: null },
				hasQueued && queued !== null ? runSaveEffect(deps.onSave, queued, attemptId) : Effect.none()
			];
		}

		case 'saveFailed': {
			if (action.attemptId === undefined ? state.isSaving : !state.isSaving || action.attemptId !== (state.saveAttempt ?? 0)) {
				return [state, Effect.none()];
			}
			const queued = state.queuedSaveValue ?? null;
			const hasQueued = queued !== null;
			const attemptId = (state.saveAttempt ?? 0) + (hasQueued ? 1 : 0);
			return [
				{ ...state, saveError: hasQueued ? null : action.error, isSaving: hasQueued,
					saveAttempt: attemptId, queuedSaveValue: null },
				queued !== null ? runSaveEffect(deps.onSave, queued, attemptId) : Effect.none()
			];
		}

		// Format
		//
		// Latest request wins, and only over the text it was asked to format.
		// Each request takes a new `formatAttempt`; its result carries that id
		// and the input it formatted. A result is dropped if a newer request
		// started (overlapping formats resolving out of order) or if the value
		// changed while the formatter ran (an edit made during a format is
		// newer than the format). Untagged results keep the old unconditional
		// behaviour for code that dispatches `formatted` itself.
		case 'format': {
			// Guard: don't format if read-only
			if (state.readOnly) {
				return [state, Effect.none()];
			}
			const attemptId = (state.formatAttempt ?? 0) + 1;
			const input = state.value;
			const language = state.language;
			return [
				{ ...state, formatError: null, formatAttempt: attemptId },
				Effect.run<CodeEditorAction>(async (dispatch) => {
					try {
						if (deps.formatter) {
							const formatted = await deps.formatter(input, language);
							dispatch({ type: 'formatted', value: formatted, attemptId, input });
						} else {
							dispatch({ type: 'formatFailed', error: 'No formatter configured', attemptId });
						}
					} catch (e) {
						const error = e instanceof Error ? e.message : 'Format failed';
						dispatch({ type: 'formatFailed', error, attemptId });
					}
				})
			];
		}

		case 'formatted':
			if (action.attemptId !== undefined) {
				const superseded = action.attemptId !== (state.formatAttempt ?? 0);
				const edited = action.input !== undefined && action.input !== state.value;
				if (superseded || edited) return [state, Effect.none()];
			}
			return [
				{
					...state,
					value: action.value,
					valueRevision: nextRevision(state),
					hasUnsavedChanges: action.value !== state.lastSavedValue,
					formatError: null
				},
				Effect.none()
			];

		case 'formatFailed':
			if (action.attemptId !== undefined && action.attemptId !== (state.formatAttempt ?? 0)) {
				return [state, Effect.none()];
			}
			return [{ ...state, formatError: action.error }, Effect.none()];

		default:
			// Exhaustiveness check - ensures all actions are handled
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const _never: never = action;
			return [state, Effect.none()];
	}
};
