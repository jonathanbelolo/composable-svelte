# Fluid layout motion — final independent review

26 September 2026 · GPT-6 Astra · Requested independent final architecture review

Reviewed the working-tree design and source, without changing runtime code. I read
the focused design first, formed an independent critique, inspected the routing,
queue, renderer, capture, leases and tests, and only then read the Opus report,
dispositions, parent report and architecture closure. Earlier approval is not
evidence for the conclusions below.

Focused-design SHA-256 reviewed:
`ed0202506dd9687af06ca144385226b9238bd499b5109e8c122ed83709d6df41`.

I ran no behavioral tests, builds or architecture checker. I did perform an
in-memory compilation of the actual `ApplicationHost.svelte` and a representative
conditional route using the installed Svelte 5.43.3 compiler, to verify the error
boundary issue below. That wrote no files. Existing tests cited here are source
evidence of their assertions, not new passing test results.

## Verdict

The central architecture remains suitable for the full objective: generic
whole-layout choreography, intermediate geometry and overlapping tracks across a
route commit, with semantic content and feature authority belonging to the
committed application. None of the findings justifies reducing that objective to
endpoint fades.

Two high-priority corrections remain. Admission has no defined ordering against
an observed but not yet resolved traversal, and the design assumes a general
post-commit render-failure teardown that the source does not supply. There are
also two smaller contracts to close: post-commit route-classification failure,
and native-fragment precedence under the proposed scroll-restoration authority.

| Deliverable | Verdict |
| --- | --- |
| Protocol prototype | **Proceed with a corrected Gate 1 plan.** Adopt F1 and F2 before encoding the protocol/error lifecycle; define F3 before freezing traces. These are bounded corrections, not reasons to restart architecture discovery. The unamended text is not an exact enough implementation contract for these paths. |
| Visual feasibility prototype | **Proceed.** The prepared-representation/value-handoff approach is coherent, subject to the explicit proofs below. Resolve F4 before claiming native-fragment and restoration coverage. Gate 2 acceptance requires the demanding composition, not a simplified substitute. |
| Public API or implementation-complete claim | **Not approved.** New coordinator, render checkpoint/error observation, capture, continuation and scroll capabilities still need implementation and evidence. Existing recipe and capture tests do not prove them. |

“Decision” below means a behavioral contract must be selected. “Source
contradiction” means the claimed foundation is narrower than the design assumes.
“Proof” means the intended behavior is coherent and needs qualification, rather
than another round of architecture invention.

## Findings, ranked by severity

### F1 — High: admission can slip between traversal observation and correction

**Classification:** missing protocol ordering decision. Required for Gate 1.

**Design anchors:** `fluid-layout-motion-design.md:140–156`, `170–175`,
`198–205`. Observation invalidates transactions already pending; correction blocks
new admission; commit rechecks generation, epoch, key, transaction and owner.
Admission itself is not assigned a FIFO position, and an already admitted
transaction is not explicitly barred from committing during correction.

**Source anchors:**

- `packages/core/src/lib/execution/turn-queue.ts:156–165, 370–389`: inspection
  waits in an active drain; its resolved domain action reserves that FIFO position.
- `packages/core/src/lib/routing/managed-binding.ts:123–166`: a root traversal
  resolves at that queued inspection, rather than necessarily in its event handler.
- `packages/core/src/lib/routing/managed-history.ts:133–163, 251–263`: correction
  begins only when the traversal result is rejected.
- `packages/core/tests/routing/managed-binding.test.ts:61–75`: existing tests
  deliberately exercise traversals queued from a current subscriber.

**Failure trace permitted by the text:**

1. The committed page is A and a root turn is draining.
2. A traversal to a guarded entry is observed. Generation becomes g+1, old
   transactions are invalidated, and the traversal inspection is queued.
3. Before that inspection runs, reentrant application code requests staged B.
   Immediate admission sees live owner A, epoch E, generation g+1, route key A
   and no pending correction, so it admits B.
4. The queued traversal is vetoed. State and owner remain A. The binding starts
   asynchronous correction. No new user traversal has occurred.
5. B's cue runs while correction is pending. Every specified dequeue check can
   still pass. B commits and its history push races correction, potentially
   pruning the correction target or forcing a rebase.

