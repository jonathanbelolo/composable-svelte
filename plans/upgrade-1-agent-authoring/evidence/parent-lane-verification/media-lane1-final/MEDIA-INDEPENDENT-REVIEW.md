# Media migration: independent review

- **Reviewer:** Claude Opus 5.5. Independent and review-only.
- **Date:** 2026-09-25.
- **Worktree:** 2359, HEAD `ffd3ca51`. The review covers the uncommitted `packages/media` diff.
- **Inputs:** `MEDIA-MIGRATION.md`, `COMMAND-DELIVERY-DECISION.lead-copy.md`, `B1-CONTRACT-REVIEW.md` (K1, K2, A1, A2, R3, R5, R7).
- **Method:**
  - I read the full media diff: source, tests, fixtures, recipes, README, CHANGELOG and configs.
  - I read the core seam it depends on (`application/owner-actions.ts` and `ManagedComposition.bind`).
  - I ran two scratch probe files in Vitest browser mode (Chromium) against source, with the lane's fixtures. The results are quoted below.
  - Both probe files were deleted afterwards. For `packages/media`, `git status --porcelain` matched the starting snapshot. The only differences anywhere were in `packages/code`, from the concurrent code worker.
  - I edited no source, test, fixture or doc, and did not re-run any broad suite.

## Verdict

**The migration is sound in the areas the brief called critical:**

- the managed `ChildView` and standalone `Store` dual path;
- retirement to `undefined`;
- same-id player isolation;
- routing the microphone release through the store.

The contract points from the B1 review are met:

- **K1:** the generic brand predicate, with an explicit capability check on the false branch.
- **K2:** a missing capability warns once and never throws.
- **R5:** the parent reducer owns the business result.
- **R7:** the `TestStore` throw is neither masked nor changed.

No finding blocks the managed path. Two findings (F1, F2) are real regressions in how the **public** player registry interacts with mounted players, and they have cheap fixes. One finding (F3) is a recorded behaviour change that should be a conscious lead decision, because it drops business results for standalone store owners. The rest are low-severity items and test gaps.

## Findings (severity order)

### F1. Medium, confirmed: public `deleteAudioPlayerManager(id)` silently and permanently kills a mounted player

- **Where:**
  - `src/lib/audio-player/audio-engine.ts:46`: `if (manager.disposed) return;`
  - `src/lib/audio-player/audio-manager.ts:318-325`: the public `deleteAudioManager` disposes whatever is registered under the id.
  - `src/lib/audio-player/audio-engine.ts:36`: a player's manager is now registered under its explicit `id`.
- **Probe P1:** I mounted `FullAudioPlayer` with `id: 'p1'`, called `deleteAudioManager('p1')` (exported as `deleteAudioPlayerManager`), then clicked Play.
  - Result: `{"isPlaying":true,"playCalls":0,"paused":true,"src":"","warns":0,"errors":0,"uiPauseButton":true}`.
  - The store and UI say the track is playing, the element is disposed, and nothing is logged. There is no recovery short of remounting.
- **Why it matters:**
  - The README (`README.md:175`) now advertises the id as the way to look up a player's manager. It warns only about `getAudioPlayerManager`, not about delete.
  - Cleaning up "by id" is the pattern the registry API invites, and HEAD's own players used it.
  - Before this change, a disposed manager at least `console.warn`ed on every call. The engine's early return makes the failure silent.
- **Fix (recommended):** give the registry provenance.
  - Keep a module-private `WeakSet<AudioManager>` of player-owned managers in `audio-manager.ts`, added to by `_nameAudioManager`.
  - In `deleteAudioManager(id)`, when the entry is player-owned, remove only the name and `console.warn` that the player owns its element and releases it on unmount/retirement. Do not dispose it.
  - The player's own `dispose()` stays the only disposer.
- **Weaker alternative:** the engine detects `manager.disposed` in `sync` and either re-creates its manager (reset `loadedTrackUrl`) or dispatches one `error` action, so the store stops claiming playback.
- **Test:** mount a named player, call `deleteAudioPlayerManager(id)`, click Play, and expect `element.play` to be called once and the element to be unreleased.

