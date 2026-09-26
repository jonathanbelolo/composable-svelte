# Managed presentation lifecycle — design v1

Status: design for independent review, not an implemented API or validated runtime. Scope: proposal section 4, user-facing cleanup task 6. No existing cohort score, public API, or release decision changes.

## Decision

Defer adoption of a public lifecycle API pending resolution of parent invariants. Explore an opt-in managed **presentation slot** whose visual phase is owned by the existing root execution lifecycle. The application authorizes exit in a pure reducer decision; the framework associates that authorization with the incoming managed owner and a unique transition, drives the primitive, and proposes an atomic parent-consistent removal after settlement. The direct internal slot-clear approach is withdrawn below; a pure removal declaration is only a bounded experimental alternative. Parent removal and explicit replacement remain immediate and do not wait for animation.

Retain the current `PresentationState` compatibility workflow. Do not add automatic animation to every optional slot, infer replacement from immutable object identity, or make visual completion a business action. An ordinary nonanimated modal remains supported.

The initial prototype supports optional presentation slots and `Modal` only. Destination cases, nested slots and sibling instances must be represented in the identity model and tested, but broad component rollout is a later acceptance decision. No shared-element geometry, capture-based exit ghosts, custom animation drivers, or generic modal manager is proposed.

## Current source and actual gap

Source inspection used these concrete boundaries:

- `packages/core/src/lib/navigation/managed-integration.ts`: `bind` mints genuine presentation views, caches by exact owner/slot and enqueues dispatch/dismiss with the captured owner. Optional slots handle immediate dismissal before parent reduction; deferred dismissal preserves state for parent policy. `replaceOn` produces an explicit replacement intent. Ordinary state-object changes do not allocate a new owner.
- `packages/core/src/lib/execution/identity.ts`: root-local owner tokens and explicit paths are lifecycle authority; token liveness requires membership, not a matching numeric/domain ID.
- `packages/core/src/lib/execution/turn-queue.ts`: managed reduction, replacement/created-owner validation and reconciliation occur before publication. Failed pure turns are rejected atomically. The proposed presentation intent must join this boundary, not execute later as a best-effort effect.
- `packages/core/src/lib/application/FeatureOutlet.svelte`, `FeatureOutletBody.svelte`, and `RenderedFeature.svelte`: placement claims and keyed instances govern rendering; target owner comes from the genuine instance store. `surface` registers eligible capture elements and is not an animation-completion authority.
- `packages/core/src/lib/application/renderer/owner.ts`: one live Host claim per root, managed resource cleanup, registry disposal and initialization attachment. Reattachment creates a new Host claim; it does not revive the old registry.
- `packages/core/src/lib/navigation-components/Modal.svelte` and `primitives/ModalPrimitive.svelte`: genuine-view admission, optional manual presentation marker, callbacks and spring configuration. Visibility may retain an exit shell. Dismissing retires focus authority while visible pointer/Escape shielding remains. Entrance permits interaction. Modal currently uses primitive animation helpers, not the generic motion recipe completion channel.
- `primitives/presentationCompletion.ts`: a private witnessed-content seam settles a lost *previously bound* transitional pair in a cancelable microtask. Its pair uses status/content; it neither creates a managed transition nor settles never-bound content.
- `application/renderer/motion-lifecycle.ts` and `motion-playback.ts`: binding/attachment generations and cleanup already reject displaced visual work. Generic `useMotion` exposes no public completion callback. Its absent-target behavior classifies without creating a run. Those facts do not supply a presentation exit completion contract.
- `packages/core/docs/application-presentation.md`: explicitly calls current manual phase bookkeeping a compatibility workflow and requires owner-bound, distinct completion actions. It warns against relying on callbacks at teardown.

The duplication is the application's marker, entered/exited action types, callback wiring, phase guards and final null assignment. Business dismissal authorization, confirmation state, save eligibility, revision checks and explicit replacement are not duplication to remove.

## Proposed author contract (illustrative, not callable today)

A new composition declaration opts one slot into automatic lifecycle. A pure presentation intent accompanies the reducer result, analogous in placement to existing explicit replacement intents. Suggested vocabulary is `authorizeExit(slot)`; exact exported spelling and TypeScript inference remain subject to prototype review.

An illustrative parent decision is:

```text
on editor.dismiss:
  saving -> unchanged business state, no intent
  dirty  -> set confirmation=true, no intent
  clean  -> unchanged business state + authorizeExit(editorSlot)
on confirmDiscard:
  clear confirmation + authorizeExit(editorSlot)
on navigate:
  set editor=null immediately; ordinary managed reconciliation retires it
on replaceEditor:
  set new editor state + existing explicit replaceOn decision
```

