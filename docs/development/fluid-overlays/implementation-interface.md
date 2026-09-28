# Overlay orchestration: implementation interface (core91)

Published 2026-09-27T20:54Z, early, for Sol, S1 (Graphics f29), wrapper/reference/docs authors and reviewers. It is **stable unless amended here**; any amendment is dated. It implements `design.md` §10 (final disposition).

## 1. Public API (`@composable-svelte/core/application/motion`) (amended 20:57Z: acyclic setup, phase-bound selectors)

```ts
/** Bind declarative motion to ONE overlay instance. Call during component initialisation (like useParticipant).
 *  `init` receives the bound overlay reference first, so plans can name overlay participants without reading
 *  anything before initialisation (acyclic). */
export function useOverlayMotion(init?: (overlay: OverlayScopeRef) => OverlayMotionOptions): OverlayMotionHandle;

export interface OverlayMotionOptions {
  /** Default plan for every ACCEPTED open of the bound instance (any cause). */
  readonly open?: ChoreographyPlan | undefined;
  /** Default plan for every ACCEPTED close of the bound instance: Escape, outside click, view.dismiss(),
   *  a reducer action, Browser Back. */
  readonly close?: ChoreographyPlan | undefined;
}

/** Stable reference to the bound overlay instance's participant scope (branded; created by useOverlayMotion). */
export interface OverlayScopeRef {
  /** Exact selector for a participant inside the bound overlay instance. */
  select(key: string): ScopedParticipantSelector;
}

export interface OverlayMotionHandle extends OverlayScopeRef {
  /** Presentation-bound explicit entry. Runs `commit` synchronously (a real API: store.dispatch(...),
   *  view.dismiss(), open = false). If the bound instance's COMMITTED presentation then enters
   *  presenting/dismissing, `plan` replaces that transition's default plan. If not (refused or guarded),
   *  nothing is acquired or superseded. */
  transition(plan: ChoreographyPlan, commit: () => void): void;
}

/** A participant in an explicit scope. A plain string is a key in the plan's default scope (below). */
export interface ScopedParticipantSelector { readonly key: string; readonly scope: OverlayScopeRef }
export type ParticipantSelector = string | ScopedParticipantSelector;
```

**Roles.** A bound instance registers two role participants in its own scope:
- `'backdrop'`: the backdrop element (absent for Popover);
- `'content'`: the content panel.

Any participant **whose node is inside the overlay's content** registers in the **overlay instance scope**, so the same key in the page and in a modal never collides.

*Amended 20:58Z.* This is resolved **at attach, by DOM containment**, not by where `useParticipant()` was initialised. A parent page's `useParticipant()` action used inside `<Modal>`'s children snippet still binds to the modal instance. Each primitive registers its content container, re-created on every open (a new epoch), as the instance scope root. The action looks up the innermost registered root around its node when it attaches. Explicit selectors are unaffected. A public-assembly witness (parent-initialised `useParticipant` used in a Modal snippet) is part of the acceptance tests.

**Default scope.** In an overlay plan, a plain string key means the scope that called `useOverlayMotion`, i.e. its nearest route or shell owner. `overlay.select(key)` means the bound overlay instance.

**Phase binding (shared tracks).**
- `from` resolves in the **source phase**: before the commit for `transition()`, and at the claim for default plans, against the current, pre-change epoch.
- `to` resolves in the **destination phase**: after the committed render, against the **committed** epoch.
- When omitted, both default to `participant`.

**Component props (all optional; existing props unchanged):**
- `motion?: OverlayMotionHandle` on `Modal`, `Sheet`, `Drawer`, `Alert` and `Popover`, their primitives, and `Command` and `ImageLightbox`.
- Without `motion`, or when the application has no motion engine, today's spring path is used unchanged.

**Example: page card → modal hero on open, and back on close:**

