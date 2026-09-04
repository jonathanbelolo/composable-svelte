<script lang="ts">
	/**
	 * The component examples from `.claude/skills/composable-svelte-charts/SKILL.md`,
	 * verbatim.
	 *
	 * `doc-typecheck` compiles the `<script>` body of a svelte fence and says so —
	 * markup expressions are out of its scope. This file is the markup half, and
	 * it is typechecked because `svelte-check` reads every `.svelte` under `tests`.
	 * `packages/core/tests/repo/skill-examples.test.ts` compares the two, so a
	 * fence that changes in the skill has to change here.
	 *
	 * Five fences are NOT compiled — they sit inside HTML comments below, each
	 * marked `NOT COMPILED`. They are not valid Svelte: four carry a literal
	 * `...` placeholder attribute on `<Chart>`, which Svelte 5 parses as a prop
	 * named `"..."` and svelte-check rejects, and one has bare `$state`/`$effect`
	 * code outside any `<script>`. They are pinned verbatim so the guard sees
	 * them; promote each to real markup once the skill is corrected.
	 */
	import { Chart } from '../../src/lib/index.js';
	import type { ChartAction, ChartState } from '../../src/lib/index.js';
	import type { Store } from '@composable-svelte/core';

	type ChartStore = Store<ChartState<unknown>, ChartAction<unknown>>;

	let {
		chartStore,
		masterStore,
		detailStore
	}: {
		chartStore: ChartStore;
		masterStore: ChartStore;
		detailStore: ChartStore;
	} = $props();

	let selectedCategory = $state<string | null>(null);

	function handleSelection(selected: Array<{ category?: string }>) {
		selectedCategory = selected[0]?.category ?? null;
	}
</script>

<!-- QUICK START -->
<Chart
  store={chartStore}
  type="scatter"
  x="x"
  y="y"
  color="category"
  width={800}
  height={400}
  enableZoom={true}
  enableTooltip={true}
/>

<!-- CHART COMPONENT / Usage -->
<Chart
  store={chartStore}
  type="scatter"
  x="date"
  y="value"
  color={(d) => d.category}
  size={4}
  xDomain="auto"
  yDomain={[0, 100]}
  enableZoom={true}
  enableTooltip={true}
  onSelectionChange={(selected) => console.log('Selected:', selected)}
/>

<!-- CHART TYPES / Scatter Plot -->
<Chart
  store={chartStore}
  type="scatter"
  x="temperature"
  y="sales"
  color="region"
  size={5}
  enableZoom={true}
/>

<!-- CHART TYPES / Line Chart -->
<Chart
  store={chartStore}
  type="line"
  x="date"
  y="price"
  color="ticker"
  enableZoom={true}
/>

<!-- CHART TYPES / Bar Chart -->
<Chart
  store={chartStore}
  type="bar"
  x="category"
  y="count"
  color="segment"
  enableTooltip={true}
/>

<!-- CHART TYPES / Area Chart -->
<Chart
  store={chartStore}
  type="area"
  x="date"
  y="value"
  color="category"
  enableZoom={true}
/>

<!-- CHART TYPES / Histogram -->
<Chart
  store={chartStore}
  type="histogram"
  x="value"
  enableTooltip={true}
/>

<!-- INTERACTIVE FEATURES / Brush Selection / Callback -->
<Chart
  store={chartStore}
  enableBrush={true}
  onSelectionChange={(selected) => {
    console.log('Selected:', selected);
    // Do something with selected data
  }}
/>

<!-- RESPONSIVE DESIGN / Auto-sizing -->
<Chart
  store={chartStore}
  type="scatter"
  x="x"
  y="y"
/>

<!-- RESPONSIVE DESIGN / Fixed Dimensions -->
<Chart
  store={chartStore}
  type="scatter"
  x="x"
  y="y"
  width={800}
  height={600}
/>

<!-- RESPONSIVE DESIGN / Container-based Sizing — NOT COMPILED: literal `...` attribute -->
<!--
<div class="chart-container">
  <Chart store={chartStore} ... />
</div>

<style>
  .chart-container {
    width: 100%;
    height: 500px;
  }
</style>
-->

<!-- RESPONSIVE DESIGN / Responsive Breakpoints — NOT COMPILED: script outside <script>, literal `...` attribute -->
<!--
let chartWidth = $state(800);

$effect(() => {
  const updateWidth = () => {
    chartWidth = window.innerWidth < 768 ? 400 : 800;
  };

  window.addEventListener('resize', updateWidth);
  updateWidth();

  return () => window.removeEventListener('resize', updateWidth);
});

<Chart store={chartStore} width={chartWidth} ... />
-->

<!-- COMPLETE EXAMPLES / Basic Scatter Plot -->
<Chart
  store={chartStore}
  type="scatter"
  x="x"
  y="y"
  color="category"
  size={6}
  width={800}
  height={400}
  enableZoom={true}
  enableTooltip={true}
/>

<!-- COMPLETE EXAMPLES / Time Series Line Chart -->
<Chart
  store={chartStore}
  type="line"
  x="date"
  y="value"
  color="series"
  width={1000}
  height={400}
  enableZoom={true}
  enableTooltip={true}
/>

<!-- COMPLETE EXAMPLES / Interactive Bar Chart -->
<div>
  <Chart
    store={chartStore}
    type="bar"
    x="category"
    y="revenue"
    enableBrush={true}
    enableTooltip={true}
    onSelectionChange={handleSelection}
  />

  {#if selectedCategory}
    <p>Selected: {selectedCategory}</p>
  {/if}
</div>

<!-- COMPLETE EXAMPLES / Real-time Data Visualization -->
<Chart
  store={chartStore}
  type="line"
  x="time"
  y="value"
  yDomain={[0, 100]}
  enableAnimations={true}
/>

<!-- COMMON PATTERNS / Multiple Charts with Shared Selection — NOT COMPILED: literal `...` attribute -->
<!--
<Chart store={chartStore1} ... onSelectionChange={syncSelection} />
<Chart store={chartStore2} ... onSelectionChange={syncSelection} />
-->

<!-- COMMON PATTERNS / Linked Zoom -->
<Chart store={masterStore} enableZoom={true} />
<Chart store={detailStore} /> <!-- Zooms with master -->

<!-- COMMON PATTERNS / Dynamic Filtering — NOT COMPILED: literal `...` attribute -->
<!--
<input type="range" bind:value={minValue} min="0" max="100" />
<input type="range" bind:value={maxValue} min="0" max="100" />
<Chart store={chartStore} ... />
-->

<!-- PERFORMANCE CONSIDERATIONS / Animation Performance — NOT COMPILED: literal `...` attribute -->
<!--
<Chart
  store={chartStore}
  enableAnimations={false}
  ...
/>
-->
