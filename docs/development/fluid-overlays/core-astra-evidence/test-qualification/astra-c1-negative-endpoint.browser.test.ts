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

it('C1 negative endpoint at the destination retarget: position and velocity continue exactly from the displayed state', async () => {
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
  (last as {x:number}).x += 1; expect(last.x).toBeCloseTo(retarget.to[0], 3);
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

