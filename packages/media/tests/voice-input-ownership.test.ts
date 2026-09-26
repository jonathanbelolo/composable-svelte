/**
 * Who releases the microphone, and what reaches whom, when a mounted
 * `VoiceInput` goes away — standalone and under managed composition.
 *
 * The microphone belongs to the store: the reducer's `voice-input-microphone`
 * resource acquires it and releases it through the dependencies the store was
 * configured with. The component used to release it itself, through the
 * built-in registry, which skipped an injected `deleteAudioManager` entirely
 * and threw on `$store._audioManagerId` once a managed owner had retired.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { createStore } from '@composable-svelte/core';
import VoiceInput from '../src/lib/voice-input/VoiceInput.svelte';
import { voiceInputReducer } from '../src/lib/voice-input/reducer.js';
import { createInitialVoiceInputState, type VoiceInputAction, type VoiceInputDependencies } from '../src/lib/voice-input/types.js';
import { AudioManager } from '../src/lib/voice-input/audio/audio-manager.js';
import { getAudioManager as registered } from '../src/lib/voice-input/audio/audio-manager-registry.js';
import ManagedVoice from './recipes/ManagedVoice.svelte';
import VoiceRebind from './fixtures/VoiceRebind.svelte';
import { createBoard, createComposer, deferred, fakeDependencies, FakeDevice } from './fixtures/managed-voice.js';

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
	vi.restoreAllMocks();
});
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function place(Component: typeof VoiceInput | typeof ManagedVoice, props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.append(target);
	const component = mount(Component as typeof VoiceInput, { target, props: props as never });
	flushSync();
	let alive = true;
	const dispose = async () => {
		if (!alive) return;
		alive = false;
		await unmount(component);
		target.remove();
	};
	cleanups.push(dispose);
	return { target, dispose };
}
function press(target: Element, type: 'keydown' | 'keyup') {
	target.querySelector('button')!.dispatchEvent(new KeyboardEvent(type, { key: ' ', bubbles: true, cancelable: true }));
	flushSync();
}
/** Hold the push-to-talk button until the microphone is granted and recording. */
async function startRecording(target: Element, grant: () => void) {
	press(target, 'keydown');
	grant();
	await settle();
	flushSync();
}
function standalone(dependencies: VoiceInputDependencies) {
	const store = createStore({ initialState: createInitialVoiceInputState(), reducer: voiceInputReducer, dependencies });
	cleanups.push(() => store.destroy());
	const actions: VoiceInputAction[] = [];
	store.subscribeToActions?.((action) => {
		actions.push(action);
	});
	return { store, actions };
}

