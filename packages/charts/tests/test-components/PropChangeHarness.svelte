<script lang="ts">
	import { createStore } from '@composable-svelte/core';
	import { chartReducer, createInitialChartState } from '../../src/lib/reducers/chart.reducer';
	import { buildScatterPlot } from '../../src/lib/utils/plot-builder';
	import ChartPrimitive from '../../src/lib/components/ChartPrimitive.svelte';

	/**
	 * Exists so a test can change a `ChartPrimitive` prop AFTER mount. `charts`
	 * has no `vitest-browser-svelte`, so there is no `rerender`, and `$state` is
	 * unavailable inside a `.ts` test file — a wrapper driven by a DOM click is
	 * how a prop change is expressed here.
	 */
	let yField = $state('y');

	const rows = [
		{ x: 1, y: 10, other: 90 },
		{ x: 2, y: 20, other: 60 },
		{ x: 3, y: 30, other: 30 }
	];

	const store = createStore({
		initialState: createInitialChartState({ data: rows }),
		reducer: chartReducer,
		dependencies: {}
	});
</script>

<button type="button" data-testid="swap-y" onclick={() => (yField = 'other')}>swap</button>

<ChartPrimitive
	{store}
	config={{ type: 'scatter', x: 'x', y: yField }}
	plotBuilder={buildScatterPlot}
/>
