# Fluid layout motion — independent architecture review

26 September 2026 · Reviewer: Claude Opus 5.5 (`claude-opus-5-5`), run through Claude Code

Reviewed: [fluid-layout-motion-design.md](fluid-layout-motion-design.md) (the
"focused design") and [design-closure-2026-09-26.md](design-closure-2026-09-26.md)
(the "closure"), against the working-tree source of the application renderer,
routing binding, history port, turn queue, resource scopes, motion
compiler/playback/engine, capture and placement, the public application guides,
the original [application-authoring-and-motion.md](application-authoring-and-motion.md),
and the relevant existing tests. I read the parent's short
[notes](fluid-layout-motion-parent-review.md) only after forming these findings.
Where I disagree with one of its corrections, I say so.

**No tests, builds or checkers were run.** Test files are cited only for what their
titles and bodies assert. No runtime code or design document was modified.

Classification used on every finding:

- **Decision**: the design leaves a behavioral choice open, or states a rule that
  cannot be implemented as written. This must be fixed in prose before
  implementation.
- **Contradiction**: the two documents disagree, or a design rule conflicts with
  existing (often tested) baseline behavior.
- **Proof**: the design is coherent, but only a working prototype can show that it
  is feasible or achieves the required fidelity.

## Verdict

The objective is sound and worth keeping at full ambition. It covers whole-layout
choreography, semantic participants that stay in their real structure, inert
decorative continuity, and overlapping tracks across a mid-timeline commit. The
two-gate proof plan is the right shape. The documents avoid the usual traps:
cloning live trees, replaying actions, rolling back browser history for an outro,
and promising continuity that cannot be delivered.

However, the design is **not ready for public API implementation**. It is also
**not yet ready for the Gate 1 (route authority) prototype**, because two critical
routing decisions contradict the baseline and would build the wrong protocol:

1. The history writer's lifetime belongs to the Host (C1).
2. Traversal invalidation has no mechanism (C2).

The route-generation and history-intent definitions (H1) and the TestStore
cue-control decision (H6) are also needed before Gate 1 can produce meaningful
traces.

A **visual feasibility spike** can start now, provided it is explicitly
throwaway. It would cover commit-time capture of mid-animation content,
velocity-continuous retargeting of numeric geometry channels, paint suppression
that preserves focus rings, and the transition plane's placement. Its purpose is
to inform H2–H5 and M1–M5, not to freeze syntax.

With C1, C2, H1 and H6 resolved as recommended below, I would consider the design
ready for Gate 1. Gate 2 (the demanding visual reference) additionally needs
decisions H2–H5, M1, M2 and M4.

---

## Critical

### C1. A commit released without a Host has no history writer, and reattachment reverts it — Contradiction + Decision

