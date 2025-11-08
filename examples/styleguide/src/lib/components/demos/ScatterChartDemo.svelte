<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { Chart, chartReducer, createInitialChartState } from '@composable-svelte/charts';
  import { Button } from '$lib/components/ui/button';
  import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-svelte';

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

  // Interaction mode
  let interactionMode: 'zoom' | 'brush' = $state('zoom');

  // Zoom controls with animation
  function handleZoomIn() {
    const currentTransform = $store.transform;
    store.dispatch({
      type: 'zoomAnimated',
      targetTransform: {
        ...currentTransform,
        k: currentTransform.k * 1.2
      }
    });
  }

  function handleZoomOut() {
    const currentTransform = $store.transform;
    store.dispatch({
      type: 'zoomAnimated',
      targetTransform: {
        ...currentTransform,
        k: currentTransform.k / 1.2
      }
    });
  }

  function handleResetZoom() {
    store.dispatch({ type: 'resetZoom' });
  }

  // Selection controls
  function handleClearSelection() {
    store.dispatch({ type: 'clearSelection' });
  }

  function toggleMode() {
    interactionMode = interactionMode === 'zoom' ? 'brush' : 'zoom';
    // Clear selection when switching to zoom mode
    if (interactionMode === 'zoom') {
      handleClearSelection();
    }
  }
</script>

<div class="space-y-6">
  <div class="space-y-2">
    <h3 class="text-lg font-semibold">Scatter Chart - Interactive</h3>
    <p class="text-sm text-muted-foreground">
      Interactive scatter plot with zoom/pan and brush selection. Toggle between modes to explore the Iris dataset.
    </p>
  </div>

  <div class="border rounded-lg p-6 bg-card space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Button
          variant={interactionMode === 'zoom' ? 'default' : 'outline'}
          size="sm"
          onclick={toggleMode}
        >
          {interactionMode === 'zoom' ? 'Zoom Mode' : 'Brush Mode'}
        </Button>

        {#if interactionMode === 'zoom'}
          <div class="flex items-center gap-1 ml-2">
            <Button variant="outline" size="sm" onclick={handleZoomIn}>
              <ZoomIn class="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onclick={handleZoomOut}>
              <ZoomOut class="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onclick={handleResetZoom}>
              <RotateCcw class="h-4 w-4 mr-1" />
              Reset
            </Button>
          </div>
        {:else}
          <Button variant="outline" size="sm" onclick={handleClearSelection} class="ml-2">
            Clear Selection
          </Button>
        {/if}
      </div>

      <div class="text-sm text-muted-foreground">
        {#if interactionMode === 'zoom'}
          Zoom: {($store.transform.k * 100).toFixed(0)}%
        {:else}
          Selected: {$store.selection.selectedIndices.length} points
        {/if}
      </div>
    </div>

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
      enableZoom={interactionMode === 'zoom'}
      enableBrush={interactionMode === 'brush'}
    />
  </div>

  <div class="space-y-2">
    <h4 class="text-sm font-semibold">Features:</h4>
    <ul class="text-sm text-muted-foreground space-y-1 list-disc list-inside">
      <li>Interactive tooltips on hover</li>
      <li><strong>Zoom Mode:</strong> Mouse wheel to zoom, drag to pan, +/- buttons</li>
      <li><strong>Brush Mode:</strong> Click and drag to select multiple points</li>
      <li>Selected points are highlighted with black stroke</li>
      <li>Unselected points are dimmed for contrast</li>
      <li>Color-coded by species (setosa, versicolor, virginica)</li>
      <li>Built with Observable Plot & D3</li>
      <li>Composable Architecture state management</li>
    </ul>
  </div>
</div>
