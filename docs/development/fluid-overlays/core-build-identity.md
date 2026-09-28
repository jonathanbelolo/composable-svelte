# Core build identity

Final qualification update (2026-09-28 18:56 UTC): runtime build10 independently approved. The historical C1 failure below was independently reproduced and explained as a backward-secant versus instantaneous-derivative test mismatch; full60case capture, seven failures and independent closed-form analysis are in `core-astra-evidence/test-qualification/`. The pre-end-frame hypothesis was disproved. A separately frozen test-only correction preserves retarget continuity and endpoint precision; final narrow verdict is linked from `acceptance-packet.md`. Historical failures below are retained, not waived by later green reruns. Runtime identity remains unchanged.

## Build 10: COHERENT CANDIDATE (18:43:33Z, 2026-09-28): build 9 + C-R1-L `engine.discard` cleanup

Build 9 remains an immutable prior snapshot.

**Identity**

| Identity | SHA-256 |
|---|---|
| **`dist` tree** (1262 files) | `b0c3a789019d1e268df17ea763059f42246dc97f6bb9ec1dff7603fd50a380e0` |
| **`src` tree** | `e79ac3480e9248c2015058aed7ef47f0390ee448685d3b0dda98bb6ac75c1c29` |
| Frozen numeric sources | Unchanged: `480494cd…`, `22404659…`, `6ad7096d…` |

- **Changed source:** `engine.ts` only (`src` `f657e9d03262ccfc…`, `dist/engine.js` `b0380179ff8d57a8`). `run.js` `509b173420e6a024` is unchanged from build 9.
- **Fix:** `discard()` releases every handed channel, meaning paint plus any active `translate`/`scale` (restoring stable).

**Evidence (three engines)**

| Check | Result |
|---|---|
| Independent probe `core-astra-evidence/build9/core-astra-unused-handoff.browser.test.ts` (copied unchanged, `c41abee1…927b9`), before the fix | "reduced route successor discards every handed transform lease" **failed** 3/3: `'40px 20px'` and `'0.8'` left |
| Same probe, after the fix | 2/2 tests × 3 engines pass, including the ordinary-successor control |
| `core-astra-final-boundary` (unchanged, `d359d9e6…`) | 3/3 |
| `tsc`, emitted types, `dist-freshness` | 0, 0, 10/10 |

**Targeted set** (all `core-astra` probes plus `overlay-identity`, `overlay-motion`, `overlay-retention`, visual family, presence: 384 tests), run three times:
1. **1 failure**, "replan keeps the original source basis…". Its cause is diagnosed and fixed below.
2. **384/384** (after the test-only fix).
3. **1 failure**, "C1 at the destination retarget…" (see the timing qualification below).

**Test-only fix: viewport teardown race** (`tests/fluid-motion/visual-correction2.browser.test.ts`, `e2f5769f…`).
- **Measured.** The failure was `width 192` against the expected `0.3 × 660 = 198`, tolerance 0.5. 192 is exactly `0.3 × 640`.
- **Cause.** The preceding test sets the viewport to 640 and registered a **fire-and-forget** restore (`void page.viewport(original…)`) in a synchronous `afterEach`.
  - A temporary diagnostic, run twice on three engines and then deleted, showed the next test **starting at `innerWidth` 640** every time. The restore was still pending into the next test's resize and replan.
  - This is a harness race, not runtime.
- **Fix (test-only).** `afterEach` awaits each cleanup, and the three viewport restores return their promise. No assertion, tolerance or numeric code changed.
- **Negative controls** (isolated temporary copies, deleted): with the fix in place, a wrong viewport basis (`0.3 × 640`) **fails** 3/3 (`198 vs 192`), and a wrong source basis (`+60`) **fails** 3/3 (`80 vs 60`). The assertions keep their power.

**Remaining timing failure (open, not waived).** "C1 at the destination retarget: position and velocity continue exactly from the displayed state" (`visual.browser.test.ts`) failed once in run 3; the next run passed. That run's engine and values **were not captured** (my output filter dropped them), and a later pass is not proof.
- **Path.** It is a real-clock route test: `admitted()` with motion enabled and a current page. That path never calls `engine.discard()`, so the build-10 change is not on it.
- **Prior record.** Its earlier recorded occurrence (build 2, Firefox, full-suite load) was a zero-velocity endpoint check: `0.00488` against a `5e-7` tolerance, in the frozen numeric retarget domain.
- **Status.** Flagged for the independent reviewer. It needs a captured failing run (engine and values) to qualify it further. It is not investigated beyond this within the bounded correction.
- **Capture attempt (18:48Z).** One diagnostic rerun of the same set with full assertion output was 384/384, with no recurrence. The failure therefore remains uncaptured and unqualified; this pass is not counted as evidence against it.

