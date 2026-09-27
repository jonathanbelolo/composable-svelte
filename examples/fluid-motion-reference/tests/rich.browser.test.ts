/**
 * Rich-representation evidence (reference against the broader representation architecture).
 * Participants now use real flex/grid, gradients, generated content, transforms, clipping, inline SVG,
 * a first-party graphics Scene (WebGL canvas) and a muted local video. Visual progression is measured from
 * composited screenshot pixels, separately from counters (scene tick actions). Cold first use is measured
 * separately from the warmed path. Writes only to reference-evidence/rich-representation/.
 */
import '../src/styles.css';
import { afterAll, afterEach, expect, it } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';
import { launch, settle, waitFor, frame, type Launched } from './support/observe.js';
// Test-only: the graphics provider's resource ledger, read from the same built module the app uses.
import { graphicsRepresentationResources } from '../../../packages/graphics/dist/lib/representation/visual-provider.js';

const DIR = '../../docs/development/fluid-motion/reference-evidence/rich-representation';
const SHOTS = '../../../docs/development/fluid-motion/reference-evidence/rich-representation';
const evidence: Record<string, unknown> = {};
const launched: Launched[] = [];
const start = (url = '/') => { const f = launch(url); launched.push(f); return f; };
afterEach(async () => { for (const f of launched.splice(0)) await f.restore(); await page.viewport(1280, 900); });
afterAll(async () => { await commands.writeFile(`${DIR}/rich-evidence.json`, JSON.stringify(evidence, null, 2)); });

const q = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const settled = (f: Launched) => f.diagnostics('settled').length;
const runTime = (f: Launched) => Math.round((f.host().diagnostics.filter(event => event.type === 'frame').at(-1)?.t as number | undefined) ?? -1);
/**
 * Every owned visual resource is released, across the core Host ledger (resources + engine visualResources) and
 * the graphics provider's ledger. A mounted page legitimately owns its live Scene surfaces, so graphics
 * `surfaces` must equal the Scene canvases in the document; retained renderers, representations and mirrors are 0.
 */
function released(f: Launched) {
  const resources = f.host().resources() as unknown as Record<string, number | boolean>;
  const engine = (f.host().visualResources?.() ?? {}) as Record<string, number>;
  const graphics = graphicsRepresentationResources();
  const scenes = document.querySelectorAll('[data-pavilion-model] canvas').length;
  const held = [
    ...Object.entries(resources).filter(([, value]) => (typeof value === 'number' ? value !== 0 : value !== false)),
    ...Object.entries(engine).filter(([, value]) => value !== 0).map(([key, value]) => [`engine.${key}`, value] as const),
    ...Object.entries(graphics).filter(([key, value]) => (key === 'surfaces' ? value !== scenes : value !== 0)).map(([key, value]) => [`graphics.${key}`, value] as const)
  ];
  return { resources, engine, graphics, scenes, held };
}
/** Diagnostics that report a rich participant or element as unrepresentable. */
const unsupported = (f: Launched) => f.host().diagnostics.filter(event => event.type === 'unsupported' || (typeof event.type === 'string' && /declin|unsupported|frozen|skip/i.test(`${event.type} ${String((event as { reason?: unknown }).reason ?? '')}`)));

