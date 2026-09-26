# Media F3 delta review: a conversation stop in flight at unmount

**Date:** 2026-09-25. **Mode:** read-only and narrow. No source or test was edited.

**Scope:** the post-review delta ("Delta: F3 residual 1 closed") in these files:

- `packages/media/src/lib/voice-input/reducer.ts`: `releasedDevices`, `stopAndSend` and `_releaseDevice`;
- `packages/media/tests/voice-input-ownership.test.ts`: the two new tests;
- the README unmount clause;
- the appended section of `MEDIA-MIGRATION.md`.

The findings are checked against F3 in `MEDIA-INDEPENDENT-REVIEW.md`.

## Immediate verdict

**Accept.** The delta does what the lead's rule asks:

- An accepted conversation send whose stop is still in flight survives the UI detaching.
- It is transcribed and delivers `transcriptionCompleted` exactly once to a live owner, and the recorder is not restarted.
- Retiring the owner or destroying the store cancels it.
- Live continuous recording keeps its order: stop, then restart, then `_audioStopped`.

One low-severity latent defect was found (D1). It does not block. It is reachable only through an injected `createAudioManager` that reuses one device object across sessions, and the fix is one line. The real-`MediaRecorder` question is still open (it is residual 2), and it is not a defect in this code.

## What I ran

- `npx vitest run tests/voice-input-ownership.test.ts tests/voice-input-conversation-continues.test.ts` in Chromium browser mode: **2 files, 24/24 passed**. That is 20 ownership tests, including the 2 new ones, plus the 4 conversation-continues tests.
- I did not rerun the whole suite. Per the brief, it already passes: 211/211 in the browser and 8/8 under SSR.
- I tried to probe D1 in Node. The package has no runner for TypeScript whose imports end in `.js` (no `tsx` or `vite-node` is installed), so D1 is **traced through the source, not executed**. No probe file was left behind.

## Verification of each claim

1. **An accepted stop survives detach. Confirmed.**
   - `_releaseDevice` treats `status === 'processing' && _activeStop != null` as `stopping`, whatever the mode. It keeps `_generation` and `_activeStop`, sets `mode: null`, and does not cancel `SESSION_WORK`.
   - So the in-flight `stopAndSend` is not aborted. Its later `_audioStopped` passes the generation, `_activeStop` and `processing` guard.
   - From there, `_transcriptionResult` with `mode: null` takes the non-conversation branch and ends `idle`.
2. **No recorder restart. Confirmed.**
   - `releaseAudioManager` adds the captured device to `releasedDevices` before it deletes or cleans up. Every release path goes through it: the resource's dispose, a direct `Effect.run` release, the injected `deleteAudioManager` and the `cleanup()` fallback.
   - The microphone resource captures the same object that `deps.getAudioManager(id)` returned to `stopAndSend`, because acquisition checks `getAudioManager(managerId) !== manager`. So the WeakSet lookup hits.
   - `_audioStopped` carries `continuing: restart`, so the reducer takes the existing non-continuing branch. That branch cancels VAD and level (already gone) and transcribes.
   - The test pins it: the `startRecording` spy is not called, and `recording` is false.
3. **Exactly once. Confirmed.**
   - One `stopAndSend`, one `transcribe` and one `_transcriptionResult`, which the `_pendingTranscriptions` membership check deduplicates.
   - `VoiceInput` dispatches `_releaseDevice` only while `_audioManagerId !== null` or during the permission prompt, and `_releaseDevice` nulls the id. A second teardown dispatch is therefore impossible.
   - The test asserts one transcription, one `transcriptionCompleted`, one `deleteAudioManager`, and no `audioProcessingFailed` or `console.error`.
4. **Owner retirement and destroy cancel. Confirmed.**
   - Retirement (`stopDictating`, which leads to `deactivateVoiceInput`) bumps the generation and cancels `SESSION_WORK`. The stop's `signal.aborted` check returns **before** the restart line, and the managed dispatch is retired as well. The new countercase shows no restart, no transcription and no draft.
   - `destroy()` aborts every in-flight effect, so it takes the same early return. The author's mutation note is accurate: the countercase still passes with the abort checks removed, because the dispatch retirement and the device release each cover it. The observable contract is pinned; the abort checks themselves are not.
5. **Live continuous ordering is unchanged. Confirmed.**
   - With no release, `restart === continuing`. The order is still: `stopRecording`, then `startRecording`, then `_audioStopped{continuing: true}`, then `recording`. `voice-input-conversation-continues` passes 4/4.
