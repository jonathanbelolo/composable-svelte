# Overlay orchestration guidance — report (guide1b61)

- **Author:** Opus 5.5 (`claude-opus-5-5`), retained native session `1b61b575`.
- **Assignment:** `docs/development/fluid-overlays/guidance-assignment.md`, plus two in-turn messages: the navigation SKILL audit, and ownership of `skill-examples.test.ts` and its pinned fixture.
- **Policy:** v2.10.
- **Base:** `2e07f650` on `codex/fluid-overlay-orchestration`.
- **Timing:** received 23:03:34 local; ceiling 00:03:34. This report 23:13 local.
- **Not done:** no commits or pushes, and no library source, reference app, manifest or lockfile edits. Not self-approved: a fresh independent Astra HIGH review follows.

**Status: docs, SKILL and executable fixtures authored against the stable interface** (`implementation-interface.md` §1–§3, amended 20:57/20:58Z). Static checks pass. **Final compile and browser evidence for the example project waits for Sol's coherent core build.** The built core is older than the interface: `useOverlayMotion` is not yet exported from the motion subpath, and scoped selectors are not yet wired in `run.ts`.

## Owned paths (touched)

| Path | Role |
|---|---|
| `packages/core/docs/fluid-motion.md` (generated) and `docs/development/fluid-motion/guidance-example-check/fluid-motion.template.md` | Public guide |
| `docs/development/fluid-motion/guidance-example-check/src/{model.ts,motion.ts,DetailView.svelte}` | Executable example: notes dialog |
| `docs/development/fluid-motion/guidance-example-check/tests/{plans.test.ts,app.browser.test.ts}` | Guide tests: node plan rules and browser overlay witnesses |
| `packages/core/docs/application-motion.md`, `packages/core/docs/application-contract.md`, `packages/core/README.md` | Cross-links and discovery (marked unreleased) |
| `.claude/skills/composable-svelte-navigation/SKILL.md` | Agent guidance |
| **Pinned fixture:** `packages/core/tests/test-components/SkillExamples-navigation.svelte` | New overlay fence markup pinned |
| **Guard:** `packages/core/tests/repo/skill-examples.test.ts` | Existing checks kept; 3 new teaching checks |

## What the guidance now says

**Guide §4, plan rules:**
- participants are keys or exact overlay selectors;
- `easing` is a keyword, `{ cubicBezier }` or `'cubic-bezier(…)'`, with its bounds; overshoot is clamped on bounded channels; a retarget follows a continuation curve;
- `scale: { from, to }` on incoming and outgoing tracks (stable-scale restore, `scaleReleasedAtSettle`);
- `slide` on incoming and outgoing tracks, with the transform order;
- shared `from`/`to`, with their phases;
- a waypoint's `easing` governs the segment that **ends** at it.

These match `plan.ts` as implemented by S1 (read at 23:05).

**Guide §12, "Overlay orchestration" (new):**
- `motion` on the five overlays, their primitives, Command and ImageLightbox; the spring is unchanged without it;
- `useOverlayMotion` defaults, which apply to every accepted open/close whatever the cause; Escape and outside click need a managed `store` view;
- the explicit `transition(plan, commit)`;
- roles `'backdrop'` (not Popover) and `'content'`;
- instance scope by **DOM containment at attach**, including the page's `useParticipant()` used in a Modal snippet; epochs; exact selectors;
- phase binding for `from`/`to`;
- acceptance only on a committed `presenting`/`dismissing`; refusal acquires nothing;
- completion exactly once through `onPresentationComplete`/`onDismissalComplete`, **with no timer or subscription**, and the cancellation cases;
- supersession from the displayed values (reversal); disjoint concurrency; one writer;
- nesting;
- layering, with a **styling contract** (no `z-index`/`position` on overlay layers, framework-owned order), flights staying below higher interactive layers, and the exit shell kept until completion;
- the native `<dialog>`/`[popover]` path: ordinary in-surface decoration (design §10), otherwise a faithful per-participant settle reported as an `unsupported` diagnostic; a participant hidden under a backdrop is never counted as animated; portable representations (video, provider canvases) move between layers, and only an unreachable one settles. *(Corrected 23:16, see below.)*

**Obsolete teaching removed:** the blanket "top layer → run `unsupported` (`topLayer`)" limit and diagnostic example, "keyword easings only", and "incoming-only slide".

**Release status:** a new lead note says overlay orchestration, selectors, custom curves, outgoing slide and `scale` are **not yet in a published release** (the published 0.14.0 has keyword easings and incoming slide only). No version claim is made for them.

**Executable example** (embedded in the guide: §2 model, §3 `DetailView`, §4 plans):
- The notes dialog on the detail page has store-owned `notes: PresentationState` and completion actions from the `Modal` callbacks.
- The default `notesOpen`/`notesClose` plans cover:
  - a shared heading flight page → dialog → page, with a `cubicBezier` track and a waypoint `easing`;
  - an overshooting `'cubic-bezier(0.34, 1.56, 0.64, 1)'` content scale;
  - an outgoing content `slide`;
  - the backdrop fade;
  - a dimmed page body.