This does not require simultaneous JavaScript execution. Reentrant requests in a
single queue drain suffice. Ordinary click timing often avoids it, which makes
only testing sequential event handlers inadequate.

**Recommended decision:** staged admission is framework control work serialized
through the same root FIFO as traversal inspection. Policy acceptance,
supersession, epoch capture and the `admitted` event happen at that position,
before capture/playback begins. At admission **and** commit, require the binding
to be eligible for staged navigation, including no pending correction. A request
queued after an observed traversal therefore sees its resolved correction state.
Define the non-action trace for a request which is unavailable at admission; do
not create and then cancel a transaction merely to report it.

An equally safe alternative is a binding-owned traversal barrier established at
observation and held through business settlement/correction, with unavailable
admission while the barrier is active. Choose one explicit model. Do not rely on
application callbacks happening to avoid the observation-to-settlement window.
Any outstanding admitted request encountering newly ineligible history at its
commit inspection must terminate without a commit, not wait indefinitely.

Keep the new staged traversal generation distinct from the existing low-level
`generation`: `managed-history.ts:189, 292, 301, 322–323` advances the latter for
corrections and writes as well as user traversal. Reusing it verbatim would cancel
requests on the same-route edits and native fragments the design intends to keep.

**Required proof:** inject a deferred correction and issue a staged request from
the active drain between observation and traversal settlement. Test veto,
acceptance, redirect, correction failure and matched correction arrival. Assert
the exact admission result, zero stale commit actions and zero competing pushes.

### F2 — High: general destination-render failure has no existing teardown observer

**Classification:** source contradiction plus missing owned failure boundary.
Required for Gate 1's render-ordering/cleanup portion.

**Design anchors:** `fluid-layout-motion-design.md:211–217, 299–303`. The design
requires a separate render outcome and says an absent application error boundary
uses “the baseline root teardown behavior.” That baseline is not general enough
for the post-commit case being described.

**Source anchors:**

- `packages/core/src/lib/application/ApplicationHost.svelte:20–25` and
  `ApplicationRoot.svelte:25–31` wrap invocation of a children snippet in a normal
  JavaScript `try/catch`; neither installs a Svelte boundary.
- Compiling the actual Host produces a single `guarded($$anchor)` call. A nested
  `{#if app.store.state.page === 'bad'}<Broken />{/if}` creates an independently
  reactive `$.if(...)` block. A later branch mount does not reinvoke the outer
  guarded children call.
- In the installed dependency,
  `node_modules/.pnpm/svelte@5.43.3/node_modules/svelte/src/internal/client/dom/blocks/if.js:58–69`
  runs that block reactively;
  `.../src/internal/client/error-handling.js:28–43, 50–68` walks actual boundary
  effects for update errors and otherwise throws. It does not call framework root
  destruction.
- `packages/core/tests/application-owner.browser.test.ts:51–54` proves initial
  child failure, not a later route branch failure. Placement validation has its
  own failure path; it is not a general rendering exception handler.

**Failure trace:** A mounts successfully; a staged action commits B and retires
A; the subsequent Svelte conditional update mounts B, whose rendering throws.
The outer Host/Root snippet call already returned. With no actual boundary,
neither guard necessarily observes the error, so the design has no guaranteed
render-failed event, immediate motion cleanup or root teardown. A finite visual
deadline is not equivalent to observing the failed render and disposing the
correct lifecycle. With an application boundary, catching and displaying fallback
also does not by itself notify the choreography that B failed.

**Recommended decision:** make owned render-failure observation a **new framework
capability** in Gate 1. Declare a render boundary/checkpoint integration that
observes initial and subsequent route rendering, correlates failure to the
current render/transaction identity, releases decoration and suppression, and
then invokes the declared application fallback or tears down the owned root.
The accepted domain-turn outcome must remain recorded. Errors from an obsolete
render must not tear down a replacement attachment.

A framework boundary with a declared fallback is a plausible realization; the
public syntax need not be fixed now. Do not delegate recurring error plumbing to
every feature, infer an arbitrary outer boundary's behavior, or advertise the
existing plain `try/catch` as sufficient.

