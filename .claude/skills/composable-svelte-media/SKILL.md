---
name: composable-svelte-media
description: Audio, video, and voice components for Composable Svelte. Use when implementing audio players, video embeds, or voice input. Covers AudioPlayer (Web Audio API), VideoEmbed (YouTube/Vimeo/Twitch), and VoiceInput (MediaRecorder) from @composable-svelte/media package.
---

# Composable Svelte Media Package

Audio playback, video embedding, and voice input components.

---

## UPGRADE 1 AGENT ENTRY

For an application built with the integrated Upgrade 1 companion packages, begin with the [managed package reference](../../../packages/media/recipes/managed/README.md) and its executable recipe. The same reference is included in the package at `node_modules/@composable-svelte/media/recipes/managed/README.md`; use the installed version's declarations and instructions as the API authority.

Use genuine owned views and the packaged player/voice recipes. Feature retirement and DOM attachment both matter for microphone and player resources. Preserve operation-specific recording/transcription freshness; do not assume disposal alone solves every in-owner request race.

The standalone store and callback examples below describe standalone usage. For an owned application feature, follow the managed recipe rather than copying the standalone setup and adding ad hoc lifetime glue. Candidate qualification and npm publication are separate; verify the installed package version contains this managed surface.

## PACKAGE OVERVIEW

**Package**: `@composable-svelte/media`

**Purpose**: Rich interactive media components for audio, video, and voice.

**Technology Stack**:
- **Web Audio API**: High-performance audio playback
- **MediaRecorder API**: Voice recording and processing
- **Platform Integration**: YouTube, Vimeo and Twitch — exactly what `getSupportedPlatforms()` returns. Dailymotion, Wistia, TikTok, Twitter and a generic fallback have all been claimed here at some point; none has ever existed in the registry.

**Core Components**:
- `AudioPlayer` - Full-featured audio player with playlists
- `VideoEmbed` - Platform-agnostic video embedding
- `VoiceInput` - Voice recording with push-to-talk

**State Management**:
All components follow Composable Architecture patterns with dedicated reducers and type-safe actions.

---

## AUDIO PLAYER

**Purpose**: Full-featured audio player with playlist support, shuffle, loop modes, and visualizations.

### Quick Start

```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    MinimalAudioPlayer,
    FullAudioPlayer,
    audioPlayerReducer,
    createInitialAudioPlayerState
  } from '@composable-svelte/media';

  // Create player store
  const playerStore = createStore({
    initialState: createInitialAudioPlayerState({
      tracks: [
        {
          id: '1',
          title: 'Summer Breeze',
          artist: 'Jazz Ensemble',
          url: '/audio/track1.mp3',
          duration: 245
        },
        {
          id: '2',
          title: 'Midnight Drive',
          artist: 'Synthwave Collective',
          url: '/audio/track2.mp3',
          duration: 312
        }
      ]
    }),
    reducer: audioPlayerReducer,
    dependencies: {}
  });
</script>

<FullAudioPlayer store={playerStore} />
```

### Component Variants

**MinimalAudioPlayer**:
- Compact UI (play/pause, track info, progress bar)
- Best for embedded players
- No playlist UI

**FullAudioPlayer**:
- Complete controls (play/pause, skip, shuffle, loop, volume)
- Playlist view
- Audio visualizer
- Best for dedicated music players

**PlaylistView**:
- Standalone playlist component
- Drag-and-drop reordering
- Track search/filter
- Use with either player variant

### Props

**MinimalAudioPlayer**:
- `playerStore: Store<AudioPlayerState, AudioPlayerAction>` - Player store (required)

**FullAudioPlayer**:
- `playerStore: Store<AudioPlayerState, AudioPlayerAction>` - Player store (required)
- `showVisualizer: boolean` - Show audio visualizer (default: true)
- `showPlaylist: boolean` - Show playlist UI (default: true)

### State Interface

```typescript
interface AudioPlayerState {
  // Playback
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;              // 0-100
  isMuted: boolean;

  // Playlist
  tracks: AudioTrack[];
  currentTrackIndex: number;
  queue: string[];             // Track IDs

  // Modes
  loopMode: 'none' | 'one' | 'all';
  shuffle: boolean;
  shuffleOrder: number[] | null;

  // UI State
  isLoading: boolean;
  isSeeking: boolean;
  error: string | null;

  // Visualizer
  visualizerData: Uint8Array | null;
}

interface AudioTrack {
  id: string;
  title: string;
  artist: string;
  url: string;
  duration: number;
  albumArt?: string;
  album?: string;
}
```

### Actions