- `notesQuickClose` is the explicit override through `notes.transition(…)`.
- "Keep open" makes the reducer refuse `closeNotes`.

**SKILL corrections (per the in-turn audit):**
- Rule 3 principle and example: the reducer moves the lifecycle only; **no `Effect.afterDelay` completion and no animation `$effect`**; overlays animate and report completion through their callbacks.
- Both decision trees gain an overlay branch, and "Store-observed completion" becomes PresentationState plus the component callbacks.
- "Choosing the Public Motion Surface" item 3 covers overlay presentation, and item 4 marks the explicit helpers **legacy** (not for navigation overlays, never paired with a reducer timer).
- Anti-pattern 3's "correct" example becomes the component-owned `Modal` with `motion` and callbacks.
- Fluid rule 3 and checklist item 5 cover full easing and `slide`/`scale` on both non-shared sides.
- A new "Overlay orchestration" subsection has 5 rules and a real `svelte` fence, whose markup is pinned in the fixture.

## Checks executed (23:05–23:12 local)

| Check | Result |
|---|---|
| `node render.mjs --check` | the guide matches the template |
| `skill-examples.test.ts` (existing 7 + 3 new) | **10/10** |
| **Negative control** for the 3 new checks: the same logic applied to the **base** SKILL (`git show 2e07f650:…`) | the base fails all three (1 timer-paired fence; keyword-only phrase present; no `cubicBezier` and no overlay fence) |
| `doc-typecheck` | **10/10**, after fixing one real error it found (`PresentationView` imported from `/navigation`; corrected to `/application`) |
| `doc-examples` | 21/21 |
| Link and anchor check over the 5 edited docs (49 links, including `#12-overlay-orchestration`) | 0 problems |
| Core `svelte-check --tsconfig ./tsconfig.test.json` (includes the pinned fixture, compiled against **source**) | 13 errors and 1 warning, **all in core's in-progress source** (`run.ts` against S1's new `ParticipantSelector`; `dismissalCoordinator.ts`). **None in the pinned fixture or any guidance file.** |

## Waiting for Sol's coherent build (run on the provisional build at 23:49, see "Built-package evidence" below; re-run on the final freeze)

- `guidance-example-check`: svelte-check `--fail-on-warnings`, node `vitest.config.mjs`, and Chromium `vitest.browser.config.mjs`, run against the built package.
  - **Node:** the new plan-rule tests cover slide/scale sides and bounds, the easing forms and invalid curves, the overlay plans validating, and `from`/`to` shared-only.
  - **Browser:** 4 new overlay witnesses: default open/close with a shared flight and callback completion; a refused close starts nothing; the explicit override replaces the default for one transition; a reversal never completes the cancelled open.
- The pinned fixture's compile, once core source compiles.

## Doc–source consistency questions (for Sol / core91; not compensated in docs)

1. **Fallback diagnostics.** The guide names no settlement reason strings yet. It says only that a participant that cannot reach its layer settles faithfully and is reported as an `unsupported` diagnostic. The exact final reasons will be added after the build.
2. **Command/ImageLightbox** (resolved by Sol, 23:16): the same `motion` handle; defaults apply to accepted transitions of their bindable `open`, and the explicit entry works too. The guide says so.
3. **Design §5's `motion?: { backdrop, content }` role-key prop** is superseded by the interface's `motion?: OverlayMotionHandle` with fixed roles. The guide follows the interface.
4. **Nested close (scenario O9).** The combined nested timeline is **required runtime and test work, not a deferred capability** (Sol, 23:16). Until it is witnessed, the guide states only the interface's rule (a descendant's pending completions are cancelled when its owner retires). The combined parent+child timeline, and "a refused parent returns everything", will be documented once the build witnesses them.
5. **`doc-typecheck` limitation.** It cannot resolve the `application/motion` subpath (paths map to `dist/*`), so overlay fences are type-checked only through the compiled fixtures, not by `doc-typecheck`.

## Owned file hashes (after the 23:16/23:18 corrections; the three test/config files changed at 23:50, see below)

| File | SHA-256 prefix |
|---|---|
| `packages/core/docs/fluid-motion.md` | `b1562d3493013499` (§9 lifetime) |
| `docs/development/fluid-motion/guidance-example-check/fluid-motion.template.md` | `ce0e5e727f4c24ce` (§9 lifetime) |
| `docs/development/fluid-motion/guidance-example-check/src/model.ts` | `ac9366f40d0e625b` |
| `docs/development/fluid-motion/guidance-example-check/src/motion.ts` | `26989a252a8e45ee` (final-semantics follow-up) |
| `docs/development/fluid-motion/guidance-example-check/src/DetailView.svelte` | `159c09b978aefd9f` |
| `docs/development/fluid-motion/guidance-example-check/tests/plans.test.ts` | `bdcaf1401e7af06f` |
| `docs/development/fluid-motion/guidance-example-check/tests/app.browser.test.ts` | `39d019815bb9a5bf` (correction 1) |
| `docs/development/fluid-motion/guidance-example-check/tests/modal-probe.ts` (new, test-only) | `68b8ed367e1a401d` |
| `docs/development/fluid-motion/guidance-example-check/tests/ModalProbe.svelte` (new, test-only) | `6c679ce1799e203b` |
| `docs/development/fluid-motion/guidance-example-check/vitest.browser.config.mjs` | `0d9d12546e29aae7` |
| `packages/core/docs/application-motion.md` | `1208d5d544568f85` |
| `packages/core/docs/application-contract.md` | `c35e2480d2aec85e` |
| `packages/core/README.md` | `fff09df91651136d` |
| `.claude/skills/composable-svelte-navigation/SKILL.md` | `a1e6de08e65a88e9` (§9 lifetime) |
| `packages/core/tests/test-components/SkillExamples-navigation.svelte` | `030d60d0fa651446` |
| `packages/core/tests/repo/skill-examples.test.ts` | `c6801e968d1731c2` |