## Finding recorded before its patch (18:42Z): build 9 C-R1 cleanup leak (independent Astra)

**C-R1-L.** `engine.ts` `discard()` releases only the opacity lease of each `OutgoingAdoption`. It ignores the `translate`/`scale` channels that the build-9 correction added. The path: `RouteHost.admitted`, under reduced motion, calls `previous.handOff()`, then `settle`, then `engine.discard(handoff)`. That leaves `translate 40px 20px`, `scale 0.8` and **2 live leases**, even after `Host.dispose`, in all three engines. This leak was caused by the build-9 correction. An ordinary successor dropping those channels restores correctly.

**Correction (narrow):** `discard()` also releases the handed transform channels (restoring the stable values). There is no other change.

## Build 9: COHERENT CANDIDATE (18:38:06Z, 2026-09-28): C-R1 whole-run transform handoff correction

Build 8 remains the immutable prior snapshot. Build 9 = build 8 + the bounded C-R1 correction only.

**Identity**

| Identity | SHA-256 |
|---|---|
| **`dist` tree** (1262 files; same method) | `811e2068911467f310799f66afc8a68577253dfa1671f7c490c9901f03ff33f0` |
| **`src` tree** | `406d1360d74fee78df19949b992b2c6e61f1b6387cbe90af76de118b5e8d3560` |
| Frozen numeric sources | Unchanged: `480494cd…`, `22404659…`, `6ad7096d…` |

- **Changed source:** `run.ts` only (`src` `4f1ef275a1971dd3…`, `dist/run.js` `509b173420e6a024`).
- **Unchanged since build 8:** `route-host.js` `ee9ef580656dd197`, `overlay-motion.js` `8810eba4eee660d8`. No `engine-types` or contract change in this correction.

**The finding.** C-R1 (independent probe `core-astra-evidence/build8/core-astra-final-boundary.browser.test.ts`, SHA-256 `d359d9e6…d9b884`, copied **unchanged**) showed a same-owner `host.local` whole-run successor snapping the predecessor's active slide/scale from `40px 20px` / `0.8` to `0` / `1`. Reproduced at 18:36Z on three engines.
- **Cause:** `handOff()` handed over paint leases only. The predecessor's `settle('superseded')` restored its translate/scale leases, and the successor's transform tracks started from their declared `from`.
- **Fix:**
  - `handOff()` now hands each outgoing and incoming item's active translate/scale leases over with their displayed values.
  - The successor succeeds them without a restoring write (`succeed(…, 'translate' | 'scale')`) and holds them in a per-node adopted-transform map.
  - `transformLease` consumes them, so the tracks continue from the displayed pose through the same path as the partial-conflict correction.
  - Unused adopted transforms are released with the other adopted leases, and at settle.
  - The partial-conflict (yield) correction and the frozen numeric channels are unchanged.

**Focused evidence (Chromium 141, Firefox 142, WebKit 26)**

| Check | Result |
|---|---|
| Independent probe (unchanged), before the fix | **Failed** 3/3: after `translate 0px`, `scale 1`, rect x 100 vs 150 |
| Independent probe (unchanged), after the fix | **Passes** 3/3: `oldPose` = `newPose` = `{ translate: '40px 20px', scale: '0.8' }`; rect x/y/width 150/124/80 = 150/124/80 |
| Author regression `overlay-identity` "C-R1 whole-run successor" | 3/3. Continuous at the handoff, progresses from the adopted pose toward the declared end (40 < dx < 100, 0.5 < scale < 0.8), then releases balanced (no stale transform, 0 leases). |
| All independent probes plus `overlay-*` plus `s1-transform` | **222/222** |
| Handoff-related suites (visual, visual-correction, visual-correction2, visual-completion, presence, representation, slice, render-hydration, harness) | **489/489** |
| `tsc`, emitted types, `dist-freshness` | 0, 0, 10/10 |
| `svelte-check` | Only the two non-owned `video-fallback-review` errors |
| Broad suites | Not rerun, per the assignment. Build 8 ran 951/951 and 1057/1057. This delta is confined to `run.ts` handoff paths, covered above. |

**Review:** not self-accepted. Retained independent Astra rechecks this final delta.

## Build 8: COHERENT CANDIDATE (22:59:48Z), final-delta finding batch complete and green