**Required proof:** throw from a destination mounted by a later conditional
update, then from a later reactive render of that destination. Repeat with and
without a declared fallback, during active suppression, and after supersession.
Assert domain commit remains accepted, exactly one render-failure result, no
leaked visual resources, and the intended root/Host lifetime outcome. The
in-memory compiler probe establishes the missing hook; it is not a substitute
for these browser tests.

### F3 — Medium: a serialization exception after commit is neither reducer failure nor classified acceptance

**Classification:** missing terminal-outcome detail. Close before Gate 1 trace
freeze; it does not require a different routing architecture.

**Design anchors:** `fluid-layout-motion-design.md:159–163, 177–183, 198–217`.
The allowed outcomes use expected-versus-accepted serialization, while reducer
failure restores an unchanged page and later history errors accompany an accepted
commit. The text does not assign the case where reduction succeeds but
serialization of the committed state fails.

**Source anchors:** `execution/turn-queue.ts:481–500` commits before terminal
observation; `routing/managed-binding.ts:150–160, 205–229` can then encounter
serialization/policy failure. The baseline explicitly tests throwing serialization
and classification at `tests/routing/managed-binding.test.ts:79–82`.

**Failure trace:** the commit action changes A to B and retires A; `serialize(B)`
throws. Calling this a reducer failure suggests restoring A, which is false.
Calling it `committed(accepted)` invents a successful URL comparison. Letting the
observer throw without terminal settlement leaves the transaction pending even
though its one domain attempt has already run.

**Recommended decision:** retain an explicit committed-domain fact and a failed
route-classification result. For example, a terminal failure may carry
`phase: routeClassification` and `domainCommitted: true`; exact syntax is
provisional. Clear pending work, dispose uncertain decoration, preserve actual
domain state and the binding's existing reconciliation policy, and never retry
the domain commit. A route-key/guard failure before reduction instead records no
domain commit. A pure write-policy or physical history error after successful
classification remains a separate history failure alongside that classification.

**Required proof:** distinguish policy throw before commit, reducer/reconciliation
throw, serialization throw after commit, write-policy throw, and physical write
failure. Assert owner retirement and the exact domain action count, not just the
reported URL or a generic `failed` event.

### F4 — Medium: native-fragment scroll precedence is still open

**Classification:** small behavioral decision for the visual/scroll prototype.

**Design anchors:** `fluid-layout-motion-design.md:198–205, 378–388`. Native
fragment changes retain staging; the new document routing authority takes scroll
restoration and applies top/preserve/entry-restore after render. The interaction
of those rules is not specified, especially for fragment Back/Forward that causes
no domain render.

**Source anchors:** `routing/managed-binding.ts:126–127, 146–147` can skip the
domain action; `routing/managed-history.ts:86–87, 297` retains native fragments.
`tests/routing/managed-history.browser.test.ts:63–75` asserts native fragment
navigation, Back/Forward and anchor scrolling. The public baseline explicitly
does not yet own restoration (`docs/application-routing.md:66, 82`).

**Failure trace:** while a staged departure is pending, an in-page anchor moves
the viewport. A generic route-focus/top-restoration pass can move it back. In the
other direction, after setting browser restoration to manual, a same-route
fragment traversal may have no domain render checkpoint at which entry restoration
runs. Geometry then follows the wrong offset despite correct route state.

**Recommended decision:** distinguish physical-entry/fragment movement from a
semantic route commit in the scroll coordinator. Same-route native fragment
navigation must not run route focus or a top policy; it rebases active tracks.
Specify how same-route Back/Forward restores its saved entry position under
manual restoration without requiring a reducer action. For a real route commit
whose physical URL includes a native hash, explicitly choose whether the declared
route policy or a fragment-target policy wins; do not infer a second scroll from
the presence of a retained hash. Also define a stable fallback when no saved entry
position or trustworthy entry identity exists.

This is compatible with one document scroll authority. It does not require
delaying semantic commit, restoring on every geometry invalidation, or moving
scroll bookkeeping into application reducers.

## Assessment of earlier corrections

The following conclusions come from the revised text and source, not the earlier
reviewers' endorsements.

