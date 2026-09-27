# @composable-svelte/media

Audio player, video embed, and voice input components for Composable Svelte. Built with the Web Audio API and MediaRecorder — no external runtime dependencies.

## Features

- **Audio playback** - Full player with playlist support, shuffle, loop, and seek
- **Video embedding** - Auto-detects YouTube, Vimeo and Twitch
- **Voice input** - Push-to-talk and conversation modes via MediaRecorder API
- **State-driven** - Full Composable Architecture integration with testable reducers
- **No external deps** - Built entirely on native Web APIs
- **Responsive** - Configurable aspect ratios and responsive layouts
- **Type-safe** - Full TypeScript support with type inference

## Installation

```bash
pnpm add @composable-svelte/media
```

**Peer dependencies:**

```bash
pnpm add @composable-svelte/core svelte
```

## Components

### AudioPlayer

Full-featured audio player with playlist support. Two variants available.

#### MinimalAudioPlayer

Compact player with play/pause, seek, and volume:

<!-- consumer-file: Audio.svelte -->
```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    MinimalAudioPlayer,
    audioPlayerReducer,
    createInitialAudioPlayerState,
    type AudioTrack
  } from '@composable-svelte/media';

  const tracks: AudioTrack[] = [
    { id: '1', title: 'Track One', url: '/audio/track1.mp3' },
    { id: '2', title: 'Track Two', url: '/audio/track2.mp3' }
  ];

  const store = createStore({
    initialState: createInitialAudioPlayerState({ volume: 0.8 }),
    reducer: audioPlayerReducer,
    dependencies: {}
  });

  // The factory takes preferences; the playlist arrives as an action.
  store.dispatch({ type: 'loadPlaylist', tracks });
</script>

<MinimalAudioPlayer {store} />
```

#### FullAudioPlayer

Complete player with track info, skip, speed, shuffle, loop and expand controls,
plus keyboard shortcuts when its region is focused:

```svelte
<FullAudioPlayer {store} showPlaylistInfo={true} showExpandButton={false} />
```

| Prop | Player | Description |
|------|--------|-------------|
| `store` | both | A standalone `Store`, or the managed feature view (`FeatureViewProps.store`) |
| `id` | both | Optional registry name for the player's manager, captured when it binds |
| `class` | both | Additional CSS class |
| `showVolume` | Minimal | Show the volume slider (default `true`) |
| `showPlaylistInfo` | Full | Show "Track n of m" (default `true`) |
| `showExpandButton` | Full | Show the expand toggle (default `true`) |

Each mounted player owns one `HTMLAudioElement`, created when it binds to a
store and released — paused, source cleared, listeners removed — when it
unmounts, when its managed owner retires, or when its `store` prop changes to
another store. Element events reach only the store the element was created for.

**Unmount before you destroy a standalone store.** A component cannot tell that
a standalone `Store` was destroyed, so a player still mounted on one keeps
playing, and every element event logs `dispatch after destroy ignored`. Unmount
the component first (or render it inside the same `{#if}` that owns the
store), then call `store.destroy()`. This applies to `VoiceInput` too. A managed
view does not need this: when its root is destroyed its state reads `undefined`
and the player releases its element.

#### PlaylistView

Standalone playlist component:

```svelte
<PlaylistView {store} />
```

**State** — shown by building one, so this block fails to compile if the shape
drifts. The previous version listed `tracks`, `shuffle` and `loop`; none exist:

```typescript
import type { AudioPlayerState } from '@composable-svelte/media';

const state: AudioPlayerState = {
  currentTrack: null,

  isPlaying: false,
  isLoading: false,
  isBuffering: false,

  currentTime: 0,
  duration: 0,
  buffered: 0,

  volume: 1,
  isMuted: false,
  previousVolume: 1,

  playbackSpeed: 1,
  seekPosition: null,

  loopMode: 'none',
  isShuffled: false,
  shuffleOrder: [],

  playlist: [],
  currentTrackIndex: -1,

  isExpanded: false,
  error: null
};
```

**Key Actions:** `play`, `pause`, `togglePlayPause`, `stop`, `seekTo`,
`volumeChanged`, `toggleMute`, `next`, `previous`, `shuffleToggled`,
`loopModeChanged`, `trackSelected`, `loadPlaylist`, `speedChanged`.

