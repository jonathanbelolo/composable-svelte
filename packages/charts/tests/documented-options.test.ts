/**
 * The options the docs tell you to pass must do something.
 *
 * `enableTooltip` was accepted by `Chart.svelte`, folded into `config`, passed
 * to every plot builder — and read by none of them. All five chart types
 * hardcoded `tip: true`. It is documented in the README's first code sample, in
 * `INTEGRATION.md`, and in the skill file's prop table, and four styleguide
 * demos pass it.
 *
 * `enableAnimations` was the same, and worse: the skill file recommends
 * `enableAnimations={false}` as the remedy for a slow chart, and it could not
 * affect anything. `transitionDuration` was declared twice — on the state and
 * on the config — seeded to `0.3`, documented with a usage example, and read
 * nowhere, while the only animator hardcoded 400ms.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { chartReducer, createInitialChartState } from '../src/lib/reducers/chart.reducer';
import { animateZoomTransition } from '../src/lib/utils/animate-zoom';
import ChartPrimitive from '../src/lib/components/ChartPrimitive.svelte';
import {
	buildScatterPlot,
	buildLineChart,
	buildBarChart,
	buildAreaChart,
	buildHistogram
} from '../src/lib/utils/plot-builder';
import type { ChartConfig } from '../src/lib/types/chart.types';

const rows = [
	{ x: 1, y: 10, cat: 'a' },
	{ x: 2, y: 20, cat: 'b' },
	{ x: 3, y: 30, cat: 'c' }
];

const state = () => createInitialChartState({ data: rows });
const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

/**
 * The builders return a *rendered* element, not a spec, so a tooltip is
 * observed in the DOM. Observable Plot emits `aria-label="tip"` for a tip mark.
 */
function anyTip(plot: Element): boolean {
	return plot.querySelector('[aria-label="tip"]') !== null;
}

const builders: Array<[string, (s: any, c: ChartConfig) => any]> = [
	['scatter', buildScatterPlot],
	['line', buildLineChart],
	['bar', buildBarChart],
	['area', buildAreaChart],
	['histogram', buildHistogram]
];

describe('enableTooltip', () => {
	it.each(builders)('%s: tooltips on by default', (_name, build) => {
		expect(anyTip(build(state(), { x: 'x', y: 'y' }))).toBe(true);
	});

	it.each(builders)('%s: enableTooltip={false} turns them off', (_name, build) => {
		expect(
			anyTip(build(state(), { x: 'x', y: 'y', enableTooltip: false })),
			'enableTooltip={false} could not turn tooltips off'
		).toBe(false);
	});
});

describe('enableAnimations and transitionDuration', () => {
	it('animateZoomTransition honours the duration it is given', async () => {
		// It hardcoded `const duration = 400`, so `transitionDuration` — declared
		// on both the state and the config, seeded, and documented with a usage
		// example — was read by nothing.
		//
		// Frame counts rather than wall-clock: jsdom's `requestAnimationFrame`
		// overhead swamps a 60ms animation (measured at 304ms elapsed), so the
		// elapsed time says more about the environment than about the duration.
		// The number of frames a run needs does not.
		const runFrames = async (duration: number) => {
			const frames: number[] = [];
			await animateZoomTransition(
				{ k: 1, x: 0, y: 0 },
				{ k: 2, x: 0, y: 0 },
				() => {},
				(t) => frames.push(t.k),
				duration
			);
			expect(frames.length, 'no frames ran').toBeGreaterThan(0);
			expect(frames[frames.length - 1], 'did not reach the target').toBeCloseTo(2, 5);
			return frames.length;
		};

		const short = await runFrames(50);
		const long = await runFrames(800);

		expect(
			long,
			`a 800ms animation ran ${long} frames and a 50ms one ${short} — the duration is ignored`
		).toBeGreaterThan(short);
	});

	it('enableAnimations={false} jumps straight to the target', async () => {
		const store = createStore({
			initialState: createInitialChartState({ data: rows }),
			reducer: chartReducer,
			dependencies: {}
		});
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(ChartPrimitive, {
			target,
			props: {
				store,
				config: { type: 'scatter' as const, x: 'x', y: 'y', enableAnimations: false },
				plotBuilder: buildScatterPlot
			}
		});

		try {
			await settle();
			store.dispatch({ type: 'zoomAnimated', targetTransform: { k: 3, x: 10, y: 20 } });
			await settle();

			// Not "does not animate" — "arrives". Skipping the animation must not
			// mean skipping the outcome: the reducer only sets a target, and the
			// component is what applies it.
			expect(store.state.transform).toEqual({ k: 3, x: 10, y: 20 });
			expect(store.state.isAnimating, 'left mid-animation forever').toBe(false);
		} finally {
			unmount(component);
			target.remove();
		}
	});
});