**Identity**

| Identity | SHA-256 |
|---|---|
| **`dist` tree** (1262 files; per-file `shasum -a 256`, `LC_ALL=C` sorted, hashed) | `9190602581b154907533347dd01ab3dbd391982086f69b3cc555bbc290660db2` |
| **`src` tree** | `266d4b46c7379379002d803a1a306d460075396cb5a22c1884c023e08962dbc5` |
| Frozen numeric sources (`channels.ts`, `hermite.ts`, `channel-types.ts`) | Unchanged: `480494cd…`, `22404659…`, `6ad7096d…` |

Key `dist` modules (first 16 hex characters):

| Module | Hash |
|---|---|
| `run.js` | `344c55b73cc1345b` |
| `route-host.js` | `ee9ef580656dd197` |
| `overlay-motion.js` | `8810eba4eee660d8` |
| `target-registry.js` | `e5bb9754cb7addfc` |
| `store.svelte.js` | `a2b2332610786db3` |
| `ApplicationHost.svelte` | `55cf30bc30e51924` (contains the C2 pre-effect) |

**Independent probes** (copied unchanged; first 16 hex characters):

| Probe | Hash |
|---|---|
| `core-astra-probe` | `63edfb31…` |
| `core-astra-public-probe` | `88d135a4…` |
| `core-astra-correction` (4 tests) | `bc5bc5a4fc287a68…` |
| `core-astra-c2-public` | `f7ac91278e96df68…` |

**Batch fixed since build 6**

| Finding | Fix |
|---|---|
| C3-D | Driver disposed exactly once on unreachable settlement |
| R1 active | A yield hands over the displayed transform |
| Reduced base | Reduced-motion rest composes with the stylesheet base |
| Source owner | A retired source owner releases its resting contributions (the overlay epoch survives) |
| C2 same task | Probe registration notifies the Host pre-effect synchronously (untracked) |
| Live MSE | Removed shared sources retire at accept |
| Slot cleanup | An emptied slot is removed on re-home |

**Live MSE on build 6:** the "C3 live MSE" witness failed there (`video.paused = true`, per `build6-final-controls.log`). That was the genuine defect it detects. The fix is in build 8; the witness is unchanged and passes 3/3.

**Gates on the build-8 sources (22:59Z)**

| Gate | Result |
|---|---|
| `tsc` | 0 |
| Emitted types | 0 |
| `svelte-check` | Only the non-owned `video-fallback-review` / `VideoCard` issues |
| `dist-freshness` | 10/10 |
| Fluid-motion targeted (all independent probes, `overlay-*`, `s1-transform`, representation, visual) | 606/606, three engines |
| Store / navigation / overlay / Command / Lightbox / routing | 987/987 |
| **Broad full suites on this exact candidate (23:01Z)** | Full fluid-motion **951/951** (102 file/engine runs, three engines) |
| Store, navigation, overlay, Command, Lightbox, select, data-table and routing | **1057/1057** |
| Node | 1344 passed, 6 skipped. The only failures are the non-core repo policies `animation-policy` (reference app) and `optional-props` (repository-wide count; nothing added by this delta). |

## Build 7 (22:53Z): unannounced, not a candidate

`run.js` `5454d799…`, `dist` tree `f52073ae…`. It was written while the review batch was still arriving and is superseded by build 8.

## Build 6 (superseded for review; retention semantics): 22:49:59Z

It supersedes build 5 **for retention**. Changes since build 5:
- **Per-channel resting registry** with a per-epoch stack, giving nested unwind per channel.
- **Displayed-transform adoption** (scale and slide).
- **Reduced motion** reaches the full resting pose (opacity, scale, slide), including scoped `content`/`backdrop` selectors.
- **Accepted transitions end the previous resting state** even when unclaimed.
- **Removal is safe:** a removed node is never re-held.
- **Lease stable value** is measured under any inline write (`target-registry`). This fixes rapid reopen re-resting at stable × displayed, the reference probe "rapid reopen during the close re-rests".

| Identity | SHA-256 |
|---|---|
| **`dist` tree** (1262 files) | `d522f2e5fc40d37dea58afae9fea984809e6e2573089c822e485eff290ed68ff` |
| **`src` tree** | `737c38fcf301d609cf7e978cc6900d233e86d707d5ac0d37e0e7fef5d3ead8d8` |
| Frozen numeric sources | Unchanged: `480494cd…`, `22404659…`, `6ad7096d…` |

**Gates at build 6:**

