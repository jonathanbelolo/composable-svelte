# Companion integration: concurrent execution batches

Based on COMPANION-INTEGRATION-ASSESSMENT-2026-09-24.md and its Opus review. This is a scheduling partition, not authorization to launch workers or publish. T1–T8 acceptance criteria remain binding. Normal coding-agent iteration is expected.

## Coordination and ownership

Use one coordinating lead/reviewer and three concurrent implementation lanes. Proposed assignment follows the user's established preference: Opus 5.5 leads/reviews and Gemini 3.8 implements through Claude Code CLI, subject to actual CLI model availability. Do not silently substitute models.

Each lane uses an isolated checkout and owns its package changes, package tests and shipped guidance. The lead owns integration, the shared ADR, core/checker version decisions, root manifests, lockfile resolution and final release coordination. A lane may propose cross-boundary changes; the responsible owner integrates them. Avoid concurrent edits to core shared contracts, root lockfiles, shared consumer scripts or checker policy files.

A lane submits a concrete patch, acceptance-row results and unresolved decisions for review. Merge in dependency order and run affected integration checks after each merge. Keep documentation and tests in the same patch as behavior changes. Do not reserve all work until a final review.

## Batch A — Start now: inventory and proof inputs

All three lanes can start immediately. Each inventories actual public Store capabilities, output/command paths, operation policies, current docs and advertised capabilities; records test IDs and distinguishes current defects from historical ledger entries. Collect baselines and design experiments, but do not commit divergent shared APIs.

| Lane | Owned work | Handoff |
| --- | --- | --- |
| A1: code + media | Command consumers, action subscriptions, native manager identities, attachment/retirement reads and optional exports. Prepare ordered-command and media lifecycle proof cases. | Capability rows, baseline fixtures, requirements for the shared binding and command policy. |
| A2: maps + graphics + charts | Adapter/input/output/resource contracts; current engine browser coverage and missing sibling/removal coverage. Audit chart data typing without assuming a defect. Prepare Map initialization proof. | Capability rows, baseline fixtures, proposed real-engine verification and missing lifecycle cases. |
| A3: auth + chat | Headless flow/session and navigation ownership; stream/operation identity; composition API needs and optional child dependencies. Correct misleading compatibility claims in owned docs. | Capability rows, auth headless proof requirements, optional-peer/composite requirements. |

Lead concurrently assembles the matrix template, dependency graph and evidence conventions; reviews checker/profile boundaries and owns root compatibility documentation corrections. Full historical reconciliation must not delay B once proof inputs exist.

**Gate A→B:** Store/command/output inventory across seven packages and actionable CodeEditor, Map and auth proof rows. Remaining independent inventory work can continue alongside B.

## Batch B — Shared contract proof, three parallel clients

| Lane | Owned work | Prerequisite |
| --- | --- | --- |
| B1: CodeEditor proof | Compare ordered state-carried commands against scoped action/effect delivery; test repeated commands, stale delivery, replacement, unattached policy and queue acknowledgement if relevant. | A1 requirements. |
| B2: Map proof | Real managed attachment, delayed initialization, input changes, outputs and disposal; prove removal/replacement and two instances. | A2 requirements. |
| B3: auth proof + chat composition design | Headless business actions into parent composition; persistent session/temporary flows; absent/present optional chat child shape. | A3 requirements. |

The lead owns one shared contract branch/ADR and supplies the same candidate contract to all clients. Clients can progress in parallel against an agreed snapshot; contract revisions are integrated by the lead and propagated deliberately. They do not independently invent three core APIs. Existing-core solutions are evaluated before adding APIs.

**Gate B→C:** Reviewed proof results and ADR settle binding, command/output semantics, composite API and no-core-change/additive/breaking classification. Core maintainer participates if distinct from lead. Package migrations start only against this settled contract.

## Batch C — First migration wave