describe('standalone store: unmount releases through the store', () => {
	it('reacquiring a pooled device allows a later conversation to restart after send', async () => {
		const device = new FakeDevice();
		device.permission.resolve();
		const devices = new Map<string, FakeDevice>();
		const dependencies: VoiceInputDependencies = {
			transcribeAudio: async () => 'words',
			createAudioManager: (id) => {
				devices.set(id, device);
				return device as unknown as AudioManager;
			},
			getAudioManager: (id) => devices.get(id) as unknown as AudioManager | undefined,
			deleteAudioManager: (id) => {
				devices.get(id)?.cleanup();
				devices.delete(id);
			}
		};
		const { store } = standalone(dependencies);
		store.dispatch({ type: 'activateConversationMode' });
		await settle();
		expect(store.state.status).toBe('recording');
		store.dispatch({ type: 'deactivateVoiceInput' });
		expect(device.streamLive).toBe(false);
		store.dispatch({ type: 'activateConversationMode' });
		await settle();
		expect(store.state.status).toBe('recording');
		const starts = vi.spyOn(device, 'startRecording');
		store.dispatch({ type: 'manualSendRequested' });
		await settle();
		expect(starts).toHaveBeenCalledTimes(1);
		expect(store.state).toMatchObject({ mode: 'conversation', status: 'recording' });
	});

	it('an injected registry releases the device once, through its own deleteAudioManager', async () => {
		const fake = fakeDependencies();
		const { store, actions } = standalone(fake.dependencies);
		const view = place(VoiceInput, { store, onTranscript: vi.fn() });
		await startRecording(view.target, () => fake.created[0]!.permission.resolve());
		expect(store.state.status).toBe('recording');
		const id = store.state._audioManagerId!;

		await view.dispose();
		expect(fake.deleteAudioManager).toHaveBeenCalledTimes(1);
		expect(fake.deleteAudioManager).toHaveBeenCalledWith(id);
		expect(fake.created[0]!.cleanups).toBe(1);
		expect(fake.created[0]!.streamLive).toBe(false);
		// The store is left consistent, not recording against a released device.
		expect(store.state).toMatchObject({ status: 'idle', mode: null, _audioManagerId: null });

		const after = actions.length;
		store.destroy();
		await settle();
		expect(actions).toHaveLength(after);
		expect(fake.created[0]!.cleanups).toBe(1);
	});

	it('the built-in registry releases the device once and forgets it', async () => {
		vi.spyOn(AudioManager.prototype, 'requestMicrophone').mockResolvedValue({} as MediaStream);
		vi.spyOn(AudioManager.prototype, 'startRecording').mockImplementation(() => {});
		vi.spyOn(AudioManager.prototype, 'startAudioLevelMonitoring').mockReturnValue(1);
		const cleanup = vi.spyOn(AudioManager.prototype, 'cleanup');
		const { store } = standalone({ transcribeAudio: async () => '', getAudioManager: registered });
		const view = place(VoiceInput, { store, onTranscript: vi.fn() });
		await startRecording(view.target, () => {});
		const id = store.state._audioManagerId!;
		expect(registered(id)).toBeDefined();

		await view.dispose();
		expect(registered(id)).toBeUndefined();
		expect(cleanup).toHaveBeenCalledTimes(1);
		store.destroy();
		expect(cleanup).toHaveBeenCalledTimes(1);
	});

	it('unmounting during the permission prompt disposes a late grant and starts nothing', async () => {
		const fake = fakeDependencies();
		const { store } = standalone(fake.dependencies);
		// Conversation mode asks on mount: no key is held, so nothing but the
		// unmount itself can end the pending request.
		const view = place(VoiceInput, { store, onTranscript: vi.fn(), defaultMode: 'conversation' });
		expect(store.state.status).toBe('requesting-permission');

		await view.dispose();
		fake.created[0]!.permission.resolve();
		await settle();
		expect(fake.created[0]!.recording).toBe(false);
		expect(fake.created[0]!.streamLive).toBe(false);
		expect(fake.devices.size).toBe(0);
		expect(store.state.status).toBe('idle');
	});

	it('unmounting one of two standalone siblings mid-recording leaves the other recording', async () => {
		const fake = fakeDependencies();
		const first = standalone(fake.dependencies);
		const second = standalone(fake.dependencies);
		const a = place(VoiceInput, { store: first.store, onTranscript: vi.fn() });
		const b = place(VoiceInput, { store: second.store, onTranscript: vi.fn() });
		await startRecording(a.target, () => fake.created[0]!.permission.resolve());
		await startRecording(b.target, () => fake.created[1]!.permission.resolve());

		await a.dispose();
		expect(fake.created[0]!.streamLive).toBe(false);
		expect(fake.created[1]!.recording).toBe(true);
		expect(second.store.state.status).toBe('recording');
	});

	it('onTranscript still receives each accepted transcript once', async () => {
		const fake = fakeDependencies();
		const { store } = standalone(fake.dependencies);
		const onTranscript = vi.fn();
		const view = place(VoiceInput, { store, onTranscript });
		await startRecording(view.target, () => fake.created[0]!.permission.resolve());
		press(view.target, 'keyup');
		await settle();
		fake.transcriptions[0]!.resolve('standalone words');
		await settle();
		expect(onTranscript).toHaveBeenCalledTimes(1);
		expect(onTranscript).toHaveBeenCalledWith('standalone words');
	});
});