/** Composited screenshot pixels of a viewport rectangle (RGBA), for real visual-progression evidence. */
async function pixels(rect: readonly number[], name?: string) {
  const base64 = await page.screenshot(name ? { path: `${SHOTS}/${name}.png`, base64: true } as never : { save: false });
  const data = typeof base64 === 'string' ? base64 : (base64 as { base64: string }).base64;
  const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
  const scale = bitmap.width / window.innerWidth;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  const [x, y, w, h] = rect.map(value => Math.max(0, Math.round(value * scale)));
  return context.getImageData(x!, y!, Math.max(1, w!), Math.max(1, h!)).data;
}
/** One composited screenshot, sampled for several viewport regions. */
async function pixelsOf(rect: readonly number[], name?: string, onCapture?: () => void) {
  const base64 = await page.screenshot(name ? { path: `${SHOTS}/${name}.png`, base64: true } as never : { save: false });
  // Timing is read the moment the capture resolves, before decoding (decoding adds tens to hundreds of ms).
  onCapture?.();
  const data = typeof base64 === 'string' ? base64 : (base64 as { base64: string }).base64;
  const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
  const scale = bitmap.width / window.innerWidth;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  void rect;
  return (region: readonly number[]) => {
    const [x, y, w, h] = region.map(value => Math.max(0, Math.round(value * scale)));
    return context.getImageData(x!, y!, Math.max(1, w!), Math.max(1, h!)).data;
  };
}
/** Fraction of pixels whose colour changed by more than a small threshold. */
function changed(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let differing = 0;
  const count = Math.min(a.length, b.length) / 4;
  for (let i = 0; i < count * 4; i += 4) if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 30) differing++;
  return Math.round((differing / Math.max(1, count)) * 1000) / 1000;
}
const box = (el: Element) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); };
async function modelReady() {
  await waitFor(() => { const canvas = document.querySelector<HTMLCanvasElement>('[data-pavilion-model] canvas'); return !!canvas && canvas.width > 0; }, 8000);
  // Let the engine draw a few frames after initialisation.
  for (let i = 0; i < 10; i++) await frame();
}
/** Main-thread long tasks (>50 ms) observed while `work` runs. */
async function longTasks<T>(work: () => Promise<T>) {
  const tasks: number[] = [];
  const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) tasks.push(Math.round(entry.duration)); });
  try { observer.observe({ type: 'longtask', buffered: false }); } catch { /* unsupported engine */ }
  const result = await work();
  observer.disconnect();
  return { result, longTasks: tasks };
}

it('rich participants are represented, not skipped: flex/grid, gradients, ::before, transforms, clip-path, inline SVG, WebGL canvas', async () => {
  const f = start('/');
  await settle();
  await modelReady();
  const card = q('[data-card="pavilion"]');
  const style = (el: Element, pseudo?: string) => getComputedStyle(el, pseudo);
  const content = {
    cardDisplay: style(card).display,
    gridDisplay: style(q('[data-catalog]')).display,
    ribbon: style(card, '::before').backgroundImage.slice(0, 40),
    badgeTransform: style(q('[data-card="pavilion"] .card-badge')).transform,
    artClip: style(q('[data-card="pavilion"] .card-art')).clipPath,
    svg: !!card.querySelector('svg linearGradient') && !!card.querySelector('svg clipPath'),
    canvas: !!card.querySelector('canvas')
  };
  expect(content.cardDisplay).toBe('flex');
  expect(content.gridDisplay).toBe('grid');
  expect(content.ribbon).toContain('linear-gradient');
  expect(content.badgeTransform).not.toBe('none');
  expect(content.artClip).toContain('inset');
  expect(content.svg && content.canvas).toBe(true);
  // The model canvas is a real orbit control: named, and focusable in document order (not a positive tabindex).
  const modelCanvas = q('[data-card="pavilion"] canvas');
  const canvasSemantics = { role: modelCanvas.getAttribute('role'), label: modelCanvas.getAttribute('aria-label'), tabIndex: modelCanvas.tabIndex };
  expect(canvasSemantics).toEqual({ role: 'img', label: 'Pavilion model — drag or use arrow keys to orbit', tabIndex: 0 });
  const { result: shot, longTasks: tasks } = await longTasks(async () => {
    await userEvent.click(q('[data-open-study]'));
    await waitFor(() => runTime(f) > 290);
    const rep = document.querySelector('[data-route-representation="card-pavilion"]');
    const at = rep ? { wrapper: box(rep), surface: rep.firstElementChild ? box(rep.firstElementChild) : null, runMs: runTime(f) } : null;
    await pixels([0, 0, innerWidth, innerHeight], 'study-open-rich-waypoint');
    await waitFor(() => settled(f) > 0, 8000);
    return { rep: at };
  });
  const skipped = f.diagnostics('prepared').flatMap(event => (event as { skipped?: string[] }).skipped ?? []);
  evidence.richParticipants = { content, canvasSemantics, representationAtWaypoint: shot.rep, skipped, unsupported: unsupported(f), longTasks: tasks, resources: released(f) };
  expect(shot.rep).not.toBeNull();
  expect(shot.rep!.wrapper[2]!).toBeGreaterThan(500);
  expect(shot.rep!.wrapper[3]!).toBeGreaterThan(200);
  expect(skipped).toEqual([]);
  expect(unsupported(f)).toEqual([]);
  expect(released(f).held).toEqual([]);
});

