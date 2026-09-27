# Application architecture completion design

26 September 2026 · Design decisions for the next implementation cycle

This addendum resolves the remaining authoring design around the released core
0.13.1 contract. It supplements [the original specification](application-authoring-and-motion.md)
and supersedes conflicting future-design proposals identified below. It does
**not** change the capabilities of installed packages. Proposed public names are
provisional; the ownership and behavioral decisions below are the implementation
contract. This is a source-grounded design, not an independent review or evidence
that the proposed capabilities have been implemented.

## 1. Scope and baseline

The objective is to let an agent implement distinctive, well-factored applications
without recreating framework infrastructure. Preserve explicit domain decisions;
remove repeated lifetime, animation, focus, and cleanup machinery. Iterative
implementation and testing are expected. A first-attempt success requirement is
not part of acceptance.

The original specification's open checklist predates the release. Do not treat
every unchecked AAM/DEF entry as a current defect or redo completed repairs.
Reconcile each historical entry with released source and its evidence before
assigning further work.

| Area | Observed baseline | Completion needed |
| --- | --- | --- |
| Application assembly, managed slots and genuine views | Public application exports exist, including keyed slots and owner-bound action observation | Preserve these foundations; extend their lifecycle rather than introduce another controller |
| Managed motion | Public single/group recipes, fixed declared targets, stable styles, cancellation and reduced-motion handling | Shared geometry, dynamic keyed membership, interaction bindings and a public custom rendering boundary |
| Visual retention | Internal HTML capture and bounded outgoing fade exist | Publicly selectable presentation policy, broader qualified visual projections, coherent transition transactions |
| Animated dismissal | Public guidance requires an explicit deferred child, callbacks and parent completion action | Opt-in automatic visual retention after atomic logical removal |
| Native companions | Package-specific managed ownership and retirement contracts exist | A consistent extension contract and examples for composing native surfaces with presentation |
| Guidance | Current contract accurately excludes shared layout and custom drivers | Versioned capability map and removal of contradictory historical guidance |

Source anchors: [application exports](../../packages/core/src/lib/application/index.ts),
[motion exports](../../packages/core/src/lib/application/motion-public.ts),
[current motion guide](../../packages/core/docs/application-motion.md),
[authoring contract](../../packages/core/docs/application-contract.md),
[capture implementation](../../packages/core/src/lib/application/renderer/capture-html.ts),
[capture channel](../../packages/core/src/lib/application/renderer/capture-channel.ts),
[run protocol](../../packages/core/src/lib/application/renderer/motion-run.ts).

The capture implementation is deliberately conservative: it rejects, among other
things, transformed/clipped spaces, flex/grid descendants, generated content and
unsupported elements. Its existing fade is not a general shared-layout system.
Internal leases, run outcomes and transform composition are foundations, not
public extension guarantees.

## 2. One ownership model

Use four distinct lifetimes:

1. **Root execution:** domain state, reduction, effects and instance identities.
2. **Feature instance:** accepted actions, child effects and native resources.
3. **Host attachment:** document services, target registrations and rendering.
4. **Visual run:** temporary properties, snapshots, playback and cleanup.

A visual run may outlive a removed feature only under the still-attached host.
It cannot hold a dispatch-capable feature view, a subscription to that feature,
or its live native engine. Root destruction or host detachment disposes the run.
Reattachment never resumes an obsolete run.

Every target address includes root, host attachment, feature lifetime, placement
and local target identity. User keys are matched within a declared transition
scope; they are not lifetime authority. Two roots may both use `title:42` without
sharing anything. Reusing key 42 after retirement cannot revive its old handles.

The framework owns run IDs, deadlines, cancellation, arbitration, target
readiness and focus scheduling. Applications own accepted state changes, content,
geometry choices, appearance, close policy and service protocols.

## 3. Resolve presentation lifecycle now

**Decision: new automatic presentation uses immediate logical removal plus an
inert outgoing visual.** Keep the current explicit deferred protocol as a
compatibility mode; never infer or silently switch modes on an existing slot.