### F2. Medium-low, confirmed: a manager the app registered under a player's id is displaced as if it were another player, and orphaned

- **Where:**
  - `src/lib/audio-player/audio-manager.ts:336-340` (`_nameAudioManager`);
  - `audio-engine.ts:36-41` (the warning text);
  - `CHANGELOG.md:43-49`.
- **Probe P2:** `getAudioManager('p2', {onAction: appSpy})` before mounting a player with `id: 'p2'`.
  - Result: 2 elements. The warning read `[FullAudioPlayer] another mounted player already uses id "p2"…`, but no other player exists. The app's manager is dropped from the registry without being disposed.
  - Then the app's `deleteAudioManager('p2')` disposed the **player's** manager, which is F1: `playerPlayCalls: 0`, `isPlaying: true`.
- **Behaviour change not recorded:**
  - At HEAD the player's mount called `getAudioManager(managerId, { onAction })`. That is get-or-create, so a pre-registered manager was **adopted**, including an element produced by the app's `createAudioElement` factory (for example an in-DOM `<audio>`, or `crossOrigin` set for a visualizer).
  - That factory is now silently ignored.
  - The CHANGELOG entry covers player-versus-player sharing only.
- **Fix:**
  - Use the provenance set from F1.
  - When the displaced entry is not player-owned, **leave the app's registration in place**: do not name the player. Warn precisely: "id "x" is registered by getAudioPlayerManager/createAudioPlayerManager; this player keeps its own element and is not registered under it."
  - Add a CHANGELOG line: "a manager registered under a player's `id` is no longer adopted by the player; its `createAudioElement` is not used."
  - If adoption of an app-supplied element is wanted, it needs a real prop (for example `createAudioElement`), not registry side-channels.
- **Test:** pre-register, mount, and assert that the warning wording is correct, that the app's manager is still registered and not disposed, and that `deleteAudioPlayerManager(id)` does not touch the player.

### F3. Medium, confirmed, needs a lead decision: unmounting `VoiceInput` during `processing` drops the transcript even when the store outlives the component

- **Where:**
  - `src/lib/voice-input/VoiceInput.svelte:100-109`;
  - `reducer.ts:274-276` (`deactivateVoiceInput` bumps the generation, clears `_pendingTranscriptions` and cancels `SESSION_WORK`);
  - recorded at `CHANGELOG.md:37-42` and `README.md:287-294`.
- **Probe P7:** a standalone store with a store-level `subscribeToActions` observer. Push-to-talk: hold, grant, release. The state is `processing` with the device still held (`_audioManagerId` set). Then I unmounted `VoiceInput` and resolved the transcription.
  - Result: `{"before":{"status":"processing","managerId":true,"transcriptions":1},"after":"idle","delivered":[]}`.
- **Why it matters:**
  - At HEAD, unmount deleted the device, but the transcription still completed, and `transcriptionCompleted` reached the store: a `scope()` parent reducer and store-level observers. Only `onTranscript` was lost.
  - Now the utterance is lost for every consumer. That is the business handoff this migration tells applications to own in the parent reducer.
  - It bites in a common layout: a composer popover or sheet that closes when push-to-talk is released.
  - Under `FeatureOutlet`, unmount coincides with retirement, which cancels the work anyway, so only standalone stores and hand-bound views are affected.
- **Options:**
  1. **Preferred.** On unmount, release the microphone and the level/VAD loops but let accepted in-flight transcriptions finish. This needs an internal reducer action, for example `_releaseDevice`, that cancels `MICROPHONE_RESOURCE`, `VAD_SUBSCRIPTION` and `LEVEL_SUBSCRIPTION`, releases the device through `deps`, and does **not** bump `_generation` or cancel `SESSION_WORK`. Keep the full `deactivateVoiceInput` for `requesting-permission` and for `recording` that has not yet been stopped.
  2. Keep the current behaviour, with explicit lead sign-off. The README and CHANGELOG already describe it, so no doc change would be needed.
