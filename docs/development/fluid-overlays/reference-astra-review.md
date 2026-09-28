# Independent Astra review — overlay reference corrections

Reviewed 2026-09-27 22:31–22:40 UTC. Independent GPT-6 Astra HIGH review requested under canonical `MULTI_AGENT_ARCHITECTURE.md` v2.10 §6. No product source edits. **Request changes: three save-result reconciliation defects below.** Known core R-6/R-9/R-11 and the subsequent retention delta are outside this approval; this report does not approve a later core build or reference delta.

**Latest disposition (2026-09-28 18:50 UTC): approve the final freeze-3 reference app integration through immutable core build 10. Prior affected-app checks and unchanged business/rich evidence remain retained; the narrow build-10 discard path is qualified by the independent core probes. A-1/A-2/A-3 remain closed. This is reference-app approval, not a replacement for the independent core-runtime review.**

## Exact candidate and isolation

- Baseline `2e07f650c1421c25f6b29d2db9c0cc885ea891ed`.
- Opus correction snapshot `reference-opus-correction-snapshot/manifest.json`, SHA-256 `86b79450f99410fdc23ac4c8d94d1408640b200a45a628536fa0cf3956a28ce0`; all 14 entries verified before review.
- Private extraction `/private/tmp/overlay-reference-astra-20260928`: git archive baseline, overlaid exactly those 14 files, copied snapshot `core-dist`, isolated workspace package resolution. Dependencies link to installed dependencies; graphics dist copied. No test resolves moving core source or moving core dist.
- Runtime identity correction: the supplied snapshot was described as provisional build 3, but its actual frozen `run.js` SHA-256 is `ef4faa97447edb44a442c3c20fcce6df997e940a457ffe2e672e2235ea5051ee`, different from documented build 3 (`b786a362…`). This exact hash was recorded at initial setup and remains unchanged. Treat all independent browser runs here as using the frozen supplied intermediate runtime, not documented build 3. Its complete copied-dist hashes and exact run/model hashes are retained in `reference-astra-evidence/identity.json`. The source packet and frozen dist remain untouched. Setup script retained as `setup.py` (its final reporting line used an incorrect run.js path; setup and verification completed, and the corrected path was hashed in identity.json).
- Read root CLAUDE, relevant core/navigation/testing instructions, Main final-design/conditional-declaration/retention dispositions, original assignment, Opus assignment and report. Main's specific bridge disposition supersedes blanket objections to a thin `$effect` adapter.

## Findings requiring correction

### A-1 — P2: successful save result disappears after the modal fully closes

`src/model.ts:527` returns immediately for every presented curator action when `state.curator` is null. Consequently `saveCompleted` never reaches its catalog reconciliation at 612–625 after dismissal completion.

**User sequence reproduced with trusted input:** open Cloud → edit → Save Notes (deferred dependency) → Escape → Discard & Close → wait for `idle` → resolve the save. Trace includes `curator:saveCompleted`, but catalog still holds the original notes. Reopening shows old data although the business save succeeded. The same result arriving just before dismissal completion updates the catalog, so timing alone changes persisted display state.

Handle successful save reconciliation independently of whether its former presentation still exists; retain the existing protection against resurrecting/closing another instance. Evidence: `astra.counterexamples.test.ts` test 1 and `astra.browser.test.ts` test 2; both fail on this snapshot.

### A-2 — P2: an older result rolls the catalog back after a newer save

`src/model.ts:615–625` computes and writes `nextSpecs` even when its request/instance is stale. Per-work accepted save ordering is missing.

**User sequence reproduced with trusted input:** save old notes with pending request 1 → discard/close → reopen the same work → save new notes with request 2 → resolve request 2 → resolve request 1. The modal remains clean with `New revision` while the catalog becomes `Old revision`; reopening loses the newer displayed revision.

Preserve the newest accepted saved revision for each work (or use an authoritative backend version if that is the intended contract). Do not use only a global latest-request gate: a result for another work must still update its own catalog entry. Evidence: domain test 2 and browser test 3, with exact catalog/draft/trace output.

### A-3 — P2: duplicate success before the view flush cancels Save & Close readiness

`src/model.ts:638–648` clears `closeAfterSave` on first success, then derives `closeReady` from that flag on every success. Delivering the identical result twice before the Svelte bridge runs changes readiness `1 → null` and leaves the modal presented, so the requested close never commits. The existing duplicate-result test covers only a duplicate **after** `commitSavedClose`.

