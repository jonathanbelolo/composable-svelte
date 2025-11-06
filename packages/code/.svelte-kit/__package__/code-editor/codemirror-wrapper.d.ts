/**
 * CodeMirror Wrapper
 *
 * Bridge between CodeMirror 6 and Composable Svelte store
 * - Creates and configures CodeMirror EditorView
 * - Dispatches actions to store when CodeMirror state changes
 * - Syncs store state to CodeMirror view
 * - Manages language extensions and themes
 */
import { EditorView } from 'codemirror';
import { type Extension } from '@codemirror/state';
import type { Store } from '@composable-svelte/core';
import type { CodeEditorState, CodeEditorAction, SupportedLanguage } from './code-editor.types';
/**
 * Load language extension for CodeMirror
 *
 * @param lang Language to load
 * @returns Promise resolving to language extension
 */
export declare function loadLanguage(lang: SupportedLanguage): Promise<Extension>;
/**
 * Get theme extensions based on theme setting
 *
 * @param theme Theme name
 * @returns Array of theme extensions
 */
export declare function getThemeExtensions(theme: 'light' | 'dark' | 'auto'): Extension[];
/**
 * Create CodeMirror editor view
 *
 * @param parent Parent element to mount editor into
 * @param store Composable Svelte store
 * @param config Initial configuration
 * @returns EditorView instance
 */
export declare function createEditorView(parent: HTMLElement, store: Store<CodeEditorState, CodeEditorAction>, config: {
    value: string;
    language: SupportedLanguage;
    theme: 'light' | 'dark' | 'auto';
    showLineNumbers: boolean;
    readOnly: boolean;
    enableAutocomplete: boolean;
    tabSize: number;
}): Promise<EditorView>;
/**
 * Update editor value programmatically
 *
 * Use this when the value changes from outside CodeMirror (e.g., loading a file)
 * This will NOT trigger the update listener (no circular updates)
 *
 * @param view CodeMirror view
 * @param newValue New value to set
 */
export declare function updateEditorValue(view: EditorView, newValue: string): void;
/**
 * Update editor language
 *
 * Note: For dynamic language changes, the view needs to be recreated
 * This is a placeholder for future implementation with Compartments
 *
 * @param _view CodeMirror view
 * @param _language New language
 */
export declare function updateEditorLanguage(_view: EditorView, _language: SupportedLanguage): Promise<void>;
/**
 * Update editor theme
 *
 * Note: For dynamic theme changes, the view needs to be recreated
 * This is a placeholder for future implementation with Compartments
 *
 * @param _view CodeMirror view
 * @param _theme New theme
 */
export declare function updateEditorTheme(_view: EditorView, _theme: 'light' | 'dark' | 'auto'): void;
/**
 * Update editor read-only state
 *
 * Note: For dynamic readonly changes, the view needs to be recreated
 * This is a placeholder for future implementation with Compartments
 *
 * @param _view CodeMirror view
 * @param _readOnly Whether editor should be read-only
 */
export declare function updateEditorReadOnly(_view: EditorView, _readOnly: boolean): void;
/**
 * Update tab size
 *
 * Note: For dynamic tab size changes, the view needs to be recreated
 * This is a placeholder for future implementation with Compartments
 *
 * @param _view CodeMirror view
 * @param _tabSize New tab size
 */
export declare function updateTabSize(_view: EditorView, _tabSize: number): void;
/**
 * Focus the editor
 *
 * @param view CodeMirror view
 */
export declare function focusEditor(view: EditorView): void;
/**
 * Blur the editor
 *
 * @param view CodeMirror view
 */
export declare function blurEditor(view: EditorView): void;
//# sourceMappingURL=codemirror-wrapper.d.ts.map