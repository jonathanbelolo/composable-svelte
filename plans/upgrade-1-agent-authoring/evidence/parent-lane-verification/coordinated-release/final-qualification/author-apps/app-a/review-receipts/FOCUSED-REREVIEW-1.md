# Focused independent re-review 1: reviewer edits F1–F5

- Reviewer: an independent general-purpose subagent with fresh context (claude-opus-5-5). It was told not to edit files and not to run Playwright.
- Date: 2026-09-26, completed about 15:06 local time.
- Scope: the reviewer diff against `pre-opus-app-a` for `src/model.ts`, `src/Workspace.svelte`, `tests/workspace.test.ts`, `tests/component.test.ts` and `tests/ssr.mjs`.
- Result: **no blocking issues**. The subagent ran svelte-check (0/0), vitest (14/14) and `npm run test:ssr` (pass).

## Identity of the reviewed diff

The subagent read `review-receipts/opus-edits.diff`. That file was later **regenerated** after two nit edits, so the original bytes were overwritten. The diff it reviewed has been reconstructed exactly: the current tree was copied and the two nit edits, listed below, were reverted.

- Reconstructed reviewed diff: `review-receipts/rereview-1-reviewed.diff`, sha256 `77254a839314987ae83f4496dd0f25d0d59ef37676d2d463f9653eb5ad102eba`.
- File hashes of the reviewed state: `review-receipts/rereview-1-reviewed-file-hashes.txt`.
- The line numbers cited in the result match this reconstruction: `model.ts:196-222`, `workspace.test.ts:79-92`, `271-296`, `367-417`, and `component.test.ts:202-268`.

## Edits made after this review (not covered by it)

`review-receipts/post-rereview-1-nits.diff` contains two edits that respond to nits 1 and 2:

1. `src/model.ts`: a comment only, stating that the guard assumes unique message ids.
2. `tests/component.test.ts`: the negative-control assertion now uses the same fixed 50 ms wait as the replacement case (`expect(...).toBe('1')` instead of `waitFor`). This makes the timing comparison stricter, not looser.

These edits, and the later dependency-hygiene change, are covered by focused re-review 2 (`FOCUSED-REREVIEW-2.md`).

## Exact result returned by the subagent

```
I found no blocking issues. The type check, unit tests and SSR test all pass, the guard is sound for every flow the app can actually reach, and no test was weakened.

**Checks run** (in `/private/tmp/composable-final-authoring/app-a`)
- `npx svelte-check --tsconfig ./tsconfig.json --fail-on-warnings`: 0 errors, 0 warnings.
- `npx vitest run`: 14 of 14 pass (7 in `workspace.test.ts`, 7 in `component.test.ts`).
- `npm run test:ssr`: passes.
- Playwright was not run, as instructed.

**The guard at `src/model.ts:196-222`**
- **Message id reuse:** it can't happen. `generateId` in `src/dependencies.ts:130` counts up from one counter per dependencies object. That object is shared by every chat instance in the store, so reopening or replacing a conversation keeps producing new ids. Without a `generateId`, the reducer falls back to `crypto.randomUUID`.
- **Regenerate and edit:** both trim the message list so the last message is the user's (`reducer.js:381-421`, `533-571`). An ignored completion therefore sees `role: 'user'` and archives nothing. When the new stream finishes, its reply has a new id and is archived. The old reply stays archived too, which is how the code behaved before the edit.
- **Empty replies:** these still get a new id and are archived, as before. Nothing legitimate is suppressed.
- **Late callbacks:** the chat's stream effect drops callbacks after cleanup (`reducer.js:22-56`). So the only idle or stale `streamComplete` the parent can receive is one dispatched from outside, which is exactly the case the fix covers.
- **Architecture:** the edits add no casts. Checking the message id against the durable archive is the "domain identity" check that `core/docs/agent-patterns.md:14` asks for. Storing the id is not duplicated child state, because the archive is the parent's own record and outlives the chat. There are no new callbacks, action-stream listeners or lifecycle code.
- The shipped recipe (`chat/recipes/managed/ManagedChat.svelte:43-47`) has the same duplicate-archive bug that this edit fixes in the app.

**Tests**
- **Idle/stale completion (`tests/workspace.test.ts:79-92`):** this is a real regression test. The old code would have archived twice.
- **Late callback after replace (`workspace.test.ts:271-296`):** this is a strong test. Conv-2's fresh chat reuses `streamId: '1'`, so conv-1's late completion would match it and be accepted if the old stream owner weren't retired. It calls the real captured transport callbacks, and `store.finish()` would catch any action it didn't expect. The close test (`:221-225`) works the same way.
- **`sendDraftToChat` (`workspace.test.ts:367-417`):** this is now stronger. Nested actions in `receive()` must match exactly (`core/dist/test/test-store.js:159-169`), and it asserts `toBe(message)` where it used to assert `toContain`. Limiting `conv1Abort` to the first stream (`:238`) keeps that count meaningful once conv-2 opens a stream; it is not a weakening.
- **Deferred transcription (`tests/component.test.ts:202-268`):** this is not fabricated. It uses the real `VoiceInput` and waits until `transcribeAudio` is actually pending. The control case (no replacement) shows the transcript landing on conv-1.
- **SSR (`tests/ssr.mjs:66-76`):** the counters cover all injected services, it waits 50 ms for async work, and it checks a later default render is byte-identical to the first.

**Non-blocking findings and nits**
1. `src/model.ts:198-203` (non-blocking): the guard means "this message isn't archived yet", not "the chat just accepted this completion". A partial reply left by `stopGeneration` (`reducer.js:377-378`) would be archived if an idle `streamComplete` were dispatched from outside afterwards. The package never delivers one on its own, and the old code had the same weakness. The guard also assumes message ids are unique, which is only guaranteed if a custom `generateId` keeps it that way. A comment stating these assumptions would help.
2. `tests/component.test.ts:242, 256-258` (nit): the replacement case checks for "0 transcripts" after a fixed 50 ms wait, while the control case uses `waitFor`. The transcription path is only microtasks after the promise resolves (`media/dist/voice-input/reducer.js:195-199, 281`), so 50 ms is plenty. Asserting the control count right after the same 50 ms wait would prove the timing is enough.
3. `tests/workspace.test.ts:87-92` (nit): the "superseded" case is really a repeated completion of a stream that already finished. After completion `activeStreamId` is `null`, so `'1'` is ignored. It still exercises the ignored-but-parent-visible path. A truly superseded stream is covered by the replace test.
4. `tests/workspace.test.ts:387` (nit): the test copies the reducer's message template. That is fine as a spec check, but the two must be kept in sync by hand.
5. `src/Workspace.svelte:178` (nit): the list is now keyed by `messageId`. It relies on the same uniqueness as the guard, which prevents duplicates within a conversation, so a duplicate-key error can't occur today.
```
