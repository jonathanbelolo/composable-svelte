/**
 * The SHIPPED `CodeEditor` as a managed feature view, in real Chromium.
 *
 * `defineViews(composition, { editors: { render: CodeEditor } })`: the
 * component receives `FeatureViewProps.store`, a captured `ChildView` with no
 * `subscribeToActions`. Commands therefore reach it only through
 * `observeChildActions` from the built `@composable-svelte/core/application`,
 * which is why every case also asserts that nothing warned.
 *
 * The reducer is the shipped `codeEditorReducer`, unchanged in the composition.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { flushSync } from 'svelte';
import { isolateHistory, undoDepth } from '@codemirror/commands';
import { language as languageFacet } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import { isManagedChildView } from '@composable-svelte/core/application';
import CodeEditor from '../../src/lib/code-editor/CodeEditor.svelte';
import EditorHost from './EditorHost.svelte';
import {
	createEditorRoot,
	editorComposition,
	editorsSlot,
	insert,
	panelSlot,
	rowOf,
	to,
	valueOf
} from './editor-model';
import { createSwappableProps, createVisibility } from './reactive-props.svelte';
import { doc, editorAt, editorViews, mountInto, onTeardown, runTeardown, settle, waitFor } from './support';

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

async function setup(dependencies: Parameters<typeof createEditorRoot>[0] = {}) {
	const store = createEditorRoot(dependencies);
	onTeardown(() => store.destroy());
	const visibility = createVisibility(true);
	const target = mountInto(EditorHost, { store, visibility });
	const outlet = target.querySelector<HTMLElement>('[data-outlet="editors"]')!;
	const panel = target.querySelector<HTMLElement>('[data-outlet="panel"]')!;
	const [a, b] = await waitFor(() => editorViews(outlet).length === 2 && editorViews(outlet), 'two editors');
	return { store, target, outlet, panel, visibility, a: a!, b: b! };
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => (resolve = done));
	return { promise, resolve };
}

/** A user keystroke: a user-event transaction on the live view. */
function type(view: EditorView, text: string, at = view.state.doc.length) {
	view.dispatch({ changes: { from: at, insert: text }, userEvent: 'input.type', annotations: isolateHistory.of('full') });
}

const quiet = () => {
	expect(warn).not.toHaveBeenCalled();
	expect(error).not.toHaveBeenCalled();
};

describe('the managed path is taken', () => {
	it('the component receives a genuine managed view and runs its commands without warning', async () => {
		const { store, a } = await setup();
		const bound = editorComposition.bind(store, editorsSlot.at('a'))!;
		expect(isManagedChildView(bound)).toBe(true);
		expect('subscribeToActions' in bound).toBe(false);
		store.dispatch(insert('a', 'x'));
		expect(doc(a)).toBe('xA');
		expect(valueOf(store.state, 'a')).toBe('xA');
		quiet();
	});
});

describe('ordered commands', () => {
	it('identical same-tick inserts and undos all run, in order', async () => {
		const { store, a } = await setup();
		store.dispatch(insert('a', 'x'));
		store.dispatch(insert('a', 'x'));
		expect(doc(a)).toBe('xxA');
		type(a, '1');
		type(a, '2');
		store.dispatch(to('a', { type: 'undo' }));
		store.dispatch(to('a', { type: 'undo' }));
		expect(doc(a)).toBe('xxA');
		expect(valueOf(store.state, 'a')).toBe('xxA');
		quiet();
	});

	it('a command reaches only its own owner; the captured view and the root dispatch agree', async () => {
		const { store, a, b } = await setup();
		const viewB = editorComposition.bind(store, editorsSlot.at('b'))!;
		viewB.dispatch({ type: 'insertText', text: 'p' });
		store.dispatch(insert('a', 'Alpha '));
		viewB.dispatch({ type: 'insertText', text: 'q' });
		expect(doc(b)).toBe('pqB');
		expect(doc(a)).toBe('Alpha A');
		quiet();
	});

	it('a six-command burst inside one drain all runs', async () => {
		const { store, a } = await setup();
		store.dispatch({ type: 'sequence', actions: ['1', '2', '3', '4', '5', '6'].map((text) => insert('a', text)) });
		expect(doc(a)).toBe('123456A');
		expect(valueOf(store.state, 'a')).toBe('123456A');
		// The editor's own queued reports are not external writes. Writing
		// their lagging values back would rewind and replace the whole document
		// mid-burst; it converges, but the cursor ends up elsewhere.
		expect(a.state.selection.main.head).toBe(6);
	});
});

