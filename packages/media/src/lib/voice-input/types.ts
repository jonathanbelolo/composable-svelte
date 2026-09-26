import type { AudioManager } from './audio/audio-manager.js';

/**
 * Voice Input State
 *
 * State for the standalone VoiceInput component.
 */
export interface VoiceInputState {
	/** Current recording mode */
	mode: 'push-to-talk' | 'conversation' | null;

	/** Recording status */
	status: 'idle' | 'requesting-permission' | 'ready' | 'recording' | 'processing' | 'error';

	/** Microphone permission state */
	permission: 'prompt' | 'granted' | 'denied' | null;

	/** Current audio level (0-100) for visualization */
	audioLevel: number;

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

	/** Audio manager instance ID (to lookup in registry) */
	_audioManagerId: string | null;
	/** Internal: the framework subscription owns this manager.
	 * Undefined preserves legacy app-owned state; false marks a retired framework device.
	 * Runtime resource ownership must not be persisted or hydrated across stores. */
	_ownsAudioManager?: boolean | undefined;
	/** Internal deterministic lifetime generation; do not hydrate runtime ownership. */
	_generation?: number | undefined;
	/** Internal recording intent, distinct from selecting a mode or requesting permission. */
	_recordAfterPermission?: boolean | undefined;
	/** Internal per-lifetime processing sequence and accepted outstanding results. */
	_processingSequence?: number | undefined;
	_activeStop?: number | null | undefined;
	_pendingTranscriptions?: readonly number[] | undefined;
}

/**
 * Voice Input Actions
 *
 * All possible actions for the VoiceInput component.
 */
export type VoiceInputAction =
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
	| { type: '_requestRecordingPermission' }
	| { type: 'microphonePermissionGranted'; managerId: string }
	// Framework callbacks always carry managerId. Omission is the legacy
	// explicit-failure action, applied to the current request rather than a generation.
	| { type: 'microphonePermissionDenied'; error: string; managerId?: string | undefined }

	// Audio processing
	| { type: 'audioLevelUpdated'; level: number }
	// No `transcript` here: it was written by both dispatch sites and read by
	// none, because this case does the transcribing.
	| { type: 'audioProcessingComplete'; audioBlob: Blob }
	| { type: 'audioProcessingFailed'; error: string }
	| { type: 'transcriptionCompleted'; transcript: string }
	// Framework handoffs; accepted results alone produce public notifications.
	| { type: '_microphoneAllocated'; generation: number; managerId: string }
	| { type: '_recordingStarted'; generation: number; timestamp: number }
	| { type: '_audioStopped'; generation: number; sequence: number; audioBlob: Blob; continuing: boolean }
	| { type: '_transcriptionResult'; generation: number; sequence: number; transcript: string }
	| { type: '_operationFailed'; generation: number; error: string }
	// Dispatched by `VoiceInput` when it unmounts from a store that outlives it:
	// releases the microphone and its loops, and lets an utterance the user
	// already finished be transcribed. Not for applications — use `deactivateVoiceInput`.
	| { type: '_releaseDevice' };
/**
 * Voice Input Dependencies
 *
 * Dependencies injected into the VoiceInput reducer.
 */
export interface VoiceInputDependencies {
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
	 * Get audio manager by ID (injected at runtime).
	 */
	getAudioManager: (id: string) => AudioManager | undefined;

	/**
	 * Create the audio manager that will own the microphone.
	 *
	 * Injectable because acquiring a microphone is a side effect on a real
	 * device, and the permission path is the one path a test most needs to drive.
	 * The reducer used to import `createAudioManager` from the registry and call
	 * it inside the effect — so the *reading* side of the audio manager was
	 * injectable via `getAudioManager` while the *creating* side was hard-wired,
	 * and no test could reach `microphonePermissionGranted` without a real
	 * microphone. Defaults to the registry.
	 * The factory must register the returned manager so getAudioManager(id)
	 * returns that exact instance when requestMicrophone settles.
	 * cleanup must be idempotent and safe during acquisition: retirement releases
	 * current resources immediately, then releases any resources acquired before
	 * the pending request eventually resolves or rejects (including partial setup).
	 */
	createAudioManager?: ((id: string) => AudioManager) | undefined;

	/** Dispose and remove an injected registry entry. Defaults to the built-in registry.
	 * Custom registries should implement this to release both device and entry.
	 * Without it, cleanup releases the device but the caller retains its map entry. */
	deleteAudioManager?: ((id: string) => void) | undefined;
}

/**
 * Create initial voice input state.
 * @returns Initial VoiceInputState
 */
export function createInitialVoiceInputState(): VoiceInputState {
	return {
		mode: null,
		status: 'idle',
		permission: null,
		audioLevel: 0,
		recordingStartTime: null,
		vadState: null,
		errorMessage: null,
		_audioManagerId: null
	};
}
