/**
 * The brush must be installed on a `<g>`, not on the `<svg>` root.
 *
 * `@types/d3-brush` types `BrushBehavior` as callable only on
 * `Selection<SVGGElement, …>`, because d3-brush is designed to live in a group.
 * The old code called it on the SVG root, which was a real svelte-check error
 * and had no cast-free fix at the call site.
 *
 * What this pins is the *installation*, not the interaction: charts runs under
 * jsdom, which has no layout and no pointer events, so a real drag cannot be
 * simulated here. Whether dragging still behaves identically in a browser is
 * unverified — it needs browser mode, which this package does not have. Do not
 * read this test as proving more than the structure.
 *
 * It also needs the shim below, because jsdom does not implement
 * `SVGAnimatedLength`. Verified that this is a jsdom gap and not a consequence
 * of the change: the old `select(svg).call(brush)` fails in exactly the same
 * place. d3-brush has therefore never been exercisable in this package's test
 * environment, which is part of why the error sat unseen.
 *
 * This is the first test in the package that mounts a component. `charts` had
 * 34 tests and rendered nothing, which is why three component-level errors sat
 * unseen until svelte-check was run on it.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount } from 'svelte';
import { select } from 'd3-selection';
import { createStore } from '@composable-svelte/core';
import { chartReducer, createInitialChartState } from '../src/lib/reducers/chart.reducer';
import { buildScatterPlot } from '../src/lib/utils/plot-builder';
import ChartPrimitive from '../src/lib/components/ChartPrimitive.svelte';

const sampleData = [
	{ x: 1, y: 2 },
	{ x: 2, y: 4 },
	{ x: 3, y: 6 }
];

const settle = () => new Promise((resolve) => setTimeout(resolve, 250));

/**
 * Give jsdom the two SVG geometry properties d3-brush's `defaultExtent` reads
 * (`brush.js:112-119`): `viewBox.baseVal` when a viewBox attribute is present,
 * `width.baseVal.value`/`height.baseVal.value` otherwise. jsdom implements
 * neither, so without this every brush install throws
 * `Cannot read properties of undefined (reading 'baseVal')` — on the `<svg>`
 * root just as much as on a `<g>`.
 */
function shimSvgGeometry() {
	const proto = (globalThis as any).SVGSVGElement?.prototype;
	if (!proto || 'width' in proto) return;

	const lengthFrom = (el: Element, attr: string, fallback: number) => ({
		baseVal: { value: Number(el.getAttribute(attr)) || fallback }
	});

	Object.defineProperty(proto, 'width', {
		configurable: true,
		get(this: Element) {
			return lengthFrom(this, 'width', 640);
		}
	});
	Object.defineProperty(proto, 'height', {
		configurable: true,
		get(this: Element) {
			return lengthFrom(this, 'height', 400);
		}
	});
	Object.defineProperty(proto, 'viewBox', {
		configurable: true,
		get(this: Element) {
			const [x = 0, y = 0, width = 640, height = 400] = (
				this.getAttribute('viewBox') ?? ''
			)
				.split(/[\s,]+/)
				.filter(Boolean)
				.map(Number);
			return { baseVal: { x, y, width, height } };
		}
	});
}

shimSvgGeometry();

let cleanup: Array<() => void> = [];

afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mountPrimitive(enableBrush: boolean) {
	const store = createStore({
		initialState: createInitialChartState({ data: sampleData }),
		reducer: chartReducer,
		dependencies: {}
	});

	const target = document.createElement('div');
	document.body.appendChild(target);

	const component = mount(ChartPrimitive, {
		target,
		props: {
			store,
			config: { type: 'scatter' as const, x: 'x', y: 'y', enableBrush },
			plotBuilder: buildScatterPlot,
			enableBrush
		}
	});

	cleanup.push(() => {
		unmount(component);
		target.remove();
	});

	return { target, store };
}

describe('brush installation', () => {
	it('renders a plot at all', async () => {
		const { target } = mountPrimitive(false);
		await settle();
		expect(target.querySelector('svg')).not.toBeNull();
	});

	it('installs the brush inside a <g>, not on the <svg> root', async () => {
		const { target } = mountPrimitive(true);
		await settle();

		const group = target.querySelector('g.cs-brush');
		expect(group, 'no g.cs-brush — the brush was not installed into a group').not.toBeNull();

		// d3-brush stamps its state onto the node it was called on. If the
		// behaviour had been installed on the <svg> instead, this would sit on the
		// svg and the group would be empty.
		expect(select(group as Element).property('__brush')).toBeDefined();
		expect(group!.querySelector('rect.overlay')).not.toBeNull();
	});

	it('installs no brush when brushing is disabled', async () => {
		const { target } = mountPrimitive(false);
		await settle();
		expect(target.querySelector('g.cs-brush')).toBeNull();
	});
});