An accepted close action runs ordinary managed reduction. The parent removes the
child and updates every related domain field in that same atomic turn. The
framework retires the child and cancels its work using existing managed ordering.
It may subsequently animate a visual projection. Visual completion performs no
domain mutation and needs no feature completion action.

Example: an editor, its `activeEditorId`, and its reservation all change in the
same accepted-close reduction. There is no hidden later `editor = null` write.
Dirty-work confirmation and save-before-close remain explicit domain behavior.
Work that must survive closure must be accepted and owned by a surviving parent.

This resolves the parent-invariant blocker in
[the deferred lifecycle proposal](../../plans/upgrade-1-agent-authoring/PRESENTATION-LIFECYCLE-DESIGN-v1.md).
Its framework-only clear and prospective terminal parent-removal transform are
not the chosen direction. That proposal correctly identified the invariant risk;
this design accepts the separate visual lifetime needed to avoid it.

Escape, outside click and close buttons request a declared domain action. A veto
leaves the feature and its current visual alive. Acceptance, parent removal and
replacement all use the same logical lifetime rules. For immediate presentation
removal (not staged routing), with no Host, no motion,
reduced motion, missing targets or failed capture, domain results are identical.

No arbitrary live Svelte subtree is frozen or remounted as an outgoing visual.
Supported retention is either framework capture or a qualified immutable visual
projection with no feature view, hooks that start work, or native resources.
If neither is available, settle to the correct destination without an exit.

## 4. Shared layout and coordinated choreography

After independent review, the focused motion design and its review dispositions
supersede conflicting motion details in this addendum: no pointer shields,
post-commit destination measurement by default, pre-retirement decorative
representations for tracks spanning commit, explicit content/scroll policies,
and no claim that the existing transform mixer provides multi-writer composition.
Earlier alternatives below are historical context, not approved first-slice mechanisms.

The focused [fluid layout motion design](fluid-layout-motion-design.md) records
the agreed product objective and refines this section: whole-layout choreography,
semantic participants with decorative continuity, and overlapping tracks across
an authorized route-commit cue. Examples are generic coverage cases, not special
APIs for logos or cards.

For staged navigation, the focused document's **Navigation authority and observable
state** section takes precedence over the abbreviated sequence below. In particular,
the root routing coordinator owns the pending protocol, but staged browser requests
require a live history attachment epoch and detachment cancels them;
an explicit staged intent is not an intercepted/replayed arbitrary reducer action.
History I/O is not physically atomic with domain reduction. The focused document
also defines preparation invalidation, interactive paint suppression, nested-group
composition and the limits of velocity continuity.

Add a managed transition scope to the existing Host/outlet system. The application
declares named participants, stable matching keys, required/optional tracks and
visual states. The renderer provides source/destination geometry and visual
representations. Matching is one-to-one inside that scope; ambiguous duplicates
produce a diagnostic and skip the affected track, never a guessed match.

Support two explicit operations:

- **Layout change:** a surviving target moves or resizes. Animate from its previous
  committed geometry to its new geometry without replacing its semantic element.
- **Shared element:** distinct outgoing/incoming elements represent the same visual
  participant. Animate a host-owned representation between them. The destination
  remains the sole semantic and interactive element.

Do not require the same DOM node to survive navigation. Do not require app reducers
to carry geometry, playback progress or motion revisions.

For capsule/orb/title choreography, the intended authoring is one scope with
`capsule`, `orb` and `title` participants, plus ordinary content tracks. The
capsule changes bounds/radius, the orb follows its declared path, and the title
moves between measured anchors. The application supplies timings, path shape,
typography and visual identity. It does not clone elements, synchronize route
commits, keep old feature stores alive, restore styles, or manage cancellation.
The actual application/reference is still needed to establish visual fidelity;
this document does not claim its precise rendering has been reproduced.

### Generic choreography, intermediate geometry and semantics

Shared motion is not restricted to logos, routes or endpoint interpolation. A
participant may follow multiple visual stages: card → half-page surface → card,
thumbnail → detail image, or compact control → expanded panel. Intermediate poses
may be pure decorative geometry without a corresponding mounted semantic element.
Declare geometry relative to measured anchors or viewport/container bounds, with
independent tracks for position, dimensions, radius, content opacity and clipping.
Do not silently scale text just because its containing surface expands.

