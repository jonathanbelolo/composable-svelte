# Voice Input Component Specification

## Overview

This document specifies the design and implementation of a **standalone, reusable VoiceInput component**. This component handles audio capture, recording, and transcription through a backend API. It can be used in any context - chat interfaces, forms, voice notes, voice commands, etc.

**This is NOT integrated into StreamingChat** - it's a separate component that StreamingChat (or any other component) can use via composition.

**Target Features:**
- Push-to-talk: Hold button to record, release to send
- Conversation mode: Continuous hands-free interaction with voice activity detection
- Real-time audio visualization and feedback
- Microphone permission management
- Cross-platform support (desktop + mobile)

## Architecture Principles

**Frontend Responsibilities:**
- Microphone access and permission management (Web Audio API)
- Audio capture and recording (MediaRecorder)
- Real-time audio level visualization (AnalyserNode)
- Voice Activity Detection (VAD) for conversation mode
- Audio blob creation and transmission to backend

**Backend Responsibilities (Dependency):**
- Speech-to-text transcription (Whisper API or similar)
- Optional: Live streaming transcription (WebSocket/SSE)
- Optional: Text-to-speech synthesis

**Key Principle:** Following Composable Architecture patterns, the transcription implementation is injected as a dependency. The frontend only handles audio capture and management - it knows nothing about Whisper, OpenAI, or any specific transcription service. This keeps the component pure and testable.

### What the Frontend Does (This Component)

✅ **Audio Capture:**
- Request microphone permissions
- Capture audio stream via `getUserMedia()`
- Record audio using `MediaRecorder` API
- Create audio blobs (webm/opus format)

✅ **Audio Analysis:**
- Real-time audio level visualization (waveform/bars)
- Voice Activity Detection (VAD) - detect when user is speaking
- Silence detection - detect pauses in conversation mode

✅ **UI/UX:**
- Push-to-talk button (press & hold)
- Conversation mode toggle (continuous listening)
- Recording timer and cancel functionality
- Audio visualization feedback
- Permission request UI

✅ **State Management:**
- Recording state (idle, recording, processing)
- Permission state (granted, denied)
- Audio levels for visualization
- VAD state (speaking, silence duration)

### What the Frontend Does NOT Do

❌ **No Speech Recognition:**
- Does NOT use browser `SpeechRecognition` API
- Does NOT call Whisper/OpenAI APIs directly
- Does NOT process audio locally for transcription

❌ **No Audio Storage:**
- Does NOT store audio in localStorage/IndexedDB
- Does NOT cache recordings client-side

### What the Backend Does (Dependency)

The backend is completely separate and injected as a dependency:

🔧 **Transcription Service:**
- Receives audio blob from frontend
- Calls Whisper API (or alternative STT service)
- Returns transcript text
- Optional: Streams partial transcripts via WebSocket

🔧 **Security & Auth:**
- Manages API keys (never exposed to frontend)
- Authenticates requests
- Rate limiting and abuse prevention
- Audio processing and cleanup

## Use Cases

### Push-to-Talk Mode
**Best for:** Quick voice messages, noisy environments, precise control

- User presses and holds a button (or key) to start recording
- Audio is captured while button is held
- Release button to stop recording and automatically send
- Visual feedback shows recording state and audio levels
- Optional: Cancel recording with escape key or swipe gesture

**User Flow:**
1. User presses microphone button
2. Permission prompt (first time only)
3. Recording indicator appears with audio visualization
4. User speaks while holding button
5. User releases button → audio transcribed & sent to chat
6. Alternative: User presses cancel or ESC → recording discarded

### Conversation Mode
**Best for:** Extended interactions, hands-free usage, natural dialogue

- Toggle on/off with a button click
- Continuous listening with voice activity detection (VAD) - frontend only
- Automatic speech segmentation (pause detection) - frontend only
- Optional: Real-time transcription display (requires backend streaming support)
- User can interrupt or manually send

**User Flow:**
1. User clicks conversation mode toggle
2. Permission prompt (first time only)
3. Continuous listening starts (always-on indicator)
4. Frontend VAD detects speech → starts recording segment
5. User speaks → audio captured (optional: backend streams live transcript via WebSocket)
6. User pauses → frontend detects silence → auto-sends audio to backend after delay
7. Backend transcribes audio (Whisper) → returns transcript → appears in chat
8. Alternative: User manually clicks send
9. User clicks toggle off to exit mode

**Note:** All voice activity detection (VAD) and silence detection happens in the frontend using Web Audio API. Only the audio blob is sent to backend for transcription.

## State Management

### Voice Input State

```typescript
interface VoiceInputState {
	/** Current recording mode */
	mode: 'push-to-talk' | 'conversation' | null;

	/** Recording status */
	status: 'idle' | 'requesting-permission' | 'ready' | 'recording' | 'processing' | 'error';

	/** Microphone permission state */
	permission: 'prompt' | 'granted' | 'denied' | null;

	/** Current audio level (0-100) for visualization */
	audioLevel: number;

	/** Live transcription text (conversation mode) */
	liveTranscript: string;

	/** Recording start time (for duration display) */
	recordingStartTime: number | null;

	/** Voice Activity Detection state (conversation mode) */
	vadState: {
		/** Is speech currently detected? */
		isSpeaking: boolean;
		/** Time since last speech ended (ms) */
		silenceDuration: number;
		/** Auto-send threshold (ms) */
		autoSendThreshold: number;
	} | null;

	/** Error message if status is 'error' */
	errorMessage: string | null;

	/** Audio manager instance ID (to lookup in WeakMap) */
	_audioManagerId: string | null;
}
```

### Initial State

```typescript
const initialVoiceInputState: VoiceInputState = {
	mode: null,
	status: 'idle',
	permission: null,
	audioLevel: 0,
	liveTranscript: '',
	recordingStartTime: null,
	vadState: null,
	errorMessage: null,
	_audioManagerId: null
};
```

## Action Types

### Voice Input Actions

```typescript
type VoiceInputAction =
	// Mode activation
	| { type: 'activatePushToTalk' }
	| { type: 'activateConversationMode' }
	| { type: 'deactivateVoiceInput' }

	// Push-to-talk actions
	| { type: 'startPushToTalkRecording' }
	| { type: 'stopPushToTalkRecording' }
	| { type: 'cancelPushToTalkRecording' }

	// Conversation mode actions
	| { type: 'conversationModeToggled'; enabled: boolean }
	| { type: 'speechDetected' }
	| { type: 'silenceDetected'; duration: number }
	| { type: 'autoSendTriggered' }
	| { type: 'manualSendRequested' }

	// Permission & initialization
	| { type: 'requestMicrophonePermission' }
	| { type: 'microphonePermissionGranted'; stream: MediaStream }
	| { type: 'microphonePermissionDenied'; error: string }

	// Audio processing
	| { type: 'audioLevelUpdated'; level: number }
	| { type: 'liveTranscriptUpdated'; text: string }
	| { type: 'audioProcessingComplete'; audioBlob: Blob; transcript: string }
	| { type: 'audioProcessingFailed'; error: string }
	| { type: 'transcriptionCompleted'; transcript: string }

	// Cleanup
	| { type: 'cleanupAudioResources' };
```

## Component Architecture

### Standalone VoiceInput Component

The VoiceInput component is **completely standalone** with its own state, reducer, and actions. It can be used anywhere:

