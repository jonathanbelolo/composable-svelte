# Upgrade 1 takeover — 2026-09-23

Work is paused for takeover. No new implementation, tests, worker dispatches or transfers should be inferred from this handoff. Collaboration inspection reports all three remaining agents interrupted: `gpt6_template_architecture`, `independent_change_review`, `placement_resume`. Root's previously tracked command sessions had completed; this is not a fresh system-wide process audit.

## Objective and constraints

Complete Upgrade 1: reliable external agent authoring of clean, declarative applications using packed public packages. Applications own content, presentation and business decisions; framework owns lifetimes, cancellation, routing, focus and motion machinery. Broader foundations work remains open. Public documents must stay generic.

Preserve the dirty repository and all immutable qualification evidence. Do not reset, broadly commit, silently edit author submissions, weaken gates, or reclassify failures. Candidate version is unpublished `0.13.0-next.1`; publish only `next` after qualification and independent final review. Leave `latest` unchanged.

User routing: GPT-6 for architecture/difficult work, Gemini 3.8 Flash for bounded coding, Opus 5 for review when available, Sol for coordination. Maximum output allowance and 3600-second CLI timeout. Standing delegation authorization exists, but explicit automatic approval rejection cannot be bypassed.

## Accepted product work

- Framework-owned recovery when a focused modal descendant is removed, with bounded scope and independent review. Full core checks: 4,374 browser passes; 1,252 Node passes, six intentional browser-only skips. Evidence: `evidence/focus-removal-recovery-v1/ROOT-ACCEPTANCE.json` and `evidence/focus-recovery-core-gates-v1/RESULT.json` beneath this directory.
- Packaged real-rendering lifetime fixture and consumer guidance, installed-package checks, and exact-archive motion causal replay accepted. Evidence: `evidence/corrective-package-qualification-v1/ROOT-ACCEPTANCE.json`, `evidence/installed-focus-fixture-v1/RESULT.json`, `evidence/scored-motion-causal-refresh-v4/ROOT-ACCEPTANCE.json`.
- Approved Gemini rendered-lifetime packet completed successfully. All eleven proposed files were byte-identical to the existing tested files: no changes applied. See `evidence/rendered-lifetime-gemini-disposition-v1/DISPOSITION.md`.
- Immutable archives: `/private/tmp/upgrade1-corrective-archives-v1/ARCHIVES.json`. Core SHA-256 `438a21b2d56dfb13e1f9cba77cf5759e988f23a302715248065eec5d1828840b`; architecture `cc050fa10193ad16b64b4a4077fe7b0c368cfb55be8778db155117fdb63bfbbe` (use ARCHIVES.json as authoritative exact filename/hash).

## Fresh author results

Six controllers are terminal. Five submissions completed and are frozen at `/private/tmp/upgrade1-corrective-initial-submissions-v1/{a-1,a-2,b-1,b-2,b-3}`. Original runs: `/private/tmp/upgrade1-corrective-cohort-v1/runs`. Dispatch records: `/private/tmp/upgrade1-corrective-cohort-initial-dispatch-v1`.

All five valid submissions pass strict checking and preliminary production/SSR builds. Native unit passes: A1 33, A2 35, B1 41, B2 49, B3 46 — 204 total. Authored browser passes: A2 26, B1 24, B2 25, B3 31 — 106 total. These are component observations, not final author acceptance. No repair or withheld-change phase has started.

- **A1:** authored browser suites fail before collection: browser fixtures value-import application code whose public barrel exposes `.svelte` components to plain Node. Shared initial browser 11/11 and SSR pass. Formal manual receipt is blocked on authored browser setup. Preserve `/private/tmp/upgrade1-corrective-a1-authored-browser-v1` and `/private/tmp/upgrade1-corrective-a1-initial-manual-review-v1`. Motion draft exists at `/private/tmp/upgrade1-corrective-a1-initial-motion-v1`, but canonical validation is inconclusive: copied-control algorithm paths fail canonical identity checks (`Missing shared algorithm adapter-manifest.mjs`). No motion observation ran. Sol was assigned to repair only the external adapter paths and preserve failed preseal evidence; no completed repair verified. Do not treat SEALED-VALIDATION.json as acceptance.
- **A2:** shared browser 11/11 and SSR pass. Correct shared result is `/private/tmp/upgrade1-corrective-a2-functional-initial-v2`; v1 had a wrong environment variable and stopped before tests. Formal manual review was assigned but its output directory does not yet exist. Motion, managed and final aggregate remain.
- **B1:** furthest advanced: unit 41, authored browser 24, shared browser 6, SSR, motion 14, bounded managed-lifetime evidence, motion aggregate and independent five-area manual review pass. Final eight-gate launch has NOT run. Prepared details below.
- **B2:** native checks and authored browser pass. Shared/SSR/motion mappings and formal review remain.
- **B3:** native checks and authored browser pass. Independent review confirms a checker false positive: capturing `globalThis.fetch` in a factory default parameter is treated as module I/O. Preserve actual checker failure; do not change application code merely to evade it. Review: `evidence/corrective-b3-fetch-reference-review-v1/INDEPENDENT-REVIEW.md` and RESULT.json.
- **A3:** controller rejected an ambiguous `edit_file` target; not a Gemini infrastructure failure. Frozen protocol does not allow replacing or silently retrying this failed run. This cohort cannot claim six of six success. Evidence and prospective protocol proposal: `evidence/corrective-a3-initial-broker-denial-v1/`. Proposal is not implemented and cannot retroactively change scoring.

