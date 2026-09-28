# Horizon Gallery — fluid layout motion reference

An architecture-archive gallery that exercises fluid layout motion end to end. It is built only on public entries:
`@composable-svelte/core` (`/`, `/application`, `/application/motion`) and `@composable-svelte/graphics`. It covers the four reference
scenarios in [`specs/frontend/fluid-layout-motion-design.md`](../../specs/frontend/fluid-layout-motion-design.md).

**Status:** implemented and accepted with the fluid-motion feature. It uses APIs introduced in core 0.14.0 and graphics 0.4.0, and in this repository it runs against the workspace builds (`workspace:*`). The final
integration run is 42/42 browser tests and 3/3 SSR, on the final core and graphics builds. See the [acceptance README](../../docs/development/fluid-motion/README.md) and the
[reference integration report](../../docs/development/fluid-motion/remaining-reference-integration-report.md).

| Scenario | Where | Public API |
| --- | --- | --- |
| The title plate moves from `main` (home) into the dossier `header`. The route commits mid-flight at 280 ms, and the introduction slides and fades in while the plate still moves. | "Read the retrospective dossier" / "← Catalogue" | `useStagedRoute().request(intent, { motion })`, shared `path`, incoming `slide` + `opacity` |
| The card expands through a viewport-relative half-page pose into the real study (zoom, overlays, notes, save). Closing it is a separate request that recontracts through a smaller pose. | "Open study" / "Back to the catalogue" | viewport `Pose`, `radius`, study state in the `study` page reducer |
| Whole-layout reconfiguration: the reading list takes the main column, the catalogue contracts to a side column, the title compacts, and text leaves and enters, each on its own timing. | "Reading room" / "Back to gallery" | `useLayoutChoreography().transition(plan, () => dispatch(...))` |
| Within-page card expansion and recontraction into a new grid slot, plus category filtering. | "Feature first", category buttons | same |
| Stacked overlays: the card flies into the modal's hero plate and back, with the backdrop and content on the same timeline. Close is an explicit `transition()` entry: its quicker plan applies only when the dismiss is accepted. With unsaved notes, close is refused and a nested discard alert opens. Save & Close awaits the save. Only after it succeeds does the view commit the close, synchronously, through the same explicit entry; notes typed during the save keep the modal open. A failed save keeps the draft and shows the error. There is also a technical specifications drawer. While an overlay is open, the page catalogue rests dimmed and slightly contracted (modal) or pushed aside (drawer). These are `lifetime: 'overlay'` page reactions; the close returns the catalogue from its displayed rest, and reduced motion reaches the same pose immediately. | "Curator Specs", "Technical Archive" | `useOverlayMotion(overlay => ({ open, close }))`, `handle.transition(plan, commit)`, `scopeTo()`, managed `Modal`, `Alert`, `Drawer` |

**Rich content, unmodified for capture.**
- Participants use ordinary web content: flex and grid layout, gradients, `::before` ribbons, transforms and `clip-path`.
- Inline SVG artwork ([`PavilionArtwork.svelte`](./src/PavilionArtwork.svelte)).
- A first-party graphics `<Scene>` (Babylon.js, **WebGL**, the default engine) rendering one root-owned pavilion model on the home card and in
  the study ([`PavilionModel.svelte`](./src/PavilionModel.svelte), [`Turntable.svelte`](./src/Turntable.svelte)). The canvas is a real orbit control named "Pavilion model — drag or use arrow keys to orbit".
- A muted local video loop ([`public/media/airflow-study.webm`](./public/media/airflow-study.webm), generated with ffmpeg, seed 804) in the dossier.

The app declares `visual: fluidMotion({ providers: [graphicsVisualProvider()] })`.

**Explicit continuation.** The turntable's playback lives in `AppState.scene` (a root slot running `graphicsReducer`). The dossier loop's playback
lives in dossier state. The framework never seeds a destination.

**Lingering copies.** Two leaving participants deliberately linger unfaded after the commit, so their live copies can be seen:
- home → dossier: the pavilion figure (artwork and model) holds until 700 ms; the catalogue itself is not animated;
- dossier → home: the airflow video frame holds until 780 ms.

**Reduce motion** (header checkbox, root state):
- Route plans drop every geometry track and keep a 160 ms fade.
- Layout changes commit without a transition.
- The SVG shimmer pauses.
- Turning it on while on the dossier pauses the airflow loop in state (the visitor can still press Play).
- The turntable only turns when the visitor starts it.
- The OS setting is honoured by the framework itself.

