/**
 * CodeMirror Wrapper
 *
 * Bridge between CodeMirror 6 and Composable Svelte store
 * - Creates and configures CodeMirror EditorView
 * - Dispatches actions to store when CodeMirror state changes
 * - Syncs store state to CodeMirror view
 * - Manages language extensions and themes
 */

import { EditorView, basicSetup } from 'codemirror';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import type { Store } from '@composable-svelte/core';
import type {
	CodeEditorState,
	CodeEditorAction,
	SupportedLanguage,
	EditorSelection
} from './code-editor.types.js';

/**
 * Configuration compartments.
 *
 * A `Compartment` is an identity token, not a container: `compartment.of(ext)`
 * is resolved per-`EditorState`, so one module-level instance serves every view
 * this module creates without them interfering. Verified against the installed
 * packages — reconfiguring one state's language leaves another state built from
 * the same compartment untouched.
 *
 * Reconfiguring a compartment absent from a state's configuration is a silent
 * no-op rather than a throw (also verified), which is what makes the exported
 * updaters safe to call on an `EditorView` this module did not create: they did
 * nothing for such a view before and still do nothing now.
 */
const languageCompartment = new Compartment();
const themeCompartment = new Compartment();
const readOnlyCompartment = new Compartment();
const tabSizeCompartment = new Compartment();

/**
 * Latest language *requested* per view.
 *
 * `loadLanguage` is a dynamic import, so two quick switches race and the loser
 * can resolve last and win. This keeps the last language requested rather than
 * the last one to arrive. It lives in the wrapper rather than the component so
 * a consumer calling `updateEditorLanguage` directly gets the same guarantee.
 */
const pendingLanguage = new WeakMap<EditorView, SupportedLanguage>();

/**
 * `readOnly`, as both facets.
 *
 * `EditorView.editable` alone only removes `contenteditable`; keymap commands
 * still edit the document. `EditorState.readOnly` is the facet those commands
 * consult, so this makes `readOnly: true` actually mean read-only. Verified
 * that it does not block *programmatic* changes — `state.update({changes})`
 * still applies — so `updateEditorValue` and the format flow keep working.
 */
function readOnlyExtension(readOnly: boolean): Extension {
	return [EditorView.editable.of(!readOnly), EditorState.readOnly.of(readOnly)];
}

/**
 * Load language extension for CodeMirror
 *
 * @param lang Language to load
 * @returns Promise resolving to language extension
 */
export async function loadLanguage(lang: SupportedLanguage): Promise<Extension> {
	switch (lang) {
		case 'typescript':
			return (await import('@codemirror/lang-javascript')).javascript({ typescript: true });
		case 'javascript':
			return (await import('@codemirror/lang-javascript')).javascript();
		case 'svelte':
			// Svelte uses HTML mode as base (can be enhanced later)
			return (await import('@codemirror/lang-html')).html();
		case 'html':
			return (await import('@codemirror/lang-html')).html();
		case 'css':
			return (await import('@codemirror/lang-css')).css();
		case 'json':
			return (await import('@codemirror/lang-json')).json();
		case 'markdown':
			return (await import('@codemirror/lang-markdown')).markdown();
		case 'bash':
			// Use JavaScript mode for bash (basic syntax highlighting)
			return (await import('@codemirror/lang-javascript')).javascript();
		case 'sql':
			return (await import('@codemirror/lang-sql')).sql();
		case 'python':
			return (await import('@codemirror/lang-python')).python();
		case 'rust':
			return (await import('@codemirror/lang-rust')).rust();
		default:
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const _never: never = lang;
			return (await import('@codemirror/lang-javascript')).javascript();
	}
}

/**
 * Get theme extensions based on theme setting
 *
 * @param theme Theme name
 * @returns Array of theme extensions
 */
export function getThemeExtensions(theme: 'light' | 'dark' | 'auto'): Extension[] {
	if (theme === 'dark') {
		return [oneDark];
	}
	if (theme === 'auto') {
		// Auto theme - check system preference
		if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
			return [oneDark];
		}
	}
	// Light theme - use default
	return [];
}

/**
 * Helper to convert CodeMirror position to line/column
 */
function getLineColumn(state: EditorState, pos: number): { line: number; column: number } {
	const line = state.doc.lineAt(pos);
	return {
		line: line.number,
		column: pos - line.from
	};
}

/**
 * Create CodeMirror editor view
 *
 * @param parent Parent element to mount editor into
 * @param store Composable Svelte store
 * @param config Initial configuration
 * @returns EditorView instance
 */