The previous list named `setVolume`, `nextTrack`, `previousTrack`,
`toggleShuffle`, `setLoop` and `selectTrack` — **none of which exist**. A
`TestStore` would have rejected every one.

#### AudioManager

This package has **two** audio managers and they are different classes, so
neither owns the bare name. AudioPlayer's wraps an `HTMLAudioElement` for
playback; VoiceInput's wraps a `MediaStream`, `AudioContext` and `MediaRecorder`
for capture:

```typescript
import {
  createAudioPlayerManager,
  getAudioPlayerManager,
  createVoiceInputAudioManager,
  getVoiceInputAudioManager,
  type AudioPlayerAction
} from '@composable-svelte/media';

const onAction = (action: AudioPlayerAction) => console.log(action.type);

// AudioPlayer: the config carries the callback, not an id.
const player = createAudioPlayerManager({ onAction });

// Registered by id — get-or-create, so the config is required every time.
const registered = getAudioPlayerManager('player-1', { onAction });

// VoiceInput: addressed by id alone.
createVoiceInputAudioManager('mic-1');
const recorder = getVoiceInputAudioManager('mic-1');
```

Until this was renamed, the un-suffixed `createAudioManager` resolved to the
**VoiceInput** one while being documented here under AudioPlayer. Because both
factories accept a string, the wrong call typechecked and returned an object of
the wrong class — a worse failure than a name that does not resolve.

**Player ids.** A player given an `id` registers its manager under that name,
for lookup. The manager belongs to the player, which alone releases it (on
unmount, owner retirement or a `store` change):

- Players never share a manager. Two mounted players with the same `id` each
  keep their own element, and the name moves to the later one with a console
  warning. Unmounting a player removes the name only while it is still that
  player's, so one player can never silence or dispose another.
- `getAudioPlayerManager(id, config)` on a mounted player's name returns its
  manager **without** applying `config`, and warns once. The player's events
  keep going to its store.
- `deleteAudioPlayerManager(id)` on a mounted player's name removes the name
  and warns. It does not dispose the manager; the player keeps playing.
- A manager you registered yourself with `getAudioPlayerManager(id, config)`
  before mounting a player with that `id` is not adopted. The player creates
  its own element (your `createAudioElement` is not used for it), your manager
  keeps the name, and the player warns that it is not registered under it. To
  look the player up, give it an unused `id`.

### VideoEmbed

Responsive video embedding for YouTube, Vimeo and Twitch — the three platforms
`getSupportedPlatforms()` returns.

<!-- consumer-file: Video.svelte -->
```svelte
<script lang="ts">
  import { VideoEmbed, detectVideo } from '@composable-svelte/media';

  // Pass a URL and let the component detect the platform…
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  // …or detect it yourself, when you need the metadata before rendering.
  const detected = detectVideo('https://vimeo.com/76979871');
</script>

<VideoEmbed {url} />

<VideoEmbed url="https://www.twitch.tv/videos/123456789" aspectRatio="4:3" />

<!-- Muted, because browsers block autoplay with sound. -->
<VideoEmbed {url} autoplay muted />

{#if detected}
  <p>{detected.platform} video {detected.videoId}</p>
  <VideoEmbed video={detected} showTitle />
{/if}
```

