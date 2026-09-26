import { afterEach, it, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Fixture from './fixtures/SidebarEscapeAuthority.svelte';
import type { PresentationState } from '../src/lib/navigation/types.js';

const releases: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const release of releases.splice(0).reverse()) await release();
});

function fireEscape() {
  const event = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true
  });
  document.dispatchEvent(event);
  flushSync();
  return event;
}

function setup(props: {
  initialDisabled?: boolean;
  initialSidebar?: boolean;
  initialStack?: boolean;
  initialReverse?: boolean;
  initialHasStore?: boolean;
  initialPresentation?: PresentationState<string> | undefined;
} = {}) {
  const target = document.createElement('div');
  document.body.append(target);
  const requests = vi.fn();
  const windowEscapeHandler = vi.fn();

  const onWindowKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      windowEscapeHandler();
    }
  };
  window.addEventListener('keydown', onWindowKeyDown);

  const app = mount(Fixture, {
    target,
    props: {
      requests,
      ...props
    }
  });
  flushSync();

  releases.push(async () => {
    window.removeEventListener('keydown', onWindowKeyDown);
    await unmount(app);
    target.remove();
  });

  return { app, requests, windowEscapeHandler };
}

it('enabled sidebar handles Escape once and consumes event before window', () => {
  const { requests, windowEscapeHandler } = setup({
    initialSidebar: true,
    initialDisabled: false
  });

  const event = fireEscape();

  expect(requests.mock.calls).toEqual([['sidebar']]);
  expect(windowEscapeHandler).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(true);
});

it('disabled sidebar allows consumer window Escape handler', () => {
  const { app, requests, windowEscapeHandler } = setup({
    initialSidebar: true,
    initialDisabled: true
  });

  const event = fireEscape();

  expect(requests).not.toHaveBeenCalled();
  expect(windowEscapeHandler).toHaveBeenCalledTimes(1);
  expect(event.defaultPrevented).toBe(false);

  app.setDisabled(false);
  flushSync();

  fireEscape();
  expect(requests.mock.calls).toEqual([['sidebar']]);
  expect(windowEscapeHandler).toHaveBeenCalledTimes(1);
});

it('disabled sidebar allows NavigationStack when sidebar is enrolled first', () => {
  const { requests, windowEscapeHandler } = setup({
    initialSidebar: true,
    initialStack: true,
    initialReverse: false,
    initialDisabled: true
  });

  fireEscape();

  expect(requests.mock.calls).toEqual([['stack']]);
  expect(windowEscapeHandler).not.toHaveBeenCalled();
});

it('disabled sidebar allows NavigationStack when sidebar is enrolled last', () => {
  const { requests, windowEscapeHandler } = setup({
    initialSidebar: true,
    initialStack: true,
    initialReverse: true,
    initialDisabled: true
  });

  fireEscape();

  expect(requests.mock.calls).toEqual([['stack']]);
  expect(windowEscapeHandler).not.toHaveBeenCalled();
});

it('absent store does not participate in dismissal and allows window handler', () => {
  const { app, requests, windowEscapeHandler } = setup({
    initialSidebar: true,
    initialHasStore: false
  });

  fireEscape();

  expect(requests).not.toHaveBeenCalled();
  expect(windowEscapeHandler).toHaveBeenCalledTimes(1);

  app.setHasStore(true);
  flushSync();

  fireEscape();
  expect(requests.mock.calls).toEqual([['sidebar']]);
  expect(windowEscapeHandler).toHaveBeenCalledTimes(1);
});

// Entrance intent is accepted immediately; retained exit shells stay inert.
it.each(['presenting', 'presented'] as const)('sidebar in %s phase consumes Escape', (status) => {
  const { requests, windowEscapeHandler } = setup({
    initialSidebar: true,
    initialPresentation: { status, content: 'item' }
  });

  const event = fireEscape();
  expect(requests.mock.calls).toEqual([['sidebar']]);
  expect(windowEscapeHandler).not.toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(true);
});

it.each(['dismissing', 'idle'] as const)('sidebar in %s phase does not consume Escape', (status) => {
  const { requests, windowEscapeHandler } = setup({
    initialSidebar: true,
    initialPresentation: status === 'idle' ? { status } : { status, content: 'item' }
  });

  const event = fireEscape();
  expect(requests).not.toHaveBeenCalled();
  expect(windowEscapeHandler).toHaveBeenCalledTimes(1);
  expect(event.defaultPrevented).toBe(false);
});

it('sidebar updates Escape authority when the same view exits and reenters', () => {
  const { app, requests, windowEscapeHandler } = setup({
    initialSidebar: true,
    initialPresentation: { status: 'presenting', content: 'item' }
  });

  const entering = fireEscape();
  expect(requests.mock.calls).toEqual([['sidebar']]);
  expect(windowEscapeHandler).not.toHaveBeenCalled();
  expect(entering.defaultPrevented).toBe(true);
  requests.mockClear();

  app.setPresentation({ status: 'dismissing', content: 'item' });
  flushSync();
  const exiting = fireEscape();
  expect(requests).not.toHaveBeenCalled();
  expect(windowEscapeHandler).toHaveBeenCalledTimes(1);
  expect(exiting.defaultPrevented).toBe(false);

  app.setPresentation({ status: 'presenting', content: 'item' });
  flushSync();
  const reentering = fireEscape();
  expect(requests.mock.calls).toEqual([['sidebar']]);
  expect(windowEscapeHandler).toHaveBeenCalledTimes(1);
  expect(reentering.defaultPrevented).toBe(true);
});

it('sidebar retained exit with null store does not consume Escape', () => {
  const { requests, windowEscapeHandler } = setup({
    initialSidebar: true,
    initialHasStore: false,
    initialPresentation: { status: 'presented', content: 'retained-item' }
  });

  fireEscape();

  expect(requests).not.toHaveBeenCalled();
  expect(windowEscapeHandler).toHaveBeenCalledTimes(1);
});