## Correction (23:16 local, after Sol's review of this report)

**Stale claims removed from the guide** (template and generated guide; render check passes):
- the **manual-popover fallback**, which is not implemented; the final design §10 uses ordinary in-surface decoration only;
- "**live media or iframes do not move between layers** (`layerRehomeUnavailable`)". Per Main's C3, portable video and GPU (provider) representations may re-home, and only a representation that cannot reach its intended layer settles faithfully.

**Command/ImageLightbox** wording is now: the same handle, defaults on accepted transitions of their bindable `open`, explicit entry, and existing events unchanged.

**The core source-wide `svelte-check` is not re-run** while core edits are ongoing. The pinned-fixture compile is deferred to the coherent build.

## Correction (23:18 local): destination easing (S1 review, `s1-astra-review.md` "Destination easing")

The guide and SKILL no longer promise that the final measured segment keeps the track easing.

- **Guide §4 `path`** (template and generated guide):
  - a waypoint's `easing` governs the authored segment that ends at it;
  - once the destination is measured, the last segment to it is a continuation curve from the displayed value and velocity (like a retarget). This replaces the track easing, and the easing of any waypoint placed at the track's end, for that segment;
  - intermediate waypoints keep their authored easing.
- **The example comment** in `src/motion.ts` (rendered into the guide) and **SKILL fluid rule 3** are qualified the same way.
- **Checks:**
  - `render.mjs --check` passes;
  - `skill-examples` passes 10/10;
  - no guidance-example-check test asserts final-segment easing.

## Built-package evidence against the provisional coherent core build (23:49–23:53 local)

The build is `core-build-identity.md`, built at 21:48:14Z: `dist` tree `1bea932c…7280`, `src` tree `e90c2fda…3c35f`. It is **provisional**. The results below will be re-run on the final core freeze.

**Commands.** All ran from `docs/development/fluid-motion/guidance-example-check` with core's `node_modules/.bin`. The fixture resolves `@composable-svelte/core` through its package exports, i.e. the built `dist`.

