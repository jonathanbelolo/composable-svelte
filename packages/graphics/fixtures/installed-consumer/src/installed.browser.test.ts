import { expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from './App.svelte';
import type { ApplicationInstance } from '@composable-svelte/core/application';
import type { State, Action } from './model.js';

const waitFor = async (predicate: () => boolean) => {
  const deadline = Date.now() + 10_000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Native graphics initialization timed out');
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
};

it('mounts the packed managed graphics recipe and native canvas', async () => {
  const target = document.createElement('div');
  target.style.width = '640px';
  target.style.height = '480px';
  document.body.append(target);
  let application: ApplicationInstance<State, Action> | undefined;
  const app = mount(App, { target, props: { onApp: value => { application = value; } } });
  try {
    flushSync();
    expect(target.querySelector('canvas')).not.toBeNull();
    await waitFor(() => application?.store.state.graphics?.renderer.isInitialized === true);
    application!.store.dispatch({ type: 'close' });
    expect(application!.store.state.graphics).toBeNull();
  } finally {
    await unmount(app);
    target.remove();
  }
});