The primitive receives the genuine view and opts into its managed lifecycle capability. Authors supply content and appearance, not `entered`/`exited` callbacks. No public imperative `completeExit()` method is exposed. A read-only phase projection is available for rendering and diagnostics, never copied into domain state.

Business work that must occur on acceptance of close happens in the authorizing reducer turn. Version 1 deliberately offers no business `afterVisualExit` action; requiring business state to wait for an animation reintroduces the boundary this design is removing. Applications that truly require such a protocol keep the explicit compatibility path pending a separately reviewed extension.

## Authority and identities

Use four distinct identities:

| Identity | Minted by | Meaning |
| --- | --- | --- |
| Root instance | Existing store execution | Isolation, lifetime and queue |
| Managed owner token | Existing reconciliation | This exact child lifetime, including same-domain-ID replacement |
| Transition serial | Root presentation coordinator | One entering or authorized exiting transition for that owner |
| Attachment attempt | Current Host/primitive enrollment | One concrete rendering attempt, invalidated by detach/rebind |

All checks use internal reference membership; diagnostic integer labels are not capabilities. Author intents name registered typed slots and are bound to the **incoming owner** during pure managed reduction. They never capture “whatever owner is there when an asynchronous effect runs.” A stale captured view fails the existing owner-envelope checks before its action can authorize the successor.

The coordinator is root-owned metadata, not a second store or application cache. It maps current owner tokens to bounded phase records. Records contain no duplicated business-state snapshot or DOM node. Renderer enrollment holds nodes separately and releases them with its resource scope.

A completion acknowledgement must match the root, live owner, phase, transition serial, current attachment attempt and genuine enrollment. Validate both when queued and when dequeued. Parent replacement/removal between those points wins; the acknowledgement becomes a traced no-op.

## State machine and commit ordering

| Current state | Event | Result |
| --- | --- | --- |
| No owner | Parent creates slot | Allocate owner and entering record; content immediately eligible for ordinary interactions |
| Entering | Current entrance settles | Presented; no domain action |
| Entering/presented | Dismiss denied or confirmation requested | Preserve phase and owner; application policy state may change |
| Entering/presented | Valid exit authorization | Allocate exiting transition; supersede entrance attempt; mark interaction/focus policy exiting |
| Exiting | Further dismiss or identical authorization | Idempotent; no new transition or resource restart |
| Exiting | Valid settlement | Proposed parent-consistent terminal commit; direct slot clearing is insufficient; see blocking correction below |
| Any live phase | Explicit parent removal | Immediate retirement and visual cancellation; never await settlement |
| Any live phase | Declared replacement | Retire predecessor; allocate successor entering record even for same domain ID |
| Any | Root destroy | Synchronous invalidation and cleanup; no completion-dependent work |

Exit authorization is irreversible for a given owner in v1. Reopening during exit requires an explicit new lifetime. This avoids a second cancel-exit business protocol; it is a design tradeoff, not a discovered application defect.

For an author turn: reduce once; resolve intents against the incoming lifecycle; validate slot membership and compatibility; reconcile proposed state/replacement; discard an exit intent if that same turn removes/replaces its captured owner; stage metadata; publish business state and lifecycle coherently; notify/render and execute effects using existing ordering. Invalid intent combinations reject the turn before publication.

For terminal settlement, the original proposal was a narrow internal queue envelope that applies the declared slot-clear operation without invoking the parent reducer. **Independent review found that proposal insufficient:** slot removal can change application cross-field invariants. Do not implement this direct-clear path as the proposed public contract. The parent-invariant decision below supersedes it. Exact queue and owner checks remain necessary but cannot establish domain consistency.

The child remains a live managed owner during exit. Existing managed work is canceled at retirement, not secretly at authorization. Visual controls are inert; already-started results still follow the ordinary FIFO queue and domain policy. Applications must authorize exit only when their business policy permits it (for example deny during saving). Do not add speculative early cancellation or drop legitimate accepted business results. An explicit programmatic action that removes/replaces the owner still wins; it cannot convert a different owner's completion into valid authority.

## Parent invariants: blocking design correction

Consider this valid parent state:

```ts
interface Parent {
  editor: Editor | null;
  activeEditorId: string | null;
  openEditorCount: number;
}
// Required at every published state:
// activeEditorId === (editor?.id ?? null)
// openEditorCount === (editor === null ? 0 : 1)
```

