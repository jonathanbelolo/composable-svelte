/**
 * Live media handoff (`mediaVisualProvider` + `VideoEmbed`), in Chromium (the
 * installed engine with `Element.prototype.moveBefore`).
 *
 * The player is `tests/fixtures/live-player.html`, served same-origin so its
 * document identity, frames, keys and muted state are observable; request
 * counts come from resource timing. Real public players are qualified
 * separately (docs/development/fluid-motion/media-continuity-probes).
 */

import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { flushSync, mount, unmount } from 'svelte';
import VideoEmbed from '../src/lib/video-embed/VideoEmbed.svelte';
import {
	MUTE_CONFIRMATION_MS,
	liveMediaResources,
	mediaVisualProvider,
	type MediaVisualProvider,
	type MediaRepresentation,
	type MediaRepresentationContext,
	type MediaRetainedRenderer
} from '../src/lib/video-embed/live-media.js';
import type { VideoEmbed as VideoEmbedType, VideoPlatform } from '../src/lib/video-embed/types.js';
import { reactiveProps } from './fixtures/reactive-props.svelte.js';
// Core's coherent build (its declarations keep core source out of this package's type program).
import { RouteHost } from '../../core/dist/application/renderer/choreography/route-host.js';
import { ChoreographyRun, type VisualClock } from '../../core/dist/application/renderer/choreography/run.js';
import { defineChoreography } from '../../core/dist/application/renderer/choreography/plan.js';
import { fluidMotion } from '../../core/dist/application/renderer/choreography/engine.js';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const PLAYER = `${location.origin}/tests/fixtures/live-player.html`;

interface PlayerState { id: string; frames: number; keys: number; muted: boolean; name: string }
const players = new Map<string, PlayerState>();
addEventListener('message', (event) => {
	if (event.data?.probe === 'live-player') players.set(event.data.name, event.data);
});
// Keyed by the player's own query; platforms may append parameters (Twitch adds `parent`).
const player = (name: string) =>
	[...players.entries()].find(([query]) => new URLSearchParams(query).has(name))?.[1];
const requests = (name: string) =>
	performance.getEntriesByType('resource').filter((entry) => entry.name.includes(`live-player.html?${name}`)).length;

let cleanup: Array<() => void> = [];
afterEach(() => {
	for (const fn of cleanup.reverse()) {
		try {
			fn();
		} catch {
			// cleanup only
		}
	}
	cleanup = [];
	document.body.innerHTML = '';
});

let serial = 0;
function video(platform: VideoPlatform = 'vimeo', extra = ''): VideoEmbedType & { name: string } {
	const name = `p${++serial}`;
	return { url: `${PLAYER}?${name}${extra}`, platform, videoId: name, embedUrl: `${PLAYER}?${name}${extra}`, aspectRatio: '16:9', title: 'Fixture', name } as never;
}

function mountEmbed(props: Record<string, unknown>, into?: HTMLElement) {
	const target = into ?? document.createElement('div');
	if (!into) document.body.appendChild(target);
	const component = mount(VideoEmbed as never, { target, props });
	flushSync();
	let live = true;
	const destroy = () => {
		if (!live) return;
		live = false;
		unmount(component);
		if (!into) target.remove();
	};
	cleanup.push(destroy);
	return { target, destroy, iframe: () => target.querySelector('iframe') };
}

function visualContext() {
	const controller = new AbortController();
	const diagnostics: string[] = [];
	const context: MediaRepresentationContext = { document, signal: controller.signal, reducedMotion: false, diagnose: (r) => diagnostics.push(r) };
	return { context, diagnostics, abort: () => controller.abort() };
}

/** Plays the run's part: represent, place the node in an inert decoration layer. */
function represent(iframe: HTMLIFrameElement, provider: MediaVisualProvider = mediaVisualProvider()) {
	const visual = visualContext();
	const result = provider.represent(iframe, visual.context);
	if (!result || 'declined' in result) throw new Error(`not represented: ${JSON.stringify(result)}`);
	const layer = document.createElement('div');
	layer.inert = true;
	layer.setAttribute('aria-hidden', 'true');
	layer.style.cssText = 'position:fixed;left:400px;top:0;width:320px;height:180px;pointer-events:none';
	layer.appendChild(result.node);
	document.body.appendChild(layer);
	cleanup.push(() => layer.remove());
	return { rep: result as MediaRepresentation, layer, ...visual };
}

const retire = (rep: MediaRepresentation): MediaRetainedRenderer | undefined => rep.retire?.() ?? undefined;
const microtask = () => new Promise<void>((resolve) => queueMicrotask(resolve));

