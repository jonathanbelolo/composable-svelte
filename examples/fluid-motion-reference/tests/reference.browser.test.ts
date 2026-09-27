/**
 * Real-browser evidence for the four reference scenarios (specs/frontend/fluid-layout-motion-design.md,
 * "Proof required"). The app is driven only through its real controls. Framework state is observed
 * through test-only seams (tests/support/observe.ts) and the shared evidence harness recorder.
 * Measured values are written to docs/development/fluid-motion/reference-evidence/.
 */
import '../src/styles.css';
import { afterAll, afterEach, expect, it } from 'vitest';
import { commands, page, userEvent } from 'vitest/browser';
import { startMotionRecorder, type FrameRecordResult } from '../../../packages/core/tests/fluid-motion/harness/index.js';
import { launch, settle, waitFor, frame, type Launched, type Diagnostic } from './support/observe.js';
import { bindManagedProjection, capturedView } from '../../../packages/core/dist/execution/store-access.js';
import { pageSlot } from '../src/model.js';
import { movesAfterEnd, type MotionTimeline } from './support/timeline.js';

// writeFile resolves against the project root; screenshot paths against this test file.
// Rich-representation runs write beside, never over, the canonical pre-rich evidence in reference-evidence/.
const EVIDENCE = '../../docs/development/fluid-motion/reference-evidence/rich-representation/scenarios';
const SHOTS = '../../../docs/development/fluid-motion/reference-evidence/rich-representation/scenarios';
const evidence: Record<string, unknown> = {};
const launched: Launched[] = [];
const start = (url = '/') => { const f = launch(url); launched.push(f); return f; };
afterEach(async () => { for (const f of launched.splice(0)) await f.restore(); await page.viewport(1280, 900); });
afterAll(async () => { await commands.writeFile(`${EVIDENCE}/browser-evidence.json`, JSON.stringify(evidence, null, 2)); });

const q = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
const click = async (selector: string) => { await userEvent.click(q(selector)); };
type Frame = Diagnostic & { t: number; participant: string; x: number; y: number; width: number; height: number };
const frames = (f: Launched, participant: string, transaction?: number) =>
  (f.diagnostics('frame') as Frame[]).filter(event => event.participant === participant && (transaction === undefined || event.transaction === transaction));
const nearest = (list: Frame[], t: number) => list.reduce((best, event) => (Math.abs(event.t - t) < Math.abs(best.t - t) ? event : best));
const rect = (el: Element) => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); };
/** History entries created (pushState). replaceState writes (scroll-position bookkeeping) are reported separately. */
const pushes = (f: Launched, from: number) => f.writes.slice(from).filter(write => write.startsWith('push:'));
/** One admitted staged request committed to `url`: request result, admission and terminal outcome, exactly. */
function committedTranscript(url: string) {
  return [
    { kind: 'request', request: expect.anything(), result: { type: 'admitted', transaction: expect.anything() } },
    { kind: 'admitted', transaction: expect.anything(), request: expect.anything() },
    { kind: 'terminal', transaction: expect.anything(), outcome: { type: 'committed', route: 'accepted', attempted: 1, domainCommitted: true, url, history: 'written' } }
  ];
}
/** The same transaction id runs through request result, admission and terminal outcome. */
function linked(events: readonly object[]) {
  for (let i = 0; i < events.length; i += 3) {
    const [request, admitted, terminal] = events.slice(i, i + 3) as Array<Record<string, any>>;
    expect(admitted!.request).toBe(request!.request);
    expect(admitted!.transaction).toBe(request!.result.transaction);
    expect(terminal!.transaction).toBe(admitted!.transaction);
  }
}
const zero = (f: Launched) => expect(f.host().resources()).toEqual({ frames: 0, timers: 0, observers: 0, leases: 0, plane: false, representations: 0, running: false });
/** Largest frame-to-frame step of a representation (px), and the largest step ratio versus its neighbours. */
function continuity(list: Frame[]) {
  const steps = list.slice(1).map((event, i) => Math.hypot(event.x - list[i]!.x, event.y - list[i]!.y, event.width - list[i]!.width, event.height - list[i]!.height));
  return { frames: list.length, maxStepPx: Math.round(Math.max(0, ...steps) * 10) / 10 };
}
function frameWork(result: FrameRecordResult) {
  const gaps = result.frames.slice(1).map((sample, i) => sample.time - result.frames[i]!.time);
  return { recorded: result.recordedCount, truncated: result.truncated, maxFrames: result.maxFrames, missedCheckpoints: result.missedCheckpoints ?? 0, maxFrameGapMs: Math.round(Math.max(0, ...gaps) * 10) / 10, over50ms: gaps.filter(gap => gap > 50).length };
}
/** Accessible (not aria-hidden, not inert) headings with this text. */
const accessibleHeadings = (text: string) =>
  [...document.querySelectorAll('h1, h2')].filter(el => el.textContent?.includes(text) && !el.closest('[aria-hidden="true"], [inert]')).length;
