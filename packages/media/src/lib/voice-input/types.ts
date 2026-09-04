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
	// No `transcript` here: it was written by both dispatch sites and read by
	// none, because this case does the transcribing.
	| { type: 'audioProcessingComplete'; audioBlob: Blob }
	| { type: 'audioProcessingFailed'; error: string }
	| { type: 'transcriptionCompleted'; transcript: string };
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
	 */
	createAudioManager?: (id: string) => AudioManager;
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