Make already-settled result delivery idempotent across the pre-bridge window as well as after commit; it must preserve unconsumed readiness and must never rearm consumed readiness. Evidence: domain counterexample test 3, `counterexamples-all-chromium.txt` (3/3 expected failures). This is a direct reducer delivery counterexample; the default mock service emits once, so normal UI alone does not duplicate that result.

## What independently checked correctly

- Save failure clears saving, keeps the draft and error, and permits retry. Trusted mounted-app probe rejects the first save, retries, edits during the second save, verifies the new draft remains dirty/open, then successfully Save & Closes once. Exactly one bridge commit follows.
- Normal Save & Close binds `dialog.transition` to synchronous `commitSavedClose`, after asynchronous work completes. No async work or motion scheduling occurs inside that callback. The reducer revalidates readiness/request/dirty baseline/status and consumes readiness on a matching refused or accepted commit. Stale requests/new instances do not close the wrong modal.
- Actual explicit plan selection has a meaningful browser witness: default Escape and explicit Save & Close flight timing windows are distinct and bounded. The author's preserved default-only mutation fails that witness. Independent Chromium rerun passes it.
- Views are genuine `scopeTo` capabilities stored in `$state.raw`, passed directly to managed primitives; no fake presentation object or duplicate lifecycle controller was introduced. The readiness effect derives from the presentation prop, which is the same root business content passed with the genuine view; the dispatch capability is read untracked. No observed mismatch in tested lifecycle paths.
- App layer numbers were removed. Trusted hit-testing/focus proves nested Alert is above Modal. Trusted Escape closes the top alert, dirty outside dismissal refuses, scroll lock holds, and keyboard-opened focus restores.
- Mid-flight backdrop/content opacity, card→hero/reverse frame diagnostics, reduced-motion zero geometry, and drawer intermediate paint are materially stronger than presence-only tests. Original synthetic/presence tests remain supplementary; the `S7` applause test dispatches directly to the store and is **not** proof of interaction through a modal or disjoint visual motion.
- Original rich route/graphics/media source behavior is preserved in the scoped diff. Independent full Chromium run passed 76/76, including rich geometry, WebGL/video continuity, focus, route scenarios, hydration and teardown. This is positive current evidence, not proof that the earlier failure was unrelated.

## Historical rich representation failure: classification and narrow correction

The author's full Chromium run failed `rich.browser.test.ts:134` with a null representation, then passed in isolation. My single full Chromium run, with logging only around the original sample, passed 76/76. It sampled the live 972×450 surface at 291 ms, with no completed run, no skips and no unsupported participants.

The original witness waits for `runTime(f) > 290` **after awaiting the trusted input RPC**. `runTime` is the last retained frame diagnostic; it remains greater than 290 after the entire run has completed and removed its representation. A deliberate delayed-observer witness demonstrates that exact predicate true at 832 ms with no representation, although 43 card frames completed normally and no participant was skipped. The missing historical sample did not retain its run time/settlement state; its generated JSON was subsequently overwritten. Therefore its exact cause remains unresolved. It is susceptible to an expired observation window; classify it as an evidence/synchronization gap, not proven product loss and not proven unrelated.

**Recommended narrow correction:** arm a bounded frame observer before trusted input; capture representation bounds and current frame progress synchronously in the same callback while the run is live. Require an observed live representation in the intended window, required dimensions, empty skipped/unsupported lists, and eventual successful settle/resource cleanup. Explicitly fail if the observation window expires, with progress/settlement diagnostics. Do not weaken dimensions, widen timing tolerances, add arbitrary sleeps, conditionally skip fidelity assertions, or retry until green. Screenshot capture may follow the synchronous sample but must report its separate capture timing honestly.

A proposed test-only observer and deliberately removed-representation negative control are retained in `astra.rich-observer.test.ts`. Both use the same mandatory capture/assertion logic; the mutation only removes the real representation. The healthy run must pass and removed-paint run must fail. An initial reviewer control accidentally gated capture on the mutation flag; that invalid control is explicitly superseded and retained as `rich-bounded-observer-initial-invalid-control.txt`.

## Executed checks and limitations

Commands run from the isolated example using `./node_modules/.bin/vitest run --config vitest.browser.config.ts`:

| Selection | Result / evidence |
| --- | --- |
| `tests/overlay.domain.test.ts tests/overlay.browser.test.ts tests/astra.counterexamples.test.ts` | 34 original tests pass; initial 2 counterexamples fail. `overlay-and-counterexamples-chromium.txt` |
| full original browser suite, excluding reviewer counterexamples | 76/76; diagnostic-only rich instrumentation. `full-chromium-instrumented.txt` |
| `tests/astra.browser.test.ts` | 1 trusted failure/retry/edit-during-save test passes; 2 save-result counterexamples fail. `adversarial-browser-chromium.txt` |
| `tests/astra.counterexamples.test.ts` after adding duplicate-success case | 3/3 counterexamples fail. `counterexamples-all-chromium.txt` |
| `tests/astra.rich-window.test.ts` | 1/1 passes, proves expired-window predicate susceptibility. `rich-expired-window.txt` |
| `tests/astra.rich-observer.test.ts` | Healthy observer plus intentional removed-paint negative control; see `rich-bounded-observer-control.txt`. |

