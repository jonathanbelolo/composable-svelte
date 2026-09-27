/**
 * WP2 browser witnesses: managed route outlet render identity, owned route boundary, declared
 * fallback with render-only retry, Host boundary escalation, stale identities and coalesced
 * notRendered, through the real public assembly. Each injected failure has a positive control
 * (its message reaches the fallback summary or the Host report).
 */
import { afterEach, expect, it, vi } from 'vitest';
import { mount, unmount, tick, flushSync } from 'svelte';
import { reactiveProps } from './slice-fixtures/props.svelte.js';
import RenderApp from './render-fixtures/RenderApp.svelte';
import { failures, viewEvents, type Root, type RootAction, type Page, type PageAction } from './render-fixtures/RenderModel.js';
import { getApplicationInternal } from '../../src/lib/application/instance.svelte.js';
import { routeHostFor } from '../../src/lib/application/renderer/choreography/route-host.js';
import { bindManagedProjection } from '../../src/lib/execution/store-access.js';
import { pageSlot } from './render-fixtures/RenderModel.js';
import type { ApplicationInstance, ChildView } from '../../src/lib/application/index.js';
import type { RenderOutcome } from '../../src/lib/application/renderer/route-render.js';
import { expectConsole } from '../helpers/console.js';
import { defineChoreography } from '../../src/lib/application/motion-public.js';

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const stop of cleanups.splice(0).reverse()) await stop();
  failures.conditional = false; failures.fallback = false; failures.shell = false;
  viewEvents.length = 0;
  vi.restoreAllMocks();
});
const settle = async () => { flushSync(); await tick(); await new Promise(resolve => setTimeout(resolve, 0)); flushSync(); await tick(); };

function setup(url = '/fragile', withFallback = true) {
  const oldURL = location.href, oldState = history.state;
  history.replaceState(null, '', url);
  const target = document.createElement('div');
  document.body.append(target);
  const trace: string[] = [], events: string[] = [];
  let app!: ApplicationInstance<Root, RootAction>;
  const props = reactiveProps({ url, dependencies: { trace, events }, onApp: (value: ApplicationInstance<Root, RootAction>) => { app = value; }, withFallback, hostVisible: true as boolean });
  const component = mount(RenderApp, { target, props });
  let destroyed = false;
  const destroy = async () => { if (destroyed) return; destroyed = true; await unmount(component); target.remove(); };
  cleanups.push(async () => { await destroy(); history.replaceState(oldState, '', oldURL); });
  const staged = () => getApplicationInternal(app).staged!;
  return {
    target, trace, events, props, destroy, get app() { return app; }, staged,
    host: () => routeHostFor(staged())!,
    outcomes: (): RenderOutcome[] => routeHostFor(staged())!.ledger.outcomes,
    page: () => bindManagedProjection(app.store, pageSlot) as ChildView<Page, PageAction> | undefined
  };
}
const types = (outcomes: readonly RenderOutcome[]) => outcomes.map(outcome => outcome.type);

it('render identity is (epoch, route owner, attempt); the outlet attaches while the route slot is empty', async () => {
  const f = setup('/empty');
  await settle();
  expect(f.target.querySelector('[data-page]')).toBeNull();
  // Attached even though empty: a staged request is admitted, not degraded as unmanagedRouteRender.
  const handle = f.staged().coordinator.request({ to: '/fragile' } as never, {});
  expect(handle.status).toMatchObject({ type: 'admitted' });
  await settle();
  expect(f.trace).toEqual(['go:/fragile']);
  const rendered = f.outcomes().find(outcome => outcome.type === 'rendered');
  if (rendered?.type !== 'rendered') throw new Error('no rendered checkpoint');
  expect(rendered.identity.epoch).toBe(f.staged().coordinator.epoch());
  expect(rendered.identity.epoch).not.toBeUndefined();
  expect(rendered.identity.owner).toBe(f.staged().routeOwner());
  expect(rendered.identity.attempt).toBe(1);
});

it('later conditional mount failure shows the declared fallback in place; business owner and placement survive', async () => {
  const f = setup();
  await settle();
  expect(viewEvents).toEqual(['panel:mount', 'page:mount:/fragile']);
  const owner = f.staged().routeOwner();
  failures.conditional = true;
  f.page()!.dispatch({ type: 'arm' });
  await settle();
  // Positive control: the injected failure is exactly what the fallback summarizes.
  expect(f.target.querySelector('[data-summary]')?.textContent).toBe('conditional mount failure');
  expect(f.target.querySelector('[data-attempt]')?.textContent).toBe('1');
  expect(f.target.querySelector('[data-page]')).toBeNull();
  const failed = f.outcomes().find(outcome => outcome.type === 'renderFailed');
  expect(failed).toMatchObject({ type: 'renderFailed', identity: { owner, attempt: 1 } });
  // Nested scope disposed with the failed subtree (unregistered, not a missing-placement root failure).
  expect(viewEvents).toContain('panel:unmount');
  // The page's business lifetime continues: same owner, still reducing.
  expect(f.staged().routeOwner()).toBe(owner);
  f.page()!.dispatch({ type: 'set', n: 2 });
  expect(f.app.store.state.page?.count).toBe(2);
  expect(f.trace).toEqual(['page:arm', 'page:set']);
  // Domain navigation away replaces the identity normally.
  f.app.store.dispatch({ type: 'go', url: '/next' });
  await settle();
  expect(f.target.querySelector('[data-fallback]')).toBeNull();
  expect(f.target.querySelector('[data-page="/next"]')).not.toBeNull();
});

