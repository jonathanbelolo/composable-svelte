# Independent review — V3 dormant-fallback reclaim correction

**Verdict: V3 closed. No new blocking findings in the assigned correction.** The unchanged failing case now passes in Chromium, Firefox, and WebKit. Independent targeted execution passed **27 checks**: 24 original regression/adjacent controls plus three new activation-order checks. The prior 39 positive checks, V1/V2 closure, and iframe/media gates remain retained; this is not a broad review restart.

Reviewer: independent GPT-6 Astra/high, `/root/media_continuity_review`; original dispatch is recorded in `media-review-dispatch.json`. Completed 2026-09-27 within the 600-second assignment. Product source remained read-only; no product builds, fixes, commits, publication, or account changes.

## Exact candidate and execution

- Frozen `remaining-video-v3-snapshot/manifest.json` SHA-256: `92484ed7deb68277b0a67b9d2fd331def24dd17158e259839beb5021c0ec08c1`.
- `representation/builtins.ts`: `d3a664a9f74c8af2f9201dd34b56cf9300cf34670110de79923f4b07f345d737`.
- `representation/video.ts`: unchanged, `dee0018381a0fbd672c86d676d9e1f279f2b00bc55601017957072ef68114dde`.
- All ten snapshot files were hash-verified before and after execution. The isolated prior correction harness was copied, then overlaid with this snapshot. It retains the preserved final-candidate dependencies and batch1 source described in the [prior review](remaining-video-correction-astra-review.md). No moving product source or core dist was executed.
- The frozen regression file equals the prior independent `astra-video-fallback.browser.test.ts` byte-for-byte after its added attribution header.

[Input provenance](remaining-video-v3-astra-evidence/inputs.json) · [Execution summary](remaining-video-v3-astra-evidence/summary.json)

## Why V3 is closed

The only product delta is in the built-in wrapper. After retirement, dormant fallback frames now forward a connected source to the detached renderer, allowing its existing permanent-reclaim logic to observe that the application took ownership back. Disconnected dormant frames remain suppressed, so merely waiting for the replay error does not mute or resume the source. The error handler makes the same connected-source observation immediately before activation.

The original counterexample still reattaches the real MSE element, delivers a retained frame while the fallback is dormant, removes the reclaimed element again, and then delivers the late replay error. It now leaves the owner's element paused and unmuted in all three engines. The previous candidate failed that same assertion in all three engines; the regression was not relaxed.

The independent added ordering check delivers the error while the reclaimed source is connected, before any retained frame observes it. It then removes the element and delivers a retained frame. No source `play()` call or mute change occurs, and disposal leaves zero resources. This exercises the separate activation-time guard.

## Independent checks

| Scope | Result across three engines |
| --- | --- |
| Unchanged V3 reclaim-while-error-pending reproduction | 3/3 pass |
| Normal late error activates decoded progression with bounded resource ownership | 3/3 pass |
| Error after disposal cannot reacquire, resume, or mute | 3/3 pass |
| Encrypted-first settlement branch allocates no mirror/replay | 3/3 pass |
| Actual public ApplicationHost integration: MediaStream, MSE blob, file blob, unrelated-participant control | 12/12 pass |
| Added error-at-reclaim-before-first-frame ordering | 3/3 pass |

[Targeted run: 24/24](remaining-video-v3-astra-evidence/v3-targeted.log) · [Additional ordering: 3/3](remaining-video-v3-astra-evidence/v3-activation.log) · [Independent added test source](remaining-video-v3-astra-evidence/activation-observation.browser.test.ts)

The public tests retain decoded-pixel progression, actual business removal, muted detached MSE playback, no retired Svelte event authority, live owner stream tracks after cleanup, and independent file-blob replay without fallback. The disposal controls end with zero live media resources. Browser tests used the installed Playwright Chromium, Firefox, and WebKit engines; WebKit evidence is not an actual Safari qualification.

## Retained boundaries

This closes the source-level V3 correction and preserves V1/V2 closure. Final coherent build/integration remains with the parent. Physical audio output was not measured; media assertions use effective mute state. The encrypted-first sentinel tests only its settlement branch, not protected-media playback or pixel access. Prior qualification boundaries and historical reports remain unchanged.
