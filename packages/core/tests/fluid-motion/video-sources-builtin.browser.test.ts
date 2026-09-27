/**
 * Ordinary <video> continuity through the AUTOMATIC path: the public assembly with core's built-in
 * providers only — no custom provider configured (`defineApplication({ visual: fluidMotion() })`).
 * The negative control is the same application committing the same removal through a run the card
 * does not take part in: the element must then simply stop, so the continuity observed is the card's
 * representation's doing (not a stale assumption about the built-ins).
 */
import { afterEach, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { defineChoreography } from '../../src/lib/application/renderer/choreography/plan.js';
import VideoApp from './video-fixtures/VideoApp.svelte';
import { diagnostics, hooks, videoDefinition } from './video-fixtures/VideoModel.js';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); });
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const fingerprint = (el: CanvasImageSource) => { const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d')!; try { g.drawImage(el, 0, 0, 4, 4); } catch { return 'unreadable'; } return Array.from(g.getImageData(1, 1, 1, 1).data).join(','); };
async function changes(el: CanvasImageSource, ms = 600) { const a = fingerprint(el); await sleep(ms); return fingerprint(el) !== a; }
function animatedCanvas() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d')!; let h = 0;
  const t = setInterval(() => { h = (h + 23) % 360; g.fillStyle = `hsl(${h} 90% 50%)`; g.fillRect(0, 0, 64, 36); }, 30);
  stops.push(() => clearInterval(t)); return c;
}
async function mse(video: HTMLVideoElement) {
  const c = animatedCanvas();
  const type = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t))!;
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: type }); const chunks: Blob[] = [];
  rec.ondataavailable = e => chunks.push(e.data); rec.start(); await sleep(2000); rec.stop(); await new Promise(r => { rec.onstop = r; });
  const ms = new MediaSource(); video.muted = false; video.volume = 0; video.src = URL.createObjectURL(ms);
  await new Promise(r => ms.addEventListener('sourceopen', r, { once: true }));
  const sb = ms.addSourceBuffer(type.includes('codecs') ? type : 'video/webm;codecs=vp8'); sb.appendBuffer(await new Blob(chunks, { type }).arrayBuffer());
  await new Promise(r => sb.addEventListener('updateend', r, { once: true })); ms.endOfStream();
}
function app() {
  hooks.handler.play = 0; hooks.handler.pause = 0; diagnostics.length = 0;
  const target = document.createElement('div'); document.body.append(target);
  const component = mount(VideoApp, { target, props: { definition: videoDefinition([]) as never } }); // built-ins only
  let mounted = true; const teardown = () => { if (!mounted) return; mounted = false; unmount(component); target.remove(); };
  stops.push(teardown); flushSync();
  return { target, teardown, video: hooks.video! };
}
const plan = () => defineChoreography({ cueMs: 0, durationMs: 4000, tracks: [{ participant: 'card', side: 'outgoing', startMs: 3500, durationMs: 400, opacity: { from: 1, to: 0 } }] });

it('automatic path, MediaStream: the built-in provider keeps the owner\'s stream decoding after the real commit', async () => {
  const a = app();
  const stream = animatedCanvas().captureStream(30);
  a.video.srcObject = stream; a.video.muted = true; await a.video.play(); await sleep(300);
  hooks.transition!(plan(), { type: 'hide' }); flushSync();
  expect(a.target.querySelector('[data-card]')).toBeNull();
  const player = document.querySelector('[data-route-representation="card"] video') as HTMLVideoElement | null;
  expect(player, 'the built-in provider did not represent the stream').toBeTruthy();
  expect(player!.srcObject).toBe(stream);
  expect(await changes(player!), 'no decoded progression after the commit').toBe(true);
  a.teardown(); flushSync();
  expect(stream.getVideoTracks().every(t => t.readyState === 'live'), 'the run stopped the owner\'s tracks').toBe(true);
});

it('automatic path, MSE: the built-in provider resumes the detached element muted and mirrors it after the real commit', async () => {
  const a = app();
  await mse(a.video); await a.video.play(); await sleep(300);
  const before = { ...hooks.handler };
  hooks.transition!(plan(), { type: 'hide' }); flushSync();
  expect(a.target.querySelector('[data-card]')).toBeNull();
  // The replay error that activates the fallback is asynchronous: choose the visible surface only after it had
  // time to arrive (the representation also holds the current-frame underlay, hidden once the fallback shows).
  await sleep(200);
  const mirror = [...document.querySelectorAll<HTMLCanvasElement>('[data-route-representation="card"] canvas')].find(c => getComputedStyle(c).visibility !== 'hidden') ?? null;
  const t0 = a.video.currentTime;
  expect(mirror && await changes(mirror), `no decoded progression after the commit (${JSON.stringify(diagnostics.slice(-3))})`).toBe(true);
  expect(a.video.currentTime).not.toBeCloseTo(t0, 1);
  expect(a.video.muted).toBe(true);
  expect(hooks.handler, 'a retired component handler ran').toEqual(before);
  a.teardown(); flushSync(); await sleep(50);
  expect(a.video.paused).toBe(true);
  expect(a.video.muted).toBe(false);
});

it('control: the same removal committed by a run the card does not take part in stops the element — continuity is the card\'s representation', async () => {
  const a = app();
  await mse(a.video); await a.video.play(); await sleep(300);
  // The same business commit, through a run whose only track is an unrelated participant.
  hooks.transition!(defineChoreography({ cueMs: 0, durationMs: 600, tracks: [{ participant: 'unrelated', side: 'outgoing', startMs: 0, durationMs: 300, opacity: { from: 1, to: 0 } }] }), { type: 'hide' }); flushSync();
  expect(a.target.querySelector('[data-card]')).toBeNull();
  expect(document.querySelector('[data-route-representation="card"]'), 'a representation exists without a participating track').toBeNull();
  await sleep(200);
  const t0 = a.video.currentTime;
  await sleep(500);
  expect(a.video.paused, 'a removed element kept playing with no run').toBe(true);
  expect(a.video.currentTime).toBeCloseTo(t0, 3);
});

it('automatic path, file blob: keeps the decorative replay (no fallback); the application\'s element is never touched', async () => {
  const a = app();
  // A real file blob (recorded WebM), not a MediaSource: the replay path loads it as before.
  const c = animatedCanvas();
  const type = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t))!;
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: type }); const chunks: Blob[] = [];
  rec.ondataavailable = e => chunks.push(e.data); rec.start(); await sleep(2000); rec.stop(); await new Promise(r => { rec.onstop = r; });
  const url = URL.createObjectURL(new Blob(chunks, { type })); stops.push(() => URL.revokeObjectURL(url));
  a.video.muted = false; a.video.volume = 0; a.video.loop = true; a.video.src = url; await a.video.play(); await sleep(400);
  hooks.transition!(plan(), { type: 'hide' }); flushSync();
  await sleep(300);
  const player = document.querySelector('[data-route-representation="card"] video') as HTMLVideoElement | null;
  expect(player, 'the file blob lost its decorative replay').toBeTruthy();
  expect(diagnostics.some(d => d.includes('videoDetachedFallback') || d.includes('videoPlayerFailed')), 'a file blob fell back').toBe(false);
  expect(await changes(player!), 'the replay did not progress after the commit').toBe(true);
  expect(a.video.paused, 'the application\'s element was resumed').toBe(true);
  expect(a.video.muted, 'the application\'s element was muted').toBe(false);
  a.teardown(); flushSync();
  expect(player!.isConnected).toBe(false);
});