| Gate | Result |
|---|---|
| `svelte-check --workspace . --tsconfig ./tsconfig.json --fail-on-warnings` | **First run: 1 error, in my own test.** `plans.test.ts:20` read `released.diagnostics.some(…)`, but `diagnostics` is optional. Fixed to `(released.diagnostics ?? []).some(…)`. **Rerun: 0 errors, 0 warnings.** |
| `vitest run --config vitest.config.mjs` (node) | 3 files, **15/15** |
| `vitest run --config vitest.browser.config.mjs` (Chromium, `node_modules/.vite` removed first) | **Run 1 (23:49:42): 6/10.** The 6 existing tests passed; the 4 new overlay tests failed with `Cannot read properties of null (reading 'click')`. **Cause, in my test:** the Modal portals its content out of the mount target, so `target.querySelector('[data-close-notes]')` found nothing. Fixed by querying the dialog's controls (`[data-close-notes]`, `[data-close-quickly]`, the pin checkbox) on `document`. **Run 2 (23:50:04): 10/10**, but Vite reoptimized `esm-env, motion, tabbable, tailwind-merge` mid-run and reloaded the test page. **This run is not counted as clean.** Fixed by pre-bundling core's dependencies in `vitest.browser.config.mjs` `optimizeDeps.include`, the same list as `shadow-coverage-check`; core stays excluded. **Run 3 (23:50:32), the clean run: 10/10, no reload.** |
| Negative control, scratch copy (mutation A) | Removed `motion={notes}` from the Modal and made `closeQuickly` dispatch directly. Result: **"default plans" fails** (`timed out: shared heading on the plane`). The other three pass: without any motion they are trivially satisfied, so mutation A cannot discriminate them. |
| Negative control, scratch copy (mutation B) | Kept `motion` and made only `closeQuickly` dispatch directly. Result: **"the explicit entry replaces the default close" fails** (`expected true to be false`: the default close's heading flew). |
| Scratch copy cleanup | The copy was run inside the worktree at `docs/development/fluid-motion/.scratch-overlay-neg`, because Vite cannot serve the fixture's core symlink from `/private/tmp`. **It was deleted after each run.** No shared source or fixture was mutated. |
| `render.mjs --check` | matches |
| Core `skill-examples` + `doc-typecheck` + `doc-examples` (node) | **41/41** (10 + 10 + 21) |

**Pinned fixture compile** (`packages/core/tests/test-components/SkillExamples-navigation.svelte`, compiled against source): **not run by me.** I did not run core's source-wide `svelte-check`, as instructed. Core's own gate at this build covers `tests/**` via `tsconfig.test.json`. It reports only 2 errors and 1 warning, in `video-fallback-review.browser.test.ts` and `video-fixtures/VideoCard.svelte`. Neither is my fixture.

**What the 4 overlay witnesses demonstrate** (Chromium, built package):
- **Default plans:** the page heading flies into the dialog and back, and completion arrives through `onPresentationComplete`/`onDismissalComplete` with no timer.
- **Refused close:** a close refused while pinned starts no motion for 20 frames, and the dialog stays `presented`.
- **Explicit entry:** it replaces the default close for that transition.
- **Reversal:** closing while the dialog is opening reaches `idle` without ever passing `presented`.

**Mutation coverage:** A and B show that the default-plan and explicit-entry witnesses discriminate. The refusal and reversal witnesses assert reducer/presentation semantics and are not motion-discriminated by A.

**No core blocker found for the guide fixture.**

**Open items for core (the guide stays cautious; no compensation in docs):**
1. **Per-participant native fallback diagnostic.** I found no per-participant `unsupported` reason for "correct layer unreachable" in this build. The overlay `unsupported` reasons present are `overlayFailed:<error>` and `localFailed:<error>` with `participant: '*'` (`route-host.ts:359`, `:420`, `:451`). The guide names no reason string yet and says only that the participant settles and is reported as `unsupported`. **Please confirm the final per-participant reason** so I can name it, or so I can drop the "reported as" clause if none is emitted.
2. **Combined nested timeline (required work).** Core's overlay witnesses show nested *stacking*: `overlay-layers.browser.test.ts:69`, "a Modal nested in another Modal's children snippet paints above it". I found no witness yet for the combined parent+child close timeline. The guide keeps only the stacking and cancellation statements until it is witnessed.

## Correction 1 (23:57–23:59 local): completion-delivery witness (`guidance-correction1.md`, P2)

**Defect (reviewer, reproduced by the mutation below).** The reversal witness sampled only presentation status. The reducer ignores a late `notesPresented` once the status has left `presenting`, so a stale `onPresentationComplete` delivered after the close still passed. The status can't prove that a cancelled completion was never delivered.

### What changed (tests only)

- **Source untouched:** no change to `DetailView.svelte`, `model.ts`, any rendered guide source or the runtime. The guide text is unchanged.
- **`tests/modal-probe.ts` and `tests/ModalProbe.svelte`** (new, test-only):
  - `app.browser.test.ts` uses `vi.mock('@composable-svelte/core/navigation-components')` to replace the public `Modal` with a probe;
  - the probe renders the **real** Modal with every prop forwarded (`presentation`, `motion`, children, …);
  - it wraps only `onPresentationComplete` and `onDismissalComplete`, recording each delivery before calling the app's own callback. The public app path (the Modal's callback → `store.dispatch`) is preserved.
- **Assertions on the exact delivery log**, after the plane clears plus 30 quiet frames so a late delivery can arrive:

  | Witness | Expected log |
  |---|---|
  | Default plans | `['presentationComplete', 'dismissalComplete']` |
  | Refused (pinned) close | `['presentationComplete']` |
  | Explicit entry | `['presentationComplete', 'dismissalComplete']` |
  | Reversal | `['dismissalComplete']` |

  The default-plans expectation also proves the mock is active: an unmocked Modal would leave the log empty.

### Evidence (provisional core build, `dist` `1bea932c…`)

| Gate | Result |
|---|---|
| `svelte-check --workspace . --tsconfig ./tsconfig.json --fail-on-warnings` | 0 errors, 0 warnings |
| Browser (Chromium, `.vite` cleared, 23:58:28) | **10/10**, no reload |
| Node | 15/15 |
| **Stale-callback mutation** (scratch copy `docs/development/fluid-motion/.scratch-overlay-stale`, deleted after the run) | The scratch `ModalProbe` invokes the same wrapped `onPresentationComplete` it hands to the real Modal, once, when the presentation reaches `dismissing` before the open completed. **Result: the reversal witness fails** at `app.browser.test.ts:246` with `expected [ 'presentationComplete', …(1) ] to deeply equal [ 'dismissalComplete' ]`. The status assertion just before it (`seen.has('presented') === false`) still passed under the mutation, reproducing the reviewer's blind spot. The other three overlay witnesses pass. |

**Housekeeping:**
- Removed the 4 stale git-ignored failure screenshots (`tests/__screenshots__`) from my own 23:49 run 1.
- No shared source or fixture was mutated. The original 14-file snapshot is untouched.

**Still pending actual evidence** (unchanged): the final per-participant native fallback diagnostic, and the combined nested timeline text.

## Final-semantics follow-up (00:27–00:31 local, 22:27–22:31Z)

