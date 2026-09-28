# Independent Astra review: overlay guidance snapshot

Reviewed 2026-09-27, completed 21:57Z. Fresh independent review context dispatched as GPT-6 Astra HIGH by Main under canonical MULTI_AGENT_ARCHITECTURE v2.10. No authoring of product fixes; only this review report and isolated `/private/tmp` probes. Scope is the 14-file Opus-authored documentation/skill/fixture delta against `2e07f650c1421c25f6b29d2db9c0cc885ea891ed`, on `codex/fluid-overlay-orchestration`. This is not a runtime approval.

## Disposition

**Changes requested for one P2 evidence defect.** The guide's actual public example compiles and its four overlay browser checks pass against the provisional 21:48 build. Its callback-owned lifecycle teaches no app timer, animation effect, or subscription. The new APIs, scoped selectors, scale/easing shapes and unreleased status agree with the provided interface. Final guidance acceptance still requires the bounded test correction below and reconciliation against final core facts for native fallback diagnostics and the combined nested timeline. Those pending runtime deliveries belong to core, not the guide author.

## P2 G1 — Reversal test cannot detect the stale completion it claims to exclude

Location: `docs/development/fluid-motion/guidance-example-check/tests/app.browser.test.ts:209–218`; relevant reducer guard: `src/model.ts`, `notesPresented` case.

The test samples presentation status and asserts that it never sees `presented`. However, `notesPresented` is deliberately ignored unless the current status is `presenting`. A cancelled open can therefore incorrectly invoke `onPresentationComplete` after the close has entered `dismissing`, and the test still passes. It also stops at `idle`, without an observation window through the original open's completion deadline. This is an evidence/test-quality defect, not evidence of a runtime cancellation defect.

**Independent discriminator:** in an isolated copy, factored the existing callback into `presented()` and made the close button dispatch `closeNotes`, then call that exact callback immediately. The unmodified reversal test passed, while the browser logged `REVIEW_MUTATION: stale onPresentationComplete invoked after closeNotes`. The test file's SHA-256 remained identical to the review snapshot.

**Required narrow correction:** observe callback/action deliveries before reducer filtering, require zero open-completion deliveries for the cancelled open and exactly one dismissal completion, and observe through both relevant deadlines. Ensure the opening has actually begun motion before reversing. Keep instrumentation test-owned; do not add an application timer or subscription to implement lifecycle behavior. The stale-callback mutation must fail the corrected witness. Core's independent cancellation tests may supply runtime evidence, but cannot make this fixture assertion prove a claim it does not inspect.

Mutation evidence:
- `/private/tmp/overlay-guidance-review-probe/src/DetailView.svelte` (mutated fixture): `c51bfc61daec8c07c19fdceaf9b8294f0ef5978a3de6d004aba5980f01fb1b00`.
- `/private/tmp/overlay-guidance-review-probe/src/DetailView.svelte.original` preserves the reviewed fixture before mutation.
- `/private/tmp/overlay-guidance-review-probe/tests/app.browser.test.ts`: `f568a871d6d7a39c829a0f200d6de5e4d3feb6402a3d2a55f69f4d67575cef0e`.
- `/private/tmp/overlay-guidance-review-probe/stale-callback-mutation.log`: `f8d39ddb7e66bad8538db5593714ad5fcc04576731783062ab0dbb30b3d51a46`.
- Command from that scratch directory: `packages/core/node_modules/.bin/vitest run --config vitest.browser.config.mjs -t 'a close during the opening'`, using the repository's absolute binary path. Saved run 23:57:17 local: **1 passed, 9 skipped**, stale callback invocation recorded. Earlier identical mutation also passed at 23:56:24.

## Non-blocking observations

