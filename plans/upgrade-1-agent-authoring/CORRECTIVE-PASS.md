# Upgrade 1 corrective pass after the first complete cohort

Authorized by the user on 2026-09-23. Outcome: remove recurring consumer testing setup failures and the supported modal focus-recovery gap, qualify new immutable packages, and complete the strict fresh-author release gate. The prior cohort remains immutable at four of six end-to-end successes.

## Product changes

1. Provide a reusable, test-only rendered-application lifetime harness in the published consumer starter. Use ordinary Vite HTML/module/CSS compilation and the real application root. Native controls mount and unmount the caller-provided application; no fabricated presentation authority, private runtime hooks, in-memory IIFE compilation or production globals. Keep test entry/output out of the production build.
2. Clarify raw composed-store binding versus typed application projection; explain the boundary between injected business time and native browser animation time. Keep the concise contract concise and put detailed instructions in the testing/consumer guides.
3. Implement bounded framework-owned recovery when an already-focused modal descendant is removed while its owner remains live. Follow the independently reviewed focus design, preserve user focus and navigation/restore priority, and prove cleanup and stale-owner protection. Attribute-only or CSS-only eligibility changes are outside this first fix and must remain explicit.

## Verification and release sequence

- Preserve a failing rendered focus reproduction, implement the fix, run targeted real-browser regression controls, and obtain independent implementation review.
- Exercise the shipped lifetime fixture with real mount, update, unmount and fresh remount; include style loading, page errors and production-build exclusion. Verify guide/API examples against actual packaged public APIs.
- Build new immutable core/architecture candidate artifacts with exact hashes. Reuse unchanged historical apparatus only through explicit byte/version applicability joins; run fresh package and affected-runtime checks where bytes changed.
- Prepare a separately versioned six-run package-only cohort. Keep the first cohort results and repair limits unchanged. Declare author tool access explicitly; the default comparison remains the existing file-only protocol with one diagnostic repair, unless a separate normal build/test workflow is introduced as a distinct exercise.
- Require all six new runs to pass initial and withheld change functional, architecture, authored-suite and independent source-review checks. Keep source snapshots immutable and score on isolated copies.
- Reconcile exact receipts with Upgrade 1 obligations and independently review the final package pair before publishing npm next. Leave latest unchanged. Authentication is the only expected user-dependent publishing step.

## Coordination

Root owns architectural decisions, public guide integration, exact artifact/gate approval and release. Independent GPT-6 implements/reviews difficult framework ownership changes. Gemini CLI receives bounded consumer coding work using verified available configuration; Sol coordinates packets, receipts and qualification plumbing. Review remains independent of implementation. Existing uncommitted work is preserved.

## Current evidence

- The bounded focus repair has [root acceptance](evidence/focus-removal-recovery-v1/ROOT-ACCEPTANCE.json), independent source review, preserved causal failures and full core gates: 4,374 browser tests and 1,252 Node tests passed, with six existing browser-only skips.
- Root implemented the lifetime fixture locally after automatic approval review initially blocked the Gemini transfer. The user subsequently approved that exact packet, and Gemini 3.8 Flash completed normally. All eleven proposed files were byte-identical to the tested implementation: [independent disposition](evidence/rendered-lifetime-gemini-disposition-v1/DISPOSITION.md). No changes were applied, and proposed test commands are not counted as executed validation.
- The new immutable candidate pair is recorded at `/private/tmp/upgrade1-corrective-archives-v1/ARCHIVES.json`: core `438a21b2d56dfb13e1f9cba77cf5759e988f23a302715248065eec5d1828840b`, unchanged architecture `cc050fa10193ad16b64b4a4077fe7b0c368cfb55be8778db155117fdb63bfbbe`. Installed verification and affected-runtime replay are accepted below; the fresh cohort remains required before release.
- Installed paired-package checks now have [root acceptance](evidence/corrective-package-qualification-v1/ROOT-ACCEPTANCE.json), including the packaged focus regression, consumer lifetime fixture and public guide examples. The [exact-archive motion replay](evidence/scored-motion-causal-refresh-v4/ROOT-ACCEPTANCE.json) accepted nine runs and four deliberately detected/restored defects. These establish bounded package/apparatus readiness, not author success.
- Six fresh projects are materialized at `/private/tmp/upgrade1-corrective-cohort-v1`, from the exact packed starter and unchanged business prompts. [Independent boundary/materialization review](evidence/corrective-cohort-materialization-independent-review-v1/INDEPENDENT-REVIEW.md) passed. [Root dispatch authorization](evidence/corrective-cohort-initial-dispatch-v1/ROOT-AUTHORIZATION.json) launched all six initial authors concurrently. All six controllers are now terminal: A1, A2, B1, B2 and B3 completed with clean integrity checks and were physically frozen; A3 was rejected after an ambiguous `edit_file` target. Its [diagnosis](evidence/corrective-a3-initial-broker-denial-v1/RESULT.json) and [protocol disposition](evidence/corrective-a3-initial-broker-denial-v1/PROTOCOL-DISPOSITION.json) preserve the failure. This cohort cannot be reported as six successful runs. Application qualification of the five valid submissions is in progress; no author or release pass is implied. Process records live at `/private/tmp/upgrade1-corrective-cohort-initial-dispatch-v1`, and author evidence at each run's `evidence/<run-id>/initial/`.

### Retained tooling limitations

The legacy all-satellite `scripts/verify-consumer.mjs` maps core to a local tarball but leaves the newly introduced architecture development dependency as a registry version. It fails with E404 before its tests while that version is unpublished. The dedicated paired-package verification used for Upgrade 1 covers the core/architecture prerelease; it does not claim satellite compatibility. Adapt the legacy verifier's local companion-package binding before the next coordinated all-package release. Its failure remains recorded, rather than bypassed or counted as a passing all-package run.

### Current candidate checks

A1 preliminary production/SSR builds and all 33 unit tests pass; strict checking reports zero errors and warnings. Both authored browser configurations fail before collection because shared test fixtures value-import application code whose public barrel exports Svelte components into the plain Node test runner. Native results are preserved under `/private/tmp/upgrade1-corrective-a1-authored-browser-v1`. No repair has been launched. Shared browser, SSR, architecture and manual review remain separate gates. The other valid submissions are entering isolated execution preparation.

All five accepted controller submissions now pass preliminary production/SSR builds and strict checking; native unit totals are A1 33, A2 35, B1 41, B2 49, B3 46 (204 total). Authored browser production/lifetime counts: A2 23+3, B1 20+4, B2 22+3, B3 28+3, all green (106 total). A1 both suites remain collection failures. A1 fixed shared initial browser suite passed all eleven on an unchanged execution baseline. The bundled starter checker reports no violations for A1/A2/B2, while B3 flags a `globalThis.fetch` default-argument reference; independent false-positive assessment is pending. These are component observations, not aggregate or end-to-end passes.