- **Test for option 1:** the P7 sequence, expecting exactly one `transcriptionCompleted` at the store, the device released once, and nothing more after `destroy()`.

### F4. Low, confirmed: a destroyed standalone store with a still-mounted component

- **Probe P5, player:** after `store.destroy()` with the player still mounted and playing, the element **keeps playing**: `paused: false`, `src: /a.mp3`. Every `timeupdate` logs `dispatch after destroy ignored`.
  - At HEAD this was the same in structure, but inaudible, because the players never drove the element. The "never drove its element" fix makes it audible.
- **Probe P6, voice:** destroying the store and then unmounting `VoiceInput` dispatches `deactivateVoiceInput` into the destroyed store, which logs one `dispatch after destroy ignored`. It is harmless: `destroy()` had already released the device once.
- **Managed paths are fine:**
  - **P4:** destroying the root turns the view's state `undefined`, and the player releases its element.
  - **P8:** unmounting the whole `ManagedVoice` app mid-recording releases exactly once, with no warnings or errors.
- **Fix:** document "unmount store-taking components before `store.destroy()`". If core exposes a public liveness signal for `Store`, the engine and the voice teardown can use it. No new public surface should be added for this alone.

### F5. Low, test gap: live-to-live `store` swaps are untested, and R3 rests on them

- **Players.** "an unkeyed player whose store prop changes…" (`tests/audio-mounted.test.ts:136-150`) passes through **retirement** first: `replace` retires the old view, so `live` goes false and then true.
  - The effect's direct dependency on `store` (`FullAudioPlayer.svelte`, the engine `$effect`, `const view = store`) is never exercised while `live` stays `true`.
  - Example of an undetected regression: reading `store` untracked inside the effect. A swap between two live standalone stores (or two live views of different slots) would then keep the old element dispatching to the old store while `sync` drives it from the new store's state.
- **Voice.** "A replaced `store` ends the old one's session" (`VoiceInput.svelte:99`) has no test at all.
- **Add:**
  1. Swap standalone store A (playing) for standalone B. Expect A's element released, a fresh element for B, and element events reaching only B. Expect `restorePreferences` to be dispatched to B once.
  2. Swap `VoiceInput` from A (recording) to B. Expect A released once, and `onTranscript` to fire for B's utterance only; a late transcript from A never fires it.

### F6. Low, confirmed, documented: `getAudioPlayerManager(id, config)` on a mounted player's name redirects its events

- **Probe P3:** after the call, `timeupdate` reached the caller's spy and the store's `currentTime` stayed `0`.
- This is disclosed at `README.md:175-182` and in the JSDoc at `audio-manager.ts:294-296`, so it is not a defect.
- With the provenance set from F1, it becomes cheap to refuse: for a player-owned entry, return the manager **without** calling `updateConfig`, and warn once. That closes the last way one caller can silence a mounted player.

### F7. Low, test hygiene: proof row M10 is mislabelled

- `tests/voice-input-ownership.test.ts:124` is titled "retiring one of two siblings mid-recording", and `MEDIA-MIGRATION.md:127` says the same. The test actually **unmounts** one of two *standalone* stores.
- It is a valid injected-registry isolation test, but no managed "retire one of two slots sharing one injected registry" case exists.
- **Fix:** either rename the test, or add a managed variant: two keyed voice slots over one injected registry; retire one mid-recording; the other stays `recording` with its device live.

### F8. Informational: artifact versus source proof is still open (A1, A2)

- **Runtime tests run against source.** `vitest.config.ts` and `vitest.ssr.config.ts` alias `@composable-svelte/media` to `src/lib/index.ts`.
- **What was checked:**
  - The built `dist` is current: every `.svelte` in `dist` is byte-identical to `src`, and the `.js`/`.d.ts` files are newer than their sources.
  - Its declarations are correct: `store: ViewStore<…>`, and `onTranscript?` is optional.
