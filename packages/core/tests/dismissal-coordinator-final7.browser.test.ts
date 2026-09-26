import { afterEach, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { enrollLayer, registerDismissalLayer } from '../src/lib/actions/dismissalCoordinator';

const releases: Array<() => void> = [];

afterEach(() => {
  try {
    while (releases.length > 0) {
      try {
        releases.pop()!();
      } catch {
        // continue releasing remaining handles and nodes on failure paths
      }
    }
  } finally {
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});

function layer(doc = document, extra: Partial<Parameters<typeof registerDismissalLayer>[0]> = {}) {
  const node = doc.createElement('div');
  doc.body.append(node);
  const onEscape = vi.fn();
  const onPointerOutside = vi.fn();
  const handle = enrollLayer({ node, onEscape, onPointerOutside, ...extra });
  releases.push(() => {
    handle.release(false);
    node.remove();
  });
  return { node, onEscape, onPointerOutside, handle };
}

function pointer(target: EventTarget = document.body) {
  target.dispatchEvent(
    new MouseEvent('pointerdown', {
      button: 0,
      bubbles: true,
      composed: true,
      cancelable: true
    })
  );
}

function findShieldSignal(addSpy: { mock: { calls: readonly (readonly unknown[])[] } }): AbortSignal | undefined {
  const call = addSpy.mock.calls.find(
    (raw) => {
      const [type, , options] = raw;
      return type === 'keydown' && typeof options === 'object' && options !== null && 'signal' in options;
    }
  );
  return (call?.[2] as AddEventListenerOptions | undefined)?.signal;
}

it('real browser-provider Escape reaches focused target, is consumed, shields window, and descendant stopPropagation releases shield on next task rather than microtask', async () => {
  vi.useFakeTimers();
  const addSpy = vi.spyOn(document, 'addEventListener');
  releases.push(() => addSpy.mockRestore());

  const windowObserved = vi.fn();
  window.addEventListener('keydown', windowObserved);
  releases.push(() => window.removeEventListener('keydown', windowObserved));

  const target = document.createElement('button');
  target.tabIndex = 0;
  document.body.append(target);
  releases.push(() => target.remove());
  target.focus();

  let targetObserved = false;
  let targetDefaultPrevented = false;
  const targetListener = (event: KeyboardEvent) => {
    targetObserved = true;
    targetDefaultPrevented = event.defaultPrevented;
    event.stopPropagation();
  };
  target.addEventListener('keydown', targetListener);
  releases.push(() => target.removeEventListener('keydown', targetListener));

  const onEscape = vi.fn();
  const handle = enrollLayer({ node: target, onEscape });
  releases.push(() => handle.release(false));

  await userEvent.keyboard('{Escape}');

  // Coordinator consumed Escape before target observation
  expect(targetObserved).toBe(true);
  expect(targetDefaultPrevented).toBe(true);
  expect(onEscape).toHaveBeenCalledTimes(1);

  // Descendant stopPropagation kept the event from reaching window
  expect(windowObserved).not.toHaveBeenCalled();

  // Temporary bubble shield was installed with an AbortSignal
  const signal = findShieldSignal(addSpy);
  expect(signal).toBeDefined();
  expect(signal?.aborted).toBe(false);
  expect(vi.getTimerCount()).toBe(1);

  // Microtask discrimination: microtask queue flushing does not release the shield
  await Promise.resolve();
  await Promise.resolve();
  expect(signal?.aborted).toBe(false);
  expect(vi.getTimerCount()).toBe(1);

  // Task discrimination: advancing to the task fallback releases the shield
  vi.advanceTimersByTime(0);
  expect(signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);

  // Nonvacuous control: unhindered Escape after layer release reaches window
  target.removeEventListener('keydown', targetListener);
  handle.release(false);
  await userEvent.keyboard('{Escape}');
  expect(windowObserved).toHaveBeenCalledTimes(1);
});

it('ordinary consumed bubbling Escape reaching document bubble listener aborts temporary shield immediately before task fallback', async () => {
  vi.useFakeTimers();
  const addSpy = vi.spyOn(document, 'addEventListener');
  releases.push(() => addSpy.mockRestore());

  const windowObserved = vi.fn();
  window.addEventListener('keydown', windowObserved);
  releases.push(() => window.removeEventListener('keydown', windowObserved));

  const target = document.createElement('button');
  target.tabIndex = 0;
  document.body.append(target);
  releases.push(() => target.remove());
  target.focus();

  let targetObserved = false;
  let targetDefaultPrevented = false;
  const targetListener = (event: KeyboardEvent) => {
    targetObserved = true;
    targetDefaultPrevented = event.defaultPrevented;
    // Ordinary bubbling: stopPropagation is not called
  };
  target.addEventListener('keydown', targetListener);
  releases.push(() => target.removeEventListener('keydown', targetListener));

  const onEscape = vi.fn();
  const handle = enrollLayer({ node: target, onEscape });
  releases.push(() => handle.release(false));

  await userEvent.keyboard('{Escape}');

  expect(targetObserved).toBe(true);
  expect(targetDefaultPrevented).toBe(true);
  expect(onEscape).toHaveBeenCalledTimes(1);
  expect(windowObserved).not.toHaveBeenCalled();

  // Document bubble cleanup path discrimination:
  // Shield aborted immediately during synchronous bubble phase without waiting for the task fallback
  const signal = findShieldSignal(addSpy);
  expect(signal).toBeDefined();
  expect(signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);

  // Task fallback is already cleared, so advancing timers has no pending work
  vi.advanceTimersByTime(100);
  expect(vi.getTimerCount()).toBe(0);
});

it('throwing onEscape after consumption is reported once, target observes consumed event, window stays shielded, shield releases normally, and timer count returns to zero', async () => {
  vi.useFakeTimers();
  const addSpy = vi.spyOn(document, 'addEventListener');
  releases.push(() => addSpy.mockRestore());

  const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
  releases.push(() => reported.mockRestore());

  const windowObserved = vi.fn();
  window.addEventListener('keydown', windowObserved);
  releases.push(() => window.removeEventListener('keydown', windowObserved));

  const target = document.createElement('button');
  target.tabIndex = 0;
  document.body.append(target);
  releases.push(() => target.remove());
  target.focus();

  let targetObserved = false;
  let targetDefaultPrevented = false;
  const targetListener = (event: KeyboardEvent) => {
    targetObserved = true;
    targetDefaultPrevented = event.defaultPrevented;
  };
  target.addEventListener('keydown', targetListener);
  releases.push(() => target.removeEventListener('keydown', targetListener));

  const error = new Error('faulty onEscape');
  let fault = true;
  const handle = enrollLayer({
    node: target,
    onEscape: () => {
      if (fault) throw error;
    }
  });
  releases.push(() => handle.release(false));

  await userEvent.keyboard('{Escape}');

  // 1. Throwing callback reported exactly once with standard error format
  expect(reported).toHaveBeenCalledTimes(1);
  expect(reported).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:', error);

  // 2. Target still observes the consumed event
  expect(targetObserved).toBe(true);
  expect(targetDefaultPrevented).toBe(true);

  // 3. Window remains shielded
  expect(windowObserved).not.toHaveBeenCalled();

  // 4. Temporary shield releases normally through document bubble cleanup and timer count is zero
  const signal = findShieldSignal(addSpy);
  expect(signal).toBeDefined();
  expect(signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);

  // 5. Later input remains healthy
  fault = false;
  reported.mockClear();
  targetObserved = false;
  targetDefaultPrevented = false;

  await userEvent.keyboard('{Escape}');
  expect(reported).not.toHaveBeenCalled();
  expect(targetObserved).toBe(true);
  expect(targetDefaultPrevented).toBe(true);
  expect(windowObserved).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);

  // Positive control: release restores native window receipt
  target.removeEventListener('keydown', targetListener);
  handle.release(false);
  await userEvent.keyboard('{Escape}');
  expect(windowObserved).toHaveBeenCalledTimes(1);
});

it('nested target handling preserves target and ancestor observation while coordinator consumes Escape and shields window', async () => {
  vi.useFakeTimers();
  const windowObserved = vi.fn();
  window.addEventListener('keydown', windowObserved);
  releases.push(() => window.removeEventListener('keydown', windowObserved));

  const container = document.createElement('div');
  const wrapper = document.createElement('div');
  const innerButton = document.createElement('button');
  innerButton.tabIndex = 0;
  wrapper.append(innerButton);
  container.append(wrapper);
  document.body.append(container);
  releases.push(() => container.remove());
  innerButton.focus();

  const observations: string[] = [];
  innerButton.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) observations.push('inner');
  });
  wrapper.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) observations.push('wrapper');
  });
  container.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) observations.push('container');
  });

  const onEscape = vi.fn();
  const handle = enrollLayer({ node: container, onEscape });
  releases.push(() => handle.release(false));

  await userEvent.keyboard('{Escape}');

  expect(onEscape).toHaveBeenCalledTimes(1);
  expect(observations).toEqual(['inner', 'wrapper', 'container']);
  expect(windowObserved).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('non-bubbling synthetic Escape consumes at document capture and releases shield via task cleanup without emulating native bubbling', () => {
  vi.useFakeTimers();
  const addSpy = vi.spyOn(document, 'addEventListener');
  releases.push(() => addSpy.mockRestore());

  const windowObserved = vi.fn();
  window.addEventListener('keydown', windowObserved);
  releases.push(() => window.removeEventListener('keydown', windowObserved));

  const container = document.createElement('div');
  const target = document.createElement('button');
  container.append(target);
  document.body.append(container);
  releases.push(() => container.remove());

  let targetObserved = false;
  let targetDefaultPrevented = false;
  target.addEventListener('keydown', (e) => {
    targetObserved = true;
    targetDefaultPrevented = e.defaultPrevented;
  });

  let containerObserved = false;
  container.addEventListener('keydown', () => {
    containerObserved = true;
  });

  const onEscape = vi.fn();
  const handle = enrollLayer({ node: container, onEscape });
  releases.push(() => handle.release(false));

  const syntheticEvent = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: false,
    cancelable: true
  });
  target.dispatchEvent(syntheticEvent);

  // Coordinator capture consumes the event
  expect(onEscape).toHaveBeenCalledTimes(1);
  expect(syntheticEvent.defaultPrevented).toBe(true);

  // Target observes the consumed event
  expect(targetObserved).toBe(true);
  expect(targetDefaultPrevented).toBe(true);

  // Non-bubbling contract: ancestors do not observe bubble phase
  expect(containerObserved).toBe(false);
  expect(windowObserved).not.toHaveBeenCalled();

  // Document bubble was not reached due to bubbles: false; shield is armed with pending task timer
  const signal = findShieldSignal(addSpy);
  expect(signal).toBeDefined();
  expect(signal?.aborted).toBe(false);
  expect(vi.getTimerCount()).toBe(1);

  // Task cleanup bounds and releases the shield without synthetic bubbling emulation
  vi.advanceTimersByTime(0);
  expect(signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves accepted compatibility boundary: only pre-coordinator capture vetoes, descendant bubble preventDefault cannot retroactively veto consumed Escape', async () => {
  const windowObserved = vi.fn();
  window.addEventListener('keydown', windowObserved);
  releases.push(() => window.removeEventListener('keydown', windowObserved));

  const target = document.createElement('button');
  target.tabIndex = 0;
  document.body.append(target);
  releases.push(() => target.remove());
  target.focus();

  let targetObserved = false;
  target.addEventListener('keydown', (event) => {
    targetObserved = true;
    // Attempted retroactive bubble veto
    event.preventDefault();
  });

  const onEscape = vi.fn();
  const handle = enrollLayer({ node: target, onEscape });
  releases.push(() => handle.release(false));

  await userEvent.keyboard('{Escape}');

  // Capture authority: coordinator already consumed Escape
  expect(onEscape).toHaveBeenCalledTimes(1);
  expect(targetObserved).toBe(true);
  expect(windowObserved).not.toHaveBeenCalled();

  // Control: register the veto before a fresh coordinator installs its capture listener.
  handle.release(false);
  const preCaptureVeto = (event: Event) => event.preventDefault();
  document.addEventListener('keydown', preCaptureVeto, true);
  releases.push(() => document.removeEventListener('keydown', preCaptureVeto, true));
  const vetoedEscape = vi.fn();
  const vetoed = enrollLayer({ node: target, onEscape: vetoedEscape });
  releases.push(() => vetoed.release(false));

  await userEvent.keyboard('{Escape}');
  expect(vetoedEscape).not.toHaveBeenCalled();
});