| Lane | Owned work | Included completion work |
| --- | --- | --- |
| C1: code | All supported code surfaces, including editor, highlighting and node canvas. | T3 implementation + T4 lifetime/command tests + T5 packed managed guidance and standalone compatibility. |
| C2: media | Manager/recorder/audio/voice surfaces and resource ownership. | Same T3–T5 requirements; deterministic browser devices and explicit real-device gate. |
| C3: auth | Managed flow/session composition, retirement and parent-owned navigation. | Same T3–T5 requirements; headless, request replacement and SSR isolation. |

Lead integrates the shared core change if required, creates the reusable installed-fixture/acceptance harness and progresses T6 profile design without freezing versions. The harness is lead-owned so lanes contribute fixtures without conflicting edits to the shared runner.

**Individual handoffs:** Each package must pass actual installed managed rendering/type checks, supported standalone controls and its capability matrix. Code and media handoffs unlock chat; auth completion is not a prerequisite for chat.

## Batch D — Second migration wave

| Lane | Owned work | Prerequisite |
| --- | --- | --- |
| D1: chat | Streaming and optional code/media composition, attachments and child cleanup; all T3–T5 deliverables. | Reviewed code + media contracts/patches from C. |
| D2: maps | Full public surface beyond the initial proof, real-engine lifecycle and shipped references; all T3–T5 deliverables. | B contract and Map proof. Can start early when a lane frees. |
| D3: graphics, then charts | Finish graphics managed scene/overlay coverage and required shader lane, then charts surfaces and lifecycle/reference coverage; all T3–T5 deliverables. | B contract. These are independent package assignments grouped only to respect the three-worker limit; if another lane frees, charts can move to it. |

Maps, graphics and charts do not technically depend on Batch C. The default schedule defers them for capacity while prioritizing code/media's dependency path to chat. Do not idle a free lane waiting for an entire batch to finish.

Lead reviews each handoff, reconciles T1 coverage and assembles fixture combinations from completed package changes. No additional broad fresh-worker evaluation cohort is needed.

## Batch E — Candidate freeze and concurrent qualification

**Entry:** All seven package migrations and affected core changes are integrated. Lead assigns candidate versions, updates peers and migration notes, resolves lockfiles and packs immutable runtime candidates. Freeze matching checker profile pins and pack the checker candidate. Record hashes; any subsequent change invalidates affected artifact qualifications.

| Lane | Concurrent work |
| --- | --- |
| E1: package/publication surface | Exact installed exports, ComponentProps and managed render recipes; standalone controls; docs/link/example extraction; optional dependencies and minimal bundle exclusion. |
| E2: runtime composition | Capability-mapped combined fixtures, sibling/replacement/SSR/native-engine tests; chat + media + code mandatory, other combinations justified by uncovered risks. Record real-device gate separately. |
| E3: isolated agent authoring | Independent workspace with only exact installed candidates and shipped references, no checkout/private skill/inherited implementation context. Use recorded briefs mapped to T1; retain final app, iteration/repair log and missing-guidance reports. |

Lead verifies T6 active checker controls and independent manual obligations, then reviews final application factoring and ownership. E3 requires a fresh-context assignment; do not use a migration worker's existing conversation as proof of installed-reference usability. A new isolated evaluation context replaces a lane, not an unbounded extra cohort.

Fix findings through the owning package lane. Repack and rerun affected checks; repeat isolated authoring where changes invalidate its evidence. No fixed attempt limit. Required review/device/coverage gaps remain open gates.

## Batch F — Ordered release, parallel verification only where independent

Lead coordinates publication under the release authorization in effect at execution time. Required core first; code/media before chat; other runtime packages may publish independently when dependencies exist. Publish checker after the companion versions referenced by its profiles exist. Use a staging tag until clean registry verification permits latest promotion.

Separate verification lanes can check published exports/docs, runtime fixtures and checker/profile behavior concurrently. Verify the published bytes against the qualified archives. This is a dependency-ordered release, not seven simultaneous blind publications.

**Exit:** All original T1–T8 completion criteria satisfied; release receipt names versions, hashes, checks, reviews and any declared supported-scope limits.