- **What that does not prove:** nothing mounts media's **packed** `dist` against core's **packed** `application` entry. So the one-copy-of-core registry identity that `isManagedChildView` depends on (B1 A1) is still unproven for media.
- **Still open:**
  - The peer floor (`package.json`: `"@composable-svelte/core": "^0.13.0"`) admits a core without the new exports (A2).
  - `.claude/skills/composable-svelte-media/SKILL.md:426` still says `onTranscript` is required.
- All three are already listed as parent items in `MEDIA-MIGRATION.md`. Treat A1 and A2 as **release blockers**, not follow-ups.

## Verified and holding

- **Dual path.**
  - `internal/view-store.ts:38-51` checks `isManagedChildView`, then an explicit `subscribeToActions` capability, then warns once per source and never throws.
  - It compiles against core's generic brand predicate (`application/owner-actions.ts:42`).
  - The `TestStore` throw propagates unchanged, as before.
- **Stable view identity.** `ManagedComposition.bind` caches per root, owner and slot (`core/src/lib/navigation/managed-integration.ts:417-422`). So `store` identity changes only on replacement, and the engine is not recreated per render.
- **Retirement.**
  - Retired views and views of destroyed roots read `undefined` (P4).
  - All four components render nothing.
  - Handlers use optional reads or `duration()`.
  - The players release on `live → false` as well as at unmount.
  - `activeMode` being `undefined` rather than `null` prevents re-activating a retired voice view.
- **Same-id isolation.**
  - Each engine has its own element.
  - `_unnameAudioManager` removes the name only after an identity check.
  - The `_` helpers are not re-exported from any `exports` entry (`src/lib/index.ts`, `src/lib/audio-player/index.ts`).
- **Late callbacks.**
  - Disposal removes the listeners.
  - `play()` rejections after disposal, and `AbortError` from `load()`, are swallowed (`audio-manager.ts:170`).
  - Element events after retirement dispatch nothing (M2).
  - A late transcription after replacement reaches no one (M8).
- **Unmount ordering in `VoiceInput`.** The button's `onDestroy` `cancelPushToTalkRecording` runs before the parent's `deactivateVoiceInput` teardown, and the device is still released exactly once. M5 exercises this path, because its helper holds the key down.
- **`onTranscript`:**
  - it is read at arrival, through the props getter;
  - it fires once on both paths;
  - the README recipe composes `transcriptionCompleted` in the parent reducer and does not present `observeChildActions` as the business-handoff pattern (R5).
- **SSR.**
  - All native work sits in `$effect`s, which are client-only.
  - The SSR suite installs spies for `Audio`, `AudioContext`, `MediaRecorder` and `getUserMedia`, and asserts they are not called, rather than relying on a `ReferenceError`.
  - The retired-view arm is covered.
- **The pre-existing defect is real.** HEAD's sync `$effect` was declared before `onMount` and returned on the non-reactive `audioManager` before reading any state, so it never re-subscribed. The lane's mutation of HEAD's players (9 of 13 fail) is consistent with this.

## Probe record

| Probe | Setup | Observed |
| --- | --- | --- |
| P1 | named player; `deleteAudioManager(id)`; Play | `isPlaying:true`, `play` ×0, silent |
| P2 | app `getAudioManager(id)` first, then mount | misleading "another mounted player" warning; app manager orphaned; app delete killed the player |
| P3 | `getAudioManager(id, spy)` on a mounted name | events went to the spy, not the store |
| P4 | hand-bound managed player; `root.destroy()` | view state `undefined`, element released, no warnings |
| P5 | standalone player; `store.destroy()` while mounted | element still playing; `dispatch after destroy` per event |
| P6 | `VoiceInput` unmounted after standalone `destroy()` | one `dispatch after destroy` warning; device released once |
| P7 | standalone push-to-talk, unmount during `processing` | transcript never delivered to store observers |
| P8 | `ManagedVoice` app unmounted mid-recording | one release, no warnings or errors |
