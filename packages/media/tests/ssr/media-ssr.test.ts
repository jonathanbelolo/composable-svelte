/**
 * Server rendering of every public media component allocates no native media
 * resource and touches no browser global.
 *
 * Browser mode never runs the server build. The native constructors are
 * installed as spies, so an allocation during render is a failed assertion
 * rather than a ReferenceError that a try/catch could hide.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';
import { createStore } from '@composable-svelte/core';
import MinimalAudioPlayer from '../../src/lib/audio-player/MinimalAudioPlayer.svelte';
import FullAudioPlayer from '../../src/lib/audio-player/FullAudioPlayer.svelte';
import PlaylistView from '../../src/lib/audio-player/PlaylistView.svelte';
import VideoEmbed from '../../src/lib/video-embed/VideoEmbed.svelte';
import VoiceInput from '../../src/lib/voice-input/VoiceInput.svelte';
import { audioPlayerReducer } from '../../src/lib/audio-player/reducer.js';
import { voiceInputReducer } from '../../src/lib/voice-input/reducer.js';
import { createInitialVoiceInputState } from '../../src/lib/voice-input/types.js';
import { createLibrary, loaded, track } from '../fixtures/managed-players.js';
import { createComposer, fakeDependencies } from '../fixtures/managed-voice.js';
import ManagedPlayer from '../recipes/ManagedPlayer.svelte';
import ManagedVoice from '../recipes/ManagedVoice.svelte';

const natives = ['Audio', 'AudioContext', 'MediaRecorder'] as const;
let spies: Record<(typeof natives)[number], ReturnType<typeof vi.fn>>;
let getUserMedia: ReturnType<typeof vi.fn>;
beforeEach(() => {
	spies = Object.fromEntries(natives.map((name) => [name, vi.fn()])) as typeof spies;
	for (const name of natives) vi.stubGlobal(name, spies[name]);
	getUserMedia = vi.fn();
	vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
});
afterEach(() => {
	vi.unstubAllGlobals();
});
function expectNoNativeAllocation() {
	for (const name of natives) expect(spies[name], `${name} constructed during SSR`).not.toHaveBeenCalled();
	expect(getUserMedia).not.toHaveBeenCalled();
	expect(typeof window).toBe('undefined');
}

const playerStore = () =>
	createStore({ initialState: loaded(track('a')), reducer: audioPlayerReducer, dependencies: {} });

describe('server render', () => {
	it.each([
		['MinimalAudioPlayer', MinimalAudioPlayer],
		['FullAudioPlayer', FullAudioPlayer]
	] as const)('%s renders the track from a standalone store', (_, Component) => {
		const { body } = render(Component, { props: { store: playerStore(), id: 'server-player' } });
		expect(body).toContain('aria-label="Audio player"');
		expect(body).toContain('>A<');
		expectNoNativeAllocation();
	});

	it('PlaylistView renders its rows', () => {
		const { body } = render(PlaylistView, { props: { store: playerStore() } });
		expect(body).toContain('role="list"');
		expect(body).toContain('>A<');
		expectNoNativeAllocation();
	});

	it('VideoEmbed renders its iframe', () => {
		const { body } = render(VideoEmbed, { props: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } });
		expect(body).toContain('<iframe');
		expectNoNativeAllocation();
	});

	it.each(['push-to-talk', 'conversation'] as const)('VoiceInput (%s) renders its button without acquiring anything', (defaultMode) => {
		const fake = fakeDependencies();
		const store = createStore({
			initialState: createInitialVoiceInputState(),
			reducer: voiceInputReducer,
			dependencies: fake.dependencies
		});
		const { body } = render(VoiceInput, { props: { store, defaultMode } });
		expect(body).toContain('<button');
		expect(fake.created).toHaveLength(0);
		expect(store.state.status).toBe('idle');
		expectNoNativeAllocation();
	});

	it('managed views render, and a retired view renders nothing', () => {
		const { store, bind } = createLibrary(['a']);
		const view = bind('a');
		expect(render(FullAudioPlayer, { props: { store: view } }).body).toContain('aria-label="Audio player"');
		store.dispatch({ type: 'remove', id: 'a' });
		expect(render(FullAudioPlayer, { props: { store: view } }).body).not.toContain('aria-label');
		expect(render(PlaylistView, { props: { store: view } }).body).not.toContain('role="list"');

		const fake = fakeDependencies();
		const voice = createComposer(fake.dependencies);
		const voiceView = voice.bind();
		expect(render(VoiceInput, { props: { store: voiceView } }).body).toContain('<button');
		voice.store.dispatch({ type: 'stopDictating' });
		expect(render(VoiceInput, { props: { store: voiceView } }).body).not.toContain('<button');
		expect(fake.created).toHaveLength(0);
		expectNoNativeAllocation();
	});

	it('the README recipes render on the server', () => {
		expect(render(ManagedPlayer).body).toContain('Listen');
		// The recipe is typed against the built package, the fake against source;
		// the two `AudioManager` declarations differ only by identity.
		const dependencies = fakeDependencies().dependencies as never;
		expect(render(ManagedVoice, { props: { dependencies } }).body).toContain('Dictate');
		expectNoNativeAllocation();
	});
});
