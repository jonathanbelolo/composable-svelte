# Changelog

All notable changes to `@composable-svelte/graphics` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**Scope note (through 0.3.0).** `engine: 'webgpu'` is an accepted option that runs WebGL. From 0.4.0, real
WebGPU is available on explicit request with `new BabylonAdapter({ renderer: 'webgpu' })` (Babylon.js `WebGPUEngine`).
See the README.

## [0.4.0] - 2026-09-27

Requires `@composable-svelte/core` `^0.14.0` and Svelte `^5.20.0` as peers.

### Added

- `graphicsVisualProvider()` and its types (`RenderAuthority`, `GraphicsVisualProvider`, `GraphicsRepresentation`, `GraphicsRepresentationContext`, `GraphicsRetainedRenderer`).
  - A scene keeps rendering past its retirement during core 0.14 fluid motion (`fluidMotion`).
  - The retained surface is owned and disposed with the representation.
- Explicit WebGPU: `new BabylonAdapter({ renderer: 'webgpu' })` with `BabylonAdapterOptions`, using Babylon.js `WebGPUEngine` loaded on demand.
  - WebGL remains the default.
  - `activeRenderer` reports `'webgpu'` only when this path is taken (the scope note below applies through 0.3.0).
- `<Scene>` `label` prop: the canvas's accessible name, with `role="img"`.
- Document-order canvas focus.

### Known limits

- **Mount cost depends on the WebGL backend (WebGL figures).**
  - On hardware WebGL (ANGLE Metal, M3 Max, with parallel shader compilation) a `<Scene>` mount took about 25–35 ms cold and about 15 ms warm, with no long task in the measured after-change runs.
  - Under software WebGL (headless Chromium's default SwiftShader, without `KHR_parallel_shader_compile`), each mount shows one ~150 ms long task. The fluid-motion reference study measured ~150–157 ms per destination `Scene` mount there.
  - WebGPU mounts were not timed. Other GPUs were not measured. See the README's performance section.

## [0.3.0] - 2026-09-26

### Added

- `Scene`, `Camera`, `Mesh`, and `Light` accept narrow structural `GraphicsStore` bindings (`Pick<ChildView<GraphicsState, GraphicsAction>, 'state' | 'dispatch' | 'subscribe'>`), enabling native companion integration with `@composable-svelte/core/application` (`defineViews`, `FeatureViews`, `FeatureOutlet`) while continuing to accept standalone Stores.
- `GraphicsAdapter` interface exported from `@composable-svelte/graphics` with required asynchronous `initialize(canvas)` and `dispose()` lifecycle methods. `<Scene createAdapter={() => new CustomAdapter()}>` owns one newly created adapter per attachment, including retirement and remount.
- `WebGLOverlay` accepts an `owner` prop implementing structural subscription. Exported `attachOverlayToOwner(overlay, owner)` utility for programmatic attachment.
- The managed overlay lifetime prop is named `owner`; a draft `store` alias was removed before release to keep one public lifetime input.
- Managed owner retirement releases an initialized graphics adapter promptly before DOM unmount, waits for pending initialization before disposing late engines exactly once, and suppresses late callbacks or state delivery to retired views.
- Real WebGL2 Chromium browser tests covering sibling engine isolation, sibling RAF continuation, WebGL context loss and restore, Babylon texture disposal during retirement, and managed Scene lifecycle.
- Installed consumer fixture in `fixtures/installed-consumer` exercising `ComponentProps` for all five public graphics components and a real `defineViews` / `FeatureOutlet` recipe.

### Changed

- Animation timing is anchored by the first `tick`, making `startAnimation` reduction deterministic. `AnimationState.startTime` is now `number | null`; consumers inspecting it must handle the pending state. Existing numeric timestamps retain their meaning.
- Requires `@composable-svelte/core` `^0.13.1` and Svelte `^5.20.0` as peers.
- `RenderLoop.destroy()` is terminal: a later `start()` throws, while `stop()` still allows restart and resets FPS sampling.

### Fixed

- Shader presets preserve source alpha for glitch/chromatic effects, guard ripple centers against NaN, and reset the fullscreen quad between bounded draws.
- `UpdateScheduler` replaces an existing registration with the same id; `PositionTracker` follows capture-phase scroll and window resize.
- `getContext()` returns the restored context manager's context, `BabylonAdapter.resize()` refreshes orthographic bounds, and WebGL2 capability probing releases its temporary context.

## [0.2.1] - 2026-09-18

### Fixed

- Correct public repository and documentation links for external consumers.
- Make the mesh test self-contained and executable.
- Verify packaged README examples in an isolated npm consumer before release.


## [0.2.0] - 2026-09-18

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
