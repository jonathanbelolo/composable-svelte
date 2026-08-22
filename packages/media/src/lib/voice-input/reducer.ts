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
/**
 * Identifies the VAD polling subscription so it can be cancelled.
 *
 * Re-setting up the same id replaces the previous subscription rather than
 * stacking a second one, which is what `activateConversationMode` used to do on
 * every dispatch.
 */
const VAD_SUBSCRIPTION = 'voice-input-vad';

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
						// Through the dependency, not the module import: acquiring a
						// microphone is a device side effect, and this is the seam that
						// lets a test drive the permission path at all.
						const create = deps.createAudioManager ?? createAudioManager;
						const manager = create(managerId);
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

		// The same handoff for conversation mode, which was missing entirely.
		//
		// `activateConversationMode` returns early when permission has not been
		// granted yet — which is always true on a cold start — so without this the
		// panel rendered, said "Listening…", and nothing was ever recording. The
		// user saw a live-looking feature that did nothing.
		if (state.mode === 'conversation') {
			return [
				{
					...state,
					permission: 'granted',
					_audioManagerId: action.managerId
				},
				Effect.run(async (dispatch) => {
					dispatch({ type: 'activateConversationMode' });
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
							audioBlob
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
					audioLevel: 0,
					// Clearing this is what breaks the loop. Leaving it intact let
					// silence keep accumulating to the auto-send threshold, which
					// re-triggered the very failure being handled — a self-sustaining
					// error cycle at roughly 1.5s.
					vadState: null
				},
				Effect.batch(
					Effect.cancel(VAD_SUBSCRIPTION),
					Effect.run(async () => {
						deps.getAudioManager(state._audioManagerId!)?.cleanup();
					})
				)
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
					audioLevel: 0,
					// Clearing this is what breaks the loop. Left intact, silence kept
					// accumulating to the auto-send threshold and re-triggered the very
					// failure being handled — a self-sustaining cycle at ~1.5s.
					vadState: null
				},
				// Stop the VAD loop, but do NOT tear down the audio device: a failed
				// transcription is transient, and the user may retry. Only the two
				// explicit teardown actions release the microphone.
				Effect.cancel(VAD_SUBSCRIPTION)
			];
		}

	// === Conversation Mode === //

	case 'activateConversationMode': {
		// Already running. Without this guard every dispatch started another
		// recording, another level monitor and another VAD interval on top of the
		// live ones.
		if (state.mode === 'conversation' && state.status === 'recording') {
			return [state, Effect.none()];
		}

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
				// Start VAD monitoring loop.
				//
				// A subscription, not `Effect.run`: the store keeps the cleanup this
				// returns and runs it on `Effect.cancel(VAD_SUBSCRIPTION)` and on
				// `destroy()`. `Effect.run` leaves the store no handle at all, so the
				// interval this used to create was unreachable — never cleared on any
				// path, still dispatching ten times a second after teardown, and
				// pinning the AudioManager, its MediaStream and its AudioContext
				// against collection.
				Effect.subscription(VAD_SUBSCRIPTION, (dispatch) => {
					const vadCheck = setInterval(() => {
						const hasVoice = audioManager.detectVoiceActivity(15);
						if (hasVoice) {
							dispatch({ type: 'speechDetected' });
						} else {
							dispatch({ type: 'silenceDetected', duration: 0 });
						}
					}, 100); // Check every 100ms

					return () => clearInterval(vadCheck);
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

					// Restart recording immediately
					audioManager.startRecording();

					// Transcription happens in `audioProcessingComplete`, once.
					// This used to transcribe here as well and pass the result along,
					// and that case transcribed the same blob again and used *its*
					// result — two round-trips and two bills per utterance, with the
					// first answer thrown away.
					dispatch({
						type: 'audioProcessingComplete',
						audioBlob
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

	// === Cleanup === //

	case 'deactivateVoiceInput': {
			// `cleanup()` runs in the effect below, not here. A reducer is a pure
			// function of (state, action, deps) — calling into the audio device from
			// its body makes the transition unrepeatable and untestable, and is the
			// rule CLAUDE.md states first.

			return [
				{
					...state,
					mode: null,
					status: 'idle',
					vadState: null,
					audioLevel: 0,
					recordingStartTime: null,
					errorMessage: null
				},
				Effect.batch(
					Effect.cancel(VAD_SUBSCRIPTION),
					Effect.run(async () => {
						deps.getAudioManager(state._audioManagerId!)?.cleanup();
					})
				)
			];
		}

		default: {
			const _exhaustive: never = action;
			return [state, Effect.none()];
		}
	}
};