describe('unmount after the user finished an utterance', () => {
	/** Record, release the key, and leave the store with an accepted transcription pending. */
	async function finishUtterance(target: Element, fake: ReturnType<typeof fakeDependencies>, index = 0) {
		await startRecording(target, () => fake.created[index]!.permission.resolve());
		press(target, 'keyup');
		await settle();
	}
	const delivered = (actions: VoiceInputAction[]) =>
		actions.filter((action) => action.type === 'transcriptionCompleted');

	it('releases the microphone now, and the store still receives the transcript exactly once', async () => {
		const fake = fakeDependencies();
		const { store, actions } = standalone(fake.dependencies);
		const onTranscript = vi.fn();
		const view = place(VoiceInput, { store, onTranscript });
		await finishUtterance(view.target, fake);
		expect(store.state.status).toBe('processing');
		expect(fake.transcriptions).toHaveLength(1);

		await view.dispose();
		expect(fake.deleteAudioManager).toHaveBeenCalledTimes(1);
		expect(fake.created[0]!.streamLive).toBe(false);
		expect(fake.devices.size).toBe(0);
		expect(store.state).toMatchObject({ status: 'processing', _audioManagerId: null });

		fake.transcriptions[0]!.resolve('kept words');
		await settle();
		expect(delivered(actions)).toEqual([{ type: 'transcriptionCompleted', transcript: 'kept words' }]);
		// The callback belonged to the component, which is gone.
		expect(onTranscript).not.toHaveBeenCalled();
		expect(store.state).toMatchObject({ status: 'idle', mode: null, _pendingTranscriptions: [] });

		const after = actions.length;
		store.destroy();
		await settle();
		expect(actions).toHaveLength(after);
		expect(fake.created[0]!.cleanups).toBe(1);
	});

	it('a stop still in flight at unmount is transcribed and delivered once', async () => {
		const fake = fakeDependencies();
		const { store, actions } = standalone(fake.dependencies);
		const view = place(VoiceInput, { store, onTranscript: vi.fn() });
		await startRecording(view.target, () => fake.created[0]!.permission.resolve());
		const stop = deferred<Blob>();
		fake.created[0]!.stopRecording = () => stop.promise;
		press(view.target, 'keyup');
		expect(store.state._activeStop).not.toBeNull();

		await view.dispose();
		expect(fake.created[0]!.streamLive).toBe(false);
		stop.resolve(new Blob(['voice']));
		await settle();
		expect(fake.transcriptions).toHaveLength(1);
		fake.transcriptions[0]!.resolve('late stop');
		await settle();
		expect(delivered(actions)).toEqual([{ type: 'transcriptionCompleted', transcript: 'late stop' }]);
		expect(store.state.status).toBe('idle');
		expect(fake.deleteAudioManager).toHaveBeenCalledTimes(1);
	});

	it('a conversation keeps its accepted segment and drops the one still recording', async () => {
		const fake = fakeDependencies();
		const { store, actions } = standalone(fake.dependencies);
		const view = place(VoiceInput, { store, onTranscript: vi.fn(), defaultMode: 'conversation' });
		fake.created[0]!.permission.resolve();
		await settle();
		flushSync();
		expect(store.state).toMatchObject({ mode: 'conversation', status: 'recording' });
		store.dispatch({ type: 'manualSendRequested' });
		await settle();
		expect(store.state.status).toBe('recording');
		expect(fake.transcriptions).toHaveLength(1);

		await view.dispose();
		expect(fake.created[0]!.streamLive).toBe(false);
		expect(fake.created[0]!.recording).toBe(false);
		fake.transcriptions[0]!.resolve('accepted segment');
		await settle();
		expect(delivered(actions)).toEqual([{ type: 'transcriptionCompleted', transcript: 'accepted segment' }]);
		expect(store.state).toMatchObject({ status: 'idle', mode: null });
		expect(fake.transcriptions).toHaveLength(1);
		expect(fake.deleteAudioManager).toHaveBeenCalledTimes(1);
	});

	/** Enter conversation mode, then hold a manual send's stop in flight. */
	async function conversationStopInFlight(device: FakeDevice, dispatch: (action: VoiceInputAction) => void) {
		device.permission.resolve();
		await settle();
		flushSync();
		const stop = deferred<Blob>();
		device.stopRecording = () => stop.promise;
		const restarts = vi.spyOn(device, 'startRecording');
		dispatch({ type: 'manualSendRequested' });
		return { stop, restarts };
	}

	it('a conversation send still in flight at unmount is transcribed once and does not restart the recorder', async () => {
		const fake = fakeDependencies();
		const { store, actions } = standalone(fake.dependencies);
		const errors = vi.spyOn(console, 'error');
		const view = place(VoiceInput, { store, onTranscript: vi.fn(), defaultMode: 'conversation' });
		const device = fake.created[0]!;
		const { stop, restarts } = await conversationStopInFlight(device, store.dispatch);
		expect(store.state).toMatchObject({ mode: 'conversation', status: 'processing' });
		expect(store.state._activeStop).not.toBeNull();

		await view.dispose();
		expect(device.streamLive).toBe(false);
		stop.resolve(new Blob(['voice']));
		await settle();
		expect(restarts).not.toHaveBeenCalled();
		expect(device.recording).toBe(false);
		expect(fake.transcriptions).toHaveLength(1);
		fake.transcriptions[0]!.resolve('sent before unmount');
		await settle();
		expect(delivered(actions)).toEqual([{ type: 'transcriptionCompleted', transcript: 'sent before unmount' }]);
		expect(store.state).toMatchObject({ status: 'idle', mode: null, _activeStop: null, _pendingTranscriptions: [] });
		expect(actions.some((action) => action.type === 'audioProcessingFailed')).toBe(false);
		expect(fake.transcriptions).toHaveLength(1);
		expect(fake.deleteAudioManager).toHaveBeenCalledTimes(1);
		expect(errors).not.toHaveBeenCalled();
	});

	it('a live hand-bound owner receives a conversation send after the view unmounts', async () => {
		const fake = fakeDependencies();
		const { store, bind } = createComposer(fake.dependencies);
		cleanups.push(() => store.destroy());
		const voice = bind();
		const view = place(VoiceInput, { store: voice, defaultMode: 'conversation' });
		const { stop, restarts } = await conversationStopInFlight(fake.created[0]!, voice.dispatch);

		await view.dispose();
		stop.resolve(new Blob(['voice']));
		await settle();
		expect(restarts).not.toHaveBeenCalled();
		expect(fake.transcriptions).toHaveLength(1);
		fake.transcriptions[0]!.resolve('managed conversation');
		await settle();
		expect(store.state.drafts).toEqual(['managed conversation']);
		expect(store.state.voice).toMatchObject({ status: 'idle', mode: null });
	});

	it('destroying the store after conversation view detach cancels its in-flight stop', async () => {
		const fake = fakeDependencies();
		const { store, actions } = standalone(fake.dependencies);
		const view = place(VoiceInput, { store, defaultMode: 'conversation' });
		const { stop, restarts } = await conversationStopInFlight(fake.created[0]!, store.dispatch);
		await view.dispose();
		store.destroy();
		stop.resolve(new Blob(['voice']));
		await settle();
		expect(restarts).not.toHaveBeenCalled();
		expect(fake.transcriptions).toHaveLength(0);
		expect(delivered(actions)).toEqual([]);
	});

	it('owner retirement with a conversation send in flight cancels it: no transcript, no restart', async () => {
		const fake = fakeDependencies();
		const { store, bind } = createComposer(fake.dependencies);
		cleanups.push(() => store.destroy());
		const voice = bind();
		const view = place(VoiceInput, { store: voice, onTranscript: vi.fn(), defaultMode: 'conversation' });
		const device = fake.created[0]!;
		const { stop, restarts } = await conversationStopInFlight(device, voice.dispatch);
		expect(store.state.voice).toMatchObject({ mode: 'conversation', status: 'processing' });

		store.dispatch({ type: 'stopDictating' });
		flushSync();
		expect(device.streamLive).toBe(false);
		stop.resolve(new Blob(['voice']));
		await settle();
		await view.dispose();
		expect(restarts).not.toHaveBeenCalled();
		expect(fake.transcriptions).toHaveLength(0);
		expect(store.state.drafts).toEqual([]);
		expect(fake.deleteAudioManager).toHaveBeenCalledTimes(1);
	});

	it('destroying the store after unmount cancels the pending transcription', async () => {
		const fake = fakeDependencies();
		const { store, actions } = standalone(fake.dependencies);
		const view = place(VoiceInput, { store, onTranscript: vi.fn() });
		await finishUtterance(view.target, fake);
		await view.dispose();
		store.destroy();
		fake.transcriptions[0]!.resolve('too late');
		await settle();
		expect(delivered(actions)).toEqual([]);
		expect(fake.created[0]!.cleanups).toBe(1);
	});

	it('a hand-bound managed view: child unmount delivers to the parent, owner retirement does not', async () => {
		const fake = fakeDependencies();
		const { store, bind } = createComposer(fake.dependencies);
		cleanups.push(() => store.destroy());
		const warn = vi.spyOn(console, 'warn');
		const errors = vi.spyOn(console, 'error');

		// Child unmount while the owner lives on: the parent reducer gets the draft.
		const first = place(VoiceInput, { store: bind(), onTranscript: vi.fn() });
		await finishUtterance(first.target, fake, 0);
		await first.dispose();
		expect(fake.created[0]!.streamLive).toBe(false);
		fake.transcriptions[0]!.resolve('survives unmount');
		await settle();
		expect(store.state.drafts).toEqual(['survives unmount']);

		// Owner retirement while processing: the work belonged to the owner and is cancelled.
		const second = place(VoiceInput, { store: bind(), onTranscript: vi.fn() });
		await finishUtterance(second.target, fake, 1);
		expect(store.state.voice?.status).toBe('processing');
		store.dispatch({ type: 'stopDictating' });
		flushSync();
		expect(fake.created[1]!.streamLive).toBe(false);
		fake.transcriptions[1]!.resolve('retired owner');
		await settle();
		await second.dispose();
		expect(store.state.drafts).toEqual(['survives unmount']);
		expect(fake.deleteAudioManager).toHaveBeenCalledTimes(2);
		expect(warn).not.toHaveBeenCalled();
		expect(errors).not.toHaveBeenCalled();
	});
});

