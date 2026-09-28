/**
 * WP5b/WP6 visual witnesses through the public assembly. Continuity is checked numerically against the
 * run's own per-frame diagnostics (value and velocity at the retarget instant), not a loose pixel bound.
 */
import { afterEach, expect, it } from 'vitest';
import { mount, unmount, tick } from 'svelte';
import VisualApp from './visual-fixtures/VisualApp.svelte';
import { big, policy, requesters, type VisualIntent, type VisualState, type VisualAction } from './visual-fixtures/VisualModel.js';
import { getApplicationInternal } from '../../src/lib/application/instance.svelte.js';
import { routeHostFor } from '../../src/lib/application/renderer/choreography/route-host.js';
import { hasChoreographyLease } from '../../src/lib/application/renderer/target-registry.js';
import { defineChoreography, type ChoreographyPlan } from '../../src/lib/application/motion-public.js';
import { VISUAL_DEFAULTS, type RunDiagnostic } from '../../src/lib/application/renderer/choreography/run.js';
import type { ApplicationInstance, StagedRouteRequester } from '../../src/lib/application/index.js';

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const stop of cleanups.splice(0).reverse()) await stop(); requesters.length = 0; policy.allow = true; });
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const wait = async (predicate: () => boolean, timeout = 3000) => { const start = performance.now(); while (!predicate()) { if (performance.now() - start > timeout) throw new Error('timed out'); await frame(); } };

function setup(url = '/', planeOutlet: 'none' | 'ok' | 'transformed' = 'none') {
  const oldURL = location.href, oldState = history.state, oldScroll = window.scrollY;
  history.replaceState(null, '', url);
  const target = document.createElement('div');
  document.body.append(target);
  const trace: string[] = [];
  let app!: ApplicationInstance<VisualState, VisualAction>;
  const component = mount(VisualApp, { target, props: { url, dependencies: { trace }, onApp: value => { app = value; }, planeOutlet } });
  cleanups.push(async () => { await unmount(component); target.remove(); history.replaceState(oldState, '', oldURL); window.scrollTo(0, oldScroll); });
  const staged = () => getApplicationInternal(app).staged!;
  return {
    target, trace, staged, get app() { return app; }, host: () => routeHostFor(staged())!,
    requester: (where: string): StagedRouteRequester<VisualIntent> => [...requesters].reverse().find(entry => entry.where === where)!.requester,
    diagnostics: <T extends RunDiagnostic['type']>(type: T) => routeHostFor(staged())!.diagnostics.filter((event): event is Extract<RunDiagnostic, { type: T }> => event.type === type)
  };
}
async function ready(f: ReturnType<typeof setup>) { await tick(); await frame(); await frame(); }
const settled = (f: ReturnType<typeof setup>, count = 1) => wait(() => f.diagnostics('settled').length >= count);
/** Zero retained plane, leases, deadlines and run after settlement. */
function assertClean(f: ReturnType<typeof setup>) {
  expect(document.querySelector('[data-composable-route-plane]')).toBeNull();
  for (const node of f.target.querySelectorAll<HTMLElement>('[data-hero],[data-body],[data-nav],[data-card],[data-badge],[data-pulse],[data-faded],[data-scaled],[data-intro],[data-hero-link],[data-card-expanded]')) expect(hasChoreographyLease(node)).toBe(false);
  expect(f.staged().coordinator.status.pendingDeadlines()).toEqual([]);
}
const heroPlan = (extra: ChoreographyPlan['tracks'] = []) => defineChoreography({ cueMs: 250, durationMs: 700, tracks: [
  { participant: 'hero', side: 'shared', startMs: 0, durationMs: 700, easing: 'ease-in-out', path: [{ atMs: 250, pose: { relativeTo: 'source', dy: -30 } }] },
  { participant: 'body', side: 'outgoing', startMs: 0, durationMs: 500, easing: 'linear', opacity: { from: 1, to: 0 } },
  ...extra
] });

