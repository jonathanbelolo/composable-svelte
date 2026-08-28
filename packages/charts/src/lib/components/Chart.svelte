<script lang="ts">
/**
 * Chart - High-level wrapper component for charts
 * Handles responsive sizing, provides easy API
 */

import { onMount } from 'svelte';
import ChartPrimitive from './ChartPrimitive.svelte';
import type { Store } from '@composable-svelte/core';
import type { ChartState, ChartAction, ChartConfig } from '../types/chart.types.js';
import { createResizeObserver } from '../utils/responsive.js';
import { buildPlot, resolveAccessor } from '../utils/plot-builder.js';

// Props
let {
  store,
  width,
  height,
  type = 'scatter',
  enableZoom = false,
  enableBrush = false,
  enableTooltip = true,
  enableAnimations = true,
  x,
  y,
  color,
  size,
  xDomain,
  yDomain,
  onSelectionChange
}: {
  store: Store<ChartState<any>, ChartAction<any>>;
  width?: number | undefined;
  height?: number | undefined;
  type?: 'scatter' | 'line' | 'bar' | 'area' | 'histogram' | undefined;
  enableZoom?: boolean | undefined;
  enableBrush?: boolean | undefined;
  enableTooltip?: boolean | undefined;
  enableAnimations?: boolean | undefined;
  x?: string | ((d: any) => any) | undefined;
  y?: string | ((d: any) => any) | undefined;
  color?: string | ((d: any) => any) | undefined;
  size?: number | undefined;
  xDomain?: [number, number] | 'auto' | undefined;
  yDomain?: [number, number] | 'auto' | undefined;
  onSelectionChange?: ((selected: any[]) => void) | undefined;
} = $props();

// Container element
let containerElement: HTMLDivElement | null = $state(null);
let resizeObserver: ResizeObserver | null = $state(null);

/**
 * The id `aria-describedby` points at, unique per component instance.
 *
 * It was the hardcoded literal `"chart-summary"`. `aria-describedby` resolves
 * through `getElementById`, which returns the **first** match, so on a page with
 * two charts every chart after the first was described by another chart's data —
 * a wrong description, not a missing one. `examples/styleguide` renders one demo
 * at a time, which is why nothing here ever saw it; a dashboard is the ordinary
 * case for a charts library.
 *
 * `$props.id()` rather than `Math.random()`: it is stable for the lifetime of the
 * instance and identical between server and client, so it does not break
 * hydration. Same reasoning as `graphics/Light.svelte`.
 */
const summaryId = $props.id();

// Chart config
const config: ChartConfig & { type: typeof type } = $derived({
  type,
  enableZoom,
  enableBrush,
  enableTooltip,
  enableAnimations,
  x,
  y,
  color,
  size,
  xDomain,
  yDomain
});

// Setup resize observer
onMount(() => {
  if (containerElement && !width && !height) {
    // Use ResizeObserver for fully responsive sizing
    resizeObserver = createResizeObserver(containerElement, store.dispatch);
  } else if (width || height) {
    // Use fixed dimensions
    store.dispatch({
      type: 'resize',
      dimensions: {
        width: width || 600,
        height: height || 400
      }
    });
  }

  return () => {
    resizeObserver?.disconnect();
  };
});

// Watch for selection changes.
//
// Narrowed to the array itself, not the whole `$store`. `$state.raw` replaces
// the state object on every dispatch, so depending on `$store` re-ran this on
// every action — including the per-frame `zoomProgress` of a zoom animation,
// re-invoking the consumer's callback with a selection that had not changed.
// The reducer's zoom/resize cases spread `...state`, preserving `selection` by
// reference, so the derived's equality check now absorbs all of them.
//
// And no `length > 0` guard: `clearSelection` allocates a fresh `[]`
// (`chart.reducer.ts:179-191`), so the derived does change identity on a clear
// and the consumer is told. Under the old guard it never was, and a details
// panel wired to this callback showed dismissed rows forever.
const selectedData = $derived($store.selection.selectedData);

