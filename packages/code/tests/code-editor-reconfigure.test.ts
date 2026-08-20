/**
 * The four editor updaters were no-ops, and the toolbar was wired to them.
 *
 * `updateEditorLanguage`, `updateEditorTheme`, `updateEditorReadOnly` and
 * `updateTabSize` each had an empty body and a `TODO: Implement with
 * Compartment`. `CodeEditor.svelte` never called them either — its only sync
 * effect handled `value`. So the language `<select>` and the theme button
 * changed store state and the chrome's `data-theme`, while the editor itself
 * kept its mount-time configuration forever.
 *
 * Every assertion here is against the LIVE `EditorView`, never the store. A
 * store-only assertion passes with the no-ops fully restored — the store was
 * always updating correctly; the editor was the thing ignoring it.
 *
 * The view handle comes from `EditorView.findFromDOM(target)`, which walks to
 * `.cm-content` and reads CodeMirror's own view map. That avoids adding a
 * test-only export or a `$bindable` prop to the component, i.e. widening the
 * public surface for a test's convenience.
 *
 * `vitest-browser-svelte` is not a dependency of this package, so this uses raw
 * `mount`/`unmount` like `code-highlight-escaping.test.ts`.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { EditorView } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';
import { createStore } from '@composable-svelte/core';
import { codeEditorReducer } from '../src/lib/code-editor/code-editor.reducer';
import { createInitialState } from '../src/lib/code-editor/code-editor.types';
import { loadLanguage } from '../src/lib/code-editor/codemirror-wrapper';
import CodeEditor from '../src/lib/code-editor/CodeEditor.svelte';

const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

/** Poll rather than guess a delay: the language path is a dynamic import. */
async function waitFor<T>(read: () => T | null | undefined, what: string, tries = 100): Promise<T> {
	for (let i = 0; i < tries; i += 1) {
		const found = read();
		if (found) return found;
		await new Promise((r) => setTimeout(r, 25));
	}
	throw new Error(`timed out waiting for ${what}`);
}

async function mountEditor(config: Parameters<typeof createInitialState>[0] = {}) {
	// Warm the module graph before mounting so the first dynamic import inside
	// the component is not also a dev-server round trip.
	await Promise.all([loadLanguage('typescript'), loadLanguage('python'), loadLanguage('sql')]);

	const store = createStore({
		initialState: createInitialState({ value: 'const a = 1;', ...config }),
		reducer: codeEditorReducer,
		dependencies: {}
	});
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(CodeEditor, { target, props: { store } });
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});

	// The EditorView object is stable across reconfigures; `view.state` is not,
	// so always read state at assertion time.
	const view = await waitFor(() => EditorView.findFromDOM(target), 'the EditorView to mount');
	return { store, target, view };
}

/** The comment syntax the active language parser reports. */
const commentLine = (view: EditorView) =>
	view.state.languageDataAt<{ line?: string }>('commentTokens', 0)[0]?.line;

describe('language reconfiguration', () => {
	it('re-parses the document across three languages', async () => {
		// Three hops with three distinct answers — `//`, `#`, `--`. No hardcoded
		// or one-way implementation passes all of them.
		const { store, view } = await mountEditor({ language: 'typescript' });
		await waitFor(() => commentLine(view) === '//' || null, 'typescript to load');

		store.dispatch({ type: 'languageChanged', language: 'python' });
		flushSync();
		await waitFor(() => commentLine(view) === '#' || null, 'python comment tokens');

		store.dispatch({ type: 'languageChanged', language: 'sql' });
		flushSync();
		await waitFor(() => commentLine(view) === '--' || null, 'sql comment tokens');

		store.dispatch({ type: 'languageChanged', language: 'typescript' });
		flushSync();
		await waitFor(() => commentLine(view) === '//' || null, 'typescript again');
	});

	it('reconfigures rather than recreating the view', async () => {
		const { store, target, view } = await mountEditor({ language: 'typescript' });
		const before = view.state.doc.toString();

		store.dispatch({ type: 'languageChanged', language: 'python' });
		flushSync();
		await waitFor(() => commentLine(view) === '#' || null, 'python');

		// Same object: a destroy-and-rebuild would hand back a different one, and
		// would lose the undo history with it.
		expect(EditorView.findFromDOM(target)).toBe(view);
		expect(view.state.doc.toString()).toBe(before);
	});
});

