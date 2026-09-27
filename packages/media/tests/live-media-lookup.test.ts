/**
 * S3: with no explicit `mediaScope`, `VideoEmbed` finds its application's `media` provider through
 * core's read-only `useRepresentationProvider` and adopts across a real ApplicationHost route commit.
 * Skipped — reported, not passed — while the installed core build predates the lookup.
 */
import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount, tick } from 'svelte';
import * as motion from '@composable-svelte/core/application/motion';
import type { ApplicationInstance } from '@composable-svelte/core/application';
import LiveApp from './fixtures/live-app/LiveApp.svelte';
import { requesters, scoping, toDetail, type LiveAction, type LiveState } from './fixtures/live-app/LiveModel.js';
import VideoEmbed from '../src/lib/video-embed/VideoEmbed.svelte';

const available = typeof (motion as Record<string, unknown>).useRepresentationProvider === 'function';
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
let latest: { id: string; frames: number } | undefined;
addEventListener('message', (event) => {
	if (event.data?.probe === 'live-player' && new URLSearchParams(event.data.name).has('hostplayer')) latest = event.data;
});
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
	for (const stop of cleanups.splice(0).reverse()) await stop();
	requesters.length = 0;
	scoping.explicit = true;
	latest = undefined;
});

it.skipIf(!available)('adopts through the host lookup, with no explicit mediaScope', async () => {
	scoping.explicit = false;
	history.replaceState(null, '', '/');
	performance.clearResourceTimings();
	const target = document.createElement('div');
	document.body.append(target);
	const trace: string[] = [];
	const component = mount(LiveApp, { target, props: { url: '/', dependencies: { trace }, onApp: (_: ApplicationInstance<LiveState, LiveAction>) => {} } });
	cleanups.push(async () => { await unmount(component); target.remove(); });
	await vi.waitFor(() => expect(latest).toBeDefined(), { timeout: 3000 });
	const iframe = target.querySelector<HTMLIFrameElement>('[data-player="home"] iframe')!;
	const before = latest!;
	requesters.find((entry) => entry.where === 'home')!.requester.request({ to: '/detail' }, { motion: toDetail });
	await vi.waitFor(() => expect(trace).toEqual(['go:/detail']), { timeout: 3000 });
	await tick();
	expect(target.querySelector('[data-player="detail"] iframe'), 'the lookup did not scope the adoption').toBe(iframe);
	await sleep(200);
	expect(latest!.id).toBe(before.id);
	expect(performance.getEntriesByType('resource').filter((e) => e.name.includes('live-player.html?hostplayer')).length).toBe(1);
});

it('outside an application host there is no scope: nothing is claimed or registered for adoption', () => {
	const target = document.createElement('div');
	document.body.append(target);
	const component = mount(VideoEmbed as never, { target, props: { url: `${location.origin}/tests/fixtures/live-player.html?outside`, mediaKey: 'hero' } });
	cleanups.push(() => { unmount(component); target.remove(); });
	// The URL is not a known platform, so nothing renders: the point is that mounting outside a host,
	// with a key and no scope, neither throws nor needs one.
	expect(target.querySelector('iframe')).toBeNull();
	console.log(JSON.stringify({ lookupAvailableInInstalledCore: available }));
});