```
VoiceInput (Standalone Component)
├── VoiceInputButton (trigger)
├── VoiceInputPanel (modal/overlay when recording)
│   ├── PushToTalkPanel
│   │   ├── RecordingIndicator
│   │   ├── AudioVisualizer
│   │   ├── RecordingTimer
│   │   └── CancelButton
│   └── ConversationModePanel
│       ├── ActiveIndicator (always-on)
│       ├── AudioVisualizer
│       ├── LiveTranscript
│       ├── ManualSendButton
│       └── EndConversationButton
└── [Emits] onTranscript event when transcription completes
```

### Integration Example: StreamingChat

Here's how StreamingChat Full variant integrates VoiceInput:

```svelte
<!-- packages/code/src/lib/streaming-chat/variants/FullStreamingChat.svelte -->
<script lang="ts">
	import { VoiceInput, createInitialVoiceInputState, voiceInputReducer } from '../../voice-input/index.js';
	import { createStore } from '@composable-svelte/core';

	interface Props {
		store: Store<StreamingChatState, StreamingChatAction>;
		/** Voice transcription dependency (calls your backend) */
		transcribeAudio?: (blob: Blob) => Promise<string>;
	}

	const { store, transcribeAudio }: Props = $props();

	// Create separate voice input store if transcription is provided
	const voiceStore = transcribeAudio ? createStore({
		initialState: createInitialVoiceInputState(),
		reducer: voiceInputReducer,
		dependencies: { transcribeAudio }
	}) : null;

	// Handle transcript from voice input
	function handleVoiceTranscript(transcript: string) {
		// Add voice message to chat
		store.dispatch({
			type: 'sendMessage',
			content: transcript,
			metadata: { source: 'voice' }
		});
	}
</script>

<div class="streaming-chat">
	<ChatMessageList {store} />

	<div class="chat-input">
		<textarea
			bind:value={$store.inputText}
			placeholder="Type a message..."
		/>

		<div class="input-actions">
			<!-- File upload button -->
			<AttachFileButton />

			<!-- Voice input (only if transcription provided) -->
			{#if voiceStore}
				<VoiceInput
					store={voiceStore}
					onTranscript={handleVoiceTranscript}
					variant="icon"
				/>
			{/if}

			<!-- Send button -->
			<SendButton />
		</div>
	</div>
</div>
```

**User Implementation:**
```svelte
<script lang="ts">
	import { FullStreamingChat } from '@composable-svelte/code';

	// Provide transcription dependency
	async function transcribeAudio(blob: Blob): Promise<string> {
		const formData = new FormData();
		formData.append('audio', blob);

		const response = await fetch('/api/voice/transcribe', {
			method: 'POST',
			body: formData,
			credentials: 'include'
		});

		const { transcript } = await response.json();
		return transcript;
	}
</script>

<FullStreamingChat
	{store}
	{transcribeAudio}
/>
```

### Reusability Examples

Since VoiceInput is standalone, it can be used anywhere:

**Voice Notes App:**
```svelte
<VoiceInput
	store={voiceStore}
	onTranscript={(text) => saveNote(text)}
/>
```

**Voice Search:**
```svelte
<VoiceInput
	store={voiceStore}
	onTranscript={(query) => performSearch(query)}
	defaultMode="push-to-talk"
/>
```

**Accessibility Features:**
```svelte
<VoiceInput
	store={voiceStore}
	onTranscript={(command) => executeVoiceCommand(command)}
	defaultMode="conversation"
/>
```

### Main Component Interface

#### `VoiceInput.svelte`

The top-level component that parent components integrate:

```svelte
<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import type { VoiceInputState, VoiceInputAction } from './types.js';

	interface Props {
		/** Voice input store (manages its own state) */
		store: Store<VoiceInputState, VoiceInputAction>;

		/** Called when transcription completes */
		onTranscript: (transcript: string) => void;

		/** Default mode on mount */
		defaultMode?: 'push-to-talk' | 'conversation';

		/** Optional: Custom button variant */
		variant?: 'icon' | 'button' | 'fab';

		/** Optional: Custom button text (for 'button' variant) */
		label?: string;

		/** Optional: Disable the input */
		disabled?: boolean;

		/** Optional: Custom CSS class */
		class?: string;
	}

	const {
		store,
		onTranscript,
		defaultMode = 'push-to-talk',
		variant = 'icon',
		label,
		disabled = false,
		class: className = ''
	}: Props = $props();
</script>

<!-- Component renders button + modal panel -->
<VoiceInputButton {store} {variant} {label} {disabled} class={className} />
{#if $store.status === 'recording' || $store.mode === 'conversation'}
	<VoiceInputPanel {store} {onTranscript} />
{/if}
```

**Usage:**
```svelte
<VoiceInput
	store={voiceStore}
	onTranscript={(text) => console.log('Got transcript:', text)}
	defaultMode="push-to-talk"
	variant="icon"
/>
```

**Internal Implementation (How onTranscript is Called):**

The VoiceInput component subscribes to actions and calls `onTranscript` when transcription completes:

```svelte
<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import type { VoiceInputState, VoiceInputAction } from './types.js';

	interface Props {
		store: Store<VoiceInputState, VoiceInputAction>;
		onTranscript: (transcript: string) => void;
		defaultMode?: 'push-to-talk' | 'conversation';
		variant?: 'icon' | 'button' | 'fab';
		label?: string;
		disabled?: boolean;
		class?: string;
	}

	const {
		store,
		onTranscript,
		defaultMode = 'push-to-talk',
		variant = 'icon',
		label,
		disabled = false,
		class: className = ''
	}: Props = $props();

	// Subscribe to store actions to detect transcription completion
	$effect(() => {
		const unsubscribe = store.subscribeToActions?.((action) => {
			// When transcription completes, call the onTranscript callback
			if (action.type === 'transcriptionCompleted') {
				onTranscript(action.transcript);
			}
		});

		return () => {
			unsubscribe?.();
		};
	});
</script>

<!-- Component renders button + modal panel -->
<VoiceInputButton {store} {variant} {label} {disabled} class={className} />
{#if $store.status === 'recording' || $store.mode === 'conversation'}
	<VoiceInputPanel {store} />
{/if}
```

**Note:** This pattern keeps the reducer pure and standalone. The reducer only handles state transitions and effects. The component (presentation layer) is responsible for calling the parent's `onTranscript` callback.

### Child Components

#### 1. `VoiceInputButton.svelte`

Internal button component (rendered by VoiceInput).

```svelte
<script lang="ts">
	interface Props {
		mode: 'push-to-talk' | 'conversation' | null;
		status: VoiceInputStatus;
		onPushToTalkPress: () => void;
		onPushToTalkRelease: () => void;
		onConversationToggle: () => void;
		/** Optional: Show mode selector dropdown */
		showModeSelector?: boolean;
	}
</script>

<!-- Push-to-talk: Hold button -->
<button
	class="voice-input-button"
	onpointerdown={handlePushToTalkStart}
	onpointerup={handlePushToTalkEnd}
	onpointercancel={handlePushToTalkCancel}
>
	<MicrophoneIcon />
</button>

<!-- Conversation mode: Toggle button -->
<button
	class="voice-input-button"
	class:active={mode === 'conversation'}
	onclick={handleConversationToggle}
>
	<MicrophoneIcon />
</button>
```

**UX Details:**
- Default: Push-to-talk (press & hold)
- Long-press or right-click: Show mode selector menu
- Visual state: idle | recording | active (conversation)
- Haptic feedback on mobile (if supported)

#### 2. `VoiceInputPanel.svelte`

Modal overlay that appears during voice input.