The current composition clears an immediate-dismiss slot in child reduction, then invokes the ordinary parent reducer for that same action. The parent can update its related fields in the same turn. The manual deferred path similarly supplies an explicit completion action through the captured owner, allowing the parent to clear all relevant fields together. A framework-only terminal assignment `editor=null` would leave `activeEditorId` and `openEditorCount` stale. Clearing those fields at exit authorization is also invalid if the retained editor remains nonnull throughout its exit. Hiding the intermediate inconsistency from the DOM does not repair the published store invariant.

This is not merely a concern about a redundant count that ought to be derived. A parent can own a selected pane, a bounded slot budget, an associated reservation, or a relationship among sibling editors. The framework cannot prove every such invariant is derived, nor may it infer a repair from field names. Business consistency must hold for non-renderer subscribers and TestStore too.

Alternatives evaluated:

| Alternative | Consequence / decision |
| --- | --- |
| Replay ordinary dismiss at completion | Re-runs authorization, may reopen confirmation or deny after exit; conflates a request with accepted settlement. Reject. |
| Invent a hidden after-exit business action | Requires new reducer handling and possible effects; conceals the action from authors while depending on their policy. Reject. |
| Require all parent-related fields be derived | Restricts legitimate domain models and is not statically enforceable for arbitrary reducers. Reject as a universal promise. |
| Remove domain state at authorization, retain a render-only snapshot | Can preserve atomic business invariants but changes retirement timing, view authority and exit rendering; creates the ghost/snapshot lifecycle previously excluded. A separate design, not a free fix. |
| Declare a pure atomic parent-removal transform | Makes domain cleanup explicit once at slot declaration; can eliminate per-editor entered/exited wiring but adds a new author decision and framework validation surface. Worth a bounded prototype, not approved for public adoption. |
| Keep explicit completion action | Already supports parent policy and trace semantics; default supported path until a replacement demonstrates equivalent correctness and lower author effort. |

**Decision: defer public lifecycle API adoption.** The automatic internal slot-clear proposal is withdrawn as a sufficient contract. Keep the existing explicit workflow as the supported path. A bounded experiment may compare it with an opt-in, typed **pure parent-removal transform**; this is a design cost and adoption blocker, not a request for user input.

For that experiment, a declaration could supply `remove(parent, slotContext) -> parent`. The name is illustrative, not an API. It runs against current parent state only after a genuine terminal envelope passes owner/transition/attachment revalidation. It must clear exactly the authorized slot, preserve unrelated owner identities unless an explicit supported removal policy permits otherwise, and return no effects or actions. The runtime validates its result and reconciles all permitted state changes before publishing once. A thrown transform rejects the terminal commit atomically and produces an actionable diagnostic; it must not silently publish half a removal. How such a rejected exiting owner is subsequently recovered is itself an unresolved acceptance case, not something a timer can solve.

The transform is visible application business policy, not an automatic `afterExit` callback: it is pure, receives no animation objects, cannot authorize an exit, and cannot run transport work. It cannot replace business work that truly requires an explicit completion action. Such applications retain compatibility mode. If maintaining consistency requires running the full parent reducer or effects, reject automatic mode rather than dropping those semantics.

Potential benefit is moving one atomic removal decision to a slot declaration while deleting mechanical phase fields and entered/exited plumbing. Potential cost is another invariant-writing site that can drift from navigation/immediate removal. The experiment must compare a reused pure domain removal function in the existing explicit workflow against the new declaration; otherwise it would unfairly credit ordinary refactoring to the lifecycle API. No reduction in decisions, defects, or code has yet been demonstrated.

Additional required acceptance probes:

- Publish a parent with the counterexample invariant; a planted direct `slot=null` implementation must fail immediately, including through TestStore and a reentrant subscriber.
- Verify terminal removal observes current parent state after intervening unrelated updates, with no captured snapshot overwrite.
- Same-ID replacement or parent removal before terminal dequeue must prevent the transform from running at all.
- A pure removal transform that throws, fails to clear the slot, or alters an unrelated sibling lifetime must fail atomically with a diagnostic and an explicitly documented recovery path.
- Compare authorization and completion trace with compatibility mode; no hidden application action, duplicate reducer invocation or effect execution.
- Test two sibling editors with cross-field reservations and a parent budget; exactly one authorized removal updates the budget exactly once.
- Removing animation changes settlement reason only, not domain removal policy or the action needed to request close.

These tests are proposed. No executable specification or production proof is claimed here. The lower-risk deliverable may remain clearer canonical manual examples if the extra declaration fails to reduce author mistakes.

## Renderer settlement and absent surfaces