| Area | Assessment |
| --- | --- |
| Route/history ownership and attachment epochs | Coherent. Host attachment owns the binding (`renderer/owner.ts:48–76`); absent binding is unavailable; detachment cancels and reattachment retains browser reconciliation. Do not restore the parent's earlier detach-then-commit recommendation. |
| Explicit intent, guards, one attempt and domain atomicity | Coherent. `enqueueInspection` can revalidate latest state and reserve the immediate next domain turn. Pure reduction and reconciliation reject before publication (`turn-queue.ts:406–474`). The transaction's own source retirement must be distinguished from unrelated retirement; do not naively cancel it from the owner cleanup before its exact turn observer runs. |
| Route key and native fragments | A full fragment-projected canonical URL is a defensible conservative default. Custom same-route equivalence is explicit. Default/custom query behavior needs exact tests. Native-fragment classification and correction acknowledgments require new binding signals, not reuse of every increment of the internal history generation. F1 concerns the remaining ordering hole. |
| History failure | Preserving committed domain state and the existing binding retry policy is correct. The binding currently retries selected write/rebase failures, so “no visual retry loop” must not be implemented as “disable all binding retry.” F3 is the unclassified post-commit case. |
| TestStore | Sharing `TurnQueue` is a real foundation (`test/test-store.ts:386–411`). Separate protocol events are necessary because committed non-send actions enter the receive transcript (`423–432`). A staged domain commit should still be received exactly once; an admission/cancellation control event must not masquerade as a domain action. The history attachment, manual cue and shared coordinator integration remain new work. |
| Interactive source/destination and focus | The control-box/paint-subtree/visible-affordance decision removes the shield and invisible-control contradiction. It also explicitly covers focusable non-controls and mid-handoff visible focus. A real control fading toward invisibility cannot qualify merely because its opacity is nonzero; its affordance and focus indicator must remain usable or take the declared fallback. |
| Capture across retirement | Hidden prepared representation plus numeric value handoff is a coherent alternative to DOM reads inside reduction. It closes the logical contradiction raised in the re-review. It remains unproven and must include opacity/geometry inherited from ancestors exactly once. |
| Preparation and Svelte | Post-commit measurement is the correct normative first path. Avoiding a duplicate live destination avoids mount effects and placement claims. An immutable prepared destination remains research. F2 identifies a separate Svelte lifecycle gap. |
| Scope | Route-only staging, immediate ordinary domain changes, explicit intermediate poses and full composition coverage remain consistent. A visual waypoint cannot contain the application's only meaningful content. Generic supported layout motion cannot be declared done by exercising only one logo. |

The closure contains historical shield, generalized domain-cue and prepared-view
phrasing, but `design-closure-2026-09-26.md:106–126` explicitly gives the focused
contract precedence. The parent report likewise marks its old detach correction
superseded at lines 46–50. These are editorial hazards, not new contradictory
authorities. Mark those individual old passages historical when publishing a
single implementation guide, rather than relying on readers to reconcile tables.

One statement from the Opus re-review should **not** be carried forward literally:
native fragment movement cannot be added to `writePolicy(previous, next)` inputs
without a new contract, because those are domain-state snapshots and a native
fragment may have no domain turn. Keep the focused document's sole write-policy
authority and handle physical fragment movement in the binding/scroll protocol.

## Remaining proofs, not reasons to replace the design

### Representation/value handoff and render coalescing

`turn-queue.ts:494–500` cancels feature resources before render notifications.
`property-leases.ts:76–85` restores stable styles on lease release, and
`target-registry.ts:34–42` intentionally rejects cancellation-restored capture.
`FeatureOutletBody.svelte:19–20` prepares in a pre-effect and signals rendered in
a later effect; this existing pair is not proof of the new handoff.

Qualify admission capture, hidden storage and reveal at DOM removal as one visual
operation: a 0.4-opacity outgoing control group must not flash at 1, duplicate
paint at handoff, or lose its focus indication before removal. Exercise timer
cues, traversal, several domain commits in one Svelte batch, render failure and
Host detachment. A committed B that never actually renders before C must not
produce a fabricated B geometry or start B's incoming decoration; domain outcomes
still record both turns. Unknown destination geometry before commit already has
a sound rejection rule.

For compositor playback, a choreography clock alone does not prove the last
painted native value. Seek/sample the qualified engine at a consistent time base
and test a stalled main thread at the cue. Proving this is engineering work; no
new DOM reads inside the pure reducer are warranted.