```typescript
type AudioPlayerAction =
  // Playback Control
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'togglePlayPause' }
  | { type: 'stop' }
  | { type: 'seek'; time: number }

  // Track Navigation
  | { type: 'nextTrack' }
  | { type: 'previousTrack' }
  | { type: 'selectTrack'; trackIndex: number }

  // Volume
  | { type: 'setVolume'; volume: number }
  | { type: 'toggleMute' }

  // Modes
  | { type: 'toggleShuffle' }
  | { type: 'cycleLoopMode' }
  | { type: 'setLoopMode'; mode: 'none' | 'one' | 'all' }

  // Playlist
  | { type: 'addTrack'; track: AudioTrack }
  | { type: 'removeTrack'; trackId: string }
  | { type: 'clearPlaylist' }

  // Internal Events
  | { type: 'timeUpdate'; time: number }
  | { type: 'trackEnded' }
  | { type: 'loadingStarted' }
  | { type: 'loadingCompleted'; duration: number }
  | { type: 'errorOccurred'; error: string };
```

### Complete Example

```svelte
<script lang="ts">
import { createStore } from '@composable-svelte/core';
import {
  FullAudioPlayer,
  PlaylistView,
  audioPlayerReducer,
  createInitialAudioPlayerState,
  type AudioTrack
} from '@composable-svelte/media';

// Sample tracks
const tracks: AudioTrack[] = [
  {
    id: '1',
    title: 'Cosmic Journey',
    artist: 'Space Orchestra',
    url: '/audio/cosmic.mp3',
    duration: 312,
    albumArt: '/images/cosmic.jpg',
    album: 'Stellar Sounds'
  },
  {
    id: '2',
    title: 'Digital Dreams',
    artist: 'Synthwave Collective',
    url: '/audio/digital.mp3',
    duration: 245,
    albumArt: '/images/digital.jpg',
    album: 'Neon Nights'
  }
];

// Create store
const playerStore = createStore({
  initialState: createInitialAudioPlayerState({
    tracks,
    volume: 75,
    loopMode: 'all'
  }),
  reducer: audioPlayerReducer,
  dependencies: {}
});

// Add tracks dynamically
function addTrackToPlaylist(track: AudioTrack) {
  playerStore.dispatch({ type: 'addTrack', track });
}
</script>

<div class="music-app">
  <FullAudioPlayer
    {playerStore}
    showVisualizer={true}
    showPlaylist={true}
  />

  <!-- Status display -->
  {#if $playerStore.error}
    <div class="error-message">{$playerStore.error}</div>
  {/if}
</div>
```

---

## VIDEO EMBED

**Purpose**: Video embedding for YouTube, Vimeo and Twitch. A URL from anywhere else returns `null` from `detectVideo` and renders nothing.

### Quick Start

```svelte
import { VideoEmbed } from '@composable-svelte/media';

<!-- YouTube video -->
<VideoEmbed
  url="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  aspectRatio="16:9"
/>

<!-- Vimeo video -->
<VideoEmbed
  url="https://vimeo.com/123456789"
  autoplay={false}
/>

<!-- Auto-detect platform -->
<VideoEmbed url={videoUrl} />
```

### Supported Platforms

- **YouTube** (youtube.com, youtu.be)
- **Vimeo** (vimeo.com)
- **Twitch** (twitch.tv — VODs and clips, which embed differently: a VOD is
  `player.twitch.tv/?video=v<id>`, a clip is `clips.twitch.tv/embed?clip=<slug>`.
  `VideoEmbed.kind` records which one was detected.)

**Twitch needs a `parent`** matching the embedding page, and `detectVideo` does
not set one — it cannot know where the result will be rendered, and guessing
`localhost` is what used to break server-rendered pages. `<VideoEmbed>` supplies
it; a caller building URLs directly passes `parent` in `EmbedOptions`.

### Props

Exactly one of `url` or `video` is required — a union, so passing both or
neither is a compile error.

- `url: string` - Video URL; the platform is detected. A URL from no known
  platform renders nothing.
- `video: VideoEmbed` - An already-detected video from `detectVideo()`, for when
  you need the metadata before rendering.
- `aspectRatio: '16:9' | '4:3' | '1:1' | '9:16'` - overrides the platform default
- `autoplay: boolean` - browsers block this unless `muted` is also set
- `muted: boolean` - start muted (default: false)
- `showTitle: boolean` - show `video.title` above the embed (default: false)
- `class: string` - custom CSS class

