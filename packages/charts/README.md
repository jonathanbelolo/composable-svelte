# @composable-svelte/charts

> Interactive data visualization components for Composable Svelte

**Status**: ✅ **Feature Complete** (Phase 11C). Keyboard-operable and
screen-reader-navigable; see [Accessibility](#accessibility) for what is
covered and what has not been formally audited.

## Overview

`@composable-svelte/charts` provides state-driven, interactive data visualization components built on top of [Observable Plot](https://observablehq.com/plot/) and D3 utilities. All chart state is managed using the Composable Architecture patterns from `@composable-svelte/core`.

## Features

- 🎯 **State-Driven**: All chart state managed via reducers (data, selections, zoom, tooltips)
- 🎨 **Observable Plot**: Declarative chart specifications with concise, powerful API
- 🖱️ **Interactive**: Zoom, pan, brush selection, and smooth animations
- 🔄 **Data Transforms**: Composable transforms (filter, sort, group, bin, rollup, topN)
- ⚡ **Performant**: GPU-accelerated animations with `requestAnimationFrame`
- ♿ **Accessible**: keyboard navigation over the data points, a live region
  announcing each one, a visible focus ring and a screen-reader data table — see [Accessibility](#accessibility).
- 📱 **Responsive**: Automatic container-based sizing with ResizeObserver
- 🧪 **Testable**: Comprehensive integration and visual regression tests (158 tests)

## Installation

```bash
pnpm add @composable-svelte/charts
```

**Peer dependencies**:
- `@composable-svelte/core` ^0.11.0
- `svelte` ^5.0.0

## Quick Start

Nothing below switches keyboard navigation on, because there is no switch —
every chart is operable from the keyboard as soon as it renders.

```svelte
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
```

This block is [`tests/doc-examples/keyboard-chart.svelte`](tests/doc-examples/keyboard-chart.svelte),
quoted verbatim. The file is typechecked by `svelte-check` in the repo gate and
a test asserts this README still matches it, so the quickstart cannot go stale
without something failing.

## Chart Types

### Available Charts
- ✅ **Scatter Plot** - Points with interactive selection
- ✅ **Line Chart** - Time series with zoom/pan
- ✅ **Bar Chart** - Categorical data with tooltips
- ✅ **Area Chart** - Filled time series
- ✅ **Histogram** - Distribution visualization with brushing

### Future Charts (Deferred)
- 📋 **Heatmap** - 2D density with color scales
- 📋 **Network Graph** - Force-directed layouts
- 📋 **Tree/Hierarchy** - Tree layouts, sunburst, treemap

## Data Transforms

Transform your data declaratively before visualization:

```typescript
import { DataTransforms } from '@composable-svelte/charts';

// Compose multiple transforms
const pipeline = DataTransforms.compose(
  DataTransforms.filter(d => d.active),
  DataTransforms.sortBy('value', 'desc'),
  DataTransforms.topN(10, 'value')
);

const transformed = pipeline(data);
```

### Available Transforms

- **`filter(predicate)`** - Filter data by predicate function
- **`sortBy(field, order)`** - Sort by field ('asc' or 'desc')
- **`groupBy(key)`** - Group data into Record<string, T[]>
- **`aggregate(operation, field)`** - Aggregate (sum, mean, median, count, min, max)
- **`binData(field, thresholds)`** - Bin continuous data for histograms
- **`rollup(window, field, operation)`** - Rolling window aggregation
- **`topN(n, field)`** - Top N items by field value
- **`unique(field)`** - Remove duplicates by field
- **`sample(n)`** - Random sample of n items
- **`compose(...transforms)`** - Compose multiple transforms into pipeline

## API

### Types

```typescript
interface ChartState<T> {
  data: T[];
  filteredData: T[];
  dimensions: { width: number; height: number };
  selection: SelectionState<T>;
  transform: ZoomTransform;
  isAnimating: boolean;
  transitionDuration: number; // milliseconds
}

type ChartAction<T> =
  | { type: 'setData'; data: T[] }
  | { type: 'filterData'; predicate: (d: T) => boolean }
  | { type: 'selectPoint'; data: T; index: number }
  | { type: 'zoom'; transform: ZoomTransform }
  // ... and more
```

### Functions

```typescript
// Create initial chart state
function createInitialChartState<T>(config: {
  data?: T[];
  transitionDuration?: number; // milliseconds, default 400
  dimensions?: { width: number; height: number };
}): ChartState<T>

// Chart reducer
const chartReducer: Reducer<ChartState, ChartAction, {}>
```

## Architecture

### State Management Pattern

All chart state lives in the reducer:

```typescript
// User clicks a point
store.dispatch({
  type: 'selectPoint',
  data: point,
  index: 5
});

// Reducer updates selection state
selection: {
  type: 'point',
  selectedData: [point],
  selectedIndices: [5]
}

// UI reactively updates
const isSelected = $derived($store.selection.selectedIndices.includes(pointIndex));
```

### Observable Plot Integration

Charts use Observable Plot's declarative API:

```typescript
const spec = {
  marks: [
    Plot.dot(data, {
      x: 'sepalLength',
      y: 'sepalWidth',
      fill: 'species',
      stroke: (d, i) => isSelected(i) ? 'black' : null
    })
  ],
  x: { domain: [4, 8] },
  y: { domain: [2, 5] }
};
```

### Animation System

State-driven animations using Motion One:

The component owns this; there is nothing to write. `zoomAnimated` records a
target transform, `ChartPrimitive` animates towards it over
`state.transitionDuration` milliseconds and dispatches `zoomProgress` per frame,
then `zoomComplete`. Pass `enableAnimations={false}` to jump straight to the
target instead.

```typescript
createInitialChartState({ data, transitionDuration: 250 });
```

(The snippet that used to be here called `animate` from Motion One against
`$store.transitionDuration`. No such code exists in this package, the duration
was read by nothing, and Motion One is not a dependency.)

## Examples

See `examples/styleguide/` for full examples:
- 📊 Interactive Scatter Plot
- 📈 Zoomable Time Series
- 🔗 Linked Charts (coordinated views)

## Testing

All state transitions are testable via `TestStore`:

```typescript
import { createTestStore } from '@composable-svelte/core/test';
import { chartReducer, createInitialChartState } from '@composable-svelte/charts';

const store = createTestStore({
  initialState: createInitialChartState({ data }),
  reducer: chartReducer
});

await store.send(
  { type: 'selectPoint', data: data[0], index: 0 },
  (state) => {
    expect(state.selection.selectedIndices).toEqual([0]);
  }
);
```

## Performance

- ✅ Handles 10,000+ data points smoothly
- ✅ GPU-accelerated animations (60fps)
- ✅ Bundle size < 100KB (gzipped)
- ✅ Interaction response < 16ms

## What each chart type supports

Not uniform, and worth checking before choosing a type:

| | scatter | line | bar | area | histogram |
|---|---|---|---|---|---|
| `enableTooltip` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `enableZoom` / pan | ✅ | ✅ | — | ✅ | — |
| `enableBrush` | ✅ | ✅ | — | — | — |
| selection highlight | ✅ | — | — | — | — |
| keyboard navigation | ✅ | ✅ | ✅ | ✅ | ✅ |
| focus indicator | ✅ | ✅ | ✅ | ✅ | rule |
| `size` | ✅ | — | — | — | — |
| `xDomain` | ✅ | ✅ | — | ✅ | — |
| `yDomain` | ✅ | ✅ | ✅ | ✅ | — |

`enableBrush` needs `<circle>` marks to hit-test against, which only scatter and
line produce. On the other types the brush overlay draws and selects nothing.

`onSelectionChange` fires for every type — the *callback* is not the gap; the
visual highlight is. Only `buildScatterPlot` reads `state.selection`.

These are gaps rather than decisions, and they are recorded in
`plans/hardening/README.md`.

## Accessibility

The chart is operable without a pointer. Every interaction it offers has a key,
and the data is reachable whether or not the picture is.

### Keyboard

| key | does |
|---|---|
| `Tab` | move focus to the chart |
| `←` `→` `↑` `↓` | move the cursor to the previous / next data point |
| `Home` / `End` | first / last data point |
| `Enter` / `Space` | select the focused point |
| `Escape` | clear the selection |
| `Shift` + arrows | pan |
| `+` / `-` | zoom in / out |
| `0` | reset the zoom |

Arrows move the cursor rather than panning, because reaching the data matters
more than moving the viewport; panning takes the modifier. `+`/`-` respect the
same `[0.5, 10]` scale bounds as the mouse wheel, so the two cannot disagree.

### What a screen reader gets

- **A cursor that speaks.** A polite live region announces each point as the
  cursor reaches it — its position in the series, its values, and whether it is
  selected.
- **A data table.** The filtered rows are rendered as a visually hidden
  `<table>`, capped at 100 rows with the caption stating the truncation. It sits
  outside the `role="application"` element on purpose: `application` tells a
  screen reader to pass keystrokes through, which is right for the plot and
  would make a table unreadable.
- **A description that matches the chart.** `aria-label` and the summary both
  report the *filtered* count, and the summary's id is unique per instance, so
  two charts on one page are not described by each other's data.
- `role="application"` with `aria-roledescription="interactive chart"`. This
  container was `role="img"`, which told assistive technology there was nothing
  to operate on a surface supporting zoom and brush selection.

### For sighted keyboard users

The focused chart draws a `:focus-visible` outline, and the focused point is
ringed. On a histogram — which bins its rows and so has no per-point `y` — the
cursor is a dashed rule at the point's x instead.

### Not covered

- **A formal WCAG 2.1 AA audit.** The Level A keyboard failure this section used
  to describe is closed, and the pieces above are the AA-relevant ones we know
  of, but no audit has been run and none is claimed.
- **Colour contrast of the chart palette**, which is Observable Plot's default
  and unreviewed.
- **The selection highlight on non-scatter types** — see the support matrix
  below. That gap predates this work and is about *selection*, not focus; the
  keyboard cursor is drawn on every chart type.

## Development Status

**Phase 11C Complete!** See the [Phase 11 Plan](../../plans/phase-11/PHASE-11-PLAN.md) for detailed roadmap.

### Completed Features
- ✅ Core types and interfaces
- ✅ Chart reducer with full state management
- ✅ Chart and ChartPrimitive components
- ✅ Interactive behaviors (zoom, pan, brush selection on scatter/line)
- ✅ Smooth animation system with requestAnimationFrame
- ✅ Data transformation utilities (10 transforms)
- ✅ Responsive sizing with ResizeObserver
- ✅ Accessibility: keyboard navigation, live region, focus indicator, data table
- ⚠️ Accessibility: no formal WCAG 2.1 AA audit — see Accessibility
- ✅ Reducer and component tests, including that a state change reaches the SVG

- ✅ Complete JSDoc documentation

## Dependencies

- `@observablehq/plot` ^0.6.0 - Declarative visualization
- `d3-array`, `d3-brush`, `d3-selection`, `d3-zoom` - D3 utilities

Motion One is **not** a dependency of this package, as the animation section
above says. It was listed here as "Animation engine", contradicting that section
by a hundred lines, and appears in neither `dependencies` nor
`peerDependencies`.

## License

MIT © Jonathan Belolo

## Related Packages

- [`@composable-svelte/core`](../core) - Core Composable Architecture
- [`@composable-svelte/code`](../code) - Code editor components

## Resources

- [Observable Plot Documentation](https://observablehq.com/plot/)
- [D3 Gallery](https://observablehq.com/@d3/gallery)
- [Phase 11 Plan](../../plans/phase-11/PHASE-11-PLAN.md)