it('live WebGL continuity: the turntable keeps turning through the route commit from explicit shared scene state', async () => {
  const f = start('/');
  await settle();
  await modelReady();
  await userEvent.click(q('[data-turntable]'));
  await waitFor(() => f.sceneTrace.includes('tick'));
  const scene = () => f.app.store.state.scene!;
  const startTime = () => scene().animations.find(entry => entry.id === 'turntable')?.startTime ?? null;
  await waitFor(() => startTime() !== null);
  const anchored = startTime();
  // Real visual progression on the home canvas (pixels), not a tick counter.
  const homeCanvas = box(q('[data-pavilion-model] canvas'));
  const a = await pixels(homeCanvas);
  await new Promise(resolve => setTimeout(resolve, 250));
  const b = await pixels(homeCanvas);
  const homeProgression = changed(a, b);
  const ticksBefore = f.sceneTrace.filter(type => type === 'tick').length;
  // Cold: first navigation to the study (destination engine initialises).
  const cold = await longTasks(async () => {
    const t0 = performance.now();
    await userEvent.click(q('[data-open-study]'));
    await waitFor(() => f.diagnostics('cue').length > 0 && location.pathname === '/study');
    const cueAt = performance.now() - t0;
    // After the commit the home canvas is gone; its representation is what is on screen.
    await frame();
    const rep = document.querySelector('[data-route-representation="card-pavilion"]');
    const repBox = rep ? box(rep) : null;
    const p1 = repBox ? await pixels(repBox, 'turntable-after-commit') : null;
    await new Promise(resolve => setTimeout(resolve, 120));
    const repBox2 = rep && rep.isConnected ? box(rep) : null;
    const p2 = repBox2 ? await pixels(repBox2) : null;
    await waitFor(() => settled(f) > 0, 8000);
    return { cueAt: Math.round(cueAt), repBox, representationProgression: p1 && p2 ? changed(p1, p2) : null };
  });
  await modelReady();
  expect(startTime()).toBe(anchored); // same playback, no reset
  const studyCanvas = box(q('[data-pavilion-model] canvas'));
  const c = await pixels(studyCanvas);
  await new Promise(resolve => setTimeout(resolve, 250));
  const d = await pixels(studyCanvas, 'turntable-study-settled');
  const studyProgression = changed(c, d);
  // Warm: back home and into the study again.
  await userEvent.click(q('[data-close-study]'));
  await waitFor(() => settled(f) > 1 && location.pathname === '/', 8000);
  const warm = await longTasks(async () => {
    const t0 = performance.now();
    await userEvent.click(q('[data-open-study]'));
    await waitFor(() => f.diagnostics('cue').length > 2 && location.pathname === '/study');
    const cueAt = performance.now() - t0;
    await waitFor(() => settled(f) > 2, 8000);
    return { cueAt: Math.round(cueAt) };
  });
  expect(startTime()).toBe(anchored);
  evidence.webglContinuity = {
    anchoredStartTime: anchored, homeProgression, studyProgression, ticksBeforeNavigation: ticksBefore, ticksTotal: f.sceneTrace.filter(type => type === 'tick').length,
    cold: { ...cold.result, longTasks: cold.longTasks }, warm: { ...warm.result, longTasks: warm.longTasks },
    domainTrace: f.trace, unsupported: unsupported(f), resources: released(f)
  };
  expect(homeProgression).toBeGreaterThan(0.01);
  expect(studyProgression).toBeGreaterThan(0.01);
  // cold.result.representationProgression is recorded only: the shared card copy is still moving while it is
  // sampled, so its pixel change is confounded by geometry. Post-retirement progression is qualified below.
  expect(f.trace).toEqual(['navigate', 'navigate', 'navigate']);
  expect(released(f).held).toEqual([]);
});