```svelte
<script lang="ts">
	interface Props {
		mode: 'push-to-talk' | 'conversation';
		status: VoiceInputStatus;
		audioLevel: number;
		recordingStartTime: number | null;
		liveTranscript: string;
		vadState: VADState | null;
		onCancel: () => void;
		onManualSend: () => void;
		onEndConversation: () => void;
	}
</script>

{#if mode === 'push-to-talk'}
	<PushToTalkPanel {audioLevel} {recordingStartTime} {onCancel} />
{:else if mode === 'conversation'}
	<ConversationModePanel
		{audioLevel}
		{liveTranscript}
		{vadState}
		{onManualSend}
		{onEndConversation}
	/>
{/if}
```

**UX Details:**
- Semi-transparent backdrop (doesn't block view of chat history)
- Bottom sheet on mobile, centered modal on desktop
- Escape key or backdrop click to cancel (push-to-talk) / end (conversation)
- Smooth fade-in/out animations

#### 3. `AudioVisualizer.svelte`

Real-time audio level visualization.

```svelte
<script lang="ts">
	interface Props {
		audioLevel: number; // 0-100
		variant: 'waveform' | 'bars' | 'pulse';
		color?: string;
	}
</script>

<!-- Waveform variant -->
<div class="audio-visualizer">
	<svg viewBox="0 0 100 40">
		{#each bars as bar, i}
			<rect
				x={i * 4}
				y={20 - bar.height / 2}
				width="3"
				height={bar.height}
				fill={color}
			/>
		{/each}
	</svg>
</div>
```

**Variants:**
- **Waveform:** Multiple bars that react to audio (like iOS voice memos)
- **Bars:** Horizontal bars that fill based on volume
- **Pulse:** Expanding circle that pulses with voice

#### 4. `RecordingTimer.svelte`

Duration display for active recordings.

```svelte
<script lang="ts">
	interface Props {
		startTime: number;
		maxDuration?: number; // Optional max (e.g., 60 seconds)
		onMaxDurationReached?: () => void;
	}

	const { startTime, maxDuration, onMaxDurationReached }: Props = $props();

	// Live elapsed time (updated every 100ms)
	let elapsed = $state(0);

	$effect(() => {
		const interval = setInterval(() => {
			const ms = Date.now() - startTime;
			elapsed = ms;

			// Check max duration
			if (maxDuration && ms >= maxDuration * 1000) {
				clearInterval(interval);
				onMaxDurationReached?.();
			}
		}, 100);

		return () => clearInterval(interval);
	});

	// Format milliseconds to "MM:SS"
	const formattedTime = $derived(formatDuration(elapsed));

	function formatDuration(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${minutes}:${secs.toString().padStart(2, '0')}`;
	}
</script>

<div class="recording-timer">
	<span class="recording-dot" /> <!-- Blinking red dot -->
	<span class="recording-time">{formattedTime}</span>
</div>
```

#### 5. `LiveTranscript.svelte`

Shows real-time transcription in conversation mode.

```svelte
<script lang="ts">
	interface Props {
		text: string;
		isSpeaking: boolean;
	}
</script>

<div class="live-transcript">
	<p class="transcript-text">{text}</p>
	{#if isSpeaking}
		<span class="typing-indicator">...</span>
	{/if}
</div>
```

## Visual Design Specifications

### Push-to-Talk Panel

```
┌─────────────────────────────────────┐
│          Push to Talk               │
│                                     │
│     ●●●●●●●●●●●●●●●●●●●●●●●        │ ← Waveform
│                                     │
│            🔴 0:03                  │ ← Timer
│                                     │
│  Release to send · ESC to cancel   │ ← Hint text
│                                     │
│         [ Cancel ]                  │ ← Cancel button
└─────────────────────────────────────┘
```

**Colors:**
- Recording indicator: Red (#DC2626)
- Waveform: Blue accent (#007AFF)
- Background: Semi-transparent dark overlay
- Panel: White (light) / Dark gray (dark mode)

### Conversation Mode Panel

```
┌─────────────────────────────────────┐
│       🎙️ Conversation Mode          │
│                                     │
│     ●●●●●●●●●●●●●●●●●●●●●●●        │ ← Waveform
│                                     │
│  ┌─────────────────────────────┐   │
│  │ I'd like to know more       │   │ ← Live transcript
│  │ about the features...       │   │
│  └─────────────────────────────┘   │
│                                     │
│  Speaking...                        │ ← VAD state
│                                     │
│  [ Send ]        [ End ]            │ ← Actions
└─────────────────────────────────────┘
```

**Colors:**
- Active indicator: Green (#10B981) when speaking
- Waveform: Green when speaking, gray when listening
- Transcript: Light background with dark text

### Button States

**Voice Input Button (Toolbar)**

| State              | Visual                                | Behavior                    |
|--------------------|---------------------------------------|-----------------------------|
| Idle               | Gray microphone icon                 | Press & hold to record      |
| Recording          | Red pulsing microphone               | Release to send             |
| Conversation Active| Green microphone with glow           | Click to end                |
| Permission Denied  | Gray with slash through              | Click shows error           |
| Processing         | Spinner                              | Disabled                    |

## Audio Management Layer

**Critical:** MediaRecorder, MediaStream, and AudioContext cannot be stored in Svelte state (not serializable). They must be managed separately from the reducer.

### AudioManager Class

```typescript
// audio/audio-manager.ts

/**
 * Manages audio recording, analysis, and cleanup.
 * Instances stored in WeakMap, referenced by ID in state.
 */
export class AudioManager {
	private stream: MediaStream | null = null;
	private context: AudioContext | null = null;
	private analyzer: AnalyserNode | null = null;
	private recorder: MediaRecorder | null = null;
	private chunks: Blob[] = [];
	private intervals: Set<number> = new Set();

	async requestMicrophone(): Promise<MediaStream> {
		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
				sampleRate: 16000
			}
		});

		// Setup audio analysis
		this.context = new AudioContext();
		const source = this.context.createMediaStreamSource(this.stream);
		this.analyzer = this.context.createAnalyser();
		this.analyzer.fftSize = 256;
		source.connect(this.analyzer);

		return this.stream;
	}

	startRecording(): void {
		if (!this.stream) throw new Error('No stream available');

		this.recorder = new MediaRecorder(this.stream, {
			mimeType: 'audio/webm;codecs=opus'
		});

		this.chunks = [];

		this.recorder.ondataavailable = (e) => {
			if (e.data.size > 0) {
				this.chunks.push(e.data);
			}
		};

		this.recorder.start();
	}

	stopRecording(): Promise<Blob> {
		return new Promise((resolve, reject) => {
			if (!this.recorder) {
				reject(new Error('No recorder available'));
				return;
			}

			this.recorder.onstop = () => {
				const audioBlob = new Blob(this.chunks, { type: 'audio/webm' });
				resolve(audioBlob);
			};

			this.recorder.stop();
		});
	}

	getAudioLevel(): number {
		if (!this.analyzer) return 0;

		const dataArray = new Uint8Array(this.analyzer.frequencyBinCount);
		this.analyzer.getByteFrequencyData(dataArray);

		const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
		return Math.round((average / 255) * 100);
	}

	detectVoiceActivity(threshold = 15): boolean {
		return this.getAudioLevel() > threshold;
	}

	/**
	 * Start monitoring audio levels at given interval.
	 * Returns interval ID for cleanup.
	 */
	startAudioLevelMonitoring(
		callback: (level: number) => void,
		intervalMs = 50
	): number {
		const id = setInterval(() => {
			const level = this.getAudioLevel();
			callback(level);
		}, intervalMs) as unknown as number;

		this.intervals.add(id);
		return id;
	}

	/**
	 * Stop specific interval.
	 */
	stopInterval(id: number): void {
		clearInterval(id);
		this.intervals.delete(id);
	}

	/**
	 * Clean up all resources.
	 */
	cleanup(): void {
		// Clear all intervals
		this.intervals.forEach((id) => clearInterval(id));
		this.intervals.clear();

		// Stop all audio tracks
		if (this.stream) {
			this.stream.getTracks().forEach((track) => track.stop());
			this.stream = null;
		}

		// Close audio context
		if (this.context) {
			this.context.close();
			this.context = null;
		}

		this.recorder = null;
		this.analyzer = null;
		this.chunks = [];
	}
}
```

### AudioManager Registry

```typescript
// audio/audio-manager-registry.ts

