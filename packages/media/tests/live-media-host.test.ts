/**
 * Live media handoff through a real public-API staged application: ApplicationRoot /
 * ApplicationHost / FeatureOutlet, `useStagedRoute().request(intent, { motion })`,
 * `useParticipant`, and `fluidMotion({ providers: [mediaVisualProvider()] })` — core's
 * coherent dist, as a consumer uses it. Chromium (the installed engine with moveBefore).
 *
 * The claim order is observed, not assumed: every iframe ever inserted into the document is
 * recorded, and resource timing counts requests for the player's document.
 */
import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount, tick } from 'svelte';
import type { ApplicationInstance } from '@composable-svelte/core/application';
import LiveApp from './fixtures/live-app/LiveApp.svelte';
import { requesters, toAbout, toDetail, type LiveAction, type LiveState } from './fixtures/live-app/LiveModel.js';
import { liveMediaResources } from '../src/lib/video-embed/live-media.js';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const frame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));
let latest: { id: string; frames: number; keys: number; muted: boolean } | undefined;
addEventListener('message', (event) => {
	if (event.data?.probe === 'live-player' && new URLSearchParams(event.data.name).has('hostplayer')) latest = event.data;
});
const requests = () => performance.getEntriesByType('resource').filter((entry) => entry.name.includes('live-player.html?hostplayer')).length;

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
	for (const stop of cleanups.splice(0).reverse()) await stop();
	requesters.length = 0;
	latest = undefined;
});

async function setup() {
	const oldURL = location.href, oldState = history.state;
	history.replaceState(null, '', '/');
	performance.clearResourceTimings();
	const inserted: HTMLIFrameElement[] = [];
	const observer = new MutationObserver((records) => {
		for (const record of records) for (const node of record.addedNodes) {
			if (node instanceof HTMLIFrameElement) inserted.push(node);
			if (node instanceof Element) inserted.push(...node.querySelectorAll('iframe'));
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });
	const target = document.createElement('div');
	document.body.append(target);
	const trace: string[] = [];
	let app!: ApplicationInstance<LiveState, LiveAction>;
	const component = mount(LiveApp, { target, props: { url: '/', dependencies: { trace }, onApp: (value: ApplicationInstance<LiveState, LiveAction>) => { app = value; } } });
	cleanups.push(async () => { observer.disconnect(); await unmount(component); target.remove(); history.replaceState(oldState, '', oldURL); });
	await vi.waitFor(() => expect(latest).toBeDefined(), { timeout: 3000 });
	await sleep(150);
	const requester = requesters.find((entry) => entry.where === 'home')!.requester;
	return { target, trace, requester, inserted: () => [...new Set(inserted)], get app() { return app; } };
}

it('the destination page adopts the same live player in the real commit, before any new iframe or request', async () => {
	const f = await setup();
	const iframe = f.target.querySelector<HTMLIFrameElement>('[data-player="home"] iframe')!;
	const before = latest!;
	expect(requests()).toBe(1);

	f.requester.request({ to: '/detail' }, { motion: toDetail });
	await frame(); await frame();
	// Before the cue the source is still the real, current player.
	expect(f.trace).toEqual([]);
	expect(iframe.closest('[data-page="home"]')).not.toBeNull();
	// Shared pre-cue (core S1): the live player keeps its real paint and stays hit-testable.
	const box = iframe.getBoundingClientRect();
	const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
	const sourceOpacityPreCue = getComputedStyle(iframe.closest<HTMLElement>('[data-player="home"]')!).opacity;
	expect(sourceOpacityPreCue, 'the live source was hidden before the cue').toBe('1');
	expect(hit, 'the live source is not hit-testable before the cue').toBe(iframe);

	await vi.waitFor(() => expect(f.trace).toEqual(['go:/detail']), { timeout: 3000 });
	await tick();
	const adopted = f.target.querySelector<HTMLIFrameElement>('[data-player="detail"] iframe');
	expect(adopted, 'the destination created its own player').toBe(iframe);
	expect(f.target.querySelector('[data-page="home"]')).toBeNull();
	expect(f.inserted().filter((node) => node !== iframe), 'a second iframe was inserted').toEqual([]);
	expect(requests(), 'a second request was made').toBe(1);
	expect(iframe.closest('[inert],[aria-hidden="true"]'), 'the adopted player is not interactive').toBeNull();
	await sleep(200);
	expect(latest!.id, 'the player reloaded').toBe(before.id);
	expect(latest!.frames).toBeGreaterThan(before.frames);
	expect(latest!.muted, 'an adopted player was muted').toBe(false);
	await sleep(600);
	expect(iframe.isConnected, 'the settled run disposed the adopted player').toBe(true);
	expect(liveMediaResources()).toEqual({ registered: 1, retained: 0 });
	console.log(JSON.stringify({ sharedSourceOpacityPreCue: sourceOpacityPreCue }));
});

it('an outgoing-only player plays muted as decoration after the real commit, then is released at settle', async () => {
	const f = await setup();
	const iframe = f.target.querySelector<HTMLIFrameElement>('[data-player="home"] iframe')!;
	const before = latest!;
	f.requester.request({ to: '/about' }, { motion: toAbout });
	await vi.waitFor(() => expect(f.trace).toEqual(['go:/about']), { timeout: 3000 });
	await tick();
	const plane = document.querySelector('[data-composable-route-plane]');
	expect(plane?.contains(iframe), 'the representation does not hold the live player').toBe(true);
	expect(iframe.closest('[inert]')).not.toBeNull();
	expect(f.inserted().filter((node) => node !== iframe)).toEqual([]);
	await sleep(350);
	expect(latest!.id, 'the player reloaded').toBe(before.id);
	expect(latest!.frames).toBeGreaterThan(before.frames);
	expect(latest!.muted, 'outgoing-only decoration kept its audio').toBe(true);
	expect(requests()).toBe(1);
	await vi.waitFor(() => expect(iframe.isConnected, 'not released at settle').toBe(false), { timeout: 3000 });
	expect(liveMediaResources()).toEqual({ registered: 0, retained: 0 });
});