`controls`, `loop` and `startTime` are **not** props, though this file listed
them. `loop` and `startTime` exist in `EmbedOptions` and reach an embed only
through `buildEmbedUrl`; `controls` exists nowhere. `'21:9'` was listed as an
aspect ratio and is not in the union.

### Utility Functions

```typescript
import {
  detectVideo,
  extractVideosFromMarkdown,
  getPlatformConfig,
  getSupportedPlatforms
} from '@composable-svelte/media';

// Detect platform from URL
const video = detectVideo('https://www.youtube.com/watch?v=abc123');
// Returns a VideoEmbed, or null:
// { url, platform: 'youtube', videoId: 'abc123', aspectRatio: '16:9', embedUrl }

// Extract all videos from markdown
const videos = extractVideosFromMarkdown(markdownText);
// Returns: [{ url, platform: 'youtube', videoId: 'abc123', ... }, ...] in document order

// Get platform configuration
const config = getPlatformConfig('youtube');
// Returns: { name, urlPatterns, extractId, buildEmbedUrl, defaultAspectRatio }

// List all supported platforms
const platforms = getSupportedPlatforms();
// Returns: ['youtube', 'vimeo', 'twitch'] — all of them, not a prefix
```

### Examples

```svelte
<!-- Basic YouTube embed -->
<VideoEmbed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />

<!-- Vimeo with custom aspect ratio -->
<VideoEmbed
  url="https://vimeo.com/123456789"
  aspectRatio="4:3"
/>

<!-- Twitch clip. The detected URL form is twitch.tv/<channel>/clip/<slug>;
     a clips.twitch.tv/<slug> share link is not matched. -->
<VideoEmbed
  url="https://www.twitch.tv/somestreamer/clip/BraveHilariousOtterPeteZaroll"
  autoplay={true}
  muted={true}
/>

<!-- Twitch VOD -->
<VideoEmbed url="https://www.twitch.tv/videos/123456789" />
```

### Markdown Integration

```svelte
<script lang="ts">
import { VideoEmbed, extractVideosFromMarkdown } from '@composable-svelte/media';

const markdown = `
# My Post

Check out this video:
https://www.youtube.com/watch?v=dQw4w9WgXcQ

And this Vimeo:
https://vimeo.com/123456789
`;

const videos = extractVideosFromMarkdown(markdown);
</script>

<!-- Render all detected videos -->
{#each videos as video}
  <VideoEmbed url={video.url} />
{/each}
```

---

## VOICE INPUT

VoiceInput borrows one store per input. The application owns and destroys that store. Use managed execution for FIFO subscriber/effect ordering. Components handle recording UI; effects own the microphone and transcription lifecycle.

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createStore } from '@composable-svelte/core';
  import {
    VoiceInput, voiceInputReducer, createInitialVoiceInputState,
    getVoiceInputAudioManager
  } from '@composable-svelte/media';

  let transcript = $state('');
  const store = createStore({
    initialState: createInitialVoiceInputState(),
    reducer: voiceInputReducer,
    execution: { mode: 'managed' },
    dependencies: {
      getAudioManager: getVoiceInputAudioManager,
      transcribeAudio: async (audio: Blob) => {
        const response = await fetch('/api/transcribe', { method: 'POST', body: audio });
        if (!response.ok) throw new Error('Transcription failed');
        return response.text();
      }
    }
  });
  onDestroy(() => store.destroy());
</script>

<VoiceInput {store} defaultMode="push-to-talk" onTranscript={(text) => transcript = text} />
<p>{transcript}</p>
```

The example's endpoint is application-owned and returns transcript text. Business workflows can record transcripts through their own reducer actions. No client API secret is required by the component.

Required props are `store` and `onTranscript`. Optional props are `defaultMode` (`push-to-talk` or `conversation`), `variant` (`icon`, `button`, or `fab`), `label`, `disabled`, and `class`. `voiceStore`, `showWaveform`, and `showTimer` are not props.

Use `createInitialVoiceInputState()` rather than duplicating its shape. Recording is represented by `status`, errors by `errorMessage`, and duration uses `recordingStartTime`; the state has no `isRecording`, `duration`, `audioUrl`, or `transcript` field. `onTranscript` receives accepted results.

Public interaction actions include `activatePushToTalk`, `startPushToTalkRecording`, `stopPushToTalkRecording`, `cancelPushToTalkRecording`, `activateConversationMode`, `conversationModeToggled` (with `enabled`), `manualSendRequested`, and `deactivateVoiceInput`. Underscore-prefixed actions carry framework generation information and must not be fabricated by applications. Import `VoiceInputAction`, `VoiceInputState`, and `VoiceInputDependencies` for complete contracts.

`transcribeAudio` and `getAudioManager` are required dependencies. Tests can inject `createAudioManager` and `deleteAudioManager` to control microphone acquisition and cleanup. The factory must register the same manager returned by `getAudioManager`; cleanup must remain safe during pending permission acquisition. The framework handles late results and recorder lifetime. Browser capture requires permission and a secure context; test permission rejection as well as success.

---

## AUDIO MANAGER

**Purpose**: Low-level audio management for custom implementations.

### API

```typescript
import {
  createAudioPlayerManager,
  getAudioPlayerManager,
  deleteAudioPlayerManager,
  type AudioPlayerAction,
  type AudioTrack
} from '@composable-svelte/media';