## Next concrete work after takeover

1. Review and seal B1 final gate bundle before running it. Draft: `/private/tmp/upgrade1-corrective-b1-initial-main-adapter-v1/manifest.draft.json`, payload `5c7029e247444408d7bdcba61a59e6def91e946c7caa082326c956e8d58d031b`. Draft validation binds 992 protected files. Map `/private/tmp/upgrade1-corrective-b1-initial-scored-sealed-v1/SCORING-GATE-MAP.json` remains `ready:false`. Controls `/private/tmp/upgrade1-corrective-b1-initial-scored-controls-v1`. Execution `/private/tmp/upgrade1-corrective-b1-initial-execution-v1`, baseline hash `7cdd35edb974d6880374fe91aa0f02146bfb8ca021bce9c9ca126a8f4ab28f1a`. Manual receipt `/private/tmp/upgrade1-corrective-b1-initial-manual-review-v1/receipt.json`, hash `5caba0f0209d35e6abb658990d696bc6f078cfa2f21d8c7ac5c40e75eb69b8af`. Motion aggregate `/private/tmp/upgrade1-corrective-b1-initial-motion-aggregate-v1/input.json`. Verify exact archives, all pins, policy (five active/two inactive; no exceptions), approved SSR mappings, then seal review/map and use existing `tools/run-scored-gates.py` with scenario b, phase initial, frozen b-1 run, execution baseline, control/sealed roots and fresh output. No withheld change until full initial acceptance.
2. Resolve A1 external motion manifest identity issue; canonical `validateMotionManifest` returns an inconclusive status rather than throwing. Explicitly inspect status/protectedFiles. Continue A2 manual review and remaining candidate gates. Collect diagnostics before using any candidate's one allowed repair.
3. Repair checker false positive with independent review and meaningful regressions; a changed package requires explicit new artifact/protocol applicability, not pretending old snapshots used it.
4. Reconcile failed cohort and prospective protocol improvement honestly, then complete remaining release obligations. No current end-to-end release approval exists.

## Pending specific transfer approval

**NOT SENT:** `jobs/fetch-reference-capture-gemini-v1.json`, brief `context/fetch-reference-capture-gemini-v1/BRIEF.md` (paths relative here). Approximately 109 KB private architecture checker source/tests; Gemini CLI `gemini-3.8-flash-high`, high effort, 3600 seconds. Owns only semantic-rules.mjs and its tests. Automatic approval review rejected this specific transfer despite standing authorization; an explicit approval question is pending. No answer is recorded. See `evidence/corrective-b3-fetch-reference-review-v1/TRANSFER-STATUS.json`. Do not equate previous rendered-lifetime approval with approval of this packet.

After approval, prepared dispatch is `python3 plans/framework-remediation-2026-09-18/tools/run-worker.py plans/upgrade-1-agent-authoring/jobs/fetch-reference-capture-gemini-v1.json`. No worker for this packet currently exists.

Local isolated baseline reproduction is `/private/tmp/upgrade1-fetch-capture-local-design-v1`: five added regression cases distinguish capture/bind from invocation. Baseline fails expected positive cases; no fix implemented, repository source untouched. This is design evidence, not immutable qualification.

## Qualification safeguards

Read `evidence/cohort-postcompletion-protocol-v1/PROTOCOL.md` and `evidence/corrective-cohort-initial-dispatch-v1/QUALIFICATION-HELPER-INVENTORY.md`. Use physical execution copies and preserve original source/modes. Hash algorithms differ between native controller receipts, materializer and execution preparation; do not interchange them.

Architecture gate requires `/private/tmp/upgrade1-architecture-envelope-v2/architecture-gate-result.mjs` (hash begins `1f89ea8c`), not the old helper. Canonical motion helpers require exact declared algorithm identities, even when copied helpers have identical bytes. SSR must render actual App/public props. Motion must exercise actual submitted application/CSS using the fixed cases and current-archive causal evidence. No fake rendering authority or relaxed expectations.

The old `scripts/verify-consumer.mjs` still resolves the unpublished architecture dependency from npm and fails E404; paired prerelease verification is accepted, not all-satellite compatibility. Repair companion-package binding before a coordinated all-package release.

No npm publication occurred. The broader authoritative specification remains partially open; this handoff covers Upgrade 1 progress only.
