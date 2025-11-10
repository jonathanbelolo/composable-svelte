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

	/** Audio manager instance ID (to lookup in registry) */
	_audioManagerId: string | null;
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
	| { type: 'microphonePermissionGranted'; managerId: string }
	| { type: 'microphonePermissionDenied'; error: string }

	// Audio processing
	| { type: 'audioLevelUpdated'; level: number }
	| { type: 'liveTranscriptUpdated'; text: string }
	| { type: 'audioProcessingComplete'; audioBlob: Blob; transcript: string }
	| { type: 'audioProcessingFailed'; error: string }
	| { type: 'transcriptionCompleted'; transcript: string }

	// Cleanup
	| { type: 'cleanupAudioResources' };

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
	 * Optional: Streaming transcription for conversation mode.
	 *
	 * Opens WebSocket/SSE connection to backend for real-time transcription.
	 *
	 * @param audioBlob - Audio chunk to transcribe
	 * @returns Async iterator yielding transcript updates
	 */
	streamTranscription?: (audioBlob: Blob) => AsyncIterator<string>;

	/**
	 * Optional: Text-to-speech for assistant responses.
	 *
	 * @param text - Text to synthesize
	 * @returns Audio buffer to play
	 */
	synthesizeSpeech?: (text: string) => Promise<AudioBuffer>;
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
		liveTranscript: '',
		recordingStartTime: null,
		vadState: null,
		errorMessage: null,
		_audioManagerId: null
	};
}