// The manager reports back through one callback; it takes no id.
const onAction = (action: AudioPlayerAction) => console.log(action.type);
const manager = createAudioPlayerManager({ onAction });

const track: AudioTrack = { id: '1', title: 'Track One', url: '/audio/track.mp3' };
manager.loadTrack(track);
manager.pause();
manager.seek(30);
manager.setVolume(0.5);

// Registered managers are addressed by id — get-or-create, so the config
// is required on every call.
const registered = getAudioPlayerManager('my-player', { onAction });
deleteAudioPlayerManager('my-player');
```

---

## COMPONENT SELECTION GUIDE

**When to use each component**:

**AudioPlayer**:
- Music streaming apps
- Podcast players
- Audio courses
- Meditation apps
- Need playlist management

**VideoEmbed**:
- Blog posts with videos
- Video galleries
- Educational content
- Marketing pages
- Platform-agnostic video

**VoiceInput**:
- Voice commands
- Audio messages
- Voice notes
- Transcription apps
- Accessibility features

---

## CROSS-REFERENCES

**Related Skills**:
- **composable-svelte-core**: Store, reducer, Effect system
- **composable-svelte-chat**: StreamingChat (can integrate with VoiceInput)
- **composable-svelte-code**: CodeEditor, syntax highlighting
- **composable-svelte-components**: UI components (Button, Input, etc.)

**When to Use Each Package**:
- **media**: Audio players, video embeds, voice input
- **chat**: Real-time chat, streaming responses
- **code**: Code editors, syntax highlighting, visual programming
- **graphics**: 3D scenes, WebGL rendering
- **charts**: 2D data visualization

---

## TESTING PATTERNS

### AudioPlayer Testing

```typescript
import { TestStore } from '@composable-svelte/core/test';
import { audioPlayerReducer, createInitialAudioPlayerState } from '@composable-svelte/media';

const store = new TestStore({
  initialState: createInitialAudioPlayerState({
    tracks: [
      { id: '1', title: 'Track 1', url: '/audio/1.mp3', duration: 180 }
    ]
  }),
  reducer: audioPlayerReducer,
  dependencies: {}
});

// Test play
await store.send({ type: 'play' }, (state) => {
  expect(state.isPlaying).toBe(true);
});

// Test track change
await store.send({ type: 'nextTrack' }, (state) => {
  expect(state.currentTrackIndex).toBe(1);
});
```

### VoiceInput Testing

Test reducer decisions without opening a microphone. For recording tests, inject the audio-manager lifecycle dependencies described above and await the framework's emitted actions; do not manually dispatch private generation events.

```typescript
import { it, expect } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';
import { voiceInputReducer, createInitialVoiceInputState } from '@composable-svelte/media';

it('selects and clears push-to-talk mode', async () => {
  const store = createTestStore({
    initialState: createInitialVoiceInputState(),
    reducer: voiceInputReducer,
    execution: { mode: 'managed' },
    dependencies: { transcribeAudio: async () => '', getAudioManager: () => undefined }
  });
  try {
    await store.send({ type: 'activatePushToTalk' }, state => {
      expect(state.mode).toBe('push-to-talk');
      expect(state.status).toBe('idle');
    });
    await store.send({ type: 'deactivateVoiceInput' }, state => {
      expect(state.mode).toBeNull();
    });
    await store.finish();
  } finally {
    store.destroy();
  }
});
```

## TROUBLESHOOTING

**AudioPlayer not playing**:
- Check audio URL is accessible
- Verify browser autoplay policy (may require user interaction)
- Ensure audio format is supported (mp3, wav, ogg recommended)

**VideoEmbed not loading**:
- Verify URL format matches platform requirements
- Check platform embed permissions (some require API keys)
- Ensure platform allows embedding (some videos are restricted)

**VoiceInput permission denied**:
- User must grant microphone access
- HTTPS required (except localhost)
- Check browser compatibility (MediaRecorder API)
