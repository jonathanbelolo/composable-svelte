# Changelog

All notable changes to `@composable-svelte/maps` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Scope note.** This package is mid-phase: Phase 12B is complete and Phase 12C
has one of six features built. 3D buildings, marker clustering, geocoding,
drawing tools and routing are not implemented. See the README.

## [Unreleased]

### Changed

- Requires `@composable-svelte/core` `^0.12.0` (peer range): core 0.12.0 is a minor release with breaking changes to the navigation DSL's action shape, the API client's dedup/cache, the WebSocket config, `renderToHTML` and `TestStore`; see core's changelog.
- **Components follow core's theme.** Colours in `TileProviderControl` and
  `MapPrimitive` now read `hsl(var(--token, <the colour they were>))`, so the
  fallback keeps today's appearance for an app that does not import core's
  stylesheet while one that does restyles them with the rest of the UI.

## [0.1.3] - 2026-08-30

### Changed

- **BREAKING: three entry points are published, not the whole build tree.** The
  `exports` map carried a `"./*"` wildcard, so every internal module was a
  supported entry point.
- **BREAKING: a real Mapbox adapter, opt-in and behind its own entry point.**
  `mapbox-gl` moved from an `optionalDependency` — which npm installs by default,
  so every consumer received 58 MB of an SDK nothing imported — to an optional
  peer.
- **BREAKING: the tile provider that could not load is gone**, along with a
  second that was never a provider at all.
- **BREAKING: every optional prop accepts `undefined`**, so these components can
  be wrapped under `exactOptionalPropertyTypes`.

### Added

- The caller can supply the map adapter, and the style URL stays derived from
  the tile provider.

## [0.1.2] - 2026-08-18

Toolchain alignment across the monorepo.

## [0.1.1] and earlier

Predates this changelog. `0.1.0`–`0.1.2` are on npm; their history is in the
commit log.