**Sources:**
- `conditional-declaration-main-disposition.md` and `default-phase-main-disposition.md`;
- `implementation-interface.md` §8 (22:29Z);
- `overlay-implementation-report.md` (build 3);
- Sol's clarifications: the bindable write with no store commit is **being fixed, not waived**; page-reaction retention is governed by `reaction-retention-main-disposition.md` and its public API is not yet available.

### Changed files

- `docs/development/fluid-motion/guidance-example-check/fluid-motion.template.md`, rendered into `packages/core/docs/fluid-motion.md` (§12);
- `.claude/skills/composable-svelte-navigation/SKILL.md` (overlay rules 6 and 7);
- `docs/development/fluid-motion/guidance-example-check/src/motion.ts`, the example plans rendered into the guide.

**Unchanged:** core `README.md` (it only says overlay orchestration is in development), the approved G1 probe (`tests/modal-probe.ts`, `tests/ModalProbe.svelte`) and all test files.

### What the guide now teaches (§12)

**Binding plans.** `init` runs **once**, synchronously, when the handle is created.

**New subsection "Source capture and where to declare the handle":**
- **Pre-render capture.** Outgoing sources are captured after reduction and before the destructive render. This covers explicit plans, and default plans of every change **committed through a store** (plain `dispatch` or a managed presentation, including Escape, outside clicks and `view.dismiss()`). A page source removed by the same accepted action still departs from where it was. There is no app capture hook, delay, `tick()` or effect timing, and nothing is acquired, hidden or superseded before acceptance.
- **Surviving owner.** Declare the handle in an owner that survives the change, with plans declared once.
- **Conditionally mounted overlay components** also pass the read-only `presentation: () => store.state?.notes` from `init`. This is not needed when the overlay is always rendered with a `presentation` prop, as in the notes dialog.
- **Temporal precondition.** The declaration must exist before the removing action. A handle created after its source is gone gives a skipped track diagnosed as `missingSource`, and the destination simply appears. A handle created later, while its source still exists, works normally.

**Acceptance.** A preparation no committed transition claims, such as a refused `transition()`, is discarded and settles with reason **`unclaimed`**, not `superseded`.

**Combined nested motion.** A parent's **explicit** `transition()` names a live child's roles via `child.select(...)`. The child joins, there is no second writer, and each completion is delivered once when the combined run settles. This was witnessed by core (U2, build 3).

**Native fallback.** An unreachable layer (another document, or no slot) settles **only that participant**:
- its copy is removed and the real endpoints show;
- it is reported as `unsupported` with reason `layerUnreachable:<reason>`;
- other tracks keep running.

This was implemented and witnessed in build 3.

### Deliberately NOT taught (not accepted or not final)

- **The bindable write with no store commit** (a parent assigning a bindable directly). This is being fixed and is not waived. The guide neither claims pre-render capture for it nor documents an exception. The capture sentence is scoped to store commits, so it stays accurate before and after the fix.
- **Persistent page reaction and its retention** (`reaction-retention-main-disposition.md`), and the rejected 0.3 floor. None of this is in the guide. **The example no longer implies it:** `notesOpen` dimmed `detail-body` to 0.4, and `notesClose` restored it from 0.4, which silently assumed the dim is held while presented. Both page tracks were removed. Outgoing `scale` is now demonstrated on the dialog's own leaving content (`notesClose` content: opacity, `slide: { dy: 24 }`, `scale: { from: 1, to: 0.96 }`).
- **Default plans joining a child's run.** Combined nested motion is taught only through the parent's explicit entry.
- **Browser Back as a cause.** The existing list still names it, but core reports no Browser Back witness (implementation report §4.1). *Flag for core/Sol:* keep or qualify it on the final build.

### Example audit (the disposition asks for this where source removal is possible)

**The notes dialog in §3:** `openNotes` removes no page participant, and the `Modal` is always rendered with its `presentation` prop. It therefore needs neither `presentation` nor a surviving-owner change.

**The SKILL fence:** the `card` source stays mounted, and the Modal is always rendered. Neither example depends on the new option.

### Checks at 00:30–00:31 (docs now; built fixture against a STALE dist, so not final)

| Check | Result |
|---|---|
| `render.mjs --check` | matches |
| Core `skill-examples` + `doc-typecheck` + `doc-examples` | **41/41** |
| Fixture `svelte-check --fail-on-warnings` | 0 errors, 0 warnings |
| Node tests | 15/15 |
| Browser (Chromium) | 10/10, **on the dist built 00:08:29**, which lacks `OverlayMotionOptions.presentation` and the pre-render default checkpoint. **Not final validation.** It only shows that the changed example plans still run on the previous build. |

### Awaiting core freeze (exact facts to confirm on the final build)

