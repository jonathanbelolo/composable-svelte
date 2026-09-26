# Media M12 Real-Device Qualification Harness

This is a bounded real-microphone harness for the provisional `@composable-svelte/media` 0.5.0 and `@composable-svelte/core` 0.13.1 candidates.

**Status: no browser or microphone run has happened.** `npm run check` and `npm run build` pass. Those checks are static readiness only, not device evidence. Evidence exists only once the coordinator captures `#results-json` with `"evidenceKind": "browser-execution"` from a normal Chrome window.

## Provenance

| Package | Version | Archive | SHA-256 |
| :--- | :--- | :--- | :--- |
| `@composable-svelte/core` | 0.13.1 | `/private/tmp/companion-runtime-release/archives-r3/composable-svelte-core-0.13.1.tgz` | `30e044e139e831033e06fdf626db979875efa2f7c29d72dece33a21db112d18b` |
| `@composable-svelte/media` | 0.5.0 | `/private/tmp/companion-runtime-release/archives-r3/composable-svelte-media-0.5.0.tgz` | `c0bfa6528fb6cd3dc68f2769237d3053514f76f79bc5197316b230eb07b78298` |

- **Lockfile:** SHA-256 `6a3281a8ded2b5f702031f90c87b6ebe34f5bb701576709385d6d577f2ce8d69`.
- **Svelte:** 5.55.3.
- **Candidate:** archives-r3; shipped review clearance pending.
- **Installed versions:** the page reads them from the installed `package.json` files and records them in the results. The `genuine-environment` assertion fails if they differ from the table above.

## What one run does

Clicking **Run Qualification (All Cases)** runs three cases in sequence. Each case does the following:

1. Mounts `VoiceInput` on a store and starts recording with the real `getUserMedia` and the native `MediaRecorder`.
2. Records for about 1.2 s.
3. Dispatches the accepted stop: `stopPushToTalkRecording` or `manualSendRequested`.
4. Unmounts the view in the same synchronous turn. At that moment the native `recorder.stop()` has been called, but `dataavailable` and `stop` are still pending.
5. Waits for the transcript from the local stub, then a 750 ms quiet period.
6. Evaluates the assertions against the store, which is still alive.

| Case | Store | Mode | Stop action |
| :--- | :--- | :--- | :--- |
| `standalone-push-to-talk` | standalone `createStore` | push-to-talk | `stopPushToTalkRecording` |
| `standalone-conversation` | standalone `createStore` | conversation | `manualSendRequested` |
| `managed-parent-conversation` | living `ManagedIntegrationBuilder` parent, `voice` slot kept | conversation | `manualSendRequested` |

Push-to-talk is covered only by the standalone store. The managed parent case is conversation-only.

## Assertions (per case, decided by event sequence number)

Every recorded event gets a sequence number `seq`. Ordering is decided by `seq`, never by timestamps. The `relMs` field is informational only.

