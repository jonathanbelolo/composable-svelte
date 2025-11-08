# Audio Player Component Specification

## Overview

A comprehensive audio player component following the Composable Architecture pattern. Supports playback controls, seeking, volume control, speed adjustment, and playlists.

## Core Features

### 1. Playback Controls
- Play/Pause
- Stop
- Previous/Next track (for playlists)
- Skip forward/backward (10s, 30s)
- Loop modes (none, one, all)
- Shuffle

### 2. Progress & Seeking
- Visual progress bar
- Click/drag to seek
- Current time display
- Total duration display
- Buffering progress
- Keyboard shortcuts (arrow keys)

### 3. Volume Control
- Volume slider (0-100%)
- Mute/unmute
- Volume persistence
- Keyboard shortcuts (up/down arrows)

### 4. Playback Speed
- Speed control (0.25x - 2x)
- Common presets (0.5x, 0.75x, 1x, 1.25x, 1.5x, 2x)
- Speed persistence

### 5. Track Information
- Title
- Artist
- Album
- Cover art
- Duration
- File format/quality

### 6. Playlist Support
- Multiple tracks
- Auto-advance to next track
- Drag-to-reorder
- Add/remove tracks
- Playlist persistence

### 7. Visualization (Optional)
- Waveform display
- Frequency bars
- Time markers

## State Structure

```typescript
interface AudioPlayerState {
  // Current track
  currentTrack: AudioTrack | null;

  // Playback state
  isPlaying: boolean;
  isPaused: boolean;
  isStopped: boolean;
  isLoading: boolean;
  isBuffering: boolean;

  // Time
  currentTime: number;  // seconds
  duration: number;     // seconds
  buffered: number;     // seconds

  // Volume
  volume: number;       // 0-1
  isMuted: boolean;
  previousVolume: number; // for unmute

  // Speed
  playbackSpeed: number; // 0.25 - 2.0

  // Progress
  seekPosition: number | null; // while seeking

  // Loop mode
  loopMode: 'none' | 'one' | 'all';

  // Shuffle
  isShuffled: boolean;
  shuffleOrder: number[];

  // Playlist
  playlist: AudioTrack[];
  currentTrackIndex: number;

  // Error
  error: string | null;
}

interface AudioTrack {
  id: string;
  url: string;
  title: string;
  artist?: string;
  album?: string;
  coverArt?: string;
  duration?: number;
  format?: string;
}
```

## Actions

```typescript
type AudioPlayerAction =
  // Playback controls
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'togglePlayPause' }
  | { type: 'stop' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'skipForward'; seconds: number }
  | { type: 'skipBackward'; seconds: number }

  // Seeking
  | { type: 'seekStarted'; position: number }
  | { type: 'seekUpdated'; position: number }
  | { type: 'seekEnded'; position: number }
  | { type: 'seekTo'; time: number }

  // Volume
  | { type: 'volumeChanged'; volume: number }
  | { type: 'toggleMute' }
  | { type: 'volumeUp'; amount?: number }
  | { type: 'volumeDown'; amount?: number }

  // Speed
  | { type: 'speedChanged'; speed: number }

  // Loop & Shuffle
  | { type: 'loopModeChanged'; mode: 'none' | 'one' | 'all' }
  | { type: 'shuffleToggled' }

  // Playlist
  | { type: 'trackSelected'; index: number }
  | { type: 'trackAdded'; track: AudioTrack }
  | { type: 'trackRemoved'; index: number }
  | { type: 'playlistCleared' }
  | { type: 'playlistReordered'; from: number; to: number }

  // Internal events
  | { type: 'audioLoaded'; duration: number }
  | { type: 'timeUpdated'; currentTime: number }
  | { type: 'bufferUpdated'; buffered: number }
  | { type: 'ended' }
  | { type: 'loading' }
  | { type: 'error'; error: string };
```

## Dependencies

```typescript
interface AudioPlayerDependencies {
  // Audio element control
  createAudioElement?: () => HTMLAudioElement;

  // Persistence
  saveVolume?: (volume: number) => void;
  loadVolume?: () => number;
  saveSpeed?: (speed: number) => void;
  loadSpeed?: () => number;

  // Analytics (optional)
  trackPlayback?: (track: AudioTrack) => void;
  trackSkip?: (track: AudioTrack) => void;
}
```

## Component Variants

### 1. MinimalAudioPlayer
- Play/pause button
- Progress bar
- Time display
- Volume control

### 2. StandardAudioPlayer (Default)
- All minimal features
- Previous/next buttons
- Speed control
- Loop/shuffle
- Track info

### 3. FullAudioPlayer
- All standard features
- Playlist view
- Drag-to-reorder
- Waveform visualization
- Advanced controls

## Keyboard Shortcuts

- **Space**: Play/Pause
- **K**: Play/Pause (YouTube-style)
- **Left Arrow**: Skip backward 5s
- **Right Arrow**: Skip forward 5s
- **J**: Skip backward 10s
- **L**: Skip forward 10s
- **Up Arrow**: Volume up 5%
- **Down Arrow**: Volume down 5%
- **M**: Mute/Unmute
- **0-9**: Seek to 0%-90%
- **Home**: Seek to start
- **End**: Seek to end
- **<**: Decrease speed
- **>**: Increase speed

## Accessibility

- Full ARIA labels
- Keyboard navigation
- Screen reader announcements
- Focus indicators
- High contrast support

## Implementation Phases

### Phase 1: Core Player
- State, reducer, dependencies
- Basic playback controls
- Progress bar with seeking
- Time display

### Phase 2: Volume & Speed
- Volume control with slider
- Mute/unmute
- Playback speed control

### Phase 3: Playlist
- Multiple tracks
- Next/previous navigation
- Auto-advance
- Playlist UI

### Phase 4: Advanced Features
- Loop modes
- Shuffle
- Keyboard shortcuts
- Waveform visualization

### Phase 5: Polish
- Animations
- Mobile optimizations
- Touch gestures
- Demo in styleguide