/** Leaving dossier → home with the airflow loop playing or paused (control); pixel change of the intro copy after the commit. */
async function leavingIntro(playing: boolean) {
  const f = start('/dossier');
  // Every attempt, on every path, is torn down before the caller can retry.
  try {
  await settle();
  const video = q('[data-airflow-video]') as HTMLVideoElement;
  await waitFor(() => video.readyState >= 2 && !video.paused && video.currentTime > 0.2, 8000);
  if (!playing) { q('[data-airflow]').click(); await waitFor(() => video.paused); }
  q('[data-back]').click();
  await waitFor(() => f.diagnostics('cue').length > 0 && location.pathname === '/');
  await frame();
  // The airflow frame is its own control-free participant, held unfaded until 780 ms (commit at 220 ms).
  const rep = document.querySelector('[data-route-representation="airflow"]');
  if (!rep) { await waitFor(() => settled(f) > 0, 8000); return { playing, representation: false as const }; }
  const videoRegion = (r: number[]) => [r[0]! + 4, r[1]! + 4, r[2]! - 8, r[3]! - 8];
  const textRegion = videoRegion;
  const repA = box(rep), t1 = runTime(f);
  let t2 = -1, t3 = -1;
  const shotA = await pixelsOf([0, 0, innerWidth, innerHeight], playing ? 'airflow-after-commit' : 'airflow-after-commit-paused', () => { t2 = runTime(f); });
  const repB = rep.isConnected ? box(rep) : repA;
  const shotB = await pixelsOf([0, 0, innerWidth, innerHeight], undefined, () => { t3 = runTime(f); });
  const result = { playing, representation: true as const, runMs: [t1, t2, t3], connectedAtSecond: rep.isConnected, repMoved: repA.some((value, i) => value !== repB[i]),
    videoChange: changed(shotA(videoRegion(repA)), shotB(videoRegion(repB))), textChange: changed(shotA(textRegion(repA)), shotB(textRegion(repB))) };
  await waitFor(() => settled(f) > 0, 8000);
  const after = { pageVideos: document.querySelectorAll('video').length, resources: released(f), unsupported: unsupported(f) };
  return { ...result, ...after };
  } finally {
    await f.restore();
    const index = launched.indexOf(f);
    if (index >= 0) launched.splice(index, 1);
  }
}

