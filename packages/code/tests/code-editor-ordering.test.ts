/**
 * The standalone `CodeEditor`: state reaches the editor before a later command,
 * and a store without `subscribeToActions` still works.
 *
 * Replaces `proof/production-value-command-order.probe.test.ts`. That probe
 * pinned the shipped defect: values reached CodeMirror in an `$effect`, which
 * runs after the synchronous command delivery, so `valueChanged('Loaded')`
 * followed in the same tick by `insertText('!')` produced "!A" and the
 * command's echo then overwrote "Loaded" in state too.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { flushSync } from 'svelte';
import { undoDepth } from '@codemirror/commands';
import { createStore, type Store } from '@composable-svelte/core';
import { codeEditorReducer } from '../src/lib/code-editor/code-editor.reducer';
import {
	createInitialState,
	type CodeEditorAction,
	type CodeEditorState
} from '../src/lib/code-editor/code-editor.types';
import CodeEditor from '../src/lib/code-editor/CodeEditor.svelte';
import { doc, editorViews, mountInto, onTeardown, runTeardown, settle, waitFor } from './managed/support';

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
	warn = vi.spyOn(console, 'warn');
});
afterEach(() => {
	runTeardown();
	vi.restoreAllMocks();
});

async function mountStandalone(value = 'A', config: Parameters<typeof createInitialState>[0] = {}) {
	const store = createStore({
		initialState: createInitialState({ value, ...config }),
		reducer: codeEditorReducer,
		dependencies: {}
	});
	onTeardown(() => store.destroy());
	const target = mountInto(CodeEditor, { store });
	const [view] = await waitFor(() => editorViews(target).length === 1 && editorViews(target), 'the editor');
	return { store, target, view: view! };
}

describe('state before commands (standalone)', () => {
	it('a value written in the same tick before a command is in the document when it runs', async () => {
		const { store, view } = await mountStandalone();
		store.dispatch({ type: 'valueChanged', value: 'Loaded' });
		store.dispatch({ type: 'insertText', text: '!' });
		expect(doc(view)).toBe('!Loaded');
		expect(store.state.value).toBe('!Loaded');
	});

	it('readOnly lifted in the same tick before an insert does not refuse it', async () => {
		const { store, view } = await mountStandalone('A', { readOnly: true });
		store.dispatch({ type: 'setReadOnly', readOnly: false });
		store.dispatch({ type: 'insertText', text: 'w' });
		expect(doc(view)).toBe('wA');
	});

	it('an external write is undoable, and its echo is not reduced into a second state', async () => {
		const { store, view } = await mountStandalone();
		const seen: CodeEditorAction[] = [];
		store.subscribeToActions?.((action) => seen.push(action));
		store.dispatch({ type: 'valueChanged', value: 'from disk' });
		const after = store.state;
		await settle();
		expect(doc(view)).toBe('from disk');
		expect(store.state).toBe(after);
		expect(seen.filter((action) => action.type === 'valueChanged')).toHaveLength(1);
		expect(undoDepth(view.state)).toBe(1);
	});

	it('an edit to a CRLF document is not mistaken for a stale report', async () => {
		// CodeMirror reads CRLF back as LF; the staleness check must not treat
		// that as a different document, or every edit would be dropped.
		const { store, view } = await mountStandalone('one\r\ntwo');
		view.dispatch({ changes: { from: view.state.doc.length, insert: '!' }, userEvent: 'input.type' });
		expect(store.state.value).toBe('one\ntwo!');
		store.dispatch({ type: 'valueChanged', value: 'three\r\nfour' });
		expect(doc(view)).toBe('three\nfour');
		view.dispatch({ changes: { from: 0, insert: '>' }, userEvent: 'input.type' });
		expect(store.state.value).toBe('>three\nfour');
	});

	it('typing fast keeps state and document equal', async () => {
		const { store, view } = await mountStandalone('');
		for (const ch of 'hello world') {
			view.dispatch({ changes: { from: view.state.doc.length, insert: ch }, userEvent: 'input.type' });
		}
		expect(doc(view)).toBe('hello world');
		expect(store.state.value).toBe('hello world');
		expect(warn).not.toHaveBeenCalled();
	});
});

describe('a store without subscribeToActions', () => {
	/** A type-valid `Store` whose optional `subscribeToActions` is absent. */
	function bareStore(value: string): Store<CodeEditorState, CodeEditorAction> {
		const inner = createStore({ initialState: createInitialState({ value }), reducer: codeEditorReducer, dependencies: {} });
		onTeardown(() => inner.destroy());
		return {
			get state() {
				return inner.state;
			},
			dispatch: (action) => inner.dispatch(action),
			select: (selector) => inner.select(selector),
			subscribe: (listener) => inner.subscribe(listener),
			history: inner.history,
			destroy: () => inner.destroy()
		} as Store<CodeEditorState, CodeEditorAction>;
	}

	it('renders and edits, warns once per store, and names the likely causes', async () => {
		const store = bareStore('A');
		const first = mountInto(CodeEditor, { store });
		const second = mountInto(CodeEditor, { store });
		const [view] = await waitFor(() => editorViews(first).length === 1 && editorViews(first), 'the editor');
		await waitFor(() => editorViews(second).length === 1, 'the second editor');

		const messages = warn.mock.calls.map((call) => String(call[0])).filter((m) => m.startsWith('[CodeEditor]'));
		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain('subscribeToActions');
		expect(messages[0]).toContain('wrapper or copy of a managed view');
		expect(messages[0]).toContain('ApplicationStore');
		expect(messages[0]).toContain('two copies of @composable-svelte/core');

		// Values still flow both ways; only the commands are lost.
		view!.dispatch({ changes: { from: 1, insert: 'b' }, userEvent: 'input.type' });
		expect(store.state.value).toBe('Ab');
		store.dispatch({ type: 'valueChanged', value: 'loaded' });
		flushSync();
		expect(doc(view!)).toBe('loaded');
		store.dispatch({ type: 'insertText', text: 'x' });
		expect(doc(view!)).toBe('loaded');
	});

	it('a TestStore-style throwing subscribeToActions is not masked', async () => {
		const inner = createStore({ initialState: createInitialState({ value: 'A' }), reducer: codeEditorReducer, dependencies: {} });
		onTeardown(() => inner.destroy());
		const thrower = {
			get state() {
				return inner.state;
			},
			dispatch: (action: CodeEditorAction) => inner.dispatch(action),
			select: inner.select,
			subscribe: inner.subscribe,
			history: inner.history,
			destroy: inner.destroy,
			subscribeToActions: () => {
				throw new Error('subscribeToActions is not supported here');
			}
		} as unknown as Store<CodeEditorState, CodeEditorAction>;
		expect(() => mountInto(CodeEditor, { store: thrower })).toThrow('subscribeToActions is not supported here');
	});
});
