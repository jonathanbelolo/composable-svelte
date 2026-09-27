/**
 * Test-only observation of framework state. These are the framework's internal diagnostic accessors,
 * imported from the same built package modules the app resolves; the app itself never imports them.
 */
import { mount, unmount, tick } from 'svelte';
import { getApplicationInternal } from '../../../../packages/core/dist/application/instance.svelte.js';
import { routeHostFor } from '../../../../packages/core/dist/application/renderer/choreography/route-host.js';
import type { ApplicationInstance } from '@composable-svelte/core/application';
import type { ProtocolEvent } from '../../../../packages/core/dist/routing/staged/types.js';
import App from '../../src/App.svelte';
import type { AppAction, AppState } from '../../src/model.js';

export const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
export const settle = async () => { await tick(); await frame(); await frame(); };
export async function waitFor(predicate: () => boolean, timeout = 4000): Promise<void> {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeout) throw new Error('timed out');
    await frame();
  }
}

export interface Diagnostic { readonly type: string; readonly transaction: number; readonly [field: string]: unknown }
export interface HostView {
  readonly diagnostics: Diagnostic[];
  resources(): { frames: number; timers: number; observers: number; leases: number; plane: boolean; representations: number; running: boolean };
  /** Engine-owned: observers, live representation handles (providers, retained renderers), media mirrors/players. */
  visualResources?(): { observers: number; handles: number; media: number };
}

export function launch(url = '/') {
  const oldURL = location.href;
  const oldState = history.state;
  history.replaceState(null, '', url);
  const target = document.createElement('div');
  document.body.append(target);
  const trace: string[] = [];
  const sceneTrace: string[] = [];
  const writes: string[] = [];
  // Unbound originals, restored exactly (own-property overrides removed), so fixtures never stack wrappers.
  const push = History.prototype.pushState, replace = History.prototype.replaceState;
  history.pushState = (data, unused, next) => { writes.push(`push:${String(next)}`); push.call(history, data, unused, next); };
  history.replaceState = (data, unused, next) => { writes.push(`replace:${String(next)}`); replace.call(history, data, unused, next); };
  let app!: ApplicationInstance<AppState, AppAction>;
  const component = mount(App, { target, props: { url, dependencies: { trace, sceneTrace }, onApp: (value: ApplicationInstance<AppState, AppAction>) => { app = value; } } });
  // Exact protocol transcript (request results, admissions, terminal outcomes), subscribed before any control is used.
  const protocol: ProtocolEvent[] = [];
  const stopProtocol = getApplicationInternal(app).staged!.coordinator.subscribe(event => { protocol.push(event); });
  let destroyed = false;
  const host = (): HostView => routeHostFor(getApplicationInternal(app).staged!) as unknown as HostView;
  return {
    target, trace, sceneTrace, writes, protocol,
    get app() { return app; },
    host,
    diagnostics: (type: string) => host().diagnostics.filter(event => event.type === type),
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      stopProtocol();
      await unmount(component);
      target.remove();
    },
    async restore() {
      await this.destroy();
      delete (history as { pushState?: unknown }).pushState;
      delete (history as { replaceState?: unknown }).replaceState;
      replace.call(history, oldState, '', oldURL);
    }
  };
}
export type Launched = ReturnType<typeof launch>;