- The navigation pin intentionally substitutes a plan-free `useOverlayMotion()` imported from the internal module for the actual SKILL script. Its markup guard therefore does not continuously qualify the public import or plan-building script; `doc-typecheck`'s motion-subpath limitation is already disclosed. I separately extracted the **entire actual SKILL overlay Svelte fence** into the scratch project's `src/SkillOverlayExtract.svelte`: strict svelte-check reports zero errors and warnings, so no current script API error is found. Prefer retaining a full-script public-package fixture after integration.
- `.claude/skills/composable-svelte-navigation/SKILL.md:69–70` and `packages/core/docs/application-contract.md:71` use the shorthand `motion={useOverlayMotion(…)}`. The full example correctly creates a stable handle during component initialization. Prefer `const dialog = useOverlayMotion(…)` then `motion={dialog}` consistently, to avoid teaching repeated handle construction in a reactive prop expression. This is clarity advice, not a reproduced runtime defect.
- The explicit-close test proves replacement for the exercised close (and the author's independent mutation B discriminates it), but does not test the title's “for that transition only” reset on a later close. The core gate may cover reset; either extend the example test on correction or narrow its title/report claim.

## Pending final-core reconciliation (not new guide-author coding findings)

- Generated guide `packages/core/docs/fluid-motion.md:783` and `:1000` affirm a per-participant `unsupported` diagnostic when the intended layer is unreachable. The author accurately flags that this does not yet have a matching per-participant witness/reason in the provisional build. Keep final acceptance conditional on a real final runtime diagnostic and focused witness; do not convert an invisible participant into reported animation success or silently waive C3.
- `packages/core/docs/fluid-motion.md:987` currently promises only nesting/stacking and cancellation when the owner retires. It does **not** claim that the combined parent+child close timeline has been witnessed. Add the required final combined-timeline and refused-parent behavior only from the final core facts, as the author and Main already agreed.

## Checks executed independently

All execution probes were under `/private/tmp/overlay-guidance-review-probe`; snapshot and product files were unchanged. The scratch fixture was copied from the existing fixture, then overlaid with the frozen review files. Dependencies resolve through the existing package exports. Browser config adds an explicit Vite filesystem allowlist for the scratch directory and repository; it does not alias core source. No whole-core/workspace suite was run.

| Check | Result |
| --- | --- |
| All 14 manifest entries recalculated | Match |
| Generated guide versus frozen template plus frozen/baseline source inclusions | Exact match |
| `svelte-check --workspace /private/tmp/overlay-guidance-review-probe --tsconfig ./tsconfig.json --fail-on-warnings` | 0 errors, 0 warnings; includes literal full SKILL fence extraction |
| `vitest run --config vitest.config.mjs` | 15/15, 3 files |
| `vitest run --config vitest.browser.config.mjs -t 'overlay orchestration'` | Chromium 4/4; 6 unrelated tests skipped |
| Stale-callback mutation, unchanged reversal test | Still passes; demonstrates G1 |

The first sandboxed browser launch could not bind localhost (`listen EPERM`); the same bounded check succeeded through normal approved escalation. No API behavior inference is made from that environment error. Author-reported 41 repository-doc checks and full 10 Chromium checks were inspected, not all repeated independently.

Provisional built modules used by the checks match the supplied 21:48 identity prefixes:
- `dist/application/renderer/choreography/run.js`: `9d643c0a88903dd1aded0ad82182dc24b0729dfc6fcd329356d665b14ef88ced`.
- `route-host.js`: `347b037c9a109b2b6eb07cfef29fe441a7f1cb509dfe959de4653028749859c5`.
- `overlay-motion.js`: `d7a37c1e4a509f567494da1b31b13e27b2b341be170db1271217f5287e278ab8`.

The runtime source is still moving. Focused example passes qualify this documentation snapshot against that provisional build only; repeat affected execution evidence after the final build, and review the final textual delta for pending claims.

## Snapshot identity

- Manifest: `bc737ce2e9743253155b65255d8128e473998198296999518ea60bae8d8c01c8`.
- Frozen author report: `9e210a1783f0ee0685b4544a2308604c8ee83fd0907184773da1f8e4fcd367e6`.
- Canonical policy v2.10: `aee15911c14bb95093fe56efb648d345e8c250b474072bc0f17f2429fe3b1fab`.
- Interface: `549db35ed84937f1025a11ee6976467784bdf50cd63cec1d44425411752e3c2e`.
- Final design disposition: `533428c1387f6985168d765ee9dcb9d8310ff2d73251046d9816dc55e20e5aab`.
- Provisional build identity document: `238568e1ede7f48d5dd0bdde98bd7bef90ac6d003e571648eb060aa23642cd6b`.

| Reviewed file | SHA-256 |
| --- | --- |
| `packages/core/docs/fluid-motion.md` | `62d8029a8e78a0f9d7a8e5ac0cccae6c2491ecfc7a50cac7727c7e3b2523df53` |
| `packages/core/docs/application-motion.md` | `1208d5d544568f850840ec614ee11806ab248244eccf260a391284cf3140f2be` |
| `packages/core/docs/application-contract.md` | `c35e2480d2aec85e2af9dd67f25e78d2d9e051c8121553268e9fc529370205e6` |
| `packages/core/README.md` | `fff09df91651136d4fb849c81fcafbf1ef8e4c595e5e57a4f6877997dc487540` |
| `.claude/skills/composable-svelte-navigation/SKILL.md` | `756cf025bc9b6adb8770bb6260c955577426dc83d2fa633e466bf6b1e9107c6e` |
| `packages/core/tests/test-components/SkillExamples-navigation.svelte` | `030d60d0fa65144637912da4c44c8cbf8a8eb670188308d6c524957e6701a26b` |
| `packages/core/tests/repo/skill-examples.test.ts` | `c6801e968d1731c2501eda6410fd2bd0875d83aca8689d1df32dc1c69959858d` |
| `docs/development/fluid-motion/guidance-example-check/fluid-motion.template.md` | `97982456b7d99a3c9656880c500b99624c08688e36028ca7b5ca7092fc8fb553` |
| `docs/development/fluid-motion/guidance-example-check/src/model.ts` | `ac9366f40d0e625b5a454be879f03e14599a18f10891ab5be8cd769e3450c949` |
| `docs/development/fluid-motion/guidance-example-check/src/motion.ts` | `35152916830d0da13bdc744a21d7f6f7eb735d282135c2903865dd1589d5e9a4` |
| `docs/development/fluid-motion/guidance-example-check/src/DetailView.svelte` | `159c09b978aefd9fe7762d202a41536285d991255808240e7eb558c88b5477e2` |
| `docs/development/fluid-motion/guidance-example-check/tests/plans.test.ts` | `bdcaf1401e7af06f57d85a761be6131e3a0c2a7c01687946be6ae00e63b69be0` |
| `docs/development/fluid-motion/guidance-example-check/tests/app.browser.test.ts` | `f568a871d6d7a39c829a0f200d6de5e4d3feb6402a3d2a55f69f4d67575cef0e` |
| `docs/development/fluid-motion/guidance-example-check/vitest.browser.config.mjs` | `0d9d12546e29aae74d8e23055cc557bda2c931f4ef9e675aefcf1d2299b139ad` |
