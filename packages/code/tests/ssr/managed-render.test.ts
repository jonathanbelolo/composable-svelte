/**
 * Server render of the migrated components, managed and standalone.
 *
 * On the server nothing mounts: no editor is created, no action listener is
 * bound, no command runs. The markup comes from state alone, and a command in
 * the store before render is neither executed nor kept for the client — there
 * is nothing to replay, because commands are not state.
 */
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { createStore } from '@composable-svelte/core';
import CodeEditor from '../../src/lib/code-editor/CodeEditor.svelte';
import CodeHighlight from '../../src/lib/code-highlight/CodeHighlight.svelte';
import { codeEditorReducer } from '../../src/lib/code-editor/code-editor.reducer';
import { codeHighlightReducer } from '../../src/lib/code-highlight/code-highlight.reducer';
import { createInitialState as editorState } from '../../src/lib/code-editor/code-editor.types';
import { createInitialState as highlightState } from '../../src/lib/code-highlight/code-highlight.types';
import EditorHost from '../managed/EditorHost.svelte';
import HighlightHost from '../managed/HighlightHost.svelte';
import CanvasHost from '../managed/CanvasHost.svelte';
import { createEditorRoot, insert } from '../managed/editor-model';
import { createHighlightRoot } from '../managed/highlight-model';
import { createCanvasRoot, toCanvas } from '../managed/canvas-model';

/** Occurrences of an element with exactly this class (scoped-style hashes may follow it). */
const count = (body: string, className: string) =>
	(body.match(new RegExp(`class="${className}(?:[ "])`, 'g')) ?? []).length;

describe('managed server render', () => {
	it('renders one CodeEditor per owner, with toolbar, and executes no command', () => {
		const store = createEditorRoot({}, { a: 'alpha', b: 'beta' });
		store.dispatch(insert('a', 'server'));
		store.dispatch({ type: 'openPanel', value: 'panel' });
		const before = JSON.stringify(store.state);
		const { body } = render(EditorHost, { props: { store, visibility: { show: true } } });
		expect(count(body, 'code-editor')).toBe(3);
		expect(count(body, 'code-editor__button code-editor__button--primary')).toBe(3);
		expect(body).not.toContain('cm-editor');
		// The command reduced to identical state and was delivered to nobody.
		expect(JSON.stringify(store.state)).toBe(before);
		expect(store.state.editors[0]!.state.value).toBe('alpha');
		store.destroy();
	});

	it('renders CodeHighlight from state without highlighting on the server', () => {
		const calls: string[] = [];
		const store = createHighlightRoot({
			highlightCode: async (code) => {
				calls.push(code);
				return code;
			}
		});
		const { body } = render(HighlightHost, { props: { store } });
		expect(count(body, 'code-highlight')).toBe(2);
		expect(body).toContain('const a = 1;');
		expect(calls).toEqual([]);
		store.destroy();
	});

	it('renders NodeCanvas per owner and runs no viewport command', () => {
		const store = createCanvasRoot();
		store.dispatch(toCanvas('one', { type: 'zoomIn' }));
		const { body } = render(CanvasHost, { props: { store } });
		expect(count(body, 'node-canvas')).toBe(2);
		expect(store.state.canvases[0]!.state.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
		store.destroy();
	});

	it('concurrent request stores render independently', () => {
		const first = createEditorRoot({}, { a: 'first request' });
		const second = createEditorRoot({}, { a: 'second request' });
		const one = render(EditorHost, { props: { store: first, visibility: { show: true } } }).body;
		const two = render(EditorHost, { props: { store: second, visibility: { show: true } } }).body;
		expect(count(one, 'code-editor')).toBe(1);
		expect(count(two, 'code-editor')).toBe(1);
		first.destroy();
		second.destroy();
	});
});

describe('standalone server render', () => {
	it('CodeEditor and CodeHighlight render from a plain store', () => {
		const editor = createStore({ initialState: editorState({ value: 'x' }), reducer: codeEditorReducer, dependencies: {} });
		const highlight = createStore({
			initialState: highlightState({ code: 'let y = 2;' }),
			reducer: codeHighlightReducer,
			dependencies: { highlightCode: async (code: string) => code }
		});
		expect(count(render(CodeEditor, { props: { store: editor } }).body, 'code-editor')).toBe(1);
		expect(render(CodeHighlight, { props: { store: highlight } }).body).toContain('let y = 2;');
		editor.destroy();
		highlight.destroy();
	});
});
