# Representation provider interface (published for adapter owners)

Status: **candidate public, stable for parallel work**. Revision 2026-09-27 14:10Z: see §6 (warm cache, stack reconstruction, failure disposal, media alignment). Earlier revision 13:40Z: §4 describes the implemented behavior. Only additive public changes: `useParticipant()` also accepts SVG elements; `VisualDiagnostic` `preparation` carries `readinessPending`. Owner: Opus core implementation (session `91bd68c8`). Source of truth for the types is `packages/core/src/lib/application/renderer/representation/types.ts`. They are exported as types from `@composable-svelte/core/application/motion`, and `fluidMotion()` is exported from the same subpath. Any change to a signature here is announced to Sol before it lands.

## 1. How an application declares motion

**Ordinary motion needs no new code.**
- `defineChoreography(...)` plans, `useParticipant()`, `useStagedRoute().request(intent, { motion: plan })` and `useLayoutChoreography().transition(plan, commit)` work as before.
- A plan created by `defineChoreography` carries the choreography engine *as data*, so passing a plan is what brings the engine in. There is no global registration and no import side effect.
- An application that never creates a plan never reaches the engine, the projection or the providers. That is the motion-free Host.
- Ordinary HTML/SVG content needs **no provider**. The built-in structural projection and the built-in canvas/video/image providers handle it.

**Configuration is optional, per application, and declarative:**

```ts
import { defineApplication } from '@composable-svelte/core/application';
import { fluidMotion } from '@composable-svelte/core/application/motion';
import { sceneVisualProvider } from '@composable-svelte/graphics'; // example: adapter-owned provider

export const application = defineApplication(composition, {
  initialState, routing,
  visual: fluidMotion({
    providers: [sceneVisualProvider()],   // consulted before built-ins, in order
    preparationBudgetMs: 250,             // default for plans that do not declare one (16–5000)
    nativeSnapshot: 'off',                // 'namedParticipants' opts into the native View Transition provider
    onDiagnostic: event => {}             // public VisualDiagnostic stream (optional)
  })
});
```

- `defineChoreography({ ..., preparationBudgetMs? })` may declare a per-plan preparation budget. The precedence is plan, then application `visual`, then 250 ms.
- `visual` is accepted by both routed and unrouted definitions. Without `visual`, a plan's own engine uses the built-in providers and the default budget.

## 2. Provider contract (`RepresentationProvider`)

```ts
interface RepresentationProvider {
  readonly name: string;   // lowercase, unique within one configuration
  represent(source: Element, context: RepresentationContext):
    ProvidedRepresentation | RepresentationDecline | undefined;
}
```

**When and how it is called.**
- The Host's batched **read phase** calls `represent` during preparation or recapture. It is called for the participant root **and for every element inside it**, before the structural projection handles that element.
- A provider normally recognizes its own elements, for example a canvas it rendered into. It keeps a `WeakMap` from element to renderer, maintained by its own component (see §5).

**Return values.**
- `undefined`: not mine. The next provider is consulted, and finally the built-ins.
- `{ declined: reason }`: mine, but not representable now. It is reported, and the next provider is consulted.
- A `ProvidedRepresentation`: the framework places `node` at the source element's border box inside the participant's representation. For a root, that is the whole representation. For a descendant, it takes the descendant's place inside the projected copy. The framework applies clipping, opacity, geometry tracks and `inert`/`aria-hidden`.

**Restrictions.**
- `represent` must be synchronous and read-only on the source. It must not mutate the source, its styles or its animations.
- It must not dispatch, navigate, focus, add listeners to page content or start business work.

## 3. Representation lifecycle

```ts
interface ProvidedRepresentation {
  readonly node: HTMLElement;
  readonly continuity: 'static' | 'live' | 'retained';
  readonly ready?: Promise<void>;
  frame?(time: number): void;
  retire?(): RetainedRenderer | void;
  dispose(): void;
}
interface RetainedRenderer { frame?(time: number): void; dispose(): void; }
```

