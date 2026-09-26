# Chat managed-recipe correction: focused independent review

Reviewer: Opus 5.5 (claude-opus-5-5), 2026-09-26, fresh session. The review was read-only. No file under `candidate/`, `archives-r4/` or `scratch-chat-archive/` was written. Nothing was repacked, published, committed or pushed. No source or documentation was changed. The R4 chat archive was extracted to a private temp dir for comparison, and that dir was removed afterwards.

AGENTS: the only `AGENTS.md` in the candidate is `packages/core/consumer/AGENTS.md`, which covers consumer application authoring. It does not apply to these chat package files. Its policy source, `core/docs/agent-patterns.md` ("Rejected opens and idle completions", "Do not claim these guards authenticate arbitrary … actions"), was used as the yardstick.

## Verdict: **CLEAR**

There are no blockers. The correction is limited to copyable-template idempotence and truthful guidance, as classified. The runtime is untouched, no accepted reply is suppressed, and the docs do not present the guard as authentication.

## 1. Exact six-path delta (independently verified)

- **R4 archive:** `archives-r4/composable-svelte-chat-0.5.0.tgz` sha256 is `cfbfe99d…07090`, which matches the handoff.
- **Shipped files:** for all three, the R4 bytes hash to the handoff's `sha256Before`: `4d9ee745…`, `d4b594f2…`, `48e4bf98…`.
- **Test files:** the pre-correction scratch originals (`fixture.orig.ts`, `managed-chat.test.orig.ts`, `correction/orig/ManagedChat.svelte`) hash to the stated before-hashes.
- **After-hashes:** all six candidate files hash to the handoff's `sha256After`.
  - `tests/recipes/ManagedChat.svelte` is byte-identical (`cmp`) to `recipes/managed/ManagedChat.svelte`.
  - All six are byte-identical to `scratch-chat-archive/ws/packages/chat/`.
- **Scope:**
  - Only these six files under `candidate/` (excluding `node_modules`) are newer than `CHAT-ARCHIVE-ASSESSMENT.md`.
  - `packages/chat/dist` is identical to the R4 archive's `dist` (`diff -rq`), and `src/` is not in the changed set, so there is no runtime change.
  - `CHANGELOG.md` equals R4.
  - `recipes/managed/managed.test.ts` equals R4.
  - The `package.json` difference against R4 is the known pack-time rewrite (`scripts`/`workspace:*`). It predates the correction and is out of scope.
  - `tests/__screenshots__/` holds only old pre-existing entries (Aug 30 to Sep 5). It has no `managed-chat` screenshot, so the mutant's failure screenshot stayed in scratch.

The diffs read exactly as the handoff describes:

- **Recipe (and its verbatim README copy).**
  - `replies` becomes `{ messageId, content }[]`.
  - The archive runs on `reply?.role === 'assistant' && !state.replies.some((r) => r.messageId === reply.id)`.
  - A two-line comment is added.
  - The rendered `replies.length` is unchanged.
- **Chat README table row.** "Settles the reply or shows the error; ignores a completion with no reply in flight" / "…, once per message id".
- **Managed recipe README.**
  - The opening sentence has the approved deviation.
  - The test claim is narrowed.
  - One new residual paragraph is added.
- **Fixture.** The `handoff` gets the same guard, and `archive` entries gain `messageId`.
- **Test.** Three exact archive assertions now read `messageId` from child state, and there is one new test.

## 2. Semantics: accepted outputs are kept

Code-read of `src/lib/streaming-chat/reducer.ts`:

- **`streamComplete` (`:381-404`).** The chat accepts it only when the `streamId` is absent or matches `activeStreamId`, **and** `currentStreaming` is non-null. On acceptance it appends a message with a fresh `generateId()` id. Otherwise the state is returned unchanged.
- **Every accepted completion creates a new id,** so an id-keyed guard can never drop an accepted completion while `generateId` is unique. In particular:
  - **Distinct messages:** there is one archive entry per new id.
  - **Regeneration (`:447-499`):** the regenerated message is removed and the new reply gets a new id, so it is archived. The new test asserts this with **identical text** (`'Hi'`/`'Hi'`) and a different `messageId`. This test also fails a content-keyed guard, so it is the paired negative control against over-suppression.
  - **Identical content:** dedupe is by id, never by content.
  - **Empty replies:** the guard has no content condition, so `content: ''` with a new id is archived. This is shown statically and by scratch matrix L9.
  - **Edit:** `startEditingMessage` only accepts `role === 'user'` (`:586`), so an assistant message's content never changes under a stable id.