/**
 * Global registry for audio managers.
 * Uses WeakMap to allow garbage collection when component unmounts.
 */
const audioManagers = new Map<string, AudioManager>();

export function createAudioManager(id: string): AudioManager {
	const manager = new AudioManager();
	audioManagers.set(id, manager);
	return manager;
}

export function getAudioManager(id: string): AudioManager | undefined {
	return audioManagers.get(id);
}

export function deleteAudioManager(id: string): void {
	const manager = audioManagers.get(id);
	if (manager) {
		manager.cleanup();
		audioManagers.delete(id);
	}
}
```

### Dependencies with AudioManager

```typescript
interface VoiceInputDependencies {
	/**
	 * Transcribe audio blob to text via backend API.
	 */
	transcribeAudio: (audioBlob: Blob) => Promise<string>;

	/**
	 * Get audio manager by ID (injected at runtime).
	 */
	getAudioManager: (id: string) => AudioManager | undefined;

	/**
	 * Optional: Streaming transcription.
	 */
	streamTranscription?: (audioBlob: Blob) => AsyncIterator<string>;

	/**
	 * Optional: Text-to-speech.
	 */
	synthesizeSpeech?: (text: string) => Promise<AudioBuffer>;
}
```

## Web Audio API Integration

### Audio Capture Flow (Reference)

```typescript
// 1. Request microphone access
async function requestMicrophone(): Promise<MediaStream> {
	const stream = await navigator.mediaDevices.getUserMedia({
		audio: {
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true,
			sampleRate: 16000 // Optimal for speech recognition
		}
	});
	return stream;
}

// 2. Setup audio analysis
function setupAudioAnalysis(stream: MediaStream): {
	context: AudioContext;
	analyzer: AnalyserNode;
} {
	const audioContext = new AudioContext();
	const source = audioContext.createMediaStreamSource(stream);
	const analyzer = audioContext.createAnalyser();

	analyzer.fftSize = 256;
	source.connect(analyzer);

	return { context: audioContext, analyzer };
}

// 3. Monitor audio levels
function getAudioLevel(analyzer: AnalyserNode): number {
	const dataArray = new Uint8Array(analyzer.frequencyBinCount);
	analyzer.getByteFrequencyData(dataArray);

	const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
	return Math.round((average / 255) * 100);
}

// 4. Voice Activity Detection (simple threshold-based)
function detectVoiceActivity(audioLevel: number, threshold = 15): boolean {
	return audioLevel > threshold;
}
```

### Recording & Processing

```typescript
// MediaRecorder for audio capture
function startRecording(stream: MediaStream): MediaRecorder {
	const recorder = new MediaRecorder(stream, {
		mimeType: 'audio/webm;codecs=opus' // Best for web
	});

	const chunks: Blob[] = [];

	recorder.ondataavailable = (e) => {
		if (e.data.size > 0) {
			chunks.push(e.data);
		}
	};

	recorder.onstop = async () => {
		const audioBlob = new Blob(chunks, { type: 'audio/webm' });
		// Dispatch action with blob for transcription
		dispatch({ type: 'audioProcessingComplete', audioBlob });
	};

	recorder.start();
	return recorder;
}
```

## Reducer Logic

### Push-to-Talk Reducer Handling

```typescript
case 'startPushToTalkRecording': {
	if (state.permission !== 'granted') {
		return [state, Effect.run(async (dispatch) => {
			dispatch({ type: 'requestMicrophonePermission' });
		})];
	}

	const audioManager = deps.getAudioManager(state._audioManagerId!);
	if (!audioManager) {
		return [
			{ ...state, status: 'error', errorMessage: 'Audio manager not initialized' },
			Effect.none()
		];
	}

	return [
		{
			...state,
			status: 'recording',
			recordingStartTime: Date.now(),
			audioLevel: 0
		},
		Effect.batch(
			// Start audio recording
			Effect.run(async (dispatch) => {
				try {
					audioManager.startRecording();
				} catch (error) {
					dispatch({
						type: 'audioProcessingFailed',
						error: error instanceof Error ? error.message : 'Recording failed'
					});
				}
			}),
			// Start audio level monitoring
			Effect.run(async (dispatch) => {
				audioManager.startAudioLevelMonitoring((level) => {
					dispatch({ type: 'audioLevelUpdated', level });
				}, 50); // 20fps
			})
		)
	];
}

case 'stopPushToTalkRecording': {
	const audioManager = deps.getAudioManager(state._audioManagerId!);
	if (!audioManager) {
		return [state, Effect.none()];
	}

	return [
		{
			...state,
			status: 'processing',
			recordingStartTime: null
		},
		Effect.run(async (dispatch) => {
			try {
				const audioBlob = await audioManager.stopRecording();
				dispatch({ type: 'audioProcessingComplete', audioBlob, transcript: '' });
			} catch (error) {
				dispatch({
					type: 'audioProcessingFailed',
					error: error instanceof Error ? error.message : 'Processing failed'
				});
			}
		})
	];
}

case 'audioProcessingComplete': {
	return [
		{
			...state,
			status: 'idle',
			mode: null,
			recordingStartTime: null,
			audioLevel: 0
		},
		Effect.run(async (dispatch) => {
			try {
				// Transcribe audio via backend
				const transcript = await deps.transcribeAudio(action.audioBlob);

				// NOTE: The component (not reducer) will call onTranscript callback
				// This action just stores the transcript if needed
				dispatch({
					type: 'transcriptionCompleted',
					transcript
				});
			} catch (error) {
				dispatch({
					type: 'audioProcessingFailed',
					error: error instanceof Error ? error.message : 'Transcription failed'
				});
			}
		})
	];
}

case 'transcriptionCompleted': {
	// Component will receive this action and call onTranscript(transcript)
	return [state, Effect.none()];
}
```

### Conversation Mode Reducer Handling

```typescript
case 'conversationModeToggled': {
	if (action.enabled) {
		const audioManager = deps.getAudioManager(state._audioManagerId!);
		if (!audioManager) {
			return [
				{ ...state, status: 'error', errorMessage: 'Audio manager not initialized' },
				Effect.none()
			];
		}

		return [
			{
				...state,
				mode: 'conversation',
				status: 'ready',
				vadState: {
					isSpeaking: false,
					silenceDuration: 0,
					autoSendThreshold: 1500 // 1.5s of silence
				}
			},
			Effect.batch(
				// Start continuous audio level monitoring
				Effect.run(async (dispatch) => {
					audioManager.startAudioLevelMonitoring((level) => {
						dispatch({ type: 'audioLevelUpdated', level });

						// Check for voice activity
						const isSpeaking = audioManager.detectVoiceActivity(level);
						if (isSpeaking) {
							dispatch({ type: 'speechDetected' });
						}
					}, 100); // 10fps for VAD
				}),
				// Start silence detection timer
				Effect.run(async (dispatch) => {
					let silenceStart: number | null = null;

					const intervalId = setInterval(() => {
						const level = audioManager.getAudioLevel();
						const isSpeaking = audioManager.detectVoiceActivity(level);

						if (!isSpeaking) {
							if (!silenceStart) {
								silenceStart = Date.now();
							} else {
								const duration = Date.now() - silenceStart;
								dispatch({ type: 'silenceDetected', duration });

								if (duration >= 1500) { // Use hardcoded threshold or pass via action
									dispatch({ type: 'autoSendTriggered' });
									silenceStart = null;
								}
							}
						} else {
							silenceStart = null;
						}
					}, 100) as unknown as number;

					// Store interval ID for cleanup (would need to track this)
				})
			)
		];
	} else {
		// Deactivate conversation mode
		const audioManager = deps.getAudioManager(state._audioManagerId!);
		if (audioManager) {
			audioManager.cleanup();
		}

		return [
			{
				...state,
				mode: null,
				status: 'idle',
				vadState: null,
				audioLevel: 0,
				liveTranscript: '',
				recordingStartTime: null
			},
			Effect.none()
		];
	}
}

