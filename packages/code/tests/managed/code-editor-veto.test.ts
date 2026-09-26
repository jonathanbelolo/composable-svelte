/**
 * A parent reducer that declines or rewrites `valueChanged`, with the real
 * `CodeEditor` in real Chromium, standalone and managed.
 *
 * CODE-INDEPENDENT-REVIEW F1: a declined edit used to leave the document
 * showing the rejected text while state kept the old value. Every later report
 * named the rejected text as its base, so the reducer dropped them all as
 * stale, and Save wrote a value the user could not see. The editor must go
 * back to the accepted value, and later edits must land.
 *
 * F2: in one managed drain, `[insertText '!', valueChanged 'A']` on state "A"
 * used to end at "!A". The external write restored the very text the queued
 * report was edited from, so the report's base still matched.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { isolateHistory, undoDepth } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { createStore, type Reducer, type Store } from '@composable-svelte/core';
import { codeEditorReducer } from '../../src/lib/code-editor/code-editor.reducer';
import {
	createInitialState,
	type CodeEditorAction,
	type CodeEditorDependencies,
	type CodeEditorState
} from '../../src/lib/code-editor/code-editor.types';
import CodeEditor from '../../src/lib/code-editor/CodeEditor.svelte';
import EditorHost from './EditorHost.svelte';
import VetoHost from './VetoHost.svelte';
import { createEditorRoot, insert, to, valueOf } from './editor-model';
import { createVisibility } from './reactive-props.svelte';
import { createVetoRoot, limitedEditorReducer, toVeto, vetoRow } from './veto-model';
import { doc, editorViews, mountInto, onTeardown, runTeardown, waitFor } from './support';

let warn: MockInstance<typeof console.warn>;
let error: MockInstance<typeof console.error>;
beforeEach(() => {
	warn = vi.spyOn(console, 'warn');
	error = vi.spyOn(console, 'error');
});
afterEach(() => {
	runTeardown();
	vi.restoreAllMocks();
});

const quiet = () => {
	expect(warn).not.toHaveBeenCalled();
	expect(error).not.toHaveBeenCalled();
};

/** A user keystroke, its own undo event. */
function type(view: EditorView, text: string, at = view.state.doc.length) {
	view.dispatch({ changes: { from: at, insert: text }, userEvent: 'input.type', annotations: isolateHistory.of('full') });
}

/** A user deletion of `[from, to)`, its own undo event. */
function erase(view: EditorView, from: number, to: number) {
	view.dispatch({ changes: { from, to }, userEvent: 'delete', annotations: isolateHistory.of('full') });
}

async function mountStandalone(
	reducer: Reducer<CodeEditorState, CodeEditorAction, CodeEditorDependencies>,
	value: string,
	dependencies: CodeEditorDependencies = {}
) {
	const store = createStore({ initialState: createInitialState({ value }), reducer, dependencies });
	onTeardown(() => store.destroy());
	const target = mountInto(CodeEditor, { store });
	const [view] = await waitFor(() => editorViews(target).length === 1 && editorViews(target), 'the editor');
	return { store, view: view! };
}

async function mountManaged(value: string, dependencies: CodeEditorDependencies = {}) {
	const store = createVetoRoot(value, dependencies);
	onTeardown(() => store.destroy());
	const target = mountInto(VetoHost, { store });
	const [view] = await waitFor(() => editorViews(target).length === 1 && editorViews(target), 'the editor');
	return { store, view: view! };
}

describe('a parent that declines an edit (standalone)', () => {
	it('the editor returns to the accepted value, later edits land, and Save saves what is shown', async () => {
		const onSave = vi.fn(async (_value: string) => {});
		const { store, view } = await mountStandalone(limitedEditorReducer, 'abc', { onSave });

		view.dispatch({ selection: { anchor: view.state.doc.length } });
		type(view, 'd');
		expect(store.state.value).toBe('abc');
		expect(doc(view)).toBe('abc');
		expect(store.state.cursorPosition).toEqual({ line: 1, column: 3 });
		// The declined keystroke left no undo event behind.
		expect(undoDepth(view.state)).toBe(0);

		// The review's repro: deleting two characters is within the limit.
		erase(view, 0, 2);
		expect(store.state.value).toBe('c');
		expect(doc(view)).toBe('c');

		type(view, 'xy');
		expect(store.state.value).toBe('cxy');
		expect(doc(view)).toBe('cxy');

		store.dispatch({ type: 'save' });
		await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
		expect(onSave.mock.calls[0]![0]).toBe(doc(view));
		quiet();
	});

	it('undo after a declined edit undoes the last accepted edit, and state follows', async () => {
		const { store, view } = await mountStandalone(limitedEditorReducer, 'ab');
		type(view, 'c');
		type(view, 'd');
		expect(doc(view)).toBe('abc');
		store.dispatch({ type: 'undo' });
		expect(doc(view)).toBe('ab');
		expect(store.state.value).toBe('ab');
		store.dispatch({ type: 'redo' });
		expect(doc(view)).toBe('abc');
		expect(store.state.value).toBe('abc');
	});

	it('a declined command is reverted too', async () => {
		const { store, view } = await mountStandalone(limitedEditorReducer, 'abc');
		store.dispatch({ type: 'insertText', text: '!' });
		expect(doc(view)).toBe('abc');
		store.dispatch({ type: 'selectAll' });
		store.dispatch({ type: 'insertText', text: 'ok' });
		expect(doc(view)).toBe('ok');
		expect(store.state.value).toBe('ok');
	});

	it('a store without subscribeToActions reverts a declined edit as well', async () => {
		const inner = createStore({
			initialState: createInitialState({ value: 'abc' }),
			reducer: limitedEditorReducer,
			dependencies: {}
		});
		onTeardown(() => inner.destroy());
		const bare = {
			get state() {
				return inner.state;
			},
			dispatch: (action) => inner.dispatch(action),
			select: (selector) => inner.select(selector),
			subscribe: (listener) => inner.subscribe(listener),
			history: inner.history,
			destroy: () => inner.destroy()
		} as Store<CodeEditorState, CodeEditorAction>;
		const target = mountInto(CodeEditor, { store: bare });
		const [view] = await waitFor(() => editorViews(target).length === 1 && editorViews(target), 'the editor');
		type(view!, 'd');
		expect(doc(view!)).toBe('abc');
		erase(view!, 0, 1);
		expect(inner.state.value).toBe('bc');
		expect(doc(view!)).toBe('bc');
	});
});