Distinguish a decorative waypoint from a real expanded application state. If the
expanded card exposes readable or interactive content, that content belongs to
the actual semantic view and domain state. It cannot exist only in an inaccessible
animation copy. Automatic return within one visual sequence and a user-requested
collapse later are different contracts; the latter is a new accepted state change.

Semantic participants remain in their correct document structures for every
committed state. Cross-view continuity uses a separate host-owned decorative
representation, excluded from accessibility, focus, hit testing and document
identity. It never replaces the semantic content. Where duplicate painting is
suppressed, preserve the real participant's semantics and usable focus indication;
do not apply aria-hidden, display:none or visibility:hidden to semantic content
merely to hide its paint. Interactive content must retain coherent focus and hit
targets; use a visible semantic destination or skip the decorative track if needed.

The persistent object is the visual run, not an arbitrarily reparented page-owned
Svelte component. Keep any genuinely persistent live component under a separately
declared stable owner; do not use it as a substitute for page-local semantics.

Use a timeline of overlapping tracks and named cues. A route/domain commit is one
authorized cue, not a mandatory seam between every track. Tracks may span it
without resetting progress, pose or velocity. The incoming title can start while
a shared surface is still moving. A new destination measurement must preserve
continuity when retargeting; exact preplanned paths require destination geometry
before playback, supplied by a qualified render-only layout or declared anchors.
Do not mount an arbitrary live destination solely to measure it, since mounting
can start effects. Missing geometry needs an explicit readiness/fallback policy.

