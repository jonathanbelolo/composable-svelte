# Independent Astra review — final guidance semantics

Completed 2026-09-27 22:50Z (2026-09-28 Europe/Paris). Same independent Astra HIGH context as the initial guidance and G1 correction reviews. Scope: immutable final semantic documentation/fixture delta, plus its two-file source-phase prose correction. No product edits; no broad runtime review or final runtime approval.

## Disposition

**Accepted within documentation and fixture scope; no open blocking finding from this delta.** This acceptance covers the 16-file final-semantics snapshot with the two guide/template files superseded by the phase-prose snapshot. It retains unchanged evidence from `guidance-astra-review.md` and `guidance-correction1-astra-review.md`, including G1 closure.

Final integrated acceptance remains conditional on the runtime owner finishing and independently qualifying the outstanding retention/reduced-motion/scoped-selector/transform-adoption behavior, then the author's narrow final-build rerun. No documented exception was introduced to excuse those incomplete runtime paths.

## Reviewed semantic delta

- **C2 source capture and conditional declaration:** the guide teaches a stable pre-existing handle in a surviving owner, an optional read-only `presentation` getter when the primitive mounts conditionally, and the precise temporal limit for a handle first created after its source is already gone. It requires no application capture hook, timer, duplicated state or effect timing. The `presentation` option exists in build 5's public declarations.
- **Source-phase prose correction closed:** the first final-semantics snapshot incorrectly applied “after reduction” to explicit preparation. The two-file correction now says explicit `transition(plan, commit)` captures **before commit**, while default store transitions capture **after reduction and before destructive render**. This matches the owning interface and Main's dispositions without weakening C2. Both frozen generated guides match their corresponding templates and included fixture sources exactly.
- **C3 faithful settlement:** the guide now names `layerUnreachable:<reason>`, removal of the failed copy and restoration of real endpoints while other tracks continue. The named diagnostic and settlement branch exist in immutable build 5. There is no obsolete blanket top-layer refusal, media-tag prohibition or “hidden flight is success” teaching.
- **Combined nested motion:** the guide teaches a parent's explicit plan selecting a live child's participants. This is supported by the frozen U2 core witness that commits `closeAll`, joins the child into the same run and checks each dismissal once. This was read as supporting interface evidence, not independently rerun or accepted as a whole-runtime gate.
- **Overlay-lifetime page reaction:** the example now actually declares outgoing `lifetime: 'overlay'` for page opacity 1→0.6 and scale 1→0.98; its close plan restores both. The public plan declaration supports this field. The guide distinguishes ordinary transition lifetime, completion from retention, refused close from accepted close, per-instance contribution and disposal. It does not teach application styles/state as a workaround.
- **G1 is preserved:** both callback-observer files are byte-identical to the accepted G1 correction, and the existing delivery-count assertions remain. The new lifetime witness observes actual callback deliveries and visible computed styles, not just store status.

## Independent focused evidence

Scratch directory: `/private/tmp/overlay-guidance-final-semantics-review-probe`. All probes and mutations are there. Its `frozen-core/dist` is copied from `core-correction-build5-snapshot/core-dist`; all **1262 files** were verified byte-for-byte after execution. A copied package manifest preserves real public exports; dependencies use the existing installed versions. There is no alias to changing core source or live dist. Vite alone receives an explicit filesystem allowlist for scratch and repository dependencies.

| Check | Result |
| --- | --- |
| All 16 final-semantics hashes and both prose-correction hashes | Match |
| Generated guide versus exact corrected template and snapshot/baseline inclusions | Exact match |
| Strict `svelte-check --fail-on-warnings` on the frozen fixture/build | 0 errors, 0 warnings |
| `vitest run --config vitest.browser.config.mjs -t 'overlay orchestration'` | Chromium **5/5**, six unchanged non-overlay tests skipped |
| Negative control: remove only `lifetime: 'overlay'` from scratch `src/motion.ts` | New lifetime test fails at line 260: actual opacity 1 / scale `none`, expected 0.6 / `0.98` |

The green lifetime witness verifies a held computed pose beyond open settlement; refusal keeps it; accepted close samples an intermediate opacity, returns to stable opacity/scale and clears inline writes; completion deliveries are exactly presentation then dismissal. The negative control demonstrates that ordinary transient motion cannot satisfy that witness. The test does not separately establish every rapid-reopen, nested, reduced-motion or competing-channel scenario; those belong to the runtime gate.

Execution evidence:
- `/private/tmp/overlay-guidance-final-semantics-review-probe/normal-browser.log`: SHA-256 `d28e50f8017db6e14d9e2faaf3de8a96de57f5db6eecd29f62999262879d89db`.
- `/private/tmp/overlay-guidance-final-semantics-review-probe/lifetime-mutation.log`: SHA-256 `e528f9f747836622bd169ab2452f8c6a70b08f3f1de246c34266f450fb09df0a`.
- Scratch `src/motion.ts.original` retains the unchanged accepted example; `src/motion.ts` contains the one-field negative control. Snapshot and live fixture files were not changed.