Initial sandboxed browser attempts could not bind the local test port (`EPERM ::1`); authorized escalated runs worked. No browser result is claimed from those setup failures. No numerical/guidance re-review. Independent runs here are Chromium; the author's 102/102 three-engine overlay checks, tsc/svelte and SSR evidence were inspected but not relabelled independent reruns. No full workspace check, publication, or product fix performed. Known R-6 persistent catalog reaction, R-9 default source phase, R-11 refusal diagnostic and later retention semantics await the separate core/final integration review.

**Next gate:** targeted independent review of a newly frozen save-reconciliation correction and final retention integration. Approval of the unchanged portions above is evidence for this exact snapshot, not blanket acceptance of later changes.


## Targeted freeze-2 business correction review — 22:44–22:46 UTC

**Verdict: approve the save-reconciliation correction; A-1, A-2 and A-3 are closed.** No additional scoped correctness finding. This approval covers the business model delta only and retains unchanged reference coverage above. It does not approve the pending retention API/app adaptation or final rebuilt core integration.

Candidate: `reference-opus-freeze-2/manifest.json` SHA-256 `cc7b9adb8db728c4014376f036c75b00f115601bb4d73b993f449cf8ffbf084a`, verified entry by entry (the `_core_dist_run_js` metadata entry is not a file). Model SHA-256 `698c699bd670d5d8bfd0e4fc67cff37f68d147a010293c516a1d0881ad495162`. The private extraction was overlaid with this exact snapshot; the previously frozen runtime was held fixed at `ef4faa…`. `business-delta2-identity.json` records both candidate and actual reviewer runtime. The author's own runs used another unpublished intermediate (`1f5dafa…`); those are not conflated with my runs.

What changed and why it closes the findings:

- Successful/failed saves are root-owned actions (`curatorSaveSucceeded` / `curatorSaveFailed`), so a success reaches catalog reconciliation after `curator` becomes null. The instance/request check remains separate from catalog ownership; a removed/replaced presentation stays removed/replaced.
- `catalogRevisions[workId]` orders successful catalog writes per work. An older same-work success cannot roll back a newer success, while an older result for a different work is still accepted. This follows the existing demo's monotonic request convention; the service has no authoritative version field.
- Current-request reconciliation runs only while `isSaving`. Once settled, duplicate success preserves unconsumed readiness; replay after consuming readiness does not rearm it. A repeated/late failure does not clear readiness or replace a completed outcome.
- `commitSavedClose`, its synchronous explicit bridge, instance scoping, and motion plans are unchanged. The sole existing browser-test edit updates the expected root save-result trace label. Reviewer tests copied into the author snapshot are byte-identical to the retained probes.

Independent verification against the corrected snapshot:

| Check | Result |
| --- | --- |
| Unchanged reviewer domain counterexamples (3), unchanged trusted assembled-app probes (3), original overlay domain (19), original overlay browser (15) | **40/40 passed**, `business-delta2-chromium.txt` |
| New per-work ordering and settled-result replay checks | `business-delta2-ordering.txt` (2 tests); probe source `astra.business-delta.test.ts` |

The original red witnesses and the corrected green witnesses both remain durable. Rich sampling recommendation, successful bounded observer, and deliberate missing-representation negative control remain unchanged. No product source edits by this reviewer; no numerical/guidance reruns; no repeat full reference/browser run required for this narrowly scoped model correction. Final core/retention behavior still requires its own exact snapshot and targeted integration review.


## Final targeted app/integration review — 2026-09-28 18:31–18:35 UTC

**Verdict: APPROVED for the exact freeze-3 app snapshot integrated with immutable core build 8. No remaining app-delta correctness findings.** Prior business/component coverage is retained; this review covers the subsequent plan/test/documentation changes and their real assembled-app behavior on the final supplied runtime. Core internals retain their separate independent review gate.

### Exact identity

