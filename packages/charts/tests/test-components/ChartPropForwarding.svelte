<script lang="ts">
	import Chart from '../../src/lib/components/Chart.svelte';
	import type { Store } from '@composable-svelte/core';
	import type { ChartState, ChartAction } from '../../src/lib/types/chart.types.js';

	/**
	 * A consumer forwarding its own `$props()` straight through to `<Chart>`.
	 *
	 * Nothing renders this — it exists to be **typechecked**. Under
	 * `exactOptionalPropertyTypes` an optional prop read from `$props()` is
	 * `T | undefined`, which cannot land on a bare `T?`, so every optional prop
	 * `<Chart>` declares has to say `| undefined` or it cannot be wrapped.
	 *
	 * **This file's own props are deliberately bare.** That is the mechanism:
	 * they simulate the naïve consumer whose `$props()` yields `T | undefined`.
	 * A sweep that "fixed" them here would neutralise the fixture and nothing
	 * would go red — which is why every `tests` directory is out of its scope.
	 */
	let {
		store,
		width,
		height,
		type,
		enableZoom,
		enableTooltip,
		x,
		y,
		xDomain,
		onSelectionChange
	}: {
		store: Store<ChartState<unknown>, ChartAction<unknown>>;
		width?: number;
		height?: number;
		type?: 'scatter' | 'line' | 'bar' | 'area' | 'histogram';
		enableZoom?: boolean;
		enableTooltip?: boolean;
		x?: string | ((d: unknown) => unknown);
		y?: string | ((d: unknown) => unknown);
		xDomain?: [number, number] | 'auto';
		onSelectionChange?: (selected: unknown[]) => void;
	} = $props();
</script>

<Chart
	{store}
	{width}
	{height}
	{type}
	{enableZoom}
	{enableTooltip}
	{x}
	{y}
	{xDomain}
	{onSelectionChange}
/>
