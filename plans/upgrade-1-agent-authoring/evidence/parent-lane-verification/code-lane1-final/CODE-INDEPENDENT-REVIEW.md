# Independent review: `packages/code` managed migration

- **Reviewer:** Claude Opus 5.5. Independent and read-only.
- **Date:** 2026-09-25.
- **Worktree:** 2359, HEAD `ffd3ca51`, with the uncommitted lane diff.
- **Time box:** about 15 minutes.
- **Scope:**
  - `CODE-MIGRATION.md`, `B1-CONTRACT-REVIEW.md` and the command-delivery decision;
  - `internal/view-source.ts`;
  - `CodeEditor.svelte`, `codemirror-wrapper.ts`, and the editor reducer and types;
  - `CodeHighlight` (component and reducer);
  - `NodeCanvas` and `FlowCommands`;
  - the emitted `dist` and `package.json`;
  - the managed, ordering, format-freshness and SSR tests (read, not rerun).
- **Method:**
  - I read the source and the emitted declarations.
  - I checked CodeMirror 6.38.6's `update()` to see whether it can be re-entered, and core's standalone `dispatchCore` for notification order.
  - I ran two probes in a temporary file, one test file each. Both probe files were deleted afterwards. `git status --short packages/code/tests` shows the same entries as before.
  - I did not rerun the broad suite. The worker recorded browser 212/212 and SSR 5/5.
  - I edited no source, test or config file.

## Verdict

**No blocker for landing the migration in-tree.**

The managed paths work, and so do the state-before-command ordering, the echo FIFO in the cases the worker listed, format freshness, CodeHighlight dedupe and freshness, `setViewport` through a managed view, and SSR.

**One confirmed regression (F1) should be fixed before publishing.** A parent reducer that rejects an edit now leaves the document and state out of sync permanently, where the shipped behaviour re-synced on the next accepted edit. It affects standalone and managed users alike.

**The peer floor (A2) still gates release.** It is already recorded as the parent's job.

## Findings

### F1: Major (should-fix before publish). A rejected edit desynchronises the editor permanently

- **Status:** confirmed by probe, standalone store, real Chromium.
- **Where:**
  - `code-editor.reducer.ts`, `case 'valueChanged'`: the stale-report drop;
  - `codemirror-wrapper.ts`: `reportedValue` advances on every document change.
- **Mechanism:**
  1. `baseValue` is the document the editor last reported, not the last value that state accepted.
  2. Suppose a parent reducer declines a `valueChanged`, for example to enforce a maximum length, to ignore edits while saving, or to validate. State does not change, so there is no state notification and no reconcile.
  3. The document keeps the rejected text, and `reportedValue` now names it.
  4. Every later report carries a `baseValue` that is not `state.value`, so `codeEditorReducer` drops it as stale.
  5. The editor recovers only if the document happens to return to exactly `state.value`.
- **Repro (probe, now deleted):**
  - Setup: a parent reducer ignores `valueChanged` whose value is longer than 3 characters. Initial value `abc`.
  - Type `d`. It is rejected, and the document shows `abcd`.
  - Delete the first two characters. The document is `cd`, which is within the limit.
  - **Result:** `state="abc"`, `doc="cd"`.
  - Before this change, the second report was accepted and state became `cd`.
  - Every further keystroke is dropped too. **Save writes `abc` while the user sees `cd`.** That is silent data loss.
- **Why the tests miss it:** every test uses `codeEditorReducer` unwrapped, and that reducer never declines a non-stale report.
- **Fix options, for the owner to choose:**
  - **(a) Controlled-input semantics.** When a report is reduced without state taking its value, revert the document to state.
    - Standalone: `sink.dispatch` can check this right after the synchronous dispatch.
    - Managed: when the FIFO head is overtaken without a match.
  - **(b) A revision instead of content.** Add a monotonically increasing `valueRevision` in state, bumped by each accepted write. Reports carry the revision they were edited from. This also fixes F2.
  - **(c) At minimum:** document that a parent must not decline `valueChanged`, and add the case to CHANGELOG "Observable changes" and to limitation 5.

### F2: Low. A same-drain write that restores the pre-command value is lost (value ABA)

- **Status:** confirmed by probe, managed view.
- **Repro:**
  - Setup: state `A`.
  - In one drain, dispatch `[insertText '!', valueChanged 'A']`. The second action is an external write, for example a revert or a reload of unchanged content.
  - **Result:** state `!A`, document `!A`.
  - **Control:** with `valueChanged 'Y'` in place of `'A'`, the result is `Y` and `Y`, which is correct.
- **Cause, in two places:**
  - `reconcile` returns early because `value === appliedValue`.
  - The queued echo's `baseValue` `A` equals state again, so the reducer accepts it.
- **Impact:** the document and state stay consistent, but the external write loses to an edit that came before it in queue order.
- **Scope:** managed stores only. Standalone reports reduce synchronously, so nothing is in flight.
- **Fix:** option (b) of F1 fixes this as well. Otherwise, record it as a known limit.