describe('theme reconfiguration', () => {
	it('restyles the content area, not only the chrome', async () => {
		// Explicit 'dark'/'light', never 'auto': headless chromium reports
		// `prefers-color-scheme: light` and `getThemeExtensions('auto')` reads
		// matchMedia at call time.
		const { store, target, view } = await mountEditor({ theme: 'dark' });
		expect(view.state.facet(EditorView.darkTheme)).toBe(true);

		store.dispatch({ type: 'themeChanged', theme: 'light' });
		flushSync();
		await settle(200);

		// The chrome moved before this change too — asserting it alone is exactly
		// the half-applied state the defect produced.
		expect(target.querySelector('.code-editor')?.getAttribute('data-theme')).toBe('light');
		expect(
			view.state.facet(EditorView.darkTheme),
			'the toolbar switched to light but the editor body stayed dark'
		).toBe(false);

		store.dispatch({ type: 'themeChanged', theme: 'dark' });
		flushSync();
		await settle(200);
		expect(view.state.facet(EditorView.darkTheme)).toBe(true);
	});
});

describe('read-only reconfiguration', () => {
	it('flips editable and readOnly on the live view', async () => {
		const { store, view } = await mountEditor({ readOnly: false });
		expect(view.state.facet(EditorView.editable)).toBe(true);

		store.dispatch({ type: 'setReadOnly', readOnly: true });
		flushSync();
		await settle(200);

		expect(view.state.facet(EditorView.editable)).toBe(false);
		expect(view.contentDOM.getAttribute('contenteditable')).toBe('false');
		// Both facets. `editable` alone leaves keymap commands able to edit.
		expect(view.state.readOnly).toBe(true);

		store.dispatch({ type: 'setReadOnly', readOnly: false });
		flushSync();
		await settle(200);
		expect(view.state.facet(EditorView.editable)).toBe(true);
		expect(view.state.readOnly).toBe(false);
	});
});

describe('tab size reconfiguration', () => {
	it('changes tabSize on the live view', async () => {
		// Mounted at 2, which is not CodeMirror's default of 4 — so this also
		// proves `createEditorView` applied the config and the 8 below is not
		// simply a default showing through.
		const { store, view } = await mountEditor({ tabSize: 2 });
		expect(view.state.tabSize).toBe(2);

		store.dispatch({ type: 'tabSizeChanged', size: 8 });
		flushSync();
		await settle(200);

		expect(view.state.tabSize).toBe(8);
	});
});

describe('idempotence', () => {
	it('unrelated store activity does not reconfigure the editor', async () => {
		// Counts CodeMirror transactions rather than hoping Svelte throws.
		// `cursorMoved` returns a fresh state object every time, so the sync
		// effect genuinely re-runs on each of the twenty dispatches.
		const { store, view } = await mountEditor();
		await settle(200);

		let transactions = 0;
		view.dispatch({
			effects: StateEffect.appendConfig.of(
				EditorView.updateListener.of((u) => {
					transactions += u.transactions.length;
				})
			)
		});
		transactions = 0; // discard the appendConfig transaction itself

		for (let i = 0; i < 20; i += 1) {
			store.dispatch({ type: 'cursorMoved', position: { line: 1, column: i } });
		}
		flushSync();
		await settle(300);

		expect(
			transactions,
			'the editor was reconfigured by dispatches that changed none of its config'
		).toBe(0);
	});
});