Examples establish coverage, not hardcoded feature types. Material's
[card transitions](https://m2.material.io/develop/ios/components/cards/) and
[container transform examples](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md)
illustrate related container/content choreography; they are design references,
not evidence that our Svelte implementation exists.

### Whole-page navigation: a commit cue within the choreography

A coordinated page transition can explicitly stage navigation. It is not limited
to decorative tracks around an immediately committed route. Its phases are:

1. Request navigation and resolve domain guards. An accepted request creates one
   owner-bound pending navigation transaction; it has not yet changed the current
   route or retired the current page.
2. Start the outgoing and shared tracks, advancing to the declared commit cue
   without requiring all those tracks to finish. The current page remains the genuine
   current feature until commit. The framework may apply a declared interaction
   policy, but cannot pretend the feature has retired while keeping it alive.
3. Commit through the normal managed route action and pure reducer policy. Update
   route-related domain fields atomically, perform the appropriate history write,
   and retire outgoing feature work. A driver cannot mutate route state. Recheck
   originating transaction authority and current domain eligibility at this point.
4. Render the destination, resolve its targets, and start its incoming tracks while
   eligible shared/outgoing visual tracks continue on the same timeline. A managed
   transition layer may bridge the DOM swap so the sequence remains visually
   continuous. Destination focus/accessibility cannot wait indefinitely for it.

The application supplies the choreography and navigation policy; the framework
supplies this sequencing. No application `setTimeout`, manual router callback
chain or animation-completion reducer bookkeeping is required. Pending navigation
is framework lifecycle state, distinct from the committed route. A loading/error
decision with business meaning still belongs to application state.

This staged mode is explicit and opt-in. Immediate navigation remains available.
An accepted destination is not a promise that obsolete navigation must eventually
commit: a newer request supersedes the pending transaction. Before commit, cancel
its outro and retarget toward the newer request, or return to the current stable
page if navigation is cancelled. After commit, a new request originates from the
new current page. Old completions cannot write history or navigate later.

If decorative outro fails, times out or is skipped for reduced motion, proceed to
the still-authorized commit without waiting for animation. A veto at revalidation
keeps the current route and restores its stable presentation. A failed intro
leaves the committed destination stable. There is no automatic route rollback
because a visual failed. The total finite deadline covers both sides and DOM
readiness; continuous decoration cannot extend it.

Browser traversal and external history changes have already changed browser
location and cannot be held behind an outro as though they were app requests.
Reconcile them promptly through the existing routing contract and use the capture
or bridging path below. Do not undo/replay browser traversal to manufacture this
sequence. Destination data readiness is a separate declared route policy; motion
does not fetch data or conceal an unbounded wait for it.

Qualification must cover rapid A→B→C requests before and after B commits, guards
changing during outro, back/forward during outro, repeated navigation to the
current destination, reduced motion, failed tracks and history write counts.

### Committed-change capture and interruption

The following path applies to immediate navigation, accepted presentation removal
and other already-committed state changes. In staged page navigation it begins at
the commit boundary after the outgoing phase above.

1. Accept each logical turn and retire obsolete owners atomically.
2. Capture eligible outgoing presentation before DOM removal, using valid cached
   geometry/projection when retirement has already destroyed a native surface.
   Never postpone resource retirement to obtain a snapshot.
3. Commit the destination DOM. Coalesce visual work within one render batch to the
   latest accepted renderable state; domain turns are never coalesced away.
4. Resolve registrations and batch geometry reads after render synchronization.
5. Acquire properties and run one coordinated plan; write styles after reads.
6. Settle once and release all transient resources.

The deadline starts when the renderer admits the transition, including capture
and target readiness. Asynchronous readiness is cancellable and bounded. A
synchronous JavaScript driver cannot be preempted by a timer; blocking driver
code is invalid and must be caught by review/performance qualification.

New accepted input supersedes old visual work. Retarget from the displayed pose
where the representation supports it; otherwise use the documented stable
fallback. An old cleanup cannot overwrite a successor's property lease. Keep at
most one active run and one predecessor visual per transition channel; release
the predecessor on transfer/settlement rather than accumulating history.

### Geometry and visual representation

Use viewport CSS pixels within one document. Scroll containers contribute their
measured offsets and declared clipping. Rebase on scroll/resize in the host's
batched measurement phase; if the coordinate space becomes unsupported, settle
the affected track. Do not repeatedly restart all tracks for every observer event.

Required first qualification: ordinary HTML, flex/grid layouts, nested scrolling,
2D translate/scale ancestors, border-radius surfaces, text and loaded images.
Perspective/3D, cross-document targets, arbitrary CSS filters/masks and live native
canvas/video capture require an explicit specialized projection or stable fallback.
These are declared boundaries, not assumed snapshot fidelity.

Use typed surface/text/image projections where generic cloning cannot preserve
appearance. A title with different line wrapping crossfades measured text
representations while moving anchors; do not stretch glyphs by default. Surface
dimensions/radius may interpolate independently from content scale. Pseudo-element
decoration needs an explicit projection, not an implicit promise to clone all CSS.

Snapshots are inert, outside accessibility/navigation, without duplicate IDs,
listeners or working controls. Destination visual suppression requires a managed
lease and must not remove semantics, focus indication or hit testing. Restore
it on every terminal path. If that cannot be maintained, use a visible destination
crossfade or skip. Never copy password/control values into generic snapshots.

Keyed collection motion uses scoped stable item keys plus instance epochs. Enter,
leave, reorder and same-key replacement have distinct traces. Dynamic membership
is an explicit extension alongside fixed-target recipes, not a silent change to
their validation. Virtualized/offscreen items without geometry use stable fallback.

## 5. Public custom rendering boundary

Provide three levels: presets, declarative recipes, and registered managed drivers.
All use the same run lifecycle and fallback rules. Drivers cannot bypass policy
by being placed in an `adapters` folder.

The public driver contract must expose:

- Read-only visual inputs, measured source/destination geometry, typed targets and
  an abort signal. Inputs are snapshots of the accepted visual request.
- Managed property writes, sequence/parallel tracks and frame scheduling.
- Bounded inert layers and scoped measurement/observation.
- Immediate resource adoption with idempotent cleanup, including resources that
  arrive after cancellation; acquisition failures also clean up partial work.
- A stable projection declared separately from the driver, usable without it.

No store, arbitrary dispatch, navigation, focus control or business I/O is supplied
to a driver. Native handles are available only through documented adapters with
stop/dispose contracts. This is an architectural boundary, not a JavaScript
security sandbox: raw DOM access and imported globals cannot be magically revoked.

Finite outcomes remain completed, superseded, skipped, failed, timed out and
disposed. Exactly one terminal outcome releases the run. Rendering completion
does not become a business-success signal. Initial public delivery exposes
bounded diagnostics and test observation, not arbitrary completion callbacks into
feature state. A future semantic mapping would require a separately justified
owner-bound queued-action contract.

Continuous visual drivers use a separate visibility/preference-controlled resource
lifetime and cannot hold a finite exit open. Pointer/hover/press bindings belong
to the same managed visual system; selected/expanded/submitted remain domain
state. Native semantic feedback is immediate even when a decorative track waits.

Property ownership is explicit per target/channel. Use the existing lease and
transform composition foundations; conflicting writers receive diagnostics and
stable fallback. The engine cannot compose arbitrary transform strings safely:
use declared transform channels or separate wrappers. Unmanaged CSS may style
unleased properties; it must not race a managed writer.

## 6. Focus, document services and native surfaces

One document coordinator orders participating layers across roots. One Escape or
outside event reaches only the top eligible layer; a veto does not fall through.
Legacy primitives need an adapter before mixed-layer guarantees are advertised.
Third-party overlays without one remain explicitly outside that guarantee.

Focus priority: newest active modal, then accepted route focus, then eligible
dismissal trigger, then a connected fallback. Apply it when the logical target is
ready, independently of decorative duration. Guard delayed work by attachment and
navigation identity. Count scroll locks/inertness by acquisitions so retiring one
root cannot unlock another. Default exit visuals hold no obsolete modal authority.
Any optional interaction shield is visual-run-owned, bounded and has no dismiss
authority; it must not block an eligible newly active destination.

For Maps, Charts, Graphics, Code, Media and Chat, retain each package's established
state/effect/native-resource split. Define a common documented adapter shape for
initialization, state reconciliation, native commands, event feedback and disposal.
Reuse genuine owner-bound action observation; do not introduce a second command
bus or buffering layer. Durable configuration comes from state; one-shot commands
before attachment are not silently replayed.

Feature retirement destroys live maps, editors, audio/video acquisition and GPU
resources according to their contracts. A static poster or adapter-supplied
render-only projection may animate afterward. It cannot retain a stream, network
subscription or engine. Unexpected engine failure becomes an owner-bound feature
result when semantically relevant; stale failures cannot affect a replacement.

WebGPU is currently unbuilt, as Graphics documents. It is a separate backend
capability, not a prerequisite for closing ownership/motion design. Likewise,
SvelteKit navigation requires an explicit single-writer adapter contract before
being claimed; existing browser SPA routing is not evidence for that integration.

## 7. SSR, accessibility and cost

SSR emits stable content with no DOM acquisition, motion promise or active run ID.
Hydration adopts that state without replaying entrances. Initial URL reconciliation
occurs through the established route policy; motion cannot write browser history.
Detach/reattach and reduced-motion changes settle to the latest accepted state.
Re-enabling motion does not replay past interactions.

Motion-free applications must not import an animation engine or companion engine.
Shared-layout and custom-driver adapters use explicit subpaths/capability injection.
Choose and document host budgets for simultaneous snapshots, retained nodes and
diagnostic records; exceeding one skips decoration without dropping domain input.
Measure bundle cost, layout reads, frame cost and retained resources on the actual
reference workloads before setting performance claims. No universal FPS promise.

## 8. Guidance is part of the capability

Publish a versioned table for each public capability: import, ownership, supported
geometry/surfaces, failure behavior, minimum version and tested example. Label
design sketches as unimplemented; never ask agents to infer public APIs from
private renderer classes. Keep examples and shipped declarations in agreement.

Resolve documentation contradictions during implementation. One observed example:
Auth's OAuth section says no managed ConnectedAccountsPanel is claimed, while its
later account section documents that supported component. Update the earlier
statement and prefer the current `startOAuthLink` flow. Also state the shared
per-tab OAuth pending-storage default and show explicitly isolated injected
storage for sibling auth instances. Persistence identity and feature lifetime are
different concerns; a new owner must not accidentally claim another flow's return.

The architecture checker stays optional, discouraged and unreliable as an
architectural authority. No task below depends on expanding it or passing it.
This supersedes older checker gates in the original specification and batch plans.
Use source review, observed behavior and installed-package consumption instead.

## 9. Implementation batches and acceptance

| Batch | Work and dependency | Definition of done |
| --- | --- | --- |
| A — Transaction and identity | Extend existing renderer checkpoint/capture/run mechanisms; finalize typed transition-scope and projection interfaces, including staged navigation | Real keyed removal proves ordering; rapid replacement and multiple same-batch turns cannot revive owners; every terminal path releases resources; immediate and staged navigation have explicit production/TestStore traces with atomic domain commits |
| B — Shared layout | After A interfaces: geometry, keyed matching, surface/text/image projections, retargeting and grouped tracks | Capsule/orb/title reference works through public APIs; nested scroll/2D transforms, resize, missing targets, duplicates, wrap changes and interruption have verified behavior |
| C — Automatic presentation and document coordination | After A interfaces; can proceed alongside B | Atomic parent invariants; veto/confirmation/save cases; no feature completion plumbing; nested/multiple-root and mixed-supported-layer focus/locks pass; legacy deferred mode unchanged |
| D — Custom and native integration | After A interfaces; can proceed alongside B/C | Public driver conformance suite; custom orb path and static native-surface exit use scoped resources; throwing, late and nonsettling drivers cannot leak or corrupt destination |
| E — Agent reference and shipped guidance | Draft alongside A; final after B–D | Installed-package examples compile/build and pass browser tests; iterative agent implementation reviewed for ownership and repetitive infrastructure; capability table and migration guide truthful |

Before parallel coding, A fixes interface shapes, event ordering, ownership and
fallback conventions in one reviewed contract. B–D can then work independently
against those contracts. Shared internals have one designated owner per batch;
parallel workers must not independently redesign the same registry or executor.

Required adversarial cases across the batches:

- Close/reopen, same-key replacement, reorder, navigation during exit, host
  destruction/reattachment, two roots with identical visual keys.
- Reentrant domain dispatch and same-turn parent invariants in production and
  TestStore; child effects retired before they can start new work.
- Reduced-motion change mid-capture/mid-playback, missing/late targets, failed
  measurement, thrown driver, rejected animation, deadline, cleanup failure.
- Focusable destination throughout transition, no duplicate accessible content,
  nested layers, veto, scroll locks and stale focus callbacks.
- SSR import/render, hydration, motion disabled and motion-free bundle inspection.
- Native resource retirement, late initialization, stale events and static fallback.

Test representative mid-transition frames as well as endpoints and interruption
traces. Endpoint-only tests cannot establish faithful choreography. Record the
browser/font/viewport conditions of visual evidence. A deliberately broken stale
cleanup, owner check or parent-invariant implementation must fail its relevant
test; do not mechanically mutation-test every line.

Compare the same reference before and after migration. Inventory removed phase
actions, revisions, timers, subscriptions, clone/measurement code and cleanup
registries. Separate custom visual algorithm code from reusable machinery and
count machinery hidden in helpers. Report actual reductions; no speculative
percentage target. Business decisions and visual quality must remain equivalent.

## 10. What counts as closed

The lifecycle direction, shared-layout model, custom-driver authority, native
surface boundary, focus policy and acceptance scope are decided here. Public API
syntax and browser realization still require an isolated implementation spike
and review; those are explicit engineering proofs, not permission to invent a
different ownership model in each application.

Do not mark the capability implemented until the public types, runtime, installed
examples, migration guidance and behavioral evidence all exist. Exact fidelity
for the reported capsule/orb/title application requires its source or visual
reference. Other supported work can proceed while that reference is obtained.
The previous npm release is complete and is not reopened by this design cycle.
