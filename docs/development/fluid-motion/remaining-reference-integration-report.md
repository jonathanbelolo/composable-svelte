# Final rich reference integration (f29, Opus 5.5)

Received 16:25:52Z; bounded to 600 s (ended 16:28:43Z). No redesign and no product runtime edits. Core, graphics, media and guide sources were not
touched. No commit or publication.

## Dependencies (hashed before and after each run: identical)

| | Identity |
| --- | --- |
| Core | coherent 16:22:12 candidate; `remaining-core-correction-snapshot/manifest.json` sha256 prefix `e6724c097d7de738` (as announced); `dist/application/renderer/choreography/run.js` `3fe42cf4…a3a6` (built 16:22:11Z); `representation/cache.js` `cad41a66…8cf8`; core dist JS tree digest **`b0c9307680d12669`** |
| Graphics | approved correction `ac3c1e77` (unchanged; dist adapter built 15:53:45Z); graphics dist JS tree digest **`9f8c4fabffb4df37`** |

Digest method: sha256 over the sorted per-file sha256 of `dist/**/*.js`. Both digests were identical at the start and end of both runs.

## Runs (from `examples/fluid-motion-reference`)

**Attempt 1** (16:25:52–16:26:35Z; `checkpoint-final-integration/test-attempt1.log`):
- `pnpm check` exit 0 (0/0); `pnpm typecheck` exit 0; SSR 3/3.
- Browser: 29/29 of the files that ran, but `pnpm test` exit 1. `reference.browser.test.ts` (13 tests) **never ran**.
- Cause: the new graphics dist statically imports Babylon's `engineStore` (W1 fix) and dynamically imports `webgpuEngine`. The test dev server discovered both mid-run, re-optimized and reloaded, and the reference file's pre-bundled chunks disappeared ("file does not exist … optimize deps directory").
- This is a harness failure, not a product failure.

