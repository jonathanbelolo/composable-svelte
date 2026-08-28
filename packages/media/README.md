# @composable-svelte/media

Audio player, video embed, and voice input components for Composable Svelte. Built with the Web Audio API and MediaRecorder — no external runtime dependencies.

## Features

- **Audio playback** - Full player with playlist support, shuffle, loop, and seek
- **Video embedding** - Auto-detects YouTube, Vimeo, Twitch, and more
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

Complete player with track info, playlist view, shuffle, and loop controls:

```svelte
<FullAudioPlayer {store} showPlaylist={true} />
```

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
  currentTrackIndex: 0,

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

Shared audio context manager for coordinating playback across components:

This package has **two** audio managers and they are different classes, so
neither owns the bare name. AudioPlayer's wraps an `AudioContext` for playback;
VoiceInput's wraps a `MediaRecorder` for capture:

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

### VideoEmbed

Responsive video embedding with automatic platform detection. Supports YouTube, Vimeo and Twitch.

```svelte
<script lang="ts">
  import { VideoEmbed } from '@composable-svelte/media';
</script>

<!-- Auto-detects platform from URL -->
<VideoEmbed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />

<!-- Vimeo -->
<VideoEmbed url="https://vimeo.com/123456789" aspectRatio="16:9" />

<!-- Twitch -->
<VideoEmbed url="https://www.twitch.tv/videos/123456789" />
```

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `url` | `string` | Video URL (auto-detected platform) |
| `aspectRatio` | `'16:9' \| '4:3' \| '1:1' \| '21:9'` | Aspect ratio (default: `'16:9'`) |
| `autoplay` | `boolean` | Auto-play on load |
| `muted` | `boolean` | Start muted |

**Utilities:**

```typescript
import { detectVideo, extractVideosFromMarkdown, getSupportedPlatforms } from '@composable-svelte/media';

// Detect platform from URL
const info = detectVideo('https://youtube.com/watch?v=abc');
// { platform: 'youtube', id: 'abc', embedUrl: '...' }

// Extract all video URLs from markdown text
const videos = extractVideosFromMarkdown(markdownText);
```

### VoiceInput

Voice recording component with push-to-talk and continuous conversation modes. Built on the MediaRecorder API.

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
    dependencies: {
      transcribeAudio: async (audio: Blob) => sendToSpeechToText(audio),
      getAudioManager: getVoiceInputAudioManager
    }
  });
</script>

<VoiceInput {store} defaultMode="push-to-talk" onTranscript={(text) => console.log(text)} />
```

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

## Testing

```typescript
import { createTestStore } from '@composable-svelte/core/test';
import { audioPlayerReducer, createInitialAudioPlayerState } from '@composable-svelte/media';

const store = createTestStore({
  initialState: createInitialAudioPlayerState({
    tracks: [
      { id: '1', title: 'Test', src: '/test.mp3' }
    ]
  }),
  reducer: audioPlayerReducer,
  dependencies: {}
});

await store.send({ type: 'play' }, (state) => {
  expect(state.isPlaying).toBe(true);
});

await store.send({ type: 'nextTrack' }, (state) => {
  expect(state.currentTrackIndex).toBe(0); // Wraps around with 1 track
});
```

## API Reference

### Components

| Component | Description |
|-----------|-------------|
| `MinimalAudioPlayer` | Compact audio player |
| `FullAudioPlayer` | Full audio player with playlist |
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
| `createAudioPlayerManager(config)` | Create a playback `AudioContext` manager |
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
