/**
 * CodeHighlight must never render unhighlighted source as HTML.
 *
 * The component used to render `{@html $store.highlightedCode || $store.code}`,
 * and `state.code` is never escaped anywhere in the pipeline. That fallback is
 * reachable three ways — before the async highlight resolves, on every
 * `codeChanged`, and permanently after `highlightFailed` — so any consumer
 * displaying untrusted source (an LLM's code block, a pasted snippet, a gist)
 * executed it.
 *
 * `highlightedCode` stays trusted: it is `deps.highlightCode()` output, which is
 * the documented "already-highlighted HTML" contract. The last test pins that,
 * so a future over-correction that escapes it too would fail here.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import {
	codeHighlightReducer,
	createInitialState,
	type CodeHighlightDependencies
} from '../src/lib/code-highlight/index';
import CodeHighlight from '../src/lib/code-highlight/CodeHighlight.svelte';

const PAYLOAD = '<img src=x onerror="window.__xss__ = true">';

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

let cleanup: Array<() => void> = [];

afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
	delete (window as any).__xss__;
});

function mountWith(code: string, deps: CodeHighlightDependencies) {
	const store = createStore({
		initialState: createInitialState({ code }),
		reducer: codeHighlightReducer,
		dependencies: deps
	});

	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(CodeHighlight, { target, props: { store } });
	cleanup.push(() => {
		unmount(instance);
		target.remove();
	});
	return { target, store };
}

describe('CodeHighlight escapes unhighlighted source', () => {
	it('does not execute markup while highlighting is pending', async () => {
		// Highlighting never resolves, so the fallback is what renders.
		const { target } = mountWith(PAYLOAD, {
			highlightCode: () => new Promise<string>(() => {})
		});

		await settle();

		expect(target.querySelector('img')).toBeNull();
		expect((window as any).__xss__).toBeUndefined();
		expect(target.textContent).toContain('onerror');
	});

	it('does not execute markup after highlighting fails', async () => {
		const { target } = mountWith(PAYLOAD, {
			highlightCode: async () => {
				throw new Error('no highlighter available');
			}
		});

		await settle();

		expect(target.querySelector('img')).toBeNull();
		expect((window as any).__xss__).toBeUndefined();
		expect(target.textContent).toContain('onerror');
	});

	it('does not execute markup after codeChanged resets the highlight', async () => {
		const { target, store } = mountWith('const safe = 1;', {
			highlightCode: async (code: string) => `<span>${code}</span>`
		});

		await settle();
		store.dispatch({ type: 'codeChanged', code: PAYLOAD });
		flushSync();

		expect(target.querySelector('img')).toBeNull();
		expect((window as any).__xss__).toBeUndefined();
	});

	it('still renders trusted highlighted HTML as markup', async () => {
		const { target, store } = mountWith('const x = 1;', {
			highlightCode: async () => '<span class="token">const</span> x = 1;'
		});

		await settle();
		store.dispatch({ type: 'highlighted', html: '<span class="token">const</span> x = 1;' });
		flushSync();

		// Proves the fix did not over-correct into escaping everything.
		expect(target.querySelector('span.token')).not.toBeNull();
	});
});