it('video continuity: the airflow copy in the leaving introduction keeps playing after the commit (paused-loop control)', async () => {
  // Validity: connected, unmoved, both captures resolved before the 780 ms fade. Screenshot latency (~100–320 ms)
  // can push a sample past it, so each run repeats until valid, at most 3 times; every attempt is recorded.
  const valid = (run: Awaited<ReturnType<typeof leavingIntro>>) => run.representation && run.connectedAtSecond && !run.repMoved && run.runMs[2]! < 780;
  const attempts: { control: unknown[]; playing: unknown[] } = { control: [], playing: [] };
  const settleValid = async (playing: boolean) => {
    let run = await leavingIntro(playing);
    (playing ? attempts.playing : attempts.control).push(run);
    for (let i = 1; i < 3 && !valid(run); i++) { run = await leavingIntro(playing); (playing ? attempts.playing : attempts.control).push(run); }
    return run;
  };
  const control = await settleValid(false);
  const playing = await settleValid(true);
  expect(launched).toHaveLength(0);
  expect(history.pushState).toBe(History.prototype.pushState);
  evidence.videoContinuity = { control, playing, attempts, note: 'airflow copy held unfaded (opacity 1) until 780 ms; the paused-loop run is the control' };
  expect(control.representation && playing.representation).toBe(true);
  if (!control.representation || !playing.representation) return;
  for (const run of [control, playing]) {
    expect(run.connectedAtSecond).toBe(true);
    expect(run.repMoved).toBe(false);
    expect(run.runMs[2]!).toBeLessThan(780);
  }
  expect(playing.videoChange).toBeGreaterThan(control.videoChange * 3 + 0.01);
  expect(playing.pageVideos).toBe(0);
  expect(playing.resources.held).toEqual([]);
});

it('repeated interruption adopts the shared card representation and leaves nothing behind', async () => {
  const f = start('/');
  await settle();
  await modelReady();
  await userEvent.click(q('[data-turntable]'));
  for (let round = 0; round < 3; round++) {
    await userEvent.click(q('[data-open-study]'));
    await waitFor(() => document.querySelector('[data-close-study]') !== null);
    await userEvent.click(q('[data-close-study]'));
    await waitFor(() => location.pathname === '/' && !f.host().resources().running, 8000);
    await waitFor(() => document.querySelector('[data-open-study]') !== null);
  }
  const reasons = f.diagnostics('settled').map(event => (event as { reason?: string }).reason);
  evidence.interruption = { settledReasons: reasons, protocolEvents: f.protocol.length, representationsLeft: document.querySelectorAll('[data-route-representation]').length, resources: released(f), domainTrace: f.trace };
  expect(reasons.filter(reason => reason === 'superseded').length).toBeGreaterThan(0);
  expect(f.trace).toEqual(Array(6).fill('navigate'));
  expect(document.querySelectorAll('[data-route-representation]')).toHaveLength(0);
  expect(released(f).held).toEqual([]);
});

it('teardown mid-flight with a retained renderer releases every visual resource', async () => {
  const f = start('/');
  await settle();
  await modelReady();
  await userEvent.click(q('[data-turntable]'));
  await userEvent.click(q('[data-open-study]'));
  await waitFor(() => f.diagnostics('cue').length > 0 && runTime(f) > 350);
  const host = f.host();
  await f.destroy();
  await frame(); await frame();
  const after = host.resources() as unknown as Record<string, number | boolean>;
  const engine = (host.visualResources?.() ?? {}) as Record<string, number>;
  const graphics = graphicsRepresentationResources();
  evidence.teardown = { resourcesAfter: after, engine, graphics, canvases: document.querySelectorAll('canvas').length, videos: document.querySelectorAll('video').length };
  expect(Object.values(engine).every(value => value === 0)).toBe(true);
  expect(graphics).toEqual({ surfaces: 0, retained: 0, representations: 0, mirrors: 0 });
  expect(Object.entries(after).filter(([, value]) => (typeof value === 'number' ? value !== 0 : value !== false))).toEqual([]);
  expect(document.querySelectorAll('canvas, video, [data-route-representation]')).toHaveLength(0);
});

it('reduced motion: no geometry travel, the SVG shimmer and the airflow loop hold still', async () => {
  const f = start('/');
  await settle();
  await userEvent.click(q('[data-reduced-motion-toggle]'));
  const shimmer = getComputedStyle(q('[data-card="pavilion"] .shimmer')).animationPlayState;
  await userEvent.click(q('[data-open-dossier]'));
  await waitFor(() => location.pathname === '/dossier' && !f.host().resources().running);
  const video = q('[data-airflow-video]') as HTMLVideoElement;
  await settle();
  evidence.reducedMotion = { shimmer, videoPaused: video.paused, heroRepresentations: f.host().diagnostics.filter(event => event.type === 'frame').length, trace: f.trace };
  expect(shimmer).toBe('paused');
  expect(video.paused).toBe(true);
  expect(f.host().diagnostics.filter(event => event.type === 'frame')).toHaveLength(0);
  expect(f.trace).toEqual(['setReducedMotion', 'navigate']);
});