| Gate | Result |
|---|---|
| `tsc` | 0 |
| `dist-freshness` | 10/10 |
| Overlay plus independent probes plus S1 plus representation plus visual | 579/579, three engines |
| Retention requirement probes | 21/21, three engines: nested unwind, reduced pose (scale; scoped plus slide), channel independence, displayed-transform adoption, removal, rapid reopen |
| Broad suites | **Not rerun on build 6.** Build 5 ran 912/912 and 1050/1050. `target-registry` changed since, and the targeted suites above cover lease users. |

## Build 5 (superseded): 22:43Z

It supersedes builds 3 and 4. It adds:
- R1–R6 and R-11;
- the C2 default phase: store checkpoint, Host `$effect.pre` for bindable updates, and `presentation` for conditional overlays;
- the live page reaction (no floor);
- overlay-lifetime resting reactions with a per-epoch stack (nested unwind) and reduced-motion pose;
- the Firefox test-only sync patch.

| Identity | SHA-256 |
|---|---|
| **`dist` tree** (1262 files) | `7b206161952b48d98f816c1e4d966ecbd132ca07875e6313f0677b79cea8b600` |
| **`src` tree** | `83bfd00955d4c3446c51d4f3ae52836ca134e8ce0ea469346fab4140ad643f1e` |
| Frozen numeric sources (`channels.ts`, `hermite.ts`, `channel-types.ts`) | Unchanged: `480494cd…`, `22404659…`, `6ad7096d…` |
| Independent probes (copied unchanged) | `core-astra-probe` `63edfb31…`, `core-astra-public-probe` `88d135a4…` |

**Gates at build 5 (22:43Z):**

| Gate | Result |
|---|---|
| `tsc` | 0 |
| `svelte-check` | Only the non-owned `video-fallback-review` / `VideoCard` issues |
| `dist-freshness` | 10/10 |
| Overlay plus independent probes plus S1 regressions | 180/180, three engines |
| Retention requirement probes | Nested unwind, reduced-motion scale pose, channel independence: all pass, three engines |
| Full broad suites on this exact candidate | Running at 22:43Z. The build-4 sources ran 888/888 (fluid-motion) and 1042/1042 (navigation/store). |

## Build 3 (superseded): 22:08Z

It supersedes build 2. It adds the **C3 critical-finding correction**:
- the media-tag blanket is removed; copies are portable;
- a real unreachable layer gets faithful per-participant settlement.

See `implementation-interface.md` §7, "Layer reach".

| Identity | SHA-256 |
|---|---|
| **`dist` tree** (1262 files) | `dada6d1db00add9a2f73e63f69821643d3624e45bd6741c9f454c7bd6f31fe77` |
| **`src` tree** | `b8d4b35037b48e2e2080ab0ad44b680f475ebe16b1b3643cb7aee02d3aae4921` |
| `channels.ts`, `hermite.ts`, `channel-types.ts` | Unchanged: `480494cd…`, `22404659…`, `6ad7096d…` |

Only `run.js` changed since build 2: `b786a362ef449b98`. Unchanged: `route-host.js` `7c71d1a2fd55fee1`, `overlay-motion.js` `f88ed228e217789f`, `overlay-scopes.js` `5ebe8e8ad70b3786`.

**Gates at build 3:**

| Gate | Result |
|---|---|
| `tsc` | 0 |
| Emitted types | 0 |
| `svelte-check` | Only the non-owned `video-fallback-review` / `VideoCard` issues |
| `dist-freshness` | 10/10 |
| Overlay plus S1 regression witnesses | 27 files, 102/102, three engines |
| Full fluid-motion suite | 831/834 |

The three full-suite failures are all Firefox `representation.browser.test.ts` "animation stack continuation after retirement": WAAPI `sleep(120)` timing in the Representer domain, which this delta does not touch. They are **intermittent in isolation** (68/68 on one run, failing on the next), and the same file failed in the build-1 full run.

## Build 2 (superseded): 22:01:38Z

It supersedes build 1 below. It adds the midpoint-findings corrections plus gaps 2, 4, 5, 7 and U2; see `implementation-interface.md` §7.

| Identity | SHA-256 |
|---|---|
| **`dist` tree** (1262 files, same method as build 1) | `a9f31010c6a2f02ca823a6dda93a6e7d3decd762e6a86acf2591b11965bf2c6f` |
| **`src` tree** | `2e5e7a367e1c530b9404411218679745e5de6728cfd767f67b0ff4027d038d9a` |
| `channels.ts` (frozen numeric sources, **unchanged** since build 1) | `480494cd…c814bb` |
| `hermite.ts` | `22404659…1d8163` |
| `channel-types.ts` | `6ad7096d…fe7f84a` |