**Design claims.** Focused design lines 148–153: "An absent or detached Host skips
decoration and releases a still-valid pending commit through the same queue… The
root coordinator owns a finite cue deadline independent of the visual Host." The
parent notes adopted this as a correction ("absent/detached Host … admits the
valid queued commit").

**Baseline.**
- The only history writer is started by the Host's attachment. See
  `renderer/owner.ts:54-61`, where `claim.attach()` calls `options.route.start(...)`.
  The writer is disposed with the claim at `owner.ts:71-77`.
- The public guide states this: "Temporary Host removal releases the connection;
  reattachment reconciles the current browser URL against the retained state"
  (`packages/core/docs/application-routing.md:72`).
- On reattachment, `application/routing.ts:52-57` compares the browser URL with
  `serialize(store.state)`. If they differ, it binds with `initial: 'request-url'`,
  which submits the *browser* URL as a route request
  (`routing/managed-binding.ts:267-276`).

**Failure.**
1. On `/list`, a staged request to `/detail/42` is admitted.
2. The Host unmounts during the outro (conditional shell, HMR, a layout swap).
3. As designed, the root releases the commit. The domain state becomes
   `/detail/42`. There is no binding, so there is no history write.
4. The Host reattaches. The browser URL (`/list`) differs from the state, so
   `request('/list')` is enqueued and the reducer navigates back.

The user observes navigation that happened and then silently undid itself. The
transaction reports "committed" even though the route no longer holds.

**Also contradicts the closure.** Closure §7 (line 377): "Detach/reattach and
reduced-motion changes settle to the latest accepted state." A pending staged
destination is admitted but not accepted, so this reads as cancellation. The
focused design says commit.

**Recommended decision.**
- A staged transaction is bound to the **history attachment epoch** that admitted
  it. Host detachment ends that epoch and cancels the transaction with outcome
  `cancelled: detached`, without a commit. The transaction still records the
  admission and the cancellation.
- When no history attachment exists at request time (no Host yet, TestStore, or a
  route-free root), requests are admitted against an explicit `no-history` epoch
  and commit through the root's default cue source. That source is the next queue
  turn in production and manual in tests (see H6). Document that a routed
  application's state changes made while detached are reconciled against the
  browser URL on reattachment. This is pre-existing policy, not new motion
  behavior, but the design must name it.
- The alternative is to move the route binding to a root-lifetime browser
  attachment that is independent of the visual Host. That is coherent, but it
  changes the published contract (`application-routing.md:3, 72`) and should be a
  separate, explicit decision. It should not be implied by "Host-independent
  coordinator."

"Root destruction cancels" stays as written.

### C2. Traversal invalidation has no mechanism, and a late cue can push over a traversed entry — Decision

**Design claims.** "Owner retirement, a newer admitted request, direct route
commit, browser traversal or root destruction invalidates the old transaction"
(line 128–130).

**Baseline.**
- Traversal is observed only inside the binding: `onTraversal` in
  `routing/managed-history.ts:187-282` submits through `managed-binding.ts:113-186`
  to `enqueueInspection`. Nothing exposes the event to a root coordinator.
- A traversal's route turn can also be **rejected**. The port then rolls the
  browser back asynchronously through `traverseTo`/`go`
  (`managed-history.ts:133-164`).

**Failure (realistic ordering).**
1. A staged transaction to `/detail/42` is pending.
2. The user presses Back. The popstate handler runs the traversal turn
   synchronously, and the state moves to `/previous`.
3. The visual cue fires in a later task. Because the coordinator never learned
   of the traversal, the transaction still passes identity and policy, and its
   commit turn runs.
4. The state becomes `/detail/42`. The binding's `accept` pushes
   (`managed-binding.ts:205-231`), and that push truncates the forward entries of
   the traversed position.

The user's Back gesture is overridden, and part of their history is destroyed.

**Rejected-traversal variant.** The traversal is vetoed and a rollback
`traverseTo` is in flight. The cue then commits and pushes before the correction
lands. The pending correction's entry identity no longer matches, which produces a
rebase that overwrites a visited entry (`managed-history.ts:209-228`).

**Recommended decision.**
- The coordinator captures the binding's history generation at admission.
- Observing a traversal invalidates every pending transaction synchronously, in
  `onTraversal` before the traversal turn is submitted. This applies whether the
  traversal is later accepted, redirected or rejected.
- The commit turn is an `enqueueInspection` whose `resolve()` rechecks, at
  dequeue time: transaction identity, history generation, route key (H1), and the
  policy. `enqueueInspection` already provides the required
  resolve-at-dequeue semantics (`execution/turn-queue.ts:156-166, 370-395`).
- A rejected traversal still cancels the transaction, and the visuals return to
  the stable current page.

State these rules in the design. Test them with an injected port, using both
sequential and same-drain orderings.

---

## High

### H1. "Committed-route generation," "direct route commit" and "history intent" are undefined in a state-serialized routing model — Decision

Routing here has no first-class navigation. A route is whatever
`serialize(state)` returns, and push or replace is decided only by
`writePolicy(previous, next)` (`managed-binding.ts:218`). The design introduces
three terms without defining them:

- **Route generation / direct commit.** If "direct commit" means any change to
  the serialized URL, then a query-string edit during staging (for example,
  typing in a search box whose value serializes to `?q=`) cancels the
  navigation. That contradicts "Same-route domain edits do not automatically
  cancel it." If it means something narrower, the design must say what.
- **History intent.** The transaction "records … history intent," but the binding
  never consults a transaction. The sole writer derives push/replace from
  `writePolicy`. That gives two candidate authorities for one write.

**Recommended decisions.**
- Add a pure `routeKey(state) => string` to routed definitions. Its default is the
  pathname of `serialize(state)`. The transaction records the route key at
  admission.
- A **direct route commit** is any committed turn not issued by this transaction
  whose route key differs from the admitted one. Query- or fragment-only changes
  (typically `replace` writes) leave the transaction pending and are revalidated
  by policy at commit.
- **No independent history intent in the first slice.** `writePolicy` remains the
  sole push/replace authority. It is applied to the commit turn's
  `(previous, next)` exactly as for immediate navigation. If per-request replace
  is needed later, specify it as a one-turn annotation keyed to the commit
  envelope and consumed only by the binding for that envelope. That design must
  also cover interaction with retries (`retryAfter`, `managed-binding.ts:222`).
- **Outcome.** Record the outcome with the existing
  `expectedURL`-versus-serialized comparison (accepted / redirected / rejected),
  reusing `managed-binding.ts:152-156` semantics.

### H2. Outgoing tracks that cross the commit are blocked by the baseline's retirement ordering — Contradiction + Decision + Proof

The illustrative timeline has the outgoing content fade still running after the
commit (focused lines 102–106). After the commit, that content no longer exists
as live DOM, so the fade must continue on a capture taken mid-animation. The
baseline forbids exactly that:

- In the commit turn, `cancelOwner` runs synchronously
  (`turn-queue.ts:494-497` → `resources.ts:220-223`). It disposes the outgoing
  feature's motion bindings. Lease release then writes the *stable* value back
  (`property-leases.ts:76-85`), and the node is marked retired
  (`target-registry.ts:34-38, 160`).
- Capture runs later, in `FeatureOutletBody.svelte:19` (`$effect.pre`). It refuses
  any surface with active or just-retired leases (`capture-channel.ts:27`,
  `target-registry.ts:39-43`). Even if permitted, it would see restored,
  non-faded styles.
- This is deliberate and tested: "skips a surface whose active property lease was
  retired by logical child cleanup," and "a lease released before logical
  retirement permits capture of its accepted stable pose"
  (`tests/presentation-placement.browser.test.ts`).

**Failure.** Outgoing text at opacity 0.4 would either vanish at the commit
(capture skipped) or jump to opacity 1 inside the snapshot and then fade again.
Either way, the choreography visibly breaks at the ◆.

**Recommended decisions.**
- **Commit-time capture point.** For a staged commit, capture outgoing
  participants and choreography-owned content *inside the commit turn*: after
  state publication and before owner cancellation. `onStateCommitted` already
  occupies this position (`turn-queue.ts:489`, before `:494`). Read displayed
  (computed and animated) values. Transfer each running track to its
  representation with its current value and velocity. Only then let retirement
  restore styles.
  - The capture happens once per drain.
  - It is browser-only and skipped with no Host.
  - It is bounded by the host's snapshot budget.
  - It must not run for non-staged turns unless a layout track is registered.
- **Alternative.** Leases on outgoing content are owned by the *visual run* rather
  than the feature, and are released at DOM removal rather than at retirement.
  This crosses ownership lifetimes and is harder to make correct. I recommend
  the first option.
- **Admission-time feasibility.** At admission, dry-run capture eligibility for
  outgoing content that is declared to cross the cue. If the content cannot be
  captured, re-time those tracks to end at the cue from the start. The failure is
  then a timing change chosen at t=0, not a jump discovered at the commit.
- **Proof.** Page-scale capture fidelity is the least-proven part of the whole
  system. The current capture refuses flex/grid, positioned descendants,
  transforms, background images and pseudo-elements, and has a 128-node budget
  (`capture-html.ts:8, 11, 16`). The closure's first qualification requires
  flex/grid (closure line 277). Gate 2 must include "outgoing content crosses the
  cue" as its own case.

### H3. Paint suppression, activator focus and route focus conflict with the design's own focus rule — Decision

The design forbids `display:none`, `visibility:hidden` and `aria-hidden` for
paint suppression, and requires a usable focus indicator (lines 37–51). It does
not say what suppression *is*. The only leasable visibility-like property today
is `opacity` (`motion/properties.ts:6-9`). Opacity on an element also removes its
outline (focus ring). Three concrete conflicts follow:

1. **Activator.** A keyboard user presses Enter on a card link, which is the
   shared source participant. At t=0 the representation departs and the source
   is suppressed. Focus stays on the source, because route focus only happens at
   commit (closure §6). For about 350 ms, focus sits on an invisible element with
   an invisible ring. This is the most common keyboard path, and it violates the
   rule by default.
2. **Route focus target is a shared participant.** Route focus often goes to the
   destination heading, which is exactly the "title" participant in the
   capsule/orb/title example. Read literally, "if an eligible semantic target
   receives focus during a visual handoff, reveal it … and settle" forces the
   title track to settle on *every* navigation. The flagship choreography could
   never play.
3. **"Keep the real control visibly usable and animate its decorative surface
   separately"** is only implementable if the participant's markup separates the
   focus/hit box from its paint. The design never requires or defines that
   separation.

**Recommended decisions.**
- **Paint topology.** An interactive participant declares:
  - a *control box*: the focusable element, which owns the focus indicator and
    the hit area;
  - a *paint subtree*: declared surface/content descendants, or a
    framework-supplied inner wrapper.

  Suppression leases apply only to the paint subtree, never to the element that
  carries the focus indicator. A participant without a declared paint subtree is
  never suppressed; its track degrades to a visible-destination crossfade and
  reports a diagnostic.
- **Focus-pinned rule.** If a participant contains `document.activeElement` when
  the handoff starts, or receives focus during it, and that element matches
  `:focus-visible`, the participant is pinned. Its paint subtree is revealed
  within one frame. The representation crossfades out over no more than a
  declared short duration (for example ≤ 120 ms) instead of being hard-removed.
  Programmatic route focus that does **not** match `:focus-visible` does not pin.
  The heading's semantics and announcement are unaffected by paint.
  - Pointer activation (focus not visible) permits suppression of the source.
  - Keyboard activation pins the source through the pre-commit window, so the
    representation departs from a visible source. That small duplicate is
    accepted as the correct keyboard behavior.
- Reduced motion uses the same rules (as the design already says).

### H4. Invisible actionable regions versus "never disable a real control" versus the closure's shield — Contradiction + Decision

- The focused design says: never "silently disable a real control solely to
  preserve an effect," and "avoid invisible actionable regions" (lines 39–48).
- The closure permits a "visual-run-owned, bounded" interaction shield (closure
  line 351).
- A suppressed interactive destination, such as a header logo link hidden until
  its representation arrives at 800 ms, is invisible but clickable between the
  commit and settlement. Either rule taken alone forbids that state. Together
  they forbid every option except "don't suppress."

**Recommended decision: a coverage rule, plus two interaction windows.**
- **Coverage.** A suppressed interactive element is legitimate while its
  representation's current box covers the element's hit box (for example, IoU ≥
  0.9, or containment). Pointer input passes through the pointer-transparent
  plane to the real control, which matches what the user sees. Outside coverage,
  the element must be visible (crossfade), or it is uncovered-suppressed only
  under the window rules below.
- **W1, admission → commit.** The outgoing page is current. Keyboard and
  accessibility are untouched. Over *uncovered suppressed* regions of the
  outgoing page only, a visual-run-owned pointer shield may absorb input. It has
  no dismiss or navigation authority, lasts at most the cue deadline, and is
  released on every terminal outcome. Input that reaches live controls is genuine
  and is revalidated at commit (for example, a double-click is "repeated
  navigation to the current destination").
- **W2, commit → settlement.** The destination is never shielded. An interactive
  destination participant may be suppressed only while covered. Otherwise it is
  shown, and its representation fades against it.

Cite this rule in both documents so the shield and the no-disable rule stop
contradicting each other.

### H5. Interruption and velocity: baseline replacement jumps, and the timing model cannot carry velocity — Contradiction + Decision

**Baseline.**
- Recipes support only `interruption: 'replace'` (`motion/compiler.ts:22`).
- On a new state, `from` is the previous *target* (`renderer/motion-lifecycle.ts:439-441`).
- The successor writes that state's value on lease acquisition
  (`renderer/motion-playback.ts:272`).
- **Example.** A 0→1 fade interrupted at 0.3 by a return to 0 renders 1 in the
  next frame and then fades down. The existing browser proof plans the successor
  as `{from:'B', to:'C'}` (`tests/motion-playback.browser.test.ts:278`). It
  asserts supersession and intermediate writes, not continuity from the displayed
  value.
- This also falls short of the original spec §5.5 ("Retarget from the current
  rendered value when the engine supports it", `application-authoring-and-motion.md:628`).
- Easing is fixed-duration cubic-bezier (`renderer/motion-engine.ts:27-39`).
- Transforms are interpolated as same-shape strings (`renderer/transform-mix.ts`).
  That is a mixer, not the multi-writer "transform composition" the closure calls
  a foundation (closure line 47).

A cubic-bezier tween with a fixed duration cannot match an arbitrary initial
velocity. "Built-in tracks must carry position and velocity through supported
retargets" (focused line 236) therefore has no mechanism.

**Recommended decisions.**
- **Geometry tracks.** Shared and layout tracks drive **numeric channels** in a
  declared coordinate space: x, y, width, height, per-corner radius, clip insets,
  opacity. The transform string is composed at write time. They never
  interpolate transform strings.
- **Retarget curve.** For each scalar channel with position p₀, velocity v₀,
  target p₁ and remaining duration T, use the C¹ cubic
  `h(t) = (c−2)t³ + (3−2c)t² + ct`, where `c = v₀·T/(p₁−p₀)`, with h(1)=1 and
  h′(1)=0.
  - Specify an overshoot policy: clamp *c*, or allow a bounded overshoot.
  - Specify a zero-displacement formulation: absolute Hermite when p₁≈p₀.
  - This keeps durations deterministic, so cues and deadlines stay computable.
    Springs, if offered, must declare a settle bound.
- **Recipe interruption.** State that existing recipe `replace` semantics are
  unchanged unless a new explicit mode (for example `interruption: 'continue'`)
  is added. The design must not imply that the foundation already continues
  from the displayed pose.
- **Cue lateness.** A cue is a JavaScript event. Compositor animations keep
  running under main-thread jank, so the commit render can arrive late. Each
  track declares its anchor: `timeline` (never waits, seeks if late) or
  `commitRendered` (starts at the actual destination render, shifted by the
  delay). The choreography deadline extends by at most the bounded commit delay.

### H6. Production/TestStore parity needs an explicit cue source and a transaction trace — Decision

If "absent Host releases the commit" also holds in TestStore, admission is
immediately followed by commit. Most of the required cases then become
untestable in TestStore: unrelated edits during staging, veto after admission,
rejected newer requests, direct navigation during staging, and duplicate cues.
TestStore today controls timers only (`advanceTime`, `test/test-store.ts:53-69`).

**Recommended decisions.**
- **Cue source.** The cue source is an injected capability.
  - The Host supplies the visual source when attached.
  - Production without a visual source uses the "next turn" source.
  - TestStore defaults to a **manual** source (`store.staged.cue(id?)`), and the
    root deadline advances with `advanceTime`.
- **Protocol parity.** Every mode runs the same protocol: admission → pending →
  cue (visual, deadline or manual) → an inspection commit turn.
- **Trace.** Transaction events form a framework trace separate from domain
  actions, so exhaustive `receive` is unaffected. The events are:
  - `admitted`
  - `superseded`
  - `cancelled(reason)`
  - `committed(accepted|redirected)`
  - `vetoed`
  - `failed(reducerRejected)`

  Cancellation reasons: `explicit`, `detached`, `traversal`, `directCommit`,
  `ownerRetired`, `rootDestroyed`. Tests assert exact events and history writes.
- **Commit origin.** The commit action is a root-origin action, like route
  requests (`routing/managed-authority.ts:36-46`). The originating owner is used
  only for invalidation. Retirement *caused by the transaction's own commit turn*
  does not invalidate it; mark it committed before `cancelOwner`.

---

## Medium

### M1. The transition plane has no defined DOM location — Contradiction + Decision

- **Where the plane actually lives.** The focused design places decoration
  "within the Host's visual plane" with explicit layer order (lines 84–87). But
  the Host adds no element ("Framework lifetime management adds no visual wrapper
  or element", `application-routing.md:76`), and the current layer is appended to
  `document.body` (`capture-channel.ts:66-68`).
- **Why that is not enough.** A body-level plane cannot place a shared element
  *under* a sticky header, and it cannot be clipped by a page scroller except by
  emulating the clip every frame.
- **Recommended decision.** Provide an explicitly placed plane outlet that the
  application puts in its stable shell. It is persistent across routes, sits in
  the application's stacking context and is pointer-transparent. A body-level
  plane remains the default. Both sit below every layer registered with the
  document dismissal coordinator (`actions/dismissalCoordinator.ts`), and below
  top-layer elements by construction. Representations inside a clipped
  scroller's region carry a computed `clip-path` that is rebased per frame.

### M2. No scroll policy exists at commit, so destination anchors are ill-defined — Decision

- **What the destination geometry depends on.** Destination geometry depends on
  the destination scroll offset.
- **What the baseline says.** The baseline explicitly lacks scroll restoration
  (`application-routing.md:82`), although the original spec assigned "scroll
  restoration keyed by entry" to the binding
  (`application-authoring-and-motion.md:1041`).
- **Traversals.** With the browser default `history.scrollRestoration='auto'`,
  restoration timing relative to the application's DOM swap is not under
  framework control.
- **Scrollbar changes.** A scrollbar appearing or disappearing at the commit
  shifts every measured x-position.
- **Recommended decision.** Scroll position is part of the commit contract:
  1. The staged/immediate route policy chooses `top | preserve | restore(entry)`.
  2. The framework sets `scrollRestoration='manual'` while a routed Host is
     attached.
  3. The scroll policy is applied in the commit render, before destination
     measurement.
  4. Guidance recommends `scrollbar-gutter: stable`, or remeasurement covers the
     gutter change.

  Without this, "late geometry" failures will be misdiagnosed as retarget bugs.

### M3. The render-only projection is not a co-equal option in Svelte; make post-commit measurement the normative path — Decision

Svelte has no client mount that suppresses a component's `$effect` or `onMount`.
Mounting a real feature view elsewhere would also trigger its framework claims:
- `usePlacement().claim(view)` would raise "Duplicate FeatureOutlet placement"
  (`renderer/placement.svelte.ts:38-44`);
- `registry.ownerFor(instance.store)` requires a live captured view
  (`RenderedFeature.svelte:11`, `target-registry.ts:131-137`).

A projection that avoids both is therefore a **separately authored** component,
which is the per-feature duplication the authoring boundary forbids.

**Recommended decision.**
- **Normative path.** The default is commit underneath the plane, measure after
  the render, and retarget with velocity continuity (H5).
- **Admission-time validation.** Before the commit, a trajectory may target only
  source-relative, viewport/container-relative, or *declared-anchor* poses. The
  admission-time plan rejects, with a diagnostic, any pre-commit segment that
  depends on unmeasured destination geometry.
- **Deferred capability.** Keep the prepared projection as a later, separately
  qualified capability. It should be listed as research, not presented as one of
  two alternatives. The fingerprint rules stay with it.

### M4. In-place size change of a surviving semantic element needs a declared content policy — Decision

"Layout change" (closure lines 129–130) animates a *real* semantic element
between two sizes. With a transform FLIP, its text stretches. Animating
width/height reflows every frame. The design states the goal ("do not stretch
glyphs") without choosing a mechanism.

**Recommended decision.** Each participant declares one content policy:
`translate-only | scale | reveal | crossfade | reflow`. The fallback order is
`crossfade → translate-only`. The meaning of each:

- `translate-only` is the default for position-only changes.
- `scale` requires opt-in (images, icons).
- `reveal` commits the final layout and animates clip insets plus translation. It
  applies to expansion.
- `crossfade` uses a surface representation for bounds and radius, plus an
  outgoing-content snapshot fading against the real final content. It is the
  default for text-bearing size changes and is Material's container-transform
  model.
- `reflow` animates real width/height. It is opt-in, with a declared small-subtree
  budget.

Whole-layout reconfiguration (focused line 191) is not implementable without this
decision.

### M5. Nested groups need a default composition, and the lease vocabulary is too small — Decision + Proof

- **Default composition.** Representations are **flat siblings in the plane,
  in viewport coordinates**. A child declared as "child-of" gets its pose computed
  as `parentPose ⊗ localOffset` when it is written. Nothing is DOM-nested, so no
  transform can apply twice.
- **Hole-punching.** A descendant with its own match is hole-punched in the
  ancestor's snapshot: a same-size `visibility:hidden` placeholder *in the copy*,
  which is permitted because the copy is decoration. The "explicit compositing
  plan" wording should name this default.
- **Lease vocabulary.** The design requires paint-suppression, clipping and
  radius leases (focused line 80, capsule radius). The current property set has
  none of them, and no box-shadow either (`motion/properties.ts:6-9`).
- **Additions to specify.**

  | Addition | Typed interpolation |
  | --- | --- |
  | `clip-path: inset(...)` | four lengths plus radius |
  | per-corner `border-radius` | per corner |
  | `box-shadow` | stable fallback, or a single-shadow numeric form |
  | a paint-suppression lease | on the paint subtree (H3) |

  Proof: the shared layer's arbitration and diagnostics in Gate 2.

### M6. Commit-turn outcomes, reversal and duplicate disambiguation are underspecified — Decision

- **Redirect or rejection at commit.** The reducer may accept the commit action
  but land somewhere else (for example `/login`), or it may throw. Specify:
  - *Redirect:* dispose unmatched representations, and let the redirected page
    render with its own entrance.
  - *Reducer throw:* return the visuals to the stable current page, as for a veto.

  Add both as acceptance cases.
- **Reversal before commit.** A request back to the *current* route is, under
  normal policy, "ineligible." The design says a rejected newer request leaves the
  pending transaction alone, so the user's "close" does not stop the navigation.
  - Define a **return request**: a staged request whose route key equals the
    committed one. If the policy accepts it, it cancels the pending transaction
    without a commit. The visuals then return from the displayed pose.
  - Also define an owner-bound `cancel` intent. "Unless the application explicitly
    cancels it" (line 130) currently has no API.
- **Duplicate keys.** The same product can appear twice on a page. The staged
  request's originating owner and placement should select the source instance.
  This is disambiguation by explicit address, not guessing.
- **Scope of staging.** Say explicitly that only route commits can be cue-staged in
  the first slice. Within-page domain changes commit immediately and are bridged.
  The vocabulary's generic "cue" (line 63) otherwise invites staged non-route
  commits, which would need the same authority machinery.

### M7. No-motion equivalence is stated inconsistently — Contradiction

- **Closure §3 (line 98):** "With no Host, no motion, reduced motion, missing
  targets or failed capture, domain results are identical."
- **Focused design (line 152):** timing changes can change which competing
  requests win.

Both are true for their own subject, but the closure's sentence reads as universal.

**Recommended wording.** Motion never adds, removes, duplicates or reorders domain
actions. For a staged transaction, the domain trace under motion equals the no-motion
trace in which the request was issued at the cue instant. Exactly one of
{commit action, no action} occurs per admitted transaction. Test this as a property
over randomized interleavings.

### M8. "Reveal the application's real error boundary" presupposes a boundary that doesn't exist — Decision

A render error in Host content currently releases the claim and **destroys the
application** (`application/ApplicationHost.svelte:20-23`,
`ApplicationRoot.svelte:25-28`). Decoration is disposed as a side effect, through
registry disposal.

**Recommended decision.** Either the application declares a
`<svelte:boundary>`-based route error boundary, or the documented result of a
failed destination render is root destruction. In both cases the visual run
settles `disposed`, and no transaction reports `committed(accepted)` for a
destination that never rendered.

---

## Low

- **L1. Snapshots are stale by construction.** A representation captured at
  admission does not update if the source's content changes during W1. Say so.
- **L2. Document identity.** Include find-in-page and text selection in
  "document identity." `inert` excludes selection; find-in-page exclusion is
  permitted but not mandated by the spec, so make it an acceptance case.
- **L3. Offscreen sources.** Treat sources outside the viewport, or clipped out by
  their scroller, as missing. Otherwise representations fly in from offscreen.
- **L4. Readiness is a retarget trigger, not a gate.** Readiness (fonts,
  `img.decode()`, async content) must never delay the commit or destination
  semantics. After the commit it may only delay track start or trigger a retarget,
  within the choreography deadline.
- **L5. Motion-free core.** The coordinator is routing/protocol code and must not
  import the engine. It must remain in the motion-free bundle (closure §7).
- **L6. Gesture-driven timelines.** Do not preclude them: a timeline whose time is
  driven by input, with velocity handed over on release. This is the primary
  consumer of velocity continuity. Nothing more is required now.
- **L7. The parent's notes.** I agree with their direction on replay, projection
  risk and nested composition. I disagree with the "detached Host admits the
  commit" correction (C1).

---

## Missing decisions versus implementation proofs

| Missing design decision (fix in prose before building) | Implementation proof (prototype must show) |
| --- | --- |
| History-epoch binding; detach cancels (C1) | Commit-time capture inside the turn is fast and bounded (H2) |
| Traversal invalidation at observation; commit resolve checks (C2) | Page-scale capture fidelity for flex/grid content (H2) |
| `routeKey`, direct-commit definition, `writePolicy` as sole intent (H1) | C¹ retarget looks continuous for position/size/radius across resize and scroll (H5) |
| Commit-time capture point, or run-owned leases (H2) | Paint-subtree suppression keeps focus rings and hit testing correct in major engines (H3) |
| Paint topology, focus-pinned and route-focus rules (H3) | Coverage rule is stable against sub-pixel and scroll jitter (H4) |
| Coverage rule and W1/W2 windows (H4) | Plane outlet z-ordering under sticky headers and the coordinator (M1) |
| Numeric channels, retarget curve, track anchoring (H5) | Frame cost and retained resources on the reference workload |
| Injected cue source, trace vocabulary, commit origin (H6) | TestStore/production transcript parity |
| Plane location (M1); scroll policy (M2); projection demotion (M3) | SSR/hydration with no replay |
| Content policy enum (M4); composition default and lease set (M5) | |
| Redirect/throw/return/cancel/duplicate rules (M6); equivalence (M7); error boundary (M8) | |

## Acceptance cases to add

The following extend the focused design's list (lines 286–305):

1. A staged request is admitted, then the Host detaches: outcome
   `cancelled(detached)`, no domain commit, no history write. After reattachment,
   the state and URL agree (C1).
2. Back is pressed during W1. The traversal is accepted, and later the cue fires:
   no commit, and no push over the traversed entry. Repeat with a *rejected*
   traversal while its rollback is in flight (C2).
3. A query-only `replace` edit during W1 leaves the transaction pending. A
   different route key committed immediately cancels it with `directCommit`.
   Assert the exact write sequence (H1).
4. Outgoing text at mid-fade (opacity ≈ 0.4) across the cue: the frames straddling
   the commit show no step in opacity. When uncapturable, the fade is re-timed from
   t=0 to end at the cue (H2).
5. A keyboard-activated shared card link: the focus ring stays visible at the
   source for all of W1. With pointer activation, the source is suppressed (H3).
6. The route focus target is the shared title. With a mouse-driven navigation, the
   title track plays. With keyboard-driven navigation, the title is revealed within
   one frame of focus (H3).
7. A click on an uncovered suppressed destination link during W2 is impossible,
   because the link is visible. A click on a covered one activates the real link
   (H4).
8. A 0→1 reveal interrupted at 0.3 and reversed: the first successor frame is
   within ε of 0.3, with no sign flip in velocity beyond the declared overshoot
   (H5).
9. Main-thread block of 150 ms at the cue: timeline-anchored tracks do not stall,
   commit-anchored tracks shift, and the deadline holds (H5).
10. TestStore: admit, dispatch unrelated edits, then `cue()`, then commit. Also:
    admit, then a veto at commit. Also: duplicate `cue()` produces one attempt.
    Assert exact transaction events and domain actions (H6).
11. Destination on a shorter page without a scrollbar, and a destination reached
    by traversal to a restored scroll offset: the shared element lands exactly
    (M2).
12. Commit redirected by the reducer, and a reducer throw at commit (M6).
13. A duplicate product key on the source page resolves from the activator's
    placement (M6).
14. Find-in-page during a transition finds only semantic text (L2).

---

## Re-review of the revised design (26 September 2026)

Reviewer: Claude Opus 5.5 (`claude-opus-5-5`).

Scope: the revised [fluid-layout-motion-design.md](fluid-layout-motion-design.md)
and [fluid-layout-motion-review-dispositions.md](fluid-layout-motion-review-dispositions.md),
checked against the source context already recorded above. I did not repeat the
broad investigation or run any tests, and I made no runtime or design edits. The
original review above is unchanged.

### Re-review verdict

**Gate 1 (route authority, semantic interaction, render ordering, cleanup) can
start.** C1, C2, H1 and H6 are resolved well enough to build a prototype that
produces meaningful traces. The remaining routing gaps are small and listed
below (G1-a to G1-d). They should be settled in the Gate 1 plan before its trace
format is frozen, but they do not require revisiting the architecture.

**One new contradiction blocks Gate 2** (the visual reference). It comes from
combining two adopted alternatives:

- tracks that cross the commit start on a host-owned representation;
- real controls stay visible and no pointer shields are used.

Together these make the illustrative outgoing fade impossible for interactive
outgoing content. They also contradict the design's own logo example. See N1. The
fix is a small refinement, but it touches the render-ordering slice of Gate 1, so
decide it now.

Public API finalization is still premature. That is expected and consistent with
the design.

### Status of the four Gate 1 findings

| Finding | Status | Remaining detail |
| --- | --- | --- |
| C1 History writer lifetime | **Resolved** (design lines 182–193). Admission requires a live history attachment epoch. Detach cancels. Reattach keeps the existing URL reconciliation. A routing Host without motion uses a next-turn cue. The addendum's "settle to latest accepted state" now agrees. | G1-a |
| C2 Traversal invalidation | **Resolved in principle** (lines 148–154). Invalidation is synchronous at observation, includes vetoed traversals, and generation and epoch are rechecked at dequeue. | G1-b, G1-c |
| H1 Route key and write authority | **Resolved** (lines 137–160). `routeKey` defaults to the full URL, and `writePolicy` is the sole push/replace authority. The expected-versus-accepted comparison classifies the outcome. | G1-d |
| H6 TestStore parity | **Resolved** (lines 195–201). Cue sources are injected (manual in TestStore), tests install a history fixture, the protocol trace is separate from domain actions, and a transaction's own commit cannot cancel it. | Enumerate the `cancelled(reason)` values. The TestStore history fixture is new capability, not baseline. |

**Gate 1 clarifications.** These are small decisions, not blockers.

- **G1-a: binding failure ends the epoch.** A root binding can still retire
  itself after attachment: `fail()` runs on an initialization failure, or on a
  write failure before its receipt settles (`managed-binding.ts:84-110`). Treat
  that retirement as the end of the epoch, with outcome `cancelled(detached)`.
  - A later post-attachment write failure is different: the transaction stays
    `committed(accepted)`.
  - The trace records the history failure alongside it, and the existing retry
    policy applies.
- **G1-b: which popstates bump the generation?**
  - The port's own rollback arrival is not a user traversal. It is the matched
    `pending` path at `managed-history.ts:209-229`. If it bumps the generation,
    it spuriously cancels any request admitted after the veto.
  - Recommendation: the correction arrival does not bump the generation, and
    staged admission reports `unavailable` while a correction is pending.
- **G1-c: fragment-only entries under `fragment: 'native'`.** Clicking an in-page
  anchor during W1 creates a browser entry and is delivered through
  `onTraversal`. Decide whether native fragment-only changes invalidate staged
  transactions.
  - Recommendation: they do not. The route is unchanged, and the binding already
    ignores them as business requests (`managed-binding.ts:126-127`).
  - They still count as history changes for the commit's `writePolicy` input.
- **G1-d: compute `routeKey` on the fragment-projected URL.** Compute the default
  after the binding's fragment projection. Otherwise, under `'native'`, a
  fragment change would alter the key even though it is not part of the route.
  Report a query-only cancellation distinctly, for example with
  `directCommit: routeKey`, so authors know to declare query equivalence.

### Assessment of the deliberate alternatives

**1. Staged admission requires a live history binding; tests inject one.**
I accept this. It is better than my optional no-history epoch:
- There is one protocol, and the history writer always exists when a staged
  commit can happen. That removes a mode that could never be observed through
  history.
- The cost is that route-free applications and bare TestStore cannot stage.
  That is correct, because staging is a routing capability.

**2. Full-URL `routeKey` default.**
I accept this.
- My pathname default was more convenient but could keep a stale navigation
  alive across a meaningful query change, such as a filter changing the selected
  item. False retention is worse than a reported cancellation.
- The cost is that ordinary debounced search `replace` writes cancel a pending
  departure. That is acceptable once G1-d makes the cause visible.

**3. Host-owned decorative representations before retirement, instead of capture inside the cancellation window.**
On the merits, this is **better than my H2 recommendation** for these reasons:
- It keeps DOM reads out of the pure turn and keeps `TurnQueue` free of renderer
  code.
- It avoids layout reads during multi-turn drains and per-turn overhead.
- It works identically in any drain shape.

It does, however, create N1 when combined with alternative 4, and it needs the
refinement described there. Two further consequences should be written into the
design:

- **Admission capture meets the existing guards.** `captureHasPropertyAuthority`
  refuses a surface if the surface, *any ancestor*, or any descendant holds a
  lease (`target-registry.ts:39-43`). `captureHTML` also refuses ancestors with a
  transform or with opacity ≠ 1 (`capture-html.ts:8`). A page-level recipe on
  `main` would therefore block every admission capture beneath it.
  - Decision: admission capture may read displayed values under foreign leases
    and transformed or faded ancestors, converting them into the plane's
    coordinate space.
  - The existing refusal only protects capture of *cancellation-restored* styles.
    Styles present at admission are not cancellation-restored.
  - The fidelity itself remains a proof item.
- **Traversal and rapid reversal have no admission.** On Back, and when reversing
  during an intro, only representations that already exist continue (for
  example, the shared participant still in flight). Two other kinds of content
  are limited:
  - Content animated on real elements under feature leases is restored and
    refused by the baseline capture. It should settle, not jump.
  - Stable, unleased sources can still use the baseline `$effect.pre` capture of
    their stable pose.

  State this as the expected reversal behavior in the design so Gate 2 does not
  treat it as a defect.

**4. Visible controls and paint topology, without shields or coverage heuristics.**
I accept this.
- It removes the only heuristic in my H4 proposal and resolves the conflict
  between "never disable a real control" and the shield by dropping the shield.
- Some visible duplication is an honest trade-off, and the design states it.
- One definition is needed for testability: "its only visible affordance."
  Recommendation: an interactive participant declares an affordance part
  (a label or icon) that is never suppressed. If none is declared, the default
  is a visible crossfade.
- Consequences follow in N1 and N2.

**5. Post-commit destination measurement as the normative path.**
I agree. It matches M3, and the admission-time rejection of pre-commit segments
that need unknown destination geometry is the correct rule.

**6. Separate domain and render outcomes.**
I agree. A committed route followed by a render failure is two facts, not one.
The design now also avoids implying that a route error boundary already exists
(lines 281–285).

### New findings from the revision

**N1 — Blocks Gate 2.** Tracks that cross the commit start on a representation,
and interactive controls must stay visible. Together these make the outgoing fade
impossible for interactive content. Classification: contradiction and decision.

- **The conflict.** Line 303 says a track that must continue after retirement
  "starts on a host-owned decorative representation … preferably at choreography
  admission." For an outgoing content fade to be visible, the real content under
  its copy must then be suppressed during W1. But lines 44–49 forbid hiding a
  live control or its only affordance. So for outgoing content containing
  controls, either:
  - the real content stays at full opacity under a fading copy, and no fade is
    visible; or
  - the authored fallback ends the track before the commit.

  In practice, the illustrative timeline (lines 110–115) cannot run on ordinary
  interactive pages.
- **The same conflict in the design's own example.** The example at lines
  215–219 hides destination paint until settlement ("expose the destination paint
  and dispose of the representation"). That is now prohibited when the
  destination is an interactive header logo link, the most common case.
- **Recommended decision: a value handoff rather than a paint handoff.**
  1. Capture the representation at admission and keep it **hidden**.
  2. During W1, the choreography drives the numeric track value (H5 channels) on
     the real content through leases owned by the feature. The real content
     stays live and visibly fading, and its controls remain visible as they fade.
  3. At the commit's render checkpoint, which is the same Svelte flush that
     removes the outgoing DOM, reveal the representation at the track's
     *current value from the choreography clock*. No DOM read is involved.
     Retirement's restored stable style is never painted, because retirement and
     removal happen before the next frame.
  4. This keeps DOM reads out of the turn, needs no transferred lease, and never
     hides a live control.
- **Proof needed:** that the reveal and the DOM removal land in the same painted
  frame, under both the turn-inside-popstate and the cue-timer orderings.
- **Amend the example.** State that an interactive destination (a logo link) is
  visible at its real place from commit and receives a crossfade as the
  representation arrives. Only noninteractive destinations may keep their paint
  hidden until settlement.

**N2 — Medium.** Focus arriving mid-handoff is unspecified. Classification:
decision.

- Line 50 checks focus "at admission." Visible controls make most mid-handoff
  focus harmless.
- The remaining case is a focusable *non-control* participant with suppressed
  paint that receives `:focus-visible` during the handoff. Examples include a
  `tabindex=-1` region reached by skip link, or a heading after keyboard route
  focus.
- Recommendation: apply the same settle/crossfade rule whenever such a
  participant gains visible focus, not only at admission.

**N3 — Low.** "Cancelled(reason)" is not enumerated. Classification: decision.

List at least these reasons so traces are exact:
- `explicit`
- `detached`
- `traversal`
- `directCommit`
- `ownerRetired`
- `superseded` (or keep it as a separate event)
- `rootDestroyed`
- `unavailable` (admission)

### Design blockers versus prototype proofs after the revision

| Remaining design decision | Blocks | Prototype proof |
| --- | --- | --- |
| G1-a–G1-d routing clarifications | Gate 1 trace freeze (small) | Synchronous invalidation under both traversal orderings, correction in flight, native fragment |
| N1 value handoff with a hidden admission representation; amend the logo example | Gate 2; decide during Gate 1 render ordering | Reveal and DOM removal in the same painted frame; no restored-style frame |
| Admission capture under foreign leases and transformed or faded ancestors (alternative 3) | Gate 2 | Capture fidelity, and the coordinate conversion of ancestors |
| Reversal and traversal expectations for feature-leased content (alternative 3) | Gate 2 acceptance wording | Rapid-reversal frames: representations continue; leased content settles without a jump |
| Affordance definition (alternative 4); N2 | Gate 2 | Focus rings and affordances remain visible across major engines |
| N3 cancellation reasons | Gate 1 (trivial) | Exact TestStore/production trace parity |

The other adopted positions are coherent as written, and their proof items stand
as recorded in the dispositions. Those positions are H5 (continuation curves and
track clocks), M1/M2 (plane outlet and scroll authority), M4/M5, and M6–M8.

---

## Final extra-high re-review (26 September 2026)

Reviewer: Claude Opus 5.5 (`claude-opus-5-5`), extra-high effort.

**Inputs.** I reviewed the final focused design
([fluid-layout-motion-design.md](fluid-layout-motion-design.md), 523 lines), the
GPT-6 Astra [final review and correction verification](fluid-layout-motion-gpt6-final-review.md),
and the [dispositions](fluid-layout-motion-review-dispositions.md).

**Design hash.** I could not compute a SHA-256 myself. Every hashing command
(`shasum`, `openssl dgst`, `git hash-object`, Node `crypto`) was denied by this
non-interactive session's approval policy. The GPT verification claims the final
hash is `2d0e9ae632a7acb30aa6f56446c448f857e7be9fed0b233205edb64f7b3b408e`. I
record that as **claimed, not independently verified**. The text I reviewed does
contain the clarification that verification says it added (design lines 442–445:
"If entry-restore has no trustworthy saved position, preserve current scroll").

**Method.** I did not treat GPT's approval as evidence. I checked F1–F4 and their
interactions against source already read in this session, plus a new check of the
placement and failure chain (below). I ran no tests, builds or compiler probes. I
made no runtime or design edits. Earlier sections of this report are unchanged.

### Final verdicts

| Deliverable | Verdict |
| --- | --- |
| **Protocol prototype (Gate 1)** | **Proceed with the queue/history/TestStore core now**: FIFO admission, barrier, staged generation, outcome recording, manual cues. Before traces are frozen, decide **X1** (what happens to a request found unavailable at admission) and **X3** (outcome vocabulary). The **render-ordering/render-failure half of Gate 1 is blocked on X2**: the design depends on a "managed route outlet" that exists nowhere, and the natural boundary placement tears down the root. |
| **Visual prototype (Gate 2 feasibility)** | **Proceed as feasibility work**, using a root destination-slot `FeatureOutlet` as the provisional route outlet (X2's recommended topology). Decide **X4** and **X5** before judging handoff results, and **X6** before claiming restoration coverage. |
| **Public API finalization** | **Not approved.** In addition to X1–X6, every capability remains prospective, as the design itself says. |

### Independent assessment of F1–F4

**F1 (FIFO admission plus traversal barrier): sound; I agree it closes GPT's
trace.** One consequence is worth stating, because it shapes X1:

- An admission requested *after* an observation is queued behind that traversal's
  inspection (`turn-queue.ts:156-166, 370-389`). The traversal's settlement
  therefore always completes before that admission dequeues.
- The barrier bites admission only in three cases:
  - an admission queued *before* the observation;
  - a correction in flight;
  - uncertain history.

  The first case is exactly GPT's reentrant trace, so the barrier is necessary. In
  real browsers, the *common* unavailable case is "correction in flight." That
  case lasts from the veto until the `traverseTo`/`go` correction arrives
  (`managed-history.ts:140-162`), which is human-perceptible time.
- Keeping the staged generation separate from the history engine's own counter is
  correct. That counter also advances on writes and on correction bookkeeping
  (`managed-history.ts:189, 292, 301, 322-323`).

**F2 (owned render boundary): the diagnosis is correct; the correction is
underspecified.**
- `ApplicationHost.svelte:20-23` and `ApplicationRoot.svelte:25-28` guard only
  the snippet *invocation*. I accept GPT's narrowing of my earlier M8 wording.
  Only initial synchronous snippet errors reach those guards, not later reactive
  failures.
- The correction names a "managed route outlet." That outlet appears only at
  design line 331. It does not exist in source or in the closure, and the routing
  guide explicitly excludes "nested route outlets" (`application-routing.md:82`).
  Its example renders pages as arbitrary markup reading
  `app.store.state.page` (`application-routing.md:48-53`). See X2.

**F3 (`domainCommitted` on classification failure): correct, and it matches
source.**
- The binding already treats a serialization throw in `accept` as a write failure
  that retries on a later accepted state (`managed-binding.ts:73-75, 205-231`).
- It never replays actions. "Never retry the domain action" is therefore
  consistent with the baseline.
- Two interactions remain unstated (X3):
  - the binding's `writeFailed` state after such a failure;
  - route-key computation for detecting direct commits while a transaction is
    pending.

**F4 (scroll precedence): the precedence rules are coherent.** Specifically:
- same-route anchors keep native behavior;
- route policy wins on a semantic commit;
- a fragment-target policy applies only when explicitly declared.

The remaining gap is where saved positions live and how the manual restoration
mode persists. That is not precedence (X6).

**Correction to my own earlier re-review.** I previously wrote that native
fragment movement should "count as history changes for the commit's `writePolicy`
input." GPT is right that this is unsound. `writePolicy(previous, next)` receives
domain-state snapshots, and a native fragment move may have no domain turn at
all. Withdrawn. Physical fragment movement belongs to the binding/scroll
protocol, as the final design says.

### Remaining findings

#### X1 — High, protocol: "unavailable" admission produces a silent dead click and diverges from immediate navigation

Classification: missing decision; must be settled before Gate 1 traces are frozen.

**Design.**
- An ineligible admission "returns unavailable without creating a transaction"
  (line 169).
- Without a binding, admission "performs no delayed commit" (lines 215–217).
- Uncertain history "keeps staging unavailable until binding reconciliation … or
  a new epoch" (lines 172–173).
- The read-only projection reports transactions only (lines 207–208). An
  unavailable admission creates none.
- Admission is now asynchronous FIFO work (line 159), so nothing can be returned
  synchronously to the view.

**Failure trace.**
1. On `/list`, the user presses Back toward `/settings`. An unsaved-draft guard
   vetoes it. The binding starts its `traverseTo` correction, and the barrier
   closes (design lines 162–164, 230–231).
2. About 150 ms later, before the correction arrives, the user clicks a card that
   issues a staged request to `/detail/42`.
3. Admission dequeues while the barrier is closed and returns "unavailable." No
   transaction, projection entry, callback or fallback exists. The click does
   nothing and gives no feedback.
4. The same click wired to an ordinary immediate `navigate` action *would*
   navigate. The baseline permits immediate route writes during a correction:
   `accepted()` does not consult `pending` (`managed-history.ts:287-321`), and
   the correction's recovery path yields to the newer generation (`:143-150`).

**Persistent variant.** After a failure leaves history "uncertain," every staged
link in the application stays dead until reconciliation or reattachment, while
immediate links keep working. Whether a navigation happens then depends on which
API the author chose, not on guards. This defeats the design's own principle that
availability of motion must not change guard rules or commit authority
(lines 224–225).

**Correction.**
- Every staged request declares its behavior when found unavailable:
  `onUnavailable: 'immediate' | 'drop'`. The default is `'immediate'`.
- For `'immediate'`, in the same FIFO admission slot, evaluate the same pure
  policy against current state. If it is eligible, reserve the next FIFO position
  for the declared commit action as an **ordinary immediate route turn**:
  - no transaction, choreography, cue or delayed commit;
  - history governed by the binding exactly as for today's immediate navigation.
- Record `admission: unavailable(reason) → degraded(immediate | dropped)` in the
  protocol trace. `'drop'` exists for requests whose meaning depends on delay.
- **Rationale.** The barrier exists to stop a *stale* delayed intent from racing
  the user's traversal. A request made after that traversal is a *fresh* intent.
- **Tests.** Click during a correction, during uncertain history, and with no
  binding. Assert exactly one commit action, or zero with `'drop'`, and the
  binding-governed history result.

#### X2 — High, blocks Gate 1's render-ordering/failure half: the route outlet is undefined, and a natural boundary placement destroys the root

Classification: source contradiction plus missing decision.

**Design.**
- Lines 329–346 require an owned boundary/checkpoint for "the managed route
  outlet," with render identity.
- A declared fallback "retires the failed rendering resources; feature business
  lifetime still follows committed state."
- The value handoff reveals at "the render checkpoint that removes outgoing DOM"
  (line 370).

**Source.**
- There is no route outlet. Placement scopes are created by `ViewScope`, the body
  of `FeatureViews`. Outlet claims are made by `FeatureOutletBody.svelte:11-13`.
- A required declaration without a claim throws "Missing FeatureOutlet placement"
  (`placement.svelte.ts:51`).
- That error goes through `registry.fail` (`target-registry.ts:260, 272`), then
  the claim failure (`owner.ts:32, 37-43`), then `destroy`
  (`create-application.ts:55`).

**Failure trace.**
1. An application wraps its page region the obvious way:
   `<svelte:boundary failed={pageFallback}><FeatureOutlet view={views.page}/></svelte:boundary>`,
   inside the root `FeatureViews`.
2. A staged commit renders B. B throws on a later reactive update, and the
   boundary shows its fallback.
3. Replacing the content destroys `FeatureOutletBody`, which releases its claim.
   The enclosing `ViewScope` survives outside the boundary and still requires
   `page`.
4. The next placement validation throws "Missing FeatureOutlet placement," and
   the whole root is destroyed.

The declared fallback flashes and the application dies. That directly
contradicts lines 339–341.

**Two further holes.**
- Participants rendered in shell markup *outside* any route outlet, such as the
  example's header logo (lines 256–267), have no boundary. Their later reactive
  failures are just as unobserved as GPT's F2 trace.
- With arbitrary `{#if}` page markup there is no framework render identity and
  no checkpoint for the value handoff.

**Correction.**
1. **Topology.** Staged navigation is available only when route content renders
   through a declared managed route outlet. Concretely, that is the
   `FeatureOutlet` of a root destination slot marked as the route slot, or a
   `RouteOutlet` built on `FeatureOutletBody`. Otherwise admission is unavailable
   (X1 then applies).
2. **Render identity.** Use the outlet instance key (owner token) plus the
   attachment epoch.
3. **Checkpoint.** Use the outlet's pre-removal and post-render effect pair
   (the pattern at `FeatureOutletBody.svelte:19-20`).
4. **Boundary placement.** The framework-owned boundary sits **inside the outlet
   body around the rendered feature content**. The placement claim therefore
   survives the fallback, and the failed view's nested `ViewScope`s retire with
   it.
5. **Application boundaries.** Diagnose, or document as unsupported, any
   application boundary that separates a `FeatureOutlet` from its `FeatureViews`
   scope.
6. **Host boundary.** The Host also installs an owned outer boundary whose only
   failure path is the explicit root teardown. This covers shell markup and
   shell-resident participants.
7. **Tests.** Fallback keeps the root alive with the domain state committed. A
   shell reactive failure tears down exactly one root. An application boundary
   around an outlet is diagnosed.

#### X3 — Medium, protocol trace: outcome vocabulary is still ambiguous where it matters for exact action counts

Classification: decision.

1. **"Vetoed" names two different facts** (lines 180–182, 244).
   - Policy is ineligible at commit inspection, so **no domain action** is
     emitted.
   - The reducer receives the commit action but leaves the route key unchanged,
     for example by setting an error field. **One domain action is reduced.**

   Carry `domainCommitted` on `vetoed` exactly as F3 does on `failed`.
   Enumerate the `failed` phases: `guard | routeKey | reduction |
   routeClassification`.
2. **Route key while pending.** Direct-commit detection computes the route key
   after every committed turn while a transaction is pending (lines 151–152). If
   `routeKey` or `serialize` throws on an unrelated turn, the outcome is
   unspecified. Cancel conservatively with `historyUnavailable` (detail:
   `routeKey`). The binding's own serialize failure already marks the write as
   failed (`managed-binding.ts:224-229`).
3. **Barrier after a classification failure.** After F3's routeClassification
   failure, the binding holds `writeFailed` and retries on later states
   (`managed-binding.ts:73-75`). State that this is "uncertain history"
   (lines 172–173). Staging stays unavailable (degrading per X1) until the next
   successful accepted write.
4. **TestStore `finish()`.** Define what happens with a pending staged
   transaction. Recommendation: fail and name the transaction, just as pending
   timers are named today (`test/test-store.ts:1017-1057`).

#### X4 — Medium, visual: "visibly usable" live controls during a pre-commit fade have no testable criterion

Classification: decision.

**The gap.**
- Lines 366–369 let feature-owned leases fade live content before commit, while
  "controls and focus affordances remain visibly usable." A track that makes them
  invisible must use an authored fallback.
- Neither threshold is defined. Is opacity 0.3 usable? 0.1? The flagship timeline
  (lines 113–117) depends on the answer.
- A focus-visible arrival mid-fade settles that control to its stable appearance
  (lines 52–55). The later reveal at "the current numeric value from the
  choreography clock" would then drop it from 1 to the nominal timeline value in
  one frame.

**Correction.**
- **Validation rule.** Plan validation rejects any pre-commit track that reduces
  a focusable control or declared affordance part below a declared floor. The
  default floor is its stable appearance: hold. Ship a `hold-then-fade` preset in
  which control content holds until the reveal and fades on the representation
  afterward.
  - This is an author-visible timing choice made at admission. It is not a
    silently invented timing, so it respects lines 377–378.
  - A custom floor must name a measurable criterion. WCAG 2.2 SC 1.4.11 (3:1
    non-text contrast for the affordance) is a defensible one.
- **Handoff value.** The reveal uses each participant's **actual current track
  state**, including focus-induced settlement, not the nominal timeline value.

#### X5 — Medium, visual: the value handoff must also hand off geometry, and capture must exclude the choreography's own values

Classification: precision gap, plus proof.

- **The problem.** Line 371 reveals at "the current numeric value." A hidden
  representation captured at admission has its *admission* rect.
  - During the pre-commit window, scrolling, reflow above the source, or a
    feature-owned transform track moves the source.
  - At the removal checkpoint, retirement has already restored feature-owned
    leases (`turn-queue.ts:494-497` → `property-leases.ts:76-85`). A source rect
    read there is the *stable* pose, not the displayed one. The reveal therefore
    jumps.
- **Correction, geometry.** During the pre-commit window, sample each hidden
  source's transform-free layout rect in the batched per-frame measurement,
  inverting the choreography's own known transform channels. At the reveal, use
  the last sample combined with the current channel values. Never read a leased
  outgoing source's geometry at the removal checkpoint.
- **Correction, recapture.** Recapture after content invalidation (line 376)
  reads a source that is under the choreography's *own* opacity/transform leases.
  - It must record the stable appearance **excluding** the choreography's own
    values, then reapply them.
  - Otherwise opacity is applied twice (for example, 0.6 × 0.6).
  - The "exactly once" rule at line 384 is stated for foreign leases only; extend
    it explicitly.

#### X6 — Medium, visual/public API: scroll positions have no storage, and manual restoration persists per entry

Classification: decision.

**The gap.** Lines 425–440 take over restoration and "restore the browser's prior
setting" on detach. But:

- Where saved positions live is not specified.
- In the HTML history model, `history.scrollRestoration` is a per-entry mode that
  pushed entries inherit, so restoring the attribute on detach affects only the
  current entry. This belongs in the scroll proof.

**Failure trace.**
1. The user scrolls `/list` to y=2400 and navigates to `/detail`. The pushed entry
   inherits `manual`.
2. They reload `/detail`, then press Back. In-memory positions are gone, and the
   browser does not restore a manual entry.
3. The fallback (line 439: anchor, or preserve) lands at an arbitrary offset.
   Today's `'auto'` behavior would have restored the position.

Entries created while attached remain `manual` after the Host detaches or the
page unloads.

**Correction.**
- Persist positions in the binding-owned entry metadata namespace. The binding is
  already the sole writer, and entries carry `chain/id/index`
  (`managed-history.ts:1-50`). Write on push and `pagehide`/visibility change,
  with bounded replace frequency.
- Alternatively, keep them in `sessionStorage` keyed by entry identity.
- Define reload, bfcache and post-detach behavior, and prove it in real browsers.
  This does not block the protocol.

#### X7 — Low–Medium, protocol timing: a visual terminal outcome before the cue should release the cue immediately

**Gap.** Lines 461–462 only promise that a failed or skipped phase cannot
*indefinitely* block the commit, and the deadline is the stated backstop
(lines 222–223).

**Failure trace.**
1. Reduced motion is switched on 100 ms into the pre-commit window. The run is
   superseded (`preferenceChanged`), representations are disposed, and leases are
   restored.
2. No visual cue will ever arrive.
3. The user watches a frozen page until the root deadline.

**Correction.**
- Any terminal visual outcome before the cue (superseded, failed, timed out, or
  disposed while the epoch is still valid) releases the cue on the next turn. The
  deadline is only for a lost driver.
- A veto or cancel before commit restores the page by continuation from the
  displayed pose (bounded), not by snapping. Snap only under reduced motion.

#### X8 — Low: protocol precision

- **Native-fragment classification drift.** A fragment-only classification made
  at observation, against a stale `acceptedURL`, can become route-affecting by
  the time the traversal settles, if a route turn was queued in between.
  Re-classify at settlement: invalidate pending transactions then, and hold the
  barrier through any correction. The correction barrier (line 230) already
  limits the damage.
- **FIFO supersession.** If a transaction's commit inspection is already queued
  when a newer request arrives, the old transaction commits first, and the new
  one is admitted from the new route. Write this expectation into the tests.
- **Capture timing.** Admission capture runs at the next render checkpoint, not
  inside the drain. The choreography's t=0 is capture completion, not admission.

### Interactions checked (no additional blockers beyond X1–X8)

| Interaction | Assessment |
| --- | --- |
| Value handoff × semantic structure | Sound. Live content stays feature-owned until retirement, and representations are inert. Requires X2's outlet for the checkpoint and X5 for geometry. |
| Handoff × focus/controls | Coherent with visible affordances. X4 supplies the missing criterion and settled-state handoff. |
| Handoff × reduced motion | Next-turn cue path is correct. Mid-flight preference change needs X7. |
| Handoff × failure | F2 cleanup ordering is correct in intent. Requires X2's placement-safe boundary. A reducer throw restores the page (X7 for animated restore). |
| Snapshot validity | "Recapture or settle" is sound. X5 fixes double application. Detecting invalidation without per-feature counters remains a proof (as GPT notes). |
| Retargeting | Hermite continuation with a bounded-property fallback is sound. It applies to hidden-source geometry per X5. |
| History | F1 barrier, epochs and a sole writer are coherent. X1 decides fresh requests during the barrier. X3 covers `writeFailed` after classification failure. X6 covers scroll persistence in entry metadata. |
| TestStore | Manual cues, a history fixture and a separate protocol trace are coherent. Staged requests need a TestStore entry point, and `finish()` semantics (X3). The history binding needs a `managedRootAccess`-compatible store (`routing/managed-authority.ts:36-46`). This is new work, as GPT notes. |

### Blockers versus proofs

| Design decision still required | Blocks | Prototype proof |
| --- | --- | --- |
| X1 behavior when unavailable (default immediate) | Gate 1 trace freeze | One commit, or zero, per click during correction, uncertain history or no binding |
| X2 route-outlet topology, boundary placement, Host outer boundary | Gate 1 render half; Gate 2 checkpoint | Later branch/reactive failures, fallback keeping root, shell failure teardown, stale failure isolation |
| X3 `vetoed`/`failed` `domainCommitted`, pending route-key failure, `finish()` | Gate 1 trace freeze | Exact action counts per phase |
| X4 control fade floor and settled-state handoff | Gate 2 judgment | Focus ring and affordance visible throughout; no drop at reveal |
| X5 handoff geometry and own-lease exclusion | Gate 2 judgment | No jump at reveal after scroll or reflow in the pre-commit window; no double opacity after recapture |
| X6 position storage and mode persistence | Scroll/restoration claims | Reload, Back, bfcache and post-detach restoration in real browsers |
| X7 cue release on visual terminal outcome | Gate 1 timing traces | Preference change mid-window commits on the next turn |

The following remain as recorded by GPT and the dispositions: same-frame
reveal/removal, admission capture fidelity under foreign leases and ancestors,
flat-group placeholders, plane clipping and stacking, Hermite edge cases,
find-in-page and selection, and SSR with no replay.

**Summary.** F1, F3 and F4 are correctly closed on their own terms. F2's diagnosis
is right, but its correction rests on an outlet that doesn't exist, and a natural
placement of it destroys the root (X2). X1 is a product-level protocol decision
that the barrier created and nothing resolves. Neither X1 nor X2 invalidates the
architecture, and both have small, concrete corrections. The ambition remains
intact.

---

## Final correction and verification (26 September 2026)

Reviewer: Claude Opus 5.5 (`claude-opus-5-5`).

At the user's request, I edited the focused design and the dispositions directly
to resolve X1–X8. I did not change runtime code, and all preserved review
reports are unchanged, apart from this appended section. No tests, builds,
prototypes or browser runs were performed, and none are claimed. Every API named
in the design remains prospective.

**Hashes (computed with `shasum -a 256`):**

| Document | Hash |
| --- | --- |
| Input design, the version I reviewed at extra-high and GPT-6 Astra verified | `2d0e9ae632a7acb30aa6f56446c448f857e7be9fed0b233205edb64f7b3b408e` |
| Final design ([fluid-layout-motion-design.md](fluid-layout-motion-design.md)) | `fa889b792e26862520c5b566802e82488e5bd167b3e6360e75ea37b76373c126` |
| Final dispositions ([fluid-layout-motion-review-dispositions.md](fluid-layout-motion-review-dispositions.md)) | `bd09f941d563ec6f0679bf63996c604f63288729ce8de78c327f22f437f5d85d` |

The first hash confirms, after the fact, the value recorded as "claimed" in the
extra-high section.

### How the design was restructured

The focused design is now one contract rather than a base text with addenda.

- **Staged routing protocol** is a new top-level section. It covers:
  - protocol vocabulary;
  - request capture and admission;
  - request results;
  - pending transactions;
  - traversal classification, the barrier and history uncertainty;
  - cues, deadlines and commit inspection;
  - commit outcomes and exact counts;
  - cancellation, return and supersession;
  - epochs and history I/O;
  - TestStore parity.

  It replaces the earlier "Navigation authority and observable state" text. An
  alias sentence keeps the architecture closure's citation valid.
- **Svelte realization** now contains the managed route outlet, render identity
  and failure contract. The earlier generic boundary paragraph is gone.
- **Interruptions and failure** now contains subsections for:
  - timing origins and deadlines;
  - capture timing and value handoff;
  - control and affordance paint;
  - geometry sampling, capture and recapture;
  - geometry tracks;
  - content policy;
  - nested groups;
  - plane and scrolling;
  - scroll restoration ownership.
- **The proof section** lists the exact cases grouped by area.

The dispositions file is now a final status map. Every finding (C1–X8) points to
the section that resolves it. The deliberate alternatives are listed. All
earlier "open" text is kept, labelled as historical and superseded.

### Resolution of X1–X8

| Finding | Final decision (design section) |
| --- | --- |
| X1 | Request-time capture of source authority: owner, placement, epoch and staged generation. Freshness is checked first in the FIFO; `stale(...)` never degrades. Fresh, policy-eligible, unavailable requests degrade by default to an ordinary reserved immediate turn under the binding's existing behavior. `drop` is opt-in and observable. Request results (stale, rejected, unchanged, returned, dropped, degraded, admitted, failed) are separate from transaction outcomes. No replay. (Request capture and admission; Request results.) |
| X2 | The route slot's existing `FeatureOutlet` is the managed route outlet. Render identity is epoch, owner token and attempt. Checkpoints are `beforeRemoval`, `rendered` and `failed`, plus coalesced `notRendered`. The owned boundary sits inside the claim-owning body and outside nested scopes, so the claim survives fallback and nested scopes retire. Fallback has a render-only, user-initiated retry. A failing fallback, or no fallback, escalates once to a Host boundary that tears down exactly once. Stale failures are diagnostics. Application boundaries separating an outlet from its scope are documented as unsupported and unverifiable. Unmanaged route markup keeps immediate behavior and makes no handoff claim. (Managed route outlet, render identity and failure.) |
| X3 | An outcome table gives attempted actions, `domainCommitted` and route result for `accepted`, `redirected`, `refused`, `vetoed`, `superseded`, `cancelled(reason)` and each `failed` phase (`admission`, `commitPolicy`, `commitRouteKey`, `reduction`, `routeClassification`). "An action reduced is not a route accepted." History results are separate. `routeKeyFailed` is defined for pending transactions. The history-uncertainty entry and exit rules cancel pending work. Controls share the FIFO with one logical effect each. TestStore has entry points, a history fixture, an outlet flag, manual cues, an exhaustive protocol transcript and `finish()` rules. (Commit outcomes and exact counts; Production and TestStore parity.) |
| X4 | Default hold-then-fade for control boxes and affordance parts, with a documented post-reveal fade when a track would end before the cue. No contrast threshold is invented. A custom reduction policy needs a declared measurable criterion and a qualified policy kind; otherwise it is rejected with a diagnostic. Visible focus pins stable paint. (Control and affordance paint.) |
| X5 | The reveal uses actual track state, the last per-frame sample of the transform-free layout rect (own transforms inverted), and foreign ancestor appearance once. No outgoing reads happen at `beforeRemoval`. Capture and recapture record stable values for the choreography's own leases and displayed values for foreign ones. Unsupported geometry, or a missing sample by the deadline, yields an explicit `unsupported` settlement. (Capture timing and value handoff; Geometry sampling, capture and recapture.) |
| X6 | Opt-in scroll ownership by the sole binding. It uses an in-memory map keyed by entry identity, plus a bounded, versioned optional field in the existing `__composableRoute` record, written only by the binding (before push, on `pagehide`/hidden visibility, and on bounded scroll idle). Reload and new documents restore once from metadata. The back/forward cache is left untouched. On detach, the binding flushes and restores the mode on the current entry only; other entries stay `manual` with no restoration while detached, which is the explicit fallback contract. Reattachment does not restore retroactively. (Scroll restoration ownership.) |
| X7 | An early visual terminal outcome appends a commit control only for the same, still-pending transaction; otherwise it is a no-op. Supersession, cancellation and owner retirement are terminal first and never commit. Reduced motion or failure in a valid transaction uses the next-turn cue. Return motion comes from displayed poses, within the existing visual run deadline, with no revival. (Cues, deadlines and commit inspection; Interruptions and failure.) |
| X8 | Reclassification at settlement. Reserved-FIFO ordering, where a queued cancel or request loses to a reserved commit. Admission (FIFO, no DOM), preparation (a Host-scheduled frame checkpoint) and t=0 are distinct. Absolute cue and visual run deadlines are never restarted. No rendering work happens inside reduction or the drain. (Traversal classification…; Timing origins and deadlines.) |

### Consequential contradictions corrected in the same pass

- **Focus check moved out of admission.** Checking already-focused participants
  "at admission" contradicted no-DOM admission. It now happens during
  preparation.
- **"Admission capture" renamed** to preparation capture, for the same reason.
- **"Vetoed" split.** "Accepted, redirected and vetoed commits" conflated a
  zero-action policy veto with a reducer refusal. It is now `vetoed` versus
  `refused`.
- **Unavailable admission clarified.** "No binding: admission reports unavailable
  and performs no delayed commit" is now the degraded request result, which
  honestly states the existing no-binding and reattachment behavior.
- **Reduced motion and missing geometry** now take the next-turn cue only for a
  still-valid transaction, instead of an unconditional cue path.
- **Timeline and controls.** The illustrative timeline notes that controls follow
  hold-then-fade, so the example no longer contradicts the visible-controls rule.
- **TestStore receipt.** A rejected commit attempt is not a received committed
  action.
- **The closure's citation** of the renamed section is kept valid by an explicit
  alias sentence. The closure itself was not edited.

I checked all 23 intra-document and cross-document heading anchors against the
design's headings: all resolve. The cited source line ranges were checked in
this session.

### Genuinely unresolved design blockers

None. No remaining decision requires changing the user's objective. What remains
is implementation and the proofs the design lists. The most significant are:

- same-frame reveal and removal;
- preparation-capture fidelity under foreign leases and ancestors;
- invalidation detection without revision counters;
- Hermite edge cases;
- boundary behavior on later reactive failures;
- scroll persistence under browser history-write throttling, reload, back/forward
  cache and detach;
- degraded immediate navigation during a correction behaving as the existing
  binding does;
- exact TestStore/production parity.

### Final verdicts

- **Protocol prototype (Gate 1): ready to implement at full scope.** This
  includes request results, controls, barrier and uncertainty, outcomes, the
  route outlet and boundaries, and TestStore parity.
- **Full visual prototype (Gate 2): ready to implement at full scope.** This
  includes value handoff, hold-then-fade, sampling, continuation, nested groups,
  the plane, and scroll ownership. The listed proofs decide which capabilities
  may be claimed.
- **Public API finalization: conditional.** It depends only on runtime and
  browser evidence from both gates, the demanding public-API reference,
  installed-consumer qualification and truthful capability guidance. This is an
  evidence requirement, not an open design decision.

### Addendum: parent consistency corrections (26 September 2026)

Reviewer: Claude Opus 5.5 (`claude-opus-5-5`), extra-high.

The parent's final consistency check found two real ambiguities in the contract
above (design hash `fa889b79…c126`); neither had been resolved. I made minimal
corrections. This was not a new broad review, and no runtime work was done.

**P1 — route key versus destination identity.** Admission step 3 used route-key
equality for `unchanged` and `returned`. With a query-collapsing custom key, a
request for `/search?q=new` from `/search?q=old` would silently become a no-op.
Outcome classification also used route keys. The corrections:

- The declared mapping now yields an exact **expected destination** (a canonical,
  fragment-projected URL). The route key is stated to express lifetime and
  invalidation equivalence only.
- Return/unchanged now require an explicit return intent or exact equality with
  the committed URL. A same-key, different-URL request is defined as an ordinary
  staged request, and its own commit is not a route-key change.
- Classification now compares exact URLs in order: expected destination →
  `accepted`, pre-turn URL (recorded at reservation) → `refused`, otherwise
  `redirected`, even if the key matches.
- Acceptance cases now cover accepted, redirected-by-normalization, refused,
  unrelated same-key edits while pending, and exact-URL/explicit return.

**P2 — render retry.** "Restarts no business effect" overclaimed. Retry now
dispatches no domain action, re-executes no reducer effect, and does not
reattempt managed initialization (entitlements are attempted once and not
retried on remount, per `packages/core/docs/managed-initialization.md:9`).
Remounting may run view initialization hooks and owner-bound native requests,
and intrinsic native resources reinitialize under their existing ownership
contracts. No exactly-once network guarantee is implied. View-initiated reads
must deduplicate or reconcile against the same owner's state, and business
retry stays an explicit action. The rules for no automatic retry, single
escalation and Host teardown are unchanged, and a retry acceptance case was
added.

I also updated the dispositions (rows P1 and P2). Headings are unchanged, so all
anchors still resolve.

**Final hashes (`shasum -a 256`):**

| Document | Hash |
| --- | --- |
| Design | `d39dfee1a96b4462f7d767eb50cba864f4e3a88ff6bfc539bc05a8b937865a82` |
| Dispositions | `727b579df842a48cbc9b3e927b894390a4c01ceea16045c3af3c1de219d7d357` |

These supersede the hashes above. The verdicts are unchanged: the protocol and
full visual prototypes are ready to implement, and the public API remains
conditional only on runtime and browser evidence.