/**
 * Post-retirement progression of the OUTGOING model mirror, measured on a stationary copy: on home → dossier
 * the leaving catalogue (holding the pavilion card and its model) stays in place until 700 ms, after the
 * 280 ms commit retires the home page. A static region of the same copy (the card title) must not change. Two screenshots of the mirror region inside that window; control:
 * the identical run with the turntable off. Rotation must exceed the control, not merely a tick counter.
 */
interface MirrorRun { turning: boolean; representation: boolean; runMs?: number[]; repMoved?: boolean; mirrorChange?: number; staticChange?: number; ticksAtRetirement?: number; ticksAfter?: number; resources?: unknown }
async function outgoingMirrorChange(turning: boolean): Promise<MirrorRun> {
  const f = start('/');
  // Every attempt, on every path (early return, assertion or timeout), is torn down before the caller can retry.
  try {
  await settle();
  await modelReady();
  if (turning) {
    await userEvent.click(q('[data-turntable]'));
    await waitFor(() => f.sceneTrace.filter(type => type === 'tick').length > 10);
  }
  // The pavilion figure is its own control-free outgoing participant, held in place (opacity 1) until 700 ms.
  const catalog = box(q('[data-pavilion-art]'));
  const canvas = box(q('[data-pavilion-model] canvas'));
  // Static reference inside the same copy: the artwork's bottom caption strip (no animation there).
  const art = box(q('[data-pavilion-art] svg'));
  const title = [art[0]!, art[1]! + Math.round(art[3]! * 0.86), art[2]!, Math.round(art[3]! * 0.12)];
  const offset = [canvas[0]! - catalog[0]!, canvas[1]! - catalog[1]!];
  const titleOffset = [title[0]! - catalog[0]!, title[1]! - catalog[1]!];
  await userEvent.click(q('[data-open-dossier]'));
  await waitFor(() => f.diagnostics('cue').length > 0 && !document.querySelector('[data-open-dossier]'));
  await frame();
  const rep = document.querySelector('[data-route-representation="pavilion-art"]');
  const ticksAtRetirement = f.sceneTrace.filter(type => type === 'tick').length;
  if (!rep) { const result = { turning, representation: false }; await waitFor(() => settled(f) > 0, 8000); return result; }
  const at = (r: number[]) => [r[0]! + offset[0]!, r[1]! + offset[1]!, canvas[2]!, canvas[3]!];
  const titleAt = (r: number[]) => [r[0]! + titleOffset[0]!, r[1]! + titleOffset[1]!, title[2]!, title[3]!];
  const repA = box(rep), t1 = runTime(f);
  const full = [0, 0, innerWidth, innerHeight];
  let t2 = -1, t3 = -1;
  const shotA = await pixelsOf(full, turning ? 'outgoing-model-after-retirement' : 'outgoing-model-control', () => { t2 = runTime(f); });
  const repB = box(rep);
  const shotB = await pixelsOf(full, undefined, () => { t3 = runTime(f); });
  const a = shotA(at(repA)), b = shotB(at(repB));
  const staticChange = changed(shotA(titleAt(repA)), shotB(titleAt(repB)));
  await waitFor(() => settled(f) > 0, 8000);
  return { turning, representation: true, runMs: [t1, t2, t3], repMoved: repA.some((value, i) => value !== repB[i]), mirrorChange: changed(a, b), staticChange, ticksAtRetirement, ticksAfter: f.sceneTrace.filter(type => type === 'tick').length, resources: released(f) };
  } finally {
    await f.restore();
    const index = launched.indexOf(f);
    if (index >= 0) launched.splice(index, 1);
  }
}

