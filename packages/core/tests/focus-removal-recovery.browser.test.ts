import { afterEach, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import FocusRemovalModal from './test-components/FocusRemovalModal.svelte';

const cleanup: (() => void | Promise<void>)[] = [];
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); await tick(); });

it('recovers within the same rendered modal after its focused confirmation subtree disappears', async () => {
  const target = document.createElement('div'); document.body.append(target);
  cleanup.push(() => target.remove());
  const app = mount(FocusRemovalModal, { target }); cleanup.push(() => unmount(app));
  await tick();
  const modal = document.querySelector<HTMLElement>('[data-focus-removal-modal]')!;
  const draft = modal.querySelector<HTMLInputElement>('input')!;
  const keep = modal.querySelector<HTMLButtonElement>('button')!;
  draft.value = 'Still editing'; draft.dispatchEvent(new Event('input', { bubbles: true }));
  keep.focus(); expect(document.activeElement).toBe(keep);
  keep.click(); await tick();
  expect(modal.isConnected).toBe(true);
  expect(modal.querySelector('[data-confirmation]')).toBeNull();
  expect(draft.value).toBe('Still editing');
  await expect.poll(() => modal.contains(document.activeElement), { timeout: 500 }).toBe(true);
  expect(document.activeElement).toBe(draft);
});

import { enrollLayer, requestNavigationFocus, rehomeAdoptedLayers, type DismissalIdentity } from '../src/lib/actions/dismissalCoordinator.js';
import { deepActive } from '../src/lib/actions/focusEligibility.js';
function region(html = '<input aria-label="Survivor"><div><button>Remove</button></div>') {
  const node = document.createElement('section'); node.innerHTML = html; document.body.append(node);
  cleanup.push(() => node.remove()); return node;
}
function enroll(node: HTMLElement, options: { modal?: boolean; autoFocus?: boolean; ancestry?: DismissalIdentity; contain?: boolean } = {}) {
  const handle = enrollLayer({ node, ancestry: options.ancestry,
    focus: { node, modal: options.modal ?? true, autoFocus: options.autoFocus, contain: options.contain } });
  cleanup.push(() => handle.release(false)); return handle;
}
async function settled() { await tick(); await Promise.resolve(); await tick(); }

