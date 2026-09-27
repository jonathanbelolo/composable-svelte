/**
 * S2 within-page handoff for a real VideoEmbed through the public assembly: `useLayoutChoreography`
 * plus core's `<Presence when>` checkpoint (after the business commit, before Svelte removal).
 */
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PresenceApp from './fixtures/presence-app/PresenceApp.svelte';
import { hooks, leave } from './fixtures/presence-app/PresenceModel.js';
import { liveMediaResources } from '../src/lib/video-embed/live-media.js';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
let latest: { id: string; frames: number; muted: boolean } | undefined;
addEventListener('message', (event) => {
	if (event.data?.probe === 'live-player' && new URLSearchParams(event.data.name).has('presenceplayer')) latest = event.data;
});
const requests = () => performance.getEntriesByType('resource').filter((e) => e.name.includes('live-player.html?presenceplayer')).length;
const cleanups: (() => void)[] = [];
afterEach(() => { for (const stop of cleanups.splice(0).reverse()) stop(); latest = undefined; });

async function setup() {
	performance.clearResourceTimings();
	const target = document.createElement('div');
	document.body.append(target);
	const component = mount(PresenceApp, { target });
	cleanups.push(() => { unmount(component); target.remove(); });
	flushSync();
	await vi.waitFor(() => expect(latest).toBeDefined(), { timeout: 3000 });
	await frame();
	return { target, iframe: target.querySelector<HTMLIFrameElement>('[data-card] iframe')! };
}

it('an established within-page removal hands the same live player to the run before Svelte removes it', async () => {
	const { target, iframe } = await setup();
	const before = latest!;
	hooks.transition!(leave(), { type: 'hide' });
	flushSync();
	expect(target.querySelector('[data-card]'), 'the block was not removed').toBeNull();
	expect(iframe.isConnected, 'the player was destroyed with its block').toBe(true);
	expect(document.querySelector('[data-composable-route-plane]')?.contains(iframe)).toBe(true);
	expect(iframe.closest('[inert]')).not.toBeNull();
	await sleep(350);
	expect(latest!.id, 'the player reloaded').toBe(before.id);
	expect(latest!.frames).toBeGreaterThan(before.frames);
	expect(latest!.muted, 'outgoing-only decoration kept its audio').toBe(true);
	expect(requests()).toBe(1);
	await vi.waitFor(() => expect(iframe.isConnected, 'not released at settle').toBe(false), { timeout: 3000 });
	expect(liveMediaResources()).toEqual({ registered: 0, retained: 0 });
});

it('a no-op or throwing commit moves nothing: the player stays real, in place and unmuted', async () => {
	const { target, iframe } = await setup();
	const before = latest!;
	hooks.transition!(leave(), { type: 'noop' });
	flushSync();
	expect(() => { hooks.transition!(leave(), { type: 'boom' }); flushSync(); }).toThrow('commit failed');
	await sleep(300);
	expect(target.querySelector('[data-card] iframe')).toBe(iframe);
	expect(iframe.closest('[inert]')).toBeNull();
	expect(latest!.id).toBe(before.id);
	expect(latest!.muted).toBe(false);
	expect(liveMediaResources()).toEqual({ registered: 1, retained: 0 });
});