it('outgoing WebGL mirror keeps visibly turning after its page retires (stationary copy, turntable-off control)', async () => {
  // Validity (sampling preconditions only): the copy is represented, unmoved, and both captures resolved inside the
  // post-commit hold (after the 280 ms commit, before the 700 ms fade). Screenshot latency can push a capture past it,
  // so each run repeats until valid, at most 3 times; every attempt is recorded. Pixel/behaviour assertions below are
  // never retried: a valid sample that fails them fails the test.
  const valid = (run: MirrorRun) => run.representation && !run.repMoved && run.runMs![0]! > 280 && run.runMs![2]! < 700;
  const attempts: { control: MirrorRun[]; turning: MirrorRun[] } = { control: [], turning: [] };
  const sample = async (turning: boolean) => {
    const log = turning ? attempts.turning : attempts.control;
    let run = await outgoingMirrorChange(turning);
    log.push(run);
    for (let i = 1; i < 3 && !valid(run); i++) { run = await outgoingMirrorChange(turning); log.push(run); }
    return run;
  };
  const control = await sample(false);
  const turning = await sample(true);
  evidence.outgoingRetainedProgression = { control, turning, attempts };
  // Every attempt was torn down (no leftover fixture or history wrapper), whatever path it took.
  expect(launched).toHaveLength(0);
  expect(history.pushState).toBe(History.prototype.pushState);
  expect(control.representation && turning.representation).toBe(true);
  // Both samples fall after the commit and before the catalogue starts leaving, on an unmoved copy.
  for (const run of [control, turning]) {
    expect(run.repMoved).toBe(false);
    expect(run.runMs![0]!).toBeGreaterThan(280);
    expect(run.runMs![2]!).toBeLessThan(700);
    // The copy itself is stable between the samples: its static title region does not change.
    expect(run.staticChange!).toBeLessThan(0.02);
  }
  const off = control.mirrorChange!, on = turning.mirrorChange!;
  expect(on).toBeGreaterThan(0.01);
  expect(on).toBeGreaterThan(off * 3 + 0.005);
});

/**
 * Preparation responsiveness and long-work attribution, with NO screenshots in the measured window (screenshots
 * block the main thread and confounded the first long-task numbers). Cold (first use: Babylon engine and
 * shaders for the destination Scene) and warm paths; a WebGL route (study) and a route without a new Scene
 * (dossier). Long animation frames are attributed to their scripts where Chromium reports them.
 */
interface WorkWindow { route: string; path: 'cold' | 'warm'; cueMs: number; settleMs: number; longTasksMs: number[]; maxFrameGapMs: number; framesOver50: number }
/** Two validated instruments: longtask entries and an independent rAF frame-gap recorder. */
function instruments() {
  const longTasks: number[] = [];
  const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(Math.round(entry.duration)); });
  observer.observe({ type: 'longtask', buffered: false });
  const gaps: number[] = [];
  let last = performance.now(), running = true;
  const loop = (time: number) => { gaps.push(time - last); last = time; if (running) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return () => { running = false; observer.disconnect(); return { longTasks, maxFrameGapMs: Math.round(Math.max(0, ...gaps.slice(1))), framesOver50: gaps.slice(1).filter(gap => gap > 50).length }; };
}
async function measured(f: Launched, selector: string, route: string, path: 'cold' | 'warm'): Promise<WorkWindow> {
  const stop = instruments();
  const cuesBefore = f.diagnostics('cue').length, settledBefore = settled(f);
  const t0 = performance.now();
  q(selector).click();
  await waitFor(() => f.diagnostics('cue').length > cuesBefore, 8000);
  const cueMs = Math.round(performance.now() - t0);
  await waitFor(() => settled(f) > settledBefore, 8000);
  const settleMs = Math.round(performance.now() - t0);
  await new Promise(resolve => setTimeout(resolve, 60)); // let the longtask observer flush
  const work = stop();
  return { route, path, cueMs, settleMs, longTasksMs: work.longTasks, maxFrameGapMs: work.maxFrameGapMs, framesOver50: work.framesOver50 };
}

