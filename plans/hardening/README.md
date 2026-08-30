# Hardening — defect register

**An index of what is still open.** It used to be 2,088 lines, and about
two-thirds of that was narrative: round-by-round write-ups, and a running list of
corrections to its own earlier claims. All of it duplicated commit messages,
nothing linked to it, and it is recoverable from git — so it went. What is left
is the part a reader needs: what is open, and where the things code points at
live.

Its own history is the argument for the reduction. In the last full round, 56%
of findings were in *text* — prose, this register, commit messages — against 12%
in original code, and this file recorded **eight** wrong counts before its
numbers stopped being kept by hand. Two of those hand-maintained lists are now
guards instead (see *Retired into guards* below).

**Verification protocol:** `guides/VERIFICATION-PROTOCOL.md`. It used to be
buried at line 1449 of this file.

## Status at a glance

| | count |
|---|---|
| Fixed and committed | 68 commits through R7, plus the dead-behaviour campaign since `2443ab4` (`git rev-list --count 2443ab4..HEAD`) |
| **Open — components that crash** | **0** (was 6 — all fixed, see R1) |
| **Open — breaks a consumer at install/build** | **0** — was recorded as 6, which was never right: S2.6 closed in R6, S2.7 and S2.8 were already closed, and the row's own parenthetical said the count was stale while leaving it stale |
| Open — silently-wrong behaviour | 6 (S4.3 closed by R4; **S4.4, S4.6, S4.7 closed in R7**) |
| Open — security | 0 (was 1; **the R2 fix was incomplete — see R3**) |
| Open — `svelte-check` errors | **0** (was 142, recounted to 69 in R6) |
| Open — `svelte-check` warnings | **0** (was 30) |
| Workspaces covered by `pnpm -r check` | **19 of 19** — the gate is complete |
| **Open — dead behaviour** | **2 items** (T7, T10). T1–T6, T8, T9 done; T11 and T13 closed since; T12 re-scoped — see below |
| Workspaces that typecheck their tests | **14 of 14 that have tests** (S11 T1) |
| Optional props a wrapper can forward | **619 of 632** — the 13 left are `$bindable`, registered (S11 T8) |
| Animation-policy backlog | **none** — emptied and deleted (S11 T2–T4) |
| `examples/` animation violations | **0** — gated and cleared; was 78 across 33, not the 24 recorded (S11 T5) |
| Committed build artifacts under the gate | `ssr-server/static` — was serving 6 deleted transitions |

## S11 — the dead-behaviour campaign

The rule this section is measured against: **nothing a consumer can pass,
configure, click, or import may produce no effect.** `core`, `media` and `chat`
have been through it; `chat` shipped 0.3.0 after four review rounds. Everything
below is measured, not estimated — the commands that produced each count are
named so the next person can re-run them rather than trust them.

T1–T6, T8 and T9 are done. T11 and T13 have closed since. **T7 and T10 remain**,
and T12 has been re-scoped by T11's fix.

### T7. `ed855dd` is unreviewed — OPEN

The last commit of the chat pass: 25 files, 687 insertions. Every review round in
this campaign found real defects in the previous round's repairs — including two
fixes that were outright wrong, and three repo guards that could not fail. The
prior is that this one is not the exception.

Still worth reviewing on the evidence: 97.9% of its added lines are verbatim at
HEAD, and its two chat reducers (`streaming-chat/reducer.ts`,
`streaming-chat/collaborative-reducer.ts`) have had **zero** commits since.

### T10. Documented Svelte examples that do not compile — OPEN

**53 non-compiling ```svelte blocks across 18 files**, measured by running
`doc-examples.test.ts`'s compile arm across every document rather than the two in
`SWEPT_DOCS`. Of those, 18 are `global_reference_invalid` — an excerpt whose
`<script>` shows only part of itself, so an auto-subscribed store is undeclared,
mostly benign — and **35 are real syntax errors**: 20 `js_parse_error`, 8
`expected_token`, 4 `script_duplicate`, 2 `block_unclosed`, 1
`state_invalid_placement`.

The compile arm is gated on `SWEPT_DOCS`, which holds two documents. It grows as
sweeps land; each block needs individual judgement about whether the excerpt or
the code is wrong, which is why it is a list rather than a switch.

This number went **up** from a recorded 41 in 16, and that is the fence sweep
working rather than a regression. Relabelling 60 mislabelled fences and splitting
22 mixed listings moved a large body of markup out of ```typescript fences and
into this arm's population for the first time. The failures are old; they were
not being looked at. None of the 53 is a block created by those splits.

**What this guard does not catch:** a missing required prop. `<Camera
position={…} />` with no `{store}` is valid Svelte. That is the *original* defect
— the one the fix was for — and only `svelte-check` against a real generated
component would see it. The guard closes the hole the fix opened, not the one the
fix was for.

The mislabelled-fence half of this item is **closed**: repo-wide mislabelled
fences are 0, held by `ALLOWED_MISLABELLED` in `doc-examples.test.ts`.

