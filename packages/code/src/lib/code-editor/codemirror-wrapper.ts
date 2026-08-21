/**
 * CodeMirror Wrapper
 *
 * Bridge between CodeMirror 6 and Composable Svelte store
 * - Creates and configures CodeMirror EditorView
 * - Dispatches actions to store when CodeMirror state changes
 * - Syncs store state to CodeMirror view
 * - Manages language extensions and themes
 */

import {
	EditorView,
	keymap,
	lineNumbers,
	highlightActiveLineGutter,
	highlightSpecialChars,
	drawSelection,
	dropCursor,
	rectangularSelection,
	crosshairCursor,
	highlightActiveLine
} from '@codemirror/view';
import { Compartment, EditorState, Transaction, type Extension } from '@codemirror/state';
import {
	codeFolding,
	foldGutter,
	foldKeymap,
	indentOnInput,
	indentUnit,
	bracketMatching,
	syntaxHighlighting,
	defaultHighlightStyle
} from '@codemirror/language';
import {
	history,
	historyKeymap,
	defaultKeymap,
	undo,
	redo,
	undoDepth,
	redoDepth,
	selectAll as selectAllCommand
} from '@codemirror/commands';
import {
	autocompletion,
	completionKeymap,
	closeBrackets,
	closeBracketsKeymap,
	closeCompletion
} from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
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
const lineNumbersCompartment = new Compartment();
const foldingCompartment = new Compartment();
const autocompleteCompartment = new Compartment();

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
 * Line numbers, with the active-line gutter highlight that belongs to them.
 *
 * `highlightActiveLineGutter()` is paired here rather than installed
 * unconditionally: with no gutter it has nothing to highlight, and leaving it
 * behind would render an empty active-line strip once numbers are hidden.
 */
function lineNumbersExtension(show: boolean): Extension {
	return show ? [lineNumbers(), highlightActiveLineGutter()] : [];
}

/**
 * Code folding — the gutter and its keybindings, which travel together.
 *
 * `codeFolding()` itself is installed outside this compartment so that folds
 * already made survive the gutter being hidden and shown again.
 */
function foldingExtension(enabled: boolean): Extension {
	return enabled ? [foldGutter(), keymap.of(foldKeymap)] : [];
}

/**
 * Autocompletion, with bracket closing and both keymaps.
 *
 * `closeBrackets()` belongs here rather than in the fixed section: it is part
 * of the same completion experience, and leaving `closeBracketsKeymap` bound
 * with no `closeBrackets()` behind it would be a dead keybinding set.
 */
function autocompleteExtension(enabled: boolean): Extension {
	return enabled
		? [closeBrackets(), autocompletion(), keymap.of([...closeBracketsKeymap, ...completionKeymap])]
		: [];
}

/**
 * Indent width, as both facets.
 *
 * `EditorState.tabSize` only sets the *display width of a literal tab*. What
 * `indentOnInput` and the Enter key actually consult is `indentUnit`, which
 * defaults to two spaces — so `tabSize: 4` visibly did nothing on a
 * space-indented document. Setting both makes the number mean one thing.
 */