- App: `reference-opus-freeze-3/manifest.json`, SHA-256 `19c930c54ccf259d4da597f883e33b9cd8bbc25f0af61a0028a946d00588353f`; all 15 file entries verified. Its `_runtime_run_js` field describes the author's earlier runtime, not the runtime used by this review.
- Core: copied only from `core-correction-build8-snapshot/core-dist`, **1262 files**, independently reconstructed tree SHA-256 `9190602581b154907533347dd01ab3dbd391982086f69b3cc555bbc290660db2`. Method: per-file SHA-256 plus two spaces and `./relative/path`, sorted by path, with newlines; full list retained as `dist-shasums.txt`.
- `run.js`: `344c55b73cc1345b384daac3a4d175f19eb86a987b47c5a688a18c4141e07033`.
- Business model remains `698c699bd670d5d8bfd0e4fc67cff37f68d147a010293c516a1d0881ad495162`; components/HomeView/Gallery/views are unchanged from the approved business snapshot.
- The existing private extraction was updated solely from these frozen inputs. Complete app/runtime hashes and test config are in `reference-astra-evidence/final-freeze3-build8/`. No live product source or moving dist was tested.

### Reviewed behavior and evidence

- The catalog dim/scale and drawer push now explicitly opt into `lifetime: 'overlay'`. They retain the desired terminal pose rather than relying on app-owned paint or a second lifecycle controller. Modal catalog opacity/scale remain **0.88/0.98** past completion, through dirty-close refusal and nested-alert open/close.
- Accepted close starts from the displayed resting value and restores baseline. Rapid reopening was actually observed during close in all three engines: sampled opacity **0.894869 / 0.894256 / 0.895933**, followed by exactly **0.88**, scale **0.98**, and eventual baseline restoration. These samples substantiate the interruption even though the test schedules its reopen using a short delay.
- Drawer open and return declare explicit opacity **1→1**, avoiding the previous implicit outgoing fade. Three-engine witnesses verify resting translate **−32 px**, opacity **1**, visible intermediate return samples, and final translate **0**.
- Reduced plans declare the same full page pose with **zero-duration** scale/slide tracks, plus immediate release on close. All three engines observe only endpoint geometry, the same modal dim/scale and drawer push/visibility, and the correct baseline after close. Domain assertions require any reduced geometry to belong to the catalog and have duration zero.
- The normal explicit Save & Close timing witness and all retained business regression probes pass on this exact final runtime. Focus restoration, trusted Escape/outside dismissal, nested hit-testing, scroll lock, and shared flight witnesses also pass.
- The rich observer is now armed before the trusted input round trip. It captures live representation bounds and current progress synchronously while unsettled, and fails on an expired observation window. Required presence, dimensions, skipped/unsupported diagnostics, and released-resource assertions remain unconditional. The original historical 75/76 failure remains preserved as historical evidence; no retry waiver is inferred.
- Independent mutation of the **exact final rich test** removed the actual card representation before the observer read it, changing no acceptance assertions. The healthy witness passed **3/3**; the mutation failed **3/3**, at `expect(shot.rep).not.toBeNull()`. Its patch and red output are retained. The original source was then restored from the snapshot and every app manifest hash verified again.

### Executed final checks

From the isolated example, using `vitest.astra-final.config.ts` (three engines, same existing app config):

| Command/check | Result | Evidence under `reference-astra-evidence/final-freeze3-build8/` |
| --- | --- | --- |
| `vitest run --config vitest.astra-final.config.ts tests/overlay.browser.test.ts tests/overlay.domain.test.ts tests/astra.counterexamples.test.ts tests/astra.browser.test.ts` | **132/132 passed** (44 per engine) | `overlay-3engines.txt` |
| `vitest run --config vitest.astra-final.config.ts tests/rich.browser.test.ts -t 'rich participants are represented'` | **3/3 passed**; remaining 24 unchanged rich cases intentionally unselected | `rich-observer-3engines.txt` |
| Same rich selection with actual representation-removal mutation | **3/3 expected failures**, all mandatory presence checks | `rich-negative-control-3engines.txt`, `rich-negative-control.patch` |
| `tsc --noEmit` | exit 0 | `tsc.txt` |
| `svelte-check --tsconfig ./tsconfig.json --fail-on-warnings` | **0 errors, 0 warnings**, exit 0 | `svelte-check.txt` |

No whole-feature or numerical/guidance restart; unchanged rich/media scenarios and SSR retain their previous evidence. No claim that their entire suites were rerun on build 8. No product edits, publication, or new core approval were performed. The scoped final reference integration gate is closed.


## Narrow runtime extension: immutable build 9 — 2026-09-28 18:40–18:41 UTC

**Verdict: the freeze-3 reference integration approval extends to exact core build 9.** No app source changed and no new app finding appeared. Build-8 approval and all unaffected evidence above remain retained.

