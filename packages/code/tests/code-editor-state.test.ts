/**
 * The editor's last three write-only fields, plus its unusable focus exports.
 *
 * `isFocused` was set by `focused`/`blurred` and read by nothing. `error` was
 * declared and initialised but **no action ever set it**, so the error banner
 * in the markup was unreachable — while the one place a failure actually
 * occurred, the language-load `.catch(...)`, reset a guard and dropped the
 * reason on the floor.
 *
 * `focusEditor` / `blurEditor` were exported from both barrels with zero
 * callers, and unusable in practice: a consumer has no way to obtain the
 * `EditorView`, which `CodeEditor` never exposes. Same shape as
 * `strictValidator`. They are now `focus` / `blur` command actions, handled on
 * the action stream where the other five commands already live — the reducer
 * stays pure and the view performs the effect.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { EditorView } from '@codemirror/view';
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

describe('isFocused', () => {
	it('shows on the root element', async () => {
		const { target, view } = await mountEditor();
		const root = () => target.querySelector('.code-editor')!;
		expect(root().className).not.toContain('code-editor--focused');

		view.focus();
		await settle(300);
		expect(
			root().className,
			'isFocused was tracked in the store and rendered nowhere'
		).toContain('code-editor--focused');

		view.contentDOM.blur();
		await settle(300);
		expect(root().className).not.toContain('code-editor--focused');
	});
});

describe('focus and blur commands', () => {
	it('dispatching focus focuses the editor', async () => {
		const { store, view } = await mountEditor();
		expect(view.hasFocus).toBe(false);

		store.dispatch({ type: 'focus' });
		flushSync();
		await settle(250);

		expect(view.hasFocus, 'the focus command never reached the editor').toBe(true);
	});

	it('dispatching blur blurs it', async () => {
		const { store, view } = await mountEditor();
		store.dispatch({ type: 'focus' });
		flushSync();
		await settle(250);
		expect(view.hasFocus).toBe(true);

		store.dispatch({ type: 'blur' });
		flushSync();
		await settle(250);

		expect(view.hasFocus).toBe(false);
	});
});

describe('the error banner', () => {
	/**
	 * Split deliberately. `state.error` had NO writer at all, so the banner was
	 * unreachable markup — that is the defect, and it is what these two tests
	 * pin: dispatching `languageLoadFailed` renders it, and `languageChanged`
	 * clears it.
	 *
	 * NOT gated: the wiring from the failing dynamic import to that dispatch.
	 * `loadLanguage` falls back to JavaScript for an unrecognised language
	 * rather than rejecting (`codemirror-wrapper.ts:185-188`), so the only real
	 * trigger is a genuinely unresolvable chunk — a post-deploy cache miss —
	 * which this harness cannot produce without mocking the module under test.
	 * The `.catch` now dispatches instead of swallowing; that edge is verified
	 * by reading, not by running, and is called out rather than implied.
	 */
	it('renders when a language load fails', async () => {
		const { store, target } = await mountEditor();
		expect(target.querySelector('.code-editor__error')).toBeNull();

		store.dispatch({
			type: 'languageLoadFailed',
			language: 'python',
			error: 'Failed to fetch dynamically imported module'
		});
		flushSync();
		await settle(250);

		const banner = target.querySelector('.code-editor__error');
		expect(banner, 'state.error had no writer, so this markup was unreachable').not.toBeNull();
		expect(banner!.textContent).toContain('python');
		expect(banner!.textContent).toContain('Failed to fetch');
	});

	it('clears when a language is selected again', async () => {
		const { store, target } = await mountEditor();
		store.dispatch({ type: 'languageLoadFailed', language: 'python', error: 'boom' });
		flushSync();
		await settle(250);
		expect(target.querySelector('.code-editor__error')).not.toBeNull();

		store.dispatch({ type: 'languageChanged', language: 'python' });
		flushSync();
		await settle(400);

		expect(
			target.querySelector('.code-editor__error'),
			'the error stuck after the user retried'
		).toBeNull();
	});
});