describe('a parent that rewrites an edit (standalone)', () => {
	const upper: Reducer<CodeEditorState, CodeEditorAction, CodeEditorDependencies> = (state, action, deps) =>
		codeEditorReducer(state, action.type === 'valueChanged' ? { ...action, value: action.value.toUpperCase() } : action, deps);

	it('the editor shows the rewritten value and later edits build on it', async () => {
		const { store, view } = await mountStandalone(upper, 'A');
		type(view, 'b');
		expect(store.state.value).toBe('AB');
		expect(doc(view)).toBe('AB');
		type(view, 'c');
		expect(store.state.value).toBe('ABC');
		expect(doc(view)).toBe('ABC');
		quiet();
	});
});

describe('a parent-composed reducer that declines an edit (managed)', () => {
	it('a declined keystroke is reverted, later edits land, and Save saves what is shown', async () => {
		const onSave = vi.fn(async (_value: string) => {});
		const { store, view } = await mountManaged('abc', { onSave });

		view.dispatch({ selection: { anchor: view.state.doc.length } });
		type(view, 'd');
		expect(vetoRow(store.state)?.value).toBe('abc');
		expect(doc(view)).toBe('abc');
		expect(vetoRow(store.state)?.cursorPosition).toEqual({ line: 1, column: 3 });

		erase(view, 0, 2);
		expect(vetoRow(store.state)?.value).toBe('c');
		expect(doc(view)).toBe('c');

		type(view, 'xy');
		expect(vetoRow(store.state)?.value).toBe('cxy');
		expect(doc(view)).toBe('cxy');

		store.dispatch(toVeto({ type: 'save' }));
		await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
		expect(onSave.mock.calls[0]![0]).toBe(doc(view));
		quiet();
	});

	it('in one drain: the accepted report stays, the declined one and those behind it are reverted', async () => {
		// Three inserts run before any report is reduced: the document reaches
		// "xyzab" while state is "ab". "xab" is accepted and "xyab" declined;
		// "xyzab" was edited on top of the declined text and is not accepted.
		const { store, view } = await mountManaged('ab');
		store.dispatch({
			type: 'sequence',
			actions: [toVeto({ type: 'insertText', text: 'x' }), toVeto({ type: 'insertText', text: 'y' }), toVeto({ type: 'insertText', text: 'z' })]
		});
		expect(vetoRow(store.state)?.value).toBe('xab');
		expect(doc(view)).toBe('xab');

		type(view, '!', 0);
		expect(doc(view)).toBe('xab');
		erase(view, 0, 1);
		type(view, 'Q', 0);
		expect(vetoRow(store.state)?.value).toBe('Qab');
		expect(doc(view)).toBe('Qab');
		quiet();
	});
});

describe('value ABA in one managed drain (F2)', () => {
	async function mountRoot() {
		const store = createEditorRoot({}, { a: 'A' });
		onTeardown(() => store.destroy());
		const target = mountInto(EditorHost, { store, visibility: createVisibility(true) });
		const outlet = target.querySelector<HTMLElement>('[data-outlet="editors"]')!;
		const [view] = await waitFor(() => editorViews(outlet).length === 1 && editorViews(outlet), 'the editor');
		return { store, view: view! };
	}

	it('[insertText "!", valueChanged "A"] ends at the external write, "A"', async () => {
		const { store, view } = await mountRoot();
		store.dispatch({ type: 'sequence', actions: [insert('a', '!'), to('a', { type: 'valueChanged', value: 'A' })] });
		expect(valueOf(store.state, 'a')).toBe('A');
		expect(doc(view)).toBe('A');
		// Later edits still land.
		store.dispatch(insert('a', '?'));
		expect(valueOf(store.state, 'a')).toBe('?A');
		expect(doc(view)).toBe('?A');
		quiet();
	});

	it('the control: a different external value also wins', async () => {
		const { store, view } = await mountRoot();
		store.dispatch({ type: 'sequence', actions: [insert('a', '!'), to('a', { type: 'valueChanged', value: 'Y' })] });
		expect(valueOf(store.state, 'a')).toBe('Y');
		expect(doc(view)).toBe('Y');
	});

	it('a restoring `formatted` in the same drain wins as well', async () => {
		const { store, view } = await mountRoot();
		store.dispatch({ type: 'sequence', actions: [insert('a', '!'), to('a', { type: 'formatted', value: 'A' })] });
		expect(valueOf(store.state, 'a')).toBe('A');
		expect(doc(view)).toBe('A');
	});
});