1. **`OverlayMotionOptions.presentation`:** its exact public type and JSDoc, and that it is returned from `init`.
2. **Pre-render default capture:** confirm it for store commits, and for the bindable path once fixed. If the bindable path is fixed, the capture sentence can drop its store-commit scope.
3. **`missingSource`:** the exact channel. It is currently a `prepared.skipped` entry `<key>:missingSource`; the guide says only "skipped and diagnosed as `missingSource`".
4. **`unclaimed`:** confirm it as the `settled` reason for discarded preparations.
5. **`layerUnreachable:<reason>`:** confirm it on the final dist.
6. **The page-reaction lifetime API:** document it only once the concrete API exists.
7. **Re-run** fixture `svelte-check`, node and Chromium browser tests (G1 probe included) on the final dist.

## §9 overlay-lifetime page reaction (00:34–00:36 local), authored against the announced shape, NOT yet implemented

**Source:** `implementation-interface.md` §9, with Main's 22:30Z approval of (a). Core has not implemented it; the final build is later.

### Authored now (docs only)

**Guide §12, new subsection "Page reaction while an overlay is open".** It states only what §9 states:
- `lifetime: 'overlay'` on a track in an overlay's `open` plan (default or explicit); the default is `'transition'`;
- the end values become the page's resting state for that exact overlay instance (epoch), only for the declared participant and channels;
- the open completion is delivered once and does not wait for the hold;
- the hold is released or retargeted on the instance's next accepted transition, starting from the displayed values; a refused close keeps it;
- the hold also ends on participant or owner disposal or Host destruction;
- nested overlays each unwind only their own reaction;
- under reduced motion, the resting state is reached immediately.

The subsection includes a `ts` fence copied from the §9 declaration (participant `detail-body`). That fence is not compiled by `doc-typecheck`.

**Guide lead note:** `lifetime: 'overlay'` page reactions are added to the list of changes that are not yet in a published release.

**Navigation SKILL, overlay rule 8:** the same declaration and lifetime rules, and no store or timer glue.

### Staged, not applied (the fixture compiles against `dist`, which lacks `lifetime`)

The executable example change is a patch in the session scratchpad: `motion-lifetime.patch`, sha256 prefix `c3b3c6348d470315`.
- `notesOpen` gains a `detail-body` outgoing track: opacity 1 → 0.6, scale 1 → 0.98, `lifetime: 'overlay'`.
- `notesClose` gains a `detail-body` incoming track: 0.6 → 1, 0.98 → 1, starting from the displayed values.

Applying it now would fail the fixture's `svelte-check`, so `src/motion.ts` is unchanged. **Planned for the final build:**
1. Apply the patch.
2. Add one fixture witness through the public app path: the page holds 0.6 past the open duration; a refused (pinned) close keeps it; the accepted close returns it to 1; completion is delivered once, per the G1 probe.
3. Re-run the fixture's `svelte-check`, node and browser tests.

Core owns the §9 required witnesses.

### Not claimed

- **Bindable pre-render capture:** core has written and witnessed it, but its cleanup is being fixed. The guide's capture sentence stays scoped to store commits until built checks pass.
- **No final validation:** everything in §9 awaits the build.

### Checks (docs only)

| Check | Result |
|---|---|
| `render.mjs --check` | matches |
| Core `skill-examples` + `doc-typecheck` + `doc-examples` | **41/41** |

### Snapshots

No frozen snapshot directory was touched. Edits in this pass were limited to the template, the generated guide, the SKILL and this report.

### Changed files across the overlay guidance task (final list; all uncommitted)

**Guide and generated doc:**
- `docs/development/fluid-motion/guidance-example-check/fluid-motion.template.md`
- `packages/core/docs/fluid-motion.md`

**Example fixture sources:**
- `docs/development/fluid-motion/guidance-example-check/src/model.ts`
- `docs/development/fluid-motion/guidance-example-check/src/motion.ts`
- `docs/development/fluid-motion/guidance-example-check/src/DetailView.svelte`

**Fixture tests, probe and config:**
- `docs/development/fluid-motion/guidance-example-check/tests/plans.test.ts`
- `docs/development/fluid-motion/guidance-example-check/tests/app.browser.test.ts`
- `docs/development/fluid-motion/guidance-example-check/tests/modal-probe.ts` (new)
- `docs/development/fluid-motion/guidance-example-check/tests/ModalProbe.svelte` (new)
- `docs/development/fluid-motion/guidance-example-check/vitest.browser.config.mjs`

**Cross-links:**
- `packages/core/docs/application-motion.md`
- `packages/core/docs/application-contract.md`
- `packages/core/README.md`

**Skill and its pinned fixture:**
- `.claude/skills/composable-svelte-navigation/SKILL.md`
- `packages/core/tests/test-components/SkillExamples-navigation.svelte`
- `packages/core/tests/repo/skill-examples.test.ts`

**Report:**
- `docs/development/fluid-overlays/guidance-report.md`

## Build 5 (22:43Z): runnable page reaction and focused checks (00:44–00:46 local, 22:44–22:46Z)

**Build:** `core-build-identity.md` build 5.
- `dist` tree: `7b206161952b48d9…`
- `src` tree: `83bfd00955d4c344…`
- `dist/…/plan.d.ts` has `lifetime?: 'transition' | 'overlay'`.
- `dist/…/overlay-motion.d.ts` has `presentation?`.

The build is **provisional**. A final-candidate rerun will follow, limited to freshness and affected tests.