it('C1 at the destination retarget: position and velocity continue exactly from the displayed state', async () => {
  const f = setup();
  await ready(f);
  f.requester('home').request({ to: '/detail' }, { motion: heroPlan() });
  await settled(f);
  const retarget = f.diagnostics('retarget').find(event => event.cause === 'destination' && event.participant === 'hero')!;
  expect(retarget).toBeDefined();
  // The frame written in the retarget tick samples the new segment at the same instant.
  const atRetarget = f.diagnostics('frame').find(event => event.participant === 'hero' && event.t === retarget.t)!;
  expect(atRetarget.x).toBeCloseTo(retarget.from[0], 6);
  expect(atRetarget.y).toBeCloseTo(retarget.from[1], 6);
  if (!retarget.constrained) { expect(atRetarget.vx).toBeCloseTo(retarget.velocity[0], 6); expect(atRetarget.vy).toBeCloseTo(retarget.velocity[1], 6); }
  // Endpoint: the measured destination rect, reached with zero velocity.
  const last = f.diagnostics('frame').filter(event => event.participant === 'hero').at(-1)!;
  expect(last.x).toBeCloseTo(retarget.to[0], 3);
  // Frame `vx` is a backward 1 ms secant (compose(t).x - compose(t - 1).x), not the instantaneous derivative. The final
  // Hermite continuation (from the displayed state to the destination, terminal velocity 0, ending at 700 ms) is
  // evaluated in closed form, and the last frame's secant must equal its exact secant (unchanged tolerance).
  const T = 700 - retarget.t;
  const hermiteX = (ms: number) => { const u = Math.min(1, Math.max(0, (ms - retarget.t) / T)); return (2 * u ** 3 - 3 * u ** 2 + 1) * retarget.from[0] + (u ** 3 - 2 * u ** 2 + u) * T * retarget.velocity[0] + (-2 * u ** 3 + 3 * u ** 2) * retarget.to[0]; };
  expect(last.vx).toBeCloseTo(hermiteX(last.t) - hermiteX(last.t - 1), 6);
  // Interactive destination (header link): visibly usable from commit, never suppressed.
  expect(f.target.querySelector<HTMLElement>('[data-hero-link]')!.style.opacity).toBe('');
  assertClean(f);
});

it('successor adopts the displayed pose and velocity: no restoration frame, no representation gap', async () => {
  const f = setup();
  await ready(f);
  const home = f.requester('home');
  home.request({ to: '/detail' }, { motion: defineChoreography({ cueMs: 600, durationMs: 800, tracks: [{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 800, easing: 'linear', path: [{ atMs: 600, pose: { relativeTo: 'source', dx: 200 } }] }] }) });
  await wait(() => f.diagnostics('frame').some(event => event.t > 150));
  const hero = f.target.querySelector<HTMLElement>('[data-hero]')!;
  const rep = document.querySelector('[data-route-representation="hero"]');
  const observed: string[] = [];
  let watching = true;
  const watch = () => { if (!watching) return; observed.push(`${hero.style.opacity}|${document.querySelector('[data-route-representation="hero"]') ? 'rep' : 'none'}`); requestAnimationFrame(watch); };
  requestAnimationFrame(watch);
  home.request({ to: '/card' }, { motion: defineChoreography({ cueMs: 300, durationMs: 600, tracks: [{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 600, easing: 'linear', path: [{ atMs: 300, pose: { relativeTo: 'source', dy: 120 } }] }] }) });
  await wait(() => f.diagnostics('retarget').some(event => event.cause === 'successor'));
  const successor = f.diagnostics('retarget').find(event => event.cause === 'successor')!;
  const firstFrames = f.diagnostics('frame').filter(event => event.transaction === successor.transaction && event.participant === 'hero');
  await wait(() => f.diagnostics('frame').some(event => event.transaction === successor.transaction));
  const first = f.diagnostics('frame').find(event => event.transaction === successor.transaction && event.participant === 'hero')!;
  void firstFrames;
  // The adopted representation is the same element; its first successor frame starts at the displayed pose.
  expect(document.querySelector('[data-route-representation="hero"]')).toBe(rep);
  expect(first.x).toBeCloseTo(successor.from[0], 6);
  expect(first.vx).toBeCloseTo(successor.velocity[0], 6);
  expect(Math.abs(successor.velocity[0])).toBeGreaterThan(0.05);
  await settled(f, 2);
  watching = false;
  // Until settlement the real source stayed suppressed and a representation stayed painted.
  const beforeSettle = observed.slice(0, observed.findIndex(entry => entry.endsWith('none')) === -1 ? observed.length : observed.findIndex(entry => entry.endsWith('none')));
  expect(beforeSettle.length).toBeGreaterThan(3);
  for (const entry of beforeSettle) expect(entry).toBe('0|rep');
  expect(f.diagnostics('settled').map(event => event.reason)).toEqual(['superseded', 'completed']);
  expect(f.trace).toEqual(['go:/card']);
  assertClean(f);
});