case 'speechDetected': {
	if (!state.vadState?.isSpeaking) {
		const audioManager = deps.getAudioManager(state._audioManagerId!);
		if (!audioManager) {
			return [state, Effect.none()];
		}

		// Start new speech segment
		return [
			{
				...state,
				status: 'recording',
				recordingStartTime: Date.now(),
				vadState: {
					...state.vadState!,
					isSpeaking: true,
					silenceDuration: 0
				}
			},
			Effect.run(async (dispatch) => {
				try {
					audioManager.startRecording();
				} catch (error) {
					dispatch({
						type: 'audioProcessingFailed',
						error: error instanceof Error ? error.message : 'Recording failed'
					});
				}
			})
		];
	}
	return [state, Effect.none()];
}

case 'autoSendTriggered': {
	const audioManager = deps.getAudioManager(state._audioManagerId!);
	if (!audioManager) {
		return [state, Effect.none()];
	}

	return [
		{
			...state,
			status: 'processing',
			vadState: state.vadState ? {
				...state.vadState,
				isSpeaking: false,
				silenceDuration: 0
			} : null
		},
		Effect.run(async (dispatch) => {
			try {
				// Stop current recording segment
				const audioBlob = await audioManager.stopRecording();

				// Transcribe audio via backend
				dispatch({ type: 'audioProcessingComplete', audioBlob, transcript: '' });
			} catch (error) {
				dispatch({
					type: 'audioProcessingFailed',
					error: error instanceof Error ? error.message : 'Auto-send failed'
				});
			}
		})
	];
}
```

## Dependencies

### Voice Input Dependencies

**All speech-to-text processing happens on the backend.** The frontend only captures audio and sends it to your backend API, which then calls Whisper (or your chosen transcription service).

```typescript
interface VoiceInputDependencies {
	/**
	 * Transcribe audio blob to text via backend API.
	 *
	 * Frontend sends audio blob → Backend calls Whisper → Returns transcript
	 *
	 * @param audioBlob - Recorded audio (webm/opus format)
	 * @returns Transcribed text
	 */
	transcribeAudio: (audioBlob: Blob) => Promise<string>;

	/**
	 * Optional: Streaming transcription for conversation mode.
	 *
	 * Opens WebSocket/SSE connection to backend for real-time transcription.
	 * Backend receives audio chunks and streams back partial transcripts.
	 *
	 * @param audioBlob - Audio chunk to transcribe
	 * @returns Async iterator yielding transcript updates
	 */
	streamTranscription?: (audioBlob: Blob) => AsyncIterator<string>;

	/**
	 * Optional: Text-to-speech for assistant responses.
	 * Enables full voice conversation.
	 *
	 * @param text - Text to synthesize
	 * @returns Audio buffer to play
	 */
	synthesizeSpeech?: (text: string) => Promise<AudioBuffer>;
}
```

**Example Implementation (Backend Proxy Pattern):**

```typescript
const voiceDeps: VoiceInputDependencies = {
	/**
	 * Backend proxy handles Whisper API calls.
	 * Never expose API keys in frontend code!
	 */
	transcribeAudio: async (audioBlob: Blob) => {
		const formData = new FormData();
		formData.append('audio', audioBlob, 'recording.webm');

		// Call YOUR backend API endpoint
		const response = await fetch('/api/voice/transcribe', {
			method: 'POST',
			body: formData,
			credentials: 'include' // Include auth cookies
		});

		if (!response.ok) {
			throw new Error('Transcription failed');
		}

		const { transcript } = await response.json();
		return transcript;
	},

	/**
	 * Optional: Streaming transcription via WebSocket
	 * Useful for conversation mode with live feedback
	 */
	streamTranscription: async function* (audioBlob: Blob) {
		const ws = new WebSocket('/api/voice/stream');

		// Send audio chunk
		ws.send(audioBlob);

		// Yield transcript updates as they arrive
		for await (const event of wsIterator(ws)) {
			const { transcript } = JSON.parse(event.data);
			yield transcript;
		}
	},

	/**
	 * Optional: TTS via backend
	 */
	synthesizeSpeech: async (text: string) => {
		const response = await fetch('/api/voice/synthesize', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ text }),
			credentials: 'include'
		});

		const arrayBuffer = await response.arrayBuffer();
		const audioContext = new AudioContext();
		return await audioContext.decodeAudioData(arrayBuffer);
	}
};
```

**Backend API Example (Reference):**

```typescript
// Example Node.js/Express backend endpoint
app.post('/api/voice/transcribe', upload.single('audio'), async (req, res) => {
	const audioFile = req.file;

	// Call OpenAI Whisper API
	const formData = new FormData();
	formData.append('file', audioFile.buffer, 'audio.webm');
	formData.append('model', 'whisper-1');

	const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
		},
		body: formData
	});

	const result = await response.json();
	res.json({ transcript: result.text });
});
```

**Why Backend Proxy?**
- ✅ API keys never exposed to frontend
- ✅ Better error handling and retry logic
- ✅ Request rate limiting and abuse prevention
- ✅ Consistent behavior across all browsers (no browser API differences)
- ✅ Can add pre/post-processing (noise reduction, etc.)
- ✅ Analytics and monitoring

## Accessibility

### Keyboard Support

| Key                | Action (Push-to-Talk)           | Action (Conversation)         |
|--------------------|---------------------------------|-------------------------------|
| Space (hold)       | Start/stop recording            | N/A                          |
| Escape             | Cancel recording                | End conversation             |
| Enter              | Send recording                  | Manual send                  |
| Ctrl/Cmd + M       | Toggle microphone               | Toggle conversation mode     |

### Screen Reader Support

```svelte
<!-- Voice input button -->
<button
	aria-label={mode === 'conversation'
		? 'End conversation mode'
		: status === 'recording'
			? 'Recording, release to send'
			: 'Press and hold to record voice message'}
	aria-pressed={mode === 'conversation'}
>
	<MicrophoneIcon aria-hidden="true" />
</button>

