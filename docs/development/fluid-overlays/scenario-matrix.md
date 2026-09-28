# Fluid overlay orchestration: scenario matrix, revision 2 (reconciled with the final design, `design.md` §10)

This is the companion to `design.md`.

**Revision 2** removes teaching the final disposition superseded:
- **No manual-popover promotion slot.** App-authored native surfaces get an inert **in-surface** slot only.
- **No `match: 'overlay'` / `match: 'shell'` route selectors.** Cross-scope participants are named with a bound handle's `select(key)`.
- **No `openMotion`/`closeMotion` names.** The public shape is `useOverlayMotion(init)` returning `{ open, close }` default plans, plus `handle.transition(plan, commit)`.

Column meanings:
- **"Before"** is the state before this work: measured, or read from source.
- **"Status (core91)"** is what the current build does and which test witnesses it. Unwitnessed rows say so.
- Browser witnesses run in Chromium, Firefox and WebKit.

## Phase semantics (read first)

- **Explicit `handle.transition(plan, commit)`:**
  - Sources are resolved and **captured before `commit`**, acquiring nothing.
  - Leases, writes and arbitration of an earlier run happen only when the committed transition is **accepted and claimed** for the current epoch.
  - A refused or stale intent is discarded: only its captures are disposed.
- **Default `open`/`close` plans:**
  - They are claimed by the overlay component's status effect, **after** the accepted change has rendered.
  - Their sources resolve **post-commit**. A page source removed by the same accepted action is reported as `missingSource`, with no flight and no false pre-commit claim. A changed source departs from its post-commit geometry.
  - **Pre-commit sources require the explicit entry.** This is a concrete phase limitation of default plans, raised to Sol; it is not universal pre-commit semantics.

## Open, close and stacking (library overlays)

| ID | Scenario | Before | Target / status (core91) | Witness |
|---|---|---|---|---|
| O1 | Modal opens: backdrop fades, content zooms in, page participants on one timeline | Overlay spring; a concurrent run settled `topLayer` | Default `open` plan or `transition()` claims it; no spring; completion once. **Done** | `overlay-motion` close/open |
| O2 | The same modal closes | Overlay spring | Default `close` plan drives the live `dismissing` shell (leases, no copy). **Done** | `overlay-motion` close/open |
| O3 | Card → modal hero (shared), opening | Impossible | Flight re-homed into the modal layer's `content` slot at destination resolution; lands on the live hero. **Done** | `overlay-motion` close/open (slot assertion) |
| O3b | Card → modal hero, where the same action removes the card | — | **Explicit:** pre-commit capture, the flight departs from the pre-commit geometry. **Done.** **Default:** `missingSource`, no flight (phase boundary above). **Qualified** | `overlay-motion` "C2 explicit open", "phase boundary" |
| O4 | Modal hero → card (shared), closing | Impossible | Same mechanism in reverse (flight created in the layer slot). **Not separately witnessed** | — |
| O5 | Sheet slides up and down | No outgoing slide | S1 slide/scale channels plus `cubicBezier`. Primitive adapter in place; **no sheet-specific motion witness** | S1 suites |
| O6 | Drawer pushes the page aside | Impossible together | Incoming drawer plus outgoing page tracks on one plan. **Not separately witnessed** | — |
| O7 | Popover (non-modal) | Spring | Adapter plus default plans; outside-click and Escape unchanged. Containing block unchanged. **Done (layers)**; motion via the shared primitive path | `overlay-layers` popover witnesses |
| O8 | Confirm dialog over a modal | Independent springs | Coordinator-ranked layers: the inner backdrop covers outer content. **Done** | `overlay-layers` nested |
| O9 | Close parent and child together | Coordinator ancestry | Parent's explicit plan names the child's roles (`child.select`) with stagger. The child **joins** that run (no spring, no second writer). Both complete once; scroll lock is held until idle. **Done (explicit authoring)**. A parent *default* plan naming a child is joined only if the parent run exists before the child's claim (effect order); otherwise the child keeps its own path. **Qualified** | `overlay-motion` "U2 nested combined" |
| O10 | App-authored `showModal()` / `[popover]` | Run refused | No global refusal. A flight into the surface renders in its inert, `aria-hidden` **in-surface slot**: no promotion, no z escalation. **Done (dialog)** | `overlay-identity` "gap 5" |
| O10b | Live media across layers | — | Portable, with no tag blanket: a live canvas flight (captureStream mirror plus underlay) is re-homed into the modal layer on engines with and without `moveBefore`, and keeps its pixels. A cross-origin frame's copy holds no browsing context. A truly unreachable layer (cross-document) settles **per participant**: no copy, live endpoints, other tracks running, balanced cleanup. **Done** | `overlay-motion` "C3 portable media"; `overlay-identity` "C3 unreachable layer" |
| O11 | Route navigation while a modal is open | Refused `topLayer` | Runs concurrently. **Done** (the refusal was removed) | `visual` "no longer refuses" |
| O12 | Routed modal / Browser Back unmounting an open overlay | Unmounts without choreography | A cause-independent claim applies when the committed status enters `dismissing`. **Browser Back is not witnessed** | — |
| O13 | Command palette and ImageLightbox | Not enrolled | `motion` prop with default plans; interaction and bindable `open` unchanged. **Done** | `overlay-command`, `overlay-lightbox` |

