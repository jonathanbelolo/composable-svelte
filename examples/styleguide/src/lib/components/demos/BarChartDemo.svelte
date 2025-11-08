<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { Chart, chartReducer, createInitialChartState } from '@composable-svelte/charts';

  // Sample data - Sales by category
  const data = [
    { category: 'Electronics', sales: 45000 },
    { category: 'Clothing', sales: 32000 },
    { category: 'Food', sales: 28000 },
    { category: 'Books', sales: 15000 },
    { category: 'Toys', sales: 22000 },
    { category: 'Sports', sales: 18000 },
    { category: 'Home', sales: 35000 },
    { category: 'Garden', sales: 12000 },
  ];

  const store = createStore({
    initialState: createInitialChartState({
      data,
      dimensions: { width: 700, height: 400 }
    }),
    reducer: chartReducer,
    dependencies: {}
  });

  // Track selection
  let selectedBars: any[] = $state([]);

  function handleSelectionChange(selected: any[]) {
    selectedBars = selected;
  }
</script>

<div class="space-y-6">
  <div class="space-y-2">
    <h3 class="text-lg font-semibold">Bar Chart</h3>
    <p class="text-sm text-muted-foreground">
      Categorical data visualization with vertical bars and interactive tooltips.
    </p>
  </div>

  <div class="border rounded-lg p-6 bg-card">
    <Chart
      {store}
      width={700}
      height={400}
      type="bar"
      x="category"
      y="sales"
      color="#10b981"
      enableTooltip={true}
    />
  </div>

  <div class="space-y-2">
    <h4 class="text-sm font-semibold">Features:</h4>
    <ul class="text-sm text-muted-foreground space-y-1 list-disc list-inside">
      <li>Categorical data visualization</li>
      <li>Interactive tooltips on hover</li>
      <li>Automatic value formatting</li>
      <li>Rotated labels for readability</li>
      <li>Composable Architecture state management</li>
    </ul>
  </div>
</div>