// Not $state: written and read inside the effect below. A reactive flag would
// re-trigger the effect it lives in (`effect_update_depth_exceeded`).
let reportedInitial = false;

$effect(() => {
  // Report *changes*, which is what the prop is called. The effect's first run
  // carries the selection the consumer supplied in the initial state, so
  // delivering it back is unsolicited noise — and it is a real call, not a
  // theoretical one: measured as `MOUNT_CALLS=1 [[[]]]` once `ResizeObserver`
  // exists. jsdom lacks it, `onMount` throws, and the effect is suppressed, so
  // this is invisible in this package's own environment.
  const selection = selectedData;
  if (!reportedInitial) {
    reportedInitial = true;
    return;
  }
  onSelectionChange?.(selection);
});

// Provide plot builder to primitive
function plotBuilder(chartState: ChartState<any>, chartConfig: any) {
  return buildPlot(chartState, chartConfig);
}

/**
 * How many points are on screen, and how many exist.
 *
 * The label used to count `data` while the summary counted `filteredData`, so
 * after any `filterData` the two halves of the same description disagreed and
 * the label was the one that lied — it named points a user could not reach.
 * Both now read the filtered count, and both say the total when it differs.
 */
const shownCount = $derived($store.filteredData.length);
const totalCount = $derived($store.data.length);
const countPhrase = $derived(
  shownCount === totalCount
    ? `${shownCount} data points`
    : `${shownCount} of ${totalCount} data points`
);

const selectedCount = $derived($store.selection.selectedIndices.length);

/** Name an accessor for a human, without pretending to know a function's meaning. */
const axisName = (accessor: string | ((d: any) => any) | undefined) =>
  typeof accessor === 'string' ? accessor : accessor ? 'a custom accessor' : null;

/**
 * The description `aria-describedby` resolves to.
 *
 * Its body used to sit inside `{#if x && y}`. Both props are optional and
 * Observable Plot renders without them, so passing `x` alone — or neither —
 * left the referenced element empty, and an `aria-describedby` that resolves to
 * nothing is worse than none at all: the reference promises a description that
 * never arrives. Axes are now one optional clause inside a summary that always
 * says something.
 */
const summaryText = $derived.by(() => {
  const parts: string[] = [];

  const xName = axisName(x);
  const yName = axisName(y);
  if (xName && yName) parts.push(`Chart with x-axis: ${xName}, y-axis: ${yName}.`);
  else if (xName) parts.push(`Chart with x-axis: ${xName}.`);
  else if (yName) parts.push(`Chart with y-axis: ${yName}.`);
  else parts.push('Chart.');

  parts.push(
    shownCount === totalCount
      ? `Showing ${shownCount} data points.`
      : `Showing ${shownCount} of ${totalCount} filtered data points.`
  );

  if (selectedCount > 0) parts.push(`${selectedCount} selected.`);

  return parts.join(' ');
});

// ============================================================================
// Keyboard navigation
// ============================================================================
//
// The chart implements its own interactions — d3-zoom and d3-brush are bound to
// the Plot SVG — and until now gave them no keyboard path at all: no tabindex
// and no key handler anywhere in the package. That is WCAG 2.1.1, a Level A
// failure, and the README named AA as the gap, which understated it.
//
// Every binding here is one dispatch. The reducer owns the cursor, the clamping
// and the zoom bounds, so this file has no navigation logic to get wrong and the
// behaviour is testable without synthesising key events. Same division as
// `TreeView` in core.

/** Pixels of pan per Shift+Arrow press, in the transform's own units. */
const PAN_STEP = 40;

function pan(dx: number, dy: number) {
  const { x, y, k } = $store.transform;
  store.dispatch({ type: 'zoom', transform: { x: x + dx, y: y + dy, k } });
}