```svelte
<script lang="ts">
  import { useOverlayMotion, defineChoreography, useParticipant } from '@composable-svelte/core/application/motion';
  const participant = useParticipant();
  const dialog = useOverlayMotion((overlay) => ({
    open: defineChoreography({ cueMs: 0, durationMs: 420, tracks: [
      { participant: 'card', side: 'shared', from: 'card', to: overlay.select('hero'), startMs: 0, durationMs: 420,
        easing: { cubicBezier: [0.2, 0, 0, 1] } },
      { participant: overlay.select('backdrop'), side: 'incoming', startMs: 0, durationMs: 300, opacity: { from: 0, to: 1 } },
      { participant: overlay.select('content'), side: 'incoming', startMs: 60, durationMs: 360, scale: { from: 0.94, to: 1 } }
    ] }),
    close: defineChoreography({ cueMs: 0, durationMs: 360, tracks: [
      { participant: 'card', side: 'shared', from: overlay.select('hero'), to: 'card', startMs: 0, durationMs: 360 },
      { participant: overlay.select('content'), side: 'outgoing', startMs: 0, durationMs: 240, opacity: { from: 1, to: 0 }, scale: { from: 1, to: 0.96 } },
      { participant: overlay.select('backdrop'), side: 'outgoing', startMs: 60, durationMs: 300, opacity: { from: 1, to: 0 } }
    ] })
  }));
</script>
<div use:participant={{ key: 'card' }}>…</div>
<Modal {store} {presentation} motion={dialog} onPresentationComplete={…} onDismissalComplete={…}>
  <!-- inside the modal content, this registers in the overlay instance scope -->
  <img use:participant={{ key: 'hero' }} … />
</Modal>
```