describe('live-to-live store swap', () => {
	it('moving VoiceInput from a live store to another releases the first once and reports only the second\'s utterances', async () => {
		const fake = fakeDependencies();
		const a = standalone(fake.dependencies);
		const b = standalone(fake.dependencies);
		const onTranscript = vi.fn();
		const target = document.createElement('div');
		document.body.append(target);
		const component = mount(VoiceRebind, { target, props: { store: a.store, onTranscript } });
		flushSync();
		cleanups.push(async () => {
			await unmount(component);
			target.remove();
		});

		// A finishes an utterance; its transcription is still pending at the swap.
		await startRecording(target, () => fake.created[0]!.permission.resolve());
		press(target, 'keyup');
		await settle();
		expect(fake.transcriptions).toHaveLength(1);

		component.rebind(b.store);
		flushSync();
		expect(fake.deleteAudioManager).toHaveBeenCalledTimes(1);
		expect(fake.created[0]!.streamLive).toBe(false);

		await startRecording(target, () => fake.created[1]!.permission.resolve());
		expect(b.store.state.status).toBe('recording');
		press(target, 'keyup');
		await settle();
		fake.transcriptions[1]!.resolve('from b');
		fake.transcriptions[0]!.resolve('from a');
		await settle();

		expect(onTranscript).toHaveBeenCalledTimes(1);
		expect(onTranscript).toHaveBeenCalledWith('from b');
		// A's store still owns A's accepted utterance.
		expect(a.actions.filter((action) => action.type === 'transcriptionCompleted')).toEqual([
			{ type: 'transcriptionCompleted', transcript: 'from a' }
		]);
		expect(fake.deleteAudioManager).toHaveBeenCalledTimes(1);
		expect(fake.created[1]!.streamLive).toBe(true);
	});

	it('moving VoiceInput off a store that is still recording ends that recording', async () => {
		const fake = fakeDependencies();
		const a = standalone(fake.dependencies);
		const b = standalone(fake.dependencies);
		const target = document.createElement('div');
		document.body.append(target);
		const component = mount(VoiceRebind, { target, props: { store: a.store, onTranscript: vi.fn() } });
		flushSync();
		cleanups.push(async () => {
			await unmount(component);
			target.remove();
		});
		await startRecording(target, () => fake.created[0]!.permission.resolve());
		expect(a.store.state.status).toBe('recording');
		component.rebind(b.store);
		flushSync();
		expect(a.store.state).toMatchObject({ status: 'idle', mode: null, _audioManagerId: null });
		expect(fake.created[0]!.cleanups).toBe(1);
		expect(fake.transcriptions).toHaveLength(0);
	});
});