<!-- Live announcements -->
<div role="status" aria-live="polite" class="sr-only">
	{#if status === 'recording'}
		Recording started. Speak now.
	{:else if status === 'processing'}
		Processing audio...
	{/if}
</div>
```

### Visual Feedback Requirements

- **High contrast modes:** Ensure recording indicators visible
- **Motion sensitivity:** Reduce animations if `prefers-reduced-motion`
- **Color blindness:** Don't rely solely on color (use icons + text)
- **Focus indicators:** Clear focus states for all interactive elements

## Mobile Considerations

### Touch Gestures

**Push-to-Talk:**
- Touch & hold button → Start recording
- Release → Send
- Swipe down while holding → Cancel (like iOS voice messages)

**Conversation Mode:**
- Single tap toggle → Start/end conversation
- Double tap → Manual send

### Mobile-Specific UI

```svelte
<!-- Bottom sheet for mobile -->
{#if isMobile}
	<div class="voice-input-sheet" transition:slide={{ duration: 300 }}>
		<!-- Content slides up from bottom -->
	</div>
{:else}
	<div class="voice-input-modal" transition:fade>
		<!-- Centered modal for desktop -->
	</div>
{/if}
```

### Mobile Permissions

```typescript
// iOS Safari requires user gesture for microphone
async function requestMicrophoneWithGesture() {
	// Must be called within click/touch handler
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		return { success: true, stream };
	} catch (error) {
		if (error.name === 'NotAllowedError') {
			// Show instructions to enable in Settings
			return { success: false, error: 'permission-denied' };
		}
		return { success: false, error: 'unknown' };
	}
}
```

### Background Audio Handling

```typescript
// Pause recording when app goes to background
document.addEventListener('visibilitychange', () => {
	if (document.hidden && state.voiceInput.status === 'recording') {
		dispatch({ type: 'cancelPushToTalkRecording' });
	}
});
```

## Error Handling

### Error States

| Error                    | Cause                                | User Action                              |
|--------------------------|--------------------------------------|------------------------------------------|
| Permission Denied        | User denied microphone access        | Show settings instructions               |
| No Microphone Found      | No audio input device                | Show error message                       |
| Recording Failed         | MediaRecorder error                  | Retry or use text input                  |
| Transcription Failed     | API error or network issue           | Retry or show original audio             |
| Max Duration Exceeded    | Recording > 60 seconds               | Auto-stop and process                    |
| Browser Not Supported    | Old browser without Web Audio API    | Show upgrade prompt                      |

### Error Messages

```typescript
const errorMessages = {
	'permission-denied': 'Microphone access denied. Please enable it in your browser settings.',
	'no-microphone': 'No microphone found. Please connect a microphone and try again.',
	'recording-failed': 'Failed to record audio. Please try again.',
	'transcription-failed': 'Failed to transcribe audio. Please try typing instead.',
	'max-duration': 'Recording stopped after 60 seconds. Your message has been sent.',
	'browser-not-supported': 'Voice input requires a modern browser. Please update your browser.'
};
```

### Graceful Fallback

```typescript
// Check for browser support
function checkVoiceInputSupport(): {
	supported: boolean;
	features: string[];
} {
	const features = [];

	if (navigator.mediaDevices?.getUserMedia) {
		features.push('microphone');
	}

	if (window.AudioContext || window.webkitAudioContext) {
		features.push('audio-analysis');
	}

	if (window.MediaRecorder) {
		features.push('recording');
	}

	return {
		supported: features.length === 3,
		features
	};
}

// Fallback UI
{#if !voiceInputSupported}
	<Tooltip content="Voice input not supported in this browser">
		<button disabled>
			<MicrophoneIcon />
		</button>
	</Tooltip>
{/if}
```

## Performance Considerations

### Optimization Strategies

1. **Lazy Loading:** Only load Web Audio API code when voice input is activated
2. **Debouncing:** Throttle audio level updates to 20fps (50ms intervals)
3. **Resource Cleanup:** Properly close AudioContext and MediaStream when done
4. **Blob Compression:** Compress audio before sending to API
5. **Caching:** Cache microphone permission status in localStorage

```typescript
// Lazy load voice input module
const loadVoiceInput = async () => {
	const { VoiceInputManager } = await import('./voice-input-manager');
	return new VoiceInputManager();
};

// Cleanup example
function cleanupAudioResources(state: VoiceInputState) {
	if (state._audioStream) {
		state._audioStream.getTracks().forEach(track => track.stop());
	}

	if (state._audioContext) {
		state._audioContext.close();
	}
}
```

## Implementation Phases

### Phase 1: Push-to-Talk (MVP)
**Goal:** Basic voice message recording

- [ ] Add VoiceInputButton component to ChatInput toolbar
- [ ] Implement microphone permission flow
- [ ] Add push-to-talk recording (press & hold)
- [ ] Implement audio visualization (simple waveform)
- [ ] Add recording timer and cancel functionality
- [ ] Integrate with transcription API (dependency injection)
- [ ] Add keyboard support (Space key)
- [ ] Mobile: Touch & hold gesture
- [ ] Error handling and permission denied state

**Deliverables:**
- `VoiceInputButton.svelte`
- `VoiceInputPanel.svelte` (push-to-talk variant)
- `AudioVisualizer.svelte`
- `RecordingTimer.svelte`
- Reducer actions for push-to-talk
- Basic transcription dependency interface

### Phase 2: Conversation Mode
**Goal:** Hands-free continuous interaction

- [ ] Add conversation mode toggle to VoiceInputButton
- [ ] Implement Voice Activity Detection (VAD)
- [ ] Add silence detection and auto-send logic
- [ ] Implement live transcription display
- [ ] Add manual send button in conversation panel
- [ ] Handle speech segmentation (start/stop detection)
- [ ] Add visual indicators for speaking/listening states
- [ ] Keyboard shortcut (Ctrl+M to toggle)

**Deliverables:**
- `ConversationModePanel.svelte`
- `LiveTranscript.svelte`
- VAD logic in reducer
- Streaming transcription support (optional dependency)

### Phase 3: Polish & Advanced Features
**Goal:** Production-ready with enhanced UX

- [ ] Add haptic feedback on mobile
- [ ] Implement swipe-to-cancel gesture (mobile)
- [ ] Add audio compression before API upload
- [ ] Implement retry logic for failed transcriptions
- [ ] Add settings panel (VAD sensitivity, auto-send delay)
- [ ] Support multiple audio codecs with fallbacks
- [ ] Add analytics events (record started, sent, canceled)
- [ ] Comprehensive error messages and recovery
- [ ] Accessibility audit (screen readers, keyboard nav)
- [ ] Performance optimization (lazy loading, cleanup)

**Deliverables:**
- `VoiceInputSettings.svelte`
- Codec detection and fallback logic
- Analytics integration hooks
- Full test coverage
- Accessibility documentation

### Phase 4: Advanced Integrations (Optional)
**Goal:** Enhanced voice experience

- [ ] Text-to-speech for assistant responses
- [ ] Wake word detection ("Hey Assistant")
- [ ] Multi-language support
- [ ] Voice commands ("Send message", "Cancel")
- [ ] Audio message playback in chat history
- [ ] Waveform visualization for sent audio messages
- [ ] Speaker diarization (multi-person conversations)

## Testing Strategy

### Unit Tests

```typescript
describe('VoiceInput Reducer', () => {
	it('should request permission on first use', async () => {
		const store = createTestStore(initialState);

		await store.send({ type: 'startPushToTalkRecording' });

		expect(store.state.voiceInput.status).toBe('requesting-permission');
	});

	it('should start recording when permission granted', async () => {
		const store = createTestStore({
			...initialState,
			voiceInput: {
				...initialState.voiceInput,
				permission: 'granted'
			}
		});

		await store.send({ type: 'startPushToTalkRecording' });

		expect(store.state.voiceInput.status).toBe('recording');
		expect(store.state.voiceInput.recordingStartTime).toBeGreaterThan(0);
	});

	it('should handle VAD state changes in conversation mode', async () => {
		const store = createTestStore(initialState);

		await store.send({ type: 'conversationModeToggled', enabled: true });
		await store.send({ type: 'speechDetected' });

		expect(store.state.voiceInput.vadState?.isSpeaking).toBe(true);
	});
});
```

### Integration Tests

```typescript
describe('VoiceInputButton', () => {
	it('should start recording on pointer down', async () => {
		const mockDispatch = vi.fn();
		render(VoiceInputButton, { props: { dispatch: mockDispatch } });

		const button = screen.getByRole('button', { name: /voice/i });
		await fireEvent.pointerDown(button);

		expect(mockDispatch).toHaveBeenCalledWith({ type: 'startPushToTalkRecording' });
	});

	it('should cancel recording on escape key', async () => {
		const mockDispatch = vi.fn();
		render(VoiceInputPanel, {
			props: {
				mode: 'push-to-talk',
				status: 'recording',
				dispatch: mockDispatch
			}
		});

		await fireEvent.keyDown(document, { key: 'Escape' });

		expect(mockDispatch).toHaveBeenCalledWith({ type: 'cancelPushToTalkRecording' });
	});
});
```

### E2E Tests (Playwright)

```typescript
test('Push-to-talk voice message flow', async ({ page }) => {
	// Mock getUserMedia
	await page.addInitScript(() => {
		navigator.mediaDevices.getUserMedia = async () => {
			return new MediaStream();
		};
	});

	await page.goto('/chat');

	// Click voice button
	const voiceButton = page.getByRole('button', { name: /voice/i });
	await voiceButton.click();

	// Should show recording panel
	await expect(page.getByText(/recording/i)).toBeVisible();

	// Release button (simulate)
	await voiceButton.dispatchEvent('pointerup');

	// Should show processing state
	await expect(page.getByText(/processing/i)).toBeVisible();

	// Should send message to chat
	await expect(page.getByText(/transcribed message/i)).toBeVisible();
});
```

## Security & Privacy

### Privacy Considerations

1. **No Client-Side Audio Storage:** Audio blobs sent directly to backend, never stored in localStorage/IndexedDB
2. **User Consent:** Clear permission prompts explaining how audio is used
3. **Secure Transmission:** All audio data sent over HTTPS
4. **Backend-Only Transcription:** All speech-to-text processing happens on backend (never call Whisper/OpenAI directly from frontend)
5. **Data Retention:** Document how long your backend retains audio (recommendation: delete immediately after transcription)
6. **Authentication:** Require user authentication for transcription endpoints
7. **Rate Limiting:** Prevent abuse with request rate limits on backend

### Security Best Practices

**CRITICAL:** The frontend NEVER calls transcription APIs directly. All transcription happens through your backend.

```typescript
// ✅ CORRECT: Frontend sends audio to YOUR backend
async function transcribeAudio(audioBlob: Blob): Promise<string> {
	const formData = new FormData();
	formData.append('audio', audioBlob);

	// YOUR backend handles Whisper API calls
	const response = await fetch('/api/voice/transcribe', {
		method: 'POST',
		body: formData,
		credentials: 'include', // Auth cookies
		headers: {
			'X-CSRF-Token': getCsrfToken() // CSRF protection
		}
	});

	if (!response.ok) {
		throw new Error('Transcription failed');
	}

	const { transcript } = await response.json();
	return transcript;
}

// ❌ WRONG: Never do this in frontend code!
const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
	headers: {
		'Authorization': `Bearer ${OPENAI_API_KEY}` // ⚠️ SECURITY VULNERABILITY!
	}
});
```

**Why Backend Proxy is Required:**
- 🔒 API keys never exposed to users (visible in browser DevTools)
- 🔒 Prevents API key theft and unauthorized usage
- 🔒 Enables user authentication and authorization
- 🔒 Allows rate limiting per user/IP
- 🔒 Audit trail for compliance (who transcribed what, when)
- 🔒 Can scrub sensitive data before sending to Whisper

### Content Security Policy

```html
<!-- Allow microphone access -->
<meta http-equiv="Permissions-Policy" content="microphone=(self)">
```

## Browser Compatibility

### Required APIs

| API                     | Chrome | Firefox | Safari | Edge  | Mobile Safari | Chrome Android |
|-------------------------|--------|---------|--------|-------|---------------|----------------|
| getUserMedia            | 53+    | 36+     | 11+    | 79+   | 11+           | 53+            |
| MediaRecorder           | 47+    | 25+     | 14.1+  | 79+   | 14.5+         | 47+            |
| AudioContext            | 35+    | 25+     | 14.1+  | 79+   | 14.5+         | 35+            |
| Web Audio API           | 35+    | 25+     | 14.1+  | 79+   | 14.5+         | 35+            |

**Minimum Supported Versions:**
- Chrome/Edge 79+
- Firefox 36+
- Safari 14.1+
- iOS Safari 14.5+
- Chrome Android 53+

### Feature Detection

```typescript
const browserSupport = {
	mediaDevices: !!navigator.mediaDevices?.getUserMedia,
	mediaRecorder: !!window.MediaRecorder,
	audioContext: !!(window.AudioContext || window.webkitAudioContext),
	webAudio: !!window.AudioContext
};

