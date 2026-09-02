---
name: composable-svelte-charts
description: Data visualization and chart components for Composable Svelte. Use when creating charts, graphs, or data visualizations. Covers chart types (scatter, line, bar, area, histogram), data binding, state-driven updates, interactive features (zoom, brush, tooltips), and responsive design from @composable-svelte/charts package built with Observable Plot and D3.
---

# Composable Svelte Charts

Interactive data visualization components built with Observable Plot and D3.

---

## PACKAGE OVERVIEW

**Package**: `@composable-svelte/charts`

**Purpose**: State-driven interactive charts and data visualizations.

**Technology Stack**:
- **Observable Plot**: Declarative visualization grammar from Observable
- **D3**: Low-level utilities for scales, shapes, and interactions
- **Motion One**: Smooth transitions and animations

**Chart Types**:
- Scatter plots
- Line charts
- Bar charts
- Area charts
- Histograms

**Interactive Features**:
- Zoom & pan
- Brush selection
- Tooltips (automatic)
- Range selection
- Responsive sizing

**State Management**:
All charts use pure reducers with type-safe actions following Composable Architecture patterns.

---

## QUICK START

```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { Chart, chartReducer, createInitialChartState } from '@composable-svelte/charts';

  // Sample data
  const data = [
    { x: 1, y: 10, category: 'A' },
    { x: 2, y: 25, category: 'B' },
    { x: 3, y: 15, category: 'A' },
    { x: 4, y: 30, category: 'B' }
  ];

  // Create chart store
  const chartStore = createStore({
    initialState: createInitialChartState({ data }),
    reducer: chartReducer,
    dependencies: {}
  });
</script>

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
```

---

## CHART COMPONENT

**Purpose**: High-level wrapper for creating charts with Observable Plot.

### Props