**Scroll and focus.**
- The reading list's scroll position is framework-owned (`routing.scroll.containers`).
- The study's Back control sits in a positioned `nav` outside the shared study surface, so moving decoration never paints over it or
  its focus ring.

## Commands (from this directory)

```sh
pnpm dev            # http://localhost:5173
pnpm build          # production build
pnpm check          # svelte-check --fail-on-warnings
pnpm typecheck      # tsc --noEmit
pnpm test           # Node SSR (3) then the Chromium browser suite (42)
pnpm test:ssr       # SSR only; UPDATE_REFERENCE_SSR_FIXTURE=1 regenerates tests/fixtures/ssr-home.html
pnpm test:browser   # browser suite only
```

- The example consumes the **built** packages (`packages/core/dist`, `packages/graphics/dist`). Rebuild them before testing runtime changes
  (`pnpm --filter @composable-svelte/core build`, `pnpm --filter @composable-svelte/graphics build`).
- Install the Playwright Chromium browser first.
- The browser suite runs files one at a time (`fileParallelism: false`), because its timing windows and screenshot pixels would otherwise be
  contaminated by other files' GPU work.
- It writes measurements and screenshots under `docs/development/fluid-motion/reference-evidence/rich-representation/`: `rich-evidence.json`,
  screenshots, and `scenarios/` for the scenario suite. This generated evidence is local and not committed (see the acceptance README's
  evidence-retention section). Reruns do not reproduce historical measurements exactly.

**Browser suites** ([`tests/`](./tests/)):

| File | Covers |
| --- | --- |
| `domain` | Reducers and plan data |
| `overlay.domain` | Overlay lifecycles, unsaved-change refusal, async save with failure, edits during the save and a save arriving after discard, and choreography plans |
| `entry` | Direct-load initialization |
| `focus` | The Back control and its focus ring in front of decoration, with composited-pixel positive and negative controls |
| `hydration` | Adoption of SSR markup |
| `reference` | The four scenarios: protocol results, history, retirement, scroll, resize, late geometry, reduced motion, teardown |
| `rich` | Rich participants, live WebGL and video continuity after the commit, interruption, teardown ledgers, reduced motion, responsiveness |
| `overlay.browser` | Trusted input with motion witnesses: mid-flight backdrop/content paint; card→hero flight frames and settle reasons; explicit Close versus default timing; a refused close drives nothing; hit-test stacking of the nested alert; nested Escape and outside click; reduced motion with no geometry frames; drawer; focus restoration; scroll lock |

## Limits (as measured)

- **Chromium only:** headless Playwright Chromium 141 on one Apple silicon Mac. Firefox and WebKit were not run.
- **Software WebGL in tests.** Headless Chromium renders WebGL through software (SwiftShader). There, each destination `<Scene>` mount shows one
  ~145–160 ms main-thread long task. Treat that as a software-rendering figure, not a hardware one; see "What it costs" in the
  [graphics README](../../packages/graphics/README.md).
- **Screenshot-based witnesses** (live video, leaving WebGL copy, focus ring) depend on screenshot latency (~100–300 ms). Each checks its sampling
  preconditions and retries an invalid sample at most 3 times. Every attempt is recorded, and pixel assertions are never retried.
- **WebGPU is not exercised here.** It is qualified separately in the graphics package
  ([`graphics.webgpu.browser.config.ts`](../../packages/graphics/graphics.webgpu.browser.config.ts)).

## Test-only seams

These are for the tests only; none of them is used by the product.
- `App.svelte`'s `onApp` prop (rendered through `Observe.svelte`) hands the application instance to tests.
- `dependencies.trace` records domain action types; `dependencies.sceneTrace` records scene actions separately (the turntable ticks every frame).
- `tests/support/observe.ts` reads the framework's internal diagnostics (`routeHostFor`, `getApplicationInternal`) from the built modules, and
  wraps and exactly restores `history.pushState`/`replaceState`.
- `tests/rich.browser.test.ts` reads the graphics provider's resource ledger (`graphicsRepresentationResources`) from the built module.
- `vitest.browser.config.ts` pre-bundles two Babylon modules through `@composable-svelte/graphics`, so the test dev server does not reload mid-run.