### T12. Optional properties in `.ts` files — RE-SCOPED

`exactOptionalPropertyTypes` is on repo-wide, so an optional property without
`| undefined` cannot receive one — the same hazard T8 fixed for props, one layer
down in state, action and config shapes.

**The props-shaped slice is closed.** Every one of its findings that sat in a
`*Props` type was `FileUploadProps`, and those ten gained `| undefined` when
`FileUpload` adopted its own exported type (T11).

What remains is unmeasured, deliberately. The figure has been recorded as 472,
436 and 427 by three different counts, all grep-shaped — and a grep cannot tell
`() => void | undefined` (a function *returning* it) from `(() => void) |
undefined` (a property accepting it). The only trustworthy counter is
`optional-props.test.ts`'s own splitter, which scans `.svelte` files. **Extending
it to `.ts` is the next step for this item**, and it should produce the number
rather than another grep.

### Accessibility warnings — OPEN

- **chat (13):** five ambiguous self-closing `<textarea />`; `<video />`
  self-closing and missing `<track kind="captions">`
  (`PendingAttachmentPreview.svelte:47`, `VideoPlayer.svelte:214`); `<div>` with
  mouse handlers and no role (`VideoPlayer.svelte:192`); click handler on `<img>`
  with no keyboard handler (`ImagePreview.svelte:133`); `role="dialog"` without
  `tabindex` (`AttachmentPreviewModal.svelte:65`); `autofocus`.
- **media (5):** progress-bar scrubbers and playlist rows are keyboard
  inaccessible (`MinimalAudioPlayer.svelte:246`, `FullAudioPlayer.svelte:351`,
  `PlaylistView.svelte:119`); self-closing `<iframe />`.
- **charts (1):** `tabindex="0"` with `role="img"` (`Chart.svelte:102`).

`charts` has since gained a keyboard cursor, a data-table fallback and an AA
review; the single warning above is what is left.

## S8. Documentation — OPEN

Several of these were closed by the documentation sweep; the rest stand.

- **`code`'s README** names `createInitialCodeHighlightState` and
  `createInitialCodeEditorState`; the real exports are `createInitialState` and
  `createEditorInitialState`.
- **`media` JSDoc points at the wrong package** — `audio-player/index.ts:15`,
  `video-embed/index.ts:10`, `voice-input/index.ts:15` all say
  `@composable-svelte/code`. These compile into the published `.js` and `.d.ts`.
- `charts` skill tells users to `npm install @observablehq/plot`, which is already
  a hard dependency.
- `maps` exports the component as `MapPopup`; `API.md` uses bare `Popup`, which is
  a type only.

The API-name errors this section used to list — `createTestStore`'s import path,
`createLiveAPI`, `matchPattern`, `createParserConfig`, `createMockStorage` — are
closed and now guarded: `doc-typecheck.test.ts` typechecks every documented
example against the built `.d.ts` and its register is empty.

## Product gaps, not defects

- **WebGPU is not implemented.** `BabylonAdapter` accepts an `engine: 'webgpu'`
  option and runs WebGL. Real WebGPU is `WebGPUEngine` with its own async
  initialisation — a feature nobody built. Recorded here because
  `adapters/babylon-adapter.ts:90` points at this file for it.
- **`maps` is mid-phase** — its README says Phase 12C in progress.

## Closed, kept because code points here

Short entries, retained as anchors for comments and tests that cite them by name.
The full write-ups are in the commits.

- **R1 — six components crashed on mount.** All fixed, mutation-verified. Cited
  by `packages/graphics/tests/camera-config.test.ts:16`.
- **S2 — breaks a consumer at install or build.** All eight closed. **S2.4** was
  `chat` statically importing its own optional peer; cited by
  `packages/maps/tests/optional-peer-isolation.test.ts:11` as the archetype of
  the category.
- **S4.10 — `AuthGuard.onAnonymous` re-fires on every dispatch.** Not a defect;
  the claim was corrected. Cited by
  `packages/auth/tests/auth-guard-anonymous.test.ts:4`.
- **T11 — `FileUploadProps` did not match its component.** Closed: the component
  now annotates the exported type, and an arm in `optional-props.test.ts`
  requires every exported `*Props` type to be used somewhere that would break if
  it drifted.
- **T13 — five packages published their whole build tree.** Closed: `charts`,
  `chat`, `code`, `maps` and `media` each name their entry points, verified
  against Node's resolver.

## Retired into guards

Two hand-maintained lists in this file kept drifting, and both are now executable:

- **The intentionally-unused public members** — `packages/core/tests/repo/
  intentionally-unused.test.ts`. Recorded here as eight, corrected to ten, and
  actually **eleven**. It now fails if one is deleted, and fails if one gains a
  caller so the entry can be removed rather than the member.
- **The documented-example backlogs** — `doc-typecheck.test.ts` (API claims,
  register empty) and `doc-examples.test.ts` (fence labels, `ALLOWED_MISLABELLED`
  at 0).