| Id | Requires |
| :--- | :--- |
| `harness-completed` | No timeout, error state, `getUserMedia` rejection or watchdog trip while the case ran. |
| `genuine-environment` | Native `getUserMedia`, `MediaRecorder`, `start`, `stop` and `track.stop`, all checked before patching. `navigator.webdriver` is not true. No track label matches `/fake/i` (only this boolean is kept, never the label). Installed versions equal the provenance. |
| `single-native-acquisition` | 1 `getUserMedia` call, 1 success, 0 errors, at least 1 audio track, 0 stops of untracked tracks. |
| `accepted-stop-pending-at-unmount` | Order: `accepted_stop.dispatch_begin` (status `recording`, the case's mode) → `recorder.stop` (state `inactive`, 0 `dataavailable`, 0 `onstop` so far) → `accepted_stop.dispatch_end` (status `processing`, numeric `_activeStop`) → `unmount.begin`. Exactly 1 native stop call, and no `track.stop` before unmount. |
| `unmount-release-ends-every-track` | Exactly 1 `_releaseDevice`. Order: `unmount.begin` → `_releaseDevice` → every `track.stop` → `unmount.returned`, so the release happens synchronously inside the unmount call. Each stop reports `readyState` `ended` afterwards, and every acquired track is stopped. |
| `tracks-ended-before-native-delivery` | The last `track.stop` comes before the first native `dataavailable`. |
| `native-delivery-exactly-once` | Exactly 1 `dataavailable` (size > 0), then exactly 1 native `stop`; 0 recorder `error` events. |
| `single-local-transcript-delivered` | Exactly 1 stub transcription, with the same byte size as the `dataavailable` data. Order: `onstop` → transcribe → exactly 1 `transcriptionCompleted` carrying `stub-transcript-<size>-bytes`. In the managed case, parent `drafts` equals `[transcript]`. |
| `no-restart-or-reacquire` | 1 recorder created and 1 started in total; 0 `getUserMedia` calls, recorders or starts after `unmount.begin`. |
| `mic-open-window-bounded` | 0 < (first `getUserMedia` success → last track ended) ≤ 2000 ms, and 0 watchdog stops. |
| `no-errors-or-network` | 0 each of: `_operationFailed` / `audioProcessingFailed` / `microphonePermissionDenied` actions; states with status `error` or a non-null `errorMessage`; `console.error` calls; `window` `error` events; `unhandledrejection` events; blocked network attempts. |
| `settled-after-quiet-period` | No events and no level/VAD actions during the 750 ms quiet period. The store (or the parent's `voice` slot) is non-null with status `idle`, mode `null`, no active stop, no pending transcriptions, no audio manager and no error. |
| `no-forced-cleanup` | The forced cleanup at the end of the case found 0 live tracks. |

`console.warn` calls are counted in the metrics but not asserted.

## Safety bounds

- **No manual capture.** There is no autorun, no URL-triggered run and no manual record control. All Run buttons are disabled while a run is in progress.
- **Watchdog.** 2000 ms after a case's first `getUserMedia` success, every track that case acquired is stopped through the native `track.stop`. The watchdog is never cleared by a later acquisition, a new case or any UI action. A stream acquired after the deadline is stopped immediately.
- **Late grants.** A permission grant that resolves after its case has closed is stopped immediately. It is counted in `suiteSafety.lateGrantTracksStopped`, which makes the overall result FAIL.
- **Forced cleanup, every path.** At the end of each case, the harness unmounts the view if still mounted, destroys the store and natively stops any remaining track. This happens after evaluation, so leaks stay visible. The suite then force-stops every track the page ever acquired. The same happens on `pagehide`.
- **Device activity outside a case** (a `getUserMedia` call, recorder creation or start) makes the overall result FAIL.
- **Maximum run time.** Waiting for recording to start has a 15 s timeout, which covers a permission prompt; the microphone is not open during that wait. The transcript wait has a 5 s timeout, and the microphone is already released by then.

## Privacy

- **Transcription:** `transcribeAudio` is a local stub. It reads only `blob.size` and returns `stub-transcript-<size>-bytes`.
- **No retained audio:** no `Blob` is kept, and both stores use `maxHistorySize: 0`.
- **Timeline contents:** event names, numbers and booleans only. It never includes device IDs, labels or audio.
- **Network blocked:** `fetch`, `XMLHttpRequest.send`, `navigator.sendBeacon` and `WebSocket.send` are blocked and counted for the page's whole lifetime.

## Instrumentation (passive)

- **Wrappers:** the wrappers for `getUserMedia`, `MediaStreamTrack.stop`, `MediaRecorder.start` and `MediaRecorder.stop` call the native method first and record afterwards.
- **Recorder subclass:** the `MediaRecorder` subclass calls the native constructor. It registers its `dataavailable`, `stop` and `error` listeners before the library assigns its own handlers.
- **Recorder lookup:** the library reads the global `MediaRecorder` when it creates a recorder, so the subclass is used.
- **Timing effects:**
  - Nothing is delayed.
  - The only change to timing is one extra promise hop between `getUserMedia` resolving and the library's `await`.
  - Waits use 20 ms polling timers, never store hooks.

## Result semantics

- **BLOCKED:** only when `getUserMedia` rejected with `NotAllowedError`, `NotFoundError`, `NotReadableError` or `SecurityError`, and the case acquired no track. The suite stops and shows the remediation steps. The timeline and assertions are kept.
- **FAIL:** everything else that isn't a pass — timeouts, error states, ordering or count violations, watchdog trips, leaks, forced cleanups, activity outside a case, or a suite exception. Partial evidence is kept.
- **PASS:** every assertion in every requested case passed. `fullSuite` is `true` only for **Run Qualification (All Cases)**. A single-case button produces a subset result, not a qualification.

## Coordinator procedure (CUA, normal Chrome)

1. `npx vite --port 5173` (the coordinator owns the server).
2. Open `http://localhost:5173/real-device.html` in a normally launched Chrome, not an automation-launched one, so that `navigator.webdriver` is false. Allow the microphone for `localhost:5173` in site settings before running, so no prompt interferes with the timing.
3. Click **Run Qualification (All Cases)** once. It finishes in about 8 s.
4. Capture the full `#results-json` text (`data-testid="results-json"`) as the browser evidence.

## Verification gates (static)

```bash
npm run check   # svelte-check
npm run build   # vite build
```

`npm run test` is the packed fake-device vitest. It launches headless Chromium, and it is not microphone evidence.
