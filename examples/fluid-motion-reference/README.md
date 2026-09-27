# Horizon Gallery — fluid layout motion reference

An architecture-archive gallery built only on public `@composable-svelte/core` entries
(`/`, `/application`, `/application/motion`). It exercises the four reference scenarios in
`specs/frontend/fluid-layout-motion-design.md`:

| Scenario | Where | Public API |
| --- | --- | --- |
| Title plate moves from `main` (home) into the dossier `header`. The route commits mid-flight at 280 ms, and the introduction slides and fades in while the plate still moves. | "Read the retrospective dossier" / "← Catalogue" | `useStagedRoute().request(intent, { motion })`, shared `path`, incoming `slide` + `opacity` |
| The card expands through a viewport-relative half-page pose into the real study (zoom, overlays, notes, save). Closing it is a separate request that recontracts through a smaller pose. | "Open study" / "Back to the catalogue" | viewport `Pose`, `radius`, study state in the `study` page reducer |
| Whole-layout reconfiguration: the reading list takes the main column, the catalogue contracts to a side column, the title compacts, and text leaves and enters, each on its own timing. | "Reading room" / "Back to gallery" | `useLayoutChoreography().transition(plan, () => dispatch(...))` |
| Within-page card expansion and recontraction into a new grid slot, plus category filtering. | "Feature first", category buttons | same |

Reduce motion: the header checkbox is root state. Route plans then drop every geometry track and keep a
160 ms fade. Layout changes commit without a transition. The OS setting is honoured by the framework.
The reading list's scroll position is framework-owned (`routing.scroll.containers`).

Participants use ordinary rich web content, and the app does not restyle anything to suit capture:
- flex and grid layout, gradients, `::before` ribbons, transforms and `clip-path`;
- inline SVG artwork (`PavilionArtwork.svelte`);
- a first-party graphics `Scene` (WebGL) rendering one root-owned pavilion model on the home card and in the study (`PavilionModel.svelte`, `Turntable.svelte`);
- a muted local video loop (`public/media/airflow-study.webm`, generated with ffmpeg, seed 804) in the dossier.

The application declares `visual: fluidMotion({ providers: [graphicsVisualProvider()] })`. Continuation is explicit
application state: the turntable's playback lives in `AppState.scene`, and the dossier loop's playback lives in
dossier state. The framework never seeds a destination.

## Commands (from this directory)

```sh
pnpm dev            # http://localhost:5173
pnpm check          # svelte-check --fail-on-warnings
pnpm typecheck      # tsc --noEmit
pnpm test           # SSR (Node) + domain/browser evidence (Chromium); rich evidence in reference-evidence/rich-representation/
pnpm test:ssr       # UPDATE_REFERENCE_SSR_FIXTURE=1 regenerates tests/fixtures/ssr-home.html
pnpm test:browser
```

The example consumes the built package (`packages/core/dist`); rebuild core before testing runtime
changes. Browser tests write measurements and screenshots to
`docs/development/fluid-motion/reference-evidence/`.

## Test-only seams

- `App.svelte`'s `onApp` prop (rendered through `Observe.svelte`) hands the application instance to tests.
- `dependencies.trace` records root action types.
- `tests/support/observe.ts` reads the framework's internal diagnostics (`routeHostFor`, `getApplicationInternal`) from the built modules.

None of these is used by the product.