it.each(['node', 'wrapper'] as const)('recovers after removing a focused %s without waiting for Tab', async kind => {
  const node = region(); enroll(node); await tick();
  const button = node.querySelector('button')!; button.focus();
  (kind === 'node' ? button : button.parentElement!).remove();
  await expect.poll(() => document.activeElement).toBe(node.querySelector('input'));
});
it('uses the existing boundary fallback when the removed subtree held the final candidate', async () => {
  const node = region('<div><button>Only</button></div>'); const handle = enroll(node); await tick();
  node.firstElementChild!.remove();
  await expect.poll(() => document.activeElement).toBe(node);
  expect(node.getAttribute('tabindex')).toBe('-1');
  node.setAttribute('tabindex', '0'); // An author update survives final teardown.
  handle.release(false); expect(node.getAttribute('tabindex')).toBe('0');
});
it.each(['synchronous', 'settled'] as const)('preserves %s explicit transfer to another surviving owned control', async timing => {
  const node = region('<input><button>Remove</button><textarea></textarea>'); enroll(node); await tick();
  node.querySelector('button')!.focus();
  const transfer = () => node.querySelector('textarea')!.focus();
  if (timing === 'settled') void tick().then(transfer);
  node.querySelector('button')!.remove();
  if (timing === 'synchronous') transfer();
  await settled(); expect(document.activeElement).toBe(node.querySelector('textarea'));
});
it('does not refocus for unrelated mutations, attribute changes, or deliberate blur without removal', async () => {
  const node = region(); enroll(node); await tick();
  const button = node.querySelector('button')!; button.focus();
  const focus = vi.spyOn(button, 'focus'); cleanup.push(() => { focus.mockRestore(); });
  node.append(document.createElement('p')); await settled(); expect(focus).not.toHaveBeenCalled();
  button.blur(); node.append(document.createElement('p')); await settled();
  expect(document.activeElement).toBe(document.body); expect(focus).not.toHaveBeenCalled();
  button.focus(); button.disabled = true; await settled();
  expect(document.activeElement).not.toBe(node.querySelector('input'));
});
it('does not transfer focus when a removed node is reinserted inside the same region before delivery', async () => {
  const node = region(); enroll(node); await tick(); const button = node.querySelector('button')!; button.focus();
  button.remove(); node.append(button); const before = deepActive(document);
  await settled(); expect(deepActive(document)).toBe(before);
  button.focus(); button.remove();
  await expect.poll(() => document.activeElement).toBe(node.querySelector('input'));
});
it('autoFocus false stays passive until actual focus, then recovers established containment', async () => {
  const outside = region('<button>Outside</button>').querySelector('button')!; outside.focus();
  const node = region(); enroll(node, { autoFocus: false }); await tick();
  expect(document.activeElement).toBe(outside);
  node.append(document.createElement('p')); await settled(); expect(document.activeElement).toBe(outside);
  node.querySelector('button')!.focus(); node.querySelector('button')!.remove();
  await expect.poll(() => document.activeElement).toBe(node.querySelector('input'));
});
it('a nested modal takeover cancels recovery of the former outer authority', async () => {
  const parent: DismissalIdentity = { parent: undefined }, outer = region(); enroll(outer, { ancestry: parent }); await tick();
  outer.querySelector('button')!.focus(); outer.querySelector('button')!.remove();
  const inner = region('<button>Nested</button>'); enroll(inner, { ancestry: { parent } });
  await settled(); expect(document.activeElement).toBe(inner.firstElementChild);
});
it('recovers removal of a linked passive portal without giving it independent trap authority', async () => {
  const parent: DismissalIdentity = { parent: undefined }, node = region(); enroll(node, { ancestry: parent }); await tick();
  const portal = region('<button>Portal</button>'); enroll(portal, { ancestry: { parent }, modal: false, contain: false, autoFocus: false }); await tick();
  portal.querySelector('button')!.focus(); portal.remove();
  await expect.poll(() => document.activeElement).toBe(node.querySelector('input'));
});
it('a standalone nonmodal does not recover document focus after removal', async () => {
  const node = region(); enroll(node, { modal: false }); await tick();
  node.querySelector('button')!.focus(); node.querySelector('button')!.remove(); await settled();
  expect(document.activeElement).toBe(document.body);
});
it.each(['descendant', 'host'] as const)('observes an open-shadow %s removal', async kind => {
  const node = region('<input><div></div>'), host = node.querySelector('div')!;
  const shadow = host.attachShadow({ mode: 'open' }); shadow.innerHTML = '<button>Shadow</button>';
  enroll(node); await tick(); const button = shadow.querySelector('button')!; button.focus(); expect(deepActive(document)).toBe(button);
  (kind === 'host' ? host : button).remove();
  await expect.poll(() => deepActive(document)).toBe(node.querySelector('input'));
});
it.each(['release', 'retire'] as const)('queued removal yields to %s and accepted navigation', async kind => {
  const page = region('<button>Page</button>').querySelector('button')!, node = region(); const handle = enroll(node); await tick();
  node.querySelector('button')!.focus(); node.querySelector('button')!.remove();
  await Promise.resolve(); // Deliver the mutation first, leaving its tick settlement pending.
  if (kind === 'release') handle.release(); else handle.setFocusActive(false);
  requestNavigationFocus(document, { live: () => true, target: () => page });
  await settled(); expect(document.activeElement).toBe(page);
});
it('identity replacement invalidates old recovery and settles the replacement DOM', async () => {
  const node = region(); let identity = 1;
  const handle = enrollLayer({ node, identity: () => identity, focus: { node, modal: true } }); cleanup.push(() => handle.release(false));
  await tick(); node.querySelector('button')!.focus(); node.innerHTML = '<textarea>Replacement</textarea>';
  await Promise.resolve(); // The old identity now has a queued removal settlement.
  identity++; handle.refresh(); await settled(); expect(document.activeElement).toBe(node.firstElementChild);
});
it('cross-document adoption cancels origin recovery and destination enrollment owns focus', async () => {
  const node = region(); enroll(node); await tick(); node.querySelector('button')!.focus(); node.querySelector('button')!.remove();
  await Promise.resolve(); // Origin recovery is queued before document adoption.
  const frame = document.createElement('iframe'); document.body.append(frame); cleanup.push(() => frame.remove());
  const other = frame.contentDocument!; other.body.append(node); rehomeAdoptedLayers(document);
  await settled(); expect(other.activeElement).toBe(node.querySelector('input'));
  expect(document.activeElement).toBe(frame);
});
it('a recovery focus handler retiring its owner cannot cause stale fallback', async () => {
  const page = region('<button>Page</button>').querySelector('button')!, node = region(); const handle = enroll(node); await tick();
  node.querySelector('button')!.focus();
  node.querySelector('input')!.addEventListener('focus', () => { handle.release(false); page.focus(); }, { once: true });
  node.querySelector('button')!.remove(); await settled(); expect(document.activeElement).toBe(page);
});
it('final release disconnects observation and remount has no recovery from retired nodes', async () => {
  const watching = new Set<MutationObserver>();
  const observe = MutationObserver.prototype.observe, disconnect = MutationObserver.prototype.disconnect;
  const observeSpy = vi.spyOn(MutationObserver.prototype, 'observe').mockImplementation(function (this: MutationObserver, node, options) {
    if (options?.childList && !options.subtree) watching.add(this);
    return observe.call(this, node, options);
  });
  const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect').mockImplementation(function (this: MutationObserver) {
    watching.delete(this); return disconnect.call(this);
  });
  cleanup.push(() => { observeSpy.mockRestore(); disconnectSpy.mockRestore(); });
  const node = region(); const handle = enroll(node); await tick(); expect(watching.size).toBe(1);
  node.querySelector('button')!.focus(); node.querySelector('button')!.remove();
  await Promise.resolve(); // Final release must cancel an already queued settlement.
  handle.release(false);
  expect(watching.size).toBe(0); await settled(); expect(document.activeElement).toBe(document.body);
  const current = region('<button>Current</button>'); const next = enroll(current); await tick(); expect(watching.size).toBe(1);
  node.replaceChildren(); await settled(); expect(document.activeElement).toBe(current.firstElementChild);
  next.release(false); expect(watching.size).toBe(0);
});