### F3: Low. In-flight FIFO overflow rewinds the document and pollutes history

- **Status:** by inspection only.
- **Trigger:** more than 64 editor reports in flight in one drain, for example a scripted burst of commands.
- **Mechanism:**
  1. `shift()` discards the oldest in-flight entry.
  2. When state reaches that value, it is treated as an external write. The FIFO is cleared and the document is rewound, with `addToHistory: true`.
  3. Each later report is then accepted, because its base is the previous value, and rewritten one at a time.
- **Final outcome:** consistent. But there are about N extra undo entries, and the cursor jumps.
- **Documentation:** limitation 5 states the bound but not this consequence. Add a sentence.

### F4: Nit. R4 was adopted by default, not by bypass

- On the managed path, `FlowCommands` still calls `props.unliftAction`. That is the default identity-probe unlift, or a caller-supplied one.
- `B1-CONTRACT-REVIEW` R4 asked for a bypass on the managed path.
- **Why it is low risk:** strict function types make a wrapping-parent `unliftAction` a compile error against a managed view's action type.
- **Remaining gap:** a caller-supplied non-identity `liftAction`, such as `(a) => ({ ...a })`, makes `liftsIdentically` false. Viewport commands then die silently on a managed view.
- **Fix:** bypass unlift when `isManagedChildView(store)`. It is a one-line change.

## Checked and holds

- **State before command.**
  - Standalone: `dispatchCore` notifies state subscribers, then action subscribers (`store.svelte.ts:218-240`). The managed path is core's turn queue.
  - `reconcile` runs synchronously in `onState`.
  - The CodeMirror update listeners run after `updateState = Idle` (`@codemirror/view` 6.38.6 `index.js:7710-7725`). So the synchronous write-back that a re-entrant dispatch can trigger does not throw.
- **Echo FIFO.**
  - Traced by hand, all correct:
    - `[insert, undo]`;
    - `[insert, undo, insert]`, with duplicate values;
    - `[insert, external Y, insert]`;
    - `[insert, external Y, undo]`.
  - `writing` suppression covers programmatic writes, and `reportedValue` still advances through them.
- **CRLF.**
  - `sameDocument` is applied to reports.
  - The first report after mounting a CRLF value carries the exact CRLF base.
  - `formatted` compares its input to `state.value` exactly, which is correct: the input *is* a past `state.value`.
- **Format freshness.** `attemptId` supersession and the input check are correct. Untagged results apply unconditionally. A read-only `format` does not consume an attempt.
- **Retired and late work.**
  - A retired view renders the retained state.
  - A view that is already retired at mount renders nothing.
  - A `createEditorView` promise that resolves late destroys the view.
  - A language failure after unmount is ignored.
  - `handleMoveEnd` tolerates `state` being `undefined`.
- **CodeHighlight.**
  - Dedupe goes through `onAction`, and the `$effect` runs after it.
  - Tagged results for code or a language that state has left are dropped.
  - An A→B→A sequence can apply an early result, but that result is content-correct.
- **NodeCanvas.** The conditional `LiftProps` is emitted in `dist/node-canvas/NodeCanvas.svelte.d.ts:86-88`. The identity default and the clamped `setViewport` are as described.
- **Packaging.**
  - `dist/internal/view-source.js` imports `@composable-svelte/core/application` as an external, so there is a single registry, as A1 requires.
  - The emitted `.d.ts` files reach `ViewSource` through relative paths, so no exports-map entry is needed.
  - `files: ["dist", …]` includes it.
  - No `src` file is newer than `dist/index.js`. That is an mtime check only.

## Material unproven limits

1. **Peer floor (A2).**
   - `^0.13.0` in `package.json` admits a core without `isManagedChildView` and `observeChildActions`. HEAD's core does not export them. The published `0.13.0-next.0` does not either, although `^0.13.0` excludes that prerelease anyway.
   - **Consequence:** if a `0.13.0` final ships without them, consumers fail at module link.
   - **Fix:** raise the floor to the exporting core version. This gates release.
2. **xyflow version.**
   - The packed fixture pins `@xyflow/svelte` 1.4.1.
   - A fresh `^1.4.1` install resolves 1.6.2, which is what a new consumer gets. That version is untested with `FlowCommands`.
   - The fixture also needed `vitePreprocess({ script: true })` for xyflow's sources.
3. **`ApplicationStore` misuse.** The runtime warn path is asserted by message text only (limitation 7).
4. **Parent reducers that transform or decline edits have no tests.** F1 is the concrete gap. Transformation (limitation 5) is argued in prose, not tested.
5. **Stale core under test.** The whole suite ran against a core `dist` that another worker was modifying. The worker notes this. Rerun against the final core bytes before tagging.
6. **Proof suite in the default include.** `tests/proof/` is still in the default browser include. Its shipping status is undecided (limitation 10).
