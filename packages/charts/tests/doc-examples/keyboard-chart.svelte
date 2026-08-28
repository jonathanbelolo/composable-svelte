<!--
	Mirrors: packages/charts/README.md

	The chart quickstart, and the first code a consumer of this package pastes.

	It is a file rather than a fenced block because a ```svelte fence is
	invisible to the TypeScript arm of the doc guard, and the Svelte arm checks
	syntax only, in two documents that do not include this one — so a quickstart
	naming an export that does not exist would be green from every angle. That
	is exactly how `code`'s and `media`'s quickstarts stayed broken.

	As a file it is typechecked by `svelte-check` under `pnpm -r check`, and the
	arm in `doc-examples.test.ts` asserts the README still quotes it verbatim.
	The file is authoritative: it is the thing that has to compile.

	It also carries the accessibility claim. Nothing here switches keyboard
	navigation on, because there is no switch — that is the point the README
	makes above this block, and if a prop were ever required to reach it, this
	example would have to change and the drift would be visible.
-->
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { Chart, chartReducer, createInitialChartState } from '@composable-svelte/charts';

  type Reading = { month: string; rainfall: number };

  const data: Reading[] = [
    { month: 'Jan', rainfall: 82 },
    { month: 'Feb', rainfall: 64 },
    { month: 'Mar', rainfall: 71 },
    { month: 'Apr', rainfall: 45 }
  ];

  const store = createStore({
    initialState: createInitialChartState({ data }),
    reducer: chartReducer,
    dependencies: {}
  });

  // Fires when a point is selected — by a brush, or by pressing Enter on the
  // point the keyboard cursor is on.
  function handleSelectionChange(selected: Reading[]) {
    console.log('selected', selected);
  }
</script>

<Chart
  {store}
  type="bar"
  x="month"
  y="rainfall"
  height={320}
  onSelectionChange={handleSelectionChange}
/>