- App manifest remains `19c930c54ccf259d4da597f883e33b9cd8bbc25f0af61a0028a946d00588353f`; all frozen app files verified in the private extraction before the run.
- Runtime copied only from `core-correction-build9-snapshot/core-dist`.
- Independently reconstructed full dist SHA-256: `811e2068911467f310799f66afc8a68577253dfa1671f7c490c9901f03ff33f0`.
- `run.js` SHA-256: `509b173420e6a024176c46578f0a6e632bc9aead15d135aba83e9e6ff4e2ecac`.
- Exact dist comparison to build 8 changes only `application/renderer/choreography/run.js`, `run.d.ts`, and `run.d.ts.map`. The source delta carries active translate/scale leases and displayed values through whole-run succession, alongside the already adopted opacity lease. This review checks its reference-app integration; the independent core reviewer owns the correction's internal correctness gate.

Executed in Chromium, Firefox, and WebKit:

```sh
./node_modules/.bin/vitest run --config vitest.astra-final.config.ts tests/overlay.browser.test.ts -t 'overlay-lifetime page reaction|rapid reopen without epoch corruption'
```

**15/15 passed** (five affected witnesses per engine): rapid reopening/epoch preservation; retained modal dim/scale through refusal/nesting and accepted close; visible retained drawer push/return; reduced full resting pose and release; rapid reopen during close with correct renewed resting pose. The other 42 test instances were intentionally unselected by the narrow filter, not disabled or retried.

Exact hashes, per-file tree listing, and complete test output: `reference-astra-evidence/final-freeze3-build9/{identity.json,dist-shasums.txt,affected-overlay-3engines.txt}`. No rich/business/all-132 rerun, no app or runtime product edits, no publication. Final reference integration gate remains closed for this precise build-9 extension.


## Narrow runtime extension: immutable build 10 — 2026-09-28 18:46–18:50 UTC

**Verdict: the unchanged freeze-3 reference app integration approval extends to exact core build 10.** No app edits or new reference findings. The sole runtime change adds release of handed translate/scale leases to the terminal `engine.discard(handoff)` cleanup; it does not change plan selection, curve evaluation, normal succession, or overlay business acceptance.

Identity independently verified in the private app extraction:

- App manifest remains `19c930c54ccf259d4da597f883e33b9cd8bbc25f0af61a0028a946d00588353f`; all 15 file entries verified unchanged.
- Runtime copied only from `core-correction-build10-snapshot/core-dist`, full reconstructed tree SHA-256 `b0c3a789019d1e268df17ea763059f42246dc97f6bb9ec1dff7603fd50a380e0`.
- Exact comparison with build 9 changes only `application/renderer/choreography/engine.js` and `engine.d.ts.map`. `run.js` remains `509b173420e6a024176c46578f0a6e632bc9aead15d135aba83e9e6ff4e2ecac`.
- Full hashes and per-file tree listing: `reference-astra-evidence/final-freeze3-build10/{identity.json,dist-shasums.txt}`.

**Coverage decision:** retain the affected app's build-9 **15/15** three-engine witnesses and the build-8 broader reference coverage. Repeating the app's Reduce-motion toggle test would not qualify the changed branch: that toggle chooses reduced authored plans, whereas the newly fixed terminal branch is a route successor rejected by `RouteHost.reduced()` (OS media-query policy) after the predecessor handed off its active channels.

The independent core reviewer directly exercises that real Host admission path, plus a successor that leaves the transforms unused and the whole-run continuity witness. I inspected its complete exact-build-10 output and matching evidence hash: **9/9 passed**, three cases in each of Chromium/Firefox/WebKit. Every reduced-discard result reports empty translate/scale and **0 live leases**; the whole-run control still preserves `40px 20px` / `0.8` at handoff. The immutable core identity agrees with this review's runtime tree hash. The inspected log and provenance are retained as `core-reviewer-final-runtime-probes.log` and `core-reviewer-identity.json` in the same evidence directory (original log SHA-256 `ce176ecb8dd6ff8b104db93745578e3608e1b52f422d231319edfd51e65238ce`). These are the separate core reviewer's runs, not additional app runs by this reviewer.

That narrow branch qualification plus unchanged app/runtime paths adequately covers this integration extension. No redundant rich/business/full-app repeat, no product edits, and no publication. Separate core-runtime approval remains owned by the core reviewer; this report closes the final reference-app integration gate for build 10.

Core approval was subsequently confirmed in `core-astra-final-runtime-review.md`: all 118 source-snapshot entries verified, source tree `e79ac348…`, matching dist `b0c3a789…`, and the same 9/9 passing independent final probes. The reference extension is therefore final, with no pending core-qualification condition.