The coordinator distinguishes **logical settlement** from successful animation. The terminal reason is observable: `animated`, `reduced-motion`, `no-animation`, `surface-absent`, `surface-lost`, `host-detached`, or `playback-failed`. Only an already-authorized exit may retire on these paths. None authorizes a close.

A root-managed render checkpoint closes enrollment for a transition. If a declared automatic presentation has no live primitive enrollment at that checkpoint, settle entrance without playback or finalize an authorized exit with `surface-absent`. Never infer this from one transient element-binding callback. A same-flush remove/rebind invalidates the old attachment attempt before checkpoint processing. Multiple authoritative primitive enrollments for one owner are an error, not “first callback wins.” Independent descendants' decorative motion does not participate in the settlement barrier.

The automatic Modal enrollment owns its content/backdrop barrier. Both must settle or be explicitly classified unavailable; a lost backdrop cannot leave the exit indefinitely waiting. Playback failure cancels remaining owned animation, publishes a bounded diagnostic and settles the authorized transition. Browser failure is not labeled successful animation. No guessed duration timeout is a lifecycle mechanism.

Host detachment invalidates attachment attempts, synchronously releases DOM/focus/scroll resources, and schedules root-owned logical settlement for already-authorized exits. Other live owners remain in business state. On reattach, retained presented owners adopt stable endpoints without replay; never revive old callbacks. An entering owner detached before settlement becomes presented through a root checkpoint, so progress is not tied to a missing Host. Root destruction cancels that checkpoint rather than issuing further state changes.

The current primitive removed-content witness cannot alone implement never-bound/Host-detached settlement. This design requires a root-owned checkpoint and enrollment contract. Capture channels must not become substitutes for enrollment.

## Accessibility, style and SSR

Preserve current Modal policy: entrance never blocks accepted input; an authorized exiting shell becomes inert and loses focus authority, while its visible layer still shields pointer/Escape fallthrough until cleanup. Existing dismissal-stack ordering and return-focus behavior must remain the authority. A closing predecessor must not steal focus from an already active successor. No new global listener or second focus trap is introduced.

Automatic and compatibility modes are mutually exclusive on one primitive: supplying managed lifecycle alongside manual `presentation`/completion callbacks is a development/type error. Preserve Modal transform/opacity ownership; descendant recipe motion remains independent. `unstyled` retains its existing behavior.

SSR creates request-local logical records without Host attachment, browser animation, effects or completion callbacks. Render present content at stable shown endpoints and deterministic semantic markup; do not serialize runtime owner capabilities. Client hydration adopts the same visible state without replay by default. A fresh client-only open may enter. Exit authorized during a pure server/test transition is logically settled by the explicit nonrendered scheduler; server render itself does not dispatch. The distinction between hydrated open and client-created open needs an explicit root initialization policy, not object identity or a browser-global flag.

## Alternatives and migration

1. **Keep manual bridge, improve examples.** Lowest runtime risk; retains repeated actions and invariants. Keep as default until the prototype earns adoption.
2. **Primitive secretly calls `store.dismiss()` on completion.** Reject: completion becomes a second request, cannot express authorization, and can repeat confirmation/deny logic.
3. **Null immediately and animate captured ghost.** Reject for this prototype: changes business retirement and accessibility/DOM authority, requires a snapshot/capture lifecycle, and exceeds fixed-surface scope.
4. **Public callback helper wraps entered/exited.** Smaller API but still requires author-owned phase/transition invariants. Viable fallback if queue complexity outweighs measured simplification.
5. **Root metadata plus pure exit intent (recommended experiment).** Removes mechanical wiring while retaining explicit business acceptance and exact lifetime authority; costs one new queue/reconciliation seam.

Migrate an isolated B-style reference, not frozen cohorts: opt in slot; remove only mechanical phase marker and entered/exited actions; replace authorized transition-to-dismissing with the pure exit intent; remove callbacks; preserve dirty confirmation, save veto, explicit replacement and navigation null removal. Keep current and migrated variants side by side. Do not transform all reducers automatically. Unmigrated immediate/deferred slots retain byte-for-byte behavioral contracts.

Measure decisions and change-locality, not promised line reduction: number of phase fields, completion actions, callback wiring sites and author guards; time/cost and interventions when changing save policy, adding a second editor and removing animation. Public exports/types/docs only follow independent acceptance.

## Diagnostic trace and test authority

Emit bounded immutable trace entries with root-local owner label, encoded slot label, transition serial, event/reason and originating turn ID. Do not retain DOM, drafts, request payloads or error objects. Bound retention and expose overflow count. Trace is observational, not a public way to inject trusted acknowledgements.

