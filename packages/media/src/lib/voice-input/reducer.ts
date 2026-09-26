import type { Reducer, EffectType } from '@composable-svelte/core';
import type { VoiceInputState, VoiceInputAction, VoiceInputDependencies } from './types.js';
import { Effect } from '@composable-svelte/core';
import { createAudioManager, deleteAudioManager, getAudioManager as getRegisteredAudioManager } from './audio/audio-manager-registry.js';

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

// Resource identity allocation belongs to effect execution, never reduction.
let managerSequence = 0;
const SESSION_WORK = 'voice-input-session-work';
function nextGeneration(value = 0): number {
	if (!Number.isSafeInteger(value) || value < 0 || value === Number.MAX_SAFE_INTEGER)
		throw new RangeError('Voice input generation exhausted or invalid');
	return value + 1;
}
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

/** Device work and wall-clock sampling happen only when the effect executes. */
const startRecording = (device: RecordingDevice & { stopRecording(): Promise<Blob> }, generation: number, stopPrevious = false): EffectType<VoiceInputAction> =>
	Effect.inGroup(Effect.cancellable('voice-input-start', async (dispatch, signal) => {
		try {
			if (stopPrevious) await device.stopRecording();
			if (signal?.aborted) return;
			device.startRecording();
			dispatch({ type: '_recordingStarted', generation, timestamp: Date.now() });
		} catch (error) {
			if (!signal?.aborted) dispatch({ type: '_operationFailed', generation, error: message(error, 'Recording failed') });
		}
	}), SESSION_WORK);
