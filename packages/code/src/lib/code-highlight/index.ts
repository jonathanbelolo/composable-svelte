/**
 * CodeHighlight - Read-only syntax highlighting component
 *
 * @module code-highlight
 */

export { default as CodeHighlight } from './CodeHighlight.svelte';
export { codeHighlightReducer } from './code-highlight.reducer.js';
export { highlightCode, loadLanguage } from './prism-wrapper.js';
export {
	createInitialState,
	type CodeHighlightState,
	type CodeHighlightAction,
	type CodeHighlightDependencies,
	type SupportedLanguage
} from './code-highlight.types.js';
