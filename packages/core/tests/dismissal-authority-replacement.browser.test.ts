import { afterEach, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import {
  enrollLayer,
  rehomeAdoptedLayers,
  type DismissalIdentity,
  type LayerHandle
} from '../src/lib/actions/dismissalCoordinator.js';

const cleanup: Array<() => void> = [];

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
  await tick();
});

function region(html = '<button>First</button>') {
  const node = document.createElement('section');
  node.innerHTML = html;
  document.body.append(node);
  cleanup.push(() => node.remove());
  return node;
}

function escape(doc = document) {
  doc.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}

function pointer(target: EventTarget = document.body) {
  target.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true, cancelable: true }));
}

it('replacement preserves the original opener and reacquires focus when retained content changes', async () => {
  const opener = region('<button>Open</button>').firstElementChild as HTMLButtonElement;
  opener.focus();
  const node = region('<button data-old>Old</button>');
  const oldEscape = vi.fn();
  const nextEscape = vi.fn();
  const oldIdentity = {};
  const nextIdentity = {};
  const handle = enrollLayer({
    node,
    identity: () => oldIdentity,
    onEscape: oldEscape,
    focus: { node, modal: true }
  });
  cleanup.push(() => handle.release(false));
  await expect.poll(() => document.activeElement).toBe(node.querySelector('[data-old]'));

  node.innerHTML = '<button data-next>Next</button>';
  handle.replaceDismissal({ identity: () => nextIdentity, onEscape: nextEscape });
  await expect.poll(() => document.activeElement).toBe(node.querySelector('[data-next]'));

  escape();
  expect(oldEscape).not.toHaveBeenCalled();
  expect(nextEscape).toHaveBeenCalledTimes(1);
  handle.release();
  await expect.poll(() => document.activeElement).toBe(opener);
});

it('replacement drops an armed old pointer gesture and routes a fresh gesture to the new callback', async () => {
  const node = region();
  const oldPointer = vi.fn();
  const nextPointer = vi.fn();
  const handle = enrollLayer({ node, identity: () => 1, onPointerOutside: oldPointer });
  cleanup.push(() => handle.release(false));

  pointer();
  // Callback replacement invalidates the gesture even when logical identity is stable.
  handle.replaceDismissal({ identity: () => 1, onPointerOutside: nextPointer });
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(oldPointer).not.toHaveBeenCalled();
  expect(nextPointer).not.toHaveBeenCalled();

  pointer();
  await vi.waitFor(() => expect(nextPointer).toHaveBeenCalledTimes(1));
  expect(oldPointer).not.toHaveBeenCalled();
});

it('an inner reentrant replacement wins and a throwing getter leaves old authority intact', () => {
  const node = region();
  const oldEscape = vi.fn();
  const innerEscape = vi.fn();
  const handle = enrollLayer({ node, identity: () => 1, onEscape: oldEscape });
  cleanup.push(() => handle.release(false));

  handle.replaceDismissal({
    identity: () => {
      handle.replaceDismissal({ identity: () => 3, onEscape: innerEscape });
      return 2;
    },
    onEscape: vi.fn()
  });
  escape();
  expect(innerEscape).toHaveBeenCalledTimes(1);
  expect(oldEscape).not.toHaveBeenCalled();

  const failure = new Error('replacement identity failed');
  const report = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  handle.replaceDismissal({ identity: () => { throw failure; }, onEscape: vi.fn() });
  escape();
  expect(innerEscape).toHaveBeenCalledTimes(2);
  expect(report).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:', failure);
});

it('release from a replacement getter wins and later replacement calls are no-ops', () => {
  const node = region();
  const oldEscape = vi.fn();
  const staleEscape = vi.fn();
  const handle = enrollLayer({ node, identity: () => 1, onEscape: oldEscape });
  cleanup.push(() => handle.release(false));
  handle.replaceDismissal({
    identity: () => {
      handle.release(false);
      return 2;
    },
    onEscape: staleEscape
  });
  handle.replaceDismissal({ identity: () => 3, onEscape: staleEscape });
  escape();
  expect(handle.live).toBe(false);
  expect(oldEscape).not.toHaveBeenCalled();
  expect(staleEscape).not.toHaveBeenCalled();
});

it('adoption during the replacement getter wins without an origin-coordinator write', () => {
  const iframe = document.createElement('iframe');
  document.body.append(iframe);
  cleanup.push(() => iframe.remove());
  const destination = iframe.contentDocument!;
  const node = region();
  const oldEscape = vi.fn();
  const staleEscape = vi.fn();
  const handle = enrollLayer({ node, identity: () => 1, onEscape: oldEscape });
  cleanup.push(() => handle.release(false));

  handle.replaceDismissal({
    identity: () => {
      destination.body.append(node);
      rehomeAdoptedLayers(document);
      return 2;
    },
    onEscape: staleEscape
  });
  escape(destination);
  expect(handle.live).toBe(true);
  expect(oldEscape).toHaveBeenCalledTimes(1);
  expect(staleEscape).not.toHaveBeenCalled();
});

it('replacement preserves layer order and ancestry selection', () => {
  const parentNode = region();
  const childNode = region();
  const unrelatedNode = region();
  const parentToken: DismissalIdentity = { parent: undefined };
  const childToken: DismissalIdentity = { parent: parentToken };
  const parentEscape = vi.fn();
  const oldChildEscape = vi.fn();
  const nextChildEscape = vi.fn();
  const unrelatedEscape = vi.fn();
  const parent = enrollLayer({ node: parentNode, priority: 1, ancestry: parentToken, onEscape: parentEscape });
  const child = enrollLayer({ node: childNode, priority: 1, ancestry: childToken, identity: () => 1, onEscape: oldChildEscape });
  const unrelated = enrollLayer({ node: unrelatedNode, priority: 0, onEscape: unrelatedEscape });
  cleanup.push(() => parent.release(false), () => child.release(false), () => unrelated.release(false));

  child.replaceDismissal({ identity: () => 2, onEscape: nextChildEscape });
  escape();
  expect(nextChildEscape).toHaveBeenCalledTimes(1);
  expect(oldChildEscape).not.toHaveBeenCalled();
  expect(parentEscape).not.toHaveBeenCalled();
  expect(unrelatedEscape).not.toHaveBeenCalled();
});