async function ready(name: string) {
	for (let i = 0; i < 80 && !player(name); i++) await sleep(25);
	expect(player(name), `player ${name} never reported`).toBeDefined();
	return player(name)!;
}

describe('outgoing handoff', () => {
	it('moves the same player into the decoration at retirement: no reload, still playing', async () => {
		const v = video();
		const source = mountEmbed({ video: v, playerControl: 'player-api' });
		const before = await ready(v.name);
		const iframe = source.iframe()!;
		const { rep, layer, diagnostics } = represent(iframe);
		const retained = retire(rep);
		expect(retained).toBeDefined();
		expect(layer.contains(iframe), 'the player did not move into the decoration').toBe(true);
		source.destroy();
		expect(iframe.isConnected, 'component teardown destroyed the transferred player').toBe(true);
		await sleep(250);
		const after = player(v.name)!;
		expect(after.id, 'the player reloaded').toBe(before.id);
		expect(after.frames).toBeGreaterThan(before.frames);
		expect(requests(v.name)).toBe(1);
		// Not claimed: the opted-in player API muted it, and the player confirmed.
		expect(after.muted).toBe(true);
		expect(diagnostics).toContain('mediaMutedForDecoration');
		expect(iframe.isConnected, 'a confirmed muted player was disposed').toBe(true);
		retained!.dispose();
		expect(iframe.isConnected).toBe(false);
		expect(liveMediaResources()).toEqual({ registered: 0, retained: 0 });
	});

	it('disposes an outgoing-only player it cannot silence: decoration never prolongs audio', async () => {
		const v = video();
		const source = mountEmbed({ video: v });
		await ready(v.name);
		const iframe = source.iframe()!;
		const { rep, diagnostics } = represent(iframe);
		retire(rep);
		source.destroy();
		await microtask();
		await microtask();
		expect(iframe.isConnected, 'an uncontrolled player kept playing as decoration').toBe(false);
		expect(diagnostics).toContain('mediaAudioUncontrolled');
		rep.dispose();
		expect(liveMediaResources()).toEqual({ registered: 0, retained: 0 });
	});

	it('does not transfer Twitch (no documented command channel) even when opted in', async () => {
		const v = video('twitch');
		const source = mountEmbed({ video: v, playerControl: 'player-api' });
		await ready(v.name);
		const iframe = source.iframe()!;
		const { rep, diagnostics } = represent(iframe);
		retire(rep);
		source.destroy();
		await microtask();
		await microtask();
		expect(iframe.isConnected).toBe(false);
		expect(diagnostics).toContain('mediaAudioUncontrolled');
		rep.dispose();
	});

	it('revokes keyboard input at the transfer when focus was inside the player', async () => {
		const v = video();
		const source = mountEmbed({ video: v, playerControl: 'player-api' });
		await ready(v.name);
		const iframe = source.iframe()!;
		await userEvent.click(iframe);
		await userEvent.keyboard('a');
		await sleep(80);
		const live = player(v.name)!.keys;
		expect(live, 'input was not real before the cue').toBeGreaterThan(0);
		const { rep } = represent(iframe);
		const retained = retire(rep);
		expect(document.activeElement).not.toBe(iframe);
		await userEvent.keyboard('bcd');
		await sleep(80);
		expect(player(v.name)!.keys, 'keys reached the decoration').toBe(live);
		retained!.dispose();
	});

	it('leaves unrelated focus alone', async () => {
		const v = video();
		const source = mountEmbed({ video: v, playerControl: 'player-api' });
		await ready(v.name);
		const button = document.createElement('button');
		document.body.appendChild(button);
		button.focus();
		const { rep } = represent(source.iframe()!);
		const retained = retire(rep);
		expect(document.activeElement).toBe(button);
		retained!.dispose();
		button.remove();
	});

	it('finishes on the signal alone (host teardown) and on repeated disposal', async () => {
		const v = video();
		const source = mountEmbed({ video: v, playerControl: 'player-api' });
		await ready(v.name);
		const iframe = source.iframe()!;
		const { rep, abort } = represent(iframe);
		const retained = retire(rep)!;
		abort();
		expect(iframe.isConnected).toBe(false);
		retained.dispose();
		rep.dispose();
		// The source's registration ended at the transfer; its teardown releases nothing more.
		expect(liveMediaResources()).toEqual({ registered: 0, retained: 0 });
		source.destroy();
		expect(liveMediaResources()).toEqual({ registered: 0, retained: 0 });
	});

	it('refuses a source already gone, and declines without moveBefore', async () => {
		const v = video();
		const source = mountEmbed({ video: v });
		await ready(v.name);
		const iframe = source.iframe()!;
		const { rep, diagnostics } = represent(iframe);
		source.destroy();
		expect(retire(rep)).toBeUndefined();
		expect(diagnostics).toContain('mediaSourceGone');
		rep.dispose();

		const w = video();
		const other = mountEmbed({ video: w });
		const proto = Element.prototype as unknown as { moveBefore?: unknown };
		const original = proto.moveBefore;
		proto.moveBefore = undefined;
		try {
			const { context } = visualContext();
			expect(mediaVisualProvider().represent(other.iframe()!, context)).toEqual({ declined: 'mediaMoveUnavailable', settle: true });
		} finally {
			proto.moveBefore = original;
		}
	});

	it('ignores iframes it did not register', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		const { context } = visualContext();
		expect(mediaVisualProvider().represent(iframe, context)).toBeUndefined();
		iframe.remove();
	});
});

