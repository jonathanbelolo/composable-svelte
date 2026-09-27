/**
 * Real public players through the live handoff (opt-in: VITE_MEDIA_REAL_PLAYERS=1, public network,
 * no accounts). Retires an outgoing-only `VideoEmbed` with `playerControl="player-api"` and
 * records what the platform's own API reports afterwards. An API state reply is not audio
 * qualification: audible output is not measured here.
 */
import { describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import VideoEmbed from '../src/lib/video-embed/VideoEmbed.svelte';
import { mediaVisualProvider, type MediaRepresentation } from '../src/lib/video-embed/live-media.js';

// Browser mode exposes only VITE_-prefixed variables to test code.
const enabled = import.meta.env.VITE_MEDIA_REAL_PLAYERS === '1';
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe.skipIf(!enabled)('real players (opt-in)', () => {
	for (const c of [
		{ name: 'youtube', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', referrerPolicy: 'strict-origin-when-cross-origin' as ReferrerPolicy },
		{ name: 'vimeo', url: 'https://vimeo.com/76979871', referrerPolicy: 'no-referrer' as ReferrerPolicy }
	]) {
		it(`${c.name}: outgoing-only player is muted by its own API and stays the same document`, async () => {
			const messages: string[] = [];
			const listen = (event: MessageEvent) => messages.push(typeof event.data === 'string' ? event.data : JSON.stringify(event.data));
			addEventListener('message', listen);
			const target = document.createElement('div');
			document.body.appendChild(target);
			const component = mount(VideoEmbed as never, { target, props: { url: c.url, autoplay: true, muted: false, playerControl: 'player-api', referrerPolicy: c.referrerPolicy } });
			flushSync();
			const iframe = target.querySelector('iframe')!;
			await sleep(5000);
			const controller = new AbortController();
			const diagnostics: string[] = [];
			const rep = mediaVisualProvider().represent(iframe, { document, signal: controller.signal, reducedMotion: false, diagnose: (r) => diagnostics.push(r) }) as MediaRepresentation;
			const layer = document.createElement('div'); layer.inert = true; layer.style.cssText = 'position:fixed;left:0;top:0;width:640px;height:360px';
			layer.appendChild(rep.node); document.body.appendChild(layer);
			const atRetire = messages.length;
			const retained = rep.retire?.();
			unmount(component); target.remove();
			await sleep(3000);
			const after = messages.slice(atRetire);
			const mutedReply = after.some((m) => /"muted":true/.test(m) || /"method":"setMuted","value":true/.test(m));
			const states = after.map((m) => /"playerState":(-?\d)/.exec(m)?.[1]).filter(Boolean);
			const report = { diagnostics, connected: iframe.isConnected, src: iframe.src, mutedReplyAfterRetire: mutedReply, playerStatesAfterRetire: [...new Set(states)], errors: after.filter((m) => /onError|"event":"error"/.test(m)).slice(0, 2) };
			console.log(JSON.stringify(report));
			removeEventListener('message', listen);
			expect(retained).toBeDefined();
			expect(iframe.isConnected).toBe(true);
			expect(diagnostics).toContain('mediaMutedForDecoration');
			expect(mutedReply, 'the platform API did not report muted after retirement').toBe(true);
			retained?.dispose(); controller.abort(); layer.remove();
		}, 20000);
	}
});
