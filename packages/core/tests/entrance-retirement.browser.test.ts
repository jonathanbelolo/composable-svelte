import {afterEach, expect, it, vi} from 'vitest';
import {mount, unmount, flushSync} from 'svelte';
import Fixture from './fixtures/DismissalLayers.svelte';

const releases: Array<() => Promise<void>> = [];
afterEach(async () => { for (const release of releases.splice(0).reverse()) await release(); });

it.each(['modal', 'sheet', 'drawer', 'alert', 'popover'] as const)(
  '%s settles a same-flush entrance retirement once without completing the entrance',
  async kind => {
    const target = document.createElement('div');
    document.body.append(target);
    const onDismissalComplete = vi.fn(), onPresentationComplete = vi.fn();
    const app = mount(Fixture, {target, props: {
      kind, requests: () => {}, initialStoreGated: true,
      onDismissalComplete, onPresentationComplete
    }});
    releases.push(async () => { await unmount(app); target.remove(); });
    app.phase('presenting'); app.open(); flushSync();
    expect(document.querySelector('[data-child]')).not.toBeNull();
    app.phase('dismissing'); app.clearChildState(); flushSync();
    expect(document.querySelector('[data-child]')).toBeNull();
    await vi.waitFor(() => expect(onDismissalComplete).toHaveBeenCalledTimes(1));
    expect(onPresentationComplete).not.toHaveBeenCalled();
    flushSync(); await Promise.resolve();
    expect(onDismissalComplete).toHaveBeenCalledTimes(1);
  }
);

it.each(['modal', 'sheet', 'drawer', 'alert', 'popover'] as const)(
  '%s settles a same-content transition from presented to dismissing when content disappears',
  async kind => {
    const target = document.createElement('div');
    document.body.append(target);
    const onDismissalComplete = vi.fn(), onPresentationComplete = vi.fn();
    const app = mount(Fixture, {target, props: {
      kind, requests: () => {}, initialStoreGated: true,
      onDismissalComplete, onPresentationComplete
    }});
    releases.push(async () => { await unmount(app); target.remove(); });
    app.phase('presented'); app.open(); flushSync();
    expect(document.querySelector('[data-child]')).not.toBeNull();
    app.phase('dismissing'); app.clearChildState(); flushSync();
    expect(document.querySelector('[data-child]')).toBeNull();
    await vi.waitFor(() => expect(onDismissalComplete).toHaveBeenCalledTimes(1));
    expect(onPresentationComplete).not.toHaveBeenCalled();
    flushSync(); await Promise.resolve();
    expect(onDismissalComplete).toHaveBeenCalledTimes(1);
  }
);