describe('destination adoption by explicit identity', () => {
	it('the destination claims the same player before creating its own, and owns it', async () => {
		const v = video();
		const scope = mediaVisualProvider();
		const source = mountEmbed({ video: v, mediaKey: 'hero', mediaScope: scope });
		const before = await ready(v.name);
		const iframe = source.iframe()!;
		const { rep, diagnostics } = represent(iframe, scope);
		const retained = retire(rep)!;
		// Same commit: the source block goes, the destination mounts.
		source.destroy();
		const destination = mountEmbed({ video: v, mediaKey: 'hero', mediaScope: scope });
		expect(destination.iframe(), 'the destination created a player instead of claiming').toBe(iframe);
		expect(destination.target.contains(iframe)).toBe(true);
		expect(iframe.closest('[inert]'), 'input was not restored').toBeNull();
		expect(diagnostics).toContain('mediaAdopted');
		await sleep(200);
		expect(player(v.name)!.id).toBe(before.id);
		expect(player(v.name)!.frames).toBeGreaterThan(before.frames);
		expect(player(v.name)!.muted, 'an adopted player was muted').toBe(false);
		expect(requests(v.name), 'a second request was made').toBe(1);

		// The run's disposal no longer touches it; the new owner's does.
		retained.dispose();
		expect(iframe.isConnected).toBe(true);
		expect(liveMediaResources()).toEqual({ registered: 1, retained: 0 });

		// Input is real again once the new owner has it.
		const keys = player(v.name)!.keys;
		await userEvent.click(iframe);
		await userEvent.keyboard('xy');
		await sleep(80);
		expect(player(v.name)!.keys).toBeGreaterThan(keys);

		destination.destroy();
		expect(iframe.isConnected).toBe(false);
		expect(liveMediaResources()).toEqual({ registered: 0, retained: 0 });
	});

	it('a mismatched configuration does not transfer the player', async () => {
		const v = video();
		const scope = mediaVisualProvider();
		const source = mountEmbed({ video: v, mediaKey: 'hero', mediaScope: scope });
		await ready(v.name);
		const iframe = source.iframe()!;
		const { rep, diagnostics } = represent(iframe, scope);
		retire(rep);
		source.destroy();
		const destination = mountEmbed({ video: v, mediaKey: 'hero', mediaScope: scope, autoplay: true });
		expect(destination.iframe()).not.toBe(iframe);
		expect(diagnostics).toContain('mediaIdentityMismatch');
		await microtask();
		await microtask();
		expect(iframe.isConnected, 'the unclaimed, uncontrolled player survived').toBe(false);
		rep.dispose();
	});

	it('a visual match without the explicit key never transfers', async () => {
		const v = video();
		const source = mountEmbed({ video: v });
		await ready(v.name);
		const iframe = source.iframe()!;
		const { rep } = represent(iframe);
		retire(rep);
		source.destroy();
		const destination = mountEmbed({ video: v });
		expect(destination.iframe()).not.toBe(iframe);
		rep.dispose();
	});

	it('only one destination can claim', async () => {
		const v = video();
		const scope = mediaVisualProvider();
		const source = mountEmbed({ video: v, mediaKey: 'hero', mediaScope: scope });
		await ready(v.name);
		const iframe = source.iframe()!;
		const { rep } = represent(iframe, scope);
		const retained = retire(rep)!;
		source.destroy();
		const first = mountEmbed({ video: v, mediaKey: 'hero', mediaScope: scope });
		const second = mountEmbed({ video: v, mediaKey: 'hero', mediaScope: scope });
		expect(first.iframe()).toBe(iframe);
		expect(second.iframe()).not.toBe(iframe);
		retained.dispose();
	});

	it('a return after the commit creates a new player; the retained one is not resurrected', async () => {
		const v = video();
		const scope = mediaVisualProvider();
		const source = mountEmbed({ video: v, mediaKey: 'hero', mediaScope: scope, playerControl: 'player-api' });
		await ready(v.name);
		const iframe = source.iframe()!;
		const { rep } = represent(iframe, scope);
		const retained = retire(rep)!;
		source.destroy();
		await sleep(100);
		// Still playing, muted (confirmed), as decoration — but no longer claimable.
		expect(iframe.isConnected).toBe(true);
		const late = mountEmbed({ video: v, mediaKey: 'hero', mediaScope: scope, playerControl: 'player-api' });
		expect(late.iframe()).not.toBe(iframe);
		retained.dispose();
		expect(iframe.isConnected).toBe(false);
	});
});