function handleKeyDown(event: KeyboardEvent) {
  // Arrows move the cursor; Shift+Arrows pan. The skill file documented the
  // reverse — bare arrows panning — but point-to-point traversal is the thing
  // that makes the data reachable at all, so it takes the unmodified key and
  // the documentation was corrected to match.
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      event.preventDefault();
      if (event.shiftKey) pan(event.key === 'ArrowRight' ? -PAN_STEP : 0, event.key === 'ArrowDown' ? -PAN_STEP : 0);
      else store.dispatch({ type: 'focusNext' });
      break;

    case 'ArrowLeft':
    case 'ArrowUp':
      event.preventDefault();
      if (event.shiftKey) pan(event.key === 'ArrowLeft' ? PAN_STEP : 0, event.key === 'ArrowUp' ? PAN_STEP : 0);
      else store.dispatch({ type: 'focusPrevious' });
      break;

    case 'Home':
      event.preventDefault();
      store.dispatch({ type: 'focusFirst' });
      break;

    case 'End':
      event.preventDefault();
      store.dispatch({ type: 'focusLast' });
      break;

    case 'Enter':
    case ' ':
      event.preventDefault();
      store.dispatch({ type: 'selectFocused' });
      break;

    case 'Escape':
      event.preventDefault();
      store.dispatch({ type: 'clearSelection' });
      break;

    // `=` and `_` are the unshifted faces of `+` and `-` on most layouts, so a
    // user pressing the key they see labelled `+` gets a zoom whether or not
    // they held Shift.
    case '+':
    case '=':
      event.preventDefault();
      store.dispatch({ type: 'zoomIn' });
      break;

    case '-':
    case '_':
      event.preventDefault();
      store.dispatch({ type: 'zoomOut' });
      break;

    case '0':
      event.preventDefault();
      store.dispatch({ type: 'resetZoom' });
      break;
  }
}

/**
 * What the live region says when the cursor moves.
 *
 * Without this, arrow keys move an invisible cursor and a screen reader user
 * learns nothing — the navigation would exist and still be useless. Empty while
 * there is no cursor, so nothing is announced at mount.
 */
const focusAnnouncement = $derived.by(() => {
  const index = $store.focusedIndex;
  if (index === null) return '';
  const datum = $store.filteredData[index];
  if (datum === undefined) return '';

  const parts = [`Point ${index + 1} of ${shownCount}.`];
  if (x) parts.push(`${axisName(x)}: ${resolveAccessor<any>(x)(datum)}.`);
  if (y) parts.push(`${axisName(y)}: ${resolveAccessor<any>(y)(datum)}.`);
  if ($store.selection.selectedIndices.includes(index)) parts.push('Selected.');

  return parts.join(' ');
});

// ============================================================================
// Data table
// ============================================================================
//
// The chart's data as a table, for anyone who cannot read a picture of it. The
// README listed "a data table fallback" among the things that did not exist.
//
// Always rendered rather than behind a prop: an accessibility fallback that is
// off by default helps nobody who needs it, and the people who would have to
// know to switch it on are not the people it is for.

/**
 * How many rows the table carries.
 *
 * Bounded because the alternative is a chart of 50,000 points emitting 50,000
 * hidden `<tr>`s into every consumer's DOM. The caption states the truncation
 * rather than leaving the table to imply it has everything.
 */
const MAX_TABLE_ROWS = 100;

/**
 * The columns to show, in order of how much is known about the data.
 *
 * Named accessors give real column headers. Function accessors give a value but
 * no name for it, so they are labelled by axis. With no accessors at all — a
 * legitimate configuration, since Plot has its own defaults — the row's own keys
 * are the best available answer, and a primitive row gets one Value column.
 */
type TableColumn = { label: string; read: (row: any) => unknown };

const tableColumns = $derived.by((): TableColumn[] => {
  const columns: TableColumn[] = [];
  if (x) columns.push({ label: typeof x === 'string' ? x : 'x', read: resolveAccessor<any>(x) });
  if (y) columns.push({ label: typeof y === 'string' ? y : 'y', read: resolveAccessor<any>(y) });
  if (columns.length > 0) return columns;

  const first = $store.filteredData[0];
  if (first !== null && typeof first === 'object') {
    return Object.keys(first as object).map((key) => ({
      label: key,
      read: (row: any) => row?.[key]
    }));
  }
  return [{ label: 'Value', read: (row: any) => row }];
});

