# Overlay and easing correction — acceptance packet

**Main acceptance: APPROVED on 2026-09-28.** See [durable acceptance disposition](main-acceptance.md). Accepted implementation is committed as `a9aba67813f1e8c06ae6ffb50633e55c3be2bb4e` on `codex/fluid-overlay-orchestration`, based on `2e07f650c1421c25f6b29d2db9c0cc885ea891ed`. No commit, merge, push or npm publication was performed. Original checkout is untouched.

## Delivered behavior

Overlay primitives and Command/Lightbox have motion defaults and presentation-bound explicit entry. Source capture precedes destructive rendering, with exact owner/instance/epoch identity and stable optional presentation handles. Accepted conflicting runs adopt displayed state; refusals acquire nothing. Layered dismissal, focus, inertness, scroll ownership, native surfaces and media continuity have dedicated witnesses. Lifetime reactions retain full opacity/translate/scale poses, unwind nested overlays and clean up on removal. Whole-run handoffs preserve active transforms and discard releases all transferred channels.

Finite-y cubic Bézier easing supports overshoot with property bounds; singular derivatives and actual IEEE overflow retain the qualifications in the numeric review. The reference app exercises shared modal entry/return, dim/scale lifetime reactions, drawer push, nested dirty-dismiss guarding and asynchronous save/close outcomes. Guidance and its executable fixture use the approved capture and retention semantics.

## Exact candidate

- Scoped patch: [final-candidate.patch](final-candidate.patch), 148 changed files, 1,084,605 bytes; SHA-256 `508ffdc57eb6163d4235fb4670a8ccabf49013d840ec0233970efb6de6eb987f`.
- File hashes: [final-candidate-files.json](final-candidate-files.json), SHA-256 `9dfc68389468836b5295c47f3c48c0ec60b5b6137365e5ae8786e1e5d24194cc`.
- Build 10 source tree: `e79ac3480e9248c2015058aed7ef47f0390ee448685d3b0dda98bb6ac75c1c29`.
- Build 10 dist tree: `b0c3a789019d1e268df17ea763059f42246dc97f6bb9ec1dff7603fd50a380e0`.
- Build 10 snapshot has 118 files; final test-only viewport teardown and C1 diagnostic expectation deltas are separately frozen in `core-build10-test-delta/` and `core-build10-c1-test-delta/`.
- Scoped manifest union verified against current files; `git diff --check` and `git apply --check` against an extracted exact baseline pass. Historical untracked artifacts were excluded rather than blanket-staged.

## Independent review and validation

| Area | Disposition and evidence |
| --- | --- |
| Core runtime | **Approved**, [final runtime review](core-astra-final-runtime-review.md). Final cleanup/continuity 9/9 across Chromium, Firefox and WebKit. Earlier build 8/9 closures retained. Optional presentation binding ownership/lifecycle explicitly approved. |
| Reference integration | **Approved**, [reference review](reference-astra-review.md). Frozen app 132/132 focused checks, 3/3 rich witnesses, missing-representation negative control fails 3/3; type/Svelte checks clean. Build 9 affected 15/15 retained on build 10 with independently verified cleanup delta. |
| Numeric channels | **Approved**, [numeric review](s1-numeric-correction3-astra-review.md), 58/58. Frozen numeric files remain unchanged. |
| Guidance | **Approved**, [guidance review](guidance-final-semantics-astra-review.md), plus phase-prose correction. Strict checks clean; final immutable build10 guidance rerun passes 5/5 (2026-09-28 18:54 UTC), recorded in [guidance report](guidance-report.md); lifetime-removal negative control detects the missing retained pose. |
| Final test-only teardown | **Approved and closed**, [test qualification](core-astra-test-qualification.md). Viewport 48/48; corrected C1 repetitions 60/60; exact test 3/3; independent wrong-velocity and wrong-endpoint controls fail 3/3 each. |

Build 8 broad motion checks passed 951/951 and related navigation/store suites 1057/1057. Build 9 targeted checks passed 222/222 and handoff-related checks 489/489. Build 10 types and emitted types passed, freshness 10/10. Its 384-test affected set passed after viewport teardown correction, but also had one uncaptured intermittent C1 destination-retarget failure; another captured run passed 384/384. A later pass did not waive that failure; the independent causal qualification and test correction below close it. [Build identity](core-build-identity.md) records each result and the remaining qualification.

## Qualifications

- The C1 failure was subsequently captured independently: 7 of 60 original-assertion cases failed (six Firefox, one WebKit), all completed at exactly the destination at 700 ms. The diagnostic reports a backward one-millisecond secant, not the instantaneous endpoint derivative. All 60 measurements agree with an independently derived Hermite secant to maximum error 5.684e-14. This refutes the earlier pre-end-frame hypothesis. Full failures and analysis are retained in [causal evidence](core-astra-evidence/test-qualification/c1-diagnostic-repeat.log) and [secant analysis](core-astra-evidence/test-qualification/c1-secant-analysis.json). The test-only correction preserves retarget continuity, endpoint position and precision, and checks the proper secant. Both +0.01 velocity and +1 pixel endpoint negative controls fail 3/3. Final narrow independent verdict is approved; no runtime or test qualification remains open.
- Viewport teardown previously restored asynchronously across tests (640 versus requested 660 pixels). The test now awaits cleanup; assertions and tolerances are unchanged. Wrong viewport/source basis negative controls fail in all three engines.
- Animation-policy and optional-props gates fail identically on the exact original baseline: the same three unchanged animation-policy sites and 317 versus expected 297 props. Reproduced baseline/current results are recorded in [policy-baseline-verification.log](policy-baseline-verification.log). These are not introduced by this patch.
- Core Svelte checking retains two unowned `video-fallback-review.browser.test.ts` fixture errors and the existing caption warning. Full-workspace verification was not requested/run.
- A presentation handle must exist before its source disappears. Creating it after removal correctly returns missingSource; there is no global historical source archive.