it('preparation responsiveness: cold versus warm, WebGL versus non-WebGL route (no screenshots while measuring)', async () => {
  const f = start('/');
  await settle();
  await modelReady();
  const windows: WorkWindow[] = [];
  windows.push(await measured(f, '[data-open-study]', 'study', 'cold'));
  await modelReady();
  q('[data-close-study]').click();
  await waitFor(() => location.pathname === '/' && !f.host().resources().running, 8000);
  await modelReady();
  windows.push(await measured(f, '[data-open-study]', 'study', 'warm'));
  q('[data-close-study]').click();
  await waitFor(() => location.pathname === '/' && !f.host().resources().running, 8000);
  await modelReady();
  windows.push(await measured(f, '[data-open-dossier]', 'dossier', 'cold'));
  q('[data-back]').click();
  await waitFor(() => location.pathname === '/' && !f.host().resources().running, 8000);
  await modelReady();
  windows.push(await measured(f, '[data-open-dossier]', 'dossier', 'warm'));
  // Positive control for both instruments: a deliberate 120 ms main-thread block must be reported by each.
  const stop = instruments();
  await frame();
  await new Promise<void>(resolve => requestAnimationFrame(() => { const until = performance.now() + 120; while (performance.now() < until) { /* block */ } resolve(); }));
  await frame(); await frame(); await new Promise(resolve => setTimeout(resolve, 60));
  const control = stop();
  evidence.responsiveness = {
    planCueMs: { study: 300, dossier: 280 }, defaultPreparationBudgetMs: 250, windows, instrumentControl: control,
    limits: 'long-animation-frame script attribution is not reported by this headless Chromium (observer accepted, no entries for a 120 ms block)'
  };
  expect(control.longTasks.some(ms => ms >= 110)).toBe(true);
  expect(control.maxFrameGapMs).toBeGreaterThanOrEqual(110);
  // Contract: preparation is bounded by the budget, then the plan's cue follows; allow 150 ms of frame slack.
  for (const window of windows) expect(window.cueMs, `${window.path} ${window.route} cue`).toBeLessThanOrEqual(250 + (window.route === 'study' ? 300 : 280) + 150);
});

it('turning on Reduce motion while on the dossier stops the playing airflow loop (and Play still works)', async () => {
  const f = start('/dossier');
  await settle();
  const video = q('[data-airflow-video]') as HTMLVideoElement;
  await waitFor(() => !video.paused && video.readyState >= 2 && video.currentTime > 0.2, 8000);
  await userEvent.click(q('[data-reduced-motion-toggle]'));
  await settle();
  const pausedAt = video.currentTime;
  await new Promise(resolve => setTimeout(resolve, 300));
  const afterWait = video.currentTime;
  const page = f.app.store.state.page;
  const label = q('[data-airflow]').textContent?.trim();
  await userEvent.click(q('[data-airflow]'));
  await waitFor(() => !video.paused, 4000);
  evidence.dynamicReducedMotion = { pausedAt, afterWait, advancedMs: Math.round((afterWait - pausedAt) * 1000), airflow: page?.type === 'detail' ? page.state.airflow : null, label, resumedOnPlay: !video.paused, trace: f.trace };
  expect(page).toMatchObject({ type: 'detail', state: { airflow: 'paused' } });
  expect(afterWait).toBe(pausedAt);
  expect(label).toBe('Play');
  expect(f.trace).toEqual(['setReducedMotion', 'detail:toggleAirflow']);
});
