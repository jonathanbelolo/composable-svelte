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
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
/**
 * Load language extension for CodeMirror
 *
 * @param lang Language to load
 * @returns Promise resolving to language extension
 */
export async function loadLanguage(lang) {
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
            const _never = lang;
            return (await import('@codemirror/lang-javascript')).javascript();
    }
}
/**
 * Get theme extensions based on theme setting
 *
 * @param theme Theme name
 * @returns Array of theme extensions
 */
export function getThemeExtensions(theme) {
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
function getLineColumn(state, pos) {
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
export async function createEditorView(parent, store, config) {
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
                const selection = {
                    from: fromPos,
                    to: toPos,
                    text
                };
                store.dispatch({ type: 'selectionChanged', selection });
            }
            else {
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
            }
            else {
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
    const extensions = [
        basicSetup,
        languageExtension,
        ...themeExtensions,
        updateListener,
        customKeymap,
        EditorView.editable.of(!config.readOnly),
        EditorState.tabSize.of(config.tabSize)
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
export function updateEditorValue(view, newValue) {
    const currentValue = view.state.doc.toString();
    if (currentValue !== newValue) {
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: newValue }
        });
    }
}
/**
 * Update editor language
 *
 * Note: For dynamic language changes, the view needs to be recreated
 * This is a placeholder for future implementation with Compartments
 *
 * @param _view CodeMirror view
 * @param _language New language
 */
export async function updateEditorLanguage(_view, _language) {
    // TODO: Implement with Compartment for dynamic reconfiguration
    // For now, language changes require recreating the view
}
/**
 * Update editor theme
 *
 * Note: For dynamic theme changes, the view needs to be recreated
 * This is a placeholder for future implementation with Compartments
 *
 * @param _view CodeMirror view
 * @param _theme New theme
 */
export function updateEditorTheme(_view, _theme) {
    // TODO: Implement with Compartment for dynamic reconfiguration
    // For now, theme changes require recreating the view
}
/**
 * Update editor read-only state
 *
 * Note: For dynamic readonly changes, the view needs to be recreated
 * This is a placeholder for future implementation with Compartments
 *
 * @param _view CodeMirror view
 * @param _readOnly Whether editor should be read-only
 */
export function updateEditorReadOnly(_view, _readOnly) {
    // TODO: Implement with Compartment for dynamic reconfiguration
    // For now, readonly changes require recreating the view
}
/**
 * Update tab size
 *
 * Note: For dynamic tab size changes, the view needs to be recreated
 * This is a placeholder for future implementation with Compartments
 *
 * @param _view CodeMirror view
 * @param _tabSize New tab size
 */
export function updateTabSize(_view, _tabSize) {
    // TODO: Implement with Compartment for dynamic reconfiguration
    // For now, tab size changes require recreating the view
}
/**
 * Focus the editor
 *
 * @param view CodeMirror view
 */
export function focusEditor(view) {
    view.focus();
}
/**
 * Blur the editor
 *
 * @param view CodeMirror view
 */
export function blurEditor(view) {
    view.contentDOM.blur();
}
