/**
 * CodeHighlight - Read-only syntax highlighting component
 *
 * @module code-highlight
 */
export { default as CodeHighlight } from './CodeHighlight.svelte';
export { codeHighlightReducer } from './code-highlight.reducer';
export { highlightCode, loadLanguage } from './prism-wrapper';
export { createInitialState } from './code-highlight.types';
