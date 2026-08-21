/**
 * CodeHighlight's line numbers, highlighted lines and copy failure.
 *
 * `showLineNumbers` defaults to **true**, so this is the default experience:
 * the CSS reserved `padding-left: 3.8em` and declared `counter-reset`, but the
 * file contains no `counter-increment` and no `::before` anywhere. The toggle
 * produced a blank left margin. The styleguide's CodeHighlightDemo sets it
 * explicitly on several stores, so it is visible today.
 *
 * `startLine` was doubly dead: the inline style reset a counter named
 * `line-number` while the stylesheet used `linenumber` — a mismatch that could
 * not have survived anyone looking at the rendered output.
 *
 * Numbers are rendered as real spans rather than CSS counters, deliberately:
 * a `::before { content: counter(...) }` is invisible to `textContent`, so no
 * test could assert what the user actually sees. The only interpolated value is
 * an integer derived from `code.split('\n').length`, so nothing here widens the
 * XSS surface — which matters, because this component shipped an `{@html}`
 * escaping defect before (see `code-highlight-escaping.test.ts`).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import {
	codeHighlightReducer,
	createInitialState,
	type CodeHighlightDependencies,
	type CodeHighlightState,
	type CodeHighlightAction
} from '../src/lib/code-highlight/index';
import CodeHighlight from '../src/lib/code-highlight/CodeHighlight.svelte';

const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

const passthrough: CodeHighlightDependencies = {
	highlightCode: async (code: string) => code
};

function mountWith(
	config: Partial<CodeHighlightState>,
	deps: CodeHighlightDependencies = passthrough
) {
	const store = createStore({
		initialState: createInitialState(config),
		reducer: codeHighlightReducer,
		dependencies: deps
	});
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(CodeHighlight, { target, props: { store } });
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	return { store, target };
}

const gutterNumbers = (target: HTMLElement) =>
	[...target.querySelectorAll('.code-highlight__line-numbers > span')].map((s) =>
		s.textContent?.trim()
	);

describe('line numbers', () => {
	it('renders one number per line', async () => {
		const { target } = mountWith({ code: 'a\nb\nc\nd', showLineNumbers: true });
		await settle(150);

		expect(
			gutterNumbers(target),
			'the gutter reserved space but rendered no numbers'
		).toEqual(['1', '2', '3', '4']);
	});

	it('does not count a trailing newline as an extra line', async () => {
		const { target } = mountWith({ code: 'a\nb\n', showLineNumbers: true });
		await settle(150);

		expect(gutterNumbers(target)).toEqual(['1', '2']);
	});

	it('honours startLine', async () => {
		const { target } = mountWith({ code: 'a\nb\nc\nd', showLineNumbers: true, startLine: 42 });
		await settle(150);

		expect(gutterNumbers(target)).toEqual(['42', '43', '44', '45']);
	});

	it('disappears when toggled off', async () => {
		const { store, target } = mountWith({ code: 'a\nb', showLineNumbers: true });
		await settle(150);
		expect(gutterNumbers(target)).toEqual(['1', '2']);

		store.dispatch({ type: 'toggleLineNumbers' });
		flushSync();
		await settle(150);

		expect(target.querySelector('.code-highlight__line-numbers')).toBeNull();
	});

	it('is not announced and not copyable', async () => {
		// Without both of these the numbers land in the accessibility tree and
		// the clipboard, which is worse than having no numbers at all.
		const { target } = mountWith({ code: 'a\nb', showLineNumbers: true });
		await settle(150);

		const gutter = target.querySelector('.code-highlight__line-numbers') as HTMLElement;
		expect(gutter).not.toBeNull();
		expect(gutter.getAttribute('aria-hidden')).toBe('true');
		expect(getComputedStyle(gutter).userSelect).toBe('none');
	});
});

describe('highlighted lines', () => {
	it('renders a band per requested line', async () => {
		const { store, target } = mountWith({ code: 'a\nb\nc\nd' });
		await settle(150);

		store.dispatch({ type: 'highlightLinesChanged', lines: [2, 3] });
		flushSync();
		await settle(150);

		const bands = target.querySelectorAll('.code-highlight__line-highlight');
		expect(bands.length, 'highlightLines was written and never read').toBe(2);
	});

	it('ignores lines outside the document', async () => {
		const { store, target } = mountWith({ code: 'a\nb' });
		await settle(150);

		store.dispatch({ type: 'highlightLinesChanged', lines: [1, 99] });
		flushSync();
		await settle(150);

		expect(target.querySelectorAll('.code-highlight__line-highlight').length).toBe(1);
	});
});

describe('copy failure', () => {
	it('is distinguishable from idle, and recovers', async () => {
		// `copyStatus: 'failed'` fell into the `else` of the button text, so a
		// denied clipboard read "Copy" — identical to never having tried — and
		// never reset, unlike a successful copy.
		const { target } = mountWith({ code: 'x' });
		await settle(150);

		const original = navigator.clipboard;
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: () => Promise.reject(new Error('Write permission denied')) }
		});
		cleanup.push(() => {
			Object.defineProperty(navigator, 'clipboard', { configurable: true, value: original });
		});

		const button = target.querySelector<HTMLButtonElement>(
			'[aria-label="Copy code to clipboard"]'
		)!;
		button.click();
		await settle(250);

		expect(button.textContent?.trim(), 'a denied clipboard looked like idle').toBe('Failed');
		expect(button.title).toContain('permission');

		await settle(2200);
		expect(button.textContent?.trim(), 'the failure never cleared').toBe('Copy');
	});
});

describe('code changed outside the component', () => {
	it('re-highlights when a parent replaces the code', async () => {
		// A parent reducer scoped over this state can replace `code` without
		// dispatching `codeChanged`; the component only dispatched `init` on
		// mount, so the highlighted HTML stayed stale forever.
		const highlightCode = vi.fn(async (code: string) => `<em>${code}</em>`);
		const store = createStore({
			initialState: createInitialState({ code: 'original' }),
			reducer: (state: CodeHighlightState, action: CodeHighlightAction | { type: 'externalCodeSet'; code: string }, deps: CodeHighlightDependencies) =>
				action.type === 'externalCodeSet'
					? [{ ...state, code: action.code }, { _tag: 'None' as const }]
					: codeHighlightReducer(state, action as CodeHighlightAction, deps),
			dependencies: { highlightCode }
		});
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(CodeHighlight, { target, props: { store } });
		flushSync();
		cleanup.push(() => {
			unmount(component);
			target.remove();
		});
		await settle(200);
		expect(target.textContent).toContain('original');

		store.dispatch({ type: 'externalCodeSet', code: 'replaced' } as never);
		flushSync();
		await settle(250);

		expect(target.textContent, 'the highlight went stale').toContain('replaced');
	});

	it('does not highlight twice on mount', async () => {
		// `init` and the new effect must not both fire.
		const highlightCode = vi.fn(async (code: string) => code);
		mountWith({ code: 'a' }, { highlightCode });
		await settle(250);

		expect(highlightCode, 'init and the sync effect both ran').toHaveBeenCalledTimes(1);
	});
});
