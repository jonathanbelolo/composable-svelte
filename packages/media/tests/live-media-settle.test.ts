/**
 * S4 faithful settlement where the state-preserving move is unavailable (simulated here by
 * removing `Element.prototype.moveBefore`; the real cases are installed Firefox 142 / WebKit 26 and
 * current Safari). Real public ApplicationHost staged app; outgoing-only player.
 *
 * Expected (core-media-seam-interface.md, S4): the player stays real and usable until the commit,
 * then leaves with its page; no representation or placeholder box stands in for it; nothing is
 * labelled live. Requires core's S4 build (coherent 15:02:39Z, run.js bb985949).
 */
import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount, tick } from 'svelte';
import type { ApplicationInstance } from '@composable-svelte/core/application';
import LiveApp from './fixtures/live-app/LiveApp.svelte';
import { requesters, toAbout, toDetail, type LiveAction, type LiveState } from './fixtures/live-app/LiveModel.js';

let latest: { id: string } | undefined;
addEventListener('message', (event) => {
	if (event.data?.probe === 'live-player' && new URLSearchParams(event.data.name).has('hostplayer')) latest = event.data;
});
const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const stop of cleanups.splice(0).reverse()) await stop(); requesters.length = 0; latest = undefined; });

it('without moveBefore the outgoing player settles: real until commit, then gone, never a placeholder', async () => {
	const proto = Element.prototype as unknown as { moveBefore?: unknown };
	const original = proto.moveBefore;
	proto.moveBefore = undefined;
	cleanups.push(() => { proto.moveBefore = original; });
	history.replaceState(null, '', '/');
	performance.clearResourceTimings();
	const target = document.createElement('div');
	document.body.append(target);
	const trace: string[] = [];
	const component = mount(LiveApp, { target, props: { url: '/', dependencies: { trace }, onApp: (_: ApplicationInstance<LiveState, LiveAction>) => {} } });
	cleanups.push(async () => { await unmount(component); target.remove(); });
	await vi.waitFor(() => expect(latest).toBeDefined(), { timeout: 3000 });
	const iframe = target.querySelector<HTMLIFrameElement>('[data-player="home"] iframe')!;
	const representations: Element[] = [];
	const observer = new MutationObserver(() => {
		for (const node of document.querySelectorAll('[data-route-representation="player"]')) if (!representations.includes(node)) representations.push(node);
	});
	observer.observe(document.body, { childList: true, subtree: true, attributes: true });
	cleanups.push(() => observer.disconnect());

	requesters.find((entry) => entry.where === 'home')!.requester.request({ to: '/about' }, { motion: toAbout });
	await new Promise((r) => requestAnimationFrame(r));
	expect(iframe.isConnected, 'the player did not stay real before the commit').toBe(true);
	expect(iframe.closest('[inert]')).toBeNull();
	await vi.waitFor(() => expect(trace).toEqual(['go:/about']), { timeout: 3000 });
	await tick();
	expect(iframe.isConnected, 'the player outlived its page without a state-preserving move').toBe(false);
	expect(representations, 'a representation (placeholder) stood in for the settled player').toEqual([]);
	expect(document.querySelector('[data-composable-route-plane] iframe')).toBeNull();
	expect(performance.getEntriesByType('resource').filter((e) => e.name.includes('live-player.html?hostplayer')).length).toBe(1);
});

it('without moveBefore a shared player does not fly: the destination renders its own, the source leaves with its page', async () => {
	const proto = Element.prototype as unknown as { moveBefore?: unknown };
	const original = proto.moveBefore;
	proto.moveBefore = undefined;
	cleanups.push(() => { proto.moveBefore = original; });
	history.replaceState(null, '', '/');
	performance.clearResourceTimings();
	const target = document.createElement('div');
	document.body.append(target);
	const trace: string[] = [];
	const component = mount(LiveApp, { target, props: { url: '/', dependencies: { trace }, onApp: (_: ApplicationInstance<LiveState, LiveAction>) => {} } });
	cleanups.push(async () => { await unmount(component); target.remove(); });
	await vi.waitFor(() => expect(latest).toBeDefined(), { timeout: 3000 });
	const source = target.querySelector<HTMLIFrameElement>('[data-player="home"] iframe')!;
	const before = latest!;
	const representations: Element[] = [];
	const observer = new MutationObserver(() => {
		for (const node of document.querySelectorAll('[data-route-representation="player"]')) if (!representations.includes(node)) representations.push(node);
	});
	observer.observe(document.body, { childList: true, subtree: true, attributes: true });
	cleanups.push(() => observer.disconnect());

	requesters.find((entry) => entry.where === 'home')!.requester.request({ to: '/detail' }, { motion: toDetail });
	await new Promise((r) => requestAnimationFrame(r));
	// Before the commit the source is the real, usable player (not leased away, not inert).
	expect(source.isConnected).toBe(true);
	expect(source.closest('[inert]')).toBeNull();
	expect(getComputedStyle(source.closest<HTMLElement>('[data-player="home"]')!).opacity).toBe('1');
	await vi.waitFor(() => expect(trace).toEqual(['go:/detail']), { timeout: 3000 });
	await tick();
	const destination = target.querySelector<HTMLIFrameElement>('[data-player="detail"] iframe');
	expect(source.isConnected, 'the source player outlived its page').toBe(false);
	expect(destination, 'the destination did not render its own player').not.toBeNull();
	expect(destination).not.toBe(source);
	expect(representations, 'the settled shared participant flew').toEqual([]);
	// Honest: a new player (a second request, a new document), never labelled continuity.
	await vi.waitFor(() => expect(latest!.id).not.toBe(before.id), { timeout: 3000 });
	expect(performance.getEntriesByType('resource').filter((e) => e.name.includes('live-player.html?hostplayer')).length).toBe(2);
});
