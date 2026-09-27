/** Reproduction (rich reference §4): an outgoing participant containing a playing URL video, through a route run. */
import { afterEach, expect, it } from 'vitest';
import { RouteHost } from '../../src/lib/application/renderer/choreography/route-host.js';
import { ChoreographyRun, type VisualClock } from '../../src/lib/application/renderer/choreography/run.js';
import { defineChoreography } from '../../src/lib/application/renderer/choreography/plan.js';
import { fluidMotion } from '../../src/lib/application/renderer/choreography/engine.js';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); });
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
async function recordedVideoURL(): Promise<string> {
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 36; const paint = canvas.getContext('2d')!;
  let hue = 0; const timer = setInterval(() => { hue = (hue + 30) % 360; paint.fillStyle = `hsl(${hue} 90% 50%)`; paint.fillRect(0, 0, 64, 36); }, 20);
  const type = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(candidate => MediaRecorder.isTypeSupported(candidate))!;
  const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: type }); const chunks: Blob[] = []; recorder.ondataavailable = event => chunks.push(event.data);
  recorder.start(); await sleep(1600); recorder.stop(); await new Promise(resolve => { recorder.onstop = resolve; }); clearInterval(timer);
  const url = URL.createObjectURL(new Blob(chunks, { type })); stops.push(() => URL.revokeObjectURL(url)); return url;
}
const saturated = (video: HTMLVideoElement) => { const c = document.createElement('canvas'); c.width = c.height = 4; const k = c.getContext('2d')!; try { k.drawImage(video, 0, 0, 4, 4); } catch { return false; } const [r, g, b, a] = k.getImageData(2, 2, 1, 1).data; return a! > 0 && Math.max(r!, g!, b!) - Math.min(r!, g!, b!) > 80; };

it('an outgoing URL video (nested in another participant) keeps painting and playing after the commit', async () => {
  const url = await recordedVideoURL();
  let now = 0, id = 0;
  const frames = new Map<number, () => void>(), timers = new Map<number, { at: number; fn: () => void }>();
  const clock: VisualClock = { now: () => now, frame: fn => { frames.set(++id, fn); return id; }, cancelFrame: handle => { frames.delete(handle as number); }, timeout: (fn, delay) => { timers.set(++id, { at: now + delay, fn }); return id; }, clearTimeout: handle => { timers.delete(handle as number); } };
  const config = fluidMotion();
  const host = new RouteHost(undefined, window, clock, {}, config); stops.push(() => host.dispose());
  const step = (ms: number) => { now = ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); for (const [key, timer] of timers) if (timer.at <= now) { timers.delete(key); timer.fn(); } };
  const owner = {};
  const page = document.createElement('div');
  page.innerHTML = `<div data-intro style="width:260px;padding:8px;background:#0f172a"><p style="color:#fff;margin:0">intro</p><div data-airflow style="width:200px"><video muted loop playsinline preload="auto" style="display:block;width:200px;aspect-ratio:16/9;border-radius:10px;background:#0c0f17"></video></div></div>`;
  document.body.append(page); stops.push(() => page.remove());
  const video = page.querySelector('video')!; video.src = url; await video.play(); await sleep(200);
  stops.push(host.register(page.querySelector<HTMLElement>('[data-intro]')!, 'intro', owner));
  stops.push(host.register(page.querySelector<HTMLElement>('[data-airflow]')!, 'airflow', owner));
  const run = new ChoreographyRun(host, 1 as never, defineChoreography({ cueMs: 220, durationMs: 900, tracks: [
    { participant: 'intro', side: 'outgoing', startMs: 0, durationMs: 200, opacity: { from: 1, to: 0 } },
    { participant: 'airflow', side: 'outgoing', startMs: 560, durationMs: 300, opacity: { from: 1, to: 0 } }
  ] }), owner, [], () => {}, new Map(), undefined, config);
  stops.push(() => run.settle('hostDisposed'));
  step(0);
  for (let t = 16; t <= 240; t += 16) { await frame(); step(t); }
  run.beforeRemoval(owner); page.remove();
  const rep = document.querySelector<HTMLElement>('[data-route-representation="airflow"]')!;
  expect(rep).not.toBeNull();
  const players = [...rep.querySelectorAll('video')];
  expect(players.length).toBe(1);
  for (let t = 256; t <= 480; t += 16) { await frame(); step(t); }
  const player = players[0]!;
  const report = { wrapperOpacity: rep.style.opacity, playerVisibility: player.style.visibility, readyState: player.readyState, paused: player.paused, currentTime: player.currentTime, rect: rep.getBoundingClientRect().toJSON(), playerRect: player.getBoundingClientRect().toJSON(), diagnostics: host.diagnostics.filter(event => event.type === 'unsupported' || event.type === 'representation').map(event => JSON.stringify(event)) };
  expect(report.wrapperOpacity, JSON.stringify(report)).not.toBe('0');
  expect(player.getBoundingClientRect().width, JSON.stringify(report)).toBeGreaterThan(100);
  expect(player.readyState, JSON.stringify(report)).toBeGreaterThanOrEqual(2);
  expect(player.style.visibility, JSON.stringify(report)).toBe('visible');
  expect(saturated(player), JSON.stringify(report)).toBe(true);
  const t0 = player.currentTime; await sleep(250);
  expect(player.currentTime).toBeGreaterThan(t0 + 0.1);
  // The nested copy inside `intro` does not create a second (hidden) player.
  expect(document.querySelectorAll('[data-composable-route-plane] video').length).toBe(1);
});
