/**
 * Ordinary <video> sources the URL-replay path cannot represent — `srcObject` MediaStream and
 * unencrypted MSE — keep decoded frames across a real route run's commit and cleanup
 * (representation/video.ts; remaining-media-interface.md R1/R2). Deterministic local fixtures: a
 * canvas-generated MediaStream, and an MSE player fed a WebM recorded in-page from it.
 *
 * Until core integrates `video.ts` into the built-in video provider, a provider wrapping it is
 * configured explicitly; the negative control uses the current built-ins alone.
 */
import { afterEach, expect, it } from 'vitest';
import { RouteHost } from '../../src/lib/application/renderer/choreography/route-host.js';
import { ChoreographyRun, type VisualClock } from '../../src/lib/application/renderer/choreography/run.js';
import { defineChoreography } from '../../src/lib/application/renderer/choreography/plan.js';
import { fluidMotion } from '../../src/lib/application/renderer/choreography/engine.js';
import { representDetachedVideo, representStreamVideo } from '../../src/lib/application/renderer/representation/video.js';
import type { RepresentationProvider } from '../../src/lib/application/renderer/representation/types.js';
import { flushSync, mount, unmount } from 'svelte';
import VideoApp from './video-fixtures/VideoApp.svelte';
import { diagnostics, hooks, videoDefinition } from './video-fixtures/VideoModel.js';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); });
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const clock: VisualClock = { now: () => performance.now(), frame: fn => requestAnimationFrame(() => fn()), cancelFrame: h => cancelAnimationFrame(h as number), timeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: h => clearTimeout(h as number) };

let live = 0;
const acquire = (release: () => void) => { live++; let done = false; return () => { if (done) return; done = true; live--; release(); }; };
const decorativeVideo = (doc: Document) => { const v = doc.createElement('video'); v.muted = true; v.playsInline = true; v.tabIndex = -1; v.setAttribute('aria-hidden', 'true'); v.style.cssText = 'display:block;width:100%;height:100%;'; return v; };
const videoProvider: RepresentationProvider = {
  name: 'ordinary-video',
  represent(source, context) {
    if (!(source instanceof HTMLVideoElement)) return undefined;
    return representStreamVideo(source, context, { acquire, decorativeVideo }) ?? representDetachedVideo(source, context, { acquire });
  }
};

function animatedCanvas() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 36; const g = c.getContext('2d')!; let h = 0;
  const t = setInterval(() => { h = (h + 23) % 360; g.fillStyle = `hsl(${h} 90% 50%)`; g.fillRect(0, 0, 64, 36); }, 30);
  stops.push(() => clearInterval(t));
  return c;
}
async function recordedWebm(): Promise<{ blob: Blob; type: string }> {
  const c = animatedCanvas();
  const type = ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t))!;
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: type }); const chunks: Blob[] = [];
  rec.ondataavailable = e => chunks.push(e.data); rec.start(); await sleep(2000); rec.stop(); await new Promise(r => { rec.onstop = r; });
  return { blob: new Blob(chunks, { type }), type };
}
const fingerprint = (el: CanvasImageSource) => { const c = document.createElement('canvas'); c.width = c.height = 4; const g = c.getContext('2d')!; try { g.drawImage(el, 0, 0, 4, 4); } catch { return 'unreadable'; } return Array.from(g.getImageData(1, 1, 1, 1).data).join(','); };
async function changes(el: CanvasImageSource, ms = 600) { const a = fingerprint(el); await sleep(ms); return fingerprint(el) !== a; }

function stage(providers: readonly RepresentationProvider[]) {
  const config = fluidMotion({ providers });
  const host = new RouteHost(undefined, window, clock, {}, config); stops.push(() => host.dispose());
  const owner = {};
  const page = document.createElement('div');
  page.innerHTML = '<div data-card style="width:200px;padding:6px;background:#0f172a"><video muted playsinline style="display:block;width:160px;height:90px"></video></div>';
  document.body.append(page); stops.push(() => page.remove());
  const video = page.querySelector('video')!;
  const start = () => {
    stops.push(host.register(page.querySelector<HTMLElement>('[data-card]')!, 'card', owner));
    const run = new ChoreographyRun(host, 1 as never, defineChoreography({ cueMs: 100, durationMs: 4000, tracks: [{ participant: 'card', side: 'outgoing', startMs: 3500, durationMs: 400, opacity: { from: 1, to: 0 } }] }), owner, [], () => {}, new Map(), undefined, config);
    stops.push(() => run.settle('hostDisposed'));
    return run;
  };
  const commit = async (run: ChoreographyRun) => { await sleep(200); run.beforeRemoval(owner); page.remove(); await sleep(50); return document.querySelector<HTMLElement>('[data-route-representation="card"]'); };
  return { host, video, start, commit, page };
}