- `store: Store<ChartState, ChartAction>` - Chart store (required)
- `type: 'scatter' | 'line' | 'bar' | 'area' | 'histogram'` - Chart type (default: 'scatter')
- `width: number` - Chart width (optional, responsive if omitted)
- `height: number` - Chart height (optional, defaults to 400px)
- `x: string | ((d) => any)` - X accessor (optional; Observable Plot has its own
  defaults, and the summary and data table degrade to the row's own keys without it)
- `y: string | ((d) => any)` - Y accessor (optional, same)
- `color: string | ((d) => any)` - Color accessor (optional)
- `size: number` - Mark size (optional)
- `xDomain: [number, number] | 'auto'` - X domain (optional)
- `yDomain: [number, number] | 'auto'` - Y domain (optional)
- `enableZoom: boolean` - Enable zoom/pan (default: false)
- `enableBrush: boolean` - Enable brush selection (default: false)
- `enableTooltip: boolean` - Enable tooltips (default: true)
- `enableAnimations: boolean` - Enable transitions (default: true)
- `onSelectionChange: (selected: any[]) => void` - Selection callback (optional)

### Usage

```svelte
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
```

---

## CHART TYPES

### Scatter Plot

**Purpose**: Display individual data points in 2D space.

**Best for**: Correlations, distributions, outliers.

```svelte
<Chart
  store={chartStore}
  type="scatter"
  x="temperature"
  y="sales"
  color="region"
  size={5}
  enableZoom={true}
/>
```

**Accessories**:
- `x`: X-axis position
- `y`: Y-axis position
- `color`: Point color (optional)
- `size`: Point size (optional)

### Line Chart

**Purpose**: Show trends over time or continuous data.

**Best for**: Time series, trends, comparisons.

```svelte
<Chart
  store={chartStore}
  type="line"
  x="date"
  y="price"
  color="ticker"
  enableZoom={true}
/>
```

**Notes**:
- Data should be sorted by X for proper rendering
- Multiple series via `color` accessor
- Supports missing data (gaps in line)

### Bar Chart

**Purpose**: Compare categorical data with rectangular bars.

**Best for**: Category comparisons, rankings, distributions.

```svelte
<Chart
  store={chartStore}
  type="bar"
  x="category"
  y="count"
  color="segment"
  enableTooltip={true}
/>
```

**Variants**:
- Vertical bars (default)
- Grouped bars (via `color`)
- Stacked bars (via config)

### Area Chart

**Purpose**: Line chart with filled area below.

**Best for**: Cumulative data, part-to-whole relationships.

```svelte
<Chart
  store={chartStore}
  type="area"
  x="date"
  y="value"
  color="category"
  enableZoom={true}
/>
```

**Notes**:
- Multiple series stack by default
- Baseline at Y=0 unless configured

### Histogram

**Purpose**: Distribution of numerical data into bins.

**Best for**: Data distributions, frequency analysis.

```svelte
<Chart
  store={chartStore}
  type="histogram"
  x="value"
  enableTooltip={true}
/>
```

**Notes**:
- Automatically bins data
- Y-axis shows frequency count
- Customize bins via state actions

---

## STATE MANAGEMENT

### ChartState Interface

```typescript
interface ChartState<T = unknown> {
  // Data
  data: T[];                    // Original data
  filteredData: T[];             // After filters applied

  // Visualization config
  dimensions: {
    width: number;
    height: number;
  };

  // Selection
  selection: {
    type: 'none' | 'point' | 'range' | 'brush';
    selectedData: T[];
    selectedIndices: number[];
    range?: [number, number];
  };

  // Keyboard cursor: an index into `filteredData`, or null for no cursor.
  // Not the same thing as selection — moving it announces and rings a point
  // and nothing else. Cleared whenever the data changes.
  focusedIndex: number | null;

  // Zoom/pan
  transform: {
    x: number;
    y: number;
    k: number;  // scale factor
  };
  targetTransform?: ZoomTransform;  // For animated zoom

  // Animation
  isAnimating: boolean;
  transitionDuration: number;      // milliseconds, default 400
}
```

### ChartAction Types

```typescript
type ChartAction<T = unknown> =
  // Data
  | { type: 'setData'; data: T[] }
  | { type: 'filterData'; predicate: (d: T) => boolean }
  | { type: 'clearFilters' }

  // Selection
  | { type: 'selectPoint'; data: T; index: number }
  | { type: 'selectRange'; range: [number, number] }   // a contiguous span
  | { type: 'selectPoints'; indices: number[] }        // an arbitrary set — what a brush produces
  | { type: 'brushStart' }
  | { type: 'clearSelection' }

  // Keyboard cursor
  | { type: 'focusPoint'; index: number }
  | { type: 'focusNext' }
  | { type: 'focusPrevious' }
  | { type: 'focusFirst' }
  | { type: 'focusLast' }
  | { type: 'clearFocus' }
  | { type: 'selectFocused' }

  // Zoom/pan
  | { type: 'zoom'; transform: ZoomTransform }
  | { type: 'zoomAnimated'; targetTransform: ZoomTransform }
  | { type: 'zoomProgress'; transform: ZoomTransform }
  | { type: 'zoomComplete' }
  | { type: 'resetZoom' }
  | { type: 'zoomIn' }
  | { type: 'zoomOut' }

  // Dimensions
  | { type: 'resize'; dimensions: { width: number; height: number } }

  // Config;
```

### Creating Initial State

```typescript
import { createInitialChartState } from '@composable-svelte/charts';

const initialState = createInitialChartState({
  data: myData,
  dimensions: { width: 800, height: 400 },
  transitionDuration: 300
});
```

---

## INTERACTIVE FEATURES

### Zoom & Pan

**Enable**: `enableZoom={true}`

**Controls**:
- Mouse wheel: Zoom in/out
- Click + drag: Pan

There is no double-click handler in this package. d3-zoom's own default
double-click zooms *in*; it does not reset. Dispatch `resetZoom` for that.

**Programmatic zoom**:
```typescript
// Zoom in
chartStore.dispatch({
  type: 'zoom',
  transform: { x: 0, y: 0, k: 2 }  // 2x zoom
});

// Reset zoom
chartStore.dispatch({ type: 'resetZoom' });

// Animated zoom
chartStore.dispatch({
  type: 'zoomAnimated',
  targetTransform: { x: 100, y: 50, k: 1.5 }
});
```

### Brush Selection

**Enable**: `enableBrush={true}`

**Controls**:
- Click + drag: Create brush
- Drag corners: Resize brush
- Drag center: Move brush
- Click outside: Clear brush

**Access selected data**:
```typescript
const selected = $chartStore.selection.selectedData;
console.log('Selected points:', selected);
```

**Callback**:
```svelte
<Chart
  store={chartStore}
  enableBrush={true}
  onSelectionChange={(selected) => {
    console.log('Selected:', selected);
    // Do something with selected data
  }}
/>
```

### Tooltips

**Enable**: `enableTooltip={true}` (default)

**Behavior**:
- Hover over data points to show tooltip
- Automatically displays data values
- Tooltip content customizable via Observable Plot

**Custom tooltips**:
```typescript
// Via Plot spec
const spec = {
  marks: [
    Plot.dot(data, {
      x: 'x',
      y: 'y',
      title: (d) => `${d.name}: ${d.value}` // Custom tooltip
    })
  ]
};
```

### Point Selection

**Enable**: dispatch `selectPoint` yourself. There is no click handler anywhere
in this package, so clicking a point does nothing — the only built-in gesture
that produces a selection is the brush.

```typescript
// Listen for point selection
$effect(() => {
  if ($chartStore.selection.type === 'point') {
    const selected = $chartStore.selection.selectedData[0];
    console.log('Selected point:', selected);
  }
});

// Programmatic selection
chartStore.dispatch({
  type: 'selectPoint',
  data: myDataPoint,
  index: 5
});

// Clear selection
chartStore.dispatch({ type: 'clearSelection' });
```

---

## DATA BINDING

### Static Data

```typescript
const data = [
  { x: 1, y: 10 },
  { x: 2, y: 20 },
  { x: 3, y: 15 }
];

const chartStore = createStore({
  initialState: createInitialChartState({ data }),
  reducer: chartReducer,
  dependencies: {}
});
```

### Dynamic Data Updates

```typescript
// Update data
chartStore.dispatch({
  type: 'setData',
  data: newData
});

// Filter data
chartStore.dispatch({
  type: 'filterData',
  predicate: (d) => d.value > 10
});

// Clear filters
chartStore.dispatch({ type: 'clearFilters' });
```

### Real-time Data

```typescript
// Append new point
const currentData = $chartStore.data;
chartStore.dispatch({
  type: 'setData',
  data: [...currentData, newPoint]
});

// Update via Effect
Effect.run(async (dispatch) => {
  const newData = await fetchLatestData();
  dispatch({ type: 'setData', data: newData });
});
```

---

## RESPONSIVE DESIGN

### Auto-sizing

Omit `width` and `height` for responsive sizing:

```svelte
<Chart
  store={chartStore}
  type="scatter"
  x="x"
  y="y"
/>
```

Chart will:
- Use container width (100%)
- Default height (400px)
- Resize on window resize

### Fixed Dimensions

```svelte
<Chart
  store={chartStore}
  type="scatter"
  x="x"
  y="y"
  width={800}
  height={600}
/>
```

### Container-based Sizing

```svelte
<div class="chart-container">
  <Chart store={chartStore} ... />
</div>

<style>
  .chart-container {
    width: 100%;
    height: 500px;
  }
</style>
```

### Responsive Breakpoints

```svelte
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
```

---

## ACCESSIBILITY

Every chart is keyboard-operable as soon as it renders. There is no prop to
switch it on, and no prop to switch it off.

### ARIA

The chart container carries:

- `role="application"` with `aria-roledescription="interactive chart"`. It was
  `role="img"`, which told assistive technology the subtree was a static graphic
  while the chart supported zoom and brush selection.
- `aria-label` naming the type, the **filtered** point count and the selection.
- `aria-describedby` pointing at a per-instance summary — generated with
  `$props.id()`, so two charts on one page are not described by each other.

`<Chart>` takes no `aria-label` prop. It has no rest-spread, so one passed in is
silently dropped; the label is generated from the store. (This file previously
showed an example passing one.)

### Keyboard

| key | does |
|---|---|
| `Tab` | move focus to the chart |
| `←` `→` `↑` `↓` | previous / next data point |
| `Home` / `End` | first / last data point |
| `Enter` / `Space` | select the focused point |
| `Escape` | clear the selection |
| `Shift` + arrows | pan |
| `+` / `-` | zoom in / out |
| `0` | reset the zoom |

Arrows move the cursor and `Shift`+arrows pan, which is the reverse of what this
file used to document — none of which was implemented. Reaching the data matters
more than moving the viewport, so traversal takes the unmodified key.

Each binding is one dispatch into the reducer, so the same navigation is
available programmatically:

```typescript
chartStore.dispatch({ type: 'focusNext' });
chartStore.dispatch({ type: 'selectFocused' });
```

That is also how to test it — no synthetic key events needed.

### What a screen reader gets

- A polite live region announcing each point as the cursor reaches it: its
  position in the series, its values, and whether it is selected.
- A visually hidden data table of the filtered rows, capped at 100 with the
  caption stating the truncation. It is rendered **outside** the
  `role="application"` element, because `application` makes a screen reader pass
  keystrokes through instead of browsing — right for the plot, fatal for a table.

### Focus indicator

The chart draws a `:focus-visible` outline, and the focused point is ringed on
every chart type. A histogram gets a dashed rule at the point's x instead, since
binning leaves no per-point `y` to ring.

### Contrast

Measured from constants in `src/lib/utils/palette.ts` and re-checked by
`tests/contrast.test.ts` against light and dark backgrounds. Data marks clear
SC 1.4.11's 3:1 at full strength and stay at the floor when dimmed behind a
selection. Do **not** lower `DIMMED_OPACITY` to make dimming more obvious — the
selection is carried by an added mark, not by suppressing the rest, and the test
fails if you do.

State markers use `currentColor`, never a fixed ink: black is 21:1 on white and
1.02:1 on near-black, so a hardcoded focus ring disappears in dark mode.

### WCAG 2.1 AA

Reviewed criterion by criterion in `tests/wcag-conformance.test.ts` — keyboard
trap, character-key shortcut scoping, use of colour, on-focus behaviour, and
name/role/value. It is a self-review, not a third-party audit, and the criteria
belonging to the surrounding page are the application's.

---

## COMPLETE EXAMPLES

### Basic Scatter Plot

```svelte
<script lang="ts">
import { createStore } from '@composable-svelte/core';
import { Chart, chartReducer, createInitialChartState } from '@composable-svelte/charts';

const data = [
  { x: 10, y: 20, category: 'A' },
  { x: 15, y: 35, category: 'B' },
  { x: 20, y: 25, category: 'A' },
  { x: 25, y: 45, category: 'B' }
];

const chartStore = createStore({
  initialState: createInitialChartState({ data }),
  reducer: chartReducer,
  dependencies: {}
});
</script>

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
```

### Time Series Line Chart

```svelte
<script lang="ts">
import { createStore } from '@composable-svelte/core';
import { Chart, chartReducer, createInitialChartState } from '@composable-svelte/charts';

interface DataPoint {
  date: Date;
  value: number;
  series: string;
}

const data: DataPoint[] = [
  { date: new Date('2024-01-01'), value: 100, series: 'A' },
  { date: new Date('2024-01-02'), value: 120, series: 'A' },
  { date: new Date('2024-01-03'), value: 115, series: 'A' },
  { date: new Date('2024-01-01'), value: 80, series: 'B' },
  { date: new Date('2024-01-02'), value: 95, series: 'B' },
  { date: new Date('2024-01-03'), value: 105, series: 'B' }
];

const chartStore = createStore({
  initialState: createInitialChartState({ data }),
  reducer: chartReducer,
  dependencies: {}
});
</script>

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
```

### Interactive Bar Chart

```svelte
<script lang="ts">
import { createStore } from '@composable-svelte/core';
import { Chart, chartReducer, createInitialChartState } from '@composable-svelte/charts';

const data = [
  { category: 'Q1', revenue: 45000, expenses: 32000 },
  { category: 'Q2', revenue: 52000, expenses: 38000 },
  { category: 'Q3', revenue: 48000, expenses: 35000 },
  { category: 'Q4', revenue: 61000, expenses: 42000 }
];

const chartStore = createStore({
  initialState: createInitialChartState({ data }),
  reducer: chartReducer,
  dependencies: {}
});

let selectedCategory = $state<string | null>(null);

function handleSelection(selected: any[]) {
  selectedCategory = selected[0]?.category || null;
}
</script>

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
```

### Real-time Data Visualization

```svelte
<script lang="ts">
import { createStore, Effect } from '@composable-svelte/core';
import { Chart, chartReducer, createInitialChartState } from '@composable-svelte/charts';
import { onMount } from 'svelte';

let data = $state<Array<{ time: number; value: number }>>([]);

const chartStore = createStore({
  initialState: createInitialChartState({ data }),
  reducer: chartReducer,
  dependencies: {}
});

// Simulate real-time data stream
let intervalId: number;

onMount(() => {
  let time = 0;

  intervalId = setInterval(() => {
    const newPoint = {
      time: time++,
      value: Math.random() * 100
    };

    data = [...data.slice(-50), newPoint]; // Keep last 50 points

    chartStore.dispatch({
      type: 'setData',
      data
    });
  }, 100);

  return () => clearInterval(intervalId);
});
</script>

<Chart
  store={chartStore}
  type="line"
  x="time"
  y="value"
  yDomain={[0, 100]}
  enableAnimations={true}
/>
```

---

## COMMON PATTERNS

### Multiple Charts with Shared Selection

```svelte
<script lang="ts">
const data = [{ x: 1, y: 10 }, { x: 2, y: 25 }]; // Shared data

const chartStore1 = createStore({
  initialState: createInitialChartState({ data }),
  reducer: chartReducer,
  dependencies: {}
});
const chartStore2 = createStore({
  initialState: createInitialChartState({ data }),
  reducer: chartReducer,
  dependencies: {}
});

let selectedData = $state<any[]>([]);

function syncSelection(selected: any[]) {
  selectedData = selected;

  // Update both charts
  const indices = selected.map(d => data.indexOf(d));
  chartStore1.dispatch({ type: 'selectRange', range: [indices[0], indices[indices.length - 1]] });
  chartStore2.dispatch({ type: 'selectRange', range: [indices[0], indices[indices.length - 1]] });
}
</script>

<Chart store={chartStore1} ... onSelectionChange={syncSelection} />
<Chart store={chartStore2} ... onSelectionChange={syncSelection} />
```

### Linked Zoom

```svelte
<script lang="ts">
const masterStore = createStore({ initialState: masterState, reducer: chartReducer, dependencies: {} });
const detailStore = createStore({ initialState: detailState, reducer: chartReducer, dependencies: {} });

$effect(() => {
  const transform = $masterStore.transform;
  detailStore.dispatch({ type: 'zoom', transform });
});
</script>

<Chart store={masterStore} enableZoom={true} />
<Chart store={detailStore} /> <!-- Zooms with master -->
```

### Dynamic Filtering

```svelte
<script lang="ts">
let minValue = $state(0);
let maxValue = $state(100);

$effect(() => {
  chartStore.dispatch({
    type: 'filterData',
    predicate: (d) => d.value >= minValue && d.value <= maxValue
  });
});
</script>

<input type="range" bind:value={minValue} min="0" max="100" />
<input type="range" bind:value={maxValue} min="0" max="100" />
<Chart store={chartStore} ... />
```

---

## PERFORMANCE CONSIDERATIONS

### Large Datasets

**Problem**: Rendering 10,000+ points can be slow.

**Solutions**:
1. **Data aggregation**: Bin/group data before rendering
2. **Sampling**: Show subset of data (e.g., every 10th point)
3. **Level-of-detail**: Show more detail when zoomed in
4. **WebGL rendering**: Use Plot's WebGL marks (future)

```typescript
// Example: Downsample data
const downsample = (data: any[], factor: number) =>
  data.filter((_, i) => i % factor === 0);

const displayData = data.length > 1000
  ? downsample(data, Math.ceil(data.length / 1000))
  : data;

chartStore.dispatch({ type: 'setData', data: displayData });
```

### Frequent Updates

**Problem**: Real-time data updates cause re-renders.

**Solutions**:
1. **Batch updates**: Update every N milliseconds, not every data point
2. **Sliding window**: Keep fixed number of points (e.g., last 100)
3. **Throttle**: Limit update frequency

```typescript
// Throttle updates
let pendingData: any[] = [];
let updateTimer: number | null = null;

function queueUpdate(newData: any[]) {
  pendingData = newData;

  if (updateTimer === null) {
    updateTimer = setTimeout(() => {
      chartStore.dispatch({ type: 'setData', data: pendingData });
      updateTimer = null;
    }, 100); // Update max once per 100ms
  }
}
```

### Animation Performance

Disable animations for large datasets or frequent updates:

```svelte
<Chart
  store={chartStore}
  enableAnimations={false}
  ...
/>
```

---

## TESTING

### Basic Chart Testing

```typescript
import { TestStore } from '@composable-svelte/core/test';
import { chartReducer, createInitialChartState } from '@composable-svelte/charts';

const store = new TestStore({
  initialState: createInitialChartState({ data: [] }),
  reducer: chartReducer,
  dependencies: {}
});

// Test data update
await store.send({
  type: 'setData',
  data: [{ x: 1, y: 10 }]
}, (state) => {
  expect(state.data.length).toBe(1);
  expect(state.filteredData.length).toBe(1);
});

// Test filtering
await store.send({
  type: 'filterData',
  predicate: (d) => d.y > 5
}, (state) => {
  expect(state.filteredData.length).toBe(1);
});
```

### Selection Testing

```typescript
await store.send({
  type: 'selectPoint',
  data: { x: 1, y: 10 },
  index: 0
}, (state) => {
  expect(state.selection.type).toBe('point');
  expect(state.selection.selectedData.length).toBe(1);
  expect(state.selection.selectedIndices).toEqual([0]);
});

await store.send({ type: 'clearSelection' }, (state) => {
  expect(state.selection.type).toBe('none');
  expect(state.selection.selectedData.length).toBe(0);
});
```

---

## TROUBLESHOOTING

**Chart not rendering**:
- Verify data is non-empty array
- Ensure x/y accessors match data properties

**Tooltips not showing**:
- Verify `enableTooltip={true}`
- Check Observable Plot version (0.6+ required)
- Ensure data points have valid values (not null/undefined)

**Zoom not working**:
- Verify `enableZoom={true}`
- Check chart has fixed dimensions (not 100% width/height)
- Ensure D3-zoom is installed

**Poor performance**:
- Reduce data points (aggregate, sample, or downsample)
- Disable animations for large datasets
- Use simpler mark types (dots vs complex shapes)

**Selection not updating**:
- Check `onSelectionChange` callback
- Verify `enableBrush={true}`. (There is no `enableSelection` prop; it never existed.)
- Ensure store is reactive (`$chartStore.selection`)

---

## CROSS-REFERENCES

**Related Skills**:
- **composable-svelte-core**: Store, reducer, Effect system
- **composable-svelte-components**: UI components (Button, Slider, etc.)
- **composable-svelte-testing**: TestStore for testing chart reducers

**When to Use Each Package**:
- **charts**: 2D data visualization, interactive charts
- **graphics**: 3D scenes, WebGL (see composable-svelte-graphics)
- **maps**: Geospatial data (see composable-svelte-maps)
- **code**: Code editors, media players (see composable-svelte-code)

---

## COMPLETE API REFERENCE

All exports from `@composable-svelte/charts`:

### Types

- `ChartState` - Chart state interface
- `ChartAction` - Chart action discriminated union
- `ChartConfig` - Chart configuration options
- `SelectionState` - Selection state (point, range, brush)
- `ZoomTransform` - Zoom/pan transform `{ x, y, k }`
- `DataTransform` - Data transform function type `(data: T[]) => T[]`
- `DataTransforms` - Namespace object with all transform functions

### Reducers

- `chartReducer` - Pure reducer for chart state management
- `createInitialChartState(config)` - Factory for initial chart state

### Components

- `Chart` - High-level chart component (scatter, line, bar, area, histogram)
- `ChartPrimitive` - Low-level chart primitive for custom chart implementations

### Utility Exports: Plot Builder (`plot-builder`)

- `buildScatterPlot(state, config)` - Build Observable Plot scatter specification
- `buildLineChart(state, config)` - Build Observable Plot line specification
- `buildBarChart(state, config)` - Build Observable Plot bar specification
- `buildAreaChart(state, config)` - Build Observable Plot area specification
- `buildHistogram(state, config)` - Build Observable Plot histogram specification
- `buildPlot(state, config)` - Build plot specification by chart type
- `applyZoomToDomain(domain, transform)` - Apply zoom transform to axis domain
- `calculateDomain(data, accessor)` - Calculate min/max domain from data

### Utility Exports: Data Transforms (`data-transforms`)

- `filter(predicate)` - Filter data by predicate
- `sortBy(field, direction)` - Sort data by field
- `groupBy(field)` - Group data by field
- `aggregate(operation, field?)` - Reduce data to one number. `operation` is 'sum' | 'mean' | 'median' | 'count' | 'min' | 'max'
- `compose(...transforms)` - Compose multiple transforms into a pipeline
- `binData(field, bins)` - Bin numerical data into histogram buckets
- `rollup(window, field, operation?)` - Rolling window over `field`; `operation` defaults to the mean
- `topN(n, field)` - Take top N items by field value
- `unique(field)` - Deduplicate data by field
- `sample(n)` - Randomly sample N items from data
- `DataTransforms` - Namespace object containing all transform functions

### Utility Exports: Responsive (`responsive`)

- `createResizeObserver(element, dispatch)` - Create ResizeObserver for auto-sizing
- `calculateDimensions(container, aspectRatio?)` - Dimensions from a container element
- `debounce(fn, delay)` - A debounce helper. Note that `createResizeObserver`
  does **not** use it: it dedupes by value instead, dispatching only when the
  measured dimensions actually change. Resizes are therefore not throttled.