### Applied

1. **Example patch:** the staged `motion-lifetime.patch` was applied to `src/motion.ts`, and the example is rendered into the guide.
   - `notesOpen`: `detail-body` outgoing, opacity 1 → 0.6, scale 1 → 0.98, `lifetime: 'overlay'`.
   - `notesClose`: `detail-body` incoming, back to 1.
2. **Guide §12 "Page reaction while an overlay is open":** now points to this runnable example.
3. **New browser witness, through the public app path.** The G1 callback probe is retained and asserted:
   - after the open settles, `onPresentationComplete` has been delivered exactly once;
   - 30 frames later the page is **held** at computed `{ opacity: 0.6, scale: '0.98' }`;
   - a **refused** (pinned) close keeps the resting state, and the dialog stays `presented`;
   - the accepted close starts from ≥ 0.59, passes through intermediate values and ends at opacity 1, scale `none`/`1`, with no inline `opacity`/`scale` left;
   - the delivery log is `['presentationComplete', 'dismissalComplete']`.

### Results on build 5

| Gate | Result |
|---|---|
| Fixture `svelte-check --workspace . --tsconfig ./tsconfig.json --fail-on-warnings` | 0 errors, 0 warnings |
| Node (`vitest.config.mjs`) | 15/15 |
| Browser (Chromium, `.vite` cleared, 00:45:16) | **11/11**, no reload (the 10 earlier tests plus the lifetime witness) |
| **Negative control** (scratch copy `docs/development/fluid-motion/.scratch-overlay-lifetime`, deleted after the run) | `lifetime: 'overlay'` removed: **the lifetime witness fails** at `app.browser.test.ts:260` with `expected { opacity: 1, scale: 'none' } to deeply equal { opacity: 0.6, scale: '0.98' }` |
| `render.mjs --check` | matches |
| Core `skill-examples` + `doc-typecheck` + `doc-examples` | 41/41 |

The pinned skill fixture was not compiled by me (no source-wide `svelte-check`). Core's build-5 `svelte-check` reports only the non-owned `video-fallback-review`/`VideoCard` issues.

**Stale artifacts:** failure screenshots from the scratch runs never reached the fixture; `tests/__screenshots__` is absent.

### Still not documented as final (core closing)

- **Reduced-motion slide and scoped selectors, and transform continuity on removal and reopen.** The guide states no exceptions for them.
- **Bindable pre-render capture:** build 5 adds a Host `$effect.pre`. The guide's capture sentence stays scoped to store commits until the final candidate's checks.
- **Browser Back** as a cause is still listed without a core witness (flagged above).

### Final changed files and hashes (for the narrow Astra follow-up; all uncommitted, sha256 prefix)

| File | Hash |
|---|---|
| `docs/development/fluid-motion/guidance-example-check/fluid-motion.template.md` | `ab88b1837be4a215` |
| `packages/core/docs/fluid-motion.md` (generated) | `9427602dc161f28c` |
| `docs/development/fluid-motion/guidance-example-check/src/model.ts` | `ac9366f40d0e625b` |
| `docs/development/fluid-motion/guidance-example-check/src/motion.ts` | `0ceed3a683188cc8` |
| `docs/development/fluid-motion/guidance-example-check/src/DetailView.svelte` | `159c09b978aefd9f` |
| `docs/development/fluid-motion/guidance-example-check/tests/plans.test.ts` | `bdcaf1401e7af06f` |
| `docs/development/fluid-motion/guidance-example-check/tests/app.browser.test.ts` | `05f3ba34d3b8cf9c` |
| `docs/development/fluid-motion/guidance-example-check/tests/modal-probe.ts` (G1 probe) | `68b8ed367e1a401d` |
| `docs/development/fluid-motion/guidance-example-check/tests/ModalProbe.svelte` (G1 probe) | `6c679ce1799e203b` |
| `docs/development/fluid-motion/guidance-example-check/vitest.browser.config.mjs` | `0d9d12546e29aae7` |
| `packages/core/docs/application-motion.md` | `1208d5d544568f85` |
| `packages/core/docs/application-contract.md` | `c35e2480d2aec85e` |
| `packages/core/README.md` | `fff09df91651136d` |
| `.claude/skills/composable-svelte-navigation/SKILL.md` | `a1e6de08e65a88e9` |
| `packages/core/tests/test-components/SkillExamples-navigation.svelte` | `030d60d0fa651446` |
| `packages/core/tests/repo/skill-examples.test.ts` | `c6801e968d1731c2` |

This table supersedes the earlier hash tables in this report. Earlier snapshot directories were not touched.

## Prose correction (Astra, capture phase)

**Defect:** the "Source capture" bullet said sources are captured after the accepted change is reduced, and applied that to explicit plans too. But `transition(plan, commit)` captures **before** it runs `commit`.

**Fix:** split into two sub-bullets:
- **explicit:** captured before `commit`;
- **default (store commits):** captured after reduction and before the destructive render.

**Scope:** prose only. The template was edited and the guide regenerated. `render.mjs --check` matches. No test was re-run (none is needed for prose).

