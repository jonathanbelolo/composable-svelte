/**
 * Hydration: the server home markup (tests/fixtures/ssr-home.html, produced by reference.ssr.test.ts)
 * is adopted without mismatch, no business action or history entry is replayed, no choreography runs,
 * and the hydrated controls work.
 */
import '../src/styles.css';
import { expect, it } from 'vitest';
import { hydrate, unmount, tick, flushSync } from 'svelte';
import { userEvent } from 'vitest/browser';
import serverHTML from './fixtures/ssr-home.html?raw';
import App from '../src/App.svelte';
import { getApplicationInternal } from '../../../packages/core/dist/application/instance.svelte.js';
import { routeHostFor } from '../../../packages/core/dist/application/renderer/choreography/route-host.js';
import type { ApplicationInstance } from '@composable-svelte/core/application';
import type { AppAction, AppState } from '../src/model.js';
import { frame, waitFor, type HostView } from './support/observe.js';

it('home markup hydrates, adopts server nodes and replays nothing', async () => {
  const oldURL = location.href, oldState = history.state;
  history.replaceState(null, '', '/');
  const warnings: unknown[][] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); warn(...args); };
  const target = document.createElement('div');
  target.innerHTML = serverHTML;
  document.body.append(target);
  const serverHero = target.querySelector('[data-hero]');
  const serverCard = target.querySelector('[data-card="pavilion"]');
  const pushes: string[] = [];
  const push = History.prototype.pushState;
  history.pushState = (data, unused, url) => { pushes.push(String(url)); push.call(history, data, unused, url); };
  const trace: string[] = [];
  let app!: ApplicationInstance<AppState, AppAction>;
  const component = hydrate(App, { target, props: { url: '/', dependencies: { trace }, onApp: (value: ApplicationInstance<AppState, AppAction>) => { app = value; } } });
  try {
    flushSync(); await tick(); await frame(); await frame();
    expect(target.querySelector('[data-hero]')).toBe(serverHero);
    expect(target.querySelector('[data-card="pavilion"]')).toBe(serverCard);
    expect(warnings.filter(args => String(args[0]).includes('hydration'))).toEqual([]);
    const host = routeHostFor(getApplicationInternal(app).staged!) as unknown as HostView;
    expect(host.diagnostics).toEqual([]);
    expect(host.resources().running).toBe(false);
    expect(trace).toEqual([]);
    expect(pushes).toEqual([]);
    // Hydrated controls are live.
    await userEvent.click(target.querySelector<HTMLElement>('[data-applaud]')!);
    expect(target.querySelector('[data-applause]')!.textContent).toBe('43');
    await userEvent.click(target.querySelector<HTMLElement>('[data-open-dossier]')!);
    await waitFor(() => location.pathname === '/dossier' && !host.resources().running);
    expect(trace).toEqual(['home:applaud', 'navigate']);
    expect(pushes).toEqual(['/dossier']);
  } finally {
    console.warn = warn;
    delete (history as { pushState?: unknown }).pushState;
    await unmount(component);
    target.remove();
    history.replaceState(oldState, '', oldURL);
  }
});
