# Application authoring and motion: design review

**18 September 2026 · Source baseline: `dd2caad`, core 0.12.2**

**Consolidated design:** [Clean application authoring and managed motion](application-authoring-and-motion.md)
is the authoritative implementation document. This review records rationale and
evidence. Its original findings and the accepted independent review findings
are incorporated in that specification; §19 records design dispositions; [§§20–23](application-authoring-and-motion.md#20-combined-evidence-and-remediation-scope)
track combined evidence, open defects, and implementation closure.

Reviewed [the proposal](application-authoring-and-motion.md) against the core
architecture, composition/effect implementation, rendering and routing boundaries,
contributor guidance, and the proposed consumer qualification workflow. This
record concerns the design; it does not certify an implementation or npm release.

## Assessment

The revised proposal respects the library's central architecture: feature state
is authoritative, actions carry decisions through pure reducers, effects describe
external work, dependencies are injected, and features remain composable and
independently testable. Macro and micro customization remain supported without
making applications own general presentation machinery.

The original draft had substantive gaps. In particular, it was too permissive
about local visual state, too optimistic about existing cancellation isolation,
and incorrect to imply that an action alone could establish server-rendered
animation styles. Those issues and the lifecycle ambiguities below are corrected
in the proposal. The design is suitable for a bounded implementation spike;
its provisional APIs are not yet established as usable or production-ready.

The philosophical reference is the
[core specification](composable-svelte-spec.md), particularly pure reducers,
unidirectional data flow, declarative effects, composition, and testing. The
[abstraction principles](../../plans/phase-9/DESIGN-PRINCIPLES.md) add a necessary
constraint: prove useful, small composable pieces before introducing a broad
application facade. Existing implementation establishes present behavior; it
does not establish that a proposed stronger guarantee already exists.

## Corrections made

| Finding | Why it mattered | Revised contract |
| --- | --- | --- |
| “Local visual state” was underdefined | Drafts, selection, expansion, or loading could migrate into imperative view controllers. | §3 and §4.2 keep semantic state in feature stores. Framework decoration uses pure reducer/effect controllers; measurements, handles, and frame samples are execution data. |
| The application facade could become a second framework | A large mandatory host weakens composition and makes simple features expensive. | §4.1 requires independently usable combinators/bindings. The facade is optional and must demonstrate value. |
| Reducer ownership and action ordering were incomplete | Presentation configuration could duplicate child reduction, clear state privately, or reenter dispatch. | §4.1–4.2 specify one reduction per action, pure policies, queued semantic outcomes, and explicit facade semantics. The action envelope uses the existing `type` convention. |
| Cancellation groups were treated as sufficient isolation | Named effects can collide; old view handles can reach replacement instances; work can start before a trailing cancellation. | §4.3 and §7.1 require instance-scoped IDs, guarded dispatch/dismiss handles, explicit effect ownership, and invalidation before removed-child work starts. Legacy behavior remains explicit. |
| A frozen store was assumed to make an outgoing view inert | Svelte component hooks, subscriptions, and rendering engines can remain active independently. | §7.1 and §7.3 default to supported inert snapshots, permit only qualified render-only projections, and prohibit delaying feature cleanup or remounting live views for snapshots. |
| SSR and context initialization were underspecified | Actions cannot supply initial server styles, and context cannot first be published after children initialize. | §4.1, §5.3, and §10 require initialization-time context, pure stable styles, matching hydration state, and later browser attachment/reconciliation. |
| Cleanup had no explicit stable-style authority | Old cleanup could restore mount-time styles over a newer state or animation. | §5.4 makes the latest accepted input authoritative and transfers leases before obsolete cleanup. |
| The custom geometry sketch mixed coordinate spaces | Absolute viewport positions applied as local translations can double offsets. | §6.1 uses a declared shared layer with source-relative offsets and a limited, explicit coordinate contract. |
| Terminal reasons and watchdog coverage were incomplete | Skips/cancellation could be reported as success, or a run could hang before playback began. | §5.5 defines each outcome, stale-event behavior, and an end-to-end deadline including capture/readiness. Cleanup does not await a hung driver. |
| Run cleanup could be confused with live presentation cleanup | Finishing or failing an entrance must not unlock a still-open modal. | §5.5, §7.4, and §10 distinguish playback resources from the logical presentation's modality, focus containment, and scroll lock. |
| Browser rejection promised too much | Replacing a traversed URL is not equivalent to restoring the previous history entry. | §8.2 distinguishes known-entry correction from an explicitly reported, destructive-to-that-entry URL replacement fallback; cross-document and asynchronous blockers are limited. |
| Native access was given overly broad cleanup guarantees | A retained raw node cannot be revoked by checking managed tokens. | §4.3 and §6.2 distinguish gated framework operations from cooperative, qualified native adapters. No same-realm sandbox claim is made. |
| Qualification omitted these failure modes | Passing the original matrix would not establish the stronger ownership rules. | §14–15 add instance collision, stale dispatch, removal ordering, rejected close/traversal, effectful exits, SSR styling, readiness deadlines, and stale-style regressions. |

## Additional findings incorporated after independent review

The independent Fable review was useful chiefly because it traced the proposed
guarantees through the actual executor. Its strongest findings are requirements
on the library's implementation, not responsibilities to pass back to applications.
The consolidated specification now makes the following additional decisions:

| Finding | Consolidated resolution |
| --- | --- |
| A public dispatch wrapper cannot queue executor-internal dispatch | §4.2 defines opt-in FIFO turns inside the store; the entire root has one order, including subscriber and effect dispatch. |
| Ownership inferred at registration can attach stale work to a replacement | §4.3 requires originating-instance metadata at creation/lifting and post-reduction eligibility checks. |
| Fire-and-forget and captured dismiss callbacks evade current instance gating | §4.3 and §7 require pre-start checks and safe dependency capabilities; arbitrary JavaScript/external I/O remains cooperative. |
| TestStore independently executes effects | §4.4 and stage 0a require matching production/test semantics and mutation-verified transcript parity. |
| Save-and-close has more than one timing case | §7.1 distinguishes same-reduction removal, later queued dismissal, synchronous/late results, and parent-owned work that must survive closure. |
| Slot-only migration does not coordinate nested legacy overlays | §7.4 requires one document dismissal authority, with legacy bridges before mixed nesting is qualified. |
| Registry initialization and playback attachment were conflated | §4.1 makes the registry available during initialization and reconciles registration at browser attachment. |
| Provisional types and facade compatibility were underqualified | §4.1, §4.2, and §16 require typed slot linkage, negative inference fixtures, and narrow scoping interfaces without leaked destruction. |
| A reactive stable style can fight the motion engine | §5.3–5.4 define SSR projection, hydration handoff, and one managed writer for leased properties. |
| Collection reuse lacked epoch protection | §7.1 distinguishes a re-added/replaced key from an edited or reordered surviving instance. |
| Packaging, policy, and release gates were too implicit | §10–15 add motion-free import proof, immediate semantic feedback, contributor-skill reconciliation, and explicit functional/build gates. |
| Preference and history semantics had unresolved edge cases | §5.5 defines preference-driven supersession; §8.2 defines fragment policy and repeated-rebase consequences without overbroad event assumptions. |

The Fable save-and-dismiss claim was not adopted literally: an independent probe
receives a synchronous `saved` action before the subsequent dismissal. Its
suggestion to resolve an owner to the current epoch at registration was also
rejected, because it can authorize stale work for a replacement. Type-inference
and mount-order concerns became qualification gates, not unsupported claims
that a particular provisional API or platform ordering has already failed.

The [verbatim review](../../plans/application-authoring-review-2026-09-18/FABLE-REVIEW.md),
[assessment](../../plans/application-authoring-review-2026-09-18/DISCUSSION-NOTES.md),
and [original input archive](../../plans/application-authoring-review-2026-09-18/REVIEWED-INPUTS.json)
preserve provenance. Those historical inputs are not an alternative specification.

The generic Reference Demo remains explicitly fictional and demo-only. Both the
default path and custom macro/micro paths remain required. No consumer-specific
product, source path, screenshot, or history is used as documentation evidence.

## Evidence checked

Seven focused baseline probes completed successfully against a temporary bundle
of the current TypeScript sources and the installed Svelte compiler. “Success”
here means reproducing current behavior, including limitations; these are not
tests of the proposed APIs.

| Probe | Observed result | Relevant source |
| --- | --- | --- |
| Grouped child cancellable effect | Group is `child`; effect ID remains the unqualified `load`. | [effect helpers](../../packages/core/src/lib/effect.ts), [presentation composition](../../packages/core/src/lib/navigation/if-let.ts) |
| Child work followed by parent removal | Child becomes null; flattened descriptors are `Cancellable`, then `CancelGroup`. | [integrate](../../packages/core/src/lib/navigation/integrate.ts) |
| Same-case replacement | Replacing the child identity while retaining its case emits no cancellation by itself. | [integrate](../../packages/core/src/lib/navigation/integrate.ts) |
| Existing dismiss action | Parent reducer sees an already-null child. | [ifLetPresentation](../../packages/core/src/lib/navigation/if-let.ts) |
| Stale scoped handle | A handle captured for child 1 dispatches into replacement child 2. | [scopeTo](../../packages/core/src/lib/navigation/scope.ts) |
| URL effect construction in plain Node | Applying the effect factory to state throws because it reads `window`. | [URL sync effect](../../packages/core/src/lib/routing/sync-effect.ts) |
| Action-only element pose during SSR | With Svelte 5.43.3, the action does not execute and its transform is absent. A pure style projection emits the expected transform in the positive-control fixture. | [Svelte action contract](https://svelte.dev/docs/svelte/use) |

The removal probe establishes descriptor order. The conclusion that execution
can begin before cancellation also relies on reading the ordered batch executor
in [the store](../../packages/core/src/lib/store.svelte.ts); the probe did not
perform external I/O. The baseline probes do not demonstrate that the proposed
instance-scoping or ordering changes work.

Also inspected: presentation lifecycle types, modal/focus primitives, routing
history handling, SSR hydration, animation interruption tests, dependency clocks,
published consumer guidance, and contributor policy. The distinction between
pre-render and post-render effects is grounded in the
[Svelte lifecycle documentation](https://svelte.dev/docs/svelte/$effect).
History semantics were checked against the
[browser popstate contract](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event).
Motion interruption and native animation cancellation are deliberately not
treated as identical promise contracts; see the
[native cancellation reference](https://developer.mozilla.org/en-US/docs/Web/API/Animation/cancel).

Documentation checks resolved all relative links and heading anchors in both
documents, checked code-fence balance and whitespace, and verified that deliberate
broken-link/broken-anchor controls were rejected. The repository document scan
found no excluded consumer-product references. These checks validate document
structure and that naming constraint; they do not establish runtime correctness.

## Questions that require implementation evidence

These are explicit acceptance gates, not claims resolved by prose:

1. **Composition and execution:** implement the specified FIFO turns, originating
   ownership, effect-ID mapping, dependency/collection stale-handle gating, and
   removal filtering inside the existing executor. Prove production/TestStore
   parity without a third interpreter, duplicate reduction, or silent changes
   to legacy defaults. Stage 0a establishes this before consumer syntax freezes.
2. **Renderer lifetime:** prove capture before keyed removal, immediate feature
   disposal, safe snapshots, coalesced updates, and nested focus ownership in real
   Svelte/browser execution. Selecting `$effect.pre` alone proves none of these.
3. **Usable public types:** compile the smallest application, standalone component,
   recipe, and custom driver from emitted package declarations. No consumer casts
   or broad `any`; the facade must actually work with supported composition APIs.
4. **Routing and hydration:** browser-test rapid traversal/correction, unknown
   entries, pending writes, and initial URL disagreement. SSR-test stable element
   styles and qualify actual hydration, not just static server output.
5. **Rendering and resources:** exercise all terminal outcomes, property conflicts,
   missing readiness, native adapter teardown, reduced motion, and repeated
   disposal. Inspect visual/accessibility outcomes as well as resource counters.
6. **External consumption:** qualify the generic demo and fresh-agent construction
   and modification using only public packages and consumer instructions. The
   acceptance policy must be evaluated independently of generated project scripts.

No runtime source was changed for this review. A full runtime test suite would
not validate APIs that do not yet exist. The next implementation step is the
bounded spike in §15, followed by its explicit evidence gates; broad catalog
expansion and publication remain later stages.
