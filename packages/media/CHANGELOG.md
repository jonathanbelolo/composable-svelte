# Changelog

All notable changes to `@composable-svelte/media` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Components follow core's theme.** Every colour the theme should own now
  reads `hsl(var(--token, <the colour it was>))` — the fallback keeps today's
  appearance for an app that does not import core's stylesheet, while one that
  does now restyles these components with the rest of the UI. Neutral scrims,
  success greens and decorative gradients are deliberately unchanged.

- **BREAKING (types): every optional prop now accepts `undefined`.** Under
  `exactOptionalPropertyTypes` a prop read from `$props()` is `T | undefined`
  and cannot land on a bare `T?`, so the audio, video and voice components could
  not be wrapped by a consumer forwarding its own props. See
  `@composable-svelte/core`'s entry for the full account.

### Added

- **`headingLevel` on `ConversationModePanel`**, defaulting to the `<h3>` it
  already rendered.

## [0.3.0] - 2026-08-23

### Added

- Explicit exports for `./audio-player`, `./video-embed` and `./voice-input`.
  All three had an `index.js` in `dist` and no entry, so the wildcard `"./*"`
  resolved them to `dist/audio-player.js` and siblings — files that have never
  existed.

### Fixed

- `video-embed`'s own usage example imported from
  `@composable-svelte/code/video-embed`. Wrong package: `code` is the
  syntax-highlighting one, and that subpath does not exist. A reader following
  the example got a resolution failure.

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
  `Effect.subscription` whose teardown the store owns, cancelled from every exit.
  The level meter moved into a subscription of its own for the same reason — it
  had the same defect in a second place, reachable from both modes.
  `activateConversationMode` also gained an already-active guard, so repeated
  dispatches can no longer stack a recorder or a level meter, and
  `audioProcessingFailed` now resets `vadState` instead of leaving a
  self-sustaining error loop. The batch that starts a session installs its
  subscriptions before starting the recorder, because `Effect.batch` runs
  synchronously and a throwing `startRecording` dispatched its failure — and its
  cancellation — re-entrantly, before there was anything to cancel.
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
  defaulted to a truthy `'push-to-talk'`, so `mode || …` short-circuited on the
  default and the store-derived fallback never evaluated. The click handler
  returned at its guard every time, and `VoiceInput` never passed `mode` either.
  Worse than inert: with the interaction mode pinned, clicking the button during
  a live conversation fell through to the pointer handler and started a
  push-to-talk recording *over* the session instead of ending it. The default is
  now absent, so the store fallback works.
- **Conversation mode ended itself after one sentence, and kept the microphone.**
  `audioProcessingComplete` was written for push-to-talk, where finishing an
  utterance ends the session; conversation mode's auto-send was later routed
  through the same case, and that effect has already *restarted* the recorder
  before dispatching it. So one sentence in, the state said idle and unmoded
  while the microphone was live: the panel unmounted along with the only
  reachable Stop button, the transcript history was wiped, and the VAD loop kept
  reaching the auto-send threshold — one transcription round-trip and one API
  bill every 1.5 seconds, invisible and unstoppable. The case now distinguishes a
  continuing session from a finished one.
- **A stale error alert never cleared on any push-to-talk path.** `errorMessage`
  had exactly one clearing site, in an action only the conversation panel and the
  dead toggle could dispatch. One failed transcription left the alert on screen
  for the rest of the session, through every later success. Starting a new
  recording and completing one both clear it now.
- **Restored preferences were not validated.** Speed was not clamped despite the
  comment saying it was, so a tampered value reached `playbackRate` and threw;
  `NaN` propagated through `clamp` into `audio.volume` and threw a `TypeError`
  inside the effect that also drives loading, play/pause and seeking, bricking
  the player for the session from one corrupt storage key; a throwing loader
  (`localStorage` throws `SecurityError` in a sandboxed iframe) discarded the
  *other* preference too; and a restored `0` left `isMuted` false, so the first
  speaker click muted an already-silent player.
- **`VideoEmbed`'s autoplay rebuilt the URL from scratch**, discarding a
  caller-supplied `embedUrl` — a nocookie host, a start offset, `rel=0` — so
  toggling one boolean changed four things, and Twitch's `parent` parameter
  recomputed at render time and disagreed between server and client. Autoplay is
  applied to the supplied URL now.
- The audio-manager id was `voice-input-${Date.now()}`. Two requests in the same
  millisecond — reachable, and guaranteed for two components mounting in one tick
  — collided, orphaning an `AudioManager` holding a live `MediaStream` that
  nothing could reach to clean up, and letting one unmount kill another's
  microphone.
- The VAD loop hardcoded its own period in the reducer instead of using the one
  the action reports. Browsers throttle background-tab timers to a second or
  more, so a backgrounded conversation accrued 100 ms of "silence" per real
  second and its 1.5 s threshold became 15 s.
- **`VoiceInputState.errorMessage` was written five times and rendered by
  nothing.** It now renders in an `role="alert"` region; an error the user cannot
  see was the defect.
- **Three audio-player dependencies were accepted and ignored.** The styleguide
  supplied `loadVolume`, `loadSpeed` and `trackSkip` and got silence — volume and
  speed were saved and never restored. All three are now wired.
- **`VideoEmbed`'s `autoplay` prop did nothing** (its own comment said so). It now
  threads `EmbedOptions` into `buildEmbedUrl`, which also revives `EmbedOptions`
  itself.
- Reducer purity: four call sites invoked `audioManager.stopRecording()` /
  `cleanup()` synchronously in the reducer body, outside any effect. (Cancelling
  a push-to-talk recording also released the microphone outright, so the next
  press re-prompted for permission; it stops the recorder now and leaves the
  device alone.)

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
  flag that can flip inside 200 ms — must not lag behind it. Four files hold an
  Exception Register entry: three may transition `width`, and `AudioVisualizer`
  may transition `height` and `transform`. Its `opacity` transition is gone —
  the infinite `barPulse` keyframe already owned that property, and one property
  may have only one author.

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
- **BREAKING** — `VideoEmbed.startTime`. Neither extractor ever set it.
  (`EmbedOptions.startTime`, which the YouTube URL builder does read, stays, and
  so does `VideoEmbed.title` — the component renders it, so a consumer building
  the type by hand can still use it.)
- `clamp` is no longer exported from the `audio-player` barrel — a three-line
  numeric helper does not belong in a media library's API. Not marked breaking:
  the package's wildcard `exports` map still exposes every built file, so a deep
  import of `@composable-svelte/media/audio-player/types.js` reaches it exactly
  as before. The barrel is the documented surface; the wildcard is not.

  **Superseded.** The wildcard was removed when this package's export map was
  narrowed to its four entry points, so that deep import no longer resolves and
  `clamp` is genuinely unreachable. The reasoning above was sound when written
  and the escape hatch it relied on is gone; the narrowing commit carries the
  breaking marker for both.

### Added

- `nextLoopMode` is now exported from both the root barrel and `audio-player`.
  It is genuine API and was reachable from neither.

### Cross-package

- `@composable-svelte/chat` declares its own structural copy of `VideoEmbed`
  rather than importing the type, because a type-only import of an optional peer
  lands in the emitted `.d.ts`. That copy still declared `startTime` after this
  release removed it; it is updated here. The conformance guard that exists to
  catch exactly this drift was vacuous — it asserted an empty array literal
  against a key union, which compiles whatever the union is — and now fails to
  compile instead.
- `chat`'s optional peer range on media is widened to `^0.1.0 || ^0.2.0`.

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
