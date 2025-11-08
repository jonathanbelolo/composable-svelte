<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { Chart, chartReducer, createInitialChartState } from '@composable-svelte/charts';

  // Sample data - Iris dataset
  const data = [
    { sepalLength: 5.1, sepalWidth: 3.5, species: 'setosa' },
    { sepalLength: 4.9, sepalWidth: 3.0, species: 'setosa' },
    { sepalLength: 4.7, sepalWidth: 3.2, species: 'setosa' },
    { sepalLength: 4.6, sepalWidth: 3.1, species: 'setosa' },
    { sepalLength: 5.0, sepalWidth: 3.6, species: 'setosa' },
    { sepalLength: 5.4, sepalWidth: 3.9, species: 'setosa' },
    { sepalLength: 4.6, sepalWidth: 3.4, species: 'setosa' },
    { sepalLength: 5.0, sepalWidth: 3.4, species: 'setosa' },
    { sepalLength: 4.4, sepalWidth: 2.9, species: 'setosa' },
    { sepalLength: 4.9, sepalWidth: 3.1, species: 'setosa' },

    { sepalLength: 7.0, sepalWidth: 3.2, species: 'versicolor' },
    { sepalLength: 6.4, sepalWidth: 3.2, species: 'versicolor' },
    { sepalLength: 6.9, sepalWidth: 3.1, species: 'versicolor' },
    { sepalLength: 5.5, sepalWidth: 2.3, species: 'versicolor' },
    { sepalLength: 6.5, sepalWidth: 2.8, species: 'versicolor' },
    { sepalLength: 5.7, sepalWidth: 2.8, species: 'versicolor' },
    { sepalLength: 6.3, sepalWidth: 3.3, species: 'versicolor' },
    { sepalLength: 4.9, sepalWidth: 2.4, species: 'versicolor' },
    { sepalLength: 6.6, sepalWidth: 2.9, species: 'versicolor' },
    { sepalLength: 5.2, sepalWidth: 2.7, species: 'versicolor' },

    { sepalLength: 6.3, sepalWidth: 3.3, species: 'virginica' },
    { sepalLength: 5.8, sepalWidth: 2.7, species: 'virginica' },
    { sepalLength: 7.1, sepalWidth: 3.0, species: 'virginica' },
    { sepalLength: 6.3, sepalWidth: 2.9, species: 'virginica' },
    { sepalLength: 6.5, sepalWidth: 3.0, species: 'virginica' },
    { sepalLength: 7.6, sepalWidth: 3.0, species: 'virginica' },
    { sepalLength: 4.9, sepalWidth: 2.5, species: 'virginica' },
    { sepalLength: 7.3, sepalWidth: 2.9, species: 'virginica' },
    { sepalLength: 6.7, sepalWidth: 2.5, species: 'virginica' },
    { sepalLength: 7.2, sepalWidth: 3.6, species: 'virginica' },
  ];

  const store = createStore({
    initialState: createInitialChartState({
      data,
      dimensions: { width: 700, height: 500 }
    }),
    reducer: chartReducer,
    dependencies: {}
  });

  // Track selection
  let selectedPoints: any[] = $state([]);

  function handleSelectionChange(selected: any[]) {
    selectedPoints = selected;
  }
</script>

<div class="space-y-6">
  <div class="space-y-2">
    <h3 class="text-lg font-semibold">Scatter Chart</h3>
    <p class="text-sm text-muted-foreground">
      Interactive scatter plot with hover tooltips. Uses the Iris dataset to visualize sepal dimensions.
    </p>
  </div>

  <div class="border rounded-lg p-6 bg-card">
    <Chart
      {store}
      width={700}
      height={500}
      type="scatter"
      x="sepalLength"
      y="sepalWidth"
      color="species"
      size={6}
      enableTooltip={true}
    />
  </div>

  <div class="space-y-2">
    <h4 class="text-sm font-semibold">Features:</h4>
    <ul class="text-sm text-muted-foreground space-y-1 list-disc list-inside">
      <li>Interactive tooltips on hover</li>
      <li>Color-coded by species</li>
      <li>Built with Observable Plot</li>
      <li>Fully type-safe with TypeScript</li>
      <li>Composable Architecture state management</li>
    </ul>
  </div>
</div>
