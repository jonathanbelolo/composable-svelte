# Media M12 qualified on actual hardware

**PASS — 3 cases, 39 assertions.** Real-device execution completed at 2026-09-26T13:06:07.439Z in normally launched Chrome 152 on macOS, after the user accepted microphone permission. The exact DOM JSON was extracted by the root coordinator without a browser rerun. This lane independently validated its assertions, event timelines, package provenance and archive bytes.

| Case | Microphone open | Native audio blob size | Result |
| --- | ---: | ---: | --- |
| Standalone push-to-talk | 1,251 ms | 19,616 bytes | 13/13 PASS |
| Standalone conversation | 1,210 ms | 18,650 bytes | 13/13 PASS |
| Living managed parent, conversation | 1,243 ms | 19,616 bytes | 13/13 PASS |

Each case proves native recorder.stop returned inactive while dataavailable/onstop were still pending and the store held an active accepted stop. Unmount then dispatched _releaseDevice and ended every track. Native dataavailable and onstop arrived afterwards; one nonempty blob reached the local metadata-only transcription stub and exactly one transcript reached the still-living store. The managed parent retained exactly one draft. Each store settled idle after a 750 ms quiet period.

No recorder restart, microphone reacquisition, live track, watchdog stop, forced cleanup, error, outbound network call or late activity occurred. The browser reported native getUserMedia, MediaRecorder and track.stop, with webdriver false. No microphone audio was saved or transmitted; retained evidence contains event names, counts, byte sizes and assertions only.

## Exact package binding

| Package | Version | SHA-256 |
| --- | --- | --- |
| @composable-svelte/core | 0.13.1 | 30e044e139e831033e06fdf626db979875efa2f7c29d72dece33a21db112d18b |
| @composable-svelte/media | 0.5.0 | c0bfa6528fb6cd3dc68f2769237d3053514f76f79bc5197316b230eb07b78298 |

Execution used R3 paths; both entire archives are byte-identical to the final R4 paths. The npm lock SHA-512 integrities match them. All installed dist files were independently compared to R4: 1,163 Core files and 92 Media files, all equal. Svelte was 5.55.3.

## Evidence and review

- final-real-device-result.json: exact root-extracted DOM result, SHA-256 7e9981b346b66b96f201f2f0a73a09284d90903d8a1936991beeeb34b8e70969.
- final-result-extraction.json: root extraction provenance.
- M12-QUALIFICATION-RECEIPT.json: independently checked summary and decisive sequence indices.
- opus-final-review.json: fresh independent Opus 5.5 verdict ACCEPT TO RUN, validating safe capture bounds and meaningful assertions. It is fixture review, separate from the actual hardware result above.
- r4-byte-equality.json and candidate-provenance.json: package binding receipts.
- initial-permission-attempt.json: earlier permission-wait attempt acquired zero tracks. It was not counted as a recorder failure or a qualification pass.

The harness was authored through the requested Gemini CLI, corrected through the authorized Opus fallback, and then independently accepted by a fresh Opus reviewer. Its final check/build passed with zero Svelte errors/warnings. Only generated package provenance metadata changed after that review.

Coverage is this physical Chrome/macOS run: standalone push-to-talk and conversation plus managed-parent conversation. It is not a cross-browser or universal hardware claim. No main repository files, runtime package source, authentication, Git state or publication were modified by this lane.