| Checkpoint | Framework guarantee |
|---|---|
| Preparation (route runs) | `represent` is called in a read slice. Preparation is chunked across frames within the plan's budget. `ready` is **observed, not awaited**: it never holds t0 or the cue. Rejections are reported (`readyFailed`), including from nested same-origin frames. Within-page runs prepare synchronously before the explicit commit, so a provider must return a usable node immediately there. |
| Every frame while the run is active | `frame(time)` is called in the write phase. `time` is the Host clock. |
| `beforeRemoval` (route commit removes the source's page; same frame as DOM removal; within-page removal too) | `retire()` is called once. Returning a `RetainedRenderer` transfers render authority to the visual run, whose `frame` is then called each frame. Returning nothing keeps the last frame; for `live` continuity that is reported as `liveEndedAtRetirement`. The feature's store/dispatch is already retired and must not be retained through closures. |
| Supersession | A successor run **adopts** shared representations together with their provider objects. `frame`/`retire`/`dispose` continue on the same objects, so there is no second representation and no restart. Representations that aren't adopted are disposed. |
| Settle, Host teardown, reduced-motion change, provider throw | `dispose()` is called exactly once, on the `RetainedRenderer` if there is one, otherwise on the representation. `context.signal` is per provided representation and aborts when that representation is disposed. A provider whose `frame` throws is reported and **disposed at the failure**, and its last painted node stays. A failure in `represent`, `retire` or `ready` is reported (`representFailed`, `retireFailed`, `readyFailed`) and never escapes as an unhandled rejection. The commit and semantics are unaffected. |

**Resources.**
- A provider owns what it creates and releases it in `dispose`.
- The Host resource ledger counts representations, retained renderers, mirrors and players. Tests assert zero after settle.

## 4. Built-in behavior (core; no app code)

- **Structural projection** (the default for every element no provider handles):
  - every computed longhand inlined in light DOM. Document rules cannot restyle the copy, because inline values win and CSS animations/transitions are disabled on copies. Native controls (`input`, `select`, `button`…) get only the values that differ from a default control of their kind, which preserves native appearance.
  - A closed shadow root was probed (P7) and set aside: it hid the copy from existing semantic-exposure witnesses.
  - materialized `::before`/`::after`, open shadow roots flattened through slots, and custom elements copied as neutral elements;
  - SVG copied by attribute with representation-scoped IDs. Everything inside resource elements (`defs`, gradients, `symbol`, `clipPath`, `mask`, `pattern`, `marker`, `filter`) stays attribute-only.
  - the ancestor clip chain;
  - CSS/WAAPI animations with explicit keyframes replayed in phase **without touching the source**. Other animations track the source live while it exists; after retirement they are reported as `animationFrozen` (open work, not claimed as live).
- **`<canvas>` (2D/WebGL)**: a live mirror through `captureStream()` (automatic frame acquisition; no preserved buffer or app hook needed). A drawn underlay covers the first frame. When there's no stream (tainted), a 2D source is copied each frame. After retirement, frames continue only if something still draws. The framework reports `canvasRetiredWithoutRenderer` unless a provider retains render authority.
- **`<video>`**:
  - **URL sources, including `blob:`** (http(s), data, file Blob): a muted, inert decorative player seeded to the source's time, rate and paused state, drift-corrected, shown live and continuing after retirement until disposal.
  - **MediaSource object URLs:** these can't attach to a second player. The attempt fails with `videoPlayerFailed`, the player is released at the failure, and a static current-frame underlay remains.
  - **`srcObject` and encrypted media:** declined as `videoSourceUnqualified:*`.
  - Audio is never duplicated.
- **`<img>`/`<picture>`**: same `currentSrc`, decoded within readiness.
- **`<iframe>`**: same-origin documents are projected, with the document scroll offset applied. Cross-origin frames are declined as `crossOriginFrame`. The copy shows the frame's own box paint (background, border, radius), reported as `unrepresented:iframe`.
- **`nativeSnapshot: 'namedParticipants'`** (opt-in, route runs) is implemented. For content the projection can't reach (cross-origin iframes such as `VideoEmbed` embeds):
  - **At the cue:** only those elements are named. The document root is excluded and the overlay is non-interactive, so real controls stay usable. The route commit runs inside the view transition's update callback.
  - **After the commit:** the browser's static old-state image is driven every frame to follow the element's representation (geometry and opacity).
  - **Supersession and settle:** a successor adopts the session. It is released at settle, host teardown or failure.
  - **Reported:** `representation` provider `native` with reason `nativeSnapshotAtCue`, `nativeSnapshotUnavailable:api` (no API, e.g. Firefox 142 here) or `nativeSnapshotUnavailable:withinPage` (immediate commits can't be wrapped). `nativeSnapshotEndedByNewTransition` is reported when another view transition ends it.
- **Transformed spaces:** any 2D affine accumulation (rotation, skew, scale, including the individual `rotate`/`scale` properties) is represented with its exact matrix. Outgoing copies are placed at their painted bounds. Shared copies keep their content matrix inside the moving box. Only perspective/3D (non-affine) spaces are unsupported (`transformed-space:3d`).
- **SVG participants:** an inline `<svg>` or an SVG element can itself be a participant.
- **Readiness** (media decode, first mirror frame) never holds t0 or the cue. Underlays show until live frames arrive, and the pending count is reported in the `preparation` diagnostic.
- **Animations** (never mutating the source):
  - CSS animations and transitions replay exactly. Engines expose their implicit keyframes (P8).
  - Script-created WAAPI animations with implicit keyframes are followed live. At retirement they're reconstructed from samples: analytically for numbers, px and rgb colours; by verified hypothesis for transforms and other non-scalar values (`none`/`initial` evaluated at the sampled progress, exact match only); one replace-composited animation per property and keep running on the copy (`animationReconstructed`).
  - Anything unsolvable is reported as `animationFrozen:<properties>`, which is open work, not success.
- **Nested participants** are layout-preserving placeholders in ancestor copies: box only, no content, no providers. Ancestors animated by the same run are not applied a second time to a nested participant's copy.

## 5. Retained rendering for renderer adapters (graphics/media owners)

The pattern for `@composable-svelte/graphics`. It is inside the package, with no app code:
1. The adapter's component registers its canvas in a package-level `WeakMap<HTMLCanvasElement, RendererHandle>` while it is mounted.
2. The package exports `sceneVisualProvider()`. Its `represent(source)` returns `undefined` unless `source` is a registered canvas. Otherwise it returns `{ node: mirror, continuity: 'retained', frame, retire, dispose }`, where `mirror` is a `<video>` fed by `canvas.captureStream()` or a 2D canvas it copies into right after its own render.
3. `retire()` marks the handle *retained* and returns a `RetainedRenderer` that keeps the engine's render loop drawing **visual progression only**: the engine clock, camera and animation groups. There are no reducer ticks and no store subscription. The component's own teardown sees the retained flag and leaves disposal of the engine and context to `RetainedRenderer.dispose()`.
4. **Business-driven scene changes** (reducer ticks) stop at retirement by design. A destination that should continue the same scene state gets that state explicitly through application state. The framework never seeds destination business state.
5. **Context loss** during retention: stop drawing, keep the last frame, and call `context.diagnose('contextLost')`. `dispose` still runs.

Unknown third-party renderers without a provider get the built-in canvas mirror (live until their own loop stops). This is an integration gap addressed by writing a provider, not a platform impossibility.

## 6. Revision 14:10Z additions (behavior; no signature change)

- **Warm preparation reuse.** Registered participants are projected in idle time (≤ 8 ms slices) once an engine is known. Preparation reuses a warm copy only while it is valid; the `preparation` diagnostic's `cached`/`projected` fields report which.
  - **Bounds:** 64 registered entries, 24 templates and 12,000 template elements, least recently used first. Entries are dropped, and their scheduled idle work cancelled, on unregister or Host teardown.
  - **Use:** a template is never used for live/replaced content or with custom providers. Form state and sticky/fixed placement are re-synchronized from the live source, and pending mutations and stylesheet changes are drained or checked synchronously first.
  - **Invalidated by:** a subtree mutation, an ancestor attribute change, viewport resize, font load, colour-scheme change, or scroll/input inside the participant.
  - **Checked at use:** pseudo-class state (`:hover`, `:focus`, `:focus-visible`, `:active`, `:focus-within`) and size.
  - **Never cached:** animated subtrees, provider/live content, SVG IDs and nested placeholders are always projected fresh.
- **Animation stack continuation.** For animations not exactly replayable, the element's own stack is replayed on the copy: original keyframes, composite and iteration-composite modes, per-keyframe easing and timing.
  - The unknown underlying value is solved (scalars) or verified (`none`/`initial`/an unanimated clone of ours).
  - The result must explain two samples at distinct times, within the value change of ±1 ms of animation time, allowing a bounded constant engine time offset.
  - Paused and finished states are preserved.
  - Anything unexplained is `animationFrozen:<properties>:<reasons>`.
- **Positioning.** Sticky and fixed descendants keep their painted positions. Positioned participant roots clear physical and logical insets.
- **Shadow roots.** A defined custom element with no reachable (open) shadow root is reported as `closedShadowSuspected:<tag>` and added to native-snapshot candidates for opted-in routes.
- **SVG graphic participants** (`<g>` and similar) are placed in an SVG viewport mapped through their screen CTM, with the owner's `defs`. `copyRoot` is the participant's own copy.
- **Form controls.** Checkboxes and radios copy checked and indeterminate state. Selected file inputs are never assigned (`fileInputSelectionUnrepresented`).
- **Control paint after the reveal.** A control-bearing outgoing copy plays the remainder of its declared track: it holds until `startMs` when that comes later, then fades to its original end.
