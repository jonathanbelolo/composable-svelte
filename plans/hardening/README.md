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
| **Open — dead behaviour** | **0**. T1–T13 all closed; T12 is measured and registered rather than swept — see below |
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

T1–T13 are done. What follows is what each turned out to be, kept because code
and later sessions cite these by name.

### T7. `ed855dd` reviewed — CLOSED

Flagged as unreviewed on the prior that every round in this campaign found
defects in the previous round's repairs. It held three, all in arms that commit
changed, and two of them were *the same defect it claimed to have fixed*, left in
place on other paths:

- The "announce presence on connect" arm it added could never fire: it read
  presence out of `state.users`, which inbound frames alone populate, so you are
  not in your own user map until the server echoes you. The same assumption made
  `updatePresence` a no-op for that whole window — the loss the arm existed to
  prevent. Its test passed by dispatching a synthetic `userJoined` before
  connecting, an ordering the library cannot produce.
- `stopGeneration` did nothing while an attachment was uploading, leaving the
  bar frozen at `uploading`.
- Upload progress was discarded on the edit and regenerate paths.

All unpublished when found — chat 0.3.0's changelog predates the commit by a day
and npm was on 0.2.3 — so all free to fix. It also changed six public action arms
with no changelog entry; they are recorded now.

### T10. Documented Svelte examples — CLOSED

**53 → 0 across every document**, and the `SWEPT_DOCS` throttle is gone: the
compile arm is unconditional.

Nineteen of the 53 went guard-side without touching a document. The guard was
reporting excerpts for eliding a store declaration the prose supplies, a
counter-example for failing on purpose, and a CHANGELOG for being a CHANGELOG —
the two sibling guards already excluded those.

The rest were ellipsis written inside code (`createStore({...})` is a syntax
error however clearly it reads), Good/Bad pairs sharing one fence, and three
blocks that were not Svelte at all: two React examples, and a catalogue of tag
names.

**A hole in the earlier fence sweep surfaced here.** Eight mixed listings were
hiding *inside* ```svelte fences, holding 501 lines of TypeScript no guard read —
`ALLOWED_MISLABELLED` only inspects fences labelled something other than svelte,
so it structurally could not see them. A mirror arm now does.

**What the compile arm still does not catch:** a missing required prop. `<Camera
position={…} />` with no `{store}` is valid Svelte, and only `svelte-check`
against a real generated component would object.

### T12. Optional properties in `.ts` — MEASURED, registered

**311**, produced by `optional-props.test.ts`'s own splitter. It had been
recorded as 472, then 436, then 427, by three greps — and a grep cannot tell
`() => void | undefined` (a function *returning* it) from `(() => void) |
undefined` (a property accepting it).

The props-shaped slice is closed: every finding that sat in a `*Props` type was
`FileUploadProps`, fixed with T11.

Reported rather than swept. Most of the rest are state and config shapes, so T8's
wrapper defect does not apply, and a careless `| undefined` sweep across 383
declarations would be worse than the hazard. `ALLOWED_BARE_OPTIONALS` stops the
number growing while that is decided.

**Scope, because a count without one is how this item collected three:**
discriminated unions written as `export type Action =` followed by `| { … }` open
with a pipe rather than a brace and are not scanned. In a library of reducers
that is a large family; covering them would raise 311, not lower it.

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

- ~~**`code`'s README** names factories that do not exist~~ — **stale, and
  dangerously so.** `2bfd769` renamed the exports to match the documentation
  rather than the other way round, so `createInitialCodeHighlightState` and
  `createInitialCodeEditorState` are the real names now. Acting on this entry
  would have broken working docs.
- ~~**JSDoc pointing at the wrong package**~~ — closed, and it was wider than
  recorded. `video-embed` had already been fixed, `audio-player` and
  `voice-input` had not, and **`chat`'s `streaming-chat` barrel had the same
  defect and was never listed** — it told consumers to import
  `FullStreamingChat` and `streamingChatReducer` from `@composable-svelte/code`.
  Now guarded by an arm in `side-effects.test.ts`: a package may not source its
  own exports from a sibling. This one ships, unlike a markdown error — the
  comment is copied verbatim into `dist/*.js` and `dist/*.d.ts`.
- `charts` skill tells users to `npm install @observablehq/plot`, which is already
  a hard dependency.
- `maps` exports the component as `MapPopup`; `API.md` uses bare `Popup`, which is
  a type only.

The API-name errors this section used to list — `createTestStore`'s import path,
`createLiveAPI`, `matchPattern`, `createParserConfig`, `createMockStorage` — are
closed and now guarded: `doc-typecheck.test.ts` typechecks documented examples
against the built `.d.ts`, and its register is empty.

**Know what that covers before trusting it.** It reads only blocks that *name*
`@composable-svelte`, because a block without an import cannot be resolved
against anything. Measured: **277 of 1,435** ```typescript fences and **97 of
325** ```svelte fences. So a majority of documented TypeScript — excerpts that
use a library API without an import line — is read by nothing, and an excerpt is
exactly the shape that elides imports.

Two things found after that limit was written show it is not theoretical. Svelte
*markup* is outside the checker entirely, which is how `<FullAudioPlayer
{playerStore} />` passed a prop the component does not have. And a rune is
invisible to both guards — `$props<Props>()` appeared in eight examples and in
none of `src`, because `svelte-check` rejects it in a real component and only
documentation could keep it.

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