it('srcObject MediaStream: decoded frames continue after the commit, end when the owner stops its tracks, and the owner keeps its tracks', async () => {
  const s = stage([videoProvider]);
  const stream = animatedCanvas().captureStream(30);
  s.video.srcObject = stream; await s.video.play(); await sleep(300);
  const run = s.start();
  const rep = await s.commit(run);
  expect(rep).not.toBeNull();
  const player = rep!.querySelector('video')!;
  expect(player, 'no decorative player').not.toBeNull();
  expect(player.srcObject, 'not the owner\'s same stream').toBe(stream);
  expect(s.video.isConnected).toBe(false);
  expect(await changes(player), 'no decoded progression after the commit').toBe(true);
  run.settle('hostDisposed');
  expect(player.isConnected).toBe(false);
  expect(stream.getVideoTracks().every(t => t.readyState === 'live'), 'the run stopped the owner\'s tracks').toBe(true);
  expect(live).toBe(0);
});

it('srcObject MediaStream: when the owner stops its tracks mid-run, frames stop and it is reported, never shown as live', async () => {
  const s = stage([videoProvider]);
  const stream = animatedCanvas().captureStream(30);
  s.video.srcObject = stream; await s.video.play(); await sleep(300);
  const run = s.start();
  const rep = await s.commit(run);
  const player = rep!.querySelector('video')!;
  stream.getTracks().forEach(t => t.stop());
  await sleep(200);
  expect(await changes(player)).toBe(false);
  expect(s.host.diagnostics.some(d => d.type === 'unsupported' && d.reason === 'videoStreamEnded')).toBe(true);
  run.settle('hostDisposed');
  expect(live).toBe(0);
});

it('MSE: the detached element is resumed muted and mirrored; its time advances; settle pauses it and restores muted', async () => {
  const s = stage([videoProvider]);
  const { blob, type } = await recordedWebm();
  const ms = new MediaSource(); s.video.loop = true; s.video.muted = false; s.video.volume = 0; s.video.src = URL.createObjectURL(ms);
  await new Promise(r => ms.addEventListener('sourceopen', r, { once: true }));
  const sb = ms.addSourceBuffer(type.includes('codecs') ? type : 'video/webm;codecs=vp8'); sb.appendBuffer(await blob.arrayBuffer());
  await new Promise(r => sb.addEventListener('updateend', r, { once: true })); ms.endOfStream();
  await s.video.play(); await sleep(300);
  const run = s.start();
  const rep = await s.commit(run);
  const mirror = rep!.querySelector('canvas')!;
  expect(mirror, 'no mirror').not.toBeNull();
  expect(s.video.isConnected, 'the element was re-parented').toBe(false);
  await sleep(100);
  const t0 = s.video.currentTime;
  expect(await changes(mirror), 'no decoded progression after the commit').toBe(true);
  expect(s.video.currentTime).not.toBeCloseTo(t0, 1);
  expect(s.video.muted, 'the resumed element was not muted').toBe(true);
  expect(rep!.querySelectorAll('video').length, 'a second decoder was created').toBe(0);
  run.settle('hostDisposed');
  expect(s.video.paused).toBe(true);
  expect(s.video.muted, 'muted was not restored').toBe(false);
  expect(live).toBe(0);
});

