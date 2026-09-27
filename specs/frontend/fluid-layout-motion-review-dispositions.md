# Motion design review dispositions

26 September 2026. This record maps every finding from the preserved independent
reviews to its final status in the [final design contract](fluid-layout-motion-design.md).
The reviews themselves are historical records:

- [Opus 5.5 review, re-reviews and final verification](fluid-layout-motion-opus-review.md)
- [GPT-6 Astra final review](fluid-layout-motion-gpt6-final-review.md)
- [parent notes](fluid-layout-motion-parent-review.md)

No runtime changes, prototypes or behavioral tests are claimed. "Resolved" means
that a design decision is recorded. It does not mean the capability is
implemented or proven.

## Final status

The design contains no open design findings. Every finding below is resolved as
a decision. Remaining work is implementation and the prototype/browser proofs the
design lists, which are not unresolved decisions.

| Finding | Origin | Final status | Resolved in the design |
| --- | --- | --- | --- |
| C1 history writer lifetime | Opus initial | Resolved: staging requires the admitting attachment epoch; detach cancels; no no-history staged mode | [Observable state, epochs and history I/O](fluid-layout-motion-design.md#observable-state-epochs-and-history-io) |
| C2 traversal invalidation | Opus initial | Resolved: synchronous classification, cancellation and barrier | [Traversal classification…](fluid-layout-motion-design.md#traversal-classification-barrier-and-history-uncertainty) |
| H1 route key and write authority | Opus initial | Resolved: full fragment-projected URL default; declared equivalence; `writePolicy` sole authority | [Staged routing protocol](fluid-layout-motion-design.md#staged-routing-protocol) |
| H2 capture across retirement | Opus initial | Resolved: host-owned representations prepared before retirement; no capture inside reduction or cancellation | [Capture timing and value handoff](fluid-layout-motion-design.md#capture-timing-and-value-handoff) |
| H3/H4 focus, paint, pointer | Opus initial | Resolved: control box and paint subtree; visible affordances; no shields | [Governing invariant](fluid-layout-motion-design.md#governing-invariant), [Control and affordance paint](fluid-layout-motion-design.md#control-and-affordance-paint) |
| H5 continuation | Opus initial | Resolved: numeric channels; Hermite continuation with constrained fallback; recipe `replace` unchanged | [Geometry tracks](fluid-layout-motion-design.md#geometry-tracks) |
| H6 TestStore parity | Opus initial | Resolved: manual cues, history fixture, protocol transcript, `finish()` rules | [Production and TestStore parity](fluid-layout-motion-design.md#production-and-teststore-parity) |
| M1/M2 plane, scroll policy | Opus initial | Resolved | [Plane and scrolling](fluid-layout-motion-design.md#plane-and-scrolling) |
| M3 preparation | Opus initial | Resolved: post-commit measurement is normative; prepared projection is research | [Svelte realization](fluid-layout-motion-design.md#svelte-realization) |
| M4/M5 content, nesting | Opus initial | Resolved | [Content policy](fluid-layout-motion-design.md#content-policy), [Nested groups](fluid-layout-motion-design.md#nested-groups) |
| M6 outcomes, return, disambiguation | Opus initial | Resolved | [Commit outcomes](fluid-layout-motion-design.md#commit-outcomes-and-exact-counts), [Cancellation…](fluid-layout-motion-design.md#cancellation-return-and-supersession) |
| M7 equivalence | Opus initial | Resolved: equivalence of authority and domain rules, not timing | [Observable state…](fluid-layout-motion-design.md#observable-state-epochs-and-history-io) |
| M8 render failure | Opus initial, superseded by F2 and X2 | Resolved by X2 | [Managed route outlet…](fluid-layout-motion-design.md#managed-route-outlet-render-identity-and-failure) |
| L1–L7 | Opus initial | Resolved as recorded; find-in-page/selection remains a proof | Design sections above |
| N1 value handoff | Opus re-review | Resolved | [Capture timing and value handoff](fluid-layout-motion-design.md#capture-timing-and-value-handoff) |
| N2 mid-handoff focus | Opus re-review | Resolved | [Governing invariant](fluid-layout-motion-design.md#governing-invariant) |
| N3 cancellation reasons | Opus re-review | Resolved | [Pending transactions and invalidation](fluid-layout-motion-design.md#pending-transactions-and-invalidation) |
| G1-a–d epoch, correction, fragment, key | Opus re-review | Resolved | [Traversal classification…](fluid-layout-motion-design.md#traversal-classification-barrier-and-history-uncertainty) |
| F1 admission and traversal race | GPT-6 Astra | Resolved: FIFO admission and barrier | [Request capture and admission](fluid-layout-motion-design.md#request-capture-and-admission) |
| F2 later render failure | GPT-6 Astra | Resolved, with the concrete topology given by X2 | [Managed route outlet…](fluid-layout-motion-design.md#managed-route-outlet-render-identity-and-failure) |
| F3 classification after commit | GPT-6 Astra | Resolved | [Commit outcomes](fluid-layout-motion-design.md#commit-outcomes-and-exact-counts) |
| F4 fragment and scroll precedence | GPT-6 Astra | Resolved | [Plane and scrolling](fluid-layout-motion-design.md#plane-and-scrolling) |
| X1 unavailable admission | Opus extra-high | Resolved: freshness captured at request time; stale requests never degrade; fresh unavailable requests degrade to immediate by default; opt-in observable `drop`; request results distinct from transaction outcomes; no replay | [Request capture and admission](fluid-layout-motion-design.md#request-capture-and-admission), [Request results](fluid-layout-motion-design.md#request-results) |
| X2 route outlet topology | Opus extra-high | Resolved: route slot `FeatureOutlet`; owned boundary inside the claim-owning body; nested scopes retire; fallback with render-only retry; single escalation; Host boundary; unsupported application boundary placement documented | [Managed route outlet…](fluid-layout-motion-design.md#managed-route-outlet-render-identity-and-failure) |
| X3 outcome vocabulary | Opus extra-high | Resolved: explicit phases; attempted-action and `domainCommitted` counts; `refused` versus `vetoed`; `routeKeyFailed`; history uncertainty; TestStore entry and `finish()` | [Commit outcomes](fluid-layout-motion-design.md#commit-outcomes-and-exact-counts), [Production and TestStore parity](fluid-layout-motion-design.md#production-and-teststore-parity) |
| X4 control fade criterion | Opus extra-high | Resolved: default hold-then-fade; no invented contrast threshold; only qualified measurable custom policies | [Control and affordance paint](fluid-layout-motion-design.md#control-and-affordance-paint) |
| X5 handoff geometry | Opus extra-high | Resolved: actual track state; sampled transform-free geometry; own-lease exclusion; ancestors counted once; explicit `unsupported` fallback | [Geometry sampling, capture and recapture](fluid-layout-motion-design.md#geometry-sampling-capture-and-recapture) |
| X6 scroll persistence | Opus extra-high | Resolved: binding-owned in-memory map plus bounded namespaced entry field; defined reload, back/forward-cache and detach contracts | [Scroll restoration ownership](fluid-layout-motion-design.md#scroll-restoration-ownership) |
| X7 cue release | Opus extra-high | Resolved: early terminal outcomes release a cue only for the same pending, eligible transaction; supersession and cancellation never commit; bounded return motion | [Cues, deadlines and commit inspection](fluid-layout-motion-design.md#cues-deadlines-and-commit-inspection), [Interruptions and failure](fluid-layout-motion-design.md#interruptions-and-failure) |
| X8 timing and ordering | Opus extra-high | Resolved: settlement reclassification; reserved FIFO ordering; admission, preparation and t=0 separated; absolute deadlines | [Traversal classification…](fluid-layout-motion-design.md#traversal-classification-barrier-and-history-uncertainty), [Timing origins and deadlines](fluid-layout-motion-design.md#timing-origins-and-deadlines) |
| P1 route key versus destination identity | Parent final consistency check | Resolved: the route key covers lifetime and invalidation only. Return/unchanged use exact expected-destination equality or an explicit return intent. Classification is by exact URL (expected → accepted, pre-turn → refused, otherwise redirected). A same-key, different-URL request is an ordinary staged request. | [Request capture and admission](fluid-layout-motion-design.md#request-capture-and-admission), [Commit outcomes](fluid-layout-motion-design.md#commit-outcomes-and-exact-counts) |
| P2 retry and view initialization | Parent final consistency check | Resolved: retry dispatches no domain action and does not reattempt managed initialization. View hooks and native resources reinitialize under their contracts. No exactly-once network guarantee; view-initiated reads deduplicate or reconcile against the same owner's state. | [Managed route outlet…](fluid-layout-motion-design.md#managed-route-outlet-render-identity-and-failure) |

## Deliberate alternatives

Where the design differs from a reviewer's proposal, it does so deliberately.

- **No staged mode without history.** Staging requires a live binding. Fresh
  unavailable requests instead use today's immediate path (X1).
- **Full-URL route key default.** This was chosen over a pathname default; a
  reported cancellation is safer than retaining stale intent.
- **Representations prepared before retirement.** This was chosen over DOM capture
  inside the reduction/cancellation window, combined with a value handoff at
  removal.
- **Visible controls and paint topology.** These were chosen over coverage
  heuristics or pointer shields.
- **Destination measurement after commit** is normative; prepared destination
  projection remains research.
- **Separate outcomes.** Domain outcomes, request results, transaction outcomes,
  history results and render outcomes are all distinct.
- **Native fragment movement never feeds `writePolicy`.** It belongs to the
  binding and scroll protocol. This corrects an earlier Opus re-review remark.

## Historical record

The sections below are preserved as they were written during the review cycle.
Their "open," "not yet changed" and verdict statements describe earlier revisions
and are **superseded** by the final status above.

### Required added cases (historical list, now incorporated in the design's proof section)

Required added cases: detach/reattach; accepted and rejected traversal before a late
cue; default/custom query identity; opacity continuity across commit; keyboard
activator and route heading focus; no invisible interactive region; bounded
retarget; manual/duplicate cues; self-retirement; redirect/reducer throw/render
failure; nested groups; scroll/gutter shifts; semantic-only find-in-page/selection.

### Focused re-review outcome (historical)

Opus's appended re-review clears the routing/authority design to start Gate 1.
It identifies small history-epoch/fragment/trace clarifications and one new Gate 2
contradiction (N1): a fading copy over fully painted live controls cannot produce
an outgoing fade. The parent incorporated N1's value-handoff design: animate real
content before commit, then reveal the prepared representation at the same clock
value as DOM removal. Same-frame behavior remains a mandatory prototype proof.
The logo example now distinguishes visible interactive destinations. Mid-handoff
visible focus, affordance parts, cancellation reasons and all four Gate 1 history
clarifications are explicit. These prose corrections were then assessed by the
independent GPT-6 Astra review below. Public API approval is not
claimed. Admission capture and reversal limitations are explicit.

### Final independent GPT-6 Astra review (historical)

The [independent final review](fluid-layout-motion-gpt6-final-review.md) identified
four further contracts, now addressed in the focused design:

- F1: admission linearizes in the root FIFO; the binding closes a staging barrier
  at traversal observation through settlement/correction. Both admission and
  commit test eligibility; uncertain history cannot admit delayed work. Staged
  generation is distinct from the baseline history bookkeeping counter.
- F2: an owned route render boundary/checkpoint is new required capability.
  Existing initial snippet guards do not guarantee later reactive error cleanup.
  Failure is correlated, disposes visual resources, and either uses declared
  fallback or explicitly tears down the root. Domain/render outcomes stay separate.
- F3: failed classification after successful reduction is terminal with
  domainCommitted true, never a fictitious rejected reducer or a repeated action.
- F4: physical-entry/native-fragment movement has its own scroll settlement;
  route policy takes precedence on a semantic commit unless fragment-target is
  explicitly selected. Same-route traversal needs no domain render to restore.

These are design corrections, not executed runtime proofs. GPT-6 Astra's focused
verification closed F1–F4 as decisions on design hash
`2d0e9ae632a7acb30aa6f56446c448f857e7be9fed0b233205edb64f7b3b408e`. That hash
identifies the revision before the X1–X8 resolution; the final contract has a
different hash, recorded in the Opus report's final verification section.

### Additional Opus 5.5 extra-high review — open findings (historical; now resolved above)

At the user's request, Opus independently reviewed that revision at `xhigh`
effort through Claude Code. Its appended final section confirms the F1/F3/F4
corrections, but identifies additional interactions. At that time the focused
design had not yet been changed to resolve these findings.

- **X1, high:** unavailable staged admission lacks an observable request-level
  outcome and fallback; a fresh navigation can silently do nothing. Opus proposes
  default immediate degradation. Any adoption must preserve origin/epoch checks
  so an obsolete delayed request cannot use that fallback to bypass invalidation.
- **X2, high:** explicitly define the new route-outlet topology. Its owned
  boundary must preserve the placement claim when displaying fallback; shell
  rendering also needs an owned failure boundary. A wrapper around the whole
  current outlet can release the claim and trigger root destruction.
- **X3:** distinguish zero-action policy veto from a reduced action refusing the
  route; specify pending route-key failures, uncertainty and TestStore finish.
- **X4/X5:** define a testable pre-commit control-visibility policy; hand off actual
  settled track state and geometry, and exclude own lease values during recapture.
- **X6:** define storage/lifetime of scroll positions and behavior of manual
  restoration across reload, bfcache and detachment.
- **X7/X8:** define visual-terminal cue release, fragment reclassification,
  FIFO supersession and capture/playback timing precisely. Supersession by a newer
  request must still cancel the old transaction rather than release its old cue.

Historical verdict at that revision: queue/history/TestStore prototype could
proceed, but exact traces needed X1/X3; render-failure integration was blocked on
X2; visual feasibility work could proceed with explicit limits; public API
finalization was not approved.

### Claude retry details

The initial `claude-opus-5-5` maximum-effort session stopped producing output after
completed source reads. The parent waited too long before investigating. Process
and session inspection found no pending failed tool and open network connections;
the precise cause was not established. Only this review process was interrupted.
Session `057de5e5-1cf3-4544-9ec0-ae57ee6b9db6` resumed at high effort with streamed
diagnostics, responded promptly and delivered the report. This proves successful
recovery, not a particular service fault. The original review remains unchanged.
