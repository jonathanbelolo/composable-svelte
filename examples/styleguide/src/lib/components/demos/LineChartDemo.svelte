<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { Chart, chartReducer, createInitialChartState } from '@composable-svelte/charts';
  import { Button } from '$lib/components/ui/button';
  import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-svelte';

  // Sample data - Stock prices over time
  const data = [
    { date: new Date('2024-01-01'), price: 100 },
    { date: new Date('2024-01-02'), price: 102 },
    { date: new Date('2024-01-03'), price: 98 },
    { date: new Date('2024-01-04'), price: 105 },
    { date: new Date('2024-01-05'), price: 107 },
    { date: new Date('2024-01-08'), price: 103 },
    { date: new Date('2024-01-09'), price: 110 },
    { date: new Date('2024-01-10'), price: 112 },
    { date: new Date('2024-01-11'), price: 108 },
    { date: new Date('2024-01-12'), price: 115 },
    { date: new Date('2024-01-15'), price: 118 },
    { date: new Date('2024-01-16'), price: 120 },
    { date: new Date('2024-01-17'), price: 122 },
    { date: new Date('2024-01-18'), price: 119 },
    { date: new Date('2024-01-19'), price: 125 },
    { date: new Date('2024-01-22'), price: 127 },
    { date: new Date('2024-01-23'), price: 130 },
    { date: new Date('2024-01-24'), price: 128 },
    { date: new Date('2024-01-25'), price: 135 },
    { date: new Date('2024-01-26'), price: 132 },
  ];

  const store = createStore({
    initialState: createInitialChartState({
      data,
      dimensions: { width: 700, height: 400 }
    }),
    reducer: chartReducer,
    dependencies: {}
  });

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
</script>

<div class="space-y-6">
  <div class="space-y-2">
    <h3 class="text-lg font-semibold">Line Chart with Zoom</h3>
    <p class="text-sm text-muted-foreground">
      Time series visualization with zoom/pan and tooltips. Perfect for exploring stock prices and trends.
    </p>
  </div>

  <div class="border rounded-lg p-6 bg-card space-y-4">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
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
      <div class="text-sm text-muted-foreground">
        Zoom: {($store.transform.k * 100).toFixed(0)}%
      </div>
    </div>

    <Chart
      {store}
      width={700}
      height={400}
      type="line"
      x="date"
      y="price"
      color="#3b82f6"
      enableTooltip={true}
      enableZoom={true}
    />
  </div>

  <div class="space-y-2">
    <h4 class="text-sm font-semibold">Features:</h4>
    <ul class="text-sm text-muted-foreground space-y-1 list-disc list-inside">
      <li>Smooth line rendering</li>
      <li>Automatic date formatting</li>
      <li>Interactive tooltips with date and value</li>
      <li>Zoom with mouse wheel or drag to pan</li>
      <li>Zoom controls (+/- buttons and reset)</li>
      <li>Responsive to container size</li>
      <li>State-driven updates</li>
    </ul>
  </div>
</div>