describe('managed view', () => {
	it('retiring one of two keyed slots that share an injected registry leaves the other recording', async () => {
		const fake = fakeDependencies();
		const { store, bind } = createBoard(fake.dependencies, ['x', 'y']);
		cleanups.push(() => store.destroy());
		const x = place(VoiceInput, { store: bind('x'), onTranscript: vi.fn() });
		const y = place(VoiceInput, { store: bind('y'), onTranscript: vi.fn() });
		await startRecording(x.target, () => fake.created[0]!.permission.resolve());
		await startRecording(y.target, () => fake.created[1]!.permission.resolve());
		const yId = store.state.inputs[1]!.state._audioManagerId!;

		store.dispatch({ type: 'remove', id: 'x' });
		flushSync();
		expect(x.target.querySelector('button')).toBeNull();
		expect(fake.created[0]!.streamLive).toBe(false);
		expect(fake.deleteAudioManager).toHaveBeenCalledTimes(1);
		expect(fake.created[1]!).toMatchObject({ streamLive: true, recording: true });
		expect(fake.devices.get(yId)).toBe(fake.created[1]);
		expect(store.state.inputs[0]!.state.status).toBe('recording');
		await x.dispose();
		expect(fake.deleteAudioManager).toHaveBeenCalledTimes(1);
		expect(fake.created[1]!.recording).toBe(true);
	});

	it('retirement before teardown releases the device once and the component tears down without throwing', async () => {
		const fake = fakeDependencies();
		const { store, bind } = createComposer(fake.dependencies);
		cleanups.push(() => store.destroy());
		const errors = vi.spyOn(console, 'error');
		const onTranscript = vi.fn();
		const view = place(VoiceInput, { store: bind(), onTranscript });
		await startRecording(view.target, () => fake.created[0]!.permission.resolve());
		expect(store.state.voice?.status).toBe('recording');

		store.dispatch({ type: 'stopDictating' });
		flushSync();
		expect(view.target.querySelector('button')).toBeNull();
		expect(fake.deleteAudioManager).toHaveBeenCalledTimes(1);
		expect(fake.created[0]!.streamLive).toBe(false);

		await view.dispose();
		expect(fake.deleteAudioManager).toHaveBeenCalledTimes(1);
		expect(fake.created[0]!.cleanups).toBe(1);
		expect(errors).not.toHaveBeenCalled();
		expect(onTranscript).not.toHaveBeenCalled();
	});

	it('a transcription that resolves after replacement reaches neither the replacement nor the parent', async () => {
		const fake = fakeDependencies();
		const { store, bind } = createComposer(fake.dependencies);
		cleanups.push(() => store.destroy());
		const onTranscript = vi.fn();
		const old = place(VoiceInput, { store: bind(), onTranscript });
		await startRecording(old.target, () => fake.created[0]!.permission.resolve());
		press(old.target, 'keyup');
		await settle();
		expect(fake.transcriptions).toHaveLength(1);

		store.dispatch({ type: 'restart' });
		flushSync();
		const replacement = place(VoiceInput, { store: bind(), onTranscript });
		fake.transcriptions[0]!.resolve('from the retired owner');
		await settle();
		flushSync();

		expect(store.state.drafts).toEqual([]);
		expect(onTranscript).not.toHaveBeenCalled();
		expect(store.state.voice?.status).toBe('idle');
		expect(replacement.target.querySelector('button')).not.toBeNull();
	});

	it('onTranscript also works on the managed path, once per utterance', async () => {
		const fake = fakeDependencies();
		const { store, bind } = createComposer(fake.dependencies);
		cleanups.push(() => store.destroy());
		const onTranscript = vi.fn();
		const view = place(VoiceInput, { store: bind(), onTranscript });
		await startRecording(view.target, () => fake.created[0]!.permission.resolve());
		press(view.target, 'keyup');
		await settle();
		fake.transcriptions[0]!.resolve('managed words');
		await settle();
		expect(onTranscript).toHaveBeenCalledTimes(1);
		expect(onTranscript).toHaveBeenCalledWith('managed words');
		expect(store.state.drafts).toEqual(['managed words']);
	});

	it('a copy of a managed view still renders and dispatches, and says once that it cannot report transcripts', async () => {
		const fake = fakeDependencies();
		const { store, bind } = createComposer(fake.dependencies);
		cleanups.push(() => store.destroy());
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const view = bind();
		const copy = { state: view.state, dispatch: view.dispatch, select: view.select, subscribe: view.subscribe };
		const placed = place(VoiceInput, { store: copy, onTranscript: vi.fn() });
		await startRecording(placed.target, () => fake.created[0]!.permission.resolve());
		expect(store.state.voice?.status).toBe('recording');
		const notices = warn.mock.calls.filter(([message]) => String(message).startsWith('[VoiceInput]'));
		expect(notices).toHaveLength(1);
		expect(String(notices[0]![0])).toContain('wrapper or copy');
	});
});