describe('state reaches the engine before a command of a later turn', () => {
	it('a value reduced before a command is in the document when the command runs', async () => {
		const { store, a } = await setup();
		store.dispatch({ type: 'sequence', actions: [to('a', { type: 'valueChanged', value: 'Loaded' }), insert('a', '!')] });
		expect(doc(a)).toBe(valueOf(store.state, 'a'));
		expect(doc(a)).toContain('Loaded');
		expect(doc(a)).toContain('!');
	});

	it('readOnly lifted before an insert: the insert is not refused by the stale setting', async () => {
		const { store, a } = await setup();
		store.dispatch(to('a', { type: 'setReadOnly', readOnly: true }));
		expect(a.state.readOnly).toBe(true);
		store.dispatch({ type: 'sequence', actions: [to('a', { type: 'setReadOnly', readOnly: false }), insert('a', 'w')] });
		expect(a.state.readOnly).toBe(false);
		expect(doc(a)).toBe('wA');
	});

	it("a command's echo queued behind a newer external write does not overwrite it", async () => {
		// Turn 1 inserts '!' and CodeMirror reports "!A" (queued behind turn 2).
		// Turn 2 loads "Y". Turn 3 is that stale report: it names "A" as the
		// document it edited, state is "Y", so the reducer drops it.
		const { store, a } = await setup();
		store.dispatch({ type: 'sequence', actions: [insert('a', '!'), to('a', { type: 'valueChanged', value: 'Y' })] });
		expect(valueOf(store.state, 'a')).toBe('Y');
		expect(doc(a)).toBe('Y');
		quiet();
	});

	it('an external write reaches the editor as an undoable change, and its echo does not re-enter state', async () => {
		const { store, a } = await setup();
		const before = rowOf(store.state, 'a');
		store.dispatch(to('a', { type: 'valueChanged', value: 'from disk' }));
		const after = rowOf(store.state, 'a');
		expect(after).not.toBe(before);
		expect(doc(a)).toBe('from disk');
		await settle();
		// The editor's report of that write was reduced as stale: same object.
		expect(rowOf(store.state, 'a')).toBe(after);
		expect(undoDepth(a.state)).toBe(1);
		store.dispatch(to('a', { type: 'undo' }));
		expect(doc(a)).toBe('A');
		expect(valueOf(store.state, 'a')).toBe('A');
	});
});

