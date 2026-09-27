# WebGPU correction independent review

**Verdict: W1 and W2 closed; the targeted WebGPU delta passes.** GPT-6 Astra, HIGH; 2026-09-27. Prior independent real Metal rendering, retained-pixel and Host witnesses, and earlier WebGL/G1/G2/cost/focus gates remain accepted. This is a correction review, not whole-feature acceptance.

## Identity and scope

- Correction manifest SHA-256: `ac3c1e77446e8f4ab51c3c7cf795cb5a002cfa1e488074c259590ebf784f1e81`. All **58 scope files and 119 dist files** verified against their frozen hashes and live files before and after execution; no correction-scope drift.
- Four source/document/test changes versus original `a78ef956ca6d51d8cfe5b127930ffc9feb8f51148c28f00004db083e9ece0544`: adapter, README, retained browser test, new initialization-failure browser test. All other original scope entries remain identical. Dist delta is limited to adapter JS/declaration/declaration-map.
- Adapter source: `cfcf66ebcfb02d42956058b8cfeccf27f10b67dd0e87d34331550c9822f5fc84`; adapter dist JS: `9f777a0048b1fe31d6fcdecf3c147558dba3171644de7c2c626cd7844434d379`; README: `6335983ee3f689fb87077f1d7ffc9e9019bb3c56e31500a749cd45839d035f71`.
- Same frozen core dependency: `representation-final-boolean-snapshot/manifest.json`, SHA-256 `a5fb876d2640dda46d9b2d8999a5f076f5eb4aff3e32170954dea5a4c76429c6`. All 1,247 dist entries verified and served through the immutable module hook. Live core source **and dist** had evolved; neither was substituted for the frozen dependency.
- Read author report §7. Author test counts are supporting evidence, not this review's independent runs. No product edits, rebuild or broad suite repetition.

## Closure evidence

**W1 closed.** Partial disposal now attempts Babylon cleanup, then destroys any allocated device and removes only that engine's exact registration if complete-engine disposal throws. The original initialization reason remains the reported failure. The unchanged independent rejection reproduction now reports `Error: WebGPU initialisation failed: review-device-allocation-denied`, with EngineStore count **0 → 0**, no authority.

An additional independent real-device probe covers the previously unforced fallback branch: keep an unrelated initialized WebGPU engine alive, allocate a second real device, and throw during its `addEventListener` setup **before Babylon creates `_timestampQuery`**. Observed original reason preserved; allocated device's `lost` promise resolves; store count **1 → 1**, every original store entry remains the same object, and the unrelated engine is neither removed nor disposed. Repeated disposal of the failed adapter is harmless; the survivor subsequently disposes normally. This exercises fallback device destruction, unlike the author's later canvas-configuration failure where ordinary Babylon disposal succeeds.

**W2 closed.** The per-instance `initAsync` wrapper detects settlement after engine disposal, destroys the late device and suppresses only that post-release rejection. The unchanged real pending-restoration reproduction now observes `restoredDevice:true`, `restoredLost:true`, disposed engine and zero graphics ledger, with **no unhandled rejection**. Babylon still logs its internal fatal-initialization message when its disposed canvas rejects; the promise is handled and native ownership is released. Live-engine failure rethrow remains explicit in the wrapper; no global prototype or WebGL lifecycle override was added.

**Independent runs: 5/5 pass**, using Chromium 141/Babylon 8.36.1 and the same real-Metal browser flags:

- Four unchanged probes (`failure-append.ts` SHA-256 `c83b5eefb73d9df5a45e80e52ca63ecf473afa65297ebd8aae474cae04c26ae1`): device-allocation rejection, owner retirement during allocation, settled real device loss retaining the last mirror frame, pending restoration at final release.
- One added partial-device/unrelated-engine ownership probe described above.

The README now explicitly distinguishes emitted lazy chunks from eager loading; the stale claim that WebGPU is unimplemented is removed. No remaining substantive wording issue in this correction. Native cleanup reads Babylon's internal `_device`; this remains a version-coupled implementation detail covered here against the installed 8.36.1, not a promise about future Babylon internals.

## Reproduction and retained evidence

From `packages/graphics`:

```sh
pnpm exec vitest run --config ../../docs/development/fluid-motion/remaining-webgpu-astra-evidence/correction-failure-browser.config.ts -t independent
pnpm exec vitest run --config ../../docs/development/fluid-motion/remaining-webgpu-astra-evidence/correction-extra-browser.config.ts -t 'independent correction'
```

Evidence in `remaining-webgpu-astra-evidence/`: `correction-failure-browser.log` (4/4), `correction-extra-browser.log` (1/1), `correction-extra-append.ts`, and `correction-identity-before.json` / `correction-identity-after.json`. Original failing candidate, unchanged repros, logs and earlier approval reports were preserved.
