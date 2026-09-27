# Fluid layout motion with semantic page routing

26 September 2026 · Final design contract · Not yet implemented

## Purpose

Enable advanced, smooth motion graphics and beautiful interfaces without
sacrificing the semantics, ownership or rigor of page-based routing. An entire
composition should be able to reconfigure fluidly as application state changes.
This is broader than entrance/exit effects or matching two elements across pages.

Agents describe visual intent through public framework APIs. The framework owns
measurement, scheduling, interruption, temporary representations and cleanup.
Application reducers continue to own business decisions and committed state.

This document is the focused motion contract for the next implementation cycle
and refines the broader [architecture completion design](design-closure-2026-09-26.md),
which defers to it for conflicting motion and staged-routing details. It
integrates the resolved findings of the independent reviews recorded in the
[dispositions](fluid-layout-motion-review-dispositions.md). It is not a claim
that core 0.13.1 already supplies these capabilities. Every proposed name and API
shape is prospective; public syntax remains to be proven with a working Svelte
prototype.

## Governing invariant

**Semantic structure follows committed application state. Visual continuity may
span that change.**

Each page contains its real content in the correct document structure. A shared
visual effect never replaces that content or changes its semantic ownership.
The current page must remain correctly interpretable without animation.

Temporary visual representations are decoration only. Exclude them from the
accessibility tree, focus, pointer interaction and document identity. They must
not contain duplicate IDs, working links/forms, listeners or business resources.
Use `aria-hidden`, inertness and pointer exclusion together as appropriate;
`aria-hidden` alone does not prevent focus or interaction.

When hiding duplicate paint on the real content, preserve its semantics and
usable focus indication. Do not use `display: none`, `visibility: hidden` or
`aria-hidden` merely to suppress the real participant's painting. Transparency
alone is not a complete interaction policy: avoid invisible actionable regions
that disagree with what the user sees. Use a visible semantic destination,
qualified interaction treatment or fallback when necessary.