const fullySupported = Object.values(browserSupport).every(Boolean);

if (!fullySupported) {
	console.warn('Voice input not fully supported:', browserSupport);
	// Show fallback UI
}
```

## Configuration Options

### User-Configurable Settings

```typescript
interface VoiceInputConfig {
	/** Push-to-talk or conversation mode default */
	defaultMode: 'push-to-talk' | 'conversation';

	/** Auto-send delay in conversation mode (ms) */
	autoSendDelay: number;

	/** Voice activity detection sensitivity (1-100) */
	vadSensitivity: number;

	/** Maximum recording duration (seconds) */
	maxDuration: number;

	/** Audio quality (lower = smaller file size) */
	audioBitrate: number;

	/** Enable haptic feedback on mobile */
	enableHaptics: boolean;

	/** Show live transcription in conversation mode */
	showLiveTranscript: boolean;

	/** Keyboard shortcut for voice input */
	keyboardShortcut: string;
}

const defaultConfig: VoiceInputConfig = {
	defaultMode: 'push-to-talk',
	autoSendDelay: 1500,
	vadSensitivity: 50,
	maxDuration: 60,
	audioBitrate: 128000,
	enableHaptics: true,
	showLiveTranscript: true,
	keyboardShortcut: 'Ctrl+M'
};
```

## Future Enhancements

### Potential Features (Post-MVP)

1. **Noise Cancellation:** Advanced audio processing to filter background noise (frontend)
2. **Language Detection:** Auto-detect spoken language (backend)
3. **Accent Adaptation:** Improve transcription accuracy for different accents (backend)
4. **Voice Signatures:** Personalized voice models (backend)
5. **Offline Mode:** On-device transcription using WebAssembly (e.g., Whisper.cpp) - would be an alternative backend dependency implementation
6. **Audio Editing:** Trim/edit audio before sending (frontend)
7. **Bookmarking:** Save audio messages for later (frontend)
8. **Transcription Correction:** Allow users to edit transcribed text before sending (frontend)

**Note:** Even "offline mode" follows the dependency pattern - it would just swap the backend HTTP API dependency for a local WASM implementation. The frontend component remains unchanged.

## File Structure

```
packages/code/src/lib/voice-input/
├── index.ts                              # Main exports
├── VoiceInput.svelte                     # Main component
├── types.ts                              # State, actions, dependencies
├── reducer.ts                            # Voice input reducer
├── components/
│   ├── VoiceInputButton.svelte          # Button trigger
│   ├── VoiceInputPanel.svelte           # Modal overlay
│   ├── PushToTalkPanel.svelte           # Push-to-talk UI
│   ├── ConversationModePanel.svelte     # Conversation UI
│   ├── AudioVisualizer.svelte           # Waveform/bars
│   ├── RecordingTimer.svelte            # Duration timer
│   └── LiveTranscript.svelte            # Real-time text
└── audio/
    ├── audio-manager.ts                 # AudioManager class (manages non-serializable objects)
    ├── audio-manager-registry.ts        # Global registry for AudioManager instances
    ├── audio-capture.ts                 # getUserMedia, MediaRecorder helpers
    ├── audio-analysis.ts                # AudioContext, visualization helpers
    └── vad.ts                           # Voice Activity Detection helpers

