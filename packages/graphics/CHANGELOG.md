# Changelog

All notable changes to `@composable-svelte/graphics` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Scope note.** `engine: 'webgpu'` is an accepted option that runs WebGL. Real
WebGPU is `WebGPUEngine` with its own async initialisation, and it is not built.
See the README.

## [Unreleased]

### Changed

- Requires `@composable-svelte/core` `^0.12.0` (peer range): core 0.12.0 is a minor release with breaking changes to the navigation DSL's action shape, the API client's dedup/cache, the WebSocket config, `renderToHTML` and `TestStore`; see core's changelog.
- **Components follow core's theme**, reading `hsl(var(--token, …))` with the
  current colour as the fallback.

### Fixed

- **Memory pressure is announced when it worsens**, not on every allocation, and
  a sustained slump is reported once rather than once a second — the console
  flood is now bounded by a test across real frames.
- The console-quiet guard is deterministic rather than wall-clock.

## [0.1.2] - 2026-08-26

### Changed

- **BREAKING: the overlay claims only what the reducer accepted**, and scaling
  applies everywhere rather than on one path.
- **BREAKING: registrations are deferred during a context loss**, and every
  refusal is reported rather than some being dropped silently.
- **BREAKING: `<Light>`'s props are discriminated**, and a direction is called a
  direction.
- **BREAKING: `CustomShaderMaterial` is removed** — it had been dropped in
  silence and reached nothing.
- **BREAKING: the test harness sees its arguments**, and releases the context
  again between cases.

### Fixed

- Every scaled texture gets pixels, and a refusal is no longer retried forever.
- The deferred registration path delivers what the immediate one does.
- The memory budget settles after the upload rather than before it.

## [0.1.1] - 2026-08-18

Toolchain alignment across the monorepo.

## [0.1.0] and earlier

Predates this changelog. `0.1.0`–`0.1.1` are on npm; their history is in the
commit log.