function message(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
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

/** The microphone resource owns permission work as well as the acquired device. */
const MICROPHONE_RESOURCE = 'voice-input-microphone';

/** Devices already released. A stop in flight at release keeps its segment but never restarts one. */
const releasedDevices = new WeakSet<object>();

function releaseAudioManager(deps: VoiceInputDependencies, id: string, captured = deps.getAudioManager(id)): void {
	if (!captured) return;
	releasedDevices.add(captured);
	if (getRegisteredAudioManager(id) === captured) {
		deleteAudioManager(id);
	} else if (deps.getAudioManager(id) === captured && deps.deleteAudioManager) {
		deps.deleteAudioManager(id);
	} else {
		// An injected factory may not expose registry deletion. A late acquisition
		// may also have been removed already: its newly acquired tracks still need
		// cleanup through the captured device, independently of registry lookup.
		captured.cleanup();
	}
}

function microphoneResource(deps: VoiceInputDependencies, generation: number): EffectType<VoiceInputAction> {
	return Effect.subscription(MICROPHONE_RESOURCE, dispatch => {
		managerSequence = nextGeneration(managerSequence);
		const managerId = `voice-input-${managerSequence}`;
		dispatch({ type: '_microphoneAllocated', generation, managerId });
		let live = true;
		let manager: ReturnType<NonNullable<VoiceInputDependencies['createAudioManager']>> | undefined;
		const dispose = () => { if (manager) releaseAudioManager(deps, managerId, manager); };
		const acquire = async () => {
			try {
				manager = (deps.createAudioManager ?? createAudioManager)(managerId);
				await manager.requestMicrophone();
				if (!live) { dispose(); return; }
				if (deps.getAudioManager(managerId) !== manager) {
					throw new Error('Audio manager not initialized');
				}
				// A custom factory may reuse an object from a prior session. This
				// successful acquisition gives it a new live lease.
				releasedDevices.delete(manager);
				dispatch({ type: 'microphonePermissionGranted', managerId });
			} catch (error) {
				if (!live) { dispose(); return; }
				// A custom factory may fail synchronously, before the subscription
				// setup returns. Release directly and clear ownership before reporting
				// denial, so cancellation cannot double-dispose the failed device.
				const failedManager = manager;
				manager = undefined;
				try {
					if (failedManager) releaseAudioManager(deps, managerId, failedManager);
				} finally {
					dispatch({ type: 'microphonePermissionDenied', managerId, error: error instanceof Error ? error.message : 'Permission denied' });
				}
			}
		};
		// Cleanup after a late acquisition can itself fail. Keep that asynchronous
		// error observed even after the resource's dispatch capability is retired.
		void acquire().catch(error => console.error('[VoiceInput] Microphone acquisition cleanup failed:', error));
		return () => { if (!live) return; live = false; dispose(); };
	});
}


function retireWork(): EffectType<VoiceInputAction> {
	return Effect.batch(Effect.cancelGroup(SESSION_WORK), Effect.cancel(VAD_SUBSCRIPTION), Effect.cancel(LEVEL_SUBSCRIPTION));
}
/** A completed/absent recorder can reject stop; termination still retires every loop.
 * Keep the microphone available for retry. Its resource owns final device cleanup. */
function stopDevice(deps: VoiceInputDependencies, id: string | null): EffectType<VoiceInputAction> {
	return Effect.run(async () => { try { await deps.getAudioManager(id!)?.stopRecording(); } catch { /* Already stopped or unavailable. */ } });
}
function stopAndSend(device: NonNullable<ReturnType<VoiceInputDependencies['getAudioManager']>>, generation: number, sequence: number, continuing: boolean): EffectType<VoiceInputAction> {
	return Effect.inGroup(Effect.cancellable('voice-input-stop', async (dispatch, signal) => {
		try {
			const audioBlob = await device.stopRecording();
			if (signal?.aborted) return;
			// Released mid-stop (the view unmounted): the accepted segment is still sent, the recorder stays off.
			const restart = continuing && !releasedDevices.has(device);
			if (restart) device.startRecording();
			if (signal?.aborted) return;
			dispatch({ type: '_audioStopped', generation, sequence, audioBlob, continuing: restart });
		} catch (error) {
			if (!signal?.aborted) dispatch({ type: '_operationFailed', generation, error: message(error, 'Processing failed') });
		}
	}), SESSION_WORK);
}
function transcribe(deps: VoiceInputDependencies, blob: Blob, generation: number, sequence: number): EffectType<VoiceInputAction> {
	return Effect.inGroup(Effect.cancellable(`voice-input-transcription-${sequence}`, async (dispatch, signal) => {
		try {
			const transcript = await deps.transcribeAudio(blob);
			if (!signal?.aborted) dispatch({ type: '_transcriptionResult', generation, sequence, transcript });
		} catch (error) {
			if (!signal?.aborted) dispatch({ type: '_operationFailed', generation, error: message(error, 'Transcription failed') });
		}
	}), SESSION_WORK);
}

export const voiceInputReducer: Reducer<VoiceInputState, VoiceInputAction, VoiceInputDependencies> = (state, action, deps) => {
	const generation = state._generation ?? 0;
	switch (action.type) {
		case 'requestMicrophonePermission':
		case '_requestRecordingPermission': {
			const next = nextGeneration(generation), previousId = state._audioManagerId;
			return [{ ...state, _generation: next, _recordAfterPermission: action.type === '_requestRecordingPermission' || (state.status === 'requesting-permission' && state._recordAfterPermission === true), _activeStop: null, _pendingTranscriptions: [], status: 'requesting-permission', errorMessage: null, recordingStartTime: null, vadState: null, audioLevel: 0, _audioManagerId: null, _ownsAudioManager: true },
				Effect.batch(retireWork(), !state._ownsAudioManager && previousId ? Effect.run(() => releaseAudioManager(deps, previousId)) : Effect.none(), microphoneResource(deps, next))];
		}
		case '_microphoneAllocated':
			return action.generation === generation && state.status === 'requesting-permission' ? [{ ...state, _audioManagerId: action.managerId }, Effect.none()] : [state, Effect.none()];
		case 'microphonePermissionGranted': {
			if (action.managerId !== state._audioManagerId) return [state, Effect.run(() => releaseAudioManager(deps, action.managerId))];
			if (state.status !== 'requesting-permission') return [state, Effect.none()];
			return [{ ...state, permission: 'granted', status: 'ready', _recordAfterPermission: false }, !state._recordAfterPermission || state.mode === null ? Effect.none() : Effect.run(dispatch => dispatch({ type: state.mode === 'conversation' ? 'activateConversationMode' : 'startPushToTalkRecording' }))];
		}
		case 'microphonePermissionDenied': {
			if (action.managerId && (action.managerId !== state._audioManagerId || state.status !== 'requesting-permission')) return [state, action.managerId === state._audioManagerId ? Effect.none() : Effect.run(() => releaseAudioManager(deps, action.managerId!))];
			if (!action.managerId && !state._ownsAudioManager && state.status !== 'requesting-permission') return [{ ...state, status: 'error', permission: 'denied', errorMessage: action.error }, Effect.none()];
			const managerId = state._audioManagerId;
			return [{ ...state, status: 'error', permission: 'denied', errorMessage: action.error, _audioManagerId: null, _ownsAudioManager: false }, Effect.batch(Effect.cancel(MICROPHONE_RESOURCE), !state._ownsAudioManager && managerId ? Effect.run(() => releaseAudioManager(deps, managerId)) : Effect.none())];
		}
		case 'activatePushToTalk': {
			if (state.mode !== 'conversation') return [{ ...state, _recordAfterPermission: false, mode: 'push-to-talk' }, Effect.none()];
			return [{ ...state, _recordAfterPermission: false, mode: 'push-to-talk', status: state.status === 'requesting-permission' ? state.status : state.permission === 'granted' ? 'ready' : 'idle', _generation: state.status === 'requesting-permission' ? generation : nextGeneration(generation), _activeStop: null, _pendingTranscriptions: [], recordingStartTime: null, audioLevel: 0, vadState: null }, Effect.batch(retireWork(), state.status === 'recording' || state.status === 'processing' ? stopDevice(deps, state._audioManagerId) : Effect.none())];
		}
		case 'startPushToTalkRecording':
		case 'activateConversationMode': {
			const mode = action.type === 'startPushToTalkRecording' ? 'push-to-talk' : 'conversation';
			if (state.status === 'requesting-permission') return [{ ...state, mode, _recordAfterPermission: true }, Effect.none()];
			if (state.mode === mode && (state.status === 'recording' || (mode === 'conversation' && state.status === 'processing'))) return [state, Effect.none()];
			const device = state._audioManagerId || state._ownsAudioManager === undefined ? deps.getAudioManager(state._audioManagerId!) : undefined;
			if (state.permission !== 'granted' || !device) return [{ ...state, mode }, Effect.run(dispatch => dispatch({ type: '_requestRecordingPermission' }))];
			const next = nextGeneration(generation);
			return [{ ...state, mode, status: 'recording', _generation: next, _activeStop: null, _pendingTranscriptions: [], recordingStartTime: null, audioLevel: 0, errorMessage: null, vadState: mode === 'conversation' ? { isSpeaking: false, silenceDuration: 0, autoSendThreshold: 1500 } : null },
				Effect.batch(retireWork(), levelMonitoring(device), mode === 'conversation' ? vadMonitoring(device) : Effect.none(), startRecording(device, next, state.status === 'recording' || state._activeStop != null))];
		}
		case '_recordingStarted':
			return action.generation === generation && state.status === 'recording' ? [{ ...state, recordingStartTime: action.timestamp }, Effect.none()] : [state, Effect.none()];
		case 'stopPushToTalkRecording':
		case 'autoSendTriggered':
		case 'manualSendRequested': {
			const continuing = action.type !== 'stopPushToTalkRecording';
			if (state.status !== 'recording' || state.mode !== (continuing ? 'conversation' : 'push-to-talk')) return [state, Effect.none()];
			const device = deps.getAudioManager(state._audioManagerId!);
			if (!device) return [state, Effect.none()];
			const sequence = nextGeneration(state._processingSequence);
			return [{ ...state, status: 'processing', recordingStartTime: continuing ? state.recordingStartTime : null, _activeStop: sequence, _processingSequence: sequence }, stopAndSend(device, generation, sequence, continuing)];
		}
		case '_audioStopped': {
			if (action.generation !== generation || state._activeStop !== action.sequence || state.status !== 'processing') return [state, Effect.none()];
			return [{ ...state, _activeStop: null, _pendingTranscriptions: [...(state._pendingTranscriptions ?? []), action.sequence], status: action.continuing ? 'recording' : 'processing', audioLevel: 0, vadState: state.vadState ? { ...state.vadState, isSpeaking: false, silenceDuration: 0 } : null },
				Effect.batch(action.continuing ? Effect.none() : Effect.batch(Effect.cancel(VAD_SUBSCRIPTION), Effect.cancel(LEVEL_SUBSCRIPTION)), transcribe(deps, action.audioBlob, generation, action.sequence))];
		}
		case 'audioProcessingComplete': {
			// Compatibility entry for explicitly supplied audio; framework stops use the tagged handoff.
			const sequence = nextGeneration(state._processingSequence);
			return [{ ...state, errorMessage: null, _processingSequence: sequence, _pendingTranscriptions: [...(state._pendingTranscriptions ?? []), sequence], status: state.mode === 'conversation' ? 'recording' : 'processing' }, transcribe(deps, action.audioBlob, generation, sequence)];
		}
		case '_transcriptionResult': {
			if (action.generation !== generation || !(state._pendingTranscriptions ?? []).includes(action.sequence)) return [state, Effect.none()];
			const pending = state._pendingTranscriptions!.filter(id => id !== action.sequence);
			return [{ ...state, _pendingTranscriptions: pending, ...(state.mode === 'conversation' ? {} : { status: pending.length ? 'processing' as const : 'idle' as const, mode: state.mode, recordingStartTime: null, audioLevel: 0, vadState: null }), errorMessage: null }, Effect.run(dispatch => dispatch({ type: 'transcriptionCompleted', transcript: action.transcript }))];
		}
		case 'transcriptionCompleted': return [state, Effect.none()];
		case '_operationFailed':
			return action.generation === generation
				? voiceInputReducer(state, { type: 'audioProcessingFailed', error: action.error }, deps)
				: [state, Effect.none()];
		case 'audioProcessingFailed':
			return [{ ...state, _generation: nextGeneration(generation), _activeStop: null, _pendingTranscriptions: [], status: 'error', errorMessage: action.error, mode: null, recordingStartTime: null, audioLevel: 0, vadState: null }, Effect.batch(retireWork(), stopDevice(deps, state._audioManagerId))];
		case 'cancelPushToTalkRecording': {
			const pendingPermission = state.status === 'requesting-permission';
			return [{ ...state, _generation: nextGeneration(generation), _activeStop: null, _pendingTranscriptions: [], status: 'idle', mode: null, recordingStartTime: null, audioLevel: 0, vadState: null, errorMessage: null, ...(pendingPermission ? { _audioManagerId: null, _ownsAudioManager: false } : {}) }, Effect.batch(retireWork(), pendingPermission ? Effect.cancel(MICROPHONE_RESOURCE) : stopDevice(deps, state._audioManagerId))];
		}
		case 'deactivateVoiceInput': {
			const id = state._audioManagerId;
			return [{ ...state, _generation: nextGeneration(generation), _activeStop: null, _pendingTranscriptions: [], mode: null, status: 'idle', vadState: null, audioLevel: 0, recordingStartTime: null, errorMessage: null, _audioManagerId: null, _ownsAudioManager: false }, Effect.batch(retireWork(), Effect.cancel(MICROPHONE_RESOURCE), id && !state._ownsAudioManager ? Effect.run(() => releaseAudioManager(deps, id)) : Effect.none())];
		}
		case '_releaseDevice': {
			// The view went away while the store lives on. Nothing still depends on
			// the microphone once the user has finished an utterance, so the device
			// and its loops go now — but a stop the user already asked for (a
			// conversation send included), and any transcription already under way,
			// keep their generation and deliver `transcriptionCompleted` to whoever
			// still owns the store. Anything not yet accepted — a permission prompt, a
			// recording nobody stopped — ends exactly as `deactivateVoiceInput` ends it.
			const stopping = state.status === 'processing' && state._activeStop != null;
			if (!stopping && !(state._pendingTranscriptions ?? []).length) {
				return voiceInputReducer(state, { type: 'deactivateVoiceInput' }, deps);
			}
			const id = state._audioManagerId;
			return [{ ...state, mode: null, status: 'processing', _recordAfterPermission: false, _activeStop: stopping ? state._activeStop : null, vadState: null, audioLevel: 0, recordingStartTime: null, errorMessage: null, _audioManagerId: null, _ownsAudioManager: false },
				Effect.batch(
					Effect.cancel(VAD_SUBSCRIPTION), Effect.cancel(LEVEL_SUBSCRIPTION), Effect.cancel('voice-input-start'),
					// A conversation stop in flight sees the release and settles without restarting.
					Effect.cancel(MICROPHONE_RESOURCE),
					id && !state._ownsAudioManager ? Effect.run(() => releaseAudioManager(deps, id)) : Effect.none())];
		}
		case 'conversationModeToggled': return [state, Effect.run(dispatch => dispatch({ type: action.enabled ? 'activateConversationMode' : 'deactivateVoiceInput' }))];
		case 'audioLevelUpdated': return [{ ...state, audioLevel: action.level }, Effect.none()];
		case 'speechDetected': return state.vadState ? [{ ...state, vadState: { ...state.vadState, isSpeaking: true, silenceDuration: 0 } }, Effect.none()] : [state, Effect.none()];
		case 'silenceDetected': {
			if (!state.vadState || state.mode !== 'conversation' || state.status !== 'recording') return [state, Effect.none()];
			// Silence is meaningful only after this utterance has contained speech.
			if (!state.vadState.isSpeaking && state.vadState.silenceDuration === 0) return [state, Effect.none()];
			const duration = state.vadState.silenceDuration + action.duration;
			const send = duration >= state.vadState.autoSendThreshold;
			return [{ ...state, vadState: { ...state.vadState, isSpeaking: false, silenceDuration: send ? 0 : duration } }, send ? Effect.run(dispatch => dispatch({ type: 'autoSendTriggered' })) : Effect.none()];
		}
		default: { const exhaustive: never = action; return [state, Effect.none()]; }
	}
};
