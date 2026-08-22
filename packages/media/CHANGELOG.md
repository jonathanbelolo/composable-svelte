# Changelog

All notable changes to `@composable-svelte/media` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-08-22

The package's first pass under the "no dead behaviour" rule: nothing a consumer
can pass, configure, click or import may produce no effect. Several items below
were live defects rather than inert surface, so this release is worth taking even
though it breaks types.

### Fixed

- **The voice-input VAD loop leaked a `setInterval` on every escape path.** The
  handle was assigned and never read, and `clearInterval` appeared nowhere in the
  package. After teardown it kept dispatching `silenceDetected` ten times a
  second forever, and its closure pinned the `AudioManager`, its `MediaStream`
  and its `AudioContext` against garbage collection. It is now an
  `Effect.subscription` whose teardown the store owns, cancelled from all four
  exits. `activateConversationMode` also gained an already-active guard, so
  repeated dispatches can no longer stack intervals, and `audioProcessingFailed`
  now resets `vadState` instead of leaving a self-sustaining error loop.
- **Conversation mode never started on first activation.** With
  `defaultMode="conversation"`, `activateConversationMode` returned to request
  permission and nothing re-dispatched it, so the panel rendered "Listening…"
  with no recording, no level monitoring and no VAD running. The permission
  handoff that push-to-talk already had is now written for conversation mode too.
- **Every utterance was transcribed twice**, at two API round-trips and two bills
  each: `autoSendTriggered` transcribed the blob, and the
  `audioProcessingComplete` case it dispatched transcribed the same blob again
  and used the second result. The dispatched transcript is now read.
- **The conversation toggle on `VoiceInputButton` was unreachable** — `mode`
  defaulted to a truthy `'push-to-talk'`, so the store-derived fallback never
  evaluated and the click handler returned at its guard every time.
- **`VoiceInputState.errorMessage` was written five times and rendered by
  nothing.** It now renders in an `role="alert"` region; an error the user cannot
  see was the defect.
- **Three audio-player dependencies were accepted and ignored.** The styleguide
  supplied `loadVolume`, `loadSpeed` and `trackSkip` and got silence — volume and
  speed were saved and never restored. All three are now wired.
- **`VideoEmbed`'s `autoplay` prop did nothing** (its own comment said so). It now
  threads `EmbedOptions` into `buildEmbedUrl`, which also revives `EmbedOptions`
  itself.
- Reducer purity: three call sites invoked `audioManager.stopRecording()` /
  `cleanup()` synchronously in the reducer body, outside any effect.

### Changed

- **BREAKING** — `VideoPlatform` narrowed from seven members to the three the
  extractor can actually produce: `'youtube' | 'vimeo' | 'twitch'`. `'twitter'`,
  `'tiktok'`, `'dailymotion'` and `'generic'` had no registry entry, so no
  extractor could ever return them and no consumer could ever receive one.
  `README.md`'s claim of generic-URL support is corrected with it.
- **BREAKING** — `createAudioManager` is now an injectable member of
  `VoiceInputDependencies`. The reducer previously imported it from the registry
  directly, so the *reading* side of the audio manager was injectable via
  `getAudioManager` while the *creating* side was hard-wired, and no test could
  reach the permission path without a real microphone. Defaults to the registry,
  so existing callers are unaffected at runtime.
- Animation: fifteen CSS-authored transitions removed or split per
  `guides/ANIMATION-GUIDELINES.md`. Pseudo-class transitions are gone; the
  state-driven halves are instant, because anything tracking the user's current
  input position — a drag-over index, a VAD status dot, a push-to-talk recording
  flag that can flip inside 200 ms — must not lag behind it. The three files with
  a Register entry may transition `width` only.

### Removed

- **BREAKING** — `AudioPlayerState.isPaused` and `isStopped`. Written nine times
  between them and read nowhere in this repo.
- **BREAKING** — the live-transcript surface: the `liveTranscriptUpdated` action,
  the `liveTranscript` state field and the panel block reading it. Nothing
  dispatched the action, so the field was always `''` and the "Current:" block
  could never render. Its intended driver, `streamTranscription`, was dead too.
- **BREAKING** — the `cleanupAudioResources` action. No dispatcher anywhere; an
  unreachable reducer case. Its work is now part of the VAD cancellation.
- **BREAKING** — four dependency members that were never called:
  `createAudioElement` and `generateId` from `AudioPlayerDependencies`,
  `streamTranscription` and `synthesizeSpeech` from `VoiceInputDependencies`.
- **BREAKING** — `VideoEmbed.startTime` and `VideoEmbed.title`. Neither extractor
  ever set them. (`EmbedOptions.startTime`, which the YouTube URL builder does
  read, stays.)
- **BREAKING** — `clamp` is no longer exported from `audio-player`. It is a
  three-line numeric helper that was leaking out of a media package through a
  wildcard export.

### Added

- `nextLoopMode` is now exported. It is genuine API and was reachable from
  neither barrel.

### Known limitations

`ConversationModePanel` and `PushToTalkPanel` still author a one-shot `fadeIn`
keyframe in CSS, which the animation policy would otherwise order converted to
Motion One. They are exempted deliberately: both are guarded by
`prefers-reduced-motion`, and this package cannot read that preference in JS yet.
Converting them now would delete working accessibility support. The preference
plumbing is a core-wide change and is tracked there; these two are recorded as
backlog entries in `packages/core/tests/repo/animation-policy.test.ts` with the
reason attached.

## [0.1.4] and earlier

Not recorded. This file starts at 0.2.0.