Example dirty editor flow:

```text
owner-created o12 -> enter-start t1 -> enter-settled(animated)
dismiss-request o12 -> policy-retained (confirmation domain action visible)
confirmDiscard turn44 -> exit-authorized o12/t2
attachment a8 -> exit-start t2
ack o12/t1/a7 -> stale-ack-ignored
exit-settled o12/t2/a8(animated) -> slot-cleared -> owner-retired o12
```

Denied versus confirmation cannot be inferred from arbitrary domain state: `policy-retained` is the framework event; the actual public action/state trace shows the reason. Do not invent a “denied” business outcome unless the intent API explicitly includes a pure diagnostic decision.

TestStore must use the same internal queue and coordinator. A controlled renderer fixture can drive real opaque enrolled attempts through a test-only adapter; no test forges owner/serial objects or swaps in a second lifecycle implementation. Assert exact business fields in addition to event counts. Browser tests use actual Modal/Host and controlled animation completion; native-clock endpoint coverage remains separate from causal lifetime assertions.

## Adversarial acceptance matrix

| Case | Required witness / negative control |
| --- | --- |
| Repeated dismiss during exit | One authorization/transition/removal; extra requests do not shorten exit |
| Save veto, dirty confirmation | No exit enrollment until pure authorization; forced animation completion cannot close |
| Dismiss during entrance | Entrance attempt canceled; stale entrance ack cannot mark exiting owner presented |
| Same-ID replacement | New owner token; predecessor success/exit ack cannot affect successor state or focus |
| Ack queued before replacement/removal | Dequeue validation drops it; no double removal or successor null |
| Two sibling editors, same local names | Independent owner/transition identities; one exit cannot settle the other |
| Reentrant state subscriber dispatch | No partial metadata publication; FIFO outcomes and single reducer invocation preserved |
| Reduced/no animation | Deterministic logical settlement once; same authorization rules, no timing gate |
| Never mounted surface | Checkpoint classifies absent and settles authorized exit; no leak/deadlock |
| Content/backdrop lost or rebound | Exact attempt invalidated; same-flush rebound does not accept old ack |
| Duplicate enrollment | Deterministic diagnostic/error before conflicting authority; ordinary single Modal accepted |
| Explicit parent removal | Immediate owner/resource retirement even with never-resolving animation |
| Host detach/reattach | DOM resources released; authorized exit settles without Host; stable adoption never resumes retired attempt |
| Root destroy | No subsequent state write, event delivery, focus restore into successor root or live resources |
| Playback throw/rejection | Diagnostic plus authorized logical settlement; no unhandled rejection or invented successful animation |
| Pending business result during exit | Existing FIFO/domain behavior preserved; retirement cancels later work; no hidden early cancel |
| Nested parent removal | Descendant transition/resources retire without cross-owner callback dependency |
| SSR/interleaved roots/hydration | Deterministic escaped markup, isolated metadata, no I/O/DOM work or hydration replay mismatch |
| Legacy compatibility | Existing explicit presentation callback and immediate/deferred suites remain unchanged |
| Trace/TestStore | Exact ordering and rejection reason observable; overflow bounded; no business payload leak |

Planted defects must include omitting transition/attachment dequeue checks, treating dismiss as completion, keying by domain ID, relying only on mounted callbacks, and delaying retirement until a timer. Each must fail its intended assertion; happy-path pass totals alone are insufficient.

## Concrete implementation blockers versus tradeoffs

**Blockers before implementation acceptance:** unresolved parent cross-field invariant preservation and terminal-transform failure recovery; no current atomic presentation-intent result channel; no current internal slot-clear queue envelope with TestStore parity; no root render-checkpoint contract for absent/Host-detached enrollment; no proven automatic primitive acknowledgement boundary; no hydration adoption policy for this lifecycle. These are missing capabilities to design/prototype, not claims that existing APIs are defective. Integration must audit destinations/nesting even if initial public scope is optional slots only.

**Chosen tradeoffs to review:** irreversible exit per owner; retained live owner until completion; failure/absence settles already-authorized exit; no business after-exit callback; one authoritative primitive per presentation; no entrance replay on reattach/hydration. Each has an explicit alternative above and a testable consequence.

Public API adoption is deferred. Implementation gate: root independent design review of the parent-invariant correction, isolated prototype, adversarial queue/TestStore/browser/SSR matrix, unchanged legacy suites and a paired author-quality comparison. This document records source inspection and a proposed contract only; none of those implementation validations has been performed for the proposed lifecycle.