describe('replacement, attachment and retirement', () => {
	it('same-ID replacement: the successor is a new editor; the predecessor ran only its own commands', async () => {
		const { store, outlet, a } = await setup();
		const first = editorComposition.bind(store, editorsSlot.at('a'))!;
		store.dispatch(insert('a', 'old '));
		store.dispatch({ type: 'replaceEditor', id: 'a', value: 'fresh' });
		flushSync();
		const successor = await waitFor(() => {
			const view = editorAt(outlet, 0);
			return view !== a && view;
		}, 'the successor editor');
		expect(first.state).toBeUndefined();
		first.dispatch({ type: 'insertText', text: 'late' });
		store.dispatch(insert('a', 'new '));
		expect(doc(a)).toBe('old A');
		expect(doc(successor)).toBe('new fresh');
		expect(valueOf(store.state, 'a')).toBe('new fresh');
		quiet();
	});

	it('same drain: command, replacement, command — the successor has not mounted, so its command is dropped', async () => {
		const { store, outlet, a } = await setup();
		store.dispatch({
			type: 'sequence',
			actions: [insert('a', 'x'), { type: 'replaceEditor', id: 'a', value: 'fresh' }, insert('a', 'y')]
		});
		flushSync();
		const successor = await waitFor(() => {
			const view = editorAt(outlet, 0);
			return view !== a && view;
		}, 'the successor editor');
		await settle();
		expect(doc(a)).toBe('xA');
		expect(doc(successor)).toBe('fresh');
		expect(valueOf(store.state, 'a')).toBe('fresh');
	});

	it('commands before the asynchronous editor exists are dropped, not replayed; later ones run', async () => {
		const store = createEditorRoot();
		onTeardown(() => store.destroy());
		const target = mountInto(EditorHost, { store, visibility: createVisibility(true) });
		// The outlet has mounted the component; `createEditorView` has not resolved.
		expect(editorViews(target)).toHaveLength(0);
		store.dispatch(insert('a', 'early'));
		store.dispatch(to('a', { type: 'focus' }));
		const [a] = await waitFor(() => editorViews(target).length === 2 && editorViews(target), 'editors');
		expect(doc(a!)).toBe('A');
		expect(a!.hasFocus).toBe(false);
		store.dispatch(insert('a', 'live '));
		expect(doc(a!)).toBe('live A');
	});

	it('a value written while the editor is being created is applied at attach, without entering history', async () => {
		const store = createEditorRoot();
		onTeardown(() => store.destroy());
		const target = mountInto(EditorHost, { store, visibility: createVisibility(true) });
		store.dispatch(to('a', { type: 'valueChanged', value: 'during creation' }));
		const [a] = await waitFor(() => editorViews(target).length === 2 && editorViews(target), 'editors');
		expect(doc(a!)).toBe('during creation');
		expect(undoDepth(a!.state)).toBe(0);
	});

	it('commands while no view is mounted reach nobody and are not replayed on remount', async () => {
		const { store, outlet, visibility } = await setup();
		visibility.show = false;
		flushSync();
		store.dispatch(insert('a', 'unseen'));
		visibility.show = true;
		flushSync();
		const [a] = await waitFor(() => editorViews(outlet).length === 2 && editorViews(outlet), 'remounted editors');
		expect(doc(a!)).toBe('A');
		expect(valueOf(store.state, 'a')).toBe('A');
	});

	it('closing a panel while its editor is being created runs nothing, leaks no editor and logs nothing', async () => {
		const { store, panel } = await setup();
		store.dispatch({ type: 'openPanel', value: 'P' });
		flushSync();
		const view = editorComposition.bind(store, panelSlot)!;
		expect(isManagedChildView(view)).toBe(true);
		view.dispatch({ type: 'insertText', text: 'never' });
		store.dispatch({ type: 'closePanel' });
		flushSync();
		view.dispatch({ type: 'undo' });
		await settle(300);
		expect(view.state).toBeUndefined();
		expect(editorViews(panel)).toHaveLength(0);
		expect(panel.querySelector('.code-editor')).toBeNull();
		quiet();
	});

	it('the panel (a presentation view) takes commands like a keyed row', async () => {
		const { store, panel } = await setup();
		store.dispatch({ type: 'openPanel', value: 'P' });
		flushSync();
		const [view] = await waitFor(() => editorViews(panel).length === 1 && editorViews(panel), 'panel editor');
		store.dispatch({ type: 'panel', action: { type: 'presented', action: { type: 'insertText', text: '>' } } });
		expect(doc(view!)).toBe('>P');
		expect(store.state.panel?.value).toBe('>P');
		quiet();
	});
});

describe('a hand-bound view outlives its owner', () => {
	it('keeps rendering the last state and ignores the retired owner, without throwing', async () => {
		const store = createEditorRoot();
		onTeardown(() => store.destroy());
		const view = editorComposition.bind(store, editorsSlot.at('a'))!;
		const target = mountInto(CodeEditor, { store: view });
		const [editor] = await waitFor(() => editorViews(target).length === 1 && editorViews(target), 'editor');
		store.dispatch({ type: 'replaceEditor', id: 'a', value: 'successor' });
		flushSync();
		await settle();
		expect(view.state).toBeUndefined();
		// Still rendered from the retained state, toolbar included.
		expect(target.querySelector('.code-editor')).not.toBeNull();
		expect(target.querySelector('button[aria-label="Save code"]')).not.toBeNull();
		// The successor's commands never reach the retired owner's editor.
		store.dispatch(insert('a', 'x'));
		expect(doc(editor!)).toBe('A');
		expect(valueOf(store.state, 'a')).toBe('successor');
		expect(error).not.toHaveBeenCalled();
	});

	it('mounting a view whose owner has already retired renders nothing and throws nothing', async () => {
		const store = createEditorRoot();
		onTeardown(() => store.destroy());
		const view = editorComposition.bind(store, editorsSlot.at('a'))!;
		store.dispatch({ type: 'replaceEditor', id: 'a', value: 'successor' });
		const target = mountInto(CodeEditor, { store: view });
		await settle(200);
		expect(target.querySelector('.code-editor')).toBeNull();
		expect(error).not.toHaveBeenCalled();
	});

	it('warns once when the store prop is swapped after mount, and stays bound to the first', async () => {
		const store = createEditorRoot();
		onTeardown(() => store.destroy());
		const props = createSwappableProps(editorComposition.bind(store, editorsSlot.at('a'))!);
		const target = mountInto(CodeEditor, props);
		const [editor] = await waitFor(() => editorViews(target).length === 1 && editorViews(target), 'editor');
		props.store = editorComposition.bind(store, editorsSlot.at('b'))!;
		flushSync();
		props.store = editorComposition.bind(store, editorsSlot.at('a'))!;
		flushSync();
		props.store = editorComposition.bind(store, editorsSlot.at('b'))!;
		flushSync();
		const swaps = warn.mock.calls.filter((call) => String(call[0]).includes('the store prop changed after mount'));
		expect(swaps).toHaveLength(1);
		store.dispatch(insert('a', 'x'));
		expect(doc(editor!)).toBe('xA');
	});
});