it('throwing pointerBoundary getter at arming reports once, cancels when the faulty top remains selected at delivery, and recovers on a later gesture', () => {
  vi.useFakeTimers();
  const error = new Error('faulty pointerBoundary getter');
  const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
  releases.push(() => reported.mockRestore());

  const lower = layer();
  let fault = true;
  const upper = layer(document, {
    pointerBoundary: () => {
      if (fault) throw error;
      return upper.node;
    }
  });

  // Pointer outside both nodes
  pointer();

  // The arming phase skips and arms lower; delivery reselects the still-top entry, so the gesture cancels rather than crossing phases.
  expect(reported).toHaveBeenCalledTimes(1);
  expect(reported).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:', error);

  vi.runAllTimers();
  expect(reported).toHaveBeenCalledTimes(1);
  expect(lower.onPointerOutside).not.toHaveBeenCalled();
  expect(upper.onPointerOutside).not.toHaveBeenCalled();

  // Recovery: later gesture with healed getter delivers to top candidate
  fault = false;
  reported.mockClear();
  pointer();
  vi.runAllTimers();
  expect(upper.onPointerOutside).toHaveBeenCalledTimes(1);
  expect(lower.onPointerOutside).not.toHaveBeenCalled();
  expect(reported).not.toHaveBeenCalled();
});