### Numeric continuation and finite budgets

Absolute Hermite continuation is mathematically suitable, including equal
endpoints; the proposed constrained fallback honestly separates value continuity
from velocity continuity. Existing `motion-engine.ts:156–196` starts new motion
values from declared endpoints and does not expose a position/velocity handoff.
Existing recipe replacement therefore remains unchanged.

Qualification must cover zero remaining duration, equal endpoints with nonzero
velocity, width/radius/opacity at their limits with outward velocity, extreme but
finite inputs, repeated retargets and deadline exhaustion. Check computed
coefficients and extrema, not just finite inputs or endpoint bounds. Enforce
coupled geometry validity, including clip insets and radii relative to changing
bounds. Report any constraint-induced velocity break. An overall absolute
deadline must not restart on every measurement. These are bounded algorithm and
browser proofs, not an architectural impossibility.

### Snapshot content, ordinary layouts and groups

The content-invalidates-snapshot rule is sufficient direction, but the first
qualified implementation must show how the framework detects invalidation within
its supported matrix without per-feature revision counters. Include a text change
that leaves the rectangle unchanged, theme/font changes, image readiness, an
ancestor opacity/transform change, and a recapture racing cancellation. A
snapshot cannot be treated as live DOM. If the source is no longer valid, settle
that content track while preserving independent eligible geometry.

Current `capture-html.ts:3–19` cannot stand in for the new projection system: it
rejects flex/grid, transformed/clipped spaces, images and substantial ordinary
rendering. The closure's first qualification at `design-closure-2026-09-26.md:286–296`
requires materially broader content. Failure to qualify that matrix is a failure
of the first delivery, not permission to silently shrink it to the old capture.

Flat representations and omitted descendants solve duplicate capture in principle.
Prove layout-preserving placeholders, exactly-once parent transforms/appearance,
inherited clipping, nested scrollers, and a child independently crossing its
parent's visual boundary. Preflight leases must reject conflicts before painting
a partial group; unrelated eligible groups should still run. Group support is
not established by fixed-target recipe groups alone.

### Interaction, stacking, scrolling and fallback

Keep real controls visible at their actual hit boxes. Test pointer and keyboard
activation, focus arriving during handoff, a shared route heading, focus inside
a nested descendant, modal activation mid-flight, live announcements and reduced
motion. Inert decoration must also qualify find-in-page and selection behavior;
`aria-hidden` is not sufficient evidence.

The stable plane outlet and document default are coherent. Prove clipping and
stacking under the supported 2D ancestor matrix, with active modal/top-layer
content and scrollbar-gutter changes. If a space cannot be represented correctly,
skip the affected track, not semantic focus or route acceptance. Rebase for user
scroll; do not run restoration repeatedly to fight it. F4 fixes the remaining
native-fragment ordering decision.

Missing geometry, failed capture, timeouts and preference changes must settle to
the actual committed state. An authored fallback that changes outgoing timing
must be selected before relying on that timing; a late failure cannot retroactively
make an uncapturable track finish before the cue. The design already permits
settling/skipping such tracks. This must remain observable and bounded.

### SSR, ownership, cleanup and authoring evidence

The existing SSR routing and public motion tests establish useful stable-render
and hydration foundations, not staged/shared-layout support. Extend them to show
no server transaction, capture, browser service or engine acquisition; no automatic
entrance replay on hydration; no replay after Host reattachment; and correct
initial browser-URL reconciliation. Keep the protocol engine-free.

Retarget transfer must install successor ownership before predecessor cleanup
can restore styles. Existing lease/run code models this ordering; the new plane,
capture and suppression leases must follow it too. Test partial acquisition,
cleanup failure, late readiness and stale driver callbacks. Bound simultaneous
representations, retained nodes and diagnostics as well as duration.

Finally, inspect the demanding reference's application code. Correctness achieved
with per-feature clone helpers, DOM observers, motion revision counters or router
callback chains would still fail the authoring objective. Require intermediate
frames, exact protocol/domain/history traces, semantic/focus assertions and
retained-resource measurements through the same candidate public APIs. No
implementation-complete claim should precede that evidence.