it('later reactive update failure is caught by the route boundary and released', async () => {
  const f = setup();
  await settle();
  f.page()!.dispatch({ type: 'set', n: 13 });
  await settle();
  expect(f.target.querySelector('[data-summary]')?.textContent).toBe('reactive failure 13');
  expect(types(f.outcomes())).toContain('renderFailed');
  expect(f.app.store.state.page?.count).toBe(13);
});

it('render-only retry: next attempt, no domain action, no managed initialization repeat; view resources remount', async () => {
  const f = setup();
  await settle();
  await vi.waitFor(() => expect(f.events).toEqual(['init:/fragile']));
  failures.conditional = true;
  f.page()!.dispatch({ type: 'arm' });
  await settle();
  expect(f.target.querySelector('[data-attempt]')?.textContent).toBe('1');
  const traceBefore = f.trace.slice();
  const mounts = viewEvents.filter(event => event === 'page:mount:/fragile').length;
  // A repeated failure shows the fallback again under the next attempt.
  (f.target.querySelector('[data-retry]') as HTMLButtonElement).click();
  await settle();
  expect(f.target.querySelector('[data-attempt]')?.textContent).toBe('2');
  failures.conditional = false;
  (f.target.querySelector('[data-retry]') as HTMLButtonElement).click();
  await settle();
  expect(f.target.querySelector('[data-fallback]')).toBeNull();
  expect(f.target.querySelector('[data-bomb="conditional"]')).not.toBeNull();
  expect(f.trace).toEqual(traceBefore);
  expect(f.events).toEqual(['init:/fragile']);
  // The failing retry throws during subtree creation (before onMount); only the successful one remounts.
  expect(viewEvents.filter(event => event === 'page:mount:/fragile').length).toBe(mounts + 1);
  expect(viewEvents.filter(event => event === 'panel:mount').length).toBeGreaterThanOrEqual(2);
  const retries = f.outcomes().filter(outcome => outcome.type === 'retry');
  expect(retries.map(outcome => outcome.type === 'retry' && outcome.identity.attempt)).toEqual([2, 3]);
  const lastRendered = [...f.outcomes()].reverse().find(outcome => outcome.type === 'rendered');
  expect(lastRendered).toMatchObject({ identity: { attempt: 3, owner: f.staged().routeOwner() } });
});

it('a failure inside the declared fallback escalates once to the Host boundary', async () => {
  expectConsole('error');
  const report = vi.spyOn(console, 'error');
  const f = setup();
  await settle();
  const host = f.host();
  failures.conditional = true; failures.fallback = true;
  f.page()!.dispatch({ type: 'arm' });
  await settle();
  const hostReports = report.mock.calls.filter(call => String(call[0]).includes('Host render failure'));
  expect(hostReports).toHaveLength(1);
  expect(String((hostReports[0]![1] as Error).message)).toBe('fallback mount failure');
  expect(types(host.ledger.outcomes).filter(type => type === 'escalated')).toHaveLength(1);
  expect(types(host.ledger.outcomes)).toContain('renderFailed');
  expect(f.target.querySelector('[data-shell]')).toBeNull();
  expect(document.querySelector('[data-composable-route-plane]')).toBeNull();
  // Application torn down: the Host claim and history listener are released, business stopped.
  const before = f.trace.slice();
  history.replaceState(null, '', '/elsewhere');
  window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
  expect(f.trace).toEqual(before);
});

