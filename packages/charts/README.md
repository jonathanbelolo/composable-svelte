# @composable-svelte/charts

> Interactive data visualization components for Composable Svelte

**Status**: ✅ **Feature Complete** (Phase 11C)

## Overview

`@composable-svelte/charts` provides state-driven, interactive data visualization components built on top of [Observable Plot](https://observablehq.com/plot/) and D3 utilities. All chart state is managed using the Composable Architecture patterns from `@composable-svelte/core`.

## Features

- 🎯 **State-Driven**: All chart state managed via reducers (data, selections, zoom, tooltips)
- 🎨 **Observable Plot**: Declarative chart specifications with concise, powerful API
- 🖱️ **Interactive**: Zoom, pan, brush selection, and smooth animations
- 🔄 **Data Transforms**: Composable transforms (filter, sort, group, bin, rollup, topN)
- ⚡ **Performant**: GPU-accelerated animations with `requestAnimationFrame`
- ♿ **Partly accessible**: the chart carries an ARIA label and a text summary. There is no keyboard navigation — see Accessibility.
- 📱 **Responsive**: Automatic container-based sizing with ResizeObserver
- 🧪 **Testable**: Comprehensive integration and visual regression tests (34 tests)

## Installation

```bash
pnpm add @composable-svelte/charts
```

**Peer dependencies**:
- `@composable-svelte/core` ^0.3.0
- `svelte` ^5.0.0

## Quick Start

```typescript
import { Chart } from '@composable-svelte/charts';
import { createStore } from '@composable-svelte/core';
import { chartReducer, createInitialChartState } from '@composable-svelte/charts';

const data = [
  { x: 1, y: 10, category: 'A' },
  { x: 2, y: 20, category: 'B' },
  { x: 3, y: 30, category: 'A' }
];

const store = createStore({
  initialState: createInitialChartState({ data }),
  reducer: chartReducer,
  dependencies: {}
});
```

```svelte
<Chart
  {store}
  width={600}
  height={400}
  enableZoom={true}
  enableBrush={true}
  enableTooltip={true}
/>
```

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
$: isSelected = $store.selection.selectedIndices.includes(pointIndex);
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

See `examples/charts/` for full examples:
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

What exists today:

- `role="img"` with an `aria-label` on the chart, and an `aria-describedby`
  text summary of the series.

What does **not** exist, and was previously claimed here:

- **Keyboard navigation.** There is no `tabindex` and no key handler anywhere
  in this package — a chart cannot be focused or driven from the keyboard.
- **A data table fallback.** No table is rendered.
- **WCAG 2.1 AA conformance.** Not implemented and not audited; with no
  keyboard path it cannot hold.

Those are real gaps rather than deliberate omissions, and they are recorded in
`plans/hardening/README.md`. Do not treat this package as accessible for
interactive use.

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
- ⚠️ Accessibility: ARIA label and text summary only — no keyboard path
- ✅ Reducer and component tests, including that a state change reaches the SVG

- ✅ Complete JSDoc documentation

## Dependencies

- `@observablehq/plot` ^0.6.0 - Declarative visualization
- `d3-*` - D3 utilities (zoom, brush, selection, scales)
- `motion` ^12.0.0 - Animation engine

## License

MIT © Jonathan Belolo

## Related Packages

- [`@composable-svelte/core`](../core) - Core Composable Architecture
- [`@composable-svelte/code`](../code) - Code editor components

## Resources

- [Observable Plot Documentation](https://observablehq.com/plot/)
- [D3 Gallery](https://observablehq.com/@d3/gallery)
- [Phase 11 Plan](../../plans/phase-11/PHASE-11-PLAN.md)