(`scale` and `cubicBezier` are S1's interface; see §3.)

## 2. Completion and acceptance semantics (normative)

- **Acceptance.** Only a committed presentation status change on the bound instance starts overlay tracks: `presenting` for open, `dismissing` for close. A refused or guarded intent starts nothing, acquires nothing and supersedes nothing.
- **Obligation** `(instance, epoch, 'present' | 'dismiss')`. It is delivered **exactly once** through the component's existing `onPresentationComplete` / `onDismissalComplete` while current.
  - It is **cancelled without dispatch** when superseded by a different status or pair, reopened (a new epoch), retired or destroyed, or when the Host is disposed.
  - Reduced motion, over-budget preparation or engine failure deliver it immediately while current.
- **Supersession.** A later accepted intent supersedes only the conflicting resources and adopts the displayed values. The old run's obsolete obligation is cancelled, and the new transition carries its own.
- **No dual writer.** When a plan claims a transition, the component's spring does not start.

## 3. Plan interface requested from S1 (`plan.ts`, owned by Graphics f29; exact types for Sol, amended 20:57Z)

```ts
// Exported from plan.ts (type-only for the scope brand; the engine supplies the runtime brand check).
export interface OverlayScopeRef { select(key: string): ScopedParticipantSelector }
export interface ScopedParticipantSelector { readonly key: string; readonly scope: OverlayScopeRef }
export type ParticipantSelector = string | ScopedParticipantSelector;

export interface ChoreographyTrack {
  readonly participant: ParticipantSelector;        // was: string
  /** Shared only: source endpoint, resolved in the source phase. Default: `participant`. */
  readonly from?: ParticipantSelector | undefined;
  /** Shared only: destination endpoint, resolved after the committed render. Default: `participant`. */
  readonly to?: ParticipantSelector | undefined;
  // … existing fields, plus S1's slide/scale/easing …
}
```

**Validation (plan.ts):**
- `participant`, `from` and `to` are each a nonempty string, or an object with exactly the keys `{ key, scope }`, where `key` is a nonempty string and `scope` is a non-null object with a `select` function. The brand is verified by the engine at resolution: an unknown scope is reported `unknownScope` for that track.
- `from` and `to` are accepted only when `side === 'shared'`.
- The duplicate-shared check keys on the resolved identity `(scope ?? default, key)` of `participant`, not on the string alone.
- `exactKeys` for a track adds `'from'` and `'to'`.

The channels agreed in `design.md` §7 are unchanged: outgoing `slide`; incoming and outgoing `scale: { from, to }`; `easing` as a keyword, `{ cubicBezier }` or `'cubic-bezier(…)'`; per-waypoint `easing`. No other plan fields are needed by this objective.

## 4. Internal seams (core91 implementation; listed for reviewers)

- **`actions/overlayLayers.ts`** (new):
  - `overlayLayer` action on each primitive's portal wrapper: a coordinator-owned stacking context, `position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 50 + rank`.
  - `layerOf(node)`; `layer.slot('backdrop' | 'content')` for local decoration slots, which are inert, `aria-hidden` and `pointer-events: none`.
  - `nativeSurfaceSlot(node)` for in-surface decoration inside app-authored `dialog:modal` or `:popover-open`.
- **`navigation-components/primitives/overlayMotion.ts`** (new): `claimOverlayTransition({ handle, instance, kind, backdrop, content, complete })` returns `{ cancel(reason) } | undefined`. It is called in each primitive's status effect *before* its spring; `undefined` means the spring path.
- **Engine side** (in `run.ts`/`route-host.ts` after Sol transfers `run.ts`):
  - overlay runs driving live `incoming` and **live `dismissing`** elements;
  - scoped and epoch identity;
  - two-phase acquisition;
  - claim arbitration and supersession-token leases (`target-registry.ts`);
  - removal of the document-wide top-layer guard.

## 5. Files and ownership (to avoid overlap)

**core91:**
- `actions/overlayLayers.ts`;
- `navigation-components/primitives/{Modal,Sheet,Drawer,Alert,Popover}Primitive.svelte`, the matching wrappers' `motion` prop, and `primitives/overlayMotion.ts`;
- `components/command/Command.svelte` and `components/image-gallery/ImageLightbox.svelte` (minimal adapters);
- `application/renderer/choreography/{route-host,participant}.ts` and `target-registry.ts`;
- after transfer, `run.ts`;
- the public export in `motion-public.ts` (after S1's export handoff);
- new tests `tests/fluid-motion/overlay-*.browser.test.ts`.

**Not core91:** `plan.ts`, `channels*.ts`, `hermite.ts` and S1's tests (f29); guides, READMEs and the reference app (docs/reference owners).

## 6. Status (21:06Z): disjoint seams done; engine integration waits for the `plan.ts`/`run.ts`/`motion-public.ts` transfer

**Implemented (core91-owned files only):**
- **`actions/overlayLayers.ts` (new):**
  - ranked per-layer stacking contexts on the portal wrappers (`z-index` 50 + rank);
  - local slots;
  - in-surface native slots without z escalation;
  - the instance scope registry (`bindOverlayScope`, `overlayScopeOf`).
- **`application/renderer/choreography/overlay-motion.ts` (new):**
  - `useOverlayMotion(init)` with a synchronous init factory;
  - `select()` scoped selectors;
  - `transition(plan, commit)` with a pending plan scoped to the flush;
  - `claimOverlayTransition` to the Host's `overlayTransition` (the engine side is not yet present, so no claim is made and the spring path runs).
- **`navigation-components/primitives/overlayMotion.ts` (new):**
  - the `overlayInstance` action, a new owner per open;
  - `claimPresentationMotion`, with completion at most once and never after cancel.
- **The five managed primitives and wrappers:**
  - `use:portal use:overlayLayer`;
  - the `motion` prop;
  - the content container bound as the instance scope root;
  - a claim before the spring (spring skipped only when claimed; cancel on supersession).
- **Command and ImageLightbox:** `motion` prop, instance scope root and claim adapter. Existing bindable `open`, interaction and completion events are unchanged.
- **`participant.ts`:** scope resolved at attach by DOM containment, re-resolved once after the flush (a microtask before rendering), because inner actions run before the container's action.

**Executed:**

| Check | Result |
|---|---|
| `overlay-layers.browser.test.ts` (later backdrop covers earlier content; closing restores; slots 0) | 3/3 (Chromium, Firefox, WebKit) |
| `overlay-scope.browser.test.ts` (public assembly: page-initialised participant inside a Modal snippet binds to the modal instance; reopening is a new epoch; the old scope matches nothing) | 3/3 |
| `tests/navigation-components/` | 141/141 (Chromium) |
| Overlay regression set (managed Modal/Popover, overlay lifetime, popover owner, sheet/drawer, alert composition, Command) | 84/84 |
| Command | 59/59 |
| Lightbox | 10/10 |
| `tsc` / `svelte-check` | 0 / 0 errors, 0 warnings |
| Visual, correction and presence regressions | 171/174 |

**The 3 regression failures are attributed to S1, not these seams:** `visual-correction.browser.test.ts:179` expects the old error `'Only incoming tracks declare slide'`, which S1's `plan.ts` now legitimately changes (outgoing slide allowed). That test needs S1's update.

**Blocked on transfer:**
- the overlay run itself: live incoming/dismissing overlay tracks, obligations, and default/explicit plan resolution;
- scoped `from`/`to` selectors;
- phase-correct two-phase acquisition;
- fixes for the audit's A1 (wrong-owner destination), A2 (ambiguity) and A3 (concurrent duplication, with successor-token leases in `target-registry.ts`);
- removal of the global guard;
- the `motion-public` exports.

**Debris to clean up (mine, from earlier sessions; not deleted without your say-so):**
- repository-root `undefined/graph-*`: `motion-free-graph.mjs` wrote to an unset output path, 15:17Z;
- `evidence/qualification-*`: the release-archive verifier test run, 19:40Z.

## 7. Status (22:02Z): supersedes §6; normative amendments after the midpoint findings

**Explicit entry phase (C2/C5)** — amends §1 and §2. `handle.transition(plan, commit)` works in three steps:
1. `RouteHost.overlayPrepare(plan, scope, instance)` runs **before** `commit`.
   - It resolves and captures sources. This includes the bound instance's roles and those of any instance named through another handle's `select()`.
   - It acquires **nothing**: no lease, no write, no arbitration (`RunOptions.deferAcquisition`).
2. The claim then applies to the current epoch only:
   - **Accepted and claimed:** `run.accept()` acquires from the pre-commit captures. A source the commit removed departs from its captured geometry.
   - **Stale epoch, refused or unclaimed:** `overlayDiscard` disposes the captures. An overlapping earlier run is untouched.
3. The pending entry is current only when `pending.instance` is `undefined` (for a `present`) or is the claiming instance itself.

**Default plans (qualified)** are claimed post-commit, in the status effect:
- Sources resolve after the accepted change has rendered.
- A page source removed by the same action is `missingSource`.
- Pre-commit source semantics require the explicit entry. This phase limitation has been raised to Sol.

**Primitive seam:**
- `noteOverlayRoles(container, roles)` records the mounted instance's roles in any status. This lets an explicit close capture roles before its commit, even when the modal was mounted already `presented`.
- `claimPresentationMotion` continues a live same-kind claim when an unrelated state change re-runs the status effect. Cancellation takes effect one microtask later, so there is no restart and no second run.

**Combined transitions:**
- `RouteHost.overlayJoin(instance, complete)`: an instance whose roles are already driven by another live run (a parent's plan naming it) joins that run. There is no spring and no second writer; its completion is delivered once when that run settles.
- The instance's own earlier run is never joined: it is superseded.

**Destination phase:** overlay and local runs admit a flush's registrations as one batch (discovery plus a microtask). A track with more than one fresh candidate is **ambiguous before any acquisition**.

**Arbitration:**
- `yieldNode` hands over paint, translate, scale **and the reveal clip**.
- The yielded item's other endpoint is restored at once.
- Handed leases no successor took are released (restoring) when the yielding run settles.

**Layer reach (C3, corrected 22:08Z after the critical finding):** there is **no media-tag exclusion**.

Copies are portable:
- projections never hold a live browsing context. Same-origin frames are projected; a cross-origin frame's copy is an unrepresented placeholder;
- canvas underlays and decorative or detached `<video>` players survive synchronous re-insertion;
- `moveBefore` is used where present and is not required.

A **real** capability absence, where the destination layer is in another document or no slot can be created, settles **that participant** faithfully:
- its copy is removed;
- its source and destination leases are restored, so the live endpoints show;
- `layerUnreachable:<reason>` is reported;
- every other track keeps running.

A diagnostic-only hidden flight is never retained.

Build identity and gates are recorded in `core-build-identity.md` (build 2). Results are in `overlay-implementation-report.md`.

## 8. Status (22:29Z): review blockers R1–R6, C2 default phase, persistent page reaction

**C2 default phase (Main dispositions 22:12Z and 22:27Z).**

*Mechanism:*
1. **Store hook.** `store.svelte.ts` `onStateCommitted` (internal) runs synchronously after a *changed* commit: plain `dispatchCore`, and the managed `TurnQueue` commit callback. It runs after pure reduction and before Svelte renders.
2. **Checkpoint.** `overlayCommitCheckpoint` reads every bound status probe. For each overlay whose committed status now **enters** `presenting`/`dismissing`, it prepares that handle's default plan through `overlayPrepare`: sources are captured while the old DOM exists, and nothing is acquired. The source epoch is the handle's bound instance at the checkpoint.
3. **Claim.** The component's status effect claims the preparation for the same kind and epoch (acceptance). An unclaimed preparation is discarded after the flush with the settle reason **`unclaimed`**.
4. **Precedence.** An explicit `transition()` of the same flush wins.

*Semantics preserved:*
- Refused actions (unchanged state) and throwing reducers notify nothing.
- Observer failures are isolated and logged. The checkpoint never dispatches, so there is no reentrancy.

*Configuration contract (exact):*

| Configuration | Probe | Contract |
|---|---|---|
| Overlay component already mounted and bound (`motion={handle}`) | Automatic (every primitive, Command, Lightbox) | No app code |
| Overlay component mounted **conditionally** | Declare `useOverlayMotion(init)` in a surviving page, shell or presentation owner, and return a read-only `presentation: () => …` from `init`; the handle then probes itself | Accepted by Main in principle (22:27Z); independent ownership and lifecycle review still required |

- **Temporal precondition:** the declaration must exist **before** the destroying action.
- A handle **first created in the same destructive render** cannot capture a source that is already gone. It reports the observable `missingSource`.
- A late-created handle whose source still exists works normally.
- **Bindable/prop-only changes (no store commit) are now covered** by a real Svelte before-removal integration. `ApplicationHost` holds a root-level `$effect.pre` that tracks every registered probe. Render effects run depth-first in tree order, so it runs before any descendant block of the same update removes a source. Witnessed: "C2 bindable/prop-only update".

**Persistent page reaction (Main 22:2xZ; floor removed per 22:30Z).** In overlay runs, finalized after commit, a still-mounted outgoing participant with focusable content is a **live reaction**, not a leaving copy:
- it follows its **declared** paint curve, with no floor;
- DOM is untouched;
- focus and interaction behind a modal remain the dismissal coordinator's authority (no second policy).

**Open lifetime question (raised, not settled):** leases end with their run, so the reaction returns to stable when the open run settles. Holding the dimmed page while presented needs a retention contract. The options:
- **(a)** the Host retains completed live-reaction leases per overlay instance until its next accepted transition or unmount;
- **(b)** the plan declares a hold-until-close track;
- **(c)** the app keeps page state.

**(a)** is the narrowest framework option.

**R1–R6 (independent probes copied unchanged: 7 probes plus the R6 probe, three engines):**

| ID | Fix |
|---|---|
| R1 | Incoming and outgoing continue from handed-over or arbitrated displayed paint. `handOff` includes incoming. Shared flights yielded by arbitration continue from their displayed pose. A reversal is claimed before the old claim retires, and destinations are discovered before the earlier run is superseded. |
| R2 | Handoff matches scoped shared tracks by key. |
| R3 | Every pending preparation is claimed or discarded exactly once; overwriting discards. |
| R4 | A partially yielded shared driver is disposed once, at yield. |
| R5 | Uniqueness is decided synchronously at every registration. A candidate that another run animates is admitted only at the checkpoint (microtask, frame or `rendered()`), so ambiguity never arbitrates. |
| R6 | A rotated copy scales about the node's transform-origin (fixed point of its own transform), mapped by the accumulated linear map. |

- **Role registrations** are owned per run; `find()` returns one participant per node.
- **R-11 (reference):** a discarded preparation settles `unclaimed`, never `superseded`.


## 9. Overlay-lifetime resting reaction (Main 22:30Z approved (a); implemented; complete in build 8)

```ts
// A track in an overlay's `open` plan (default or explicit):
{ participant: 'catalog', side: 'outgoing', startMs: 0, durationMs: 300,
  opacity: { from: 1, to: 0.6 }, scale: { from: 1, to: 0.98 },
  lifetime: 'overlay' }   // default: 'transition'
```

**What `lifetime: 'overlay'` means:**
- The track's terminal channel values are the page's **overlay-open resting state**. Ordinary tracks (`'transition'`, the default) end with their run, as today.
- **Retention:** the resting state is held for the exact overlay instance epoch. Only that participant and only the declared channels are retained; there is no blanket retention.
- **Completion:** open completion is delivered once and does not wait for the hold.

**What ends it:**
- **Release or retarget** happens on the instance's next accepted transition (close or replacement); that transition starts from the displayed values. The same applies to source-owner or participant disposal and Host destruction.
- **Refusal:** a refused close keeps the resting state.
- **Nested overlays:** each unwinds its own layer's reaction, never a baseline or cumulative snapshot.
- **Channel conflicts:** adoption rules apply. There is no stale inline restore over a later owner.

**Reduced motion:** the resting state is reached immediately.

**Required witnesses:** hold past the duration, close, rapid reopen, nested open/close, route removal, independent channel motion, disposal, ergonomic declaration and balanced cleanup.


**Implementation (22:39Z):**
- **Plan field.** `ChoreographyTrack.lifetime` (`plan.ts`) is validated: only outgoing tracks may declare `'overlay'`.
- **Retention.** A **completed** overlay run hands the leases of a still-mounted, unrevealed `lifetime: 'overlay'` reaction (paint, plus its translate/scale leases) to the Host (`RunOptions.retain`). They are keyed by node and held for the instance epoch. Nothing else is retained.
- **Adoption.** The next run touching the node gets `takeRetained` in `lease()`. It continues from the displayed value with the node's true stable paint, and the returning page is treated as a live reaction. The hold is retired **after** the new acquisition, with no restoring write.
- **Release** (restoring) happens on:
  - the instance's next accepted transition, after its own adoption;
  - instance disposal (unbind);
  - Host disposal.
- **Reduced motion:** an open applies the declared terminal opacity and holds it; a close releases it.

**Witnessed on three engines:**
- held past the duration, with open completion not waiting;
- a refused close keeps the rest;
- the accepted close continues from the displayed value to baseline;
- Host destruction restores the page;
- reduced motion reaches the rest immediately and the close releases it;
- balanced leases throughout.

**22:43Z: nested unwind, reduced-motion pose and channel independence added.**
- **Nested unwind.** The Host keeps a per-node **stack** of epoch contributions. A child adopting the node retires the parent hold's leases but keeps its resting value. Releasing the child restores the surviving parent contribution under a Host-held lease, not the baseline.
- **Reduced motion** applies opacity **and** scale. Only plain-string selectors are handled in the reduced path; scoped selectors are not.
- **Witnesses** (`overlay-retention-requirements`): nested child-only unwind to the parent's 0.6, reduced scale pose, and opacity-only later run keeping the retained scale.

**Build 8 (22:59Z) completes it.**
- **Per-channel holds** (opacity, translate, scale) on a per-node epoch stack, with nested unwind per channel.
- **Adoption:** a later run adopts only the channels it animates, from their displayed values (including active transforms yielded by arbitration).
- **Reduced motion** applies the full pose (opacity, scale, slide), composed with the stylesheet base, for plain and scoped `content`/`backdrop` selectors.
- **Release** happens on:
  - the instance's next accepted transition (claimed or not);
  - instance disposal;
  - **source-owner retirement**, with the overlay epoch surviving;
  - Host disposal.
- **Removed nodes** are never re-held.
- **Witnesses:** `overlay-retention-requirements` (7) plus the four resting tests in `overlay-motion`, and the independent `core-astra-correction` probes, all passing on three engines.