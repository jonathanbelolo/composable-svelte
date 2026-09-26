# Changelog

All notable changes to `@composable-svelte/charts` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-09-26

The explicit row typing change and core peer bump are breaking for some 0.2.x consumers.

### Added

- **Managed Companion Support**: `Chart` and `ChartPrimitive` accept narrow structural `ChartStore<TRow>` (`Pick<ChildView<ChartState<TRow>, ChartAction<TRow>>, 'state' | 'dispatch' | 'subscribe'>`), enabling direct use with `@composable-svelte/core/application` managed views (`defineViews`, `FeatureViews`, `FeatureOutlet`) alongside standalone `Store`.
- **Generic Row Typing**: `chartReducer<Row>`, `Chart`, `ChartPrimitive`, `ChartConfig`, and `ChartAccessor` preserve explicitly supplied row types in actions, known property keys, and selection callbacks. Unparameterized reducers use an `unknown` row compatibility mode.
- **SSR Rendering**: Components safely render server-side in Svelte 5 SSR environments without calling browser DOM/animation APIs.

### Changed

- **BREAKING**: A store assembled with an unparameterized `chartReducer` now has `unknown` rows. Instantiate `chartReducer<Row>` for typed `Chart<Row>` callbacks and strict row actions; update existing stores that relied on the previous `any` base.
- **Prompt Retirement Lifecycle**: `Chart` and `ChartPrimitive` guard against terminal `undefined` from retired child views. Promptly cancels active animation RAF, detaches d3 zoom and brush event listeners, disconnects `ResizeObserver`, and clears pending SVG attachment timers upon owner retirement before DOM unmount. Subsequent DOM unmount is idempotent.
- `ChartPrimitive` rebinds when its `store` prop changes; callbacks from the predecessor cannot retire or redraw its successor.
- `ChartPrimitive` builds one Plot at mount and one per later dispatch or prop change; the initial prop effect no longer repeats the first build.
- Peer ranges now require `@composable-svelte/core` `^0.13.1` and Svelte `^5.20.0` for managed view binding.
- A direct `zoom` action clears any active animation target before applying its transform.
- Selection and focus marks use default `x`/`y` axes when the chart config leaves them out, matching the rendered plot.
- `barCategoryOrder` can preserve input order or use Plot's automatic category order. `resolveAccessor` returns a primitive datum itself when no property lookup applies.
- The package Vite configuration now delegates to its Vitest configuration; library output is produced by `svelte-package`.

### Fixed

- `binData` now retains maximum and constant values, skips non-finite input before deriving the domain, and uses D3's actual assignments for fractional boundaries. Corrected output can contain more rows than earlier releases that dropped maximum values.

## [0.2.1] - 2026-09-18

### Fixed

- Correct public repository and documentation links for external consumers.
- Make the selection test self-contained and executable.
- Verify packaged README examples in an isolated npm consumer before release.


## [0.2.0] - 2026-09-18

### Changed

- Requires `@composable-svelte/core` `^0.12.0` (peer range): core 0.12.0 is a minor release with breaking changes to the navigation DSL's action shape, the API client's dedup/cache, the WebSocket config, `renderToHTML` and `TestStore`; see core's changelog.
- **Components follow core's theme.** The one hardcoded colour left in
  `ChartPrimitive` now reads `hsl(var(--muted-foreground, …))`, so it moves with
  the rest of the UI when a consumer overrides the token. Data-series palettes
  are deliberately untouched: a series colour is not a theme colour.

## [0.1.3] - 2026-08-30

### Changed

- **BREAKING: the barrel is the package.** The `exports` map carried
  `"./*": "./dist/*.js"`, which made every internal module a supported entry
  point. It now names its entry points, so anything reached by a deep path is no
  longer public API.
- **BREAKING: a brush selects the points it caught, not the span.** Selection
  returned everything within the brushed rectangle's bounds rather than the
  points actually inside it, so a selection could include points the user never
  covered — and deleting a selection removed points that were never in it.
- **BREAKING: every optional prop accepts `undefined`**, so a consumer
  forwarding its own props under `exactOptionalPropertyTypes` can wrap these
  components. See `@composable-svelte/core`'s entry for the full account.

### Added

- **A keyboard cursor, in the reducer** — chart navigation is state, not a DOM
  side effect, so it is testable and works on every chart type. The cursor
  position is announced, and the chart describes itself with counts that agree
  with what is drawn.
- **A data table rendered alongside every chart**, for anyone who cannot see it.
- Panning, and an AA colour review of the palette.

## [0.1.2] - 2026-08-18

Toolchain alignment across the monorepo.

## [0.1.1] and earlier

Predates this changelog. `0.1.0`–`0.1.1` are on npm; their history is in the
commit log.
