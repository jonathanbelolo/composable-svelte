import { expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from './App.svelte';
import type { ApplicationInstance } from '@composable-svelte/core/application';
import type { State, Action } from './model.js';

it('mounts the packed managed map recipe and all public controls', async () => {
  const target = document.createElement('div');
  target.style.width = '640px';
  target.style.height = '360px';
  document.body.append(target);
  let application: ApplicationInstance<State, Action> | undefined;
  const app = mount(App, { target, props: { onApp: value => { application = value; } } });
  try {
    flushSync();
    expect(application).toBeDefined();
    expect(target.querySelector('canvas')).not.toBeNull();
    expect(target.querySelector('select')).not.toBeNull();
    expect(application!.store.state.map?.layers.map(layer => layer.id)).toEqual(['geo', 'heat']);
    application!.store.dispatch({ type: 'close' });
    expect(application!.store.state.map).toBeNull();
    flushSync();
    expect(target.querySelector('canvas')).toBeNull();
  } finally {
    await unmount(app);
    target.remove();
  }
});