**Unchanged:**
- the G1 probe (`tests/modal-probe.ts` `68b8ed367e1a401d`, `tests/ModalProbe.svelte` `6c679ce1799e203b`), all fixtures and tests, and build 5;
- SKILL rule 6 ("captured … before the accepted change renders"). It is accurate for both paths and makes no claim about the reduction phase.

**Corrected hashes** (they supersede the two matching rows of the build-5 table):

| File | Hash |
|---|---|
| `docs/development/fluid-motion/guidance-example-check/fluid-motion.template.md` | `eaadbfbf3444811e` |
| `packages/core/docs/fluid-motion.md` | `2cd5c25dee74e410` |

## Build 6 (22:49:59Z): limited fixture freshness, types and affected overlay checks (00:50–00:51 local)

**Identity:**
- `core-build-identity.md` build 6: `dist` tree `d522f2e5fc40d37dea58afae9fea984809e6e2573089c822e485eff290ed68ff`, `src` tree `737c38fc…d8d8`.
- **Local `dist` recomputed with the same method** (`shasum -a 256` per file, `LC_ALL=C` sorted, then hashed): `d522f2e5fc40d37dea58afae9fea984809e6e2573089c822e485eff290ed68ff`. **This matches the published build 6.**
- The fixture resolves `@composable-svelte/core` through its package exports, so this exact `dist`. Vite's prebundle cache (`node_modules/.vite`) was cleared first; core stays excluded from prebundling.

**Results:**

| Gate | Result |
|---|---|
| Fixture `svelte-check --workspace . --tsconfig ./tsconfig.json --fail-on-warnings` | 0 errors, 0 warnings |
| Node (`vitest.config.mjs`) | 15/15 |
| Browser, Chromium, `-t "overlay orchestration"` (00:51:02) | **5/5**, no reload. These are the four overlay witnesses with the G1 delivery log, plus the `lifetime: 'overlay'` hold/refusal/close witness. The 6 route and representation tests were **not re-run** (skipped by the filter); their last run is build 5, 11/11. |
| `render.mjs --check` | matches |

**Unchanged since build 5 and the approved prose correction** (sha256 prefix):

| File | Hash |
|---|---|
| `src/motion.ts` | `0ceed3a683188cc8` |
| `tests/app.browser.test.ts` | `05f3ba34d3b8cf9c` |
| `tests/modal-probe.ts` (G1) | `68b8ed367e1a401d` |
| `tests/ModalProbe.svelte` (G1) | `6c679ce1799e203b` |
| `fluid-motion.template.md` | `eaadbfbf3444811e` |
| `packages/core/docs/fluid-motion.md` | `2cd5c25dee74e410` |

**No file was edited in this step**; earlier documentation evidence is retained.

**Source-capture prose:** it stays scoped to explicit plans and store commits. The bindable path will be added only after core's Astra confirms C2.

## Build 8 final integration verification (lead, 2026-09-28 18:32 UTC)

After user resumed “carry on”, verified exact current dist tree `9190602581b154907533347dd01ab3dbd391982086f69b3cc555bbc290660db2` and all current guidance files against the independently approved semantic snapshot plus the two-file phase-prose correction (manifest `217b4704af3d2b88f2595d090c90d4cd223a1c7a3df4274e1f4548a2938bab71`). No code or prose changed.

- Fixture `svelte-check --tsconfig ./tsconfig.json --fail-on-warnings`: 0 errors, 0 warnings.
- Fixture `vitest run --config vitest.browser.config.mjs -t 'overlay orchestration'`: 5/5 Chromium, six unrelated cases excluded by selection. Includes real G1 completion probes and lifetime hold/refusal/restore.
- Initial sandbox test attempt could not bind localhost (`EPERM`); no tests executed. Same check through normal approved execution passed. No product failure or permission question.
- Frozen numeric source hashes unchanged and `git diff --check` clean.

Build 9 follow-up (lead, 2026-09-28 18:40 UTC): the same five affected overlay browser tests pass 5/5 on coherent build 9 after its whole-run transform correction. Guide source/prose remains unchanged from the independently approved snapshots. No unrelated cases rerun.

## Final immutable build 10 fixture rerun (lead, 2026-09-28 18:54 UTC)

At Main's final acceptance request, reran the narrow fixture against final build10 `dist` tree `b0c3a789019d1e268df17ea763059f42246dc97f6bb9ec1dff7603fd50a380e0`, with unchanged approved guide/fixture files. Command: repository `packages/core/node_modules/.bin/vitest run --config vitest.browser.config.mjs -t 'overlay orchestration'`, cwd this guidance fixture. Package exports resolve built core; no source alias. Result **5/5 Chromium**, six unrelated cases excluded, 9.60 seconds total, started20:53:58 Europe/Paris. Witnesses: default heading flight/completion, refused close, explicit replacement, close-during-open reversal/no cancelled completion, lifetime full resting pose/refused close. Initial `npx vitest` attempt could not find the executable and ran no tests; using installed core binary passed. Final runtime remained immutable. This fulfills the final-build fixture condition in the independent guidance review.
