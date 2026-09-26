# Upgrade 1: reliable application authoring

Status: frozen-candidate fresh-agent qualification completed on 2026-09-23: four of six runs accepted end to end; the strict release gate remains unmet. See [final scoreboard](evidence/cohort-scoreboard-2026-09-23-v2/SCOREBOARD.md) and [closure reconciliation](evidence/cohort-scoreboard-2026-09-23-v2/CLOSURE-RECONCILIATION.md). This upgrade does not close the full remediation mission.

## Outcome

An external application author or unfamiliar agent can install core, discover one authoritative contract, start with managed ownership, and build and revise a small conforming application. Qualification uses actual packaged files and independent acceptance gates, never the framework checkout as consumer context.

## Workstreams and order

1. Reconcile published 0.13.0-next.0 evidence with relevant existing ledger obligations. Preserve historical evidence; do not equate missing ledger joins with missing code.
2. Architecture review of the application contract, a real managed starter, and a bounded published architecture checker built from the existing parsed graph/policy substrate. Fable 5.1 reviews design; GPT-6 integrates decisions. No new motion drivers/default system or companion expansion in this upgrade.
3. Gemini 3.8 implements disjoint, reviewed packets: managed starter; checker semantics and packaging; consumer instructions/examples. Escalate legitimate hard failures to Fable then coordinator. Sol coordinates receipts and qualification assets. Opus 5 independently reviews implementations and adversarial controls before acceptance.
4. Produce an immutable release-candidate tarball and install it outside the repository. Qualify checks/build/SSR/browser behavior and shipped examples. Pin tooling and policy outside generated application authority.
5. Run unfamiliar agents against two generic scenarios and held-out change requests, three independent runs per scenario. Preserve first attempts and failures. At most one diagnostic-guided repair; no human architectural coaching. Each run must pass independently controlled functional, build and architecture checks. Missing capabilities receive explicit dispositions; neither failing requirements nor incomplete automation are silently relabeled as passed.
6. Integrate evidence, reconcile relevant ledger entries, and publish a new prerelease only after package and fresh-agent gates pass. Do not republish next.0 or move latest. Record actual registry verification separately.

## Boundaries to resolve in design

- The current starter uses createStore/onDestroy and must become a genuinely managed baseline without losing existing toolchain, SSR, theme and browser coverage.
- Existing architecture code is a graph/policy substrate with no rule evaluators and deliberately refuses qualification. Preserve fail-closed behavior; avoid a cosmetic scanner that grants architectural certification.
- Rule scope must cover ordinary application routing, resource/presentation orchestration, unsupported motion plumbing and pure-decision boundaries, with symbol-aware helper/alias/re-export handling. Honest bounded analysis requires unsupported constructs to be surfaced, never silently accepted. A helper directory grants no privileges.
- Published tooling must not inflate browser runtime bundles. Packaging, parser dependencies, prerelease version pairing, diagnostics and externally controlled policy must be explicit.
- Application contract permits local visual state, normal DOM events, CSS and stateless components. Do not impose blanket lifecycle/DOM bans or force a feature slot for every component.
- Existing explicit deferred-dismissal and PresentationState compatibility protocol remains allowed. Automatic presentation defaults and public custom motion drivers belong to later upgrades.
- The original full scenario matrix contains advanced motion requirements not yet supported. Design must identify what can be exercised with current public single/group recipes and explicit compatibility paths, and record any residual full-spec qualification obligation without pretending Upgrade 1 delivers later capabilities.

## Evidence and communication

Every worker packet pins input hashes and ownership; only coordinator integrates reviewed changes. Tests and architecture compliance are separate gates. Output limits remain at available model maxima and long model calls receive adequate timeout. Short progress updates report milestones and blockers. User interaction is reserved for unavoidable external authentication or blocked authorization.