The author reports full Chromium 11/11, node 15/15 and repository-doc 41/41 on build 5. This review independently repeats only affected overlay execution and strict compile. No whole-core or workspace suite ran.

## Remaining integration limits

- Broad retention semantics in the guide express Main's approved contract. Build 5 itself remains incomplete for reduced-motion slide/scoped selectors and some transform-continuity/adoption cases. This report neither reclassifies those cases as unsupported nor claims that five example passes close those runtime obligations.
- The guide's new detailed capture paragraph is currently scoped to store commits; it does not prescribe a bindable-only post-render exception. Equivalent pre-removal bindable behavior remains a final runtime qualification concern.
- Browser Back remains a listed accepted cause. The author discloses missing dedicated core evidence; the example fixture does not prove that cause.
- Repeat the narrow affected fixture checks against the final immutable runtime build. A later material wording change or runtime-facing example change needs corresponding delta review; unchanged scope retains this evidence.

## Candidate and build identity

- Final-semantics manifest: `b603cd4830cfd2aaa81413560b2fbe96299df0fbbc7bac0691ff6d53688ae9a7`.
- Superseding phase-prose manifest: `217b4704af3d2b88f2595d090c90d4cd223a1c7a3df4274e1f4548a2938bab71`.
- Build-5 snapshot manifest: `684235fdb87173d7dd926cbf4d27711b6927e8bb4921ca1889c4db015a514eaf`.
- Frozen `run.js`: `975e75a58326750b908b2ba576fbd453b4b1fcf1a651e04d259e8617a1c822b4`.
- Frozen `overlay-motion.js`: `cb58c38914768aaa9632e0875c09356a6201646e9d3963e72e2429c1561f463d`.
- Frozen `route-host.js`: `413f4e23ed4a1675fe7d43fefa46d566ea2ddc46e3ac1ff5b1f29b53dd25adc8`.
- Frozen `plan.js`: `7670faab4a1dea9658e49bb20ca9176b160c1cd055b2d299dc144256520954f3`.

Effective reviewed file hashes (two prose files use the superseding snapshot):

| File | SHA-256 |
| --- | --- |
| `docs/development/fluid-motion/guidance-example-check/fluid-motion.template.md` | `eaadbfbf3444811e474f6f04440c376bf3f1cb9a1cf61593970bc77ce9aa7482` |
| `packages/core/docs/fluid-motion.md` | `2cd5c25dee74e4102b5d8cd5013c12847351f011a8d42ee9f952ae7711fbc60c` |
| `docs/development/fluid-motion/guidance-example-check/src/model.ts` | `ac9366f40d0e625b5a454be879f03e14599a18f10891ab5be8cd769e3450c949` |
| `docs/development/fluid-motion/guidance-example-check/src/motion.ts` | `0ceed3a683188cc88db4195b0c712cbc50140a085344a55beed5c68bfd7f572f` |
| `docs/development/fluid-motion/guidance-example-check/src/DetailView.svelte` | `159c09b978aefd9fe7762d202a41536285d991255808240e7eb558c88b5477e2` |
| `docs/development/fluid-motion/guidance-example-check/tests/plans.test.ts` | `bdcaf1401e7af06f57d85a761be6131e3a0c2a7c01687946be6ae00e63b69be0` |
| `docs/development/fluid-motion/guidance-example-check/tests/app.browser.test.ts` | `05f3ba34d3b8cf9c9d6ec4bddedff5b5b0ef7b5a0e4e4c7f78dde3a75f56d2c6` |
| `docs/development/fluid-motion/guidance-example-check/tests/modal-probe.ts` | `68b8ed367e1a401d8e3c588cf279dd1320214b2856e4142633a249b613724488` |
| `docs/development/fluid-motion/guidance-example-check/tests/ModalProbe.svelte` | `6c679ce1799e203b734484e3decb9aeaab88064cb4bcbb796fb5d1aed215e772` |
| `docs/development/fluid-motion/guidance-example-check/vitest.browser.config.mjs` | `0d9d12546e29aae74d8e23055cc557bda2c931f4ef9e675aefcf1d2299b139ad` |
| `packages/core/docs/application-motion.md` | `1208d5d544568f850840ec614ee11806ab248244eccf260a391284cf3140f2be` |
| `packages/core/docs/application-contract.md` | `c35e2480d2aec85e2af9dd67f25e78d2d9e051c8121553268e9fc529370205e6` |
| `packages/core/README.md` | `fff09df91651136d4fb849c81fcafbf1ef8e4c595e5e57a4f6877997dc487540` |
| `.claude/skills/composable-svelte-navigation/SKILL.md` | `a1e6de08e65a88e966ccf8885ce3f8918b18fb2ba3fcf5784a120d8080076e54` |
| `packages/core/tests/test-components/SkillExamples-navigation.svelte` | `030d60d0fa65144637912da4c44c8cbf8a8eb670188308d6c524957e6701a26b` |
| `packages/core/tests/repo/skill-examples.test.ts` | `c6801e968d1731c2501eda6410fd2bd0875d83aca8689d1df32dc1c69959858d` |