/** The representation wrapper and its painted surface (first child) for one participant. */
function painted(participant: string) {
  const rep = document.querySelector(`[data-route-representation="${participant}"]`);
  return rep?.firstElementChild ? { wrapper: rect(rep), surface: rect(rep.firstElementChild) } : undefined;
}
const fills = (box: { wrapper: number[]; surface: number[] }) => box.surface.every((value, i) => Math.abs(value - box.wrapper[i]!) <= 2);
const screenshot = async (f: Launched, name: string) => {
  const before = f.host().diagnostics.filter(event => event.type === 'frame').at(-1) as Frame | undefined;
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  const after = f.host().diagnostics.filter(event => event.type === 'frame').at(-1) as Frame | undefined;
  return { file: `reference-evidence/rich-representation/scenarios/${name}.png`, runTimeBeforeMs: before && Math.round(before.t), runTimeAfterMs: after && Math.round(after.t) };
};

it('1. shared title plate moves from main to header across a mid-timeline commit with overlapping incoming text', async () => {
  const f = start('/');
  await settle();
  const writesBefore = f.writes.length;
  expect(q('[data-hero]').closest('main')).not.toBeNull();
  const recorder = startMotionRecorder({ targets: { intro: '[data-intro]', rep: '[data-route-representation="hero"]', realHero: '[data-hero]' } });
  q('[data-open-dossier]').focus();
  await userEvent.keyboard('{Enter}');
  await waitFor(() => f.diagnostics('cue').length > 0);
  let heroPaint: ReturnType<typeof painted>;
  await waitFor(() => { const t = frames(f, 'hero').at(-1)?.t ?? 0; if (t > 320 && t < 600 && !heroPaint) heroPaint = painted('hero'); return t > 400; });
  const shot = await screenshot(f, 'dossier-mid-flight');
  // The painted surface fills the resizing representation (not a fixed-size copy inside it).
  expect(heroPaint).toBeDefined();
  expect(fills(heroPaint!)).toBe(true);
  // Semantics mid-flight: the real title lives in the header, the moving copy is not accessible.
  expect(q('[data-hero]').closest('header')).not.toBeNull();
  expect(accessibleHeadings('Horizon Retrospective 2026')).toBe(1);
  await waitFor(() => f.diagnostics('settled').length > 0);
  const recorded = recorder.stop();
  const hero = frames(f, 'hero');
  const cue = f.diagnostics('cue')[0]!.t as number;
  // Intro opacity strictly between 0 and 1 while the plate representation is still present.
  const overlap = recorded.frames.filter(sample => sample.elements.rep!.connected && (sample.elements.intro!.opacity ?? 0) > 0.05 && (sample.elements.intro!.opacity ?? 1) < 0.95);
  expect(overlap.length).toBeGreaterThan(2);
  expect(cue).toBeGreaterThanOrEqual(278);
  expect(cue).toBeLessThan(360);
  expect(hero.at(-1)!.t).toBeGreaterThan(cue + 300);
  // Intermediate pose: narrower and higher than both endpoints near the cue.
  const atCue = nearest(hero, 280), first = hero[0]!, last = hero.at(-1)!;
  expect(atCue.width).toBeLessThan(first.width - 120);
  expect(atCue.y).toBeLessThan(first.y - 20);
  expect(last.width).toBeLessThan(atCue.width);
  const settledRect = rect(q('[data-hero]'));
  expect([last.x, last.y, last.width, last.height].map(Math.round).every((value, i) => Math.abs(value - settledRect[i]!) <= 2)).toBe(true);
  expect(document.activeElement).toBe(q('h1[data-route-focus]'));
  expect(document.activeElement!.matches(':focus-visible')).toBe(true);
  // One main and one page header landmark; nothing left in the plane.
  expect(f.target.querySelectorAll('main')).toHaveLength(1);
  expect(f.target.querySelectorAll('header')).toHaveLength(1);
  expect(accessibleHeadings('Horizon Retrospective 2026')).toBe(1);
  expect(f.trace).toEqual(['navigate']);
  expect(pushes(f, writesBefore)).toEqual(['push:/dossier']);
  expect(f.protocol).toEqual(committedTranscript('/dossier'));
  linked(f.protocol);
  zero(f);
  evidence.sharedHeader = {
    protocol: f.protocol,
    cueMs: Math.round(cue), heroFrames: hero.length, continuity: continuity(hero), overlapFrames: overlap.length,
    atCue: [atCue.x, atCue.y, atCue.width, atCue.height].map(Math.round), start: [first.x, first.y, first.width, first.height].map(Math.round), end: settledRect,
    paintedAfterCue: heroPaint, retarget: f.diagnostics('retarget'), skipped: f.diagnostics('prepared')[0]?.skipped, frameWork: frameWork(recorded),
    trace: f.trace, historyWrites: f.writes.slice(writesBefore), focus: 'h1[data-route-focus]', screenshot: shot, resourcesAfter: f.host().resources()
  };
});

