<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { Chart, chartReducer, createInitialChartState, DataTransforms } from '@composable-svelte/charts';
  import { Button } from '$lib/components/ui/button';
  import { Filter, SortAsc, Shuffle } from 'lucide-svelte';

  // Sample data - Sales data with multiple dimensions
  const fullData = [
    { month: 'Jan', sales: 120, category: 'A', region: 'North' },
    { month: 'Feb', sales: 95, category: 'B', region: 'South' },
    { month: 'Mar', sales: 150, category: 'A', region: 'North' },
    { month: 'Apr', sales: 110, category: 'C', region: 'East' },
    { month: 'May', sales: 180, category: 'A', region: 'North' },
    { month: 'Jun', sales: 90, category: 'B', region: 'South' },
    { month: 'Jul', sales: 200, category: 'A', region: 'North' },
    { month: 'Aug', sales: 85, category: 'C', region: 'East' },
    { month: 'Sep', sales: 170, category: 'A', region: 'North' },
    { month: 'Oct', sales: 125, category: 'B', region: 'South' },
    { month: 'Nov', sales: 160, category: 'A', region: 'North' },
    { month: 'Dec', sales: 190, category: 'C', region: 'East' }
  ];

  const store = createStore({
    initialState: createInitialChartState({
      data: fullData,
      dimensions: { width: 700, height: 350 }
    }),
    reducer: chartReducer,
    dependencies: {}
  });

  // Transform controls
  let filterCategory: string | null = $state(null);
  let sortOrder: 'asc' | 'desc' = $state('asc');
  let showTopN: number | null = $state(null);

  // Apply transforms
  function applyTransforms() {
    let transforms: any[] = [];

    // Filter by category
    if (filterCategory) {
      transforms.push(
        DataTransforms.filter((d: any) => d.category === filterCategory)
      );
    }

    // Sort by sales
    transforms.push(
      DataTransforms.sortBy('sales', sortOrder)
    );

    // Top N
    if (showTopN) {
      transforms.push(
        DataTransforms.topN(showTopN, 'sales')
      );
    }

    // Compose and apply
    const composedTransform = DataTransforms.compose(...transforms);
    const transformedData = composedTransform(fullData);

    store.dispatch({
      type: 'setData',
      data: transformedData
    });
  }

  // Filter handlers
  function handleFilterCategory(category: string | null) {
    filterCategory = category;
    applyTransforms();
  }

  function handleSortToggle() {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    applyTransforms();
  }

  function handleTopN(n: number | null) {
    showTopN = n;
    applyTransforms();
  }

  function handleReset() {
    filterCategory = null;
    showTopN = null;
    sortOrder = 'asc';
    store.dispatch({
      type: 'setData',
      data: fullData
    });
  }
</script>

<div class="space-y-6">
  <div class="space-y-2">
    <h3 class="text-lg font-semibold">Data Transforms Demo</h3>
    <p class="text-sm text-muted-foreground">
      Interactive demo showing filter, sort, and top-N transforms on chart data.
    </p>
  </div>

  <div class="border rounded-lg p-6 bg-card space-y-4">
    <!-- Controls -->
    <div class="flex flex-wrap items-center gap-4">
      <!-- Filter by category -->
      <div class="flex items-center gap-2">
        <Filter class="h-4 w-4" />
        <span class="text-sm font-medium">Filter:</span>
        <div class="flex gap-1">
          <Button
            variant={filterCategory === null ? 'default' : 'outline'}
            size="sm"
            onclick={() => handleFilterCategory(null)}
          >
            All
          </Button>
          <Button
            variant={filterCategory === 'A' ? 'default' : 'outline'}
            size="sm"
            onclick={() => handleFilterCategory('A')}
          >
            Category A
          </Button>
          <Button
            variant={filterCategory === 'B' ? 'default' : 'outline'}
            size="sm"
            onclick={() => handleFilterCategory('B')}
          >
            Category B
          </Button>
          <Button
            variant={filterCategory === 'C' ? 'default' : 'outline'}
            size="sm"
            onclick={() => handleFilterCategory('C')}
          >
            Category C
          </Button>
        </div>
      </div>

      <!-- Sort -->
      <div class="flex items-center gap-2">
        <SortAsc class="h-4 w-4" />
        <Button
          variant="outline"
          size="sm"
          onclick={handleSortToggle}
        >
          Sort: {sortOrder === 'asc' ? 'Low to High' : 'High to Low'}
        </Button>
      </div>

      <!-- Top N -->
      <div class="flex items-center gap-2">
        <Shuffle class="h-4 w-4" />
        <span class="text-sm font-medium">Show:</span>
        <div class="flex gap-1">
          <Button
            variant={showTopN === null ? 'default' : 'outline'}
            size="sm"
            onclick={() => handleTopN(null)}
          >
            All
          </Button>
          <Button
            variant={showTopN === 5 ? 'default' : 'outline'}
            size="sm"
            onclick={() => handleTopN(5)}
          >
            Top 5
          </Button>
          <Button
            variant={showTopN === 3 ? 'default' : 'outline'}
            size="sm"
            onclick={() => handleTopN(3)}
          >
            Top 3
          </Button>
        </div>
      </div>

      <!-- Reset -->
      <Button
        variant="outline"
        size="sm"
        onclick={handleReset}
      >
        Reset
      </Button>
    </div>

    <!-- Stats -->
    <div class="flex items-center gap-4 text-sm text-muted-foreground">
      <span>Showing {$store.data.length} of {fullData.length} records</span>
      {#if filterCategory}
        <span class="text-blue-600">" Filtered by Category {filterCategory}</span>
      {/if}
      {#if showTopN}
        <span class="text-green-600">" Top {showTopN} items</span>
      {/if}
      <span class="text-purple-600">" Sorted {sortOrder === 'asc' ? 'ascending' : 'descending'}</span>
    </div>

    <!-- Chart -->
    <Chart
      {store}
      width={700}
      height={350}
      type="bar"
      x="month"
      y="sales"
      color="category"
      enableTooltip={true}
    />
  </div>

  <div class="space-y-2">
    <h4 class="text-sm font-semibold">Available Transforms:</h4>
    <ul class="text-sm text-muted-foreground space-y-1 list-disc list-inside">
      <li><strong>filter():</strong> Filter data by predicate function</li>
      <li><strong>sortBy():</strong> Sort data by field (ascending or descending)</li>
      <li><strong>topN():</strong> Get top N items by field value</li>
      <li><strong>groupBy():</strong> Group data by key</li>
      <li><strong>aggregate():</strong> Compute sum, mean, median, count, min, max</li>
      <li><strong>binData():</strong> Bin data into discrete intervals (for histograms)</li>
      <li><strong>rollup():</strong> Apply rolling window aggregation</li>
      <li><strong>unique():</strong> Remove duplicates by field</li>
      <li><strong>sample():</strong> Get random subset of data</li>
      <li><strong>compose():</strong> Compose multiple transforms into a pipeline</li>
    </ul>
  </div>
</div>
