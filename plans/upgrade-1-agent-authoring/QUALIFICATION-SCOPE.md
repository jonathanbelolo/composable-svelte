# Upgrade 1 qualification scope

This document joins the bounded Upgrade 1 fresh-agent gate to the original `AAM-15` / `SPEC-192`–`SPEC-196` criteria. It defines evidence Upgrade 1 may claim; it does not rewrite those criteria or close the full obligation.

## Run matrix

Run each scenario three times with an unfamiliar agent and a clean project, for six independent runs total.

| Scenario | Initial brief | Held-out change |
| --- | --- | --- |
| A — navigation panel to detail | Build routed panel/detail navigation with deep-link handling, cancellable asynchronous detail loading, a dismissible editor with a close rule, one fixed-target group transition and one element motion recipe. | Change rapidly from detail A to B; prove stale work is rejected and presentation state remains owned and correct. |
| B — searchable list and detail | Build a searchable list/detail workflow with stable-identity reorder, cancellable search, a dismissible dialog, one fixed-target group transition and one status-indicator motion recipe. | Change filter and reorder while an older search is pending; prove stale results are rejected and the indicator settles correctly. |

The exact briefs, fixtures and held-out assertions belong to the scenario-design packet. They must not include a completed reference solution.

## Acceptance join

| Original criterion | Upgrade 1 evidence required | Claim/disposition |
| --- | --- | --- |
| Clean task using pinned published/prerelease packages and consumer entry instructions; no checkout, private skills or oral correction (`SPEC-192`) | Install one immutable candidate tarball into a new external directory. Give the agent only the business brief and files shipped in that package. Record package archive hash, installed integrity, entry-document hash, agent/model configuration and full prompt/output. | Required in all six runs. |
| Injected async workflow; routing; dismissible dialog with close rule (`SPEC-194.1–2`) | Orchestrator-owned tests cover success, cancellation, stale completion, deep link/navigation, accepted/rejected close, focus/presentation behavior and final feature state. | Required in all six runs. |
| Coordinated page/module transition and element animation (`SPEC-194.3`) | Use the released public fixed-target `useMotion` / `useMotionGroup` recipe surface. Tests cover interruption, target cleanup and visible settled state. | Bounded current-surface evidence only. It does not prove automatic defaults, dynamic/shared-layout or reorder choreography, or public custom drivers. |
| Interruption, reduced motion and request cancellation (`SPEC-194.4`) | Orchestrator tests force interrupted replacement and pending-request cancellation; browser controls reduced motion; resource assertions prove settlement/cleanup. | Required in all six runs for the fixed-target surface used. |
| Held-out change alters workflow and presentation (`SPEC-194.5`) | Apply the scenario-specific change only after the initial submission. Preserve both attempts and test the modified behavior independently. | Required in all six runs. |
| Two named generic scenarios, including reorder and a custom status indicator (`SPEC-195`) | Run scenarios A and B above. Stable-ID reorder is a feature-state decision; the bounded status indicator and group movement use public fixed-target recipes. Record first-pass violations, functional failures, repair, diagnostics and intervention. | Partial evidence for the named scenarios. Advanced motion readings remain residual rather than being silently weakened. |
| Three independent runs per scenario; zero final violations; no human architectural intervention; at most one published-diagnostic repair (`SPEC-196`) | Fresh project and agent context per run. One repair may respond only to diagnostics available in the candidate package/checker. Any architectural hint, prompt amendment, second repair or reused generated solution fails that run. Report first-pass success separately. | Required exactly; failed runs are preserved and replaced only after product/docs/checker revision. |
| Types/Svelte checks, functional and held-out acceptance, production build and independent architecture check (`SPEC-196`) | The orchestrator, outside project authority, runs pinned commands and owns expected results, policy, checker invocation and held-out tests. Every required command must execute and pass. The checker must report a genuine qualification pass, complete violations, no analysis errors and zero violations. | Required exactly; analysis-only output, refused qualification, skipped tests, disabled assertions or a broken application with a clean scan fail the run. |

## Evidence bundle per run

Preserve immutable inputs and first/final outputs: scenario and held-out fixture hashes; tarball/version/integrity; installed dependency tree; authoring-entry and checker/policy versions/hashes; agent configuration; transcript; generated-project manifest; first-pass checks, tests, build and checker results; diagnostic-guided repair diff if any; final gates; intervention count; and a machine-readable pass/fail receipt. Keep functional, package, architecture and agent-evaluation receipts separate and join them by run ID.

## Closure boundary

Six passing runs establish a bounded Upgrade 1 claim: unfamiliar agents can construct and modify these two workflows from the installed managed contract using current fixed-target motion recipes and pass externally controlled functional, build and architecture gates.

They do **not** close full `AAM-15`, `SPEC-195`, `SPEC-196`, `STAGE-6`, or the broader definition of done while the original advanced motion promise remains unavailable or unexercised. Automatic motion defaults, dynamic/shared-element and layout/reorder choreography, public managed custom drivers, and the broader regression/performance matrix require later capability delivery and fresh qualification against the original scope. The ledger remains open until that residual is implemented and joined to closure evidence; Upgrade 1 records its six-run result as partial evidence only.
