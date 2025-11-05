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
export const codeHighlightReducer = (state, action, deps) => {
    switch (action.type) {
        case 'init':
            // Trigger initial highlighting on mount
            if (state.code && !state.highlightedCode && !state.isHighlighting) {
                return [
                    { ...state, isHighlighting: true, error: null },
                    Effect.run(async (dispatch) => {
                        try {
                            const html = await deps.highlightCode(state.code, state.language);
                            dispatch({ type: 'highlighted', html });
                        }
                        catch (e) {
                            const error = e instanceof Error ? e.message : 'Highlighting failed';
                            dispatch({ type: 'highlightFailed', error });
                        }
                    })
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
                Effect.run(async (dispatch) => {
                    try {
                        const html = await deps.highlightCode(action.code, state.language);
                        dispatch({ type: 'highlighted', html });
                    }
                    catch (e) {
                        const error = e instanceof Error ? e.message : 'Highlighting failed';
                        dispatch({ type: 'highlightFailed', error });
                    }
                })
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
                Effect.run(async (dispatch) => {
                    try {
                        const html = await deps.highlightCode(state.code, action.language);
                        dispatch({ type: 'highlighted', html });
                    }
                    catch (e) {
                        const error = e instanceof Error ? e.message : 'Highlighting failed';
                        dispatch({ type: 'highlightFailed', error });
                    }
                })
            ];
        case 'highlighted':
            return [{ ...state, highlightedCode: action.html, isHighlighting: false }, Effect.none()];
        case 'highlightFailed':
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
                    }
                    catch (e) {
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
            return [{ ...state, copyStatus: 'failed' }, Effect.none()];
        case 'resetCopyStatus':
            return [{ ...state, copyStatus: 'idle' }, Effect.none()];
        case 'toggleLineNumbers':
            return [{ ...state, showLineNumbers: !state.showLineNumbers }, Effect.none()];
        case 'highlightLinesChanged':
            return [{ ...state, highlightLines: action.lines }, Effect.none()];
        default:
            // Exhaustiveness check - ensures all actions are handled
            const _never = action;
            return [state, Effect.none()];
    }
};