describe('an adopted player keeps the component reactive', () => {
	it('follows later title and URL changes like its own iframe would', async () => {
		const v = video();
		const scope = mediaVisualProvider();
		const source = mountEmbed({ video: v, mediaKey: 'hero', mediaScope: scope });
		const before = await ready(v.name);
		const iframe = source.iframe()!;
		const { rep } = represent(iframe, scope);
		const retained = retire(rep)!;
		source.destroy();
		const props = reactiveProps<Record<string, unknown>>({ video: v, mediaKey: 'hero', mediaScope: scope, referrerPolicy: undefined });
		const destination = mountEmbed(props);
		expect(destination.iframe()).toBe(iframe);
		retained.dispose();

		props.video = { ...v, title: 'Renamed' };
		flushSync();
		await sleep(50);
		expect(iframe.title).toBe('Renamed');
		expect(player(v.name)!.id, 'a title change reloaded the player').toBe(before.id);

		const next = video();
		props.video = next;
		flushSync();
		expect(destination.iframe(), 'the component replaced its iframe element').toBe(iframe);
		expect(iframe.getAttribute('src')).toBe(next.embedUrl);
		await ready(next.name);
		expect(requests(next.name)).toBe(1);

		props.referrerPolicy = 'strict-origin-when-cross-origin';
		flushSync();
		expect(iframe.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');
		destination.destroy();
		expect(liveMediaResources()).toEqual({ registered: 0, retained: 0 });
	});
});

describe('adoption scope', () => {
	it('never claims across providers (applications) with the same key', async () => {
		const v = video();
		const scopeA = mediaVisualProvider();
		const scopeB = mediaVisualProvider();
		const source = mountEmbed({ video: v, mediaKey: 'hero', mediaScope: scopeA });
		await ready(v.name);
		const iframe = source.iframe()!;
		const { rep } = represent(iframe, scopeA);
		const retained = retire(rep)!;
		source.destroy();
		const other = mountEmbed({ video: v, mediaKey: 'hero', mediaScope: scopeB });
		expect(other.iframe(), 'another scope took the player').not.toBe(iframe);
		retained.dispose();
	});

	it('a key without a scope never claims', async () => {
		const v = video();
		const scope = mediaVisualProvider();
		const source = mountEmbed({ video: v, mediaKey: 'hero', mediaScope: scope });
		await ready(v.name);
		const iframe = source.iframe()!;
		const { rep } = represent(iframe, scope);
		const retained = retire(rep)!;
		source.destroy();
		const unscoped = mountEmbed({ video: v, mediaKey: 'hero' });
		expect(unscoped.iframe()).not.toBe(iframe);
		retained.dispose();
	});
});

describe('confirmed muting', () => {
	it('disposes within the bound when the player never confirms (not ready, refused or dropped)', async () => {
		const v = video('vimeo', '&ack=drop');
		const source = mountEmbed({ video: v, playerControl: 'player-api' });
		await ready(v.name);
		const iframe = source.iframe()!;
		const { rep, diagnostics } = represent(iframe);
		retire(rep);
		source.destroy();
		await microtask();
		await microtask();
		expect(diagnostics, 'an unconfirmed command was taken for silence').not.toContain('mediaMutedForDecoration');
		expect(iframe.isConnected, 'disposed before the bound').toBe(true);
		await sleep(MUTE_CONFIRMATION_MS + 60);
		expect(iframe.isConnected, 'an unconfirmed player kept playing').toBe(false);
		expect(diagnostics).toContain('mediaMuteUnconfirmed');
		rep.dispose();
		expect(liveMediaResources()).toEqual({ registered: 0, retained: 0 });
	});

	it('accepts the YouTube IFrame API confirmation (infoDelivery muted)', async () => {
		const v = video('youtube');
		const source = mountEmbed({ video: v, playerControl: 'player-api' });
		await ready(v.name);
		const iframe = source.iframe()!;
		expect(iframe.src).toContain('enablejsapi=1');
		const { rep, diagnostics } = represent(iframe);
		const retained = retire(rep)!;
		source.destroy();
		await sleep(MUTE_CONFIRMATION_MS + 60);
		expect(diagnostics).toContain('mediaMutedForDecoration');
		expect(iframe.isConnected).toBe(true);
		expect(player(v.name)!.muted).toBe(true);
		retained.dispose();
	});

	it('the default URL is unchanged without the explicit opt-in', () => {
		const v = video('youtube');
		const source = mountEmbed({ video: v });
		expect(source.iframe()!.src).not.toContain('enablejsapi');
		expect(source.iframe()!.getAttribute('referrerpolicy')).toBe('no-referrer');
	});
});

describe('through a real core route run', () => {
	it('an outgoing VideoEmbed participant keeps its live player through beforeRemoval and Svelte removal', async () => {
		let now = 0, id = 0;
		const frames = new Map<number, () => void>(), timers = new Map<number, { at: number; fn: () => void }>();
		const clock: VisualClock = {
			now: () => now,
			frame: (fn) => { frames.set(++id, fn); return id; },
			cancelFrame: (handle) => { frames.delete(handle as number); },
			timeout: (fn, delay) => { timers.set(++id, { at: now + delay, fn }); return id; },
			clearTimeout: (handle) => { timers.delete(handle as number); }
		};
		const config = fluidMotion({ providers: [mediaVisualProvider()] });
		const host = new RouteHost(undefined, window, clock, {}, config);
		cleanup.push(() => host.dispose());
		const step = (ms: number) => {
			now = ms;
			const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn());
			for (const [key, timer] of timers) if (timer.at <= now) { timers.delete(key); timer.fn(); }
		};
		const owner = {};
		const page = document.createElement('div');
		page.innerHTML = '<div data-card style="width:320px;padding:8px;background:#0f172a"><p style="color:#fff;margin:0">card</p><div data-slot></div></div>';
		document.body.append(page);
		const v = video();
		const embed = mountEmbed({ video: v, playerControl: 'player-api' }, page.querySelector<HTMLElement>('[data-slot]')!);
		const before = await ready(v.name);
		const iframe = embed.iframe()!;
		cleanup.push(host.register(page.querySelector<HTMLElement>('[data-card]')!, 'card', owner));
		const run = new ChoreographyRun(host, 1 as never, defineChoreography({ cueMs: 200, durationMs: 800, tracks: [
			{ participant: 'card', side: 'outgoing', startMs: 400, durationMs: 300, opacity: { from: 1, to: 0 } }
		] }), owner, [], () => {}, new Map(), undefined, config);
		cleanup.push(() => run.settle('hostDisposed'));
		step(0);
		for (let t = 16; t <= 208; t += 16) { await new Promise((r) => requestAnimationFrame(r)); step(t); }
		run.beforeRemoval(owner);
		embed.destroy();
		page.remove();
		const rep = document.querySelector<HTMLElement>('[data-route-representation="card"]')!;
		expect(rep, 'no representation').not.toBeNull();
		expect(rep.contains(iframe), 'the representation does not hold the live player').toBe(true);
		expect(rep.querySelectorAll('iframe').length, 'a second player exists').toBe(1);
		for (let t = 224; t <= 400; t += 16) { await new Promise((r) => requestAnimationFrame(r)); step(t); }
		await sleep(100);
		const after = player(v.name)!;
		expect(after.id, 'the player reloaded').toBe(before.id);
		expect(after.frames).toBeGreaterThan(before.frames);
		expect(after.muted, 'outgoing-only decoration kept its audio').toBe(true);
		expect(requests(v.name)).toBe(1);
		expect(iframe.closest('[inert]')).not.toBeNull();
		expect(rep.getBoundingClientRect().width).toBeGreaterThan(100);
		run.settle('hostDisposed');
		expect(iframe.isConnected, 'settle did not dispose the player').toBe(false);
		expect(liveMediaResources()).toEqual({ registered: 0, retained: 0 });
	});
});