## Identity, scope and concurrency (audit-derived)

| ID | Scenario | Before | Status (core91) | Witness |
|---|---|---|---|---|
| S1 | Another owner's `hero` registers first during a route commit | Wrong owner suppressed (A1) | Only the committed destination owner matches. **Done** | `overlay-identity` A1 |
| S2 | Two same-owner destination `hero`s | First wins silently (A2) | Ambiguity is decided **before any acquisition**. Route: at `rendered()`. Overlay/local: per batch, through discovery and a microtask admission of the flush's registrations. **Done** | `overlay-identity` A2; `overlay-motion` "destination-phase ambiguity" |
| S3 | Local morph overlaps a route run on the same card | Two representations (A3) | The earlier run yields only the conflicting node. Paint, translate, scale **and reveal clip** are handed over. The item's other endpoint is restored; untaken handed leases are released at settle. **Done** | `overlay-identity` A3, balance, "gap 7" |
| S4 | The same key in page, modal and nested modal | Route/shell scopes only | Instance scopes by DOM containment. **Done** | `overlay-scope` |
| S5 | Modal closed and reopened | No epoch | New owner per open. A stale explicit plan is discarded; old obligations are cancelled. **Done** | `overlay-scope`, `overlay-motion` "C2 epoch" |
| S6 | Two Hosts, one with an open modal | Guard refused both | No document-wide refusal. **Not separately witnessed** | — |
| S7 | Modal opens while a route flight runs | Refused | Concurrent. **Covered by the O11 witness** | — |
| S8 | Destination overlay opens during a flight targeting it | — | FIFO adoption of only the conflicting node. **Done (engine rig)** | `overlay-identity` |
| S9 | Owner retired mid-run | — | Obligations cancelled, resources settle. **Done (Host disposal)** | `overlay-motion` "Host destroyed" |

## Interruption, refusal, lifetime

| ID | Scenario | Status (core91) | Witness |
|---|---|---|---|
| I1 | Reopen during `dismissing` | The old obligation is cancelled, never dispatched; the new epoch completes once | `overlay-motion` refusal/reopen |
| I2 | Escape or outside pointer on a **managed** modal | A real `PresentationView` (deferred dismissal) goes through the coordinator to `view.dismiss()`; the reducer enters `dismissing`; the default close plan claims it; completion once | `overlay-managed` |
| I3 | Refused dismissal (idle) | Nothing claimed or completed | `overlay-motion` refusal |
| I3b | Refused **explicit** transition overlapping a running open | The earlier run keeps progressing: same copy node, lease count, tracks, obligation. Nothing is yielded before acceptance | `overlay-motion` "C5" |
| I3c | Unrelated state change during a claimed transition | The status effect re-runs; the same-kind re-claim **continues** the live claim (no restart, no second run) | `overlay-motion` "C5" (refuseClose flushed inside the commit) |
| I4 | Async save, then dismissal | A later accepted intent is a new transition. **Not separately witnessed** | — |
| I5 | Host destroyed mid-run | Obligations cancelled; leases, copies and slots are 0 | `overlay-motion` |
| I6 | Reduced motion | Immediate, exactly-once completion | `overlay-motion` |
| I7 | Transition not claimed | Spring path unchanged | navigation/overlay suites |
| I8 | Focus and scroll lock during choreographed open/close | Authority unchanged; the lock is released with the last overlay | `overlay-motion` W-C3, U2 |

## Geometry and easing

These rows are unchanged from revision 1. They belong to S1 (f29) and the independently approved numeric correction 3; core did not edit them.

| ID | Scenario | Status |
|---|---|---|
| G1 | Lock-induced reflow at open | Render-anchored measurement plus rebase; **not separately reproduced** |
| G2 | Resize, scroll or late layout | Existing rebase suites |
| G3 | Mobile `visualViewport` | Out of scope |
| E1–E4 | `cubicBezier`, overshoot, retarget, invalid curves | S1 / numeric correction 3 |