**Test-config correction** (test server only; the product build is unaffected): `vitest.browser.config.ts` (sha256 prefix
`99537453e88e267e`) adds `optimizeDeps.include` for those two Babylon modules. The entries do not resolve from the example root (Babylon is
graphics' dependency), and Vite warns "Failed to resolve dependency". The mid-run reload did not recur, and all files ran.

**Attempt 2 — canonical** (16:26:55–16:28:03Z; `test.log`):
- `pnpm check` exit 0 (0/0); `pnpm typecheck` exit 0; `pnpm test` **exit 1**.
- SSR 3/3 (fixture unchanged, not regenerated).
- Browser **41/42**: domain 11, entry 4, focus 4, hydration 1, reference 13, rich 8/9.
- The failure is the outgoing-WebGL witness **precondition**. The turning run's second capture resolved at **906 ms**, after the 700 ms hold: a ~460 ms screenshot. The copy had faded or gone, so `repMoved: true`. The first capture (446 ms) and the whole control run (294–544 ms: change 0, static 0) were valid. This is invalid sampling, not a behavior failure. The witness has no validity-retry, and adding one would exceed this bounded assignment.
- **Targeted rerun** of only that witness (16:28:25–16:28:30Z, `checkpoint-final-integration/targeted-webgl/`): **pass**. Turning mirror change **0.079** against control **0**; static reference 0 in both; samples at 296–512 ms.

**Retained controls** (canonical attempt 2, `rich-evidence.json`):
- **Live video after the commit:** playing **0.254** against paused control **0**.
- **WebGL destination continuity:** home 0.131, study 0.159.
- **Dynamic Reduce motion:** 0 ms advanced.
- **A5 focus:** positive accent `(56,189,248)` and negative occluded `(55,98,110)`, both valid on attempt 1.
- **Scenario 3:** ordered endings pass. The protocol, retirement, entry, hydration and CSS-transition witnesses pass.
- **Cleanup ledgers:**
  - interruption: graphics `{surfaces 1 = 1 mounted Scene, retained 0, representations 0, mirrors 0}`;
  - teardown: graphics `{0,0,0,0}`, engine `{observers 0, handles 0, media 0}`, core Host all zero.

**Build** (`vite build` exit 0; `checkpoint-final-integration/build.log`, `bundle.json`): total JS **2,202,684 B min / 564,062 B gzip** across 66
assets. The entry chunk is 1,537,710 / 393,100 gzip.
- Versus the §16 final-candidate total (1,893,269 / 482,721), this is a combined runtime and app delta.
- It includes the WebGPU engine and WGSL shaders now emitted as lazy chunks, which are not loaded by this WebGL app.
- It is not otherwise attributed.

## Evidence

- `reference-evidence/rich-representation/checkpoint-final-integration/`: `checkpoint-final-integration.SHA256SUMS`, 18 files at freeze, including attempt 1's log and the canonical attempt-2 evidence.
- The targeted-rerun files were added after freezing the sums and are listed separately in `targeted-webgl/`.
- All earlier checkpoints are preserved.

## Readiness and remaining

Reference integration is complete on the coherent pair, with one disclosed sampling sensitivity.

- **Outgoing-WebGL witness:** its stationary-copy precondition fails when a single screenshot takes longer than about 400 ms. It passed on the targeted rerun and in every earlier coordinated run.
- **Smallest follow-up, outside this bounded assignment and not applied:** give the witness the same logged validity-retry (≤ 3) already used by the video and A5 witnesses.
- **Harness warnings:** the `optimizeDeps` include entries warn "Failed to resolve" from the example root. A cleaner alternative is to resolve them through graphics' package path.

## Harness correction (16:29–16:30Z; within the original 16:35:52Z ceiling; frozen for independent review)

**Status.** The canonical integration result above is **41/42 plus 1 targeted pass. That is not a clean full 42.** The full rerun follows the next coherent core build.

1. **Outgoing-WebGL validity retry** (`tests/rich.browser.test.ts`, sha256 `a18710a1125cae24a542610c5a3f91167220a6b8ac0f307eff25a9525e0a658c`).
   - Retry applies to the **sampling preconditions only**: the copy is represented, it has not moved, and both captures resolved inside the post-commit hold (> 280 ms, < 700 ms).
   - Each run (control and turning) repeats until valid, **at most 3** times. Every attempt is recorded in `outgoingRetainedProgression.attempts`, the same logged pattern as the video and A5 witnesses.
   - Pixel and behaviour assertions (the static in-copy reference < 0.02; turning > 3 × control + 0.005) are **never retried**. A valid sample that fails them fails the test.
2. **`optimizeDeps` resolved through graphics** (`vitest.browser.config.ts`, sha256 `3b9fcb4b74c5d601238294d05d2f8cf152a296c6b736715ac88ca2d998c0d284`).
   - The include entries are `'@composable-svelte/graphics > @babylonjs/core/Engines/engineStore.js'` and `'… > …/webgpuEngine.js'`.
   - Vite's optimizer metadata lists both nested entries as optimized. There was no "Failed to resolve" warning and no reload in the run below.

**Targeted witness** (16:30:15–16:30:20Z; `rich-representation/harness-correction/`): **pass**, on the first valid attempt for each run.
- Control: samples 311–552 ms, mirror change 0, static 0.
- Turning: samples 293–529 ms, mirror change **0.071**, static 0.

Files are in `harness-correction/` (`targeted-webgl.log`, `rich-evidence-targeted.json`, `files.SHA256SUMS`, `SHA256SUMS`). There were no runtime, product,
core or graphics changes. All earlier evidence is preserved.

## Teardown correction and full rerun (16:35–16:38Z)

**Review finding (accepted).** `outgoingMirrorChange`'s missing-representation early return skipped `f.restore()`, so a retry mounted a new app before the
previous fixture and its history wrappers were torn down.

**Corrections** (test harness only; no app, runtime, core or graphics change):
1. `outgoingMirrorChange` **and** the video helper `leavingIntro`, which had the same pattern, wrap each attempt in `try/finally`. Every path
   (early return, assertion or timeout) restores the fixture exactly once and removes it from the `afterEach` list. The validity-only bounded retry
   (≤ 3, all attempts recorded) is unchanged.
2. New assertions after each retried witness: `launched` is empty, and `history.pushState === History.prototype.pushState`.
3. The second assertion **exposed a pre-existing leak**: `launch()` (and the entry and hydration tests) captured `history.pushState.bind(history)` and
   "restored" that bound copy, so every fixture stacked another binding (`bound bound bound bound pushState`) and native methods were never restored.
   - Fixed in `tests/support/observe.ts`, `tests/entry.browser.test.ts` and `tests/hydration.browser.test.ts`: the unbound prototype originals are used via `.call(history, …)`, and on restore the own-property overrides are deleted.
   - Targeted run: both retried witnesses pass with exact native restoration.

**Full reference run** (16:36:52–16:37:59Z; `rich-representation/harness-teardown-fix/test.log`):
- `pnpm check` exit 0 (0/0); `pnpm typecheck` exit 0; `pnpm test` **exit 0**.
- SSR 3/3; browser **42/42** (domain 11, entry 4, focus 4, hydration 1, reference 13, rich 9).
- No "Failed to resolve" warnings and no reload.
- **Dependency identity: NOT a single stable candidate.**
  - Graphics dist `9f8c4fab…` before and after.
  - Core dist `be895bf7704b4070` before, **`dce8a70d674ecfdf` after**. The whole core dist (258 JS files) was rewritten at **16:37:14Z**, during the run.
  - `run.js` was rewritten with identical content (`698c72eb…`), but other content changed.
- So this 42/42 is **not** claimed as a clean result on the 16:31:56 candidate. It must be repeated once on a candidate that stays stable for the whole run (lead to announce).

**Frozen:** `harness-teardown-fix/`: `test.log`, `rich-evidence.json`, `scenarios/`, `files.SHA256SUMS` (the five harness files), `SHA256SUMS`.
All earlier checkpoints are preserved.

## FINAL reference run on the final core freeze (16:50:05–16:51:32Z)

**Identity.**
- Core final freeze 16:47:05: `remaining-core-final-snapshot/manifest.json` sha256 `ce2284649c74fcb3e2c7958448ffa548f897a4a32fa930652f5920670d45eb1a` (verified; as announced). Core dist JS tree digest **`d87af8294705505f`**; `run.js` `698c72eb…544a`.
- Graphics: approved `ac3c1e77`, dist digest **`9f8c4fabffb4df37`**.
- Both digests were **identical before and after the test run, and after the build**, so no concurrent build occurred.
- Harness as independently approved (R1 teardown `2885c310`). No product or harness edits in this run.

**Checks** (from `examples/fluid-motion-reference`; `rich-representation/final-core-1647/test.log`):

| Command | Result |
| --- | --- |
| `pnpm check` | exit 0, 0 errors, 0 warnings |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | **exit 0**: Node SSR **3/3**; browser **42/42** (domain 11, entry 4, focus 4, hydration 1, reference 13, rich 9); no resolve warnings, no reload |
| `vite build` | exit 0: total JS 2,205,072 B min / 564,840 B gzip; entry chunk 1,540,098 / 393,922 gzip; WebGPU engine and WGSL shaders in lazy chunks not loaded by this WebGL app |

**Retained controls** (`final-core-1647/rich-evidence.json`):
- **Outgoing WebGL retained progression:** turning **0.079** against control **0**; static reference 0; samples 297–514 ms after the 280 ms commit; 1 attempt each.
- **Live video after the commit:** playing **0.254** against paused control **0**. The playing run was valid on attempt 2; the logged attempt 1 was invalid on the timing precondition.
- **WebGL destination continuity:** home 0.150, study 0.144.
- **Dynamic Reduce motion:** 0 ms advanced.
- **A5:** positive accent valid on attempt 2 (attempt 1 invalid and logged); negative occluded `(39,111,147)` valid on attempt 1.
- **Scenario 3:** ordered endings pass. The protocol, retirement, entry, hydration and CSS-transition witnesses pass.
- **Cleanup ledgers:** interruption graphics `{1 = 1 mounted Scene, 0, 0, 0}`; teardown graphics `{0,0,0,0}`, engine `{0,0,0}`, core Host zero.
- **Responsiveness** (screenshot-free): study cue 373–391 ms with one ~150–157 ms long task per destination `Scene` mount; dossier cue 321–322 ms, no long tasks, max frame gap 17 ms.

**Evidence** is frozen in `rich-representation/final-core-1647/` (`SHA256SUMS`, 15 files). All earlier checkpoints are preserved.

**Result:** a clean **42/42 + 3/3** on a single stable final core + approved graphics pair. The reference integration is complete. Remaining disclosed
limits are unchanged: Chromium only; screenshot-latency validity retries are logged; and a ~150 ms main-thread task per destination `Scene`
mount (graphics).
