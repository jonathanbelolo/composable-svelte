/// <reference types="vite/client" />
/**
 * The README's managed recipes are these files, quoted verbatim.
 *
 * Each file is typechecked by `svelte-check` against the built package
 * declarations and mounted here against source (vitest.config.ts aliases the
 * package name), so a documented prop or action that does not exist fails the
 * gate instead of a reader. `ManagedVoice.svelte` is mounted by
 * voice-input-ownership.test.ts.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import readme from '../README.md?raw';
import managedVoice from './recipes/ManagedVoice.svelte?raw';
import managedPlayer from './recipes/ManagedPlayer.svelte?raw';
import ManagedPlayer from './recipes/ManagedPlayer.svelte';

const blocks = [...readme.matchAll(/```svelte\n([\s\S]*?)```/g)].map((match) => match[1]);

describe('README managed recipes', () => {
	it.each([
		['ManagedVoice.svelte', managedVoice],
		['ManagedPlayer.svelte', managedPlayer]
	])('quotes %s verbatim', (_, source) => {
		expect(blocks).toContain(source);
	});
});

class FakeAudio extends EventTarget {
	static instances: FakeAudio[] = [];
	src = '';
	paused = true;
	currentTime = 0;
	volume = 1;
	playbackRate = 1;
	buffered = { length: 0, end: () => 0 };
	constructor() {
		super();
		FakeAudio.instances.push(this);
	}
	play = vi.fn(async () => {
		this.paused = false;
	});
	pause = vi.fn(() => {
		this.paused = true;
	});
	load = vi.fn();
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('managed player recipe', () => {
	it('plays through a feature view and releases the element when the slot closes', async () => {
		FakeAudio.instances = [];
		vi.stubGlobal('Audio', FakeAudio);
		const errors = vi.spyOn(console, 'error');
		const target = document.createElement('div');
		document.body.append(target);
		const app = mount(ManagedPlayer, { target });
		flushSync();
		const button = (name: string) =>
			[...target.querySelectorAll('button')].find((node) => node.textContent === name || node.ariaLabel === name)!;

		button('Listen').click();
		flushSync();
		const element = FakeAudio.instances[0]!;
		expect(element.src).toBe('/audio/episode1.mp3');
		expect(element.volume).toBe(0.8);

		button('Play').click();
		flushSync();
		await Promise.resolve();
		expect(element.paused).toBe(false);

		button('Close player').click();
		flushSync();
		expect(target.querySelector('[role=region]')).toBeNull();
		expect(element.paused).toBe(true);
		expect(element.src).toBe('');
		expect(errors).not.toHaveBeenCalled();

		await unmount(app);
		target.remove();
	});
});