const tableRows = $derived($store.filteredData.slice(0, MAX_TABLE_ROWS));

const tableCaption = $derived(
  shownCount > MAX_TABLE_ROWS
    ? `Chart data: first ${MAX_TABLE_ROWS} of ${shownCount} rows.`
    : `Chart data: ${shownCount} rows.`
);
</script>

<!--
  `role="application"` replaces the `role="img"` this container used to carry.
  That was a false statement, not merely an incomplete one: it told assistive
  technology the subtree was a static graphic while the chart supported brush
  selection and zoom, so a user was told there was nothing here to operate and
  had no reason to go looking. `application` is the honest role for a widget
  that consumes its own arrow keys, and it avoids adding a landmark per chart
  the way `role="region"` would. `aria-roledescription` keeps the announcement
  meaningful rather than the bare word "application".

  Svelte's a11y rules do not treat `application` as interactive, so a focusable
  container with a key handler trips both of the rules below. Removing either
  would delete the keyboard path rather than improve it — the same trade-off,
  and the same two ignores, as `Carousel` in core.
-->
<div
  bind:this={containerElement}
  class="chart-container"
  style:width={width ? `${width}px` : '100%'}
  style:height={height ? `${height}px` : '400px'}
>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="chart-surface"
    role="application"
    aria-roledescription="interactive chart"
    aria-label={`${type} chart showing ${countPhrase}${
      selectedCount > 0 ? `, ${selectedCount} selected` : ''
    }`}
    aria-describedby={summaryId}
    tabindex="0"
    onkeydown={handleKeyDown}
  >
    <ChartPrimitive {store} {config} {plotBuilder} {enableZoom} {enableBrush} />

    <!--
      Where the cursor is. `role="status"` carries an implicit
      `aria-live="polite"`; both are written because the pair is what is
      actually supported across screen readers, and a silent live region would
      make the arrow keys useless rather than merely unannounced.

      Inside the application region on purpose — it describes what the arrow
      keys just did, so it belongs with them.
    -->
    <div class="sr-only" role="status" aria-live="polite">{focusAnnouncement}</div>
  </div>

  <!--
    Everything below is *outside* the `role="application"` element, and that is
    the whole reason this component has two nested divs rather than one.
    `application` tells a screen reader to stop browsing and pass keys through,
    which is right for the plot and exactly wrong for a table someone needs to
    read row by row. A data table inside the application region would be
    technically present and practically unreachable.
  -->

  <!-- Screen reader summary -->
  <div id={summaryId} class="sr-only">{summaryText}</div>

  <!-- The data, for anyone who cannot read a picture of it. -->
  <table class="sr-only">
    <caption>{tableCaption}</caption>
    <thead>
      <tr>
        <th scope="col">#</th>
        {#each tableColumns as column}
          <th scope="col">{column.label}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each tableRows as row, index}
        <tr>
          <th scope="row">{index + 1}</th>
          {#each tableColumns as column}
            <td>{column.read(row)}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .chart-container {
    position: relative;
    overflow: hidden;
  }

  /*
    The chart is focusable, so its focus must be visible — otherwise a sighted
    keyboard user cannot tell which chart on the page is receiving their arrow
    keys. `:focus-visible` rather than `:focus` so a mouse click does not draw
    a ring nobody asked for.

    Deliberately a static end state with no transition. `guides/ANIMATION-GUIDELINES.md`
    prohibits transitions driven by a pseudo-class, and
    `tests/repo/animation-policy.test.ts` enforces it across `packages/`.
  */
  /*
    The interactive surface fills the container, so the plot keeps the size the
    ResizeObserver measured on the parent.
  */
  .chart-surface {
    width: 100%;
    height: 100%;
  }

  .chart-surface:focus-visible {
    outline: 2px solid currentColor;
    /* Inset rather than outside: `.chart-container` clips overflow, so an
       outward offset would be cut off on all four sides. */
    outline-offset: -2px;
  }

  /* Screen reader only content */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>