it('MSE: a source paused at retirement stays paused; an element the app reclaims is relinquished at once', async () => {
  const s = stage([videoProvider]);
  const { blob, type } = await recordedWebm();
  const ms = new MediaSource(); s.video.loop = true; s.video.src = URL.createObjectURL(ms);
  await new Promise(r => ms.addEventListener('sourceopen', r, { once: true }));
  const sb = ms.addSourceBuffer(type.includes('codecs') ? type : 'video/webm;codecs=vp8'); sb.appendBuffer(await blob.arrayBuffer());
  await new Promise(r => sb.addEventListener('updateend', r, { once: true })); ms.endOfStream();
  await s.video.play(); await sleep(300);
  s.video.pause();
  const run = s.start();
  await s.commit(run);
  await sleep(300);
  expect(s.video.paused, 'a paused source was resumed').toBe(true);
  run.settle('hostDisposed');

  // Reclaim: a playing source resumed by the run, then put back into the page by the app.
  const t = stage([videoProvider]);
  const ms2 = new MediaSource(); t.video.loop = true; t.video.muted = false; t.video.volume = 0; t.video.src = URL.createObjectURL(ms2);
  await new Promise(r => ms2.addEventListener('sourceopen', r, { once: true }));
  const sb2 = ms2.addSourceBuffer(type.includes('codecs') ? type : 'video/webm;codecs=vp8'); sb2.appendBuffer(await blob.arrayBuffer());
  await new Promise(r => sb2.addEventListener('updateend', r, { once: true })); ms2.endOfStream();
  await t.video.play(); await sleep(300);
  const run2 = t.start();
  await t.commit(run2);
  await sleep(150);
  expect(t.video.muted).toBe(true);
  // Count the run's own pause() calls on the reclaimed element (the platform may still pause an
  // element unmuted without user activation: autoplay policy, recorded below, not the run's act).
  let runPauses = 0;
  t.video.pause = function (this: HTMLVideoElement) { runPauses++; return HTMLMediaElement.prototype.pause.call(this); };
  document.body.append(t.video); stops.push(() => t.video.remove());
  await sleep(150);
  expect(t.video.muted, 'the reclaimed element was not handed back').toBe(false);
  expect(t.host.diagnostics.some(d => d.type === 'unsupported' && d.reason === 'videoElementReclaimed')).toBe(true);
  run2.settle('hostDisposed');
  expect(runPauses, 'the run paused an element the app had reclaimed').toBe(0);
  console.log(`reclaimed element after unmute restore: paused=${t.video.paused} (${navigator.userAgent.includes('Firefox') ? 'firefox' : navigator.userAgent.includes('Chrome') ? 'chromium' : 'webkit'})`);
  expect(live).toBe(0);
});

// The earlier "current built-ins alone show no progression" control was stale: core's built-in video
// provider already integrates the MediaStream path, and that control passed only by sampling the static
// underlay. It is replaced by video-sources-builtin.browser.test.ts, whose control commits the same
// removal through a run the card does not take part in (the frozen batch-1 snapshot keeps the old one).

async function mseInto(video: HTMLVideoElement, win: Window & typeof globalThis) {
  const { blob, type } = await recordedWebm();
  const ms = new win.MediaSource(); video.loop = true; video.volume = 0; video.src = win.URL.createObjectURL(ms);
  await new Promise(r => ms.addEventListener('sourceopen', r, { once: true }));
  const sb = ms.addSourceBuffer(type.includes('codecs') ? type : 'video/webm;codecs=vp8'); sb.appendBuffer(await blob.arrayBuffer());
  await new Promise(r => sb.addEventListener('updateend', r, { once: true })); ms.endOfStream();
  await video.play(); await sleep(300);
}
function focusedContext() {
  const controller = new AbortController(); const reasons: string[] = [];
  return { reasons, abort: () => controller.abort(), context: { document, signal: controller.signal, reducedMotion: false, diagnose: (r: string) => reasons.push(r) } };
}

