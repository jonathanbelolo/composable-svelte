/**
 * The editor toolbar must not lie to the user, and must not trap them.
 *
 * Two defects live here, both reachable by clicking:
 *
 * 1. **The Format button soft-locks.** It is
 *    `disabled={$store.readOnly || $store.formatError !== null}`, and
 *    `formatError` is cleared only inside `case 'format'`
 *    (`code-editor.reducer.ts:156`) — which a disabled button can never reach.
 *    So one failed format disables Format for the rest of the session. The
 *    README's own example passes `dependencies: {}`, which makes the very
 *    first click fail with 'No formatter configured'.
 *
 * 2. **The Line Numbers button changes its own label and nothing else.**
 *    `basicSetup` hardcodes `lineNumbers()`, so the gutter is always on.
 *
 * Assertions are against the live `EditorView` and the real DOM, never the
 * store: the store was always updating correctly: the editor was what ignored
 * it, so a store-only assertion passes with the defect fully present.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { EditorView } from '@codemirror/view';
import { foldCode, foldedRanges, getIndentUnit, indentString } from '@codemirror/language';
import { startCompletion } from '@codemirror/autocomplete';
import { createStore } from '@composable-svelte/core';
import { codeEditorReducer } from '../src/lib/code-editor/code-editor.reducer';
import { createInitialState } from '../src/lib/code-editor/code-editor.types';
import type { CodeEditorDependencies } from '../src/lib/code-editor/code-editor.types';
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

async function mountEditor(
	config: Parameters<typeof createInitialState>[0] = {},
	dependencies: Partial<CodeEditorDependencies> = {}
) {
	const store = createStore({
		initialState: createInitialState({ value: 'const a = 1;', ...config }),
		reducer: codeEditorReducer,
		dependencies
	});
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(CodeEditor, { target, props: { store } });
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	const view = await waitFor(() => EditorView.findFromDOM(target), 'the EditorView to mount');
	return { store, target, view };
}

const button = (target: HTMLElement, label: string) =>
	target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

describe('the Format button', () => {
	it('recovers after a failed format', async () => {
		// Mounted with no formatter, exactly as the README's example does.
		const { target } = await mountEditor();
		const format = button(target, 'Format code');
		expect(format, 'no Format button').not.toBeNull();
		expect(format!.disabled, 'precondition: Format starts enabled').toBe(false);

		format!.click();
		await settle(300);

		expect(
			format!.disabled,
			'one failed format disabled Format permanently — `formatError` is cleared only inside `case format`, which a disabled button cannot reach'
		).toBe(false);
	});

	it('still formats after a previous failure', async () => {
		// The recovery must be real, not merely a re-enabled button. A formatter
		// that throws once then succeeds models the realistic case: a transient
		// failure (parse error, network formatter down) that the user retries.
		let calls = 0;
		const formatter = vi.fn(async (v: string) => {
			calls += 1;
			if (calls === 1) throw new Error('transient');
			return v.toUpperCase();
		});
		const { target, view } = await mountEditor({}, { formatter });

		button(target, 'Format code')!.click();
		await settle(400);
		expect(formatter, 'precondition: the first attempt ran').toHaveBeenCalledTimes(1);
		expect(view.state.doc.toString(), 'precondition: the first attempt failed').toBe(
			'const a = 1;'
		);

		button(target, 'Format code')!.click();
		await settle(400);

		expect(formatter, 'the retry never ran — the button was still trapped').toHaveBeenCalledTimes(
			2
		);
		expect(view.state.doc.toString()).toBe('CONST A = 1;');
	});

	it('stays disabled while read-only', async () => {
		// The half of the disabled condition that is correct, so a fix cannot
		// pass by simply dropping `disabled` entirely.
		const { target } = await mountEditor({ readOnly: true });
		expect(button(target, 'Format code')!.disabled).toBe(true);
	});
});

describe('the Line Numbers button', () => {
	it('actually shows and hides the gutter', async () => {
		const { target, view } = await mountEditor();
		const toggle = button(target, 'Toggle line numbers');
		expect(toggle, 'no Line Numbers button').not.toBeNull();

		const gutter = () => view.dom.querySelector('.cm-lineNumbers');
		expect(gutter(), 'precondition: line numbers start visible').not.toBeNull();

		toggle!.click();
		await settle(300);
		expect(
			gutter(),
			'the button label flipped but the gutter is still there'
		).toBeNull();

		toggle!.click();
		await settle(300);
		expect(gutter(), 'line numbers did not come back').not.toBeNull();
	});
});

describe('folding', () => {
	it('shows and hides the fold gutter', async () => {
		const { store, view } = await mountEditor({ value: 'function f() {\n  return 1;\n}\n' });
		const gutter = () => view.dom.querySelector('.cm-foldGutter');
		expect(gutter(), 'precondition: folding starts on').not.toBeNull();

		store.dispatch({ type: 'toggleFolding' });
		flushSync();
		await settle(300);
		expect(gutter()).toBeNull();

		store.dispatch({ type: 'toggleFolding' });
		flushSync();
		await settle(300);
		expect(gutter()).not.toBeNull();
	});

	it('keeps existing folds when the gutter is hidden and shown', async () => {
		// `codeFolding()` is installed outside the fold compartment for exactly
		// this. `foldGutter()` bundles `codeFolding()`, and `foldState` is a
		// module-level StateField — so compartmenting the whole thing would drop
		// and recreate the field, silently unfolding everything the user folded.
		const { store, view } = await mountEditor({
			value: 'function f() {\n  return 1;\n}\n'
		});
		foldCode(view);
		await settle(150);
		expect(foldedRanges(view.state).size, 'precondition: something folded').toBe(1);

		store.dispatch({ type: 'toggleFolding' });
		flushSync();
		await settle(250);
		store.dispatch({ type: 'toggleFolding' });
		flushSync();
		await settle(250);

		expect(
			foldedRanges(view.state).size,
			'hiding and re-showing the fold gutter discarded the existing fold'
		).toBe(1);
	});
});

describe('autocomplete', () => {
	it('turns on and off for real', async () => {
		// `startCompletion` returns false iff the `completionState` field is
		// absent — an exact presence probe, rather than guessing at popup DOM.
		const { store, view } = await mountEditor();
		expect(startCompletion(view), 'precondition: autocomplete starts on').toBe(true);

		store.dispatch({ type: 'toggleAutocomplete' });
		flushSync();
		await settle(300);
		expect(
			startCompletion(view),
			'autocomplete was disabled in the store but the extension is still installed'
		).toBe(false);

		store.dispatch({ type: 'toggleAutocomplete' });
		flushSync();
		await settle(300);
		expect(startCompletion(view)).toBe(true);
	});
});

describe('tab size', () => {
	it('sets the indent unit, not just the tab display width', async () => {
		// `EditorState.tabSize` alone only sets how wide a literal tab RENDERS.
		// What auto-indent and Enter actually consult is `indentUnit`, which
		// defaults to two spaces — so `tabSize: 4` visibly did nothing on a
		// space-indented document, which is most of them.
		const { store, view } = await mountEditor({ tabSize: 4 });
		expect(view.state.tabSize).toBe(4);
		expect(getIndentUnit(view.state), 'indentUnit did not follow tabSize').toBe(4);
		expect(indentString(view.state, 4)).toBe('    ');

		store.dispatch({ type: 'tabSizeChanged', size: 8 });
		flushSync();
		await settle(250);

		expect(view.state.tabSize).toBe(8);
		expect(getIndentUnit(view.state)).toBe(8);
		expect(indentString(view.state, 8)).toBe('        ');
	});
});
