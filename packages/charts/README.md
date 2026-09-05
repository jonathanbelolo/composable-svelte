# @composable-svelte/charts

> Interactive data visualization components for Composable Svelte

**Status**: ✅ **Feature Complete** (Phase 11C). Keyboard-operable,
screen-reader-navigable, contrast measured, and WCAG 2.1 AA self-reviewed
criterion by criterion — see [Accessibility](#accessibility).

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
- 🧪 **Testable**: Comprehensive integration and visual regression tests (191 tests)

## Installation

```bash
pnpm add @composable-svelte/charts
```

**Peer dependencies**:
- `@composable-svelte/core` ^0.12.0
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

// The transforms are generic in the row type. Name it — `sortBy` and `topN`
// accept a field name only when they know which fields exist, and fall back to
// requiring an accessor function when the row type is unknown.
interface Row {
  active: boolean;
  value: number;
}

// Compose multiple transforms
const pipeline = DataTransforms.compose<Row>(
  DataTransforms.filter<Row>((d) => d.active),
  DataTransforms.sortBy<Row>('value', 'desc'),
  DataTransforms.topN<Row>(10, 'value')
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
| selection highlight | ✅ | ✅ | ✅ | ✅ | rule |
| keyboard navigation | ✅ | ✅ | ✅ | ✅ | ✅ |
| focus indicator | ✅ | ✅ | ✅ | ✅ | rule |
| `size` | ✅ | — | — | — | — |
| `xDomain` | ✅ | ✅ | — | ✅ | — |
| `yDomain` | ✅ | ✅ | ✅ | ✅ | — |

`enableBrush` needs `<circle>` marks to hit-test against, which only scatter and
line produce. On the other types the brush overlay draws and selects nothing.

Selection is drawn on every type now: an added filled mark with an outline,
under the focus ring, so a point that is both selected and focused reads as one
inside the other. The histogram gets a rule rather than a ring, because binning
leaves no per-row `y` to mark — solid for selection against dashed for focus, so
the two are told apart by line style rather than colour.

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

### Contrast

Measured, not assumed. `tests/contrast.test.ts` recomputes WCAG ratios from the
constants in `src/lib/utils/palette.ts` against a white and a near-black
background, so these numbers cannot drift from the code:

| | ratio | |
|---|---|---|
| data mark, full strength | 3.68:1 on white, 5.38:1 on near-black | passes SC 1.4.11 |
| data mark, dimmed behind a selection | 3.00:1 | at the floor, deliberately |

The review found the **default** state of every scatter chart at 2.41:1 — below
the 3:1 that SC 1.4.11 asks — and dimmed points at 1.26:1, which is erasure
rather than de-emphasis. Both are fixed. The blue is unchanged: darker blues
score better on white and worse on dark, and `#3b82f6` is the one that clears
3:1 on both.

Dimming is taken exactly as far as it can go and no further, because the
selection is carried by an *added* mark rather than by suppressing everything
else. The focus ring and selection outline use `currentColor`, so they follow the
app's text colour instead of vanishing in dark mode the way a fixed black would.

Two things are held to no minimum, deliberately: the area chart's translucent
fill, which sits under a full-strength line of the same colour that describes the
series, and grid lines, which assist reading a position the axis labels state
exactly. SC 1.4.11 covers graphics *required to understand the content*.

### WCAG 2.1 AA

Reviewed criterion by criterion in `tests/wcag-conformance.test.ts`, which is
executable rather than a checklist: no keyboard trap (Tab and Shift+Tab pass
through), single-character shortcuts scoped to the focused component per the
SC 2.1.4 exemption, no reliance on colour alone, no context change on focus, and
name/role/value exposed and updating. SC 1.4.11, 2.4.7, 4.1.3, 1.1.1 and 1.3.1
are covered by the sibling test files that file names.

**This is a self-review, not a third-party audit.** That distinction is the one
thing here we cannot close ourselves: everything above is checked by tests you
can run, but no independent auditor has looked at it, and the criteria that
belong to the page around the chart — heading structure, text contrast inherited
through `currentColor`, reflow at the app's breakpoints — are the consuming
application's to meet.

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
- ✅ Accessibility: WCAG 2.1 AA reviewed criterion by criterion, contrast measured
- ⚠️ Accessibility: self-reviewed; no third-party audit — see Accessibility
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
