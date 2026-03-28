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
    createInitialAudioPlayerState
  } from '@composable-svelte/media';

  const store = createStore({
    initialState: createInitialAudioPlayerState({
      tracks: [
        { id: '1', title: 'Track One', src: '/audio/track1.mp3' },
        { id: '2', title: 'Track Two', src: '/audio/track2.mp3' }
      ]
    }),
    reducer: audioPlayerReducer,
    dependencies: {}
  });
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

**State:**

```typescript
interface AudioPlayerState {
  tracks: AudioTrack[];
  currentTrackIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  loop: 'none' | 'one' | 'all';
  error: string | null;
}
```

**Key Actions:** `play`, `pause`, `togglePlayPause`, `seekTo`, `setVolume`, `toggleMute`, `nextTrack`, `previousTrack`, `toggleShuffle`, `setLoop`, `selectTrack`

#### AudioManager

Shared audio context manager for coordinating playback across components:

```typescript
import { createAudioManager, getAudioManager } from '@composable-svelte/media';

// Create a named audio manager
createAudioManager('player-1');

// Retrieve it elsewhere
const manager = getAudioManager('player-1');
```

### VideoEmbed

Responsive video embedding with automatic platform detection. Supports YouTube, Vimeo, Twitch, and generic video URLs.

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
    createInitialVoiceInputState
  } from '@composable-svelte/media';

  const store = createStore({
    initialState: createInitialVoiceInputState(),
    reducer: voiceInputReducer,
    dependencies: {}
  });
</script>

<VoiceInput {store} mode="push-to-talk" />
```

**Modes:**

| Mode | Behavior |
|------|----------|
| `push-to-talk` | Records while button is held, stops on release |
| `conversation` | Toggle recording on/off with a button tap |

**State:**

```typescript
interface VoiceInputState {
  isRecording: boolean;
  duration: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
  mode: 'push-to-talk' | 'conversation';
}
```

**Key Actions:** `startRecording`, `stopRecording`, `recordingCompleted`, `recordingFailed`, `clearRecording`

## Testing

```typescript
import { createTestStore } from '@composable-svelte/core';
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
| `createAudioManager(id)` | Create a named AudioManager |
| `getAudioManager(id)` | Retrieve an AudioManager by ID |
| `deleteAudioManager(id)` | Destroy an AudioManager |
| `detectVideo(url)` | Detect video platform from URL |
| `extractVideosFromMarkdown(text)` | Find video URLs in markdown |
| `getSupportedPlatforms()` | List supported video platforms |
| `getPlatformConfig(platform)` | Get embed config for a platform |

## Dependencies

- **Runtime**: None (uses native Web Audio API and MediaRecorder API)
- **Peer**: `@composable-svelte/core`, `svelte`
