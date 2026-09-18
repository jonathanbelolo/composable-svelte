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