- **Only other path that appends an assistant message:** Stop (`:443`), which keeps the partial with a new id. The parent never archives on Stop itself. That is the documented residual.
- **Ignored `streamComplete` while a reply is streaming (stale `streamId`).** The last message is then the user message: `sendMessage`, regenerate and edit all leave it last. So the parent's `role === 'assistant'` check already makes this a no-op, and the guard is not needed there.
- **Fixture dedupe is not keyed by side.** That is correct, because the fixture's `fakeTransport` shares one `m${++id}` counter across both sides. This matches the README's "unique for the application's lifetime" requirement.

## 3. Truthfulness of guidance

- **The guard is not presented as authentication.** `recipes/managed/README.md` says: "This guard does not authenticate actions: a `streamComplete` your own code dispatches after Stop or `restoreMessages` still archives the last assistant message." This is true: by code-read, the partial or restored message has an unarchived id. Nothing in the README, the table row or the code comments claims that fabricated Stop or restore terminal events are rejected.
- **"A transport callback that arrives after completion, Stop, supersession or retirement is dropped before either reducer sees it."** This is consistent with:
  - an accepted completion, Stop and supersede each cancelling `streaming-chat/stream`;
  - the at-most-one terminal behavior in `streamNow`;
  - core's gated dispatch.

  It covers *transport callbacks* only, not public actions, which is the correct distinction.
- **Opening sentence (approved deviation).** "When `streamComplete` reaches the parent, archives … once per message id (see the limits of that guard below)". It no longer implies that the parent verifies the chat's acceptance. It is accurate.
- **Narrowed test claim.** "Proves reply handoff, stream abort on owner retirement, and that a retired owner's late completion archives nothing". This matches `recipes/managed/managed.test.ts`:
  - `1 replies archived`;
  - `abort` called once on close;
  - a late `streams[1].complete()` leaves `1 replies archived`;
  - no console warnings or errors.
- **No stale claim remains.** A repo-wide grep (excluding `node_modules`) finds no remaining "no duplicate archive" or `replies: string` in the candidate. The only hit for the old recipe phrasing is the title of `tests/readme-recipes.test.ts`, "archives each completed reply …", which is still accurate.
- **Verbatim gate.** A static check with the `tests/readme-recipes.test.ts` regex finds 8 `svelte` blocks, and the recipe is quoted verbatim.

## 4. Tests and mutation evidence (scratch, inspected, not re-run)

- **Mutant run.** `run-fixture-mutant.log` (15:19:18) had the guard removed with the record kept. Only `an idle streamComplete is not a completion; a genuine repeat reply still is` failed (26 passed, 1 failed). The diff shows exactly two extra `{ messageId: 'm2', content: 'Hi' }` entries, one for each injected idle action.
- **Guarded runs after the mutant.** Both passed:
  - `run-full-proposal-browser.log` 15:20:07: 29/29
  - `run-full-suite-proposal.log` 15:20:24: 33 files / 340 tests
- **Other logs:**
  - SSR: 11/11
  - `svelte-check`: 0 errors, 0 warnings
- **New test design.**
  - It injects `streamComplete` with no id and with finished id `'1'` through the live child view.
  - It asserts the child's `messages` is the same reference, which proves the chat ignored both.
  - It then asserts the archive is unchanged.
  - Finally it regenerates with identical text. This is a sound negative-plus-positive pair.
- **No candidate test run.** None was needed: the candidate bytes are identical to the validated scratch bytes.

## 5. Non-blocking notes for the coordinator (no change requested)

1. **The recipe's idle-completion guard is not exercised by any shipped or package test.**
   - The mutation targets the fixture mirror. The recipe's own guard is covered only by:
     - byte identity with the fixture's logic;
     - the verbatim gate;
     - the scratch source-derived matrix (`run-1.log`, 30/30).
   - The closed component cannot reach the idle path, as the assessment explains, so this is acceptable. The coordinator may keep the scratch harness as requalification evidence.
2. **The residual list "after Stop or `restoreMessages`" gives examples, not an exhaustive list.** An app that seeds the chat's initial state with assistant messages has the same exposure. The preceding clause, "does not authenticate actions", states the general rule, so the text is not misleading.
3. **"Ignores a completion with no reply in flight" is true but incomplete.** The chat also ignores a stale `streamId` while another reply streams. The parent is safe there anyway (§2).
4. **README line ~591 (reducer-only TestStore example) uses `generateId: () => 'test-id'`.** A reader who copies it into a managed-parent test would hit the stated uniqueness requirement. The managed README states that requirement, and duplicate ids already break keyed rendering.
5. **`CHANGELOG.md` is unchanged.** This is appropriate while 0.5.0 is still an unpublished candidate, because the changelog does not describe recipe internals.

## 6. Requalification (coordinator, unchanged from the handoff)

Rebuild and repack **chat only**. Re-run the chat browser and SSR suites and `svelte-check`. Re-run the recipe's shipped `managed.test.ts` from the installed archive in a consumer layout. Re-run the matrix's chat recipe cases against the new chat archive. No other archive is affected: no other package embeds the recipe, and `dist` is unchanged.