export async function createEditorView(
	parent: HTMLElement,
	store: Store<CodeEditorState, CodeEditorAction>,
	config: {
		value: string;
		language: SupportedLanguage;
		theme: 'light' | 'dark' | 'auto';
		showLineNumbers: boolean;
		readOnly: boolean;
		enableAutocomplete: boolean;
		tabSize: number;
	}
): Promise<EditorView> {
	// Load initial language extension
	const languageExtension = await loadLanguage(config.language);
	const themeExtensions = getThemeExtensions(config.theme);

	// Create update listener to sync CodeMirror changes to store
	const updateListener = EditorView.updateListener.of((update) => {
		// Document changed
		if (update.docChanged) {
			const newValue = update.state.doc.toString();
			const cursor = update.state.selection.main.head;
			const cursorPos = getLineColumn(update.state, cursor);

			store.dispatch({
				type: 'valueChanged',
				value: newValue,
				cursorPosition: cursorPos
			});
		}

		// Selection changed
		if (update.selectionSet) {
			const { from, to } = update.state.selection.main;
			if (from !== to) {
				// Has selection
				const text = update.state.sliceDoc(from, to);
				const fromPos = getLineColumn(update.state, from);
				const toPos = getLineColumn(update.state, to);
				const selection: EditorSelection = {
					from: fromPos,
					to: toPos,
					text
				};
				store.dispatch({ type: 'selectionChanged', selection });
			} else {
				// No selection
				store.dispatch({ type: 'selectionChanged', selection: null });
				// Update cursor position
				const cursorPos = getLineColumn(update.state, from);
				store.dispatch({ type: 'cursorMoved', position: cursorPos });
			}
		}

		// Focus changed
		if (update.focusChanged) {
			if (update.view.hasFocus) {
				store.dispatch({ type: 'focused' });
			} else {
				store.dispatch({ type: 'blurred' });
			}
		}
	});

	// Custom keybindings for save and format
	const customKeymap = keymap.of([
		{
			key: 'Mod-s',
			preventDefault: true,
			run: () => {
				store.dispatch({ type: 'save' });
				return true;
			}
		},
		{
			key: 'Mod-Shift-f',
			preventDefault: true,
			run: () => {
				store.dispatch({ type: 'format' });
				return true;
			}
		}
	]);

	// Build extensions array
	// Array positions preserved deliberately: CodeMirror precedence is
	// positional, and oneDark's highlight style must keep out-ranking
	// basicSetup's `{ fallback: true }` default.
	const extensions: Extension[] = [
		basicSetup,
		languageCompartment.of(languageExtension),
		themeCompartment.of(themeExtensions),
		updateListener,
		customKeymap,
		readOnlyCompartment.of(readOnlyExtension(config.readOnly)),
		tabSizeCompartment.of(EditorState.tabSize.of(config.tabSize))
	];

	// Add autocomplete if enabled
	if (config.enableAutocomplete) {
		const { autocompletion } = await import('@codemirror/autocomplete');
		extensions.push(autocompletion());
	}

	// Create view
	const view = new EditorView({
		doc: config.value,
		extensions,
		parent
	});

	return view;
}

/**
 * Update editor value programmatically
 *
 * Use this when the value changes from outside CodeMirror (e.g., loading a file)
 * This will NOT trigger the update listener (no circular updates)
 *
 * @param view CodeMirror view
 * @param newValue New value to set
 */
export function updateEditorValue(view: EditorView, newValue: string): void {
	const currentValue = view.state.doc.toString();
	if (currentValue !== newValue) {
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: newValue }
		});
	}
}

/**
 * Update editor language, reconfiguring in place.
 *
 * The document, selection and undo history survive — this is a compartment
 * reconfigure, not a rebuild.
 *
 * @param view CodeMirror view
 * @param language New language
 */
export async function updateEditorLanguage(
	view: EditorView,
	language: SupportedLanguage
): Promise<void> {
	pendingLanguage.set(view, language);
	const extension = await loadLanguage(language);
	// The last language *requested* wins, not the last import to resolve.
	if (pendingLanguage.get(view) !== language) return;
	// Dispatching into a destroyed view is safe: `EditorView.update`
	// short-circuits when destroyed, so a late import after unmount is inert.
	view.dispatch({ effects: languageCompartment.reconfigure(extension) });
}

/**
 * Update editor theme, reconfiguring in place.
 *
 * `'auto'` reads `prefers-color-scheme` at call time and installs no listener,
 * which is unchanged from `createEditorView`.
 *
 * @param view CodeMirror view
 * @param theme New theme
 */
export function updateEditorTheme(view: EditorView, theme: 'light' | 'dark' | 'auto'): void {
	view.dispatch({ effects: themeCompartment.reconfigure(getThemeExtensions(theme)) });
}

/**
 * Update editor read-only state, reconfiguring in place.
 *
 * @param view CodeMirror view
 * @param readOnly Whether editor should be read-only
 */
export function updateEditorReadOnly(view: EditorView, readOnly: boolean): void {
	view.dispatch({ effects: readOnlyCompartment.reconfigure(readOnlyExtension(readOnly)) });
}

/**
 * Update tab size, reconfiguring in place.
 *
 * @param view CodeMirror view
 * @param tabSize New tab size
 */
export function updateTabSize(view: EditorView, tabSize: number): void {
	view.dispatch({ effects: tabSizeCompartment.reconfigure(EditorState.tabSize.of(tabSize)) });
}

/**
 * Focus the editor
 *
 * @param view CodeMirror view
 */
export function focusEditor(view: EditorView): void {
	view.focus();
}

/**
 * Blur the editor
 *
 * @param view CodeMirror view
 */
export function blurEditor(view: EditorView): void {
	view.contentDOM.blur();
}