Interactive participants keep a visible, usable real control at their actual hit
box; their decorative surface may animate separately. Declare a control box and
an inner paint subtree. Suppression never hides the control's focus indicator or
its only visible affordance. Without that separation, use a visible semantic
crossfade. No geometric coverage heuristics or pointer shields are used in the
first implementation. Some visible duplication is preferable to invisible controls.
Interactive markup declares a label/icon affordance that stays visibly usable;
without one the default is a visible semantic crossfade. Before commit, paint of
controls and affordances follows the default hold-then-fade policy in
[Control and affordance paint](#control-and-affordance-paint). Already-focused
participants are checked during preparation, the first DOM work after admission,
and visible-focus changes are monitored
throughout handoff, including focusable non-controls. A focused participant with
`:focus-visible` stays visibly represented at its real location; conflicting
decoration settles or crossfades away within a bounded duration. Programmatic
focus on a noninteractive heading without a visible-focus requirement need not
cancel its decorative track. Semantic focus and announcement still happen at the
normal route boundary; never delay them to protect choreography. Never focus the
copy or silently disable a real control solely to preserve an effect. A live
announcement is emitted by the real application view only, never by a
projection. Reduced motion uses the same focus policy.

## General vocabulary

| Concept | Meaning |
| --- | --- |
| Layout state | The actual arrangement associated with committed application state |
| Participant | A declared element or visual group taking part in choreography |
| Anchor | A measured placement in a layout, scoped to its owner and instance |
| Visual identity | An explicit correspondence between participants across layouts; not DOM-node identity |
| Visual representation | A temporary, nonsemantic rendering used for continuity |
| Pose | Geometry and appearance at a point in the choreography, possibly with no corresponding semantic layout |
| Track | Motion of selected properties or content over part of the timeline |
| Cue | A named coordination point; an authorized route commit can be one cue |
| Choreography | Overlapping tracks, poses and cues under one managed visual lifetime |

These are generic concepts, not logo, card or route-specific APIs. Support
within-page reconfiguration as well as transitions between routes. Matching is
scoped and explicit; duplicate matches must not be resolved by guessing.

The visual language needs movement, resizing, shape/radius changes, opacity,
clipping, content replacement and coordinated groups. Container resizing and
content rendering are distinct: expanding a card must not necessarily stretch
its text. Specialized rendering belongs behind the managed driver contract,
not in application-owned animation infrastructure.

Groups must declare capture boundaries. A descendant may be part of its ancestor's
representation or independently animated, but may not be painted in both without
an explicit compositing plan. Geometry composes in a declared coordinate space;
parent and child transforms must not apply the same displacement twice. Property
leases include temporary visibility/paint suppression and clipping, not just
transform and opacity. Nested and cross-group conflicts are diagnosed before
applying a partial plan. Group fallback leaves independent eligible tracks usable.

Layer order is explicit within the Host's visual plane and respects the document
overlay coordinator. Decorative page motion must not cover an active modal or its
focus indicator. Browser top-layer elements need a qualified integration or
fallback; a high z-index alone is not such an integration.

## A timeline, not three mandatory sequential stages

“Outro → route change → intro” describes one useful arrangement. It must not
require every outgoing track to finish before commit or every incoming track to
wait for shared motion to finish.

The route commit is a cue inside the choreography. A shared track may cross it
without restarting, jumping or losing velocity. Incoming and outgoing visual
tracks can overlap. Each choreography may place its commit cue differently.

Illustrative timing, not a prescribed default:

```text
Time                 0 ms          350 ms                  800 ms
Shared participant   |------------- move/reshape ------------|
Outgoing content     |-------- fade --------|
Route commit                         ◆
Incoming content                     |------ slide/fade -----|
```

For outgoing content that contains live controls, the default
[hold-then-fade](#control-and-affordance-paint) policy keeps control paint
held until the cue and plays its remaining fade on the revealed representation.

The cue requests a commit through the framework's normal routing authority.
A rendering driver never directly changes route state or writes browser history.
Eligibility and transaction identity are checked at commit. A delayed cue from
an obsolete transaction cannot navigate later.

Only route changes can be cue-staged in the first implementation. Other domain
changes commit immediately and their layouts are visually bridged. Generalizing
staged domain changes later requires a separately established authority contract.

## Staged routing protocol

This section replaces the earlier "Navigation authority and observable state"
section that the architecture completion design cites; that citation refers to
this protocol.

Staging is an explicit new routing capability, not interception of arbitrary
existing actions. Existing actions that directly commit a route remain immediate,
and applications that never stage keep today's routing behavior exactly. Do not
replay an arbitrary reducer action later: it might repeat side effects or domain
changes. A typed staged request carries a destination intent; a pure application
policy decides eligibility against current state, and a separately declared
domain commit action performs the accepted state change at most once. Async
confirmation or data loading is domain work that must finish before the request,
or render an explicit destination loading state; it is not a rendering guard.

A routed definition that stages navigation declares, prospectively:

- the pure staging policy;
- a pure mapping from a staged intent to its commit action and its **expected
  destination**: the canonical, fragment-projected serialized URL expected if
  the reducer accepts it, as existing route requests declare `expectedURL`;
- a pure `routeKey(state)`;
- the route slot rendered by the [managed route outlet](#managed-route-outlet-render-identity-and-failure);
- optionally, a route scroll policy.

**Route key versus destination.** The route key expresses lifetime and
invalidation equivalence only. Destination identity is always the exact expected
destination URL. Route-key equality never implies that two destinations are
identical. The conservative default route key is the
binding's full, fragment-projected canonical URL. Applications that treat query
edits as same-route edits declare that equivalence explicitly.

### Protocol vocabulary

| Term | Meaning |
| --- | --- |
| Staged request | One call from a live captured view, or from root-owned shell markup, asking for a destination. It has exactly one terminal request result. |
| Source authority | Captured synchronously when the request is made: request identity, originating owner token and source placement (if any), history attachment epoch (or none), and staged traversal generation (or none). |
| Transaction | Created only by successful admission. It has exactly one terminal transaction outcome. |
| Control | Framework work in the root FIFO: admission, commit inspection, explicit cancel, and the existing traversal inspection. Controls share one order with domain actions but are never reduced and never appear as domain actions. Each control has exactly one logical effect: it decides one request, ends at most one transaction, reserves at most one domain action, or is a recorded no-op. |
| Staged traversal generation | A binding-owned counter incremented only when a traversal is classified route-affecting. It is distinct from the history engine's internal counter, which also changes for writes and correction bookkeeping. |
| History eligibility | The admitting epoch's binding is attached and live, no traversal barrier or correction is in flight, history is not uncertain, and the route outlet is attached. |

Request results and transaction events are separate. A request result describes
what happened to one call; a transaction outcome describes one admitted delayed
navigation. Neither is a domain action, and neither is delivered as a callback
into feature state. Business-relevant consequences are ordinary domain state.

### Request capture and admission

When a staged request is made, the framework synchronously captures its source
authority and appends an admission control to the root FIFO. It evaluates no
policy and performs no DOM work at that point. If the queue is idle, the control
drains immediately, as ordinary dispatch does. The call returns an opaque request
handle whose read-only status projection reaches exactly one terminal result.

At its FIFO position, admission performs these steps in order. The first step
that decides the request ends it.

1. **Freshness.** The root is live; the originating owner, if any, is still live;
   the current attachment epoch equals the captured epoch (both may be none); the
   current staged traversal generation equals the captured one. Any mismatch
   yields `stale(rootDestroyed | ownerRetired | epochChanged | traversal)`, with
   zero domain actions, no transaction and **no immediate fallback**. A request
   created before a superseding traversal or owner retirement therefore can never
   evade cancellation by degrading.
2. **Policy.** Compute the route key and serialized URL of current state and the
   request's expected destination, then evaluate the pure policy. A throw yields
   `failed(admission)`; ineligibility yields `rejected`. Both emit zero domain
   actions and leave any pending transaction alone.
3. **Return or unchanged.** A request is a return when it carries an explicit
   return intent, or when its expected destination exactly equals the committed
   fragment-projected canonical URL. A return yields `returned` if a transaction
   is pending, cancelling it with `cancelled(returned)`, and `unchanged`
   otherwise. Both emit zero domain actions.

   Route-key equality alone never makes a request unchanged. Take a custom route
   key that collapses query edits: a request for `/search?q=new` while
   `/search?q=old` is committed is a **same-key, different-URL request**. It
   continues as an ordinary staged request, and its own commit does not count as
   a route-key change.
4. **Staging.** If staging is history-eligible, create the transaction, supersede
   any pending transaction of the root (`superseded`) and yield `admitted(id)`.
   The transaction emits `admitted`. No capture or playback happens here; see
   [timing origins](#timing-origins-and-deadlines).
5. **Unavailable.** Otherwise the request is fresh and eligible, but staging is
   not available. Its reason is `noBinding`, `historyBarrier`, `historyUncertain`
   or `unmanagedRouteRender`. The request's declared `onUnavailable` decides:
   - `immediate`, the default, reserves the next FIFO position for the declared
     commit action as an ordinary root-origin immediate route turn. This uses the
     same reserved-position mechanism route traversal inspections already use.
     The binding governs its history exactly as for today's immediate navigation,
     including during a correction. Without an attached binding that means no
     history write and, later, the existing browser-URL reconciliation on
     attachment, exactly as today. The result is
     `degraded(reason, outcome)`, with the outcome classified as in
     [commit outcomes](#commit-outcomes-and-exact-counts). No transaction, cue,
     choreography or delayed commit exists.
   - `drop`, opt-in, yields `dropped(reason)` with zero domain actions.

   Unavailable intentions are never queued for later replay.

A request made after a traversal was observed has already captured the
incremented generation and is queued behind that traversal's inspection. It is
therefore fresh when it dequeues. If a correction is still in flight, it follows
baseline immediate behavior when its ordinary policy permits.

### Request results

| Request result | Domain commit actions caused by this request | Transaction |
| --- | --- | --- |
| `stale(reason)` | 0 | none |
| `failed(admission)` | 0 | none |
| `rejected` | 0 | none |
| `unchanged` | 0 | none |
| `returned` | 0 | the pending one ends `cancelled(returned)` |
| `dropped(reason)` | 0 | none |
| `degraded(reason, outcome)` | 1 attempted; `outcome` states whether it committed | none |
| `admitted(id)` | as its transaction outcome states | created |

If the root is destroyed before an admission control runs, the queue drops it and
the request yields `stale(rootDestroyed)`.

### Pending transactions and invalidation

A transaction records its identity, source authority, destination, admitting
epoch and the route key at admission. While it is pending, each of the following
ends it with zero domain actions:

| Cause | Terminal outcome |
| --- | --- |
| A newer admitted request | `superseded` |
| An accepted return request: an explicit return intent, or an expected destination exactly equal to the committed URL | `cancelled(returned)` |
| An explicit owner-bound cancel control | `cancelled(explicit)` |
| Originating owner retired by any turn other than this transaction's own commit turn | `cancelled(ownerRetired)` |
| A committed turn not issued by this transaction changes the route key | `cancelled(directCommit)` |
| The route key cannot be computed after such a turn | `cancelled(routeKeyFailed)`; the transaction cannot prove its route is unchanged |
| A traversal is classified route-affecting | `cancelled(traversal)` |
| History becomes uncertain | `cancelled(historyUnavailable)` |
| The admitting epoch ends, or the route outlet detaches | `cancelled(detached)` |
| The root is destroyed | `cancelled(rootDestroyed)` |

Edits that preserve the route key do not cancel the transaction. The policy
revalidates against latest state at commit.

When the coordinator dequeues the commit action it reserved for a transaction, it
attributes that turn to the transaction before reduction. Owner retirement
performed by that same turn is part of the commit, not an invalidation. This
matters because owner cancellation precedes terminal observation inside a turn
(`packages/core/src/lib/execution/turn-queue.ts:494-500`).

### Traversal classification, barrier and history uncertainty

The binding classifies every observed traversal against its last accepted URL
after fragment projection:

- A matched arrival of the binding's own correction is not a user traversal. It
  changes no generation and cancels nothing.
- Under `fragment: 'native'`, fragment-only movement is not route-affecting. It
  keeps browser anchor behavior, runs no route focus or route scroll policy, and
  rebases active motion.
- Any other traversal is route-affecting. Synchronously, before its inspection is
  enqueued, the binding increments the staged traversal generation, cancels
  pending transactions with `cancelled(traversal)`, and closes a traversal barrier.

**Reclassification at settlement.** The queued inspection resolves against state
at its FIFO position. A traversal classified fragment-only at observation may
resolve to a route request, because an earlier queued turn changed the accepted
URL. In that case, at settlement and before its domain turn runs, the binding
performs the route-affecting steps above. A traversal classified route-affecting
that settles as skipped keeps its conservative cancellations and opens its barrier.

**Barrier.** The barrier stays closed through the traversal's settlement and any
correction that settlement starts. It opens when the correction's matched arrival
is processed, or when correction fails but the binding re-establishes an accepted
entry. If correction fails without that re-establishment, history is uncertain.

**History uncertainty.** History is uncertain after any of these:

- a failed physical write or rebase;
- a serialization or route-classification failure of a committed state;
- a correction failure the binding could not re-establish.

Entering uncertainty cancels pending transactions with
`cancelled(historyUnavailable)`. Uncertainty ends when the binding's existing
retry on later committed turns completes an accepted write, when a traversal
settlement re-establishes an accepted entry, or when a new epoch attaches. The
binding's retry policy is unchanged, and no visual retry loop is added.

### Cues, deadlines and commit inspection

A cue, deadline or manual cue only appends a commit control to the FIFO; none of
them commits. Cue sources are injected:

- A motion-enabled Host supplies the choreography cue at its timeline position.
- A routing Host without motion capability, reduced motion, and a plan found
  unsupported before playback all use the next-turn cue: a commit control appended
  at the FIFO tail.
- TestStore uses a manual cue.

**Early visual terminal outcomes.** A transaction's choreography may settle
before its cue for its own reasons: a preference change to reduced motion,
failure, timeout, missing or unsupported geometry, or plane disposal while the
epoch remains valid. The Host then reports the outcome with the run's transaction
identity. The coordinator appends a commit control only if that same transaction
is still pending; otherwise the report is a no-op.

A choreography that ended because its transaction was superseded, cancelled or
lost its owner never releases a cue: the invalidation is terminal first. A
callback from an older run is a no-op.

**Absolute cue deadline.** The cue deadline is fixed on the root scheduler at
admission and is never restarted. When it expires for a still-pending
transaction, the coordinator appends a commit control. A commit control for an
already-terminal transaction is a no-op diagnostic.

**Commit inspection.** At its FIFO position, a commit inspection checks, in
order:

| Check | If it fails |
| --- | --- |
| The same transaction is still pending | No-op |
| The originating owner is live | `cancelled(ownerRetired)` |
| The admitting epoch is current | `cancelled(detached)` |
| The staged traversal generation is unchanged | `cancelled(traversal)` |
| History is eligible | `cancelled(historyUnavailable)` |
| The route key can be computed | `failed(commitRouteKey)` |
| The route key equals the admitted key (or its declared equivalent) | `cancelled(directCommit)` |
| The policy does not throw | `failed(commitPolicy)` |
| The policy is eligible | `vetoed` |

These checks are redundant with synchronous invalidation by design; both paths
yield the same terminal outcome. Passing reserves the next FIFO position for the
declared commit action: at most one attempt per transaction. Inspection never
waits or retries.

### Commit outcomes and exact counts

After the commit action's turn, exactly one outcome is recorded. The same
classification applies to a degraded immediate turn.

| Outcome | Commit actions attempted | `domainCommitted` | Route |
| --- | --- | --- | --- |
| `committed(accepted)` | 1 | true | the committed URL equals the expected destination |
| `refused` | 1 | true | the committed URL equals the pre-turn URL; the reducer declined the destination and may have changed other fields |
| `committed(redirected)` | 1 | true | the committed URL equals neither, whether or not the route key matches |
| `failed(reduction)` | 1 | false | unchanged; the turn was rejected atomically |
| `failed(routeClassification)` | 1 | true | unknown; committed state preserved |
| `vetoed`, `superseded`, `cancelled(reason)`, `failed(commitPolicy)`, `failed(commitRouteKey)` | 0 | false | unchanged |

A reserved commit action dropped by root destruction yields
`cancelled(rootDestroyed)` with zero committed actions.

**An action reduced is not a route accepted.**

**Classification.** Classification compares exact fragment-projected canonical
URLs, never route keys. The coordinator records the pre-turn URL when it reserves
the commit action. After the turn, the committed URL is checked in order:

1. Equal to the expected destination: `accepted`.
2. Equal to the pre-turn URL: `refused`.
3. Otherwise: `redirected`.

A same-key, different-URL commit is therefore `accepted` only if it lands exactly
on its expected URL. If the reducer normalizes it (for example, adding
`&page=1`), it is `redirected` even though the key matches. If the reducer leaves
the URL unchanged, it is `refused`. The history write for an accepted same-key
commit is decided by `writePolicy`, as for any other commit.

**History result.** Any outcome with `domainCommitted: true` carries a separate
history result: `written`, `unchanged` or `failed`. A write-policy throw or
physical write failure is reported alongside the outcome, never instead of it,
and enters history uncertainty.

**Route-classification failure.** When serialization or route classification
fails after a successful reduction, the framework clears pending work, releases
uncertain decoration, preserves committed state, enters history uncertainty and
never retries the domain action.

**Visual consequences.**

| Outcome | Visual result |
| --- | --- |
| `committed(accepted)` | The choreography continues. |
| `committed(redirected)` | Unmatched decoration is disposed and the actual destination renders. |
| `refused`, `vetoed`, `failed` before commit, `cancelled`, `returned` | The still-current page is returned as described in [Interruptions and failure](#interruptions-and-failure). |
| `failed(routeClassification)` | Decoration is released and the committed state renders. |

### Cancellation, return and supersession

Explicit cancel is an owner-bound control in the same FIFO. A terminal
transaction ignores it. A cancel or newer request queued behind a commit action
that is already reserved loses: the reserved commit runs first, and the newer
request is admitted against the resulting state. A superseded transaction's
choreography is retargeted by its successor from the displayed poses.

Source placement disambiguates repeated visual keys. Remaining ambiguity is an
error, not a guessed match.

### Observable state, epochs and history I/O

The framework exposes request status and pending, committed and cancelled
transaction status as a read-only projection for loading indicators, diagnostics
and tests. It is not a second writable route store. URL serialization observes
committed domain state only. The existing history binding remains the sole
writer, and `writePolicy(previous, next)` alone decides push or replace. There is
no independent transaction push/replace authority.

State reduction and browser history I/O are not a physically atomic operation.
Preserve the binding's failure and reconciliation policy, surface failures, and
never invent a visual rollback or retry loop.

**Epochs.** Staged transactions use the attachment epoch of the routed Host's
history binding. Host detachment, or binding retirement from initialization or
attachment failure, ends the epoch. Its transactions end `cancelled(detached)`
with no commit. Route outlet detachment makes staging unavailable and cancels
pending transactions the same way. Reattachment retains the existing browser-URL
reconciliation policy; pending intent is never replayed. Destroying the root
cancels its transactions. A later history write error does not erase an accepted
domain commit.

Changing motion settings may change timing, and consequently which competing
requests win. It must not change guard rules, commit authority or domain
atomicity.

### Production and TestStore parity

Production and TestStore run the same controls, request results and transaction
outcomes. TestStore prospectively provides:

- A staged-request entry, from a captured view or the root.
- A history attachment fixture that can:
  - attach and detach epochs;
  - observe route-affecting or native-fragment traversals;
  - settle or veto them;
  - deliver or fail corrections;
  - fail writes or serialization.
- A route-outlet attachment flag, attached by default, with no rendering.
- Manual cues.
- Deadlines driven by the existing `advanceTime`.

Domain actions stay in the ordinary receive transcript. A staged or degraded
commit action whose turn commits is received exactly once. A rejected attempt
appears only as `failed(reduction)` plus the existing rejection reporting.
Request results and transaction events form a separate, exhaustive protocol
transcript.

`finish()` keeps its existing checks and additionally fails, naming each item,
when:

- a request lacks a terminal result;
- a transaction is still pending;
- a protocol event was not asserted;
- a staged deadline timer remains.

Protocol tests need no geometry.

Before commit, the outgoing page is genuinely current. At commit, route-related
state changes atomically and obsolete feature effects retire. After commit,
only bounded decorative representations may outlive those features. Keeping
an old live application tree around for appearance is not an acceptable shortcut.

## Examples that exercise the general model

### Shared element moving between structural homes

A prominent element begins inside the splash page's `main`. On the destination
page, its corresponding semantic element belongs inside `header`.

The framework animates a decorative representation between their placements.
The route commits midway; the real destination element is now in the header,
while the decorative representation continues along its track. Incoming text
slides and fades in before that movement finishes. A noninteractive destination
can expose its paint at settlement with no jump. An interactive destination,
such as a header link, is visibly usable from commit; its representation crossfades
against it. The no-invisible-controls policy takes precedence over hiding duplicates.

A logo is one instance. The same mechanism applies to images, titles, cards,
navigation indicators and groups. Neither the API nor implementation should
special-case branding.

### Card → half-page surface → card

A participant can expand through an intermediate shape and recontract, with
content tracks overlapping its geometry. Its path is not limited to interpolation
between two endpoint rectangles. Intermediate geometry can refer to anchors,
container bounds or viewport-relative dimensions.

Distinguish a decorative waypoint from an actual expanded application state.
If the enlarged surface exposes meaningful readable or interactive content,
that content must exist in the semantic application view. It cannot exist only
inside an inaccessible visual copy. A later user-requested collapse is a new
state change, not merely continuation of a decorative timeline.

### Whole-layout reconfiguration

Several participants rearrange together: a main surface expands, secondary
panels contract or move, an image changes placement, and text enters while other
content leaves. Tracks can share cues and measured relationships without having
identical timing. Unaffected elements retain their normal semantics and layout.

These examples are acceptance scenarios, not an exhaustive catalog. Related
design precedents include Material's [card transitions](https://m2.material.io/develop/ios/components/cards/)
and [container transforms](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md).
Those precedents do not prove our implementation or define its entire scope.

## Svelte realization

Svelte remains responsible for rendering each semantic view. Keep the decorative
transition layer under a stable framework Host so page replacement does not
destroy an active visual track. Do not arbitrarily reparent page-owned Svelte
nodes between component trees or assume identical matching keys preserve a node
across unrelated parents.

Use Svelte's rendering synchronization to capture eligible source geometry and
resolve destination geometry. [`tick()`](https://svelte.dev/docs/svelte/lifecycle-hooks)
waits for pending state updates; it does not establish font, image, asynchronous
content or arbitrary layout readiness. Readiness needs an explicit bounded policy.
Svelte's [`crossfade`](https://svelte.dev/docs/svelte/svelte-transition) is a useful
simpler primitive, not the complete timeline/ownership/routing solution.

The normative path commits underneath the decorative layer and measures the real
destination afterward. Before commit, tracks may use measured source geometry,
viewport/container-relative poses or explicit known anchors. Reject a pre-commit
plan requiring unknown destination geometry. Retarget after measurement; do not
promise an exact preplanned path when the endpoint was unknown. Do not mount an
arbitrary destination feature to measure it: that may start business effects.

A prepared destination projection is deferred research, not a co-equal first-slice
path or a requirement to duplicate every feature's view. If introduced, it
consumes an immutable render description, has no feature store/dispatch/native
engine and cannot execute arbitrary component mount effects. It must reproduce
the destination's relevant layout constraints, typography and assets, not just
its markup. Preparation is inert and excluded from semantics and interaction. A
preparation fingerprint includes layout inputs and viewport/font/asset readiness.
Recheck it at commit; stale preparation requires remeasurement and a qualified
retarget or stable fallback. SSR never creates this browser-only projection.

### Managed route outlet, render identity and failure

**Topology.** The staged handoff contract applies only to route content rendered
through a managed route outlet:

- A routed definition names one root destination slot as its route slot.
- Each destination case, or declared replacement, is a page feature with its own
  owner.
- The route outlet is the existing `FeatureOutlet` for that slot, placed in the
  root `FeatureViews` layout. Its body already owns the placement claim and keys
  rendered instances by owner token
  (`packages/core/src/lib/application/FeatureOutletBody.svelte:11-33`).
- The outlet registers its attachment with the Host. While it is not attached,
  staged admission is unavailable (`unmanagedRouteRender`), and pending
  transactions end `cancelled(detached)`.

Applications that render route pages with ordinary markup keep existing immediate
behavior; their staged requests degrade and make no handoff claim. Shell markup
outside the outlet, such as a persistent header, may host participants. Its
rendering is not part of a route render identity and is covered by the Host
boundary below.

**Render identity** is the tuple (attachment epoch, route instance owner token,
render attempt number). Each instance mount starts a new identity; a render retry
increments the attempt number.

**Checkpoints** are Host-owned and run in Svelte's render phases, never in reducers
or the queue drain:

- **`beforeRemoval(identity)`** runs in the pre-effect before Svelte removes an
  outgoing instance, the existing pre-render capture position. It performs the
  [value handoff](#capture-timing-and-value-handoff) from already-sampled values
  and reads no style or geometry of leased outgoing sources.
- **`rendered(identity)`** runs in the post-effect once the incoming instance's
  DOM exists. The route scroll policy and then destination measurement follow in
  the Host's next batched phase.
- **`failed(identity)`** comes from the route boundary.

Svelte may coalesce several committed turns into one render. Only a rendered
instance reaches checkpoints. A committed but never-rendered instance records the
render outcome `notRendered`, has no geometry and starts no incoming decoration.
Domain outcomes still record every turn.

**Route boundary.**

- **Placement.** The framework places an owned Svelte boundary inside the outlet
  body, around each instance's rendered content. It is inside the placement claim
  and outside the instance's own nested `FeatureViews` scopes.
- **Coverage.** It observes supported synchronous render and reactive-update
  failures of that subtree. It does not cover detached asynchronous callbacks or
  event-handler errors.
- **On failure:**
  1. Record `renderFailed(identity)`.
  2. Settle that identity's choreography as failed and release its decoration
     and suppression leases.
  3. Show the declared route fallback in place.
- **Why the claim survives.** Placement validation still sees the outlet, so the
  existing missing-placement failure is not triggered. Nested scopes inside the
  failed subtree are disposed with it and unregister their placement
  requirements.
- **Business lifetime.** The page feature's business lifetime continues to follow
  committed state. Domain navigation away replaces the identity normally.
- **Fallback.** It is declared at the outlet: application markup, rendered by the
  framework, with an inert, bounded error summary and a render-only `retry`.
  - Retry re-renders the same owner under a new attempt number. To retry, the
    framework dispatches no domain action and re-executes no reducer effect.
    The owner's managed initialization is not reattempted: each entitlement is
    attempted once and is not retried on remount
    (`packages/core/docs/managed-initialization.md:9`).
  - Remounting the view may still run supported view initialization hooks and
    owner-bound native requests. Intrinsic native resources reinitialize under
    their existing ownership contracts. No exactly-once network guarantee is
    implied: an application-level initial read triggered from view
    initialization must deduplicate or reconcile against the same owner's state,
    under the qualified same-owner contract. Business retry remains an explicit
    domain action.
  - Retry is user-initiated only; there is no automatic retry loop. A repeated
    failure shows the fallback again.
- **Escalation.** A failure inside the fallback, or a route failure with no
  declared fallback, escalates once to the Host boundary.

**Host boundary.**

- **Scope.** The Host wraps its content in an owned boundary. It handles any
  supported render or update failure it observes: in shell markup, in
  shell-resident participants, in a route fallback, or a route failure without a
  fallback.
- **Action.** It disposes all Host visuals and leases, then invokes the existing
  explicit teardown (claim release and application destruction) exactly once.
- **Stale failures.** Errors from retired identities, or after teardown, are
  diagnostics only. A stale failure cannot destroy a replacement attachment.

**Unsupported placement.** An application-owned Svelte boundary between the route
outlet and its `FeatureViews` scope is unsupported:

- If its failed branch removes the outlet, the released claim triggers the
  existing missing-placement root failure
  (`packages/core/src/lib/application/renderer/placement.svelte.ts:51`).
- The framework cannot observe errors such a boundary catches.
- Svelte exposes no boundary ancestry that would let the framework reject this
  placement, so it is documented as unsupported rather than promised safe.
- A choreography affected by an error caught there settles by its absolute
  deadline.

Application boundaries entirely inside a page view, or enclosing the whole
`FeatureViews` scope, behave as ordinary Svelte boundaries. They carry no handoff
or failure-protocol guarantee for the errors they catch.

**Separate outcomes.** Record a successful domain commit separately from any
subsequent render failure. Test later conditional-branch failure, later reactive
failure, fallback failure, retry, suppression cleanup, and failure after
supersession in real browsers.

Pose continuity and velocity continuity are separate guarantees. Built-in tracks
must carry position and velocity through supported retargets; arbitrary driver
paths must declare their continuation capability. Resizes, scrolling or late font
changes can invalidate geometry. Coalesce measurements per frame and use a bounded
retarget strategy. Do not promise zero discontinuity for unsupported geometry or
when reduced motion explicitly requires immediate settlement. Report the fallback.

Batch geometry reads and style writes. Use the existing ownership/property-lease
foundations so Svelte rendering, managed playback and CSS do not compete for the
same property. Geometry support and fallbacks must be documented explicitly;
arbitrary DOM cloning does not guarantee faithful CSS, text or native surfaces.

## Interruptions and failure

- A newer accepted request supersedes obsolete visual work. Continue from the
  displayed pose where supported; never queue an unbounded sequence of old moves.
- **Returning the still-current page.** When a transaction ends before commit (`vetoed`, `cancelled`,
  `returned`, `failed` before reduction) or the commit is `refused` or
  `failed(reduction)`, the still-current page is returned from the displayed
  poses:
  - representations retarget to their sources;
  - feature-owned leases continue to their stable values;
  - the source paint is then revealed and the representations are disposed.

  This is bounded by the choreography's existing visual run deadline, which is
  not extended; reduced motion settles immediately. Retired features are never
  revived.
- Cancelling a visual after commit does not silently roll back navigation.
- A failed or skipped decorative phase cannot indefinitely prevent an otherwise
  authorized commit. A still-valid transaction takes the next-turn cue; guards
  may still veto or invalidate it.
- Reduced motion produces the correct semantic destination without requiring the
  decorative sequence. Changing the preference during playback settles safely.
- Browser back/forward has already changed location. Reconcile it through the
  routing contract rather than undoing/replaying history to force an outro.
- Missing targets, unsupported geometry, deadlines, host teardown and errors
  release visual layers and property leases, leaving the committed page usable.

Finite run budgets include readiness and capture as well as playback. They do
not make synchronous JavaScript preemptible. Continuous decoration cannot keep
a finite navigation transition alive. Cleanup from a predecessor cannot restore
styles over a successor's active leases.

### Timing origins and deadlines

- **Admission** happens in the root FIFO, with no DOM work.
- **Preparation** happens at a frame checkpoint the Host schedules for itself
  after admission; admission changes no rendered state, so no Svelte flush can be
  relied on. Preparation covers representation capture, geometry sampling and
  lease acquisition, and runs in the Host's batched read and write phases. It
  never runs inside reduction or the queue drain.
- **t=0.** The choreography timeline's t=0 is the frame in which preparation
  completes and playback starts. Cue times are relative to t=0.

Two absolute deadlines are fixed when they are set. Neither is restarted by
measurement, retargeting or readiness:

- **Cue deadline**, on the root scheduler: admission time + declared preparation
  budget + cue time + bounded slack.
- **Visual run deadline**, on the Host clock: t=0 + declared duration + bounded
  slack, capped relative to admission.

If preparation exceeds its budget, the choreography settles, and the still-valid
transaction takes the next-turn cue.

Tracks declare one of two anchors:

- **Timeline-relative** tracks seek to their elapsed progress when late.
- **Render-relative** tracks start at the `rendered` checkpoint. They must finish
  by the visual run deadline or settle.

Asset readiness can delay or retarget a visual track but never holds semantics or
the commit. Gesture-driven progress and release velocity remain compatible
future inputs.

### Capture timing and value handoff

Prepare host-owned representations before retirement, during preparation. A
noninteractive shared participant may animate on its representation from t=0,
with its real paint suppressed. Interactive content follows
[Control and affordance paint](#control-and-affordance-paint).

For outgoing content that must continue past the cue:
- keep its prepared representation hidden;
- animate the real content with feature-owned leases before commit.

At `beforeRemoval`, reveal the representation with:

- each participant's **actual current track state**, including any settlement
  caused by focus, preference or fallback, never the nominal timeline value;
- the **last sampled layout geometry** (see
  [Geometry sampling, capture and recapture](#geometry-sampling-capture-and-recapture));
- foreign ancestor appearance counted **exactly once**.

Never read outgoing styles or geometry at that checkpoint: retirement has already
restored feature-owned leases (`packages/core/src/lib/application/renderer/property-leases.ts:76-85`).
No capture happens inside reduction or cancellation, and no live lease is
transferred.

Same-frame removal and reveal, with no painted cancellation-restored styles, is a
required prototype proof. Until it is proven, this mechanism is not a supported
capability.

A representation is a visual snapshot. Later content changes do not silently
update it. Missing or uncapturable sources use the authored fallback chosen when
the plan is constructed, before playback starts (for example, finishing before
the cue); it is never invented retroactively. Actual non-staged removals still
need a valid earlier snapshot, or they skip that track.

**Traversal and rapid reversal.** Existing representations may continue, and
surviving live tracks can use qualified numeric retargeting. Retired
feature-leased content without a prepared representation settles or skips rather
than claiming uninterrupted capture. Stable, unleased sources keep their existing
capture path.

### Control and affordance paint

The default policy for focusable control boxes and declared affordance parts is
**hold-then-fade**:

- **Before commit**, paint-reducing properties hold at their stable appearance.
  These are opacity, paint suppression, and clipping that hides content.
  Transforms that move paint and hit box together remain allowed.
- **After the reveal**, the control content's representation plays the remainder
  of its declared track until the track's original end time. If the declared
  track ends at or before the cue, the preset's documented post-reveal fade
  duration applies instead, bounded by the visual run deadline, so held controls
  never vanish in a single frame.

This is a documented default applied when the plan is constructed and reported
in the plan diagnostics. It is not a timing invented at runtime.

**No contrast threshold is assumed.** A custom pre-commit reduction policy for
control or affordance paint must declare an explicit, measurable criterion, for
example a minimum opacity for named affordance parts. It is accepted only when its
policy kind is listed as qualified in the capability table: browser qualification
must have measured that criterion on the rendered affordance. Unqualified custom
policies are rejected when the plan is constructed, and fall back to
hold-then-fade with a diagnostic.

**Visible focus.** When visible focus arrives on any participant, its paint
tracks settle to stable and stay pinned for the rest of the pre-commit window.
The reveal then uses that settled state.

### Geometry sampling, capture and recapture

**Sampling.** During the pre-commit window, the Host samples every hidden
representation's source in its per-frame batched read phase. Each sample records:

- the layout rect, with this choreography's own transform channels inverted
  (they are known numerically);
- the current accumulated appearance of foreign ancestors: opacity product and
  supported 2D transform.

Ancestors leased by this choreography contribute through the plane's own
composition, not through the sample.

**Reveal.**

- The reveal uses the last sample. A sample made stale by a main-thread stall is
  used as-is and reported.
- Two conditions mark the handoff `unsupported`:
  - the source geometry is outside the qualified coordinate matrix;
  - no valid sample exists before a deadline.
- When the handoff is `unsupported`, the representation is not revealed, the
  track settles to its end state at removal, and the fallback is reported. No
  pose is guessed.

**Capture.** Preparation capture, which earlier revisions called admission
capture, is a new qualified operation. It runs at the preparation checkpoint,
not in the admission control. The current capture guards reject active leases
and transformed or faded ancestors.
- For properties leased by **this** choreography, the copy records the lease's
  stable projection, not the displayed value; the plane reapplies current track
  values.
- For **foreign** leases, the copy records displayed values without acquiring
  their writing authority.
- Ancestor appearance is converted into the plane exactly once.
- The guard against cancellation-restored snapshots remains.

**Recapture.** Content invalidation triggers recapture under the same rules at
the next Host frame checkpoint, or settles that track. Detecting invalidation within
the supported matrix, without per-feature revision counters, is a required
prototype proof.

### Geometry tracks

Use numeric position, bounds, radius, inset-clip and opacity channels. Compose
their transform once at the writer; the existing transform string mixer is not a
multi-writer compositor.

Current recipe `replace` behavior is unchanged; continuous retargeting is an
explicit new capability.

Prototype absolute cubic Hermite segments from displayed position and velocity
to the new endpoint, with zero final velocity, including equal-endpoint cases.
- Position may overshoot where declared.
- Bounded properties must respect their ranges. Where incoming velocity makes
  that impossible, explicitly relax velocity continuity and report the
  constrained fallback.
- Do not claim both guarantees at once.

### Content policy

- Position-only motion defaults to translation.
- Text-bearing size changes default to surface resizing with content crossfade,
  not glyph scale.
- Explicit options are scale for images and icons, reveal by clipping
  final-layout content, and bounded opt-in reflow for small subtrees.
- If capture fails, settle the content and keep eligible translation rather than
  inventing a stretched-text fallback.

### Nested groups

- Representations are flat siblings in the plane.
- Independently animated descendants are omitted from ancestor copies and replaced
  by layout-preserving placeholders.
- Parent-relative poses and appearance are computed once, in the common coordinate
  space.
- Typed leases extend to per-corner radius, inset clipping and paint suppression.
- Complex shadows use a stable or crossfade representation until a typed
  interpolation is qualified. Do not imply that arbitrary CSS can be interpolated.

### Plane and scrolling

**Plane.**

- Offer an explicitly placed stable plane outlet, with a document-level default.
  Coordinate-space conversion and clipping are part of its contract.
- Unsupported stacking or top-layer relationships skip the affected tracks. An
  arbitrarily high z-index is not a correctness mechanism.
- Handle scrollbar-gutter changes with stable layout or remeasurement.
- Offscreen or fully clipped source participants default to the missing-source
  fallback.

**Focus and user scroll.** Focus uses prevent-scroll where supported, before the
chosen scroll policy. User scroll subsequently rebases motion; restoration never
fights it and never reruns on ordinary geometry invalidation.

**Physical movement versus route commits.** Physical entry or fragment movement
and a semantic route commit are distinct scroll events:
- Same-route native anchor navigation keeps browser anchor behavior. It runs no
  route focus and no top restoration, and it rebases active motion.
- **On a semantic route commit**, the declared `top`, `preserve` or `entry-restore`
  policy wins over a retained native hash.
  - If `entry-restore` has no trustworthy saved position, preserve the current
    scroll; do not implicitly follow the retained hash.
  - Following the hash requires an explicit fragment-target policy. It resolves
    once after the destination renders, against a connected target. A missing
    target preserves the current scroll; there is no unbounded readiness polling.
- Avoid a second automatic native scroll that overrides the chosen policy. This
  precedence needs browser proof alongside the existing native-fragment behavior.

### Scroll restoration ownership

Scroll ownership is an opt-in capability of a routed definition. Without it,
browser restoration behaves as it does today, and staged handoffs rebase to
whatever scroll the browser applies. With it:

- **Authority.** The attached route binding, already the sole history writer,
  owns restoration. On attach it records the current entry's
  `history.scrollRestoration` value and sets `manual`.
- **Storage.** Positions are kept in two places:
  - An in-memory map keyed by the binding's namespaced entry identity
    (`chain`, `id`, `index`). It is bounded to known live entries under a fixed
    cap and updated from the Host's scroll observation.
  - A bounded persisted copy: an optional, versioned field inside the
    framework's existing `__composableRoute` entry record
    (`packages/core/src/lib/routing/managed-history.ts:23-50`). It holds the
    document position and at most a small declared number of keyed scroll
    containers.

  Only the binding writes the persisted copy, by replacing the current entry:
  immediately before it pushes a new entry, on `pagehide` and on hidden
  visibility, and on scroll idle at a bounded low frequency. There is no other
  writer, and no saved entry is ever inferred from matching URL text.
- **Restoration.**
  - On a semantic route commit, the declared policy applies after render and
    before measurement. `entry-restore` reads the in-memory map first, then the
    persisted copy.
  - Same-route Back/Forward restores through the binding's settlement signal,
    even when no domain action or render occurs.
  - Without entry identity or a saved position, use the current native
    fragment's connected anchor; without one, preserve the current scroll.
- **Reload and new documents.** The manual mode is stored per history entry and
  inherited by pushed entries, so the browser does not restore those entries. The
  attaching binding restores the entry's persisted position once, after hydration
  and the initial render and before measurement. Without a persisted position,
  native initial fragment scrolling or the load position stands.
- **Back/forward cache.** The document and its scroll are preserved; nothing is
  restored, and active motion rebases.
- **Detachment.**
  - On detach, the binding flushes the current position into its entry record and
    restores the recorded mode on the current entry only.
  - Other entries visited while it was attached keep `manual`. While no routed
    binding is attached in the document, traversal into those entries gets no
    restoration from either the browser or the framework. This is the explicit
    fallback contract. The positions stay persisted for a later attached
    traversal or reload.
  - Reattachment does not restore retroactively.

Browser throttling of history writes, `pagehide` ordering, manual-mode
inheritance, and reload, back/forward-cache and detach behavior all require
real-browser qualification.

## Authoring boundary

Application agents supply layouts, semantic content, participant correspondence,
visual states, paths/timing and domain navigation policy. They should not need
per-feature clone helpers, measurement subscriptions, motion revision counters,
cleanup registries, router callback chains or guessed completion timers.

Provide presets, declarative choreography and managed custom drivers under the
same lifecycle. Drivers receive scoped visual capabilities, not business dispatch,
history or focus authority. Explicit business decisions remain explicit; generic
rendering machinery belongs in the library.

## Proof required before public API finalization

There are two prototype gates. First prove route authority, semantic interaction,
render ordering and cleanup with a small implementation; then use that mechanism
in the visually demanding reference below. A beautiful demo alone cannot prove
the lifecycle, and passing lifecycle tests alone cannot prove the visual design.

Build one demanding reference interface using candidate public APIs that covers:

1. Shared movement across a mid-timeline route commit with overlapping incoming
   text, correct `main`/`header` structure and no duplicate accessible content.
2. Card expansion through an intermediate pose and recontraction, plus a real
   interactive expanded state to prove the semantic distinction.
3. Coordinated whole-layout reconfiguration with several independently timed tracks.
4. Rapid reversal, repeated navigation, viewport resize, nested scrolling,
   late geometry, reduced motion and host destruction.

Inspect intermediate frames and motion continuity, not just final screenshots.
Verify semantics, keyboard behavior, focus, history, effect retirement and cleanup
alongside appearance. Test SSR/hydration with stable content and no automatic
replay. Measure frame work, bundle cost and retained resources.

Assert exact request results, transaction outcomes, domain-action counts and
history writes, not only the final URL. Include at least these cases:

**Admission and freshness.**
- Every request result.
- A request made before a traversal and dequeued after it: `stale`, never
  degraded.
- A request made during a correction: degraded, with one action.
- `drop`.
- An unmanaged route render.
- No binding.

**Pending transactions.**
- Supersession, returned, and explicit cancel queued behind a reserved commit.
- An explicit return intent, and a request for exactly the committed URL, each
  yield `returned` or `unchanged`.
- A same-key, different-URL request under a query-collapsing custom route key
  (`/search?q=old` to `/search?q=new`):
  - admitted and `committed(accepted)`, with the `writePolicy` history write;
  - an unrelated same-key edit while pending does not cancel it;
  - reducer normalization is `redirected`, although the key matches;
  - a reducer that ignores it is `refused`.
- Owner retirement, including self-retirement by the transaction's own commit.
- `routeKeyFailed`.
- Default and custom query identity.

**Traversal.**
- Route-affecting and native-fragment classification.
- Reclassification at settlement.
- A matched correction arrival.
- A correction that fails with and without re-establishment.
- Reentrant requests between observation and settlement.

**Outcomes.**
- `vetoed`, `refused`, `failed(reduction)` and `failed(routeClassification)`.
- History write failure and the resulting uncertainty.
- Redirect.

**Cues and deadlines.**
- Duplicate cues.
- Early visual terminal outcomes for valid and stale transactions.
- Deadline expiry.
- A reduced-motion change during the pre-commit window.

**Render.**
- Later branch and reactive failure, fallback, retry, fallback failure, and shell
  failure.
- On retry: no dispatched domain action and no reattempted managed
  initialization; view-level native resources reinitialize under their
  contracts.
- Coalesced `notRendered`.
- Stale failure after replacement.

**Visual.**
- Hold-then-fade controls.
- Visible focus arriving mid-fade.
- Handoff after scroll and reflow in the pre-commit window.
- Recapture without double opacity.
- `unsupported` handoff.

**Scroll.**
- Reload, back/forward cache and detach restoration.
- Manual-mode persistence after detach.

Also include absent or detached Hosts, unrelated state edits during staging,
keyboard focus during suppression, nested shared groups, and stale prepared
geometry. Verify that no destination effects start in preparation.

Review the resulting application code for repeated infrastructure, including
machinery hidden in helpers. Iterative agent development is expected. The
architecture checker is not an acceptance authority or a prerequisite.

The public syntax, the exact supported projection/geometry matrix, default
timing, budgets and the qualified custom-policy list remain implementation
decisions to prove. The objective, the semantic boundary, the overlapping
choreography model and the protocol above are agreed design requirements, not
optional conveniences to remove if endpoint fades are easier.
