# Changelog

All notable changes to `@composable-svelte/charts` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

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