it('same-origin iframe realm: stream and MSE sources are recognised from the iframe\'s own globals and keep decoding after removal', async () => {
  const frame = document.createElement('iframe'); frame.srcdoc = '<body style="margin:0"></body>'; document.body.append(frame); stops.push(() => frame.remove());
  await new Promise(r => frame.addEventListener('load', r, { once: true }));
  const win = frame.contentWindow as Window & typeof globalThis, doc = frame.contentDocument!;
  // A stream from the iframe's realm (its own canvas), on a <video> in the iframe's document.
  const canvas = doc.createElement('canvas'); canvas.width = 64; canvas.height = 36; const g = canvas.getContext('2d')!; let h = 0;
  const timer = setInterval(() => { h = (h + 23) % 360; g.fillStyle = `hsl(${h} 90% 50%)`; g.fillRect(0, 0, 64, 36); }, 30); stops.push(() => clearInterval(timer));
  const stream = canvas.captureStream(30);
  expect(stream instanceof MediaStream, 'fixture: the stream is not cross-realm').toBe(false);
  const streamVideo = doc.createElement('video'); streamVideo.muted = true; streamVideo.srcObject = stream; doc.body.append(streamVideo); await streamVideo.play(); await sleep(300);
  const s = focusedContext();
  const streamRep = representStreamVideo(streamVideo, s.context, { acquire, decorativeVideo });
  expect(streamRep, 'a cross-realm MediaStream was not recognised').toBeDefined();
  document.body.append(streamRep!.node);
  const retainedStream = streamRep!.retire!()!;
  streamVideo.remove();
  const player = streamRep!.node.querySelector('video')!;
  expect(player.srcObject).toBe(stream);
  expect(await changes(player), 'the iframe stream stopped decoding after removal').toBe(true);
  retainedStream.dispose(); streamRep!.node.remove();

  // MSE from the iframe's realm.
  const mseVideo = doc.createElement('video'); mseVideo.muted = false; doc.body.append(mseVideo);
  await mseInto(mseVideo, win);
  const m = focusedContext();
  const mseRep = representDetachedVideo(mseVideo, m.context, { acquire });
  expect(mseRep, 'a cross-realm MSE source was not recognised').toBeDefined();
  document.body.append(mseRep!.node);
  const retained = mseRep!.retire!()!;
  mseVideo.remove();
  let on = true; const loop = () => { if (!on) return; retained.frame?.(0); requestAnimationFrame(loop); }; loop();
  await sleep(200);
  expect(await changes(mseRep!.node as HTMLCanvasElement), 'the iframe MSE element did not keep decoding after removal').toBe(true);
  on = false; retained.dispose(); mseRep!.node.remove();
  expect(mseVideo.paused).toBe(true);
  expect(mseVideo.muted).toBe(false);
  expect(live).toBe(0);
});

it('mute ownership: the owner\'s latest pre-retirement state is kept, and an owner mute change after the run\'s is never overridden', async () => {
  const video = document.createElement('video'); video.muted = false; document.body.append(video); stops.push(() => video.remove());
  await mseInto(video, window);
  const a = focusedContext();
  const rep = representDetachedVideo(video, a.context, { acquire })!;
  video.muted = true; // the owner mutes after projection, before the commit
  const retained = rep.retire!()!;
  video.remove();
  let on = true; const loop = () => { if (!on) return; retained.frame?.(0); requestAnimationFrame(loop); }; loop();
  await sleep(300);
  on = false; retained.dispose();
  expect(video.muted, 'the owner\'s latest (muted) state was reverted to the projection-time value').toBe(true);

  // Reclaim with an owner decision: the owner unmutes after putting the element back.
  const b = document.createElement('video'); b.muted = false; document.body.append(b); stops.push(() => b.remove());
  await mseInto(b, window);
  const c = focusedContext();
  const rep2 = representDetachedVideo(b, c.context, { acquire })!;
  const retained2 = rep2.retire!()!;
  b.remove();
  let on2 = true; const loop2 = () => { if (!on2) return; retained2.frame?.(0); requestAnimationFrame(loop2); }; loop2();
  await sleep(300);
  expect(b.muted).toBe(true);
  document.body.append(b); b.muted = false; b.volume = 0.3; // the owner takes it back and decides
  await sleep(150);
  b.muted = true; // … then decides again, after the run has let go
  await sleep(150);
  on2 = false; retained2.dispose();
  expect(c.reasons).toContain('videoElementReclaimed');
  expect(b.muted, 'a stale restoration overrode the owner').toBe(true);
  expect(b.volume).toBeCloseTo(0.3, 5);

  // The guarded case: muted by its owner at retirement; the owner reclaims and UNMUTES before the
  // run notices. Restoring the retirement-time value (muted) would override that choice.
  const d = document.createElement('video'); d.muted = true; document.body.append(d); stops.push(() => d.remove());
  await mseInto(d, window);
  const e = focusedContext();
  const rep3 = representDetachedVideo(d, e.context, { acquire })!;
  const retained3 = rep3.retire!()!;
  d.remove();
  let on3 = true; const loop3 = () => { if (!on3) return; retained3.frame?.(0); requestAnimationFrame(loop3); }; loop3();
  await sleep(300);
  on3 = false;
  document.body.append(d); d.muted = false; // reclaimed and unmuted in one task, before the next run frame
  await sleep(50);
  retained3.frame?.(0);
  retained3.dispose();
  expect(e.reasons).toContain('videoElementReclaimed');
  expect(d.muted, 'a stale restoration re-muted an element its owner had unmuted').toBe(false);
  expect(live).toBe(0);
});