describe('toolbar, save, format, reconfiguration and focus on the managed path', () => {
	it('Save calls onSave with the current value and clears the unsaved mark', async () => {
		const onSave = vi.fn(async () => {});
		const { store, outlet, a } = await setup({ onSave });
		type(a, '+');
		await settle();
		const save = outlet.querySelector<HTMLButtonElement>('button[aria-label="Save code"]')!;
		expect(save.disabled).toBe(false);
		save.click();
		await waitFor(() => rowOf(store.state, 'a')?.lastSavedValue === 'A+', 'the save to settle');
		expect(onSave).toHaveBeenCalledWith('A+', expect.anything());
		expect(rowOf(store.state, 'a')?.hasUnsavedChanges).toBe(false);
	});

	it('the language select reconfigures the live editor in place, keeping its document and history', async () => {
		const { store, outlet, a } = await setup();
		type(a, '#');
		const select = outlet.querySelector<HTMLSelectElement>('select[aria-label="Select programming language"]')!;
		select.value = 'python';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		expect(rowOf(store.state, 'a')?.language).toBe('python');
		await waitFor(() => a.state.facet(languageFacet)?.name === 'python', 'the python grammar');
		expect(doc(a)).toBe('A#');
		expect(undoDepth(a.state)).toBe(1);
	});

	it('theme, line numbers and folding apply to the live view', async () => {
		const { store, outlet, a } = await setup();
		const gutter = () => a.dom.querySelector('.cm-lineNumbers');
		expect(gutter()).not.toBeNull();
		outlet.querySelector<HTMLButtonElement>('button[aria-label="Toggle line numbers"]')!.click();
		flushSync();
		expect(rowOf(store.state, 'a')?.showLineNumbers).toBe(false);
		expect(gutter()).toBeNull();
		store.dispatch(to('a', { type: 'toggleFolding' }));
		expect(a.dom.querySelector('.cm-foldGutter')).toBeNull();
	});

	it('an edit made while a format runs survives the late result', async () => {
		const pending = deferred<string>();
		const { store, a } = await setup({ formatter: () => pending.promise });
		store.dispatch(to('a', { type: 'format' }));
		type(a, ' edited');
		pending.resolve('FORMATTED');
		await settle();
		expect(valueOf(store.state, 'a')).toBe('A edited');
		expect(doc(a)).toBe('A edited');
	});

	it('a format result reaches the editor and can be undone', async () => {
		const { store, a } = await setup({ formatter: async (code) => code.toLowerCase() });
		store.dispatch(to('a', { type: 'format' }));
		await waitFor(() => valueOf(store.state, 'a') === 'a', 'the format');
		expect(doc(a)).toBe('a');
		store.dispatch(to('a', { type: 'undo' }));
		expect(doc(a)).toBe('A');
		expect(valueOf(store.state, 'a')).toBe('A');
	});

	it('autofocus focuses the editor once it exists', async () => {
		const store = createEditorRoot();
		onTeardown(() => store.destroy());
		const view = editorComposition.bind(store, editorsSlot.at('a'))!;
		const target = mountInto(CodeEditor, { store: view, autofocus: true });
		const [editor] = await waitFor(() => editorViews(target).length === 1 && editorViews(target), 'editor');
		expect(editor!.hasFocus).toBe(true);
		await waitFor(() => rowOf(store.state, 'a')?.isFocused, 'focused to be reported');
	});
});