it('2. card expands through a half-page pose into the real interactive study, then a separate collapse recontracts it', async () => {
  const f = start('/');
  await settle();
  const home = rect(q('[data-card="pavilion"]'));
  const writesBefore = f.writes.length;
  await click('[data-open-study]');
  let cardPaint: ReturnType<typeof painted>;
  const controlsOverlap = { frames: 0, covered: [] as string[] };
  const sampleLayering = () => {
    const rep = document.querySelector('[data-route-representation="card-pavilion"]');
    const tools = document.querySelector<HTMLElement>('[data-study-tools]');
    if (!rep || !tools) return;
    const r = rep.getBoundingClientRect();
    for (const control of tools.querySelectorAll<HTMLElement>('button, input, textarea')) {
      const c = control.getBoundingClientRect();
      if (c.right <= r.left || c.left >= r.right || c.bottom <= r.top || c.top >= r.bottom) continue;
      controlsOverlap.frames++;
      const plane = rep.closest('[data-composable-route-plane]')!;
      const ownLayer = getComputedStyle(tools).translate !== 'none';
      const later = !!(plane.compareDocumentPosition(tools) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (!ownLayer || !later || getComputedStyle(plane).zIndex !== 'auto') controlsOverlap.covered.push(`${Math.round(frames(f, 'card-pavilion').at(-1)?.t ?? 0)}ms ${control.outerHTML.slice(0, 40)}`);
      break;
    }
  };
  await waitFor(() => { sampleLayering(); const t = frames(f, 'card-pavilion').at(-1)?.t ?? 0; if (t > 290 && !cardPaint) cardPaint = painted('card-pavilion'); return t > 290; });
  const shot = await screenshot(f, 'study-half-page-waypoint');
  // Qualified layering (public outlet placement: the plane precedes the page). Real controls stay visible:
  // while the decorative surface overlaps a study control, the tools panel is its own layer (slide translate)
  // later in tree order than the z-index:auto plane, so it paints above the decoration.
  // Painted half-page surface: viewport pose { x: .12, y: .16, width: .76, height: .5 } of 1280×900.
  expect(cardPaint && fills(cardPaint)).toBe(true);
  expect(Math.abs(cardPaint!.surface[2]! - 973)).toBeLessThan(40);
  expect(Math.abs(cardPaint!.surface[3]! - 450)).toBeLessThan(40);
  await waitFor(() => { sampleLayering(); return f.diagnostics('settled').length > 0; });
  const open = frames(f, 'card-pavilion');
  // The rich study surface (model + artwork) is taller, so at 1280×900 the card overlaps the tools only briefly;
  // the short-viewport focus suite carries the heavier overlap evidence. Any overlap must still leave controls in front.
  expect(controlsOverlap.frames).toBeGreaterThan(0);
  expect(controlsOverlap.covered).toEqual([]);

  const waypoint = nearest(open, 300);
  // Viewport pose { x: .12, y: .16, width: .76, height: .5 } of 1280×900.
  expect(Math.abs(waypoint.x - 153.6)).toBeLessThan(24);
  expect(Math.abs(waypoint.width - 972.8)).toBeLessThan(40);
  expect(Math.abs(waypoint.height - 450)).toBeLessThan(40);
  zero(f);

  // Real expanded state: keyboard and pointer interaction on actual domain state.
  await userEvent.click(q('[data-zoom="2"]'));
  await userEvent.click(q('[data-overlay="solar"]'));
  await userEvent.type(q('[data-notes]'), 'Arch 7');
  await userEvent.click(q('[data-save]'));
  expect(q('[data-save]').textContent).toContain('Notes saved');
  expect(q('.model').style.transform).toBe('scale(2)');
  const settledStudy = rect(q('[data-study]'));

  await click('[data-close-study]');
  await waitFor(() => f.diagnostics('settled').length > 1);
  const all = frames(f, 'card-pavilion');
  const closeTx = all.at(-1)!.transaction;
  const close = frames(f, 'card-pavilion', closeTx);
  const contraction = nearest(close, 240);
  // Viewport pose { x: .22, y: .24, width: .56, height: .36 }.
  expect(Math.abs(contraction.width - 716.8)).toBeLessThan(40);
  expect(Math.abs(contraction.height - 324)).toBeLessThan(40);
  const back = rect(q('[data-card="pavilion"]'));
  expect(back).toEqual(home);
  const end = close.at(-1)!;
  expect(Math.abs(end.width - back[2]!)).toBeLessThanOrEqual(2);
  expect(f.trace).toEqual(['navigate', 'study:setZoom', 'study:toggleOverlay', 'study:editNotes', 'study:editNotes', 'study:editNotes', 'study:editNotes', 'study:editNotes', 'study:editNotes', 'study:save', 'navigate']);
  expect(pushes(f, writesBefore)).toEqual(['push:/study', 'push:/']);
  expect(f.protocol).toEqual([...committedTranscript('/study'), ...committedTranscript('/')]);
  linked(f.protocol);
  zero(f);
  evidence.cardStudy = {
    controlsOverlap, protocol: f.protocol, paintedAtWaypoint: cardPaint, homeCard: home, studySurface: settledStudy, openWaypoint: [waypoint.t, waypoint.x, waypoint.y, waypoint.width, waypoint.height].map(Math.round),
    closeWaypoint: [contraction.t, contraction.x, contraction.y, contraction.width, contraction.height].map(Math.round),
    openContinuity: continuity(open), closeContinuity: continuity(close), trace: f.trace, historyWrites: f.writes.slice(writesBefore), screenshot: shot
  };
});

it('3. whole-layout reconfiguration: several independently timed geometry tracks, no route change', async () => {
  const f = start('/');
  await settle();
  const before = { hero: rect(q('[data-hero]')), catalog: rect(q('[data-catalog]')), reading: rect(q('[data-reading-list]')) };
  const writesBefore = f.writes.length;
  await click('[data-reading-layout]');
  // Measured (not asserted): effective opacity of any decorative copy painted over a real catalogue control.
  const overControls: number[] = [];
  const sampleOverlap = () => {
    for (const rep of document.querySelectorAll<HTMLElement>('[data-route-representation]')) {
      const r = rep.getBoundingClientRect();
      const surface = rep.firstElementChild;
      const opacity = Number(getComputedStyle(rep).opacity) * Number(getComputedStyle(rep.closest('[data-composable-route-plane]')!).opacity) * (surface ? Number(getComputedStyle(surface).opacity) : 1);
      const covers = [...f.target.querySelectorAll<HTMLElement>('[data-catalog] button')].some(control => { const c = control.getBoundingClientRect(); return c.left < r.right && c.right > r.left && c.top < r.bottom && c.bottom > r.top; });
      if (covers) overControls.push(Math.round(opacity * 100) / 100);
    }
  };
  await waitFor(() => { sampleOverlap(); return (frames(f, 'reading-list').at(-1)?.t ?? 0) > 350; });
  const shot = await screenshot(f, 'reading-room-mid-reconfiguration');
  await waitFor(() => { sampleOverlap(); return f.diagnostics('settled').length > 0; });
  const after = { hero: rect(q('[data-hero]')), catalog: rect(q('[data-catalog]')), reading: rect(q('[data-reading-list]')) };
  // Real geometry change: reading list takes the wide column, catalogue contracts to the side.
  // The reading panel grows (1152×346 → 752×610 in the reference run): taller and larger in area.
  expect(after.reading[3]!).toBeGreaterThan(before.reading[3]! + 150);
  expect(after.reading[2]! * after.reading[3]!).toBeGreaterThan(before.reading[2]! * before.reading[3]! * 1.1);
  expect(after.catalog[2]!).toBeLessThan(before.catalog[2]! * 0.5);
  expect(after.catalog[0]!).toBeGreaterThan(after.reading[0]!);
  const timing = Object.fromEntries(['hero', 'catalog', 'reading-list'].map(key => {
    const list = frames(f, key);
    const moving = list.filter((event, i) => i > 0 && Math.hypot(event.x - list[i - 1]!.x, event.y - list[i - 1]!.y, event.width - list[i - 1]!.width, event.height - list[i - 1]!.height) > 0.5);
    return [key, { frames: list.length, firstMoveMs: Math.round(moving[0]?.t ?? -1), lastMoveMs: Math.round(moving.at(-1)?.t ?? -1), continuity: continuity(list) }];
  }));
  // Every declared moving track really moved (actual samples, nonnegative times).
  for (const key of ['hero', 'catalog', 'reading-list']) {
    expect(timing[key]!.frames).toBeGreaterThan(10);
    expect(timing[key]!.firstMoveMs).toBeGreaterThanOrEqual(0);
    expect(timing[key]!.lastMoveMs).toBeGreaterThan(timing[key]!.firstMoveMs);
  }
  // Independently timed tracks (plan ends: hero 520, catalogue 690, reading list 760 ms), checked on the shared frame
  // timeline as ordered endings after movement: the catalogue still moves on frames strictly after the hero's final
  // movement, and the reading list still moves on frames strictly after the catalogue's final movement. Pre-start
  // rest cannot satisfy this, and endings on the same frame fail it. Brackets and frame gaps are recorded.
  const byFrame = new Map<number, Record<string, boolean>>();
  for (const key of ['hero', 'catalog', 'reading-list']) {
    const list = frames(f, key);
    list.forEach((event, i) => {
      const moved = i > 0 && Math.hypot(event.x - list[i - 1]!.x, event.y - list[i - 1]!.y, event.width - list[i - 1]!.width, event.height - list[i - 1]!.height) > 0.5;
      byFrame.set(event.t, { ...(byFrame.get(event.t) ?? {}), [key]: moved });
    });
  }
  const timeline = [...byFrame.entries()].sort(([a], [b]) => a - b) as unknown as MotionTimeline;
  const catalogueMovesAfterHeroEnds = movesAfterEnd(timeline, 'hero', 'catalog').map(Math.round);
  const readingMovesAfterCatalogueEnds = movesAfterEnd(timeline, 'catalog', 'reading-list').map(Math.round);
  const times = timeline.map(([t]) => t);
  const gaps = times.slice(1).map((t, i) => t - times[i]!);
  const endBracket = (key: string) => { const i = timeline.map(([, m]) => m[key]).lastIndexOf(true); return i < 0 ? null : [Math.round(times[i - 1] ?? 0), Math.round(times[i]!)]; };
  const independence = { catalogueMovesAfterHeroEnds, readingMovesAfterCatalogueEnds, endBrackets: { hero: endBracket('hero'), catalog: endBracket('catalog'), 'reading-list': endBracket('reading-list') }, maxFrameGapMs: Math.round(Math.max(0, ...gaps)), framesOver50: gaps.filter(gap => gap > 50).length };
  expect(catalogueMovesAfterHeroEnds.length).toBeGreaterThan(0);
  expect(readingMovesAfterCatalogueEnds.length).toBeGreaterThan(0);
  expect(q('[data-reading-note]')).not.toBeNull();
  expect(f.trace).toEqual(['home:setLayout']);
  expect(f.writes.slice(writesBefore)).toEqual([]);
  zero(f);

  // Feature a work: the card swells to a half-page pose and recontracts into the first slot.
  await click('[data-reading-layout]');
  await waitFor(() => f.diagnostics('settled').length > 1);
  const cloudBefore = rect(q('[data-card="cloud"]'));
  await click('[data-feature="cloud"]');
  await waitFor(() => f.diagnostics('settled').length > 2);
  const cloud = frames(f, 'card-cloud');
  const swell = nearest(cloud, 380);
  expect(swell.width).toBeGreaterThan(cloudBefore[2]! + 200);
  const cloudAfter = rect(q('[data-card="cloud"]'));
  expect(cloudAfter[1]!).toBeLessThan(cloudBefore[1]!);
  expect(q('[data-catalog] article')).toBe(q('[data-card="cloud"]'));
  zero(f);
  evidence.wholeLayout = { independence, decorationOverRealControls: { samples: overControls.length, maxOpacity: Math.max(0, ...overControls), series: overControls.filter((_, i) => i % 8 === 0) }, before, after, timing, trace: f.trace, historyWrites: f.writes.slice(writesBefore), screenshot: shot, feature: { before: cloudBefore, swell: [swell.t, swell.x, swell.y, swell.width, swell.height].map(Math.round), after: cloudAfter, continuity: continuity(cloud) } };
});

it('4a. rapid reversal and repeated navigation continue from the displayed pose and retain nothing', async () => {
  const f = start('/');
  await settle();
  const writesBefore = f.writes.length;
  await click('[data-open-dossier]');
  await waitFor(() => f.diagnostics('cue').length > 0 && document.querySelector('[data-back]') !== null);
  await frame();
  const lastOut = frames(f, 'hero').at(-1)!;
  await click('[data-back]');
  await waitFor(() => f.diagnostics('settled').length >= 2);
  const reverseTx = frames(f, 'hero').at(-1)!.transaction;
  const firstBack = frames(f, 'hero', reverseTx)[0]!;
  const jump = Math.hypot(firstBack.x - lastOut.x, firstBack.y - lastOut.y);
  expect(jump).toBeLessThan(40);
  // Visual supersession is not a protocol outcome: both transactions committed exactly once.
  expect(f.diagnostics('settled').map(event => event.reason).slice(0, 2)).toEqual(['superseded', 'completed']);
  expect(f.protocol).toEqual([...committedTranscript('/dossier'), ...committedTranscript('/')]);
  linked(f.protocol);
  const reversalProtocol = [...f.protocol];
  for (let round = 0; round < 5; round++) {
    await click('[data-open-dossier]');
    await waitFor(() => location.pathname === '/dossier' && document.querySelector('[data-back]') !== null);
    await click('[data-back]');
    await waitFor(() => location.pathname === '/' && !f.host().resources().running);
  }
  expect(document.querySelectorAll('[data-page]')).toHaveLength(1);
  expect(document.querySelectorAll('[data-route-representation]')).toHaveLength(0);
  expect(f.trace).toEqual(Array(12).fill('navigate'));
  expect(f.protocol).toEqual(Array(6).fill(0).flatMap(() => [...committedTranscript('/dossier'), ...committedTranscript('/')]));
  linked(f.protocol);
  expect(pushes(f, writesBefore)).toEqual(Array(6).fill(['push:/dossier', 'push:/']).flat());
  zero(f);
  evidence.reversal = { reversalProtocol, protocolEvents: f.protocol.length, lastOutgoingFrame: [lastOut.t, lastOut.x, lastOut.y].map(Math.round), firstReverseFrame: [firstBack.t, firstBack.x, firstBack.y].map(Math.round), jumpPx: Math.round(jump * 10) / 10, settledReasons: f.diagnostics('settled').map(event => event.reason), navigations: 12, diagnosticsRetained: f.host().diagnostics.length, resourcesAfter: f.host().resources() };
});

it('4b. (was gap R1) viewport resize before the cue re-resolves the viewport-relative pose (positive control)', async () => {
  const f = start('/');
  await settle();
  await click('[data-open-study]');
  await waitFor(() => (frames(f, 'card-pavilion').at(-1)?.t ?? 0) > 60);
  await page.viewport(900, 800);
  const resizedAt = frames(f, 'card-pavilion').at(-1)!.t;
  expect(window.innerWidth).toBe(900);
  await waitFor(() => f.diagnostics('settled').length > 0);
  const waypoint = nearest(frames(f, 'card-pavilion'), 300);
  evidence.resizeProbe = { resizedAtRunMs: Math.round(resizedAt), waypointWidth: Math.round(waypoint.width), expectedAt900: 684, expectedAt1280: 973 };
  expect(resizedAt).toBeLessThan(280);
  // 0.76 × 900 = 684 (would be 973 at the original width).
  expect(Math.abs(waypoint.width - 684)).toBeLessThan(40);
  const end = frames(f, 'card-pavilion').at(-1)!, real = rect(q('[data-study]'));
  expect(Math.abs(end.width - real[2]!)).toBeLessThanOrEqual(2);
  zero(f);
  evidence.resize = { waypointAfterResize: [waypoint.t, waypoint.x, waypoint.y, waypoint.width, waypoint.height].map(Math.round), settledEnd: [end.x, end.y, end.width, end.height].map(Math.round), realStudy: real };
});

it('4c. nested scroll: page scroll mid-flight rebases, and the reading list position is restored on back', async () => {
  const f = start('/');
  await settle();
  const list = q('[data-composable-scroll="reading-list"]');
  list.scrollTop = 90;
  await frame();
  await click('[data-feature="lattice"]');
  await waitFor(() => (frames(f, 'card-lattice').at(-1)?.t ?? 0) > 200);
  window.scrollBy(0, 120);
  await waitFor(() => f.diagnostics('settled').length > 0);
  const end = frames(f, 'card-lattice').at(-1)!, real = rect(q('[data-card="lattice"]'));
  // Settles on the real card's post-scroll viewport rect, not the stale pre-scroll one.
  expect(Math.abs(end.y - real[1]!)).toBeLessThanOrEqual(2);
  window.scrollTo(0, 0);
  await click('[data-open-dossier]');
  await waitFor(() => location.pathname === '/dossier' && !f.host().resources().running);
  history.back();
  await waitFor(() => location.pathname === '/' && document.querySelector('[data-composable-scroll="reading-list"]') !== null);
  await settle();
  await settle();
  const restored = q('[data-composable-scroll="reading-list"]').scrollTop;
  expect(restored).toBe(90);
  zero(f);
  evidence.nestedScroll = { endAfterPageScroll: [end.x, end.y, end.width, end.height].map(Math.round), realAfterScroll: real, readingListRestoredScrollTop: restored, trace: f.trace };
});

it('4d. (was gap R2) late destination geometry after commit is followed to the real destination (positive control)', async () => {
  const f = start('/');
  await settle();
  await click('[data-open-dossier]');
  await waitFor(() => document.querySelector('[data-back]') !== null && (frames(f, 'hero').at(-1)?.t ?? 0) > 320);
  const spacer = document.createElement('div');
  spacer.style.height = '140px';
  q('.hero-header-compact').before(spacer);
  await waitFor(() => f.diagnostics('settled').length > 0);
  const end = frames(f, 'hero').at(-1)!, real = rect(q('[data-hero]'));
  evidence.lateGeometry = { end: [end.x, end.y, end.width, end.height].map(Math.round), real, retargets: f.diagnostics('retarget').length, recaptures: f.diagnostics('recapture') };
  expect(Math.abs(end.y - real[1]!)).toBeLessThanOrEqual(2);
  spacer.remove();
  zero(f);
});

it('4e. the Reduce motion preference changes the actual plan: no geometry travel, one short handoff', async () => {
  const f = start('/');
  await settle();
  await click('[data-reduced-motion-toggle]');
  const writesBefore = f.writes.length;
  const t0 = performance.now();
  await click('[data-open-dossier]');
  await waitFor(() => location.pathname === '/dossier' && !f.host().resources().running);
  const elapsed = performance.now() - t0;
  expect(frames(f, 'hero')).toHaveLength(0);
  expect(document.querySelectorAll('[data-route-representation]')).toHaveLength(0);
  expect(elapsed).toBeLessThan(600);
  // Within-page layout changes commit immediately.
  await click('[data-back]');
  await waitFor(() => location.pathname === '/' && !f.host().resources().running);
  await click('[data-reading-layout]');
  await settle();
  expect(q('[data-reading-note]')).not.toBeNull();
  expect(f.host().diagnostics.filter(event => event.transaction < 0)).toHaveLength(0);
  expect(f.trace).toEqual(['setReducedMotion', 'navigate', 'navigate', 'home:setLayout']);
  expect(pushes(f, writesBefore)).toEqual(['push:/dossier', 'push:/']);
  zero(f);
  evidence.reducedMotion = { elapsedMs: Math.round(elapsed), heroFrames: 0, settled: f.diagnostics('settled').map(event => event.reason), trace: f.trace };
});

it('4f. destroying the Host mid-flight releases every owned visual resource', async () => {
  const f = start('/');
  await settle();
  await click('[data-open-study]');
  await waitFor(() => (frames(f, 'card-pavilion').at(-1)?.t ?? 0) > 150);
  const host = f.host();
  expect(host.resources().running).toBe(true);
  await f.destroy();
  await frame(); await frame();
  const after = host.resources();
  expect(after).toEqual({ frames: 0, timers: 0, observers: 0, leases: 0, plane: false, representations: 0, running: false });
  expect(document.querySelectorAll('[data-route-representation], [data-composable-route-plane]')).toHaveLength(0);
  evidence.hostDestruction = { resourcesAfter: after, settled: host.diagnostics.filter(event => event.type === 'settled').map(event => event.reason) };
});

it('3b. (was gap R3) within-page shared tracks start from the source position and honour startMs', async () => {
  const f = start('/');
  await settle();
  const source = rect(q('[data-catalog]'));
  await click('[data-reading-layout]');
  await waitFor(() => f.diagnostics('settled').length > 0);
  const catalog = frames(f, 'catalog');
  const first = catalog[0]!;
  evidence.localSourceGap = { sourceRect: source, firstFrame: [first.t, first.x, first.y, first.width, first.height].map(Math.round), retarget: f.diagnostics('retarget').find(event => event.participant === 'catalog'), recaptures: f.diagnostics('recapture') };
  // Design: the representation departs from the measured source rect.
  expect(Math.abs(first.x - source[0]!) + Math.abs(first.y - source[1]!)).toBeLessThan(4);
  // Plan: the catalogue track starts at 90 ms; before that it must hold its source geometry.
  expect(catalog.filter(event => event.t < 85).every(event => Math.abs(event.width - source[2]!) < 1)).toBe(true);
});

it('2b. (was gap R4) the painted shared representation follows its geometry through the half-page pose', async () => {
  const f = start('/');
  await settle();
  await click('[data-open-study]');
  let painted: number[] = [], wrapper: number[] = [], t = 0;
  await waitFor(() => {
    const rep = document.querySelector('[data-route-representation="card-pavilion"]');
    const last = frames(f, 'card-pavilion').at(-1);
    if (rep?.firstElementChild && last && last.t >= 290 && painted.length === 0) { painted = rect(rep.firstElementChild); wrapper = rect(rep); t = Math.round(last.t); }
    return f.diagnostics('settled').length > 0;
  });
  evidence.paintedRepresentationGap = { runMs: t, wrapper, painted, wrapperBackground: 'transparent (overflow hidden)', expectedPose: [154, 144, 973, 450] };
  // The visible surface must be the half-page pose, not the card-sized copy inside an unpainted wrapper.
  expect(painted[2]!).toBeGreaterThan(wrapper[2]! * 0.9);
  expect(painted[3]!).toBeGreaterThan(wrapper[3]! * 0.9);
});

it('no application element runs a CSS transition (state and pseudo-class changes are instant)', async () => {
  const f = start('/');
  await settle();
  const timed = () => [...f.target.querySelectorAll('*')].filter(el => getComputedStyle(el).transitionDuration.split(',').some(value => parseFloat(value) > 0)).map(el => el.className || el.tagName);
  expect(timed()).toEqual([]);
  await click('[data-open-study]');
  await waitFor(() => location.pathname === '/study' && !f.host().resources().running);
  expect(timed()).toEqual([]);
  // Zoom applies in the same frame as the click; nothing eases toward it.
  await userEvent.click(q('[data-zoom="2"]'));
  expect(getComputedStyle(q('.model')).transform).toBe('matrix(2, 0, 0, 2, 0, 0)');
});

it('effect retirement: a resource owned by the outgoing page retires exactly once at the commit, while its decoration continues', async () => {
  const f = start('/');
  await settle();
  // Test-owned witness resource registered on the live home page owner (the app itself starts no effects).
  const view = bindManagedProjection(f.app.store, pageSlot.case('home')) as { dispatch(action: unknown): void };
  const controller = new AbortController();
  let cleanups = 0;
  capturedView(view).registerResource({ kind: 'execution', controller, cleanup: () => { cleanups++; }, description: 'test-owned retirement witness (not product code)' });
  await click('[data-open-dossier]');
  await waitFor(() => (frames(f, 'hero').at(-1)?.t ?? 0) > 120);
  const beforeCue = { aborted: controller.signal.aborted, cleanups, cue: f.diagnostics('cue').length };
  expect(beforeCue).toEqual({ aborted: false, cleanups: 0, cue: 0 });
  await waitFor(() => f.diagnostics('cue').length > 0 && location.pathname === '/dossier');
  await frame();
  const atCommit = { aborted: controller.signal.aborted, cleanups, decorationRunning: f.host().resources().running, representation: document.querySelector('[data-route-representation="hero"]') !== null };
  expect(atCommit).toEqual({ aborted: true, cleanups: 1, decorationRunning: true, representation: true });
  // The retired owner's view cannot change state or reach the reducer.
  const traceBefore = [...f.trace];
  let staleDispatch = 'ignored';
  try { view.dispatch({ type: 'applaud' }); } catch (error) { staleDispatch = `threw: ${(error as Error).message}`; }
  await settle();
  expect(f.trace).toEqual(traceBefore);
  expect(f.app.store.state.url).toBe('/dossier');
  expect(f.app.store.state.page?.type).toBe('detail');
  await waitFor(() => f.diagnostics('settled').length > 0);
  expect(cleanups).toBe(1);
  zero(f);
  evidence.retirement = { beforeCue, atCommit, staleDispatch, traceAfterStale: f.trace, cleanupsAfterSettle: cleanups };
});
