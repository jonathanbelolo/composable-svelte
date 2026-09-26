/**
 * Voice input under managed composition, with a deterministic fake microphone.
 *
 * The parent composes the child's `transcriptionCompleted` into `drafts`, as the
 * README recipe does; `restart` replaces the child's lifetime in place.
 */
import { vi } from 'vitest';
import { Effect, createStore, type PresentationAction, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, keyedSlot, optionalSlot } from '@composable-svelte/core/application';
import { voiceInputReducer } from '../../src/lib/voice-input/reducer.js';
import {
	createInitialVoiceInputState,
	type VoiceInputAction,
	type VoiceInputDependencies,
	type VoiceInputState
} from '../../src/lib/voice-input/types.js';
import type { AudioManager } from '../../src/lib/voice-input/audio/audio-manager.js';

export function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((ok, fail) => {
		resolve = ok;
		reject = fail;
	});
	return { promise, resolve, reject };
}

/** A microphone whose permission prompt the test answers. */
export class FakeDevice {
	permission = deferred<void>();
	streamLive = false;
	recording = false;
	cleanups = 0;
	async requestMicrophone(): Promise<MediaStream> {
		await this.permission.promise;
		this.streamLive = true;
		return {} as MediaStream;
	}
	startRecording() {
		if (!this.streamLive) throw new Error('No live microphone');
		this.recording = true;
	}
	async stopRecording() {
		this.recording = false;
		return new Blob(['voice']);
	}
	startAudioLevelMonitoring() {
		return 1;
	}
	stopInterval() {}
	detectVoiceActivity() {
		return false;
	}
	cleanup() {
		this.cleanups++;
		this.streamLive = false;
		this.recording = false;
	}
}

/** An injected registry, plus the transcriptions it has been asked for. */
export function fakeDependencies() {
	const devices = new Map<string, FakeDevice>();
	const created: FakeDevice[] = [];
	const transcriptions: Array<ReturnType<typeof deferred<string>>> = [];
	const deleteAudioManager = vi.fn((id: string) => {
		devices.get(id)?.cleanup();
		devices.delete(id);
	});
	const dependencies: VoiceInputDependencies = {
		transcribeAudio: () => {
			const pending = deferred<string>();
			transcriptions.push(pending);
			return pending.promise;
		},
		createAudioManager: (id) => {
			const device = new FakeDevice();
			devices.set(id, device);
			created.push(device);
			return device as unknown as AudioManager;
		},
		getAudioManager: (id) => devices.get(id) as unknown as AudioManager | undefined,
		deleteAudioManager
	};
	return { dependencies, devices, created, transcriptions, deleteAudioManager };
}

export interface Composer {
	voice: VoiceInputState | null;
	drafts: string[];
}
export type ComposerAction =
	| { type: 'voice'; action: PresentationAction<VoiceInputAction> }
	| { type: 'dictate' }
	| { type: 'stopDictating' }
	| { type: 'restart' };

const composer: Reducer<Composer, ComposerAction, VoiceInputDependencies> = (state, action) => {
	switch (action.type) {
		case 'dictate':
			return [{ ...state, voice: state.voice ?? createInitialVoiceInputState() }, Effect.none()];
		case 'stopDictating':
			return [{ ...state, voice: null }, Effect.none()];
		case 'restart':
			return [{ ...state, voice: createInitialVoiceInputState() }, Effect.none()];
		case 'voice': {
			const child = action.action;
			if (child.type === 'presented' && child.action.type === 'transcriptionCompleted') {
				return [{ ...state, drafts: [...state.drafts, child.action.transcript] }, Effect.none()];
			}
			return [state, Effect.none()];
		}
	}
};

export const voiceSlot = optionalSlot<Composer, ComposerAction>()('voice');
export const composition = new ManagedIntegrationBuilder(composer)
	.with(voiceSlot, voiceInputReducer, { replaceOn: (action) => action.type === 'restart' })
	.build();

export function createComposer(dependencies: VoiceInputDependencies) {
	const store = createStore({
		initialState: { voice: createInitialVoiceInputState(), drafts: [] } satisfies Composer,
		dependencies,
		...composition
	});
	const bind = () => {
		const view = composition.bind(store, voiceSlot);
		if (!view) throw new Error('no live voice owner');
		return view;
	};
	return { store, bind };
}

/** Keyed voice slots sharing one injected registry, for sibling retirement. */
export interface Board {
	inputs: Array<{ id: string; state: VoiceInputState }>;
}
export type BoardAction =
	| { type: 'inputs'; id: string; action: VoiceInputAction }
	| { type: 'remove'; id: string };

export const inputs = keyedSlot<Board, BoardAction>()('inputs');

const board: Reducer<Board, BoardAction, VoiceInputDependencies> = (state, action) =>
	action.type === 'remove'
		? [{ inputs: state.inputs.filter((row) => row.id !== action.id) }, Effect.none()]
		: [state, Effect.none()];

export const boardComposition = new ManagedIntegrationBuilder<Board, BoardAction, VoiceInputDependencies>(board)
	.forEach(inputs, voiceInputReducer)
	.build();

export function createBoard(dependencies: VoiceInputDependencies, ids: string[]) {
	const store = createStore({
		initialState: { inputs: ids.map((id) => ({ id, state: createInitialVoiceInputState() })) } satisfies Board,
		dependencies,
		...boardComposition
	});
	const bind = (id: string) => {
		const view = boardComposition.bind(store, inputs.at(id));
		if (!view) throw new Error(`no live voice input ${id}`);
		return view;
	};
	return { store, bind };
}