it('veto at the cue returns the still-current page from the displayed poses, bounded, with zero domain actions', async () => {
  const f = setup();
  await ready(f);
  f.requester('home').request({ to: '/detail' }, { motion: heroPlan() });
  await wait(() => f.diagnostics('frame').some(event => event.t > 120));
  policy.allow = false;
  await settled(f);
  expect(f.trace).toEqual([]);
  const back = f.diagnostics('retarget').find(event => event.cause === 'return' && event.participant === 'hero')!;
  expect(back).toBeDefined();
  const hero = f.target.querySelector<HTMLElement>('[data-hero]')!;
  // Returned to the measured source rect; source paint revealed; outgoing content back to stable.
  expect(back.to[0]).toBeCloseTo(hero.getBoundingClientRect().x, 3);
  expect(f.diagnostics('settled')[0]!.reason).toBe('returned');
  expect(f.diagnostics('settled')[0]!.t).toBeLessThanOrEqual(700 + 250 + 50);
  expect(hero.style.opacity).toBe('');
  expect(f.target.querySelector<HTMLElement>('[data-body]')!.style.opacity).toBe('');
  assertClean(f);
});

/** Paint samples recorded against the run's own clock: `t` is the latest run frame time when sampled. */
type PaintSample = { readonly t: number; readonly opacity: number };
/** Samples before `until` (run time) whose real paint is not the held stable value. */
const releasedBefore = (samples: readonly PaintSample[], until: number, stable = 1) => samples.filter(sample => sample.t < until && Math.abs(sample.opacity - stable) > 1e-6);

