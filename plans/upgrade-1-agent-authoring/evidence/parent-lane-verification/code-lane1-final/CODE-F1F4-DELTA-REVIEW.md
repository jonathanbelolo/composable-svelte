# Independent Code F1/F2/F4 delta review

**No blocking findings.** F1, F2 and F4 are fixed correctly in the current tree, and the backward-compatibility changes are documented. What's left is low-severity or a nit. This was a read-only review within the time box: I edited nothing and ran nothing, so the traces below come from reading the code and the tests.

### What holds

- **F1 (a parent declines or rewrites an edit)**
  - **Declined edit:** `settle` (`CodeEditor.svelte:255-267`) finds the report still waiting for an answer and puts the document back to `state.value`, keeping it out of undo history (`codemirror-wrapper.ts:457`).
  - **Standalone store:** core notifies state listeners, then action listeners, even when state did not change (`core/src/lib/store.svelte.ts:218-240`). So an accepted report is cleared by `reconcile` before `settle` looks for it.
  - **Store with no action listener:** `settle` is called straight after `dispatch` returns (`CodeEditor.svelte:197`).
  - **Managed store:** in each turn, the owner's action deliveries fire after the state listeners (`turn-queue.ts:505-535`). A delivery is recorded whenever the action is routed to the child, so a veto inside a wrapped child reducer is still delivered. The veto tests use exactly that shape (`tests/managed/veto-model.ts`).
  - **Rewritten value:** the next queued report still carries the old text in `baseValue`, so it is dropped even though its revision now matches.
- **F2 (a write that restores the same text is lost):** I traced `[insertText '!', valueChanged 'A']`. The revision differs, so `reconcile` gets past its early return, clears the waiting reports and writes `A`. The queued report then fails the revision check. Pinned by `code-editor-veto.test.ts:227-246`.
- **F4 (FlowCommands on a managed view):** `FlowCommands.svelte:51-60` skips `unliftAction` on a managed view, and `node-canvas-managed.test.ts:158` pins it. `isManagedChildView` is also true for a retired view, which is harmless.
- **Backward compatibility:**
  - Missing `valueRevision` counts as zero.
  - Callers that only pass `baseValue` still work.
  - A write that bypasses `codeEditorReducer` falls back to comparing values alone.
  - The two changes users will notice, whole-state equality and the revert on decline, are in the CHANGELOG (lines 45-58).

### Findings, most important first

1. **Low: after a declined edit, the cursor in state can be one edit ahead of the document.**
   - Where: `codemirror-wrapper.ts:~281-300` in the update listener.
   - `settle` reverts the document inside the same update listener. The listener then carries on and sends `selectionChanged`/`cursorMoved` built from the edit that was just declined.
   - The revert itself sets no selection, so nothing sends a correcting position. For example, `state.cursorPosition` can point at column 4 of `abc`.
   - Fix: after sending `valueChanged`, re-read the selection from `view.state`, or skip the cursor and selection reports when the document changed underneath.
   - I traced this by hand and did not run a probe.
2. **Low: a store that neither reports its actions nor dispatches synchronously would undo every keystroke.**
   - Where: `CodeEditor.svelte:177, 197`.
   - For such a store, `settle` runs straight after `dispatch` and assumes the reducer has already run. If a custom store queues its dispatch, state hasn't moved yet, so every edit looks declined.
   - The old behaviour was drift, not reverts. Only unusual custom stores are affected, and the existing warning already fires.
   - Fix: say that this path assumes synchronous dispatch, in the code comment and in the README warning paragraph.
3. **Nit: the migration notes give the wrong queue limit.**
   - `CODE-MIGRATION.md:59` and limitation 5 (`:269`) still say 64, but the code uses 256 (`CodeEditor.svelte:169`, noted at `:384`).
   - Limitation 5 also still lacks what happens on overflow: the document is rewound and extra undo entries appear. The component comment (`CodeEditor.svelte:163-166`) describes it; that sentence should be copied in.
4. **Known and accepted:** a parent that assigns `value` itself, without `codeEditorReducer`, still hits the lost-write case F2 fixed, when it restores the exact text of an edit still being processed. This is documented at `README.md:285-288`, and no action is needed.

### Still needed before release (not blockers for this review)

- The `^0.13.0` minimum for `@composable-svelte/core` (called A2 in the review) still lets in a core without `isManagedChildView`/`observeChildActions`. `FlowCommands` now imports `isManagedChildView` directly as well.
- Rerun the code suites against the final core build before tagging.

## Disposition

The cursor mismatch was fixed in `codemirror-wrapper.ts` and pinned by standalone and managed veto tests. The queue-cap and synchronous custom-store documentation nits were corrected. No code blocker remains from this review; final installed verification is in `LANE-FINAL-HANDOFF.md`.
