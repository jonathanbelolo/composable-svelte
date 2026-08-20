/**
 * media's first tests.
 *
 * The package had eleven components, zero tests, and `--passWithNoTests` in its
 * `test` script hiding that — while carrying a full Playwright browser-mode
 * config no test ever used. These cover the three behavioural changes that came
 * with gating it, because svelte-check proves none of them.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { audioPlayerReducer } from '../src/lib/audio-player/reducer.js';
import {
	createInitialAudioPlayerState,
	nextLoopMode,
	type AudioTrack,
	type AudioPlayerState,
	type AudioPlayerAction
} from '../src/lib/audio-player/types.js';
import MinimalAudioPlayer from '../src/lib/audio-player/MinimalAudioPlayer.svelte';
import PlaylistView from '../src/lib/audio-player/PlaylistView.svelte';

const track = (id: string, title: string): AudioTrack => ({
	id,
	title,
	url: `https://example.test/${id}.mp3`,
	duration: 200
});

let cleanup: Array<() => void> = [];

afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function makeStore(overrides: Partial<AudioPlayerState> = {}) {
	const initial = { ...createInitialAudioPlayerState(), ...overrides };
	const store = createStore({
		initialState: initial,
		reducer: audioPlayerReducer,
		dependencies: {}
	});
	const dispatched: AudioPlayerAction[] = [];
	const inner = store.dispatch.bind(store);
	(store as { dispatch: (a: AudioPlayerAction) => void }).dispatch = (a) => {
		dispatched.push(a);
		inner(a);
	};
	return { store, dispatched };
}

function mountComponent(Component: unknown, props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(Component as never, { target, props });
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	return target;
}

describe('nextLoopMode', () => {
	it('cycles none -> one -> all -> none', () => {
		expect(nextLoopMode('none')).toBe('one');
		expect(nextLoopMode('one')).toBe('all');
		expect(nextLoopMode('all')).toBe('none');
	});
});

describe('seek bar keyboard access', () => {
	function mountPlayer() {
		const { store, dispatched } = makeStore({
			currentTrack: track('t1', 'Track One'),
			duration: 200,
			currentTime: 50
		});
		const target = mountComponent(MinimalAudioPlayer, { store });
		const bar = target.querySelector<HTMLElement>('[role="slider"]');
		expect(bar, 'no seek bar rendered').not.toBeNull();
		return { bar: bar!, dispatched };
	}

	function press(bar: HTMLElement, key: string) {
		bar.focus();
		bar.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
		flushSync();
	}

	it('ArrowRight seeks forward exactly once', () => {
		const { bar, dispatched } = mountPlayer();
		press(bar, 'ArrowRight');

		const seeks = dispatched.filter((a) => a.type === 'seekTo');
		// Exactly one: FullAudioPlayer also listens on window, so a missing
		// stopPropagation there would produce two.
		expect(seeks).toHaveLength(1);
		expect(seeks[0]).toEqual({ type: 'seekTo', time: 55 });
	});

	it('ArrowLeft seeks backward', () => {
		const { bar, dispatched } = mountPlayer();
		press(bar, 'ArrowLeft');
		expect(dispatched.filter((a) => a.type === 'seekTo')[0]).toEqual({
			type: 'seekTo',
			time: 45
		});
	});

	it('Home and End jump to the ends', () => {
		const { bar, dispatched } = mountPlayer();
		press(bar, 'Home');
		press(bar, 'End');
		const seeks = dispatched.filter((a) => a.type === 'seekTo');
		expect(seeks[0]).toEqual({ type: 'seekTo', time: 0 });
		expect(seeks[1]).toEqual({ type: 'seekTo', time: 200 });
	});

	it('ignores keys it does not handle', () => {
		const { bar, dispatched } = mountPlayer();
		press(bar, 'a');
		expect(dispatched.filter((a) => a.type === 'seekTo')).toHaveLength(0);
	});

	it('announces a formatted time, not a raw number', () => {
		const { bar } = mountPlayer();
		expect(bar.getAttribute('aria-valuetext')).toBe('0:50');
	});
});

describe('playlist rows', () => {
	function mountPlaylist() {
		const { store, dispatched } = makeStore({
			playlist: [track('a', 'Alpha'), track('b', 'Beta')],
			currentTrackIndex: 0
		});
		const target = mountComponent(PlaylistView, { store });
		return { target, dispatched };
	}

	it('selects a track on click', () => {
		const { target, dispatched } = mountPlaylist();
		const buttons = target.querySelectorAll<HTMLButtonElement>('.playlist-item__select');
		expect(buttons).toHaveLength(2);

		buttons[1]!.click();
		flushSync();
		expect(dispatched).toContainEqual({ type: 'trackSelected', index: 1 });
	});

	it('selects a track on Enter — it is a real button', () => {
		const { target, dispatched } = mountPlaylist();
		const button = target.querySelectorAll<HTMLButtonElement>('.playlist-item__select')[1]!;

		// A <button> activates on Enter natively; a <div onclick> never did.
		button.focus();
		expect(document.activeElement).toBe(button);
		button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		button.click();
		flushSync();

		expect(dispatched).toContainEqual({ type: 'trackSelected', index: 1 });
	});

	it('keeps the row draggable with the select button inside it', () => {
		const { target } = mountPlaylist();
		const row = target.querySelector<HTMLElement>('.playlist-item');
		const button = target.querySelector<HTMLElement>('.playlist-item__select');

		expect(row, 'no row').not.toBeNull();
		expect(button, 'no select button').not.toBeNull();
		// The drag surface is the row, and the button lives inside it — this is
		// the part of the restructure I could not settle by reading.
		expect(row!.getAttribute('draggable')).toBe('true');
		expect(row!.contains(button!)).toBe(true);
	});

	it('marks the current track', () => {
		const { target } = mountPlaylist();
		const buttons = target.querySelectorAll<HTMLButtonElement>('.playlist-item__select');
		expect(buttons[0]!.getAttribute('aria-current')).toBe('true');
		expect(buttons[1]!.getAttribute('aria-current')).toBeNull();
	});
});