it('hold-then-fade: a control stays painted at stable before commit, then its copy fades after reveal; visible focus pins a focusable participant', async () => {
  const f = setup();
  await ready(f);
  const nav = f.target.querySelector<HTMLElement>('[data-nav]')!;
  const body = f.target.querySelector<HTMLElement>('[data-body]')!;
  const note = f.target.querySelector<HTMLElement>('[data-note]')!;
  const paint = { nav: [] as PaintSample[], body: [] as PaintSample[], note: [] as PaintSample[] };
  let watching = true;
  const watch = () => {
    if (!watching) return;
    const t = f.diagnostics('frame').at(-1)?.t;
    if (t !== undefined) for (const [key, node] of [['nav', nav], ['body', body], ['note', note]] as const) if (node.isConnected && !f.diagnostics('reveal').some(event => event.participant === key)) paint[key].push({ t, opacity: Number(getComputedStyle(node).opacity) });
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
  // `nav` (control) and `note` (plain, the in-run negative control) declare the same track, which ends at 200 ms, before the cue.
  const early = { side: 'outgoing', startMs: 0, durationMs: 200, easing: 'linear', opacity: { from: 1, to: 0 } } as const;
  f.requester('home').request({ to: '/detail' }, { motion: heroPlan([{ participant: 'nav', ...early, paint: { kind: 'minOpacity', min: 0.5 } }, { participant: 'note', ...early }]) });
  await wait(() => f.diagnostics('frame').some(event => event.t > 100));
  body.focus({ focusVisible: true } as FocusOptions);
  await wait(() => f.diagnostics('reveal').length >= 3);
  watching = false;
  // Unqualified custom paint policy fell back at construction, before playback.
  expect(f.diagnostics('prepared')[0]!.skipped).toContain('paintPolicyUnqualified:nav:minOpacity->holdThenFade');
  const cue = f.diagnostics('cue')[0]!;
  expect(cue).toBeDefined();
  const reveal = (key: string) => f.diagnostics('reveal').find(event => event.participant === key)!;
  // Control: real paint held at stable past its authored track end, until its reveal at the recorded cue; released only there.
  const navReveal = reveal('nav');
  expect(navReveal.t).toBeGreaterThanOrEqual(cue.t);
  expect(paint.nav.some(sample => sample.t > early.durationMs)).toBe(true);
  expect(releasedBefore(paint.nav, navReveal.t)).toEqual([]);
  expect(navReveal.opacity).toBe(1);
  // Negative control in the same run: a plain participant with the same track releases paint before the cue, and the check reports it.
  expect(releasedBefore(paint.note, cue.t).length).toBeGreaterThan(0);
  // The declared track ended at 200 ms, before the cue: the copy uses the documented post-reveal fade.
  const pinned = f.diagnostics('focusPinned').find(event => event.participant === 'body');
  expect(pinned).toBeDefined();
  expect(pinned!.t).toBeLessThan(cue.t);
  const bodyReveal = reveal('body');
  expect(bodyReveal.t).toBeGreaterThanOrEqual(cue.t);
  // Pinned: from the recorded pin on, real paint never fades further; it is stable once the focus-settle bound
  // (measured from the recorded pin) has elapsed; the reveal continues from the displayed value.
  const afterPin = paint.body.filter(sample => sample.t >= pinned!.t);
  expect(afterPin.length).toBeGreaterThan(0);
  afterPin.forEach((sample, index) => { if (index) expect(sample.opacity).toBeGreaterThanOrEqual(afterPin[index - 1]!.opacity - 1e-6); });
  expect(releasedBefore(afterPin.filter(sample => sample.t >= pinned!.t + VISUAL_DEFAULTS.focusSettleMs), Infinity)).toEqual([]);
  expect(bodyReveal.opacity).toBeGreaterThanOrEqual(afterPin.at(-1)!.opacity - 1e-6);
  if (bodyReveal.t >= pinned!.t + VISUAL_DEFAULTS.focusSettleMs) expect(bodyReveal.opacity).toBeCloseTo(1, 6);
  // Unpinned, the linear fade would be 1 - t/500 at reveal.
  expect(1 - bodyReveal.t / 500).toBeLessThan(0.7);
  expect(bodyReveal.opacity).toBeGreaterThan(1 - bodyReveal.t / 500);
  await settled(f);
  assertClean(f);
});

it('content mutation during suppression recaptures on the next frame without doubled opacity; scroll before the cue is sampled', async () => {
  const f = setup();
  await ready(f);
  const body = f.target.querySelector<HTMLElement>('[data-note]')!; // plain, non-focusable surface (F1: focusable content holds paint)
  f.requester('home').request({ to: '/detail' }, { motion: heroPlan([{ participant: 'note', side: 'outgoing', startMs: 0, durationMs: 500, easing: 'linear', opacity: { from: 1, to: 0 } }]) });
  await wait(() => f.diagnostics('frame').some(event => event.t > 80));
  body.textContent = 'Mutated while suppressed';
  window.scrollTo(0, 40);
  await wait(() => f.diagnostics('recapture').length > 0);
  const recapture = f.diagnostics('recapture')[0]!;
  expect(recapture).toMatchObject({ participant: 'note', outcome: 'captured' });
  const rep = document.querySelector<HTMLElement>('[data-route-representation="note"]')!;
  expect(rep.textContent).toContain('Mutated while suppressed');
  // The copy carries the participant's own stable opacity; only the wrapper carries the track value.
  expect((rep.firstElementChild as HTMLElement).style.opacity).toBe('1');
  expect(Number(body.style.opacity)).toBeLessThan(1);
  const scrolledTop = body.getBoundingClientRect().y;
  await wait(() => f.diagnostics('reveal').some(event => event.participant === 'note'));
  const reveal = f.diagnostics('reveal').find(event => event.participant === 'note')!;
  expect(reveal.rect[1]).toBeCloseTo(scrolledTop, 0);
  // No restoration write at beforeRemoval: the retired node keeps its last track value (abandoned lease).
  expect(body.isConnected).toBe(false);
  expect(body.style.opacity).not.toBe('');
  expect(Number(body.style.opacity)).toBeGreaterThanOrEqual(reveal.opacity - 0.1);
  expect(Number(body.style.opacity)).toBeLessThanOrEqual(1);
  expect(reveal.sampleAge).toBeLessThan(100);
  await settled(f);
  assertClean(f);
});

it('nested participants become layout-preserving placeholders in the ancestor copy; unsupported geometry skips its track honestly', async () => {
  const f = setup();
  await ready(f);
  f.requester('home').request({ to: '/detail' }, { motion: heroPlan([
    { participant: 'card', side: 'outgoing', startMs: 0, durationMs: 500, opacity: { from: 1, to: 0 } },
    { participant: 'badge', side: 'outgoing', startMs: 0, durationMs: 300, opacity: { from: 1, to: 0 } },
    { participant: 'skewed', side: 'outgoing', startMs: 0, durationMs: 300, opacity: { from: 1, to: 0 } },
    { participant: 'deep', side: 'outgoing', startMs: 0, durationMs: 300, opacity: { from: 1, to: 0 } }
  ]) });
  await wait(() => f.diagnostics('prepared').length > 0);
  const cardCopy = document.querySelector<HTMLElement>('[data-route-representation="card"]')!;
  const badgeInCard = cardCopy.firstElementChild!.firstElementChild as HTMLElement;
  expect(badgeInCard.style.visibility).toBe('hidden');
  expect(badgeInCard.style.width).toBe('40px');
  expect(document.querySelector('[data-route-representation="badge"]')).not.toBeNull();
  // Foreign transformed ancestor: capture refused; no representation, no guessed pose.
  // 2D affine spaces (a rotated ancestor) are represented with their exact matrix; a perspective (non-affine) space is not.
  const skewedCopy = document.querySelector<HTMLElement>('[data-route-representation="skewed"]');
  expect(skewedCopy).not.toBeNull();
  expect(skewedCopy!.style.transform).toContain('matrix(');
  expect(f.diagnostics('unsupported')).toContainEqual(expect.objectContaining({ participant: 'deep', reason: 'transformed-space:3d' }));
  expect(document.querySelector('[data-route-representation="deep"]')).toBeNull();
  await settled(f);
  expect(f.trace).toEqual(['go:/detail']);
  assertClean(f);
});

it('an unrelated open native modal (top layer) no longer refuses route choreography: the run plays and commits once (fluid-overlays §10)', async () => {
  const f = setup();
  await ready(f);
  const dialog = document.createElement('dialog');
  dialog.textContent = 'modal';
  document.body.append(dialog);
  dialog.showModal();
  cleanups.push(() => { dialog.close(); dialog.remove(); });
  const handle = f.requester('home').request({ to: '/detail' }, { motion: heroPlan() });
  expect(handle.status).toMatchObject({ type: 'admitted' });
  await settled(f);
  expect(f.trace).toHaveLength(1);
  expect(f.diagnostics('unsupported').some(event => event.reason === 'topLayer')).toBe(false);
  expect(f.diagnostics('settled')[0]!.reason).toBe('completed');
  expect(f.diagnostics('frame').some(event => event.participant === 'hero')).toBe(true);
  assertClean(f);
});

it('card expands through an intermediate viewport pose to a real interactive expanded state, with independent tracks', async () => {
  const f = setup();
  await ready(f);
  const plan = defineChoreography({ cueMs: 300, durationMs: 800, tracks: [
    { participant: 'card', side: 'shared', startMs: 0, durationMs: 800, easing: 'ease-in-out', radius: { from: 4, to: 16 }, path: [{ atMs: 300, pose: { relativeTo: 'viewport', x: 0.25, y: 0.1, width: 0.5, height: 0.5 }, radius: 24 }] },
    { participant: 'hero', side: 'shared', startMs: 0, durationMs: 600, easing: 'ease-out', path: [{ atMs: 300, pose: { relativeTo: 'source', dy: -40 } }] },
    { participant: 'body', side: 'outgoing', startMs: 100, durationMs: 250, easing: 'linear', opacity: { from: 1, to: 0 } }
  ] });
  f.requester('home').request({ to: '/card' }, { motion: plan });
  await settled(f);
  const frames = f.diagnostics('frame').filter(event => event.participant === 'card');
  const atPose = frames.reduce((best, event) => Math.abs(event.t - 300) < Math.abs(best.t - 300) ? event : best);
  // Near t=300 the card is at the half-page intermediate surface (within one frame of motion).
  expect(atPose.width).toBeGreaterThan(window.innerWidth * 0.5 - 60);
  expect(atPose.width).toBeLessThan(window.innerWidth * 0.5 + 60);
  const expanded = f.target.querySelector<HTMLElement>('[data-card-expanded]')!;
  expect(frames.at(-1)!.width).toBeCloseTo(expanded.getBoundingClientRect().width, 1);
  // The expanded content is semantic and interactive in the real application view, not in a copy.
  expect(f.target.querySelector('[data-collapse]')).not.toBeNull();
  expect(expanded.style.opacity).toBe('');
  // Hero and card ran independently timed tracks in the same choreography.
  expect(f.diagnostics('frame').some(event => event.participant === 'hero')).toBe(true);
  assertClean(f);
});

it('foreign authority, ancestor opacity and 2D ancestor scale: displayed values captured, foreign writer never acquired, appearance applied once', async () => {
  const f = setup();
  await ready(f);
  const pulse = f.target.querySelector<HTMLElement>('[data-pulse]')!;
  await wait(() => Number(getComputedStyle(pulse).opacity) > 0.25);
  f.requester('home').request({ to: '/detail' }, { motion: heroPlan([
    { participant: 'pulse', side: 'outgoing', startMs: 0, durationMs: 400, opacity: { from: 1, to: 0 } },
    { participant: 'faded', side: 'outgoing', startMs: 0, durationMs: 500, easing: 'linear', opacity: { from: 1, to: 0 } },
    { participant: 'scaled', side: 'outgoing', startMs: 0, durationMs: 500, easing: 'linear', opacity: { from: 1, to: 0 } }
  ]) });
  await wait(() => f.diagnostics('prepared').length > 0);
  // Positive control: the motion engine holds pulse opacity; choreography took no writer.
  const skipped = f.diagnostics('prepared')[0]!.skipped;
  expect(skipped.some(entry => entry.startsWith('pulse:') && entry.endsWith(':displayedOnly'))).toBe(true);
  const pulseBefore: string[] = [];
  let sampling = true;
  const sample = () => { if (!sampling) return; if (pulse.isConnected) pulseBefore.push(pulse.style.opacity); requestAnimationFrame(sample); };
  requestAnimationFrame(sample);
  const faded = f.target.querySelector<HTMLElement>('[data-faded]')!;
  const scaled = f.target.querySelector<HTMLElement>('[data-scaled]')!;
  let fadedRect!: DOMRect, scaledRect!: DOMRect, pulseDisplayed = 0;
  const lastRects = () => { if (faded.isConnected) { fadedRect = faded.getBoundingClientRect(); scaledRect = scaled.getBoundingClientRect(); pulseDisplayed = Number(getComputedStyle(pulse).opacity); } };
  const tracker = () => { if (!sampling) return; lastRects(); requestAnimationFrame(tracker); };
  requestAnimationFrame(tracker);
  await wait(() => f.diagnostics('reveal').some(event => event.participant === 'scaled'));
  sampling = false;
  // Pulse paint stayed motion-engine owned (values rising toward 1, never forced to a choreography fade).
  expect(pulseBefore.length).toBeGreaterThan(2);
  const pulseCopy = document.querySelector<HTMLElement>('[data-route-representation="pulse"]')!.firstElementChild as HTMLElement;
  expect(Number(pulseCopy.style.opacity)).toBeCloseTo(pulseDisplayed, 1);
  // Ancestor opacity 0.5 applied once on the wrapper; the copy keeps its own opacity 1.
  const fadedReveal = f.diagnostics('reveal').find(event => event.participant === 'faded')!;
  const fadedWrapper = document.querySelector<HTMLElement>('[data-route-representation="faded"]')!;
  expect(Number((fadedWrapper.firstElementChild as HTMLElement).style.opacity)).toBe(1);
  expect(fadedReveal.opacity).toBeGreaterThan(0.2);
  // Scaled ancestor: last sampled rect, layout size restored, scale applied once on the copy.
  const scaledReveal = f.diagnostics('reveal').find(event => event.participant === 'scaled')!;
  expect(scaledReveal.rect[0]).toBeCloseTo(scaledRect.x, 0);
  expect(scaledReveal.rect[2]).toBeCloseTo(90, 0);
  const scaledWrapper = document.querySelector<HTMLElement>('[data-route-representation="scaled"]')!;
  // Engine-neutral: Firefox serializes scale(1.5, 1.5) as scale(1.5); compare the matrix.
  const matrix = new DOMMatrixReadOnly(scaledWrapper.style.transform);
  expect([matrix.a, matrix.b, matrix.c, matrix.d]).toEqual([1.5, 0, 0, 1.5]);
  expect(scaledWrapper.style.width).toBe('60px');
  void fadedRect;
  await settled(f);
  assertClean(f);
});

it('a reduced-motion preference change during playback settles safely; the next-turn cue commits', async () => {
  const listeners = new Set<() => void>();
  const media = { matches: false, media: '(prefers-reduced-motion: reduce)', addEventListener: (_: string, listener: () => void) => listeners.add(listener), removeEventListener: (_: string, listener: () => void) => listeners.delete(listener) };
  const original = window.matchMedia.bind(window);
  window.matchMedia = ((query: string) => query.includes('reduce') ? media as unknown as MediaQueryList : original(query)) as typeof window.matchMedia;
  cleanups.push(() => { window.matchMedia = original; });
  const f = setup();
  await ready(f);
  f.requester('home').request({ to: '/detail' }, { motion: heroPlan() });
  await wait(() => f.diagnostics('frame').some(event => event.t > 60));
  expect(f.trace).toEqual([]);
  media.matches = true;
  for (const listener of [...listeners]) listener();
  await wait(() => f.trace.length === 1);
  expect(f.diagnostics('settled')[0]!.reason).toBe('reducedMotion');
  expect(f.trace).toEqual(['go:/detail']);
  await tick();
  assertClean(f);
});

it('the explicit plane outlet hosts representations; an unqualified (transformed) outlet falls back to the document plane', async () => {
  const ok = setup('/', 'ok');
  await ready(ok);
  ok.requester('home').request({ to: '/detail' }, { motion: heroPlan() });
  await wait(() => ok.diagnostics('prepared').length > 0);
  expect(document.querySelector('[data-composable-route-plane]')!.parentElement!.hasAttribute('data-composable-motion-plane-outlet')).toBe(true);
  await settled(ok);
  assertClean(ok);
  await cleanups.pop()!();
  const fallback = setup('/', 'transformed');
  await ready(fallback);
  expect(fallback.diagnostics('unsupported')).toContainEqual(expect.objectContaining({ reason: 'planeOutletUnqualified' }));
  fallback.requester('home').request({ to: '/detail' }, { motion: heroPlan() });
  await wait(() => fallback.diagnostics('prepared').length > 0);
  expect(document.querySelector('[data-composable-route-plane]')!.parentElement).toBe(document.body);
  await settled(fallback);
  assertClean(fallback);
});

it('the scroll seam checkpoint runs after render and before destination measurement; user scroll rebases', async () => {
  const f = setup();
  await ready(f);
  const log: string[] = [];
  let emit: ((event: { type: 'applied' | 'user' | 'pageRestored' }) => void) | undefined;
  (getApplicationInternal(f.app) as unknown as { scroll?: unknown }).scroll = {
    checkpoint: () => log.push(`checkpoint:${f.diagnostics('retarget').filter(event => event.cause === 'destination').length}`),
    subscribe: (listener: (event: { type: 'applied' | 'user' | 'pageRestored' }) => void) => { emit = listener; return () => { emit = undefined; }; }
  };
  f.requester('home').request({ to: '/detail' }, { motion: heroPlan() });
  await wait(() => f.diagnostics('retarget').some(event => event.cause === 'destination'));
  // One checkpoint for the committed route render, with zero destination measurements before it.
  expect(log).toEqual(['checkpoint:0']);
  emit?.({ type: 'user' });
  await wait(() => f.diagnostics('retarget').filter(event => event.cause === 'destination').length >= 2);
  expect(log).toEqual(['checkpoint:0']);
  await settled(f);
  assertClean(f);
});

it('conflict: a managed motion binding owns its opacity even when idle; choreography records displayed values and the engine keeps writing mid-run', async () => {
  const f = setup();
  await ready(f);
  const lateNode = f.target.querySelector<HTMLElement>('[data-late]')!;
  f.requester('home').request({ to: '/detail' }, { motion: heroPlan([{ participant: 'late', side: 'outgoing', startMs: 0, durationMs: 600, easing: 'linear', opacity: { from: 1, to: 0 } }]) });
  await wait(() => f.diagnostics('frame').some(event => event.t > 40));
  // Established arbitration: a managed binding group owns the projection; choreography never takes it.
  expect(f.diagnostics('prepared')[0]!.skipped).toContain('late:managedGroup:displayedOnly');
  expect(hasChoreographyLease(lateNode)).toBe(false);
  const before = Number(getComputedStyle(lateNode).opacity);
  (f.target.querySelector('[data-start-late]') as HTMLButtonElement).click();
  await tick();
  let latest = before;
  const track = () => { if (lateNode.isConnected) latest = Number(getComputedStyle(lateNode).opacity); };
  for (let i = 0; i < 4; i++) { await frame(); track(); }
  // The engine's own playback moves the value (0.2 -> 1 over 4 s); choreography neither faded nor restored it.
  expect(latest).toBeGreaterThan(before);
  await wait(() => f.diagnostics('reveal').some(event => event.participant === 'late'));
  const copy = document.querySelector<HTMLElement>('[data-route-representation="late"]')!.firstElementChild as HTMLElement;
  expect(Number(copy.style.opacity)).toBeGreaterThanOrEqual(before);
  await settled(f);
  assertClean(f);
});

it('a shared control keeps its real control visibly painted before commit (no invisible controls)', async () => {
  const f = setup();
  await ready(f);
  const nav = f.target.querySelector<HTMLElement>('[data-nav]')!;
  const seen: number[] = [];
  let watching = true;
  const watch = () => { if (!watching) return; if (nav.isConnected) seen.push(Number(getComputedStyle(nav).opacity)); requestAnimationFrame(watch); };
  requestAnimationFrame(watch);
  f.requester('home').request({ to: '/detail' }, { motion: defineChoreography({ cueMs: 250, durationMs: 600, tracks: [{ participant: 'nav', side: 'shared', startMs: 0, durationMs: 600, path: [{ atMs: 250, pose: { relativeTo: 'source', dx: 40 } }] }] }) });
  await wait(() => f.diagnostics('prepared').length > 0);
  expect(document.querySelector('[data-route-representation="nav"]')).not.toBeNull();
  await settled(f);
  watching = false;
  expect(seen.length).toBeGreaterThan(3);
  for (const value of seen) expect(value).toBe(1);
  assertClean(f);
});

it('large cold participant through the public assembly and default budgets (staged 600 ms, visual 600 ms): prepared, revealed, committed, completed, no long task', async () => {
  big.rows = 500;
  try {
    const f = setup();
    await ready(f);
    const node = f.target.querySelector<HTMLElement>('[data-big]')!;
    expect(node.querySelectorAll('*').length + 1).toBeGreaterThanOrEqual(1500);
    let last = performance.now(), longest = 0, beating = true;
    const beat = () => { const now = performance.now(); longest = Math.max(longest, now - last); last = now; if (beating) setTimeout(beat, 0); };
    setTimeout(beat, 0);
    await new Promise(resolve => setTimeout(resolve, 50)); longest = 0; last = performance.now();
    f.requester('home').request({ to: '/detail' }, { motion: defineChoreography({ cueMs: 250, durationMs: 700, tracks: [{ participant: 'big', side: 'outgoing', startMs: 0, durationMs: 600, opacity: { from: 1, to: 0 } }] }) });
    await settled(f);
    beating = false;
    const preparation = f.diagnostics('preparation')[0]!;
    console.info(`[coverage] public-large-preparation: elements=${preparation.elements} workMs=${preparation.workMs} slices=${preparation.slices} outcome=${preparation.outcome} longestBlockMs=${longest.toFixed(1)} settled=${f.diagnostics('settled')[0]!.reason} recaptures=${f.diagnostics('recapture').length}`);
    expect(preparation.outcome).toBe('ready');
    expect(preparation.elements).toBeGreaterThanOrEqual(1500);
    expect(f.diagnostics('cue').length).toBe(1);
    expect(f.diagnostics('reveal').some(event => event.participant === 'big')).toBe(true);
    expect(f.diagnostics('recapture')).toEqual([]);
    expect(f.diagnostics('settled')[0]!.reason).toBe('completed');
    expect(f.target.querySelector('[data-page="detail"]')).not.toBeNull(); // the business commit happened
    expect(longest).toBeLessThan(150);
    assertClean(f);
  } finally { big.rows = 0; }
});