it('throwing pointerBoundary during deferred delivery retry reports once and allows recovery without conflating with identity faults', () => {
  vi.useFakeTimers();
  const boundaryError = new Error('delivery pointerBoundary error');
  const identityError = new Error('delivery identity error');
  const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
  releases.push(() => reported.mockRestore());

  // Existing control: healthy arming with throwing delivery identity triggers lower retry
  let upperIdentityFault = false;
  const upper = layer(document, {
    priority: 2,
    identity: () => {
      if (upperIdentityFault) throw identityError;
      return 'upper-stable';
    }
  });

  let lowerBoundaryFault = false;
  const lower = layer(document, {
    priority: 1,
    pointerBoundary: () => {
      if (lowerBoundaryFault) throw boundaryError;
      return lower.node;
    }
  });

  // Arming phase: upper is armed
  pointer();
  expect(vi.getTimerCount()).toBe(1);

  // At delivery, upper identity faults, triggering retry into lower
  upperIdentityFault = true;
  lowerBoundaryFault = true;

  vi.runAllTimers();

  // Both faults report once for their respective phases/evaluations
  expect(reported).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:', identityError);
  expect(reported).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:', boundaryError);
  expect(reported).toHaveBeenCalledTimes(2);
  expect(upper.onPointerOutside).not.toHaveBeenCalled();
  expect(lower.onPointerOutside).not.toHaveBeenCalled();

  // Gesture recovers on subsequent clean pointer
  upperIdentityFault = false;
  lowerBoundaryFault = false;
  reported.mockClear();

  pointer();
  vi.runAllTimers();
  expect(upper.onPointerOutside).toHaveBeenCalledTimes(1);
  expect(reported).not.toHaveBeenCalled();
});

it('existing controls for pointerEnabled and identity faults remain distinct and unconflated', () => {
  vi.useFakeTimers();
  const predicateError = new Error('pointerEnabled fault');
  const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
  releases.push(() => reported.mockRestore());

  const parent = layer();
  let fault = true;
  const child = layer(document, {
    pointerEnabled: () => {
      if (fault) throw predicateError;
      return true;
    }
  });

  pointer();
  expect(reported).toHaveBeenCalledTimes(1);
  expect(reported).toHaveBeenCalledWith('[Composable Svelte] Focus coordination failed:', predicateError);

  vi.runAllTimers();
  expect(parent.onPointerOutside).toHaveBeenCalledTimes(1);
  expect(child.onPointerOutside).not.toHaveBeenCalled();

  fault = false;
  reported.mockClear();
  pointer();
  vi.runAllTimers();
  expect(child.onPointerOutside).toHaveBeenCalledTimes(1);
  expect(parent.onPointerOutside).toHaveBeenCalledTimes(1);
});
