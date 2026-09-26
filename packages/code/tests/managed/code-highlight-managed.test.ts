/**
 * The SHIPPED `CodeHighlight` as a managed feature view, and highlight result
 * freshness on both store kinds.
 *
 * The component's action listener only keeps its dedupe guard current: a
 * `codeChanged` the store already reduced must not be re-dispatched by the
 * component's own "code changed from outside" effect. On a managed view that
 * listener is `observeChildActions`; without it every external `codeChanged`
 * would be highlighted twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { codeHighlightReducer } from '../../src/lib/code-highlight/code-highlight.reducer';
import { createInitialState, type CodeHighlightDependencies } from '../../src/lib/code-highlight/code-highlight.types';
import CodeHighlight from '../../src/lib/code-highlight/CodeHighlight.svelte';
import HighlightHost from './HighlightHost.svelte';
import { createHighlightRoot, highlightComposition, snippetsSlot } from './highlight-model';
import { mountInto, onTeardown, runTeardown, settle, waitFor } from './support';

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

const html = (code: string) => `<b>${code}</b>`;

async function setup(highlightCode: CodeHighlightDependencies['highlightCode']) {
	const store = createHighlightRoot({ highlightCode });
	onTeardown(() => store.destroy());
	const target = mountInto(HighlightHost, { store });
	await waitFor(() => target.querySelectorAll('.code-highlight__code b').length === 2, 'both highlights');
	return { store, target };
}

const rendered = (target: HTMLElement) =>
	[...target.querySelectorAll('.code-highlight__code')].map((code) => code.innerHTML.replace(/<!--.*?-->/g, ''));

describe('managed CodeHighlight', () => {
	it('an external codeChanged is highlighted once, not twice', async () => {
		const highlightCode = vi.fn(async (code: string) => html(code));
		const { store, target } = await setup(highlightCode);
		highlightCode.mockClear();
		store.dispatch({ type: 'snippets', id: 'a', action: { type: 'codeChanged', code: 'x = 1' } });
		flushSync();
		await waitFor(() => rendered(target)[0] === html('x = 1'), 'the new highlight');
		await settle();
		expect(highlightCode).toHaveBeenCalledTimes(1);
		expect(highlightCode).toHaveBeenCalledWith('x = 1', 'typescript');
		expect(warn).not.toHaveBeenCalled();
		expect(error).not.toHaveBeenCalled();
	});

	it('a parent writing code directly is re-highlighted, once', async () => {
		const highlightCode = vi.fn(async (code: string) => html(code));
		const { store, target } = await setup(highlightCode);
		highlightCode.mockClear();
		store.dispatch({ type: 'overwrite', id: 'b', code: 'y = 2' });
		flushSync();
		await waitFor(() => rendered(target)[1] === html('y = 2'), 'the parent write to be highlighted');
		await settle();
		expect(highlightCode).toHaveBeenCalledTimes(1);
		expect(rendered(target)[0]).toBe(html('const a = 1;'));
	});

	it('a slow earlier highlight cannot overwrite a newer one', async () => {
		const pending = new Map<string, (html: string) => void>();
		const highlightCode = vi.fn(
			(code: string) =>
				new Promise<string>((resolve) => {
					if (code.startsWith('const')) resolve(html(code));
					else pending.set(code, resolve);
				})
		);
		const { store, target } = await setup(highlightCode);
		const view = highlightComposition.bind(store, snippetsSlot.at('a'))!;
		view.dispatch({ type: 'codeChanged', code: 'first' });
		view.dispatch({ type: 'codeChanged', code: 'second' });
		pending.get('second')!(html('second'));
		await waitFor(() => rendered(target)[0] === html('second'), 'the newer highlight');
		pending.get('first')!(html('first'));
		await settle();
		expect(rendered(target)[0]).toBe(html('second'));
		expect(view.state?.highlightedCode).toBe(html('second'));
		expect(view.state?.isHighlighting).toBe(false);
	});

	it('removing a row while it highlights logs nothing and leaves the sibling alone', async () => {
		let release: ((html: string) => void) | undefined;
		const highlightCode = vi.fn((code: string) =>
			code === 'slow' ? new Promise<string>((resolve) => (release = resolve)) : Promise.resolve(html(code))
		);
		const { store, target } = await setup(highlightCode);
		store.dispatch({ type: 'snippets', id: 'a', action: { type: 'codeChanged', code: 'slow' } });
		store.dispatch({ type: 'remove', id: 'a' });
		flushSync();
		release?.(html('slow'));
		await settle();
		expect(target.querySelectorAll('.code-highlight')).toHaveLength(1);
		expect(rendered(target)[0]).toBe(html('const b = 2;'));
		expect(error).not.toHaveBeenCalled();
	});
});

describe('standalone CodeHighlight', () => {
	it('still dedupes through subscribeToActions', async () => {
		const highlightCode = vi.fn(async (code: string) => html(code));
		const store = createStore({
			initialState: createInitialState({ code: 'a' }),
			reducer: codeHighlightReducer,
			dependencies: { highlightCode }
		});
		onTeardown(() => store.destroy());
		const target = mountInto(CodeHighlight, { store });
		await waitFor(() => target.querySelector('.code-highlight__code b'), 'the first highlight');
		highlightCode.mockClear();
		store.dispatch({ type: 'codeChanged', code: 'b' });
		flushSync();
		await settle();
		expect(highlightCode).toHaveBeenCalledTimes(1);
		expect(warn).not.toHaveBeenCalled();
	});

	it('a store without subscribeToActions warns once and still renders', async () => {
		const highlightCode = vi.fn(async (code: string) => html(code));
		const inner = createStore({
			initialState: createInitialState({ code: 'a' }),
			reducer: codeHighlightReducer,
			dependencies: { highlightCode }
		});
		onTeardown(() => inner.destroy());
		const bare = {
			get state() {
				return inner.state;
			},
			dispatch: inner.dispatch,
			select: inner.select,
			subscribe: inner.subscribe,
			history: inner.history,
			destroy: inner.destroy
		};
		const target = mountInto(CodeHighlight, { store: bare });
		mountInto(CodeHighlight, { store: bare });
		await waitFor(() => target.querySelector('.code-highlight__code b'), 'the highlight');
		const messages = warn.mock.calls.map((call) => String(call[0])).filter((m) => m.startsWith('[CodeHighlight]'));
		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain('highlighted twice');
	});
});
