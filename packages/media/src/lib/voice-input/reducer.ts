import type { Reducer, EffectType } from '@composable-svelte/core';
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

/**
 * Identifies the audio-level monitoring subscription.
 *
 * `startAudioLevelMonitoring` creates a 20 fps interval and hands back an id
 * that only `stopInterval` or a full `cleanup()` can clear. Started from a bare
 * `Effect.run`, that id went nowhere and the store held no handle to it — the
 * same defect the VAD loop had, in a second place, and reachable from
 * *both* modes rather than just conversation. Owning it in a subscription means
 * re-entry replaces it instead of stacking, and `destroy()` reaches it.
 */
const LEVEL_SUBSCRIPTION = 'voice-input-level';

/**
 * Monotonic, not `Date.now()`.
 *
 * Two `requestMicrophonePermission` dispatches inside the same millisecond
 * produced the same id — reachable, since `activateConversationMode` dispatches
 * it from its ungranted branch with nothing debouncing. `createAudioManager`
 * overwrites the registry entry, so the first `AudioManager` was orphaned
 * holding a live `MediaStream` that nothing could ever reach to `cleanup()`.
 * Two `VoiceInput` instances mounting in one tick collided the same way, and
 * then one unmounting killed the other's microphone.
 */
let _managerSeq = 0;

/** How often the VAD loop samples the analyser, in milliseconds. */
const VAD_PERIOD_MS = 100;

/** How often the level meter samples, in milliseconds (20 fps). */
const LEVEL_PERIOD_MS = 50;

/**
 * The minimum surface of the audio manager these effects need.
 *
 * Narrower than `AudioManager` on purpose: it keeps the builders honest about
 * what they touch, and it is what a test fake has to provide.
 */
interface RecordingDevice {
	startRecording(): void;
	startAudioLevelMonitoring(callback: (level: number) => void, intervalMs?: number): number;
	stopInterval(id: number): void;
	detectVoiceActivity(threshold?: number): boolean;
}

/** Start the recorder, reporting a failure as an action rather than throwing. */
const startRecording = <A extends VoiceInputAction>(device: RecordingDevice): EffectType<A> =>
	Effect.run<A>(async (dispatch) => {
		try {
			device.startRecording();
		} catch (error) {
			dispatch({
				type: 'audioProcessingFailed',
				error: error instanceof Error ? error.message : 'Recording failed'
			} as A);
		}
	});

/**
 * Own the level-meter interval.
 *
 * `startAudioLevelMonitoring` returns an id that only `stopInterval` or a full
 * `cleanup()` clears. Called from a bare `Effect.run` the id was dropped on the
 * floor, so every re-entry stacked another 20 fps interval and nothing short of
 * releasing the microphone could stop any of them.
 */
const levelMonitoring = <A extends VoiceInputAction>(device: RecordingDevice): EffectType<A> =>
	Effect.subscription<A>(LEVEL_SUBSCRIPTION, (dispatch) => {
		const id = device.startAudioLevelMonitoring((level) => {
			dispatch({ type: 'audioLevelUpdated', level } as A);
		}, LEVEL_PERIOD_MS);
		return () => device.stopInterval(id);
	});

/**
 * Own the voice-activity polling loop.
 *
 * A subscription, not `Effect.run`: the store keeps the cleanup this returns
 * and runs it on `Effect.cancel(VAD_SUBSCRIPTION)` and on `destroy()`.
 * `Effect.run` leaves the store no handle at all, so the interval this used to
 * create was unreachable — never cleared on any path, still dispatching ten
 * times a second after teardown, and pinning the AudioManager, its MediaStream
 * and its AudioContext against collection.
 */
const vadMonitoring = <A extends VoiceInputAction>(device: RecordingDevice): EffectType<A> =>
	Effect.subscription<A>(VAD_SUBSCRIPTION, (dispatch) => {
		const timer = setInterval(() => {
			if (device.detectVoiceActivity(15)) {
				dispatch({ type: 'speechDetected' } as A);
			} else {
				dispatch({ type: 'silenceDetected', duration: VAD_PERIOD_MS } as A);
			}
		}, VAD_PERIOD_MS);
		return () => clearInterval(timer);
	});

export const voiceInputReducer: Reducer<
	VoiceInputState,
	VoiceInputAction,
	VoiceInputDependencies