it('without a declared fallback a route failure escalates directly to the Host (once)', async () => {
  expectConsole('error');
  const report = vi.spyOn(console, 'error');
  const f = setup('/fragile', false);
  await settle();
  const host = f.host();
  const epoch = f.staged().coordinator.epoch();
  const owner = f.staged().routeOwner()!;
  failures.conditional = true;
  f.page()!.dispatch({ type: 'arm' });
  await settle();
  const hostReports = report.mock.calls.filter(call => String(call[0]).includes('Host render failure'));
  expect(hostReports).toHaveLength(1);
  expect(String((hostReports[0]![1] as Error).message)).toBe('conditional mount failure');
  // R4: the owned route boundary records the identity-specific failure first, then exactly one escalation.
  const observed = host.ledger.outcomes.filter(outcome => outcome.type === 'renderFailed' || outcome.type === 'escalated');
  expect(observed.map(outcome => outcome.type)).toEqual(['renderFailed', 'escalated']);
  expect(observed[0]).toMatchObject({ identity: { epoch, owner, attempt: 1 } });
  expect(String(((observed[0] as { error: Error }).error).message)).toBe('conditional mount failure');
  expect(Object.is((observed[0] as { error: unknown }).error, (observed[1] as { error: unknown }).error)).toBe(true);
  expect(f.target.querySelector('[data-fallback]')).toBeNull();
  expect(f.target.querySelector('[data-shell]')).toBeNull();
});

it('shell render failure releases Host resources and destroys the application exactly once', async () => {
  expectConsole('error');
  expectConsole('warn', 'any');
  const report = vi.spyOn(console, 'error');
  const f = setup();
  await settle();
  failures.shell = true;
  f.app.store.dispatch({ type: 'go', url: '/shell-bomb' });
  await settle();
  const hostReports = report.mock.calls.filter(call => String(call[0]).includes('Host render failure'));
  expect(hostReports).toHaveLength(1);
  expect(String((hostReports[0]![1] as Error).message)).toBe('shell mount failure');
  const trace = f.trace.slice();
  f.app.store.dispatch({ type: 'go', url: '/after' });
  expect(f.trace).toEqual(trace);
});

it('a stale identity failure is a diagnostic only and cannot fail the current attempt or the application', async () => {
  const f = setup();
  await settle();
  const first = f.host().ledger.identityOf(f.staged().routeOwner()!)!;
  failures.conditional = true;
  f.page()!.dispatch({ type: 'arm' });
  await settle();
  failures.conditional = false;
  (f.target.querySelector('[data-retry]') as HTMLButtonElement).click();
  await settle();
  expect(f.target.querySelector('[data-fallback]')).toBeNull();
  expect(f.host().failed(first, new Error('late stale failure'))).toBe(false);
  await settle();
  expect(types(f.outcomes())).toContain('staleRenderFailure');
  expect(f.target.querySelector('[data-fallback]')).toBeNull();
  expect(f.target.querySelector('[data-page="/fragile"]')).not.toBeNull();
  f.app.store.dispatch({ type: 'go', url: '/alive' });
  await settle();
  expect(f.target.querySelector('[data-page="/alive"]')).not.toBeNull();
});

it('coalesced turns record notRendered for a committed route owner that never rendered', async () => {
  const f = setup();
  await settle();
  f.app.store.dispatch({ type: 'go', url: '/a' });
  const skipped = f.staged().routeOwner();
  f.app.store.dispatch({ type: 'go', url: '/b' });
  await settle();
  expect(f.trace).toEqual(['go:/a', 'go:/b']);
  expect(f.outcomes()).toContainEqual({ type: 'notRendered', owner: skipped });
  expect(f.target.querySelector('[data-page="/b"]')).not.toBeNull();
  expect(viewEvents).not.toContain('page:mount:/a');
});

it('matrix witness: a later user $effect-body failure is NOT observed by Svelte 5.43.3 boundaries (unsupported)', async () => {
  const f = setup();
  await settle();
  f.page()!.dispatch({ type: 'set', n: 21 });
  // Measured behavior: the error propagates out of the flush; neither route nor Host boundary sees it.
  expect(() => flushSync()).toThrow('effect failure 21');
  await tick();
  expect(f.target.querySelector('[data-fallback]')).toBeNull();
  expect(types(f.outcomes())).not.toContain('renderFailed');
  expect(f.target.querySelector('[data-shell]')).not.toBeNull();
  expect(f.app.store.state.page?.count).toBe(21);
});

it('an initial render failure of a staged route instance shows the fallback without tearing down the root', async () => {
  failures.conditional = true;
  const f = setup('/boom-initial');
  await settle();
  expect(f.target.querySelector('[data-summary]')?.textContent).toBe('conditional mount failure');
  expect(f.target.querySelector('[data-shell]')).not.toBeNull();
  await vi.waitFor(() => expect(f.events).toEqual(['init:/boom-initial']));
  f.app.store.dispatch({ type: 'go', url: '/recovered' });
  await settle();
  expect(f.target.querySelector('[data-page="/recovered"]')).not.toBeNull();
});

