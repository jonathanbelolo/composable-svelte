/**
 * Five actions were pure no-ops, and two wrote to the wrong fields.
 *
 * `insertText`, `deleteSelection`, `selectAll`, `undo` and `redo` all returned
 * state unchanged with a comment saying CodeMirror would handle it. Nothing
 * did. `undo` additionally set `canRedo` and `redo` set `canUndo` — inverted —
 * and neither flag was read by anything.
 *
 * ARCHITECTURE. These are *commands*, not configuration: they have no state to
 * sync, so the compartment/`syncConfig` mechanism is the wrong tool. The
 * reducer stays pure — the command cases return the identical state and no
 * effect — and the **view** subscribes to the action stream and performs the
 * imperative CodeMirror call. State stays in the store, effects stay data, and
 * the reducer never touches the DOM.
 *
 * `subscribeToActions` is the documented mechanism for exactly this
 * (`core/types.ts:239`), already used by `media`'s VoiceInput. It fires
 * synchronously per dispatch, which a state queue drained by an `$effect`
 * cannot match: Svelte coalesces effect runs, so two commands dispatched in one
 * tick would collapse into one. There is a test for that below.
 *
 * Every assertion is on the live `EditorView`.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { EditorView } from '@codemirror/view';
import { undoDepth, redoDepth } from '@codemirror/commands';
import { createStore } from '@composable-svelte/core';
import { codeEditorReducer } from '../src/lib/code-editor/code-editor.reducer';
import { createInitialState } from '../src/lib/code-editor/code-editor.types';
import CodeEditor from '../src/lib/code-editor/CodeEditor.svelte';

const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

async function waitFor<T>(read: () => T | null | undefined, what: string, tries = 80): Promise<T> {
	for (let i = 0; i < tries; i += 1) {
		const found = read();
		if (found) return found;
		await new Promise((r) => setTimeout(r, 25));
	}
	throw new Error(`timed out waiting for ${what}`);
}

async function mountEditor(config: Parameters<typeof createInitialState>[0] = {}) {
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
	const view = await waitFor(() => EditorView.findFromDOM(target), 'the EditorView');
	return { store, target, view };
}

const button = (target: HTMLElement, label: string) =>
	target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

describe('editing commands reach the editor', () => {
	it('insertText inserts at the cursor', async () => {
		const { store, view } = await mountEditor();
		view.dispatch({ selection: { anchor: 0 } });

		store.dispatch({ type: 'insertText', text: 'X' });
		flushSync();
		await settle();

		expect(view.state.doc.toString()).toBe('Xconst a = 1;');
	});

	it('two commands in one tick both land', async () => {
		// The test a coalescing `$effect` drain fails. Svelte batches effect
		// runs, so a state-queue implementation would collapse these into one.
		const { store, view } = await mountEditor();
		view.dispatch({ selection: { anchor: 0 } });

		store.dispatch({ type: 'insertText', text: 'a' });
		store.dispatch({ type: 'insertText', text: 'b' });
		flushSync();
		await settle();

		expect(view.state.doc.toString()).toBe('abconst a = 1;');
	});

	it('deleteSelection removes the selected range', async () => {
		const { store, view } = await mountEditor();
		view.dispatch({ selection: { anchor: 0, head: 6 } });

		store.dispatch({ type: 'deleteSelection' });
		flushSync();
		await settle();

		expect(view.state.doc.toString()).toBe('a = 1;');
	});

	it('deleteSelection respects read-only', async () => {
		// A programmatic dispatch would otherwise bypass `EditorState.readOnly`,
		// which the compartment work established as meaningful.
		const { store, view } = await mountEditor({ readOnly: true });
		view.dispatch({ selection: { anchor: 0, head: 6 } });

		store.dispatch({ type: 'deleteSelection' });
		flushSync();
		await settle();

		expect(view.state.doc.toString()).toBe('const a = 1;');
	});

	it('selectAll selects the whole document', async () => {
		const { store, view } = await mountEditor();

		store.dispatch({ type: 'selectAll' });
		flushSync();
		await settle();

		expect(view.state.selection.main.from).toBe(0);
		expect(view.state.selection.main.to).toBe(view.state.doc.length);
	});
});

describe('undo and redo', () => {
	it('the buttons reflect real history depth', async () => {
		const { target, view } = await mountEditor();
		expect(button(target, 'Undo')!.disabled, 'nothing to undo at mount').toBe(true);
		expect(button(target, 'Redo')!.disabled).toBe(true);

		view.dispatch({ changes: { from: 0, insert: 'X' }, userEvent: 'input.type' });
		await settle(250);

		expect(undoDepth(view.state)).toBe(1);
		expect(button(target, 'Undo')!.disabled, 'Undo stayed disabled after an edit').toBe(false);
	});

	it('undo and redo actually move the document', async () => {
		const { target, view } = await mountEditor();
		view.dispatch({ changes: { from: 0, insert: 'X' }, userEvent: 'input.type' });
		await settle(250);
		expect(view.state.doc.toString()).toBe('Xconst a = 1;');

		button(target, 'Undo')!.click();
		await settle(250);
		expect(view.state.doc.toString(), 'undo did not reach the editor').toBe('const a = 1;');
		expect(redoDepth(view.state)).toBe(1);
		expect(button(target, 'Redo')!.disabled).toBe(false);

		button(target, 'Redo')!.click();
		await settle(250);
		expect(view.state.doc.toString()).toBe('Xconst a = 1;');
	});

	it('does not dispatch on every keystroke', async () => {
		// `canUndo`/`canRedo` are booleans, so they flip only at session
		// boundaries. Reporting depth per keystroke would be a dispatch storm.
		const { store, view } = await mountEditor();
		let historyChanges = 0;
		store.subscribeToActions?.((action) => {
			if (action.type === 'historyChanged') historyChanges += 1;
		});

		for (let i = 0; i < 30; i += 1) {
			view.dispatch({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type' });
		}
		await settle(300);

		expect(historyChanges, 'one dispatch per keystroke').toBeLessThanOrEqual(2);
	});

	it('a value dispatched during mount is not undoable', async () => {
		// The mount-time catch-up exists for exactly this window: `createEditorView`
		// is async, so anything dispatched before it resolves has to be applied
		// afterwards. That application is the editor agreeing with state it was
		// built from — not an edit — so it must not enter the undo history.
		//
		// Without dispatching inside the window the catch-up never runs, and the
		// guard looks tested when it is not. Verified by mutation: dropping
		// `addToHistory: false` leaves the plain mount test green.
		const store = createStore({
			initialState: createInitialState({ value: 'original' }),
			reducer: codeEditorReducer,
			dependencies: {}
		});
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(CodeEditor, { target, props: { store } });
		cleanup.push(() => {
			unmount(component);
			target.remove();
		});

		// Before the async view resolves.
		store.dispatch({ type: 'valueChanged', value: 'arrived during mount' });
		flushSync();

		const view = await waitFor(() => EditorView.findFromDOM(target), 'the EditorView');
		await settle(400);

		expect(view.state.doc.toString(), 'the catch-up never applied').toBe(
			'arrived during mount'
		);
		expect(
			undoDepth(view.state),
			'the mount catch-up became an undoable edit — one Undo would wipe the content'
		).toBe(0);
	});

	it('opens with a clean undo stack', async () => {
		// The mount-time catch-up sync must not become an undoable edit, or the
		// editor opens with Undo already enabled.
		const { target, view } = await mountEditor({ value: 'seeded content' });
		await settle(250);

		expect(undoDepth(view.state)).toBe(0);
		expect(button(target, 'Undo')!.disabled).toBe(true);
	});
});
