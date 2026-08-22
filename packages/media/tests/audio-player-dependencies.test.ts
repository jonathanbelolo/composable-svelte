/**
 * Dependencies a consumer supplies must actually be called.
 *
 * `AudioPlayerDependencies` declared ten members and four were never invoked:
 * `loadVolume`, `loadSpeed`, `trackSkip`, `generateId` — alongside
 * `createAudioElement`. That is not merely unused surface. The styleguide's own
 * `AudioPlayerDemo` implements `loadVolume` and `loadSpeed` against
 * `localStorage` and passes `trackSkip` for analytics, and gets silence: volume
 * and speed are *saved* on every change and never restored on the next visit.
 * A shipped demo doing the documented thing and getting nothing is a defect, not
 * a gap.
 *
 * `saveVolume` / `saveSpeed` / `trackPlayback` were wired all along, which is
 * what makes the asymmetry obvious once you look: every write had a hook and no
 * read did.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { audioPlayerReducer } from '../src/lib/audio-player/reducer.js';
import { createInitialAudioPlayerState } from '../src/lib/audio-player/types.js';
import type { AudioPlayerAction, AudioPlayerState } from '../src/lib/audio-player/types.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

const track = { id: 't1', title: 'One', url: 'about:blank' };

function makeStore(deps: Record<string, unknown> = {}) {
	const store = createStore<AudioPlayerState, AudioPlayerAction>({
		initialState: createInitialAudioPlayerState(),
		reducer: audioPlayerReducer,
		dependencies: deps as never
	});
	cleanup.push(() => store.destroy?.());
	return store;
}

describe('restoring saved preferences', () => {
	it('applies a stored volume', async () => {
		const store = makeStore({ loadVolume: () => 0.25 });

		store.dispatch({ type: 'restorePreferences' });
		await wait(30);

		expect(store.state.volume, 'loadVolume was supplied and ignored').toBe(0.25);
	});

	it('applies a stored speed', async () => {
		const store = makeStore({ loadSpeed: () => 1.5 });

		store.dispatch({ type: 'restorePreferences' });
		await wait(30);

		expect(store.state.playbackSpeed).toBe(1.5);
	});

	it('leaves the defaults alone when nothing is stored', async () => {
		// A consumer with no persistence must not have its volume reset to zero by
		// an undefined return.
		const store = makeStore({ loadVolume: () => undefined, loadSpeed: () => undefined });
		const { volume, playbackSpeed } = store.state;

		store.dispatch({ type: 'restorePreferences' });
		await wait(30);

		expect(store.state.volume).toBe(volume);
		expect(store.state.playbackSpeed).toBe(playbackSpeed);
	});

	it('is harmless when the dependencies are absent', async () => {
		const store = makeStore({});
		store.dispatch({ type: 'restorePreferences' });
		await wait(30);

		expect(store.state.volume).toBe(1);
	});

	it('clamps a stored volume that is out of range', async () => {
		// `localStorage` is user-editable, so a restore is untrusted input.
		const store = makeStore({ loadVolume: () => 5 });
		store.dispatch({ type: 'restorePreferences' });
		await wait(30);

		expect(store.state.volume).toBe(1);
	});
});

describe('skip tracking', () => {
	const two = [track, { id: 't2', title: 'Two', url: 'about:blank' }];

	function playerWith(deps: Record<string, unknown>) {
		const store = createStore<AudioPlayerState, AudioPlayerAction>({
			initialState: createInitialAudioPlayerState(),
			reducer: audioPlayerReducer,
			dependencies: deps as never
		});
		cleanup.push(() => store.destroy?.());
		store.dispatch({ type: 'loadPlaylist', tracks: two });
		return store;
	}

	it('reports the track skipped to on next', async () => {
		// `trackSkip` is about skipping *tracks*: the shipped consumer logs
		// "Track skipped: {title}" and its declared type takes an `AudioTrack`.
		// Wiring it to skipForward/skipBackward seeking, as I first did, would have
		// called it with the wrong thing entirely.
		const skipped: string[] = [];
		const store = playerWith({ trackSkip: (t: { title: string }) => skipped.push(t.title) });

		store.dispatch({ type: 'next' });
		await wait(30);

		expect(skipped, 'trackSkip was supplied and never called').toEqual(['Two']);
	});

	it('reports the track skipped to on previous', async () => {
		const skipped: string[] = [];
		const store = playerWith({ trackSkip: (t: { title: string }) => skipped.push(t.title) });
		store.dispatch({ type: 'trackSelected', index: 1 });
		await wait(10);

		store.dispatch({ type: 'previous' });
		await wait(30);

		expect(skipped).toContain('One');
	});

	it('still changes track when no tracker is supplied', async () => {
		const store = playerWith({});
		store.dispatch({ type: 'next' });
		await wait(30);

		expect(store.state.currentTrackIndex).toBe(1);
	});
});