function tabSizeExtension(tabSize: number): Extension {
	return [EditorState.tabSize.of(tabSize), indentUnit.of(' '.repeat(tabSize))];
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
function getThemeExtensions(theme: 'light' | 'dark' | 'auto'): Extension[] {
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
		enableFolding: boolean;
		tabSize: number;
	}
): Promise<EditorView> {
	// Load initial language extension
	const languageExtension = await loadLanguage(config.language);
	const themeExtensions = getThemeExtensions(config.theme);

	// Create update listener to sync CodeMirror changes to store
	// Plain locals, not reactive state: read and written by the listener below.
	let lastCanUndo = false;
	let lastCanRedo = false;

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

		// Undo/redo availability, edge-triggered.
		//
		// `undoDepth`/`redoDepth` are cheap, but dispatching them per keystroke
		// would be a storm. These are booleans that flip only at session
		// boundaries — first edit, stack exhausted, first undo — so typing 500
		// characters produces one dispatch, not 500.
		const canUndo = undoDepth(update.state) > 0;
		const canRedo = redoDepth(update.state) > 0;
		if (canUndo !== lastCanUndo || canRedo !== lastCanRedo) {
			lastCanUndo = canUndo;
			lastCanRedo = canRedo;
			store.dispatch({ type: 'historyChanged', canUndo, canRedo });
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
	const customKeymapBindings = [
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
	];

	// `basicSetup` inlined.
	//
	// It bundles the eighteen extensions below and hardcodes three of them —
	// `lineNumbers()`, `foldGutter()` and `autocompletion()` — which is why
	// `showLineNumbers`, `enableFolding` and `enableAutocomplete` were all
	// inert. `enableAutocomplete` was inert in *both* directions: `false` did
	// not remove basicSetup's copy, and `true` pushed a second one that
	// CodeMirror deduped via the module-level `completionState` field.
	//
	// CodeMirror's own docs prescribe this: basicSetup "does not allow
	// customization… copy it into your own code, and adjust it as desired".
	//
	// What ordering here actually buys, since it is easy to assert too much:
	//
	//  - Gutters render left-to-right in array order, so line numbers sit left
	//    of the fold marker.
	//  - Keymaps are consulted in order and the first matching binding wins, so
	//    `customKeymap` (Mod-s / Mod-Shift-f) is placed FIRST.
	//  - `syntaxHighlighting(defaultHighlightStyle, { fallback: true })` is NOT
	//    order-sensitive against oneDark, contrary to what this comment used to
	//    claim. `{ fallback: true }` routes into a separate `fallbackHighlighter`
	//    facet that `getHighlighters` consults only when the main one is empty
	//    (`@codemirror/language/dist/index.js:1707-1713`). It is not a
	//    precedence race, and no position preserves or breaks it.
	//
	// `history()` is deliberately NOT in a compartment: reconfiguring it would
	// drop and recreate `historyField`, wiping the user's undo stack.
	//
	// `codeFolding()` is hoisted out of `foldingCompartment` for the same
	// reason. `foldGutter()` already returns `[markers, gutter, codeFolding()]`,
	// and `foldState` is a module-level StateField — so folding the gutter in
	// and out would reset every existing fold. Only the gutter is toggleable.
	const extensions: Extension[] = [
		keymap.of(customKeymapBindings),
		lineNumbersCompartment.of(lineNumbersExtension(config.showLineNumbers)),
		foldingCompartment.of(foldingExtension(config.enableFolding)),
		codeFolding(),
		highlightSpecialChars(),
		history(),
		drawSelection(),
		dropCursor(),
		EditorState.allowMultipleSelections.of(true),
		indentOnInput(),
		syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
		bracketMatching(),
		autocompleteCompartment.of(autocompleteExtension(config.enableAutocomplete)),
		rectangularSelection(),
		crosshairCursor(),
		highlightActiveLine(),
		highlightSelectionMatches(),
		keymap.of([...defaultKeymap, ...searchKeymap, ...historyKeymap]),
		languageCompartment.of(languageExtension),
		themeCompartment.of(themeExtensions),
		updateListener,
		readOnlyCompartment.of(readOnlyExtension(config.readOnly)),
		tabSizeCompartment.of(tabSizeExtension(config.tabSize))
	];

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
export function updateEditorValue(
	view: EditorView,
	newValue: string,
	options?: { addToHistory?: boolean }
): void {
	const currentValue = view.state.doc.toString();
	if (currentValue !== newValue) {
		view.dispatch({
			changes: { from: 0, to: view.state.doc.length, insert: newValue },
			// Programmatic replacements are undoable by default — a formatted
			// document should be revertable. The mount-time catch-up passes
			// `false`, because the editor agreeing with the state it was built
			// from is not an edit the user made.
			...(options?.addToHistory === false
				? { annotations: Transaction.addToHistory.of(false) }
				: {})
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
	view.dispatch({ effects: tabSizeCompartment.reconfigure(tabSizeExtension(tabSize)) });
}

/**
 * Run an editing command against the live view.
 *
 * These correspond to the store's command actions, which carry no state. The
 * reducer stays pure and the view calls these on the action stream — CodeMirror
 * then reports the result back as `valueChanged` / `selectionChanged` /
 * `historyChanged`, so the store stays the source of truth for state while the
 * editor owns the document.
 *
 * `readOnly` is honoured here because a programmatic `view.dispatch({changes})`
 * bypasses the `EditorState.readOnly` facet, which only blocks *commands*.
 */
export function runEditorCommand(
	view: EditorView,
	command:
		| { type: 'undo' }
		| { type: 'redo' }
		| { type: 'focus' }
		| { type: 'blur' }
		| { type: 'selectAll' }
		| { type: 'insertText'; text: string; position?: { line: number; column: number } | undefined }
		| { type: 'deleteSelection' }
): void {
	switch (command.type) {
		case 'undo':
			undo(view);
			return;
		case 'redo':
			redo(view);
			return;
		case 'selectAll':
			selectAllCommand(view);
			return;
		case 'focus':
			view.focus();
			return;
		case 'blur':
			view.contentDOM.blur();
			return;
		case 'insertText': {
			if (view.state.readOnly) return;
			if (command.position) {
				// The action carries a 1-based line/column, matching what the
				// update listener reports back as `cursorMoved`. CodeMirror wants
				// a document offset, so convert — and clamp, because a stale
				// position from a since-shortened document would otherwise throw.
				const lineCount = view.state.doc.lines;
				const lineNo = Math.min(Math.max(command.position.line, 1), lineCount);
				const line = view.state.doc.line(lineNo);
				const anchor = Math.min(line.from + Math.max(command.position.column, 0), line.to);
				view.dispatch({ selection: { anchor } });
			}
			view.dispatch(view.state.replaceSelection(command.text), { userEvent: 'input.type' });
			return;
		}
		case 'deleteSelection': {
			if (view.state.readOnly) return;
			view.dispatch(view.state.replaceSelection(''), { userEvent: 'delete.selection' });
			return;
		}
	}
}

/**
 * Show or hide the line-number gutter, reconfiguring in place.
 *
 * @param view CodeMirror view
 * @param show Whether to show line numbers
 */
export function updateLineNumbers(view: EditorView, show: boolean): void {
	view.dispatch({ effects: lineNumbersCompartment.reconfigure(lineNumbersExtension(show)) });
}

/**
 * Enable or disable code folding, reconfiguring in place.
 *
 * @param view CodeMirror view
 * @param enabled Whether folding is available
 */
export function updateFolding(view: EditorView, enabled: boolean): void {
	view.dispatch({ effects: foldingCompartment.reconfigure(foldingExtension(enabled)) });
}

/**
 * Enable or disable autocompletion, reconfiguring in place.
 *
 * @param view CodeMirror view
 * @param enabled Whether autocompletion is active
 */
export function updateAutocomplete(view: EditorView, enabled: boolean): void {
	// Close any in-flight completion BEFORE removing the extension. Completion
	// queries are async, and `completionState` is a StateField that goes away
	// with the compartment — a pending query resolving afterwards throws
	// `RangeError: Field is not present in this state`. Found by a test that
	// toggled autocomplete off while a completion was open.
	if (!enabled) closeCompletion(view);
	view.dispatch({ effects: autocompleteCompartment.reconfigure(autocompleteExtension(enabled)) });
}