> = (state, action, deps) => {
	switch (action.type) {
		// === Microphone Permission === //

		case 'requestMicrophonePermission': {
			_managerSeq += 1;
			const managerId = `voice-input-${_managerSeq}`;

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
					mode: 'push-to-talk',
					status: 'recording',
					recordingStartTime: Date.now(),
					audioLevel: 0,
					// Push-to-talk is also an *escape* from conversation recording: the
					// mic button is live while a conversation is running. Leaving the
					// VAD state behind let auto-send keep firing while nominally in
					// push-to-talk.
					vadState: null,
					// A new attempt clears the last one's error. Nothing else on any
					// push-to-talk path cleared it, so a single failed transcription
					// left the alert on screen for the rest of the session.
					errorMessage: null
				},
				Effect.batch(
					Effect.cancel(VAD_SUBSCRIPTION),
					// Monitoring before recording, deliberately — see the same ordering
					// note in `activateConversationMode`.
					levelMonitoring(audioManager),
					startRecording(audioManager)
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
			// The `stopRecording()` call that used to sit here ran in the reducer
			// body, outside any effect — the same purity violation the other two
			// sites had, missed because this case was edited for `vadState` without
			// looking six lines up. It is an effect now.
			const audioManagerId = state._audioManagerId;

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
					vadState: null,
					errorMessage: null
				},
				Effect.batch(
					Effect.cancel(VAD_SUBSCRIPTION),
					Effect.cancel(LEVEL_SUBSCRIPTION),
					// Stop the recorder, but do *not* `cleanup()` the manager: cancelling
					// an utterance must not release the microphone, or the next press
					// re-prompts for permission. Only the explicit teardown does that.
					Effect.run(async () => {
						await deps.getAudioManager(audioManagerId!)?.stopRecording();
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
			// This case was written for push-to-talk, where finishing an utterance
			// ends the session. `autoSendTriggered` then routed conversation mode
			// through it too — and conversation mode is a *continuing* session whose
			// recorder that effect has already restarted.
			//
			// Resetting to `mode: null` there unmounted the panel (VoiceInput gates
			// on `status === 'recording' || mode === 'conversation'`) while the
			// microphone stayed live, `vadState` stayed populated and the VAD loop
			// kept polling — so auto-send re-fired every 1.5s, one transcription
			// round-trip and one bill each, with no UI left to stop it and the
			// transcript history wiped by the mode change. The feature was unusable
			// past its first sentence, and this batch is what made that path
			// reachable by fixing the activation.
			const continuing = state.mode === 'conversation';

			return [
				continuing
					? {
							...state,
							// The recorder is already running again; reflect that rather
							// than claiming idle.
							status: 'recording',
							audioLevel: 0,
							errorMessage: null,
							vadState: state.vadState
								? { ...state.vadState, isSpeaking: false, silenceDuration: 0 }
								: null
						}
					: {
							...state,
							status: 'idle',
							mode: null,
							recordingStartTime: null,
							audioLevel: 0,
							errorMessage: null,
							vadState: null
						},
				Effect.batch(
					// Push-to-talk is done with the device loops; conversation is not.
					continuing ? Effect.none() : Effect.cancel(VAD_SUBSCRIPTION),
					continuing ? Effect.none() : Effect.cancel(LEVEL_SUBSCRIPTION),
					Effect.run(async (dispatch) => {
						try {
							// Transcribed here and only here. `autoSendTriggered` used to
							// transcribe the same blob first and pass the result along,
							// which this case then discarded in favour of its own second
							// round-trip.
							const transcript = await deps.transcribeAudio(action.audioBlob);
							dispatch({ type: 'transcriptionCompleted', transcript });
						} catch (error) {
							dispatch({
								type: 'audioProcessingFailed',
								error: error instanceof Error ? error.message : 'Transcription failed'
							});
						}
					})
				)
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
				// Stop both device loops, but do NOT tear down the audio device: a
				// failed transcription is transient and the user may retry. Only the
				// two explicit teardown actions release the microphone.
				Effect.batch(Effect.cancel(VAD_SUBSCRIPTION), Effect.cancel(LEVEL_SUBSCRIPTION))
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
			// Order is load-bearing, and it is the reverse of what reads naturally.
			//
			// `Effect.batch` runs its members in order, synchronously, and an
			// `Effect.run` body executes up to its first `await` inside that loop —
			// so a throwing `startRecording()` dispatches `audioProcessingFailed`
			// *re-entrantly*, before later members have run. With recording first,
			// that action's `Effect.cancel` found an empty subscription table, did
			// nothing, and the batch then installed the very intervals it had just
			// tried to cancel: a leak with no remaining handle, which is exactly the
			// failure this subscription rewrite exists to prevent.
			//
			// Installing the subscriptions first means the cancel always has
			// something to find.
			Effect.batch(
				levelMonitoring(audioManager),
				vadMonitoring(audioManager),
				startRecording(audioManager)
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

		// `action.duration`, not a second hardcoded 100. The interval reports the
		// period it actually observed; browsers throttle background-tab timers to
		// >= 1s, so a hardcoded increment made a backgrounded conversation
		// accumulate 100ms of "silence" per real second and stretched the 1.5s
		// auto-send threshold to 15s.
		const newSilenceDuration = state.vadState.silenceDuration + action.duration;

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
					Effect.cancel(LEVEL_SUBSCRIPTION),
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