describe('README recipe: the parent reducer owns the transcript', () => {
	it('composes one draft per utterance, survives the slot, and releases the device when dictation stops', async () => {
		const fake = fakeDependencies();
		const warn = vi.spyOn(console, 'warn');
		const errors = vi.spyOn(console, 'error');
		const app = place(ManagedVoice, { dependencies: fake.dependencies });
		const button = (name: string) =>
			[...app.target.querySelectorAll('button')].find((node) => node.textContent === name)!;
		const drafts = () => [...app.target.querySelectorAll('li')].map((node) => node.textContent);

		button('Dictate').click();
		flushSync();
		const voice = app.target.querySelector('.voice-input')!;
		await startRecording(voice, () => fake.created[0]!.permission.resolve());
		press(voice, 'keyup');
		await settle();
		fake.transcriptions[0]!.resolve('first thought');
		await settle();
		flushSync();
		expect(drafts()).toEqual(['first thought']);

		button('Stop dictating').click();
		flushSync();
		expect(app.target.querySelector('.voice-input')).toBeNull();
		expect(fake.deleteAudioManager).toHaveBeenCalledTimes(1);
		expect(fake.created[0]!.streamLive).toBe(false);

		// Business state outlives the child; a new session starts cleanly.
		button('Dictate').click();
		flushSync();
		const again = app.target.querySelector('.voice-input')!;
		await startRecording(again, () => fake.created[1]!.permission.resolve());
		press(again, 'keyup');
		await settle();
		fake.transcriptions[1]!.resolve('second thought');
		await settle();
		flushSync();
		expect(drafts()).toEqual(['first thought', 'second thought']);
		expect(warn).not.toHaveBeenCalled();
		expect(errors).not.toHaveBeenCalled();
	});
});
