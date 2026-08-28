/**
 * WCAG 2.1 Level AA, criterion by criterion, for what this component does.
 *
 * The README said no audit had been run, which was true. This is the review: the
 * success criteria that a data-visualisation component can actually fail, each
 * checked against the rendered thing rather than against an intention.
 *
 * It is a self-review and the README says so. What it is not is a guess — every
 * criterion below either has an executable arm here, an arm in a sibling file
 * named in its comment, or a written reason it does not apply. The criteria with
 * no arm are the ones where conformance belongs to the consuming application
 * (page-level structure, text contrast inherited through `currentColor`), and
 * those are named rather than silently omitted.
 *
 * Criteria reviewed and covered elsewhere:
 *   1.4.11 Non-text Contrast ............ tests/contrast.test.ts
 *   2.4.7  Focus Visible ................ tests/keyboard.test.ts + the
 *                                         :focus-visible rule in Chart.svelte
 *   4.1.3  Status Messages .............. tests/keyboard.test.ts (live region)
 *   1.1.1  Non-text Content ............. tests/accessibility-markup.test.ts
 *   1.3.1  Info and Relationships ....... tests/data-table.test.ts
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { chartReducer, createInitialChartState } from '../src/lib/reducers/chart.reducer';
import Chart from '../src/lib/components/Chart.svelte';
import { installResizeObserverStub } from './helpers/jsdom-shims';

installResizeObserverStub();

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

const rows = [
	{ x: 1, y: 10 },
	{ x: 2, y: 20 },
	{ x: 3, y: 30 }
];

function mountChart() {
	const store = createStore({
		initialState: createInitialChartState({ data: rows }),
		reducer: chartReducer,
		dependencies: {}
	});
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(Chart, {
		target,
		props: { store, type: 'scatter' as const, x: 'x', y: 'y' }
	});
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	const surface = target.querySelector('.chart-surface') as HTMLElement;

	/** Dispatch a key and report whether the component consumed it. */
	const press = (key: string, init: KeyboardEventInit = {}) => {
		const event = new KeyboardEvent('keydown', {
			key,
			bubbles: true,
			cancelable: true,
			...init
		});
		surface.dispatchEvent(event);
		flushSync();
		return event.defaultPrevented;
	};

	return { store, target, surface, press };
}

describe('SC 2.1.2 — No Keyboard Trap', () => {
	it('lets Tab out of the chart', async () => {
		// The criterion a focusable custom widget fails most easily, and the one
		// that turns an accessibility improvement into a page-breaking bug: focus
		// goes in and never comes out. The component must not consume Tab.
		const { press } = mountChart();
		await settle();

		expect(press('Tab')).toBe(false);
		expect(press('Tab', { shiftKey: true })).toBe(false);
	});

	it('leaves keys it does not handle alone', async () => {
		// Same property, generalised. A handler that called preventDefault
		// unconditionally would pass the Tab arm only by accident of ordering.
		const { press } = mountChart();
		await settle();

		for (const key of ['a', 'F6', 'PageDown', 'Control']) {
			expect(press(key), `${key} should pass through`).toBe(false);
		}
	});
});

describe('SC 2.1.1 — Keyboard, and the page not moving underneath it', () => {
	it('consumes the keys it acts on, so the page does not scroll', async () => {
		// Arrows, Space, Home and End all scroll a page by default. Acting on one
		// *and* scrolling would move the chart out from under the user on every
		// keystroke.
		const { press } = mountChart();
		await settle();

		for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End', ' ']) {
			expect(press(key), `${key} should be consumed`).toBe(true);
		}
	});
});

describe('SC 2.1.4 — Character Key Shortcuts', () => {
	it('scopes its single-character shortcuts to the focused component', async () => {
		// `+`, `-` and `0` are single-character shortcuts. The criterion requires
		// they can be turned off, remapped, or be **active only while the
		// component has focus**. This takes the third exemption: the handler is
		// bound to the chart, not to the document, so a `0` typed into a search
		// box elsewhere on the page cannot reach it.
		const { store, press, target } = mountChart();
		await settle();

		expect(press('0')).toBe(true);
		expect(store.state.isAnimating).toBe(true);

		// The same key, dispatched at the document with the chart not focused.
		const before = store.state;
		document.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
		flushSync();
		expect(store.state).toBe(before);

		// And dispatched at a sibling element, to rule out the listener sitting
		// somewhere that catches the whole subtree's bubbling.
		const outside = document.createElement('input');
		document.body.appendChild(outside);
		outside.dispatchEvent(new KeyboardEvent('keydown', { key: '0', bubbles: true }));
		flushSync();
		expect(store.state).toBe(before);
		outside.remove();
		expect(target).toBeTruthy();
	});
});

describe('SC 1.4.1 — Use of Color', () => {
	it('does not rely on colour alone to say what is selected', async () => {
		// Selection is carried by an outline and a filled overlay mark, by the
		// aria-label's count, and by the live region's "Selected." — three
		// non-colour channels. A user who cannot distinguish the palette still
		// gets the answer.
		const { store, surface } = mountChart();
		await settle();

		store.dispatch({ type: 'focusPoint', index: 1 });
		store.dispatch({ type: 'selectFocused' });
		flushSync();
		await settle();

		expect(surface.getAttribute('aria-label')).toContain('1 selected');
		expect(surface.querySelector('[role="status"]')!.textContent).toContain('Selected');
		// Shape, not hue: an unfilled ring around the focused point.
		expect(surface.querySelector('g[fill="none"] circle')).not.toBeNull();
	});

	it('does not rely on colour alone to say where the cursor is', async () => {
		const { store, surface } = mountChart();
		await settle();

		store.dispatch({ type: 'focusNext' });
		flushSync();
		await settle();

		expect(surface.querySelector('[role="status"]')!.textContent).toContain('Point 1 of 3');
	});
});

describe('SC 3.2.1 — On Focus', () => {
	it('changes nothing when the chart receives focus', async () => {
		// Focusing a control must not initiate a change of context. Reading the
		// whole state by identity is the strongest form of that assertion here.
		const { store, surface } = mountChart();
		await settle();

		const before = store.state;
		surface.focus();
		flushSync();
		await settle();

		expect(store.state).toBe(before);
		expect(store.state.focusedIndex).toBeNull();
	});
});

describe('SC 4.1.2 — Name, Role, Value', () => {
	it('exposes a name, a role and the current value', async () => {
		const { store, surface } = mountChart();
		await settle();

		expect(surface.getAttribute('role')).toBe('application');
		expect(surface.getAttribute('aria-roledescription')).toBe('interactive chart');
		expect(surface.getAttribute('aria-label')).toBeTruthy();

		// "Value" for a chart is which rows are selected, and it updates.
		store.dispatch({ type: 'focusPoint', index: 0 });
		store.dispatch({ type: 'selectFocused' });
		flushSync();
		await settle();
		expect(surface.getAttribute('aria-label')).toContain('selected');
	});
});
