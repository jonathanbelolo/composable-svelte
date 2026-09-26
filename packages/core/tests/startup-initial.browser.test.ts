import { it, expect, vi } from 'vitest';
import { mount, hydrate, unmount, tick } from 'svelte';
import Host from './fixtures/StartupInitialHost.svelte';
import { createStartupModel } from './fixtures/StartupInitialModel.js';
import loadedHTML from './fixtures/startup-initial-loaded-ssr.html?raw';
import emptyHTML from './fixtures/startup-initial-empty-ssr.html?raw';

it.each([true, false])('hydrates loaded=%s markup before activation and only performs unsatisfied business load', async loaded => {
  const events: string[] = []; const model = createStartupModel(events, loaded);
  const container = document.createElement('div'); container.innerHTML = loaded ? loadedHTML : emptyHTML; document.body.append(container);
  const original = container.querySelector('[data-startup]');
  expect(events).toEqual(['plan']); expect(model.store.history).toEqual([]);
  const app = hydrate(Host, { target: container, props: { model } });
  expect(container.querySelector('[data-startup]')).toBe(original);
  await tick();
  expect(container.querySelector('[data-startup]')).toBe(original);
  expect(container.textContent).toContain(loaded ? 'server' : 'client');
  expect(events.filter(event => event === 'reduce:boot')).toHaveLength(1);
  expect(events.filter(event => event === 'subscribe')).toHaveLength(1);
  expect(events.filter(event => event === 'fetch')).toHaveLength(loaded ? 0 : 1);
  await unmount(app); expect(events).not.toContain('cleanup');
  const remount = mount(Host, { target: container, props: { model } }); await tick();
  expect(events.filter(event => event === 'subscribe')).toHaveLength(1);
  expect(events.filter(event => event === 'reduce:boot')).toHaveLength(1);
  await unmount(remount); model.store.destroy(); expect(events.filter(event => event === 'cleanup')).toHaveLength(1); container.remove();
});
it('actual host root startup retires initial child before its client resource starts', async () => {
  const events: string[] = []; const model = createStartupModel(events, false, true);
  const container = document.createElement('div'); document.body.append(container);
  const app = mount(Host, { target: container, props: { model } }); await tick();
  expect(events).toEqual(['plan', 'reduce:boot']); expect(container.textContent).toContain('none');
  await unmount(app); model.store.destroy(); container.remove();
});
it('failed child mount never activates and successful retry attempts startup once', async () => {
  const events: string[] = []; const model = createStartupModel(events);
  const container = document.createElement('div'); document.body.append(container);
  expect(() => mount(Host, { target: container, props: { model, fail: true } })).toThrow('startup child render failed');
  expect(events).toEqual(['plan']);
  const app = mount(Host, { target: container, props: { model } }); await tick();
  expect(events).toEqual(['plan', 'reduce:boot', 'subscribe']);
  await unmount(app); model.store.destroy(); container.remove();
});

it('one live host claim attaches its registry and activates only once', () => {
  const events: string[] = []; const model = createStartupModel(events); const claim = model.owner.claim();
  const attach = vi.spyOn(claim.registry, 'attach'); claim.attach(); claim.attach();
  expect(attach).toHaveBeenCalledOnce(); expect(events.filter(event => event === 'reduce:boot')).toHaveLength(1);
  claim.release(); model.store.destroy();
});