This block is [`tests/doc-examples/video-embed.svelte`](https://github.com/jonathanbelolo/composable-svelte/blob/main/packages/media/tests/doc-examples/video-embed.svelte),
quoted verbatim. The file is typechecked by `svelte-check` in the repo gate and a
test asserts this README still matches it — so a prop that does not exist is a
build failure rather than something a reader discovers by pasting.

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `url` | `string` | Video URL; the platform is detected. Mutually exclusive with `video` |
| `video` | `VideoEmbed` | An already-detected video from `detectVideo()`. Mutually exclusive with `url` |
| `aspectRatio` | `'16:9' \| '4:3' \| '1:1' \| '9:16'` | Overrides the platform default |
| `autoplay` | `boolean` | Autoplay on load. Browsers block this unless `muted` is also set |
| `muted` | `boolean` | Start muted |
| `showTitle` | `boolean` | Show the video title above the embed |
| `class` | `string` | Additional CSS class |
| `referrerPolicy` | `ReferrerPolicy` | The iframe's referrer policy, default `'no-referrer'`. YouTube requires a referrer and shows **Error 153** without one ([API Client Identity](https://developers.google.com/youtube/terms/required-minimum-functionality)), so pass `'strict-origin-when-cross-origin'` for YouTube |
| `mediaKey` | `string` | Stable identity for fluid-motion adoption (see below) |
| `mediaScope` | `MediaVisualProvider` | The adoption scope: this application's `mediaVisualProvider()` instance |
| `playerControl` | `'none' \| 'player-api'` | Opt in to the platform's player API so a leaving player can be muted (YouTube: adds `enablejsapi=1` and `origin`) |

Exactly one of `url` or `video` is required, enforced by the type rather than at
runtime. A `url` that matches no known platform renders nothing.

**Twitch** additionally needs a `parent` matching the page it is embedded in.
The component supplies it from the current hostname; `detectVideo` deliberately
does not, because detection cannot know where the result will be rendered.

**Fluid motion (live handoff).** Add the media provider to the application's
visual configuration, and a route transition keeps the *same* player (no reload,
no second player) instead of a frozen copy:

```ts
import { fluidMotion } from '@composable-svelte/core/application/motion';
import { mediaVisualProvider } from '@composable-svelte/media';

export const media = mediaVisualProvider();
// defineApplication(composition, { …, visual: fluidMotion({ providers: [media] }) })
```

When a page holding a `VideoEmbed` retires under a run, its iframe moves
(`Element.prototype.moveBefore`) into the run's inert, `aria-hidden` decoration.
Focus inside the player is released at that moment, and input stays with real
content. What happens next is decided within the same commit:

- **Adoption.** A destination `VideoEmbed` with the same `mediaScope`, the same
  `mediaKey` and the same configuration takes the player over before creating
  its own. Playback, and audio, continue under the new owner, which stays
  reactive to its props. A visual match alone never transfers a player.
- **Leaving only, with `playerControl="player-api"`.** The player is asked to
  mute through its documented API. It stays on screen only once it reports being
  muted, within 250 ms; otherwise it is disposed. (This is the platform's own
  reported state, not a measurement of sound.) Twitch has no documented command
  channel for a bare player, so it is disposed.
- **Leaving only, without it.** It is disposed at once. Decoration never
  prolongs audio.

The adoption scope defaults to the `media` provider the enclosing application
configured (core's `useRepresentationProvider`). An explicit `mediaScope` overrides it.
Outside an application host there is no scope: nothing is claimed.

Within-page removal hands the player off too, when the conditional that removes it
is core's `<Presence when={…}>`. The hand-off happens after the business commit and
before the block is removed. A commit that throws, or changes nothing, moves nothing.

**Documented exception.** Moving the *same* player to a different place in the page
needs a state-preserving move (`Element.prototype.moveBefore`). Browsers without it
(Safari, and the tested Firefox 142) destroy an iframe's document whenever it is
removed or re-inserted, and no compliant way to carry the same player across was
found. There the page and its player stay usable until the commit. Then the player
settles and is disposed, and the destination renders its own. This is reported as
`mediaMoveUnavailable`, never as live continuity. Firefox 144+ documents
`moveBefore` but has not been qualified here.

**Utilities:**

```typescript
import { detectVideo, extractVideosFromMarkdown, getSupportedPlatforms } from '@composable-svelte/media';

// Detect platform from URL
const info = detectVideo('https://youtube.com/watch?v=abc');
// { url, platform: 'youtube', videoId: 'abc', aspectRatio: '16:9', embedUrl: '...' }

// Extract all video URLs from markdown text
const videos = extractVideosFromMarkdown(markdownText);
```

### VoiceInput

Voice recording component with push-to-talk and continuous conversation modes. Built on the MediaRecorder API.

Voice input uses managed execution so subscriber-triggered actions run in FIFO order with effect installation. `VoiceInput` borrows the supplied store; it does not replace its execution policy. Legacy execution retains immediate subscriber reentrancy and does not provide this ordering guarantee. Future application assembly should carry this configuration centrally.

<!-- consumer-file: Voice.svelte -->
```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    VoiceInput,
    voiceInputReducer,
    createInitialVoiceInputState,
    getVoiceInputAudioManager
  } from '@composable-svelte/media';

  const store = createStore({
    initialState: createInitialVoiceInputState(),
    reducer: voiceInputReducer,
    execution: { mode: 'managed' },
    dependencies: {
      transcribeAudio: async (audio: Blob) => {
        // Your application supplies this endpoint and its authentication.
        const response = await fetch('/api/transcribe', { method: 'POST', body: audio });
        if (!response.ok) throw new Error('Transcription failed');
        return response.text();
      },
      getAudioManager: getVoiceInputAudioManager
    }
  });
</script>

<VoiceInput {store} defaultMode="push-to-talk" onTranscript={(text) => console.log(text)} />
```

**The microphone belongs to the store.** The reducer acquires it, and releases
it through the dependencies the store was configured with — an injected
`deleteAudioManager` when you supply a registry, the built-in registry
otherwise. Unmounting `VoiceInput` releases the microphone through the store:

- The microphone, the level meter and the voice-activity loop are released at
  once. A pending permission prompt is cancelled and a late grant is disposed.
  A recording nobody stopped is discarded, as `deactivateVoiceInput` does.
- An utterance the user already finished (push-to-talk released, or a
  conversation segment already sent, even while its stop is still settling)
  is still transcribed, and the recorder is not restarted. Its
  `transcriptionCompleted` reaches the store — a parent reducer, or
  `subscribeToActions` — exactly once, and the store returns to `idle`.
  `onTranscript` belongs to the unmounted component and is not called.
- Destroying the store, or retiring a managed owner, cancels everything,
  including that transcription.

`onTranscript` is called once per accepted transcript. It is optional: under
managed composition the application's parent reducer should own the result
(see [Managed applications](#managed-applications)).

**Modes:**

| Mode | Behavior |
|------|----------|
| `push-to-talk` | Records while button is held, stops on release |
| `conversation` | Toggle recording on/off with a button tap |

**State:**

```typescript
import type { VoiceInputState } from '@composable-svelte/media';

const state: VoiceInputState = {
  mode: 'push-to-talk',
  status: 'idle',
  permission: null,
  audioLevel: 0,
  recordingStartTime: null,
  vadState: null,
  errorMessage: null,
  _audioManagerId: null
};
```

Recording is a `status`, not a boolean, and duration is derived from
`recordingStartTime`. The previous version documented `isRecording`, `duration`,
`audioBlob` and `audioUrl` — none of which exist.

**Key Actions:** `activatePushToTalk`, `startPushToTalkRecording`,
`stopPushToTalkRecording`, `cancelPushToTalkRecording`,
`activateConversationMode`, `conversationModeToggled`,
`requestMicrophonePermission`, `microphonePermissionGranted`,
`microphonePermissionDenied`, `speechDetected`, `silenceDetected`,
`autoSendTriggered`, `manualSendRequested`, `transcriptionCompleted`,
`audioProcessingComplete`, `audioProcessingFailed`, `deactivateVoiceInput`.

The previous list named `startRecording`, `stopRecording`,
`recordingCompleted`, `recordingFailed` and `clearRecording` — none exist.

## Managed applications

Every store-taking component — `MinimalAudioPlayer`, `FullAudioPlayer`,
`PlaylistView` and `VoiceInput` — accepts either a standalone `Store` or the
managed `ChildView` a feature view receives from `@composable-svelte/core/application`
(`FeatureViewProps.store`, `composition.bind`, typed `scopeTo`). Pass the view
you were given, unchanged. `VideoEmbed` takes plain props and needs no store.

- **Retirement.** A managed view's state becomes `undefined` when its owner is
  removed or replaced. The component then renders nothing and releases its
  native resource: a player pauses and releases its element, and the voice
  owner's microphone, loops and transcriptions are released with the owner.
  Rendered through `FeatureOutlet`, the component is also unmounted; a view you
  bind by hand and render yourself still behaves correctly. A replacement owner
  is a new view: bind it again and pass it (the component rebinds to the new
  `store`), or render through `FeatureOutlet`, which does this for you.
- **Business results go through the parent reducer.** Children reduce first, so
  a parent sees the child's own `transcriptionCompleted` and can keep the
  transcript as application state. `onTranscript` still works on both paths,
  for the component's own output; the conversation panel's history is component
  state and does not survive a remount.
- **Requirements.** The managed path needs the `@composable-svelte/core` release
  that exports `isManagedChildView` and `observeChildActions` from
  `@composable-svelte/core/application`, and the app and this package must
  resolve one copy of core. A value that is neither a store with
  `subscribeToActions` nor a genuine managed view (a wrapper or copy of a view,
  an `ApplicationStore`, a view from a second copy of core) still renders and
  dispatches, but `onTranscript` cannot fire; `VoiceInput` warns once.

Voice input whose transcripts become application state:

```svelte
<script lang="ts">
  import { Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
  import {
    ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet,
    ManagedIntegrationBuilder, optionalSlot, defineApplication, defineViews,
    type FeatureViewProps
  } from '@composable-svelte/core/application';
  import {
    VoiceInput,
    voiceInputReducer,
    createInitialVoiceInputState,
    type VoiceInputAction,
    type VoiceInputDependencies,
    type VoiceInputState
  } from '@composable-svelte/media';

  // The same dependencies as the standalone example above.
  let { dependencies }: { dependencies: VoiceInputDependencies } = $props();

  type Composer = { voice: VoiceInputState | null; drafts: string[] };
  type ComposerAction =
    | { type: 'voice'; action: PresentationAction<VoiceInputAction> }
    | { type: 'dictate' }
    | { type: 'stopDictating' };

  // Children reduce first, so the parent sees each accepted transcript once, as
  // the child's own `transcriptionCompleted`, and keeps it as business state.
  const composer: Reducer<Composer, ComposerAction, VoiceInputDependencies> = (state, action) => {
    switch (action.type) {
      case 'dictate':
        return [{ ...state, voice: state.voice ?? createInitialVoiceInputState() }, Effect.none()];
      case 'stopDictating':
        // Retiring the slot releases the microphone and cancels its transcriptions.
        return [{ ...state, voice: null }, Effect.none()];
      case 'voice': {
        const child = action.action;
        if (child.type === 'presented' && child.action.type === 'transcriptionCompleted') {
          return [{ ...state, drafts: [...state.drafts, child.action.transcript] }, Effect.none()];
        }
        return [state, Effect.none()];
      }
    }
  };

  const voiceSlot = optionalSlot<Composer, ComposerAction>()('voice');
  const composition = new ManagedIntegrationBuilder(composer).with(voiceSlot, voiceInputReducer).build();
  const application = defineApplication(composition, {
    initialState: (_input: undefined): Composer => ({ voice: null, drafts: [] })
  });
  const views = defineViews(composition, { voice: { content: voiceView } });
</script>

{#snippet voiceView({ store }: FeatureViewProps<VoiceInputState, VoiceInputAction>)}
  <VoiceInput {store} defaultMode="push-to-talk" />
{/snippet}

<ApplicationRoot definition={application} options={{ dependencies, initial: { input: undefined } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} definition={views}>
        {#snippet children(outlets)}
          <FeatureOutlet view={outlets.voice} />
          {#if app.store.state.voice}
            <button onclick={() => app.store.dispatch({ type: 'stopDictating' })}>Stop dictating</button>
          {:else}
            <button onclick={() => app.store.dispatch({ type: 'dictate' })}>Dictate</button>
          {/if}
          <ul>
            {#each app.store.state.drafts as draft, index (index)}
              <li>{draft}</li>
            {/each}
          </ul>
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
```

An audio player in an optional slot:

```svelte
<script lang="ts">
  import { Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
  import {
    ApplicationRoot, ApplicationHost, FeatureViews, FeatureOutlet,
    ManagedIntegrationBuilder, optionalSlot, defineApplication, defineViews,
    type FeatureViewProps
  } from '@composable-svelte/core/application';
  import {
    MinimalAudioPlayer,
    audioPlayerReducer,
    createInitialAudioPlayerState,
    type AudioPlayerAction,
    type AudioPlayerDependencies,
    type AudioPlayerState,
    type AudioTrack
  } from '@composable-svelte/media';

  type Episode = { player: AudioPlayerState | null };
  type EpisodeAction =
    | { type: 'player'; action: PresentationAction<AudioPlayerAction> }
    | { type: 'listen'; track: AudioTrack }
    | { type: 'close' };

  const episode: Reducer<Episode, EpisodeAction, AudioPlayerDependencies> = (state, action) => {
    switch (action.type) {
      case 'listen': {
        const player = createInitialAudioPlayerState({ volume: 0.8 });
        return [
          { player: { ...player, playlist: [action.track], currentTrack: action.track, currentTrackIndex: 0 } },
          Effect.none()
        ];
      }
      case 'close':
        // Retiring the slot pauses and releases the player's audio element.
        return [{ player: null }, Effect.none()];
      default:
        return [state, Effect.none()];
    }
  };

  const playerSlot = optionalSlot<Episode, EpisodeAction>()('player');
  const composition = new ManagedIntegrationBuilder(episode).with(playerSlot, audioPlayerReducer).build();
  const application = defineApplication(composition, {
    initialState: (_input: undefined): Episode => ({ player: null })
  });
  const views = defineViews(composition, { player: { content: playerView } });
  const track: AudioTrack = { id: '1', title: 'Episode One', url: '/audio/episode1.mp3' };
</script>

{#snippet playerView({ store }: FeatureViewProps<AudioPlayerState, AudioPlayerAction>)}
  <MinimalAudioPlayer {store} />
{/snippet}

<ApplicationRoot definition={application} options={{ dependencies: {}, initial: { input: undefined } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <FeatureViews store={app.store} definition={views}>
        {#snippet children(outlets)}
          <FeatureOutlet view={outlets.player} />
          {#if app.store.state.player}
            <button onclick={() => app.store.dispatch({ type: 'close' })}>Close player</button>
          {:else}
            <button onclick={() => app.store.dispatch({ type: 'listen', track })}>Listen</button>
          {/if}
        {/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
```

## Testing

The npm archive includes a [runnable managed recipe](./recipes/managed/README.md)
and deterministic player and voice ownership tests.

<!-- consumer-file: media.test.ts -->
```typescript
import { it, expect } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';
import { audioPlayerReducer, createInitialAudioPlayerState } from '@composable-svelte/media';

it('loads a playlist and plays its first track', async () => {
  const store = createTestStore({
    initialState: createInitialAudioPlayerState(),
    reducer: audioPlayerReducer,
    dependencies: {}
  });
  await store.send({ type: 'loadPlaylist', tracks: [
    { id: '1', title: 'Test', url: '/test.mp3' }
  ] });
  await store.send({ type: 'play' }, state => {
    expect(state.isPlaying).toBe(true);
  });
  await store.send({ type: 'next' }, state => {
    expect(state.currentTrackIndex).toBe(0);
  });
  await store.finish();
});
```

## API Reference

### Components

| Component | Description |
|-----------|-------------|
| `MinimalAudioPlayer` | Compact audio player |
| `FullAudioPlayer` | Full audio player with advanced controls |
| `PlaylistView` | Standalone playlist display |
| `VideoEmbed` | Responsive video embedding |
| `VoiceInput` | Voice recording input |

### Functions

| Function | Description |
|----------|-------------|
| `audioPlayerReducer` | Reducer for audio playback |
| `voiceInputReducer` | Reducer for voice input |
| `createInitialAudioPlayerState()` | Create initial audio state |
| `createInitialVoiceInputState()` | Create initial voice state |
| `createAudioPlayerManager(config)` | Create a playback manager around an `HTMLAudioElement` |
| `getAudioPlayerManager(id, config)` | Get-or-create a registered playback manager |
| `createVoiceInputAudioManager(id)` | Create a `MediaRecorder` capture manager |
| `getVoiceInputAudioManager(id)` | Retrieve a capture manager by id |
| `deleteAudioPlayerManager(id)` | Destroy a registered playback manager |
| `deleteVoiceInputAudioManager(id)` | Destroy a registered capture manager |
| `detectVideo(url)` | Detect video platform from URL |
| `extractVideosFromMarkdown(text)` | Find video URLs in markdown |
| `getSupportedPlatforms()` | List supported video platforms |
| `getPlatformConfig(platform)` | Get embed config for a platform |

## Dependencies

- **Runtime**: None (uses native Web Audio API and MediaRecorder API)
- **Peer**: `@composable-svelte/core`, `svelte`
