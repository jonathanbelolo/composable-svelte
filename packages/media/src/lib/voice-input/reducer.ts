import type { Reducer } from '@composable-svelte/core';
import type { VoiceInputState, VoiceInputAction, VoiceInputDependencies } from './types.js';
import { Effect } from '@composable-svelte/core';
import { createAudioManager } from './audio/audio-manager-registry.js';

/**
 * Voice Input Reducer
 *
 * Handles all state transitions for the VoiceInput component.
 * Implements push-to-talk and conversation modes.
 */
export const voiceInputReducer: Reducer<
	VoiceInputState,
	VoiceInputAction,
	VoiceInputDependencies
> = (state, action, deps) => {
	switch (action.type) {
		// === Microphone Permission === //

		case 'requestMicrophonePermission': {
			const managerId = `voice-input-${Date.now()}`;

			return [
				{
					...state,
					status: 'requesting-permission',
					_audioManagerId: managerId
				},
				Effect.run(async (dispatch) => {
					try {
						const manager = createAudioManager(managerId);
						await manager.requestMicrophone();
						dispatch({
							type: 'microphonePermissionGranted',
							managerId
						});
					} catch (error) {
						dispatch({
							type: 'microphonePermissionDenied',
							error: error instanceof Error ? error.message : 'Permission denied'
						});
					}
				})
			];
		}


	case 'microphonePermissionGranted': {
		// If we're in push-to-talk mode, automatically start recording
		// (user was holding button waiting for permission)
		if (state.mode === 'push-to-talk') {
			return [
				{
					...state,
					permission: 'granted',
					_audioManagerId: action.managerId
				},
				Effect.run(async (dispatch) => {
					// Automatically start recording now that we have permission
					dispatch({ type: 'startPushToTalkRecording' });
				})
			];
		}

		return [
			{
				...state,
				status: 'ready',
				permission: 'granted',
				_audioManagerId: action.managerId
			},
			Effect.none()
		];
	}


		case 'microphonePermissionDenied': {
			return [
				{
					...state,
					status: 'error',
					permission: 'denied',
					errorMessage: action.error
				},
				Effect.none()
			];
		}

		// === Push-to-Talk Mode === //

		case 'activatePushToTalk': {
			return [
				{
					...state,
					mode: 'push-to-talk'
				},
				Effect.none()
			];
		}

		case 'startPushToTalkRecording': {
			// Check if permission is granted
			if (state.permission !== 'granted') {
				return [
					{ ...state, mode: 'push-to-talk' },
					Effect.run(async (dispatch) => {
						dispatch({ type: 'requestMicrophonePermission' });
					})
				];
			}

			const audioManager = deps.getAudioManager(state._audioManagerId!);
			if (!audioManager) {
				return [
					{
						...state,
						status: 'error',
						errorMessage: 'Audio manager not initialized'
					},
					Effect.none()
				];
			}

			return [
				{
					...state,
				mode: 'push-to-talk', // Set mode when starting recording
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
						dispatch({
							type: 'audioProcessingComplete',
							audioBlob,
							transcript: ''
						});
					} catch (error) {
						dispatch({
							type: 'audioProcessingFailed',
							error: error instanceof Error ? error.message : 'Processing failed'
						});
					}
				})
			];
		}

		case 'cancelPushToTalkRecording': {
			const audioManager = deps.getAudioManager(state._audioManagerId!);
			if (audioManager) {
				// Stop recording without processing
				audioManager.stopRecording().catch(() => {
					// Ignore errors on cancel
				});
			}

			return [
				{
					...state,
					status: 'idle',
					mode: null,
					recordingStartTime: null,
					audioLevel: 0
				},
				Effect.none()
			];
		}

		case 'audioLevelUpdated': {
			return [
				{
					...state,
					audioLevel: action.level
				},
				Effect.none()
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

		case 'audioProcessingFailed': {
			return [
				{
					...state,
					status: 'error',
					errorMessage: action.error,
					mode: null,
					recordingStartTime: null,
					audioLevel: 0
				},
				Effect.none()
			];
		}

	// === Conversation Mode === //

	case 'activateConversationMode': {
		// Check if permission is granted
		if (state.permission !== 'granted') {
			return [
				{
					...state,
					mode: 'conversation'
				},
				Effect.run(async (dispatch) => {
					dispatch({ type: 'requestMicrophonePermission' });
				})
			];
		}

		const audioManager = deps.getAudioManager(state._audioManagerId!);
		if (!audioManager) {
			return [
				{
					...state,
					status: 'error',
					errorMessage: 'Audio manager not initialized'
				},
				Effect.none()
			];
		}

		// Start continuous recording with VAD monitoring
		return [
			{
				...state,
				mode: 'conversation',
				status: 'recording',
				recordingStartTime: Date.now(),
				vadState: {
					isSpeaking: false,
					silenceDuration: 0,
					autoSendThreshold: 1500
				}
			},
			Effect.batch(
				// Start recording
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
					}, 50);
				}),
				// Start VAD monitoring loop
				Effect.run(async (dispatch) => {
					const vadCheck = setInterval(() => {
						const hasVoice = audioManager.detectVoiceActivity(15);
						if (hasVoice) {
							dispatch({ type: 'speechDetected' });
						} else {
							dispatch({ type: 'silenceDetected', duration: 0 });
						}
					}, 100); // Check every 100ms
				})
			)
		];
	}

	case 'conversationModeToggled': {
		if (action.enabled) {
			// Turn on conversation mode
			return [state, Effect.run(async (dispatch) => {
				dispatch({ type: 'activateConversationMode' });
			})];
		} else {
			// Turn off conversation mode
			return [state, Effect.run(async (dispatch) => {
				dispatch({ type: 'deactivateVoiceInput' });
			})];
		}
	}

	case 'speechDetected': {
		if (!state.vadState) return [state, Effect.none()];

		// User started speaking - reset silence duration
		return [
			{
				...state,
				vadState: {
					...state.vadState,
					isSpeaking: true,
					silenceDuration: 0
				}
			},
			Effect.none()
		];
	}

	case 'silenceDetected': {
		if (!state.vadState) return [state, Effect.none()];

		const newSilenceDuration = state.vadState.silenceDuration + 100;

		// Check if we've hit the threshold
		if (newSilenceDuration >= state.vadState.autoSendThreshold) {
			// Trigger auto-send
			return [
				{
					...state,
					vadState: {
						...state.vadState,
						isSpeaking: false,
						silenceDuration: 0
					}
				},
				Effect.run(async (dispatch) => {
					dispatch({ type: 'autoSendTriggered' });
				})
			];
		}

		// Update silence duration
		return [
			{
				...state,
				vadState: {
					...state.vadState,
					isSpeaking: false,
					silenceDuration: newSilenceDuration
				}
			},
			Effect.none()
		];
	}

	case 'autoSendTriggered':
	case 'manualSendRequested': {
		const audioManager = deps.getAudioManager(state._audioManagerId!);
		if (!audioManager) {
			return [state, Effect.none()];
		}

		// Stop current recording, send audio, restart recording
		return [
			{
				...state,
				status: 'processing'
			},
			Effect.run(async (dispatch) => {
				try {
					// Stop recording and get audio blob
					const audioBlob = await audioManager.stopRecording();

					// Send for transcription
					const transcript = await deps.transcribeAudio(audioBlob);

					// Restart recording immediately
					audioManager.startRecording();

					// Dispatch completion
					dispatch({
						type: 'audioProcessingComplete',
						audioBlob,
						transcript
					});
				} catch (error) {
					dispatch({
						type: 'audioProcessingFailed',
						error: error instanceof Error ? error.message : 'Processing failed'
					});
				}
			})
		];
	}

	case 'liveTranscriptUpdated': {
		return [
			{
				...state,
				liveTranscript: action.text
			},
			Effect.none()
		];
	}

	// === Cleanup === //

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

		default: {
			const _exhaustive: never = action;
			return [state, Effect.none()];
		}
	}
};
