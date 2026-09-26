/**
 * CodeHighlight reducer
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
	CodeHighlightState,
	CodeHighlightAction,
	CodeHighlightDependencies,
	SupportedLanguage
} from './code-highlight.types.js';

/**
 * Highlight `code` as `language`, reporting which input the result belongs to.
 *
 * Highlighting is supersede-only: every `init`, `codeChanged` and
 * `languageChanged` starts one, and a result is applied only while its code and
 * language are still the state's (see `isStale`). An earlier request that
 * resolves late is dropped instead of overwriting the newer result.
 */
const highlight = (
	deps: CodeHighlightDependencies,
	code: string,
	language: SupportedLanguage,
	logError = false
) =>
	Effect.run<CodeHighlightAction>(async (dispatch) => {
		try {
			const html = await deps.highlightCode(code, language);
			dispatch({ type: 'highlighted', html, code, language });
		} catch (e) {
			if (logError) console.error('[CodeHighlight] Highlighting error:', e);
			const error = e instanceof Error ? e.message : 'Highlighting failed';
			dispatch({ type: 'highlightFailed', error, code, language });
		}
	});

/** A tagged result for code or a language the state has since moved away from. */
const isStale = (
	state: CodeHighlightState,
	result: { code?: string | undefined; language?: SupportedLanguage | undefined }
): boolean =>
	(result.code !== undefined && result.code !== state.code) ||
	(result.language !== undefined && result.language !== state.language);

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
export const codeHighlightReducer: Reducer<
	CodeHighlightState,
	CodeHighlightAction,
	CodeHighlightDependencies
> = (state, action, deps) => {
	switch (action.type) {
		case 'init':
			// Trigger initial highlighting on mount
			if (state.code && !state.highlightedCode && !state.isHighlighting) {
				return [
					{ ...state, isHighlighting: true, error: null },
					highlight(deps, state.code, state.language, true)
				];
			}
			return [state, Effect.none()];

		case 'codeChanged':
			return [
				{
					...state,
					code: action.code,
					highlightedCode: null,
					isHighlighting: true,
					error: null
				},
				highlight(deps, action.code, state.language)
			];

		case 'languageChanged':
			// When language changes, re-highlight with new language
			return [
				{
					...state,
					language: action.language,
					highlightedCode: null,
					isHighlighting: true,
					error: null
				},
				highlight(deps, state.code, action.language)
			];

		case 'highlighted':
			if (isStale(state, action)) return [state, Effect.none()];
			return [{ ...state, highlightedCode: action.html, isHighlighting: false }, Effect.none()];

		case 'highlightFailed':
			if (isStale(state, action)) return [state, Effect.none()];
			return [{ ...state, error: action.error, isHighlighting: false }, Effect.none()];

		case 'themeChanged':
			return [{ ...state, theme: action.theme }, Effect.none()];

		case 'copyCode':
			return [
				{ ...state, copyStatus: 'copying' },
				Effect.run(async (dispatch) => {
					try {
						await navigator.clipboard.writeText(state.code);
						dispatch({ type: 'copyCompleted' });
					} catch (e) {
						const error = e instanceof Error ? e.message : 'Copy failed';
						dispatch({ type: 'copyFailed', error });
					}
				})
			];

		case 'copyCompleted':
			return [
				{ ...state, copyStatus: 'copied' },
				Effect.afterDelay(2000, (dispatch) => dispatch({ type: 'resetCopyStatus' }))
			];

		case 'copyFailed':
			// Keeps the message and schedules a reset, mirroring `copyCompleted`.
			// It used to drop `action.error` and leave `copyStatus` at 'failed'
			// forever — and 'failed' rendered as "Copy", so a denied clipboard was
			// indistinguishable from never having tried.
			return [
				{ ...state, copyStatus: 'failed', copyError: action.error },
				Effect.afterDelay(2000, (dispatch) => dispatch({ type: 'resetCopyStatus' }))
			];

		case 'resetCopyStatus':
			return [{ ...state, copyStatus: 'idle', copyError: null }, Effect.none()];

		case 'toggleLineNumbers':
			return [{ ...state, showLineNumbers: !state.showLineNumbers }, Effect.none()];

		case 'highlightLinesChanged':
			return [{ ...state, highlightLines: action.lines }, Effect.none()];

		default:
			// Exhaustiveness check - ensures all actions are handled
			const _never: never = action;
			return [state, Effect.none()];
	}
};