Changed `dist` modules (first 16 hex characters):

| Module | Hash |
|---|---|
| `run.js` | `199e453886ec42ee` |
| `route-host.js` | `7c71d1a2fd55fee1` |
| `overlay-motion.js` | `f88ed228e217789f` |
| `overlay-scopes.js` | `5ebe8e8ad70b3786` |

Unchanged: `channels.js` `6bea38fef806c3b4`, `hermite.js` `32634c02d574f5f0`, `overlayLayers.js` `2f3a2939ab6be589`, `primitives/overlayMotion.js` `aacc2e77d4333009`.

**Gates at build 2:**

| Gate | Result |
|---|---|
| `tsc` | 0 |
| Emitted-types project | 0 |
| `svelte-check` | Only the two non-owned `video-fallback-review` errors and the `VideoCard` caption warning |
| Overlay plus S1 regression witnesses | 27 files, 96/96, three engines |
| Full fluid-motion suite (81 files) | 827/828. The one failure is a Firefox `visual.browser.test.ts` C1 retarget tolerance under full-suite load (numeric domain); it passes 15/15 in isolation. |

## Build 1 (superseded): 21:48:14Z

- **Built:** 21:48:14Z, `packages/core`, `npm run build` (`svelte-package -o dist` plus declaration bridges).
- **Base commit:** `2e07f650c1421c25f6b29d2db9c0cc885ea891ed`. Uncommitted working tree on `codex/fluid-overlay-orchestration`.
- **Status:** **provisional.** Final witnesses follow after the freeze. This build has **not** been independently reviewed.

## Identity

| Identity | SHA-256 |
|---|---|
| **`dist` tree** (1262 files; `shasum -a 256` per file, `LC_ALL=C` sorted, then hashed) | `1bea932c6980963464f1df3a0cb483079f37894398f384a5bd459e7ace377280` |
| **`src` tree** (same method) | `e90c2fdad66f9b698c197dace3be357c46ee965005bd281310273e0a02e3c35f` |
| **Frozen numeric sources** (correction 3, independently approved, not edited by core): `channels.ts` | `480494cd96f7b64657a5239ac80456fef442a156ecf2f737adaf08b6a5c814bb` |
| `hermite.ts` | `22404659c856fe456ea5073a48dae553d842b5a7cebcc76b84b8c20f272d8163` |
| `channel-types.ts` | `6ad7096d83c50865d015246189097f5b22ed166aca448479ca8c09c20fe7f84a` |

Key `dist` modules (first 16 hex characters):

| Module | Hash |
|---|---|
| `run.js` | `9d643c0a88903dd1` |
| `route-host.js` | `347b037c9a109b2b` |
| `overlay-motion.js` | `d7a37c1e4a509f56` |
| `channels.js` | `6bea38fef806c3b4` |
| `hermite.js` | `32634c02d574f5f0` |
| `actions/overlayLayers.js` | `2f3a2939ab6be589` |
| `primitives/overlayMotion.js` | `aacc2e77d4333009` |

## Gates at this build

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| Emitted-types project | 0 errors |
| `dist-freshness` | 10/10 |
| `svelte-check` | **2 errors and 1 warning, all in files core does not own:** `tests/fluid-motion/video-fallback-review.browser.test.ts:48–49` and `video-fixtures/VideoCard.svelte` (caption warning). The overlay/core files are clean. |
| Overlay witnesses (`tests/fluid-motion/overlay-*`) | 57/57, 3 engines |
| Full fluid-motion suite (run before the last type-only edits) | 800/810. The 10 failures are `render.browser.test.ts` on WebKit (`history.replaceState` more than 100 times per 10 s under full-suite load) and one Firefox `representation` timing case. **Both files pass in isolation, 246/246, 3 engines.** |
| Node repo policy | `animation-policy` fails on the reference app (`Turntable.svelte`, `styles.css`; not core). `optional-props` fails on the repository-wide count; this delta adds nothing to it. |

## Explicit entry after the midpoint findings

`handle.transition(plan, commit)`:
1. **Captures sources before `commit`**, acquiring nothing: no lease, no write, no arbitration.
2. **Acquires only when the committed transition is claimed** for the current epoch (`accept()`).
3. **Otherwise discards**, disposing only its captures. An overlapping earlier run keeps its copies, leases, tracks and obligation.

A status-effect re-run caused by unrelated state continues the live claim instead of restarting it.
