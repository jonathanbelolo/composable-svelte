# Reference teardown correction independent review

Independent GPT-6 Astra, high effort; 2026-09-27, canonical collaboration policy v2.10. Bounded R1 follow-up; prior unchanged reference/optimizer gates retained. Frozen `remaining-reference-teardown-snapshot/manifest.json` SHA-256 `2885c3101943508cf7792533e3d3dcd4713d0ec065c00d31c0cf56f68d2cb037`: all six file hashes verified before and after review.

**R1 closed. No new findings in the reviewed delta.**

- `outgoingMirrorChange` now restores in `finally` and removes its fixture from the pending-cleanup array before returning. The exact prior missing-representation stub, rerun against this frozen function, returns `representation:false` with **one restore** and **zero remaining fixtures** (previously zero restores).
- The same `finally` pattern is correctly applied to `leavingIntro`. Forced failure at the first awaited operation in each exact frozen helper preserves the thrown error, calls restore exactly once, and empties the fixture array.
- The exact frozen retry callback still fails a valid pixel failure after **one control / one turning** call; permanently invalid sampling stops and fails at **three / three**; invalid-then-valid sampling uses **two / one** and passes. Every attempt remains recorded; pixel assertions remain outside retry.
- Reviewed history restoration changes in `support/observe.ts`, `entry.browser.test.ts`, and `hydration.browser.test.ts`: prototype methods are invoked with `history` as receiver; removing owned overrides exposes the native methods instead of retaining successive bound wrappers. This is appropriate to the isolated sequential browser fixtures. Three sequential invocations of the exact frozen `launch()`/`restore()` body with mount/history stubs restored both native method identities, removed both owned overrides, reset the prior URL, and unmounted/removed exactly three fixtures.
- The optimizer config is unchanged from the previously approved nested-dependency correction.

Independent check script: `remaining-reference-harness-astra-evidence/reference-teardown-negative.cjs`, executed with Node from the workspace root against frozen source. These are control-flow and lifecycle checks with stubs; no new full browser/app run was performed. No product edits, builds, or full-workspace gates.

The author's 42/42 run overlapped a core rebuild; its report accurately disclaims a single stable runtime candidate. This review approves the harness correction only. Final reference verification still requires the already-planned run on a stable coherent runtime, and is not implied by R1 closure.
