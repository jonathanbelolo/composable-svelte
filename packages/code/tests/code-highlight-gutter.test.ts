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
	it('aligns each number with its code line', async () => {
		// Geometry, not text. `--chl-line-height` is the mechanism that keeps the
		// gutter, the bands and the code on one baseline grid — and nothing
		// measured it, so corrupting it (1.5em -> 3em) left the suite green while
		// the numbers drifted 21px per line.
		//
		// Measured ink-box to ink-box via Range, because a line box and a glyph
		// box do not share a top edge.
		const { target } = mountWith({ code: 'a\nb\nc\nd\ne\nf', showLineNumbers: true });
		await settle(250);

		const numbers = [...target.querySelectorAll('.code-highlight__line-numbers > span')];
		const codeEl = target.querySelector('.code-highlight__code') as HTMLElement;
		expect(numbers.length).toBe(6);

		const lineTop = (index: number) => {
			const walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT);
			const node = walker.nextNode() as Text | null;
			expect(node, 'no text node in the code element').not.toBeNull();
			const range = document.createRange();
			// Each source line is one character plus a newline in this fixture.
			range.setStart(node!, index * 2);
			range.setEnd(node!, index * 2 + 1);
			return range.getBoundingClientRect().top;
		};

		const deltas = numbers.map((span, i) => {
			const r = document.createRange();
			r.selectNodeContents(span);
			return Math.round(r.getBoundingClientRect().top - lineTop(i));
		});

		expect(
			deltas.every((d) => Math.abs(d) <= 1),
			`line numbers drifted from their code lines: ${JSON.stringify(deltas)}`
		).toBe(true);
	});

	it('stays in place when the code scrolls horizontally', async () => {
		// `.code-highlight__pre` is `overflow-x: auto`, so an absolutely
		// positioned gutter scrolls away with the content: the numbers slide out
		// of view while the code keeps its 3.8em indent. Long lines are the
		// normal case for code. A `textContent` assertion cannot see this.
		const long = 'x'.repeat(400);
		const { target } = mountWith({ code: `${long}\n${long}\n${long}`, showLineNumbers: true });
		await settle(200);

		const pre = target.querySelector('.code-highlight__pre') as HTMLElement;
		const gutter = target.querySelector('.code-highlight__line-numbers') as HTMLElement;
		expect(pre.scrollWidth, 'precondition: content must overflow').toBeGreaterThan(
			pre.clientWidth
		);
		const before = gutter.getBoundingClientRect().left - pre.getBoundingClientRect().left;

		pre.scrollLeft = 200;
		await settle(120);

		const after = gutter.getBoundingClientRect().left - pre.getBoundingClientRect().left;
		expect(
			Math.abs(after - before),
			'the line numbers scrolled away with the code'
		).toBeLessThan(2);
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

	it('does not highlight twice for one external codeChanged', async () => {
		// `codeChanged` is the public way a consumer changes the code. The sync
		// effect compares against a guard seeded only at mount, so it saw the
		// store's new code as a change IT had not caused and dispatched a second
		// `codeChanged` — measured as calls=2, args=["replaced","replaced"].
		// For a network-backed highlighter that is a doubled request per edit.
		const highlightCode = vi.fn(async (code: string) => code);
		const { store } = mountWith({ code: 'original' }, { highlightCode });
		await settle(250);
		highlightCode.mockClear();

		store.dispatch({ type: 'codeChanged', code: 'replaced' });
		flushSync();
		await settle(350);

		expect(
			highlightCode.mock.calls.map((c) => c[0]),
			'the sync effect re-dispatched a change the store had already applied'
		).toEqual(['replaced']);
	});

	it('does not highlight twice on mount', async () => {
		// `init` and the new effect must not both fire.
		const highlightCode = vi.fn(async (code: string) => code);
		mountWith({ code: 'a' }, { highlightCode });
		await settle(250);

		expect(highlightCode, 'init and the sync effect both ran').toHaveBeenCalledTimes(1);
	});
});
