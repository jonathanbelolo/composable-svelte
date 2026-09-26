import { afterEach, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import {
  enrollLayer,
  requestNavigationFocus,
  rehomeAdoptedLayers
} from '../src/lib/actions/dismissalCoordinator.js';

const cleanup: (() => void)[] = [];
afterEach(async () => {
  for (const release of cleanup.splice(0).reverse()) release();
  vi.useRealTimers();
  await tick();
});

function region(html = '<button>First</button><button>Last</button>') {
  const node = document.createElement('section');
  node.innerHTML = html;
  document.body.append(node);
  cleanup.push(() => node.remove());
  return node;
}

function button(label: string) {
  const btn = document.createElement('button');
  btn.textContent = label;
  document.body.append(btn);
  cleanup.push(() => btn.remove());
  return btn;
}

const coordinatorTypes = ['pointerdown', 'keydown', 'focusin'];
function watch(doc: Document) {
  const add = vi.spyOn(doc, 'addEventListener');
  const remove = vi.spyOn(doc, 'removeEventListener');
  cleanup.push(() => {
    add.mockRestore();
    remove.mockRestore();
  });
  return {
    added: () => add.mock.calls.map(call => call[0]).filter(t => coordinatorTypes.includes(String(t))),
    removed: () => remove.mock.calls.map(call => call[0]).filter(t => coordinatorTypes.includes(String(t)))
  };
}

async function iframeDocument() {
  const frame = document.createElement('iframe');
  frame.srcdoc = '<!doctype html><html><body></body></html>';
  const loaded = new Promise<void>(resolve => frame.addEventListener('load', () => resolve(), { once: true }));
  document.body.append(frame);
  cleanup.push(() => frame.remove());
  await loaded;
  return frame.contentDocument!;
}

it('N-14 positive control: accepted navigation target resolution without focus-less churn focuses the primary target', async () => {
  const page = button('Page');
  requestNavigationFocus(document, { live: () => true, target: () => page });
  await tick();
  expect(document.activeElement).toBe(page);
});

it('N-14 broader disposal: enrolling and releasing the final focus-less layer during navigation target resolution does not dispose coordinator or erase accepted target', async () => {
  const page = button('Page');
  const temp = region('');
  let enrolledDuringResolution = false;
  requestNavigationFocus(document, {
    live: () => true,
    target: () => {
      const handle = enrollLayer({ node: temp });
      enrolledDuringResolution = true;
      handle.release(false);
      return page;
    }
  });
  await tick();
  expect(enrolledDuringResolution).toBe(true);
  expect(document.activeElement).toBe(page);
});

it('N-14 positive control: newer reentrant navigation queued during target resolution wins without focus-less churn', async () => {
  const stale = button('Stale page');
  const newer = button('Newer page');
  let route = 1;
  requestNavigationFocus(document, {
    live: () => route === 1,
    target: () => {
      route = 2;
      requestNavigationFocus(document, { live: () => route === 2, target: () => newer });
      return stale;
    }
  });
  await tick();
  await tick();
  expect(document.activeElement).toBe(newer);
});

it('N-14 broader disposal: newer reentrant navigation queued during target resolution with focus-less layer churn wins and is not erased', async () => {
  const stale = button('Stale page');
  const newer = button('Newer page');
  const temp = region('');
  let route = 1;
  requestNavigationFocus(document, {
    live: () => route === 1,
    target: () => {
      route = 2;
      requestNavigationFocus(document, { live: () => route === 2, target: () => newer });
      const handle = enrollLayer({ node: temp });
      handle.release(false);
      return stale;
    }
  });
  await tick();
  await tick();
  expect(document.activeElement).toBe(newer);
});

it('DF-15 unrelated scope: framework-owned temporary tabindex=-1 on unrelated empty boundary survives background focus; strict descendant focus retires only its own closure', async () => {
  const boundaryA = region('');
  const boundaryB = region('');
  const bgButton = button('Background');

  const handleA = enrollLayer({ node: boundaryA, focus: { node: boundaryA, modal: false } });
  cleanup.push(() => handleA.release(false));
  await tick();
  const handleB = enrollLayer({ node: boundaryB, focus: { node: boundaryB, modal: false } });
  cleanup.push(() => handleB.release(false));
  await tick();

  expect(boundaryA.getAttribute('tabindex')).toBe('-1');
  expect(boundaryB.getAttribute('tabindex')).toBe('-1');

  bgButton.focus();
  expect(document.activeElement).toBe(bgButton);
  expect(boundaryA.getAttribute('tabindex')).toBe('-1');
  expect(boundaryB.getAttribute('tabindex')).toBe('-1');

  const descendantA = document.createElement('button');
  descendantA.textContent = 'Descendant A';
  boundaryA.append(descendantA);
  descendantA.focus();
  expect(document.activeElement).toBe(descendantA);

  expect(boundaryA.hasAttribute('tabindex')).toBe(false);
  expect(boundaryB.getAttribute('tabindex')).toBe('-1');
});

it('DF-15 control: background button focus outside empty boundary leaves framework-owned tabindex intact across ticks', async () => {
  const boundary = region('');
  const outside = button('Outside');
  const handle = enrollLayer({ node: boundary, focus: { node: boundary, modal: false } });
  cleanup.push(() => handle.release(false));
  await tick();

  expect(boundary.getAttribute('tabindex')).toBe('-1');
  outside.focus();
  await tick();
  expect(document.activeElement).toBe(outside);
  expect(boundary.getAttribute('tabindex')).toBe('-1');
});

it('DF-15 restore path: armed restore target inside owned boundary retires framework-owned tabindex once and later author write survives', async () => {
  const boundary = region('');
  const handle = enrollLayer({ node: boundary, focus: { node: boundary, modal: false } });
  cleanup.push(() => handle.release(false));
  await tick();
  expect(boundary.getAttribute('tabindex')).toBe('-1');

  const restoreTarget = document.createElement('button');
  restoreTarget.textContent = 'Restore trigger';
  boundary.append(restoreTarget);

  const modalNode = region('<button>Modal action</button>');
  const modalHandle = enrollLayer({
    node: modalNode,
    focus: { node: modalNode, modal: true, returnFocus: () => restoreTarget }
  });
  cleanup.push(() => modalHandle.release(false));
  await tick();
  expect(document.activeElement).toBe(modalNode.firstElementChild);

  modalHandle.release();
  await tick();
  await tick();
  expect(document.activeElement).toBe(restoreTarget);
  expect(boundary.hasAttribute('tabindex')).toBe(false);

  boundary.setAttribute('tabindex', '0');
  handle.release(false);
  await tick();

  expect(document.activeElement).toBe(restoreTarget);
  expect(boundary.getAttribute('tabindex')).toBe('0');
});

it('DF-15 control: restore target inside owned boundary retires framework-owned tabindex completely when no author write occurs', async () => {
  const boundary = region('');
  const handle = enrollLayer({ node: boundary, focus: { node: boundary, modal: false } });
  cleanup.push(() => handle.release(false));
  await tick();
  expect(boundary.getAttribute('tabindex')).toBe('-1');

  const restoreTarget = document.createElement('button');
  boundary.append(restoreTarget);

  const modalNode = region('<button>Modal action</button>');
  const modalHandle = enrollLayer({
    node: modalNode,
    focus: { node: modalNode, modal: true, returnFocus: () => restoreTarget }
  });
  cleanup.push(() => modalHandle.release(false));
  await tick();

  modalHandle.release();
  await tick();
  await tick();
  expect(document.activeElement).toBe(restoreTarget);
  expect(boundary.hasAttribute('tabindex')).toBe(false);

  handle.release(false);
  await tick();
  expect(boundary.hasAttribute('tabindex')).toBe(false);
});

it('DF-15 stale restore epoch inside surviving owner degrades to owner containment', async () => {
  const boundary = region('');
  const handle = enrollLayer({ node: boundary, focus: { node: boundary, modal: false } });
  cleanup.push(() => handle.release(false));
  await tick();

  const restoreTarget = document.createElement('button');
  boundary.append(restoreTarget);
  const modalNode = region('<button>Modal action</button>');
  const modalHandle = enrollLayer({
    node: modalNode,
    focus: { node: modalNode, modal: true, returnFocus: () => restoreTarget }
  });
  cleanup.push(() => modalHandle.release(false));
  await tick();

  modalHandle.release();
  // Invalidate the armed return intent before its already-queued focus flush.
  // A temporary focus-active layer increments the focus epoch on both enrollment and retirement.
  const transientNode = region('<button>Transient</button>');
  const transient = enrollLayer({ node: transientNode, focus: { node: transientNode, modal: false } });
  transient.release(false);
  await tick();
  await tick();

  expect(document.activeElement).toBe(boundary);
  expect(document.activeElement).not.toBe(restoreTarget);
  expect(boundary.getAttribute('tabindex')).toBe('-1');
});

it('DF-15 restore target outside surviving owner is ignored in favor of owner containment', async () => {
  const boundary = region('');
  const handle = enrollLayer({ node: boundary, focus: { node: boundary, modal: false } });
  cleanup.push(() => handle.release(false));
  await tick();

  const outside = button('Outside restore target');
  const modalNode = region('<button>Modal action</button>');
  const modalHandle = enrollLayer({
    node: modalNode,
    focus: { node: modalNode, modal: true, returnFocus: () => outside }
  });
  cleanup.push(() => modalHandle.release(false));
  await tick();

  modalHandle.release();
  await tick();
  await tick();

  expect(document.activeElement).toBe(boundary);
  expect(document.activeElement).not.toBe(outside);
  expect(boundary.getAttribute('tabindex')).toBe('-1');
});

it('DF-15 navigation path: accepted navigation target inside owned boundary retires framework-owned tabindex once and later author write survives', async () => {
  const boundary = region('');
  const handle = enrollLayer({ node: boundary, focus: { node: boundary, modal: false } });
  cleanup.push(() => handle.release(false));
  await tick();
  expect(boundary.getAttribute('tabindex')).toBe('-1');

  const navTarget = document.createElement('button');
  navTarget.textContent = 'Nav target inside';
  boundary.append(navTarget);

  requestNavigationFocus(document, { live: () => true, target: () => navTarget });
  await tick();

  expect(document.activeElement).toBe(navTarget);
  expect(boundary.hasAttribute('tabindex')).toBe(false);

  boundary.setAttribute('tabindex', '0');
  handle.release(false);
  await tick();

  expect(document.activeElement).toBe(navTarget);
  expect(boundary.getAttribute('tabindex')).toBe('0');
});

it('DF-15 control: accepted navigation target inside owned boundary retires framework-owned tabindex without author write', async () => {
  const boundary = region('');
  const handle = enrollLayer({ node: boundary, focus: { node: boundary, modal: false } });
  cleanup.push(() => handle.release(false));
  await tick();
  expect(boundary.getAttribute('tabindex')).toBe('-1');

  const navTarget = document.createElement('button');
  boundary.append(navTarget);

  requestNavigationFocus(document, { live: () => true, target: () => navTarget });
  await tick();

  expect(document.activeElement).toBe(navTarget);
  expect(boundary.hasAttribute('tabindex')).toBe(false);

  handle.release(false);
  await tick();
  expect(boundary.hasAttribute('tabindex')).toBe(false);
});

it('isolated navigation callback fault: throwing live() is reported once, leaves no stale authority, and healthy navigation succeeds', async () => {
  const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
  cleanup.push(() => reported.mockRestore());
  const failure = new Error('navigation live() fault');
  const target = button('Unreached target');

  requestNavigationFocus(document, {
    live: () => { throw failure; },
    target: () => target
  });
  await tick();

  await vi.waitFor(() => expect(reported).toHaveBeenCalledTimes(1));
  expect(reported).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:', failure);
  expect(document.activeElement).not.toBe(target);

  const healthy = button('Healthy target');
  requestNavigationFocus(document, { live: () => true, target: () => healthy });
  await tick();
  expect(document.activeElement).toBe(healthy);
});

it('isolated navigation callback fault: throwing target() resolver is reported once, leaves no stale authority, and healthy navigation succeeds', async () => {
  const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
  cleanup.push(() => reported.mockRestore());
  const failure = new Error('navigation target() fault');

  requestNavigationFocus(document, {
    live: () => true,
    target: () => { throw failure; }
  });
  await tick();

  await vi.waitFor(() => expect(reported).toHaveBeenCalledTimes(1));
  expect(reported).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:', failure);

  const healthy = button('Healthy target');
  requestNavigationFocus(document, { live: () => true, target: () => healthy });
  await tick();
  expect(document.activeElement).toBe(healthy);
});

it('isolated navigation callback fault: throwing fallback() resolver is reported once, leaves no stale authority, and healthy navigation succeeds', async () => {
  const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
  cleanup.push(() => reported.mockRestore());
  const failure = new Error('navigation fallback() fault');

  requestNavigationFocus(document, {
    live: () => true,
    target: () => null,
    fallback: () => { throw failure; }
  });
  await tick();

  await vi.waitFor(() => expect(reported).toHaveBeenCalledTimes(1));
  expect(reported).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:', failure);

  const healthyFallback = button('Healthy fallback');
  requestNavigationFocus(document, {
    live: () => true,
    target: () => null,
    fallback: () => healthyFallback
  });
  await tick();
  expect(document.activeElement).toBe(healthyFallback);
});

// DISPOSITION: The NavigationFocus interface declared in dismissalCoordinator.ts:
//   export interface NavigationFocus {
//     live(): boolean;
//     target(): HTMLElement | null;
//     fallback?: (() => HTMLElement | null) | undefined;
//   }
// There is no eligibility callback or resolver on NavigationFocus. Target eligibility
// is evaluated internally via eligible(node, document) from focusEligibility.ts,
// which inspects DOM attributes (disabled, inert, hidden) rather than invoking an author callback.
// Therefore, a throwing author eligibility resolver is not representable under the real NavigationFocus type.
// Below, we prove that an ineligible primary target cleanly yields to fallback or document.body without leaking tabindex.
it('isolated navigation callback fault disposition: ineligible primary target yields to fallback or document.body without leaking tabindex', async () => {
  const disabledPrimary = button('Disabled primary');
  disabledPrimary.disabled = true;
  const alternative = button('Alternative');

  requestNavigationFocus(document, {
    live: () => true,
    target: () => disabledPrimary,
    fallback: () => alternative
  });
  await tick();

  expect(document.activeElement).toBe(alternative);
  expect(disabledPrimary.hasAttribute('tabindex')).toBe(false);

  const detachedPrimary = button('Detached');
  detachedPrimary.remove();
  requestNavigationFocus(document, {
    live: () => true,
    target: () => detachedPrimary
  });
  await tick();

  expect(document.activeElement).toBe(document.body);
  expect(document.body.hasAttribute('tabindex')).toBe(false);
});

it('isolated adoption fault: throwing returnFocus is contained once and destination modal still claims focus', async () => {
  const originDoc = document.implementation.createHTMLDocument();
  const destDoc = await iframeDocument();
  const originWatch = watch(originDoc);
  const destWatch = watch(destDoc);

  const node = originDoc.createElement('div');
  const btn = originDoc.createElement('button');
  node.append(btn);
  originDoc.body.append(node);
  cleanup.push(() => node.remove());

  const failure = new Error('adoption returnFocus failed');
  let fault = false;
  const handle = enrollLayer({
    node,
    focus: {
      node,
      modal: true,
      returnFocus: () => {
        if (fault) throw failure;
        return btn;
      }
    }
  });
  cleanup.push(() => handle.release(false));

  expect(handle.live).toBe(true);
  expect(originWatch.added()).toEqual(coordinatorTypes);

  destDoc.body.append(node);
  fault = true;

  const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
  cleanup.push(() => reported.mockRestore());

  expect(() => rehomeAdoptedLayers(originDoc)).not.toThrow();
  expect(reported).toHaveBeenCalledTimes(1);
  expect(reported).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:', failure);
  await tick();

  expect(handle.live).toBe(true);
  expect(originWatch.removed()).toEqual(coordinatorTypes);
  expect(destWatch.added()).toEqual(coordinatorTypes);
  expect(destDoc.activeElement).toBe(btn);
  expect(originDoc.activeElement).not.toBe(btn);

  handle.release(false);
  expect(handle.live).toBe(false);
  expect(destWatch.removed()).toEqual(coordinatorTypes);
});

it('isolated adoption control: healthy returnFocus during cross-document adoption migrates listeners and restores trigger in destination document', async () => {
  const originDoc = document.implementation.createHTMLDocument();
  const destDoc = await iframeDocument();
  const destTrigger = destDoc.createElement('button');
  destDoc.body.append(destTrigger);

  const node = originDoc.createElement('div');
  const child = originDoc.createElement('button');
  node.append(child);
  originDoc.body.append(node);
  cleanup.push(() => node.remove());

  const handle = enrollLayer({
    node,
    focus: {
      node,
      modal: true,
      returnFocus: () => (node.ownerDocument === destDoc ? destTrigger : child)
    }
  });
  cleanup.push(() => handle.release(false));

  destDoc.body.append(node);
  expect(() => rehomeAdoptedLayers(originDoc)).not.toThrow();

  expect(handle.live).toBe(true);
  await tick();
  expect(destDoc.activeElement).toBe(child);
  handle.release();
  await tick();
  expect(destDoc.activeElement).toBe(destTrigger);
  expect(handle.live).toBe(false);
});

it('isolated adoption reentrancy: returnFocus may release its handle without stale destination focus writes', async () => {
  const originDoc = document.implementation.createHTMLDocument();
  const destDoc = await iframeDocument();
  const destWatch = watch(destDoc);
  const node = originDoc.createElement('div');
  node.append(originDoc.createElement('button'));
  originDoc.body.append(node);
  let handle!: ReturnType<typeof enrollLayer>;
  handle = enrollLayer({
    node,
    focus: {
      node,
      modal: true,
      returnFocus: () => {
        if (node.ownerDocument === destDoc) handle.release(false);
        return null;
      }
    }
  });
  cleanup.push(() => handle.release(false));

  destDoc.body.append(node);
  expect(() => rehomeAdoptedLayers(originDoc)).not.toThrow();
  await tick();

  expect(handle.live).toBe(false);
  expect(destWatch.added()).toEqual(coordinatorTypes);
  expect(destWatch.removed()).toEqual(coordinatorTypes);
  expect(destDoc.activeElement).toBe(destDoc.body);
});

it('isolated adoption reentrancy: returnFocus may retire focus authority without the attachment rearming it', async () => {
  const originDoc = document.implementation.createHTMLDocument();
  const destDoc = await iframeDocument();
  const node = originDoc.createElement('div');
  node.append(originDoc.createElement('button'));
  originDoc.body.append(node);
  let handle!: ReturnType<typeof enrollLayer>;
  handle = enrollLayer({
    node,
    focus: {
      node,
      modal: true,
      returnFocus: () => {
        if (node.ownerDocument === destDoc) handle.setFocusActive(false);
        return null;
      }
    }
  });
  cleanup.push(() => handle.release(false));

  destDoc.body.append(node);
  expect(() => rehomeAdoptedLayers(originDoc)).not.toThrow();
  await tick();

  expect(handle.live).toBe(true);
  expect(destDoc.activeElement).toBe(destDoc.body);
  handle.release(false);
  expect(handle.live).toBe(false);
});

it('isolated adoption reentrancy: returnFocus may adopt again and only the final document writes focus state', async () => {
  const originDoc = document.implementation.createHTMLDocument();
  const firstDoc = await iframeDocument();
  const finalDoc = await iframeDocument();
  const firstWatch = watch(firstDoc);
  const finalWatch = watch(finalDoc);
  const finalTrigger = finalDoc.createElement('button');
  finalDoc.body.append(finalTrigger);
  const node = originDoc.createElement('div');
  const child = originDoc.createElement('button');
  node.append(child);
  originDoc.body.append(node);
  let movedAgain = false;
  const handle = enrollLayer({
    node,
    focus: {
      node,
      modal: true,
      returnFocus: () => {
        if (node.ownerDocument === firstDoc && !movedAgain) {
          movedAgain = true;
          finalDoc.body.append(node);
          rehomeAdoptedLayers(firstDoc);
        }
        return node.ownerDocument === finalDoc ? finalTrigger : null;
      }
    }
  });
  cleanup.push(() => handle.release(false));

  firstDoc.body.append(node);
  expect(() => rehomeAdoptedLayers(originDoc)).not.toThrow();
  await tick();

  expect(handle.live).toBe(true);
  expect(firstWatch.added()).toEqual(coordinatorTypes);
  expect(firstWatch.removed()).toEqual(coordinatorTypes);
  expect(finalWatch.added()).toEqual(coordinatorTypes);
  expect(finalDoc.activeElement).toBe(child);
  handle.release();
  await tick();
  expect(finalDoc.activeElement).toBe(finalTrigger);
  expect(finalWatch.removed()).toEqual(coordinatorTypes);
});