## Execution record

Canonical collaboration policy v2.10 SHA-256 `aee15911c14bb95093fe56efb648d345e8c250b474072bc0f17f2429fe3b1fab`. Core hard corrections were authored through official Claude Code using exact Opus 5.5, high effort, existing subscription, auto permission mode, with hooks/MCP disabled. Fresh independent Astra contexts reviewed authored changes; Sol coordinated and verified. The user explicitly authorized relevant provider egress, scoped local work and parent-task messages.

Implementation/review history and intervention timestamps are retained in [checkpoint.md](checkpoint.md) and assignment/review artifacts. Work was interrupted overnight and resumed September 28 around 18:30 UTC; the overnight interval is not active work. The final native correction phase resumed 18:34 UTC with a 20-minute bound. Provider totals and per-feature monetary cost are unknown, not zero; account-wide subscription usage cannot price this task.

Main/co-lead owns acceptance. This packet is a reviewable candidate, not a claim of merge/publication or unconditional final acceptance.

The original C1 retarget position and velocity checks remain unchanged in the corrected browser test. Instantaneous endpoint velocity has separate exact-zero assertions in `packages/core/tests/fluid-motion/channels.test.ts`, test “samples endpoint values and velocities exactly” (at and after the endpoint), retained under the numeric review. The browser test uses an independent closed-form expectation, not the production sampler.

## Final disposition

All scoped independent runtime, numeric, reference, guidance and test qualifications are closed. Main/co-lead acceptance is approved for this exact scoped candidate. Candidate production runtime stayed at build10 throughout the final two test-only corrections. The final scoped patch and manifest identities above supersede the earlier draft packet. No new broad test or review loop was run after closure.

## Reference visual evidence and provenance

Final healthy behavioral/paint evidence is retained in [overlay checks, 132/132](reference-astra-evidence/final-freeze3-build8/overlay-3engines.txt) and [bounded rich representation checks, 3/3](reference-astra-evidence/final-freeze3-build8/rich-observer-3engines.txt). The rich checks require the live representation, width >500, height >200 and no skipped/unsupported participants. The later runtime integration extensions preserve these unchanged app witnesses.

**No healthy final-freeze raster remains saved.** The final negative-control run overwrote the same screenshot/JSON output path; its image is preserved and labeled as negative-control evidence, not a healthy screenshot. Earlier temporary PNGs belong to the initial review. See [visual evidence provenance](reference-astra-evidence/final-freeze3-build8/visual-evidence-provenance.md) and [hash inventory](reference-astra-evidence/final-freeze3-build8/visual-artifact-provenance.json). Screenshot capture followed the synchronous DOM sample and cannot establish that same instant. This artifact limitation does not replace or enlarge the mandatory tested assertions.

Lead additionally inspected the healthy final-build drawer in the in-app browser on September 28 around18:55 UTC: layout, visible catalogue, close control and Escape focus return were observed. That screenshot is in this task's tool transcript, not a saved raster artifact. The healthy preview remains available at <http://127.0.0.1:5188/>.

### Healthy screenshot gap closed (2026-09-28 19:00 UTC)

At Main's request, captured and visually inspected new healthy final-build images to unique paths, without product changes:

- [Modal resting with retained page reaction](final-healthy-visuals-20260928-1900/modal-resting.png)
- [Nested unsaved-changes overlay resting](final-healthy-visuals-20260928-1900/nested-overlay-resting.png)
- [Drawer resting with retained page push](final-healthy-visuals-20260928-1900/drawer-resting.png)
- [Capture timestamps, SHA-256 hashes and runtime identity](final-healthy-visuals-20260928-1900/identity.json)

These new captures close the prior missing healthy raster artifact gap; the earlier overwritten image remains correctly labeled negative control. Current built runtime bytes were compared to immutable build10 snapshot successfully. Images show resting layout, not temporal continuity; no reliable in-flight capture is claimed. The modal catalogue's measured resting opacity/scale are 0.88/0.98, and drawer catalogue opacity/translate are 1/-32px. The temporary field edit used to open the nested guard was discarded, and the gallery was restored after drawer dismissal. Patch/manifest/runtime identities are unchanged.

## Main acceptance recorded

Main independently verified all 148 hashes, patch/manifest identity, independent dispositions and three fresh resting screenshots, and approved the scoped candidate. [Exact disposition and preserved qualifications](main-acceptance.md). No further implementation/review requested. Ready for a separate authorized release step; no commit, merge, push or publication performed.

## Authorized commit/push step

The user subsequently authorized commit and push, while explicitly excluding publication. See [commit authorization and verification](commit-authorization.md). Earlier no-commit statements record the acceptance phase. Accepted product bytes and artifact hashes remain unchanged; release versions were not changed.
