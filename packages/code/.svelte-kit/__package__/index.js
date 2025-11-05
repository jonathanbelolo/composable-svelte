/**
 * @composable-svelte/code
 *
 * Code editor and syntax highlighting components for Composable Svelte
 *
 * Built with Prism.js and CodeMirror following Composable Architecture patterns
 *
 * @packageDocumentation
 */
// CodeHighlight - Read-only syntax highlighting
export { CodeHighlight, codeHighlightReducer, highlightCode, loadLanguage, createInitialState } from './code-highlight/index';