## Focused correction verification — 26 September 2026

This is a verification of F1–F4 against the revised focused document using the
source context already established above. It is not a new broad review. The
original report and its earlier verdict remain a record of the original hash.
The updated verdict in this section supersedes them for the corrected design.

Input design SHA-256:
`e1a799aa8124fbf648b7f9f851ddc3dccb9a7de1ddcc0af14d7b64d8dc1d77a6`.

I made one small authorized clarification in the focused document: on an actual
semantic route commit, `entry-restore` without a trustworthy saved position
preserves current scroll and does not implicitly follow a retained native hash.
The preceding paragraph already defined the same-route fragment fallback; this
addition removes ambiguity between that fallback and the new route-policy
precedence. No runtime, tests or scope changed.

Final verified design SHA-256:
`2d0e9ae632a7acb30aa6f56446c448f857e7be9fed0b233205edb64f7b3b408e`.

| Finding | Status | Verification and remaining proof |
| --- | --- | --- |
| F1 — traversal/admission race | **Closed as a design decision.** | Lines 159–177 serialize admission in the root FIFO and establish a binding barrier synchronously at route-affecting external traversal observation, through queued settlement and correction. Both admission and commit require eligibility; unavailable admission creates no transaction, and an admitted request encountering the barrier terminates without a domain action or retry. The staged generation is explicitly separate from history bookkeeping. Thus the original observation-to-veto trace cannot admit and later commit B through correction. Reentrant drains, multiple traversals, correction failure and exact trace parity remain implementation tests. |
| F2 — unobserved later render errors | **Closed as a design decision.** | Lines 329–346 now require a new owned Svelte boundary/checkpoint integration for initial and subsequent supported renders, correlated by render identity and attachment epoch. Cleanup precedes declared fallback, absent fallback invokes explicit owned-root teardown, and stale failure cannot destroy a replacement. It no longer claims the existing JavaScript guard supplies this behavior or that an arbitrary outer boundary provides the protocol. Business lifetime under a fallback remains tied to committed state. Later branch/update errors, fallback failure and cleanup still require browser proof. |
| F3 — post-commit classification failure | **Closed as a design decision.** | Lines 185–193 define terminal `routeClassification` failure with `domainCommitted: true`, clear pending work and preserve committed state without action replay. Pre-reduction guard/key and rejected reduction/reconciliation failures have `domainCommitted: false`; post-classification write failures remain separate. This removes the false reducer-failure/accepted-URL dichotomy. TestStore and production must still prove the exact action, outcome and owner-retirement traces. |
| F4 — native-fragment/restoration precedence | **Closed as a design decision.** | Lines 433–451 distinguish physical entry movement from semantic route commit. Same-route anchors retain native movement without route focus/top, same-route traversal restores through a binding signal even without domain render, and absent identity/position has a bounded anchor/preserve fallback. Actual route policy wins over a retained hash; only an explicit fragment-target policy follows it. The small clarification above makes missing actual-route entry restoration preserve scroll too. Browser scroll ordering and geometry rebasing remain qualification requirements. |

**Direct contradictions introduced:** none remain in the four corrected contracts.
The existing broad traversal language is refined by the explicit native-fragment
and matched-correction exceptions. `historyUnavailable` is now enumerated as a
cancellation reason, consistent with the distinct unavailable-admission result.
The scroll fallback clarification prevents the one ambiguous interaction between
the newly added rules. All of these capabilities remain explicitly prospective.

**Updated verdicts:**

- **Protocol prototype: ready to implement.** No unresolved design blocker from
  F1–F4 remains. The prototype must include the new render boundary and the
  shared routing/TestStore protocol, not merely the ordinary successful cue path.
- **Visual prototype: ready to implement at full scope.** Prepared representation
  handoff, continuous numeric geometry, interactive affordances, nested layout,
  scrolling and failure cleanup remain required proofs. The added prose does not
  establish that any of them works yet.
- **Public API/final implementation: not approved yet.** Finalization still
  depends on the two prototype gates, the demanding public-API reference,
  installed-consumer evidence and truthful capability guidance. No further broad
  design-review loop is required before doing that work.

No behavioral tests were run for this focused verification. Only the focused
design clarification and this appended verification section were written.