it('recovers when a focused node is moved outside its live modal region', async () => {
  const elsewhere = region(''), node = region(); enroll(node); await tick();
  const button = node.querySelector('button')!; button.focus(); elsewhere.append(button);
  expect(button.isConnected).toBe(true);
  await expect.poll(() => document.activeElement).toBe(node.querySelector('input'));
});
it('a recovery focus handler replacing identity yields to the new owner', async () => {
  const node = region(); let identity = 1;
  const handle = enrollLayer({ node, identity: () => identity, focus: { node, modal: true } });
  cleanup.push(() => handle.release(false)); await tick(); node.querySelector('button')!.focus();
  node.querySelector('input')!.addEventListener('focus', () => {
    identity++; node.innerHTML = '<textarea>New owner</textarea>'; handle.refresh();
  }, { once: true });
  node.querySelector('button')!.remove();
  await expect.poll(() => node.querySelector('textarea') !== null && document.activeElement === node.querySelector('textarea')).toBe(true);
});

it.each(['add', 'release'] as const)('same-authority passive layer %s preserves pending removal recovery', async change => {
  const parent: DismissalIdentity = { parent: undefined }, node = region();
  enroll(node, { ancestry: parent, autoFocus: false }); await tick();
  const portal = region('<button>Passive</button>');
  const options = { ancestry: { parent }, modal: false, contain: false, autoFocus: false };
  const handle = change === 'release' ? enroll(portal, options) : undefined;
  await tick(); node.querySelector('button')!.focus(); node.querySelector('button')!.remove();
  if (handle) handle.release(false); else enroll(portal, options);
  await expect.poll(() => document.activeElement).toBe(node.querySelector('input'));
});

it('preserves and re-arms an explicit transfer made inside a recovery focus handler', async () => {
  const node = region('<input><button>Remove</button><textarea></textarea>'); enroll(node); await tick();
  const input = node.querySelector('input')!, textarea = node.querySelector('textarea')!;
  node.querySelector('button')!.focus();
  input.addEventListener('focus', () => textarea.focus(), { once: true });
  node.querySelector('button')!.remove();
  await expect.poll(() => document.activeElement).toBe(textarea);
  textarea.remove();
  await expect.poll(() => document.activeElement).toBe(input);
});

it.each(['preferred', 'remembered'] as const)('retains a valid explicit transfer in the %s focus path and re-arms it', async path => {
  const parent: DismissalIdentity = { parent: undefined };
  const node = region('<input><button>Return</button><textarea></textarea>'); enroll(node, { ancestry: parent }); await tick();
  const button = node.querySelector('button')!, textarea = node.querySelector('textarea')!;
  button.focus();
  const inner = region('<button>Nested</button>');
  const handle = enroll(inner, { ancestry: { parent } }); await tick();
  button.addEventListener('focus', () => textarea.focus(), { once: true });
  handle.release(path === 'preferred');
  await expect.poll(() => document.activeElement).toBe(textarea);
  textarea.remove();
  await expect.poll(() => document.activeElement).toBe(node.querySelector('input'));
});
