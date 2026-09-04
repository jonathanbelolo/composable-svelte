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
import type { AudioPlayerDependencies } from '../src/lib/audio-player/types.js';
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

// Typed against the real interface rather than `Record<string, unknown>` cast
// through `as never`. The cast made a renamed dependency member invisible to
// `tsc` here — in a file whose whole subject is that a dependency a consumer
// passes must actually be called.
function makeStore(deps: AudioPlayerDependencies = {}) {
	const store = createStore<AudioPlayerState, AudioPlayerAction>({
		initialState: createInitialAudioPlayerState(),
		reducer: audioPlayerReducer,
		dependencies: deps
	});
	cleanup.push(() => store.destroy?.());
	return store;
}

/** `toContain` would not notice a duplicate call; `toEqual` on the whole log does. */
function trackTitles(log: string[]) {
	return log;
}

describe('restoring a hostile stored value', () => {
	// These come back from storage the user can edit, and the shipped consumer
	// reads them with a bare `parseFloat`.
	it('ignores a NaN volume rather than poisoning the audio element', async () => {
		// `clamp(NaN, 0, 1)` is `NaN` — `Math.min(Math.max(NaN, 0), 1)` propagates.
		// `audio.volume = NaN` throws a TypeError inside the sync effect that also
		// drives loading, play/pause and seeking, so one corrupt key bricked the
		// whole player for the session.
		const store = makeStore({ loadVolume: () => Number.NaN });
		const before = store.state.volume;
		store.dispatch({ type: 'restorePreferences' });
		await wait(30);

		expect(store.state.volume).toBe(before);
		expect(Number.isFinite(store.state.volume)).toBe(true);
	});

	it('clamps a stored speed, as it already clamped volume', async () => {
		// `speedChanged` clamps to [0.25, 2]; the restore path did not, despite its
		// own comment saying it did. `playbackRate` throws out of range.
		const store = makeStore({ loadSpeed: () => 50 });
		store.dispatch({ type: 'restorePreferences' });
		await wait(30);

		expect(store.state.playbackSpeed).toBeLessThanOrEqual(2);
		expect(store.state.playbackSpeed).toBeGreaterThanOrEqual(0.25);
	});

	it('still restores speed when the volume loader throws', async () => {
		// `localStorage.getItem` throws SecurityError in a sandboxed iframe and
		// under Safari's privacy modes. With one shared try/catch, a throwing
		// `loadVolume` meant `loadSpeed` was never called at all.
		const store = makeStore({
			loadVolume: () => {
				throw new Error('SecurityError');
			},
			loadSpeed: () => 1.5
		});
		store.dispatch({ type: 'restorePreferences' });
		await wait(30);

		expect(store.state.playbackSpeed, 'one throwing loader discarded the other').toBe(1.5);
	});

	it('treats a restored zero as muted', async () => {
		// `volume: 0, isMuted: false` desynced the speaker button — the first
		// click "muted" an already-silent player.
		const store = makeStore({ loadVolume: () => 0 });
		store.dispatch({ type: 'restorePreferences' });
		await wait(30);

		expect(store.state.volume).toBe(0);
		expect(store.state.isMuted).toBe(true);
		expect(store.state.previousVolume, 'un-muting would restore silence').toBeGreaterThan(0);
	});
});

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

		// `trackSelected` is not a skip, so only `previous` logs. `toEqual` rather
	// than `toContain`, which would not notice a duplicate call.
	expect(trackTitles(skipped)).toEqual(['One']);
	});

	it('still changes track when no tracker is supplied', async () => {
		const store = playerWith({});
		store.dispatch({ type: 'next' });
		await wait(30);

		expect(store.state.currentTrackIndex).toBe(1);
	});
});