it('a destination render failure during an active choreography settles it as failed and releases every decoration; the commit stands', async () => {
  const f = setup('/fragile');
  await settle();
  await new Promise(resolve => requestAnimationFrame(resolve));
  const events: unknown[] = [];
  f.staged().coordinator.subscribe(event => events.push(event));
  failures.conditional = true;
  const plan = defineChoreography({ cueMs: 100, durationMs: 400, tracks: [{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 400 }] });
  const handle = f.staged().coordinator.request({ to: '/boom-initial' } as never, {}, { motion: plan });
  expect(handle.status).toMatchObject({ type: 'admitted' });
  const source = f.target.querySelector<HTMLElement>('[data-hero]')!;
  await vi.waitFor(() => expect(document.querySelector('[data-composable-route-plane] [data-route-representation="hero"]')).not.toBeNull());
  expect(source.style.opacity).toBe('0');
  await vi.waitFor(() => expect(f.trace).toEqual(['go:/boom-initial']), { timeout: 2000 });
  await settle();
  // Domain commit and render failure are separate outcomes.
  expect(events.find(event => (event as { kind: string }).kind === 'terminal')).toMatchObject({ outcome: { type: 'committed', route: 'accepted', history: 'written' } });
  expect(f.target.querySelector('[data-summary]')?.textContent).toBe('conditional mount failure');
  expect(types(f.outcomes())).toContain('renderFailed');
  const settled = f.host().diagnostics.find(event => event.type === 'settled');
  expect(settled).toMatchObject({ reason: 'failed' });
  expect(document.querySelector('[data-composable-route-plane]')).toBeNull();
});

it('an initially populated route mounts before attachment; its identity, outcomes and retry reconcile to the attached epoch, and reattachment gets the new epoch', async () => {
  const f = setup('/fragile');
  await settle();
  const epoch = f.staged().coordinator.epoch();
  expect(epoch).not.toBeUndefined();
  const owner = f.staged().routeOwner()!;
  const first = f.host();
  expect(first.ledger.identityOf(owner)).toEqual({ epoch, owner, attempt: 1 });
  const rendered = first.ledger.outcomes.find(outcome => outcome.type === 'rendered');
  expect(rendered).toMatchObject({ identity: { epoch, owner, attempt: 1 } });
  // A failure and retry of the initial page use the attached epoch too (the held pre-attach identity resolves).
  failures.conditional = true;
  f.page()!.dispatch({ type: 'arm' });
  await settle();
  expect(first.ledger.outcomes.find(outcome => outcome.type === 'renderFailed')).toMatchObject({ identity: { epoch, owner, attempt: 1 } });
  failures.conditional = false;
  (f.target.querySelector('[data-retry]') as HTMLButtonElement).click();
  await settle();
  expect(first.ledger.identityOf(owner)).toEqual({ epoch, owner, attempt: 2 });
  // Host-only detach and reattach: a new route layer and a new epoch; the retained page remounts.
  f.props.hostVisible = false;
  await settle();
  expect(f.staged().coordinator.epoch()).toBeUndefined();
  f.props.hostVisible = true;
  await settle();
  const second = f.host();
  expect(second).not.toBe(first);
  const reattached = f.staged().coordinator.epoch();
  expect(reattached).not.toBeUndefined();
  expect(reattached).not.toBe(epoch);
  expect(second.ledger.identityOf(owner)).toEqual({ epoch: reattached, owner, attempt: 1 });
  expect(second.ledger.outcomes.find(outcome => outcome.type === 'rendered')).toMatchObject({ identity: { epoch: reattached, owner, attempt: 1 } });
});

it('without a fallback, a destination failure during choreography settles it as failed (route lifecycle) before the single Host escalation', async () => {
  expectConsole('error');
  const report = vi.spyOn(console, 'error');
  const f = setup('/fragile', false);
  await settle();
  await new Promise(resolve => requestAnimationFrame(resolve));
  const host = f.host();
  failures.conditional = true;
  const plan = defineChoreography({ cueMs: 100, durationMs: 400, tracks: [{ participant: 'hero', side: 'shared', startMs: 0, durationMs: 400 }] });
  expect(f.staged().coordinator.request({ to: '/boom-initial' } as never, {}, { motion: plan }).status).toMatchObject({ type: 'admitted' });
  await vi.waitFor(() => expect(document.querySelector('[data-composable-route-plane] [data-route-representation="hero"]')).not.toBeNull());
  await vi.waitFor(() => expect(f.trace).toEqual(['go:/boom-initial']), { timeout: 2000 });
  await settle();
  const settled = host.diagnostics.filter(event => event.type === 'settled');
  expect(settled.map(event => event.type === 'settled' && event.reason)).toEqual(['failed']);
  expect(host.ledger.outcomes.filter(outcome => outcome.type === 'renderFailed' || outcome.type === 'escalated').map(outcome => outcome.type)).toEqual(['renderFailed', 'escalated']);
  expect(report.mock.calls.filter(call => String(call[0]).includes('Host render failure'))).toHaveLength(1);
  expect(document.querySelector('[data-composable-route-plane]')).toBeNull();
});