# Used in StreamingChat (via composition)
packages/code/src/lib/streaming-chat/
└── (StreamingChat imports and uses VoiceInput)
```

**Package Export:**
```typescript
// packages/code/src/lib/index.ts
export {
	VoiceInput,
	voiceInputReducer,
	createInitialVoiceInputState,
	type VoiceInputState,
	type VoiceInputAction,
	type VoiceInputDependencies
} from './voice-input/index.js';
```

## Resource Cleanup & Lifecycle

### AudioManager Cleanup

Proper cleanup of audio resources is critical to prevent memory leaks and ensure microphone access is properly released.

#### When to Cleanup

AudioManager cleanup should occur in these scenarios:

1. **Component Unmount**: When VoiceInput component is removed from DOM
2. **Mode Deactivation**: When switching from conversation mode to idle
3. **Permission Denied**: When user denies microphone access
4. **Error Recovery**: When an unrecoverable error occurs

#### Component Cleanup Example

```svelte
<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import type { VoiceInputState, VoiceInputAction } from './types.js';
	import { deleteAudioManager } from './audio/audio-manager-registry.js';

	interface Props {
		store: Store<VoiceInputState, VoiceInputAction>;
		onTranscript: (transcript: string) => void;
	}

	const { store, onTranscript }: Props = $props();

	// Subscribe to transcription completion
	$effect(() => {
		const unsubscribe = store.subscribeToActions?.((action) => {
			if (action.type === 'transcriptionCompleted') {
				onTranscript(action.transcript);
			}
		});

		return () => {
			unsubscribe?.();
		};
	});

	// Cleanup audio manager when component unmounts
	$effect(() => {
		return () => {
			const audioManagerId = $store._audioManagerId;
			if (audioManagerId) {
				deleteAudioManager(audioManagerId);
			}
		};
	});
</script>
```

#### Reducer Cleanup Actions

```typescript
case 'deactivateVoiceInput': {
	const audioManager = deps.getAudioManager(state._audioManagerId!);
	if (audioManager) {
		audioManager.cleanup();
	}

	return [
		{
			...state,
			mode: null,
			status: 'idle',
			vadState: null,
			audioLevel: 0,
			liveTranscript: '',
			recordingStartTime: null,
			errorMessage: null
		},
		Effect.none()
	];
}

case 'cleanupAudioResources': {
	// Called when cleanup is needed (error recovery, permission denied, etc.)
	const audioManager = deps.getAudioManager(state._audioManagerId!);
	if (audioManager) {
		audioManager.cleanup();
	}

	return [
		{
			...state,
			status: 'idle',
			mode: null,
			vadState: null,
			audioLevel: 0,
			recordingStartTime: null
		},
		Effect.none()
	];
}
```

#### What AudioManager.cleanup() Does

```typescript
// From audio-manager.ts
cleanup(): void {
	// 1. Clear all intervals (audio level monitoring, VAD timers)
	this.intervals.forEach((id) => clearInterval(id));
	this.intervals.clear();

	// 2. Stop all media tracks (releases microphone)
	if (this.stream) {
		this.stream.getTracks().forEach((track) => track.stop());
		this.stream = null;
	}

	// 3. Close audio context (releases audio processing resources)
	if (this.context) {
		this.context.close();
		this.context = null;
	}

	// 4. Clear references to prevent memory leaks
	this.recorder = null;
	this.analyzer = null;
	this.chunks = [];
}
```

#### Registry Cleanup

```typescript
// From audio-manager-registry.ts
export function deleteAudioManager(id: string): void {
	const manager = audioManagers.get(id);
	if (manager) {
		// 1. Call cleanup to release audio resources
		manager.cleanup();

		// 2. Remove from registry (allows garbage collection)
		audioManagers.delete(id);
	}
}
```

#### Cleanup on Browser Navigation

```svelte
<script lang="ts">
	import { onMount } from 'svelte';

	onMount(() => {
		// Cleanup on page unload/refresh
		const handleUnload = () => {
			const audioManagerId = $store._audioManagerId;
			if (audioManagerId) {
				deleteAudioManager(audioManagerId);
			}
		};

		window.addEventListener('beforeunload', handleUnload);

		return () => {
			window.removeEventListener('beforeunload', handleUnload);
			handleUnload(); // Also cleanup on component unmount
		};
	});
</script>
```

#### Cleanup Best Practices

1. **Always cleanup on unmount**: Even if user hasn't used voice input
2. **Cleanup before re-initialization**: Prevent multiple AudioManagers for same component
3. **Handle errors gracefully**: Cleanup should never throw errors
4. **Release microphone ASAP**: Don't keep mic active when not recording
5. **Clear intervals first**: Prevent callbacks after cleanup
6. **Test cleanup thoroughly**: Memory leaks are hard to debug in production

## Summary

This specification provides a comprehensive foundation for implementing a **standalone, reusable VoiceInput component** with two distinct modes:

1. **Push-to-Talk:** Simple, controlled voice messages for quick interactions
2. **Conversation Mode:** Hands-free, continuous dialogue for natural conversations

### Architecture Summary

**This is a Standalone Component:**
- Own state, reducer, and actions
- Completely independent of StreamingChat
- Can be used in chat, forms, voice notes, accessibility tools, etc.
- Emits `onTranscript` callback when transcription completes

**Frontend (This Component):**
- Microphone access via Web Audio API
- Audio recording via MediaRecorder
- Real-time waveform visualization
- Voice Activity Detection (frontend-only, threshold-based)
- Silence detection for auto-send
- Audio blob creation and transmission

**Backend (Injected Dependency):**
- All speech-to-text transcription (Whisper, OpenAI, Google STT, etc.)
- API key management and security
- Optional: Streaming transcription via WebSocket
- Optional: Text-to-speech synthesis

**Critical:** No browser `SpeechRecognition` API is used. No client-side transcription. All STT processing happens on your backend.

### Key Design Principles

- **Composable Architecture:** Transcription is a dependency, frontend doesn't know about Whisper
- **Security-First:** All API calls go through backend proxy, never expose keys
- **Privacy-First:** No local audio storage, immediate transmission to backend
- **Progressive Enhancement:** Fallback to text input if audio not supported
- **Accessible:** Keyboard shortcuts, screen reader support, ARIA labels
- **Mobile-Optimized:** Touch gestures, responsive UI, haptic feedback
- **Testable:** Pure reducers, mockable dependencies, comprehensive tests

### What Makes This Different

Unlike many voice input implementations, this design:
- ✅ **Standalone component** (not tied to chat, use anywhere)
- ✅ **Event-driven integration** (`onTranscript` callback, no tight coupling)
- ✅ **Never calls transcription APIs from frontend** (security)
- ✅ **Separates audio capture from transcription** (testability)
- ✅ **Frontend VAD only** (no browser speech APIs, consistent cross-browser)
- ✅ **Dependency injection** (swap Whisper for any STT service)
- ✅ **Reducer-based state** (time-travel debugging, testing)
- ✅ **Composable** (works with any parent component via callbacks)

### Next Steps

1. **Review and approve specification**
2. **Begin Phase 1 implementation (Push-to-Talk MVP):**
   - Implement VoiceInputButton component
   - Add microphone permission flow
   - Implement audio recording and visualization
   - Create transcription dependency interface
3. **Create mock transcription dependency for testing**
4. **Design and implement UI components**
5. **Add comprehensive test coverage**
6. **Document backend API requirements for users**