6. **Release tracking and cancellation races. Sound for the reachable orderings.**
   - `_releaseDevice` runs on the unmount's synchronous stack, and its release effects run on dispatch.
   - The stop's continuation runs in a microtask after the recorder's `onstop` **task**, so it cannot land between the reducer and its effects.
   - **Continuation runs first** (the stop settled before unmount): the recorder restarts, `_audioStopped{continuing: true}` is dispatched, and the state becomes `recording` with one pending transcription. The unmount then takes the `pending.length` branch: it keeps the accepted segment, and the release cleans up the restarted recorder, so the second segment is discarded. That is correct, and the existing test "a conversation keeps its accepted segment…" covers it.
   - **Release runs first:** the WeakSet already holds the device when the continuation runs. The case is covered.
   - The stop rejects after cleanup: `_operationFailed` matches the generation, which gives `audioProcessingFailed`, then `error` with `mode: null`. The failure is reported, not lost silently.

## Findings

### D1. Low, plausible (traced in source, not executed): a released device object is poisoned for every later session

- **Where:**
  - `reducer.ts:115` and `reducer.ts:119`: `releasedDevices` is only ever added to.
  - `reducer.ts:185`: the restart check.
  - `reducer.ts:267`: `_transcriptionResult` leaves `status` untouched in conversation mode.
- **Scenario:** an app injects a `createAudioManager` that pools or reuses one device object. For example, it returns a long-lived manager that re-requests the microphone.
  1. Session 1 releases it. Any release path does this, not only unmount: `deactivateVoiceInput`, a denial or a store swap.
  2. Session 2 enters conversation mode. Acquisition hands back the same object and passes the identity check.
  3. The first `manualSendRequested` or `autoSendTriggered` finds `releasedDevices.has(device)` and does not restart. It dispatches `_audioStopped{continuing: false}`.
  4. The state becomes `processing` with `mode: 'conversation'`. The transcript is delivered, but `_transcriptionResult` keeps `processing` because the mode is `conversation`.
  5. `activateConversationMode` is a no-op on (conversation, processing), and `manualSendRequested` requires `recording`. The session is stuck in `processing` until the user toggles conversation off.
- **Not reachable** with the built-in registry: every acquisition gets a fresh `AudioManager` under a new unique id. `fakeDependencies` also creates a fresh device per call.
- **Fix:** `releasedDevices.delete(manager)` in `microphoneResource.acquire` once acquisition succeeds, just before `microphonePermissionGranted`. Another option is to mark the release on a per-acquisition token rather than on the device object. A test would reuse one fake across a release and a new conversation, and expect the restart after the first send.

### D2. Low, test gap: the conversation stop in flight is not tested on a live hand-bound owner or with `destroy()`

- The delivery test is standalone only. The hand-bound delivery test (`:314`) is push-to-talk, and the destroy test (`:301`) is push-to-talk with a pending transcription.
- The reducer path is mode-independent once `_activeStop` is kept, so I expect both to pass.
- The brief names "live store/hand-bound owner", though. A hand-bound conversation delivery test and a `destroy()`-mid-stop test would pin them directly.

### D3. Informational: the `signal.aborted` checks in `stopAndSend` are not independently pinned

This is already disclosed in the delta's mutation table. Retirement is covered twice over, by dispatch retirement and by the release, so it is safe. It is recorded here only so that a future refactor does not treat the countercase as proof of the abort checks.

## Real-hardware uncertainty (separate from the code verdict)

- **What the code relies on:** `AudioManager.stopRecording` captures `recorder` and `chunks` in locals and sets `recorder.onstop` **before** calling `recorder.stop()`.
  - `cleanup()` then stops the tracks and nulls `this.recorder`, `this.pendingStop` and `this.chunks`. It does not touch the local handler or the captured array.
- **What the spec says:** `stop()` has already set the recorder `inactive` and queued the `dataavailable` and `stop` events, so `onstop` should still fire, with the segment's chunks.
- **What is unverified:** on a real device, whether Chromium, Safari and Firefox always deliver the final `dataavailable` and `stop` after the tracks are stopped mid-flush.
- **Consequences:**
  - If `stop` does not fire, the state hangs in `processing` with `mode: null`. It is recoverable: a remount and a new start re-request permission and supersede it.
  - If the final chunk is empty, a truncated or empty blob is transcribed.
- **Status:** this is residual 2, the real-device gate. The delta correctly widened it to cover the conversation path. It needs a device run, not a code change.

## Verdict

**Accept the delta as landed. It closes F3 residual 1.**

- D1 is a one-line hardening for injected pooling factories. It is worth doing, but it does not block.
- D2 is optional test coverage.
- Residual 2, the real `MediaRecorder` behaviour after `cleanup()` mid-stop, stays open until it is run on a device.
