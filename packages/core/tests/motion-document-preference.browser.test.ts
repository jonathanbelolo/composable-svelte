import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { rendererOwner } from '../src/lib/application/renderer/owner.js';
import { TargetRegistry, targetFor } from '../src/lib/application/renderer/target-registry.js';
import { createMotionClock } from '../src/lib/application/renderer/motion-run.js';
import { CaptureChannel } from '../src/lib/application/renderer/capture-channel.js';
import { createDocumentPreferences } from '../src/lib/application/renderer/document-preference.js';
import { ResourceScope } from '../src/lib/execution/resources.js';
import { DeterministicScheduler } from '../src/lib/execution/scheduler.js';
import { optionalSlot } from '../src/lib/navigation/managed-integration.js';
import { integrate } from '../src/lib/navigation/integrate.js';
import { createStore } from '../src/lib/store.svelte.js';
import { Effect } from '../src/lib/effect.js';
import type { Reducer } from '../src/lib/types.js';
import type { PresentationAction } from '../src/lib/navigation/types.js';
import { expectConsole } from './helpers/console.js';

type ChildState = { value: number };
type ChildAction = { type: 'increment' };
type State = { child: ChildState | null };
type Action = { type: 'child'; action: PresentationAction<ChildAction> } | { type: 'remove' };

const slot = optionalSlot<State, Action>()('child');
const childReducer: Reducer<ChildState, ChildAction> = s => [{ value: s.value + 1 }, Effect.none()];
const rootReducer: Reducer<State, Action> = (s, a) => [a.type === 'remove' ? { child: null } : s, Effect.none()];
const definition = integrate(rootReducer).managed().with(slot, childReducer).build();

function createFixture() {
  const store = createStore({ initialState: { child: { value: 0 } }, ...definition });
  const owner = rendererOwner(store, definition.execution);
  const claim = owner.claim();
  claim.attach();
  const view = definition.bind(store, slot)!;
  return { store, owner, claim, view };
}

function createMqlStub(initialMatches = false) {
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  const mql = {
    get matches() {
      return matches;
    },
    addEventListener: vi.fn((event: string, listener: () => void) => {
      if (event === 'change') listeners.add(listener);
    }),
    removeEventListener: vi.fn((event: string, listener: () => void) => {
      if (event === 'change') listeners.delete(listener);
    }),
    dispatchChange(nextMatches: boolean) {
      matches = nextMatches;
      for (const listener of [...listeners]) listener();
    },
    listenersCount() {
      return listeners.size;
    }
  };
  return mql;
}

let iframe: HTMLIFrameElement;
let iframeWindow: Window;
let iframeDoc: Document;
let topMql: ReturnType<typeof createMqlStub>;
let iframeMql: ReturnType<typeof createMqlStub>;
let topMatchMediaSpy: MockInstance<Window['matchMedia']>;
let iframeMatchMediaSpy: MockInstance<Window['matchMedia']>;

beforeEach(() => {
  iframe = document.createElement('iframe');
  document.body.appendChild(iframe);
  iframeWindow = iframe.contentWindow!;
  iframeDoc = iframe.contentDocument!;

  topMql = createMqlStub(false);
  iframeMql = createMqlStub(true);

  topMatchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(q =>
    q === '(prefers-reduced-motion: reduce)' ? (topMql as unknown as MediaQueryList) : ({} as MediaQueryList)
  );
  iframeMatchMediaSpy = vi.spyOn(iframeWindow, 'matchMedia').mockImplementation(q =>
    q === '(prefers-reduced-motion: reduce)' ? (iframeMql as unknown as MediaQueryList) : ({} as MediaQueryList)
  );
});

afterEach(() => {
  topMatchMediaSpy.mockRestore();
  iframeMatchMediaSpy.mockRestore();
  iframe.remove();
});

it('discriminates actual target document in both directions for ordinary bindings (Rows 1 & 2)', async () => {
  const { store, claim, view } = createFixture();
  const topNode = document.createElement('div');
  document.body.appendChild(topNode);
  const iframeNode = iframeDoc.createElement('div');
  iframeDoc.body.appendChild(iframeNode);

  try {
    const topBinding = claim.registry.bind(
      claim.registry.rootOwner,
      [{ name: 'top', node: topNode, properties: ['opacity'], stable: { opacity: '1' } }],
      { channel: 'top-ch', priority: 1 }
    );
    const iframeBinding = claim.registry.bind(
      claim.registry.rootOwner,
      [{ name: 'iframe', node: iframeNode, properties: ['opacity'], stable: { opacity: '1' } }],
      { channel: 'iframe-ch', priority: 1 }
    );

    let topExecuted = false;
    let iframeExecuted = false;

    const topRun = topBinding.start({
      deadlineMs: 500,
      execute: () => {
        topExecuted = true;
      },
      stable: () => {}
    });
    const iframeRun = iframeBinding.start({
      deadlineMs: 500,
      execute: () => {
        iframeExecuted = true;
      },
      stable: () => {}
    });

    // Top is false -> animates (executed)
    expect(topExecuted).toBe(true);
    // Iframe is true -> skipped with reducedMotion
    expect(iframeExecuted).toBe(false);
    const iframeReceipt = await iframeRun.settled;
    expect(iframeReceipt.outcome).toEqual({ status: 'skipped', reason: 'reducedMotion' });

    topBinding.release();
    iframeBinding.release();

    // Inverse direction: top is reduced while the iframe is not.
    topMql = createMqlStub(true);
    iframeMql = createMqlStub(false);
    const inverseTop = claim.registry.bind(claim.registry.rootOwner, [{ name: 'top2', node: topNode, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'top-inverse', priority: 1 });
    const inverseFrame = claim.registry.bind(claim.registry.rootOwner, [{ name: 'frame2', node: iframeNode, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'frame-inverse', priority: 1 });
    let inverseTopExecuted = 0;
    let inverseFrameExecuted = 0;
    const inverseTopRun = inverseTop.start({ deadlineMs: 500, execute: () => { inverseTopExecuted++; }, stable: () => {} });
    inverseFrame.start({ deadlineMs: 500, execute: () => { inverseFrameExecuted++; }, stable: () => {} });
    expect(inverseTopExecuted).toBe(0);
    expect(inverseFrameExecuted).toBe(1);
    expect((await inverseTopRun.settled).outcome).toEqual({ status: 'skipped', reason: 'reducedMotion' });
    inverseTop.release();
    inverseFrame.release();
  } finally {
    topNode.remove();
    iframeNode.remove();
    store.destroy();
  }
});

it('shares one listener across N=3 live runs in the same document and removes on last release (Row 3)', async () => {
  const { store, claim } = createFixture();
  const n1 = document.createElement('div');
  const n2 = document.createElement('div');
  const n3 = document.createElement('div');
  document.body.append(n1, n2, n3);

  try {
    const b1 = claim.registry.bind(claim.registry.rootOwner, [{ name: 't1', node: n1, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'c1', priority: 1 });
    const b2 = claim.registry.bind(claim.registry.rootOwner, [{ name: 't2', node: n2, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'c2', priority: 1 });
    const b3 = claim.registry.bind(claim.registry.rootOwner, [{ name: 't3', node: n3, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'c3', priority: 1 });

    expect(topMql.listenersCount()).toBe(0);

    const r1 = b1.start({ deadlineMs: 500, execute: () => new Promise<void>(() => {}), stable: () => {} });
    expect(topMql.listenersCount()).toBe(1);
    expect(topMql.addEventListener).toHaveBeenCalledTimes(1);

    const r2 = b2.start({ deadlineMs: 500, execute: () => new Promise<void>(() => {}), stable: () => {} });
    expect(topMql.listenersCount()).toBe(1);
    expect(topMql.addEventListener).toHaveBeenCalledTimes(1);

    const r3 = b3.start({ deadlineMs: 500, execute: () => new Promise<void>(() => {}), stable: () => {} });
    expect(topMql.listenersCount()).toBe(1);
    expect(topMql.addEventListener).toHaveBeenCalledTimes(1);

    b1.release();
    expect(topMql.listenersCount()).toBe(1);
    expect(topMql.removeEventListener).toHaveBeenCalledTimes(0);

    b2.release();
    expect(topMql.listenersCount()).toBe(1);
    expect(topMql.removeEventListener).toHaveBeenCalledTimes(0);

    b3.release();
    expect(topMql.listenersCount()).toBe(0);
    expect(topMql.removeEventListener).toHaveBeenCalledTimes(1);
  } finally {
    n1.remove();
    n2.remove();
    n3.remove();
    store.destroy();
  }
});

it('maintains document independence between top and iframe MediaQueryLists (Row 4)', async () => {
  topMql = createMqlStub(false);
  iframeMql = createMqlStub(false);

  const { store, claim } = createFixture();
  const topNode = document.createElement('div');
  document.body.appendChild(topNode);
  const iframeNode = iframeDoc.createElement('div');
  iframeDoc.body.appendChild(iframeNode);

  try {
    const topBinding = claim.registry.bind(claim.registry.rootOwner, [{ name: 't', node: topNode, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'ct', priority: 1 });
    const iframeBinding = claim.registry.bind(claim.registry.rootOwner, [{ name: 'i', node: iframeNode, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'ci', priority: 1 });

    const topRun = topBinding.start({ deadlineMs: 500, execute: () => new Promise<void>(() => {}), stable: () => {} });
    const iframeRun = iframeBinding.start({ deadlineMs: 500, execute: () => new Promise<void>(() => {}), stable: () => {} });

    expect(topMql.listenersCount()).toBe(1);
    expect(iframeMql.listenersCount()).toBe(1);

    // Changing top document preference must not supersede iframe run
    topMql.dispatchChange(true);

    const topReceipt = await topRun.settled;
    expect(topReceipt.outcome).toEqual({ status: 'superseded', reason: 'preferenceChanged' });
    expect(iframeRun.live).toBe(true);

    topBinding.release();
    iframeBinding.release();
  } finally {
    topNode.remove();
    iframeNode.remove();
    store.destroy();
  }
});

it('mid-run preference change settles predecessor as superseded/preferenceChanged and successor as skipped/reducedMotion (Row 5)', async () => {
  const { store, claim } = createFixture();
  const node = document.createElement('div');
  document.body.appendChild(node);

  try {
    const binding = claim.registry.bind(claim.registry.rootOwner, [{ name: 't', node, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'ct', priority: 1 });
    const baselinePending = store._runtime!.pendingWorkCount;
    let stableCalls = 0;
    let executeCalls = 0;
    let leased: ReturnType<typeof binding.lease> | undefined;

    const initialRun = binding.start({
      deadlineMs: 1000,
      execute: context => {
        executeCalls++;
        leased = binding.lease('t', 'opacity', context);
        leased.write('0.5');
        return new Promise<void>(() => {});
      },
      stable: () => {
        stableCalls++;
      }
    });

    expect(node.style.opacity).toBe('0.5');
    topMql.dispatchChange(true);

    const initialReceipt = await initialRun.settled;
    expect(initialReceipt.outcome).toEqual({ status: 'superseded', reason: 'preferenceChanged' });
    expect(initialReceipt.current).toBe(false);

    const successorRun = binding.current;
    expect(successorRun).toBeDefined();
    const successorReceipt = await successorRun!.settled;
    expect(successorReceipt.outcome).toEqual({ status: 'skipped', reason: 'reducedMotion' });
    expect(successorReceipt.current).toBe(true);

    // Stable projection, lease release and scheduler drainage are exact.
    expect(stableCalls).toBe(1);
    expect(executeCalls).toBe(1);
    expect(leased?.live).toBe(false);
    await store._runtime!.whenCleanupsSettled();
    expect(store._runtime!.pendingWorkCount).toBe(baselinePending + 1);
    const active = new Map<number, string | undefined>();
    for (const event of store._runtime!.diagnostics) {
      if (event.type === 'started') active.set(event.record.uid, event.record.description);
      if (event.type === 'settled') active.delete(event.record.uid);
    }
    expect([...active.values()]).toEqual(['ApplicationHost', 'Managed motion binding', 'Host visuals']);
    expect([...active.values()]).not.toContain('Document motion preference');

    // A later true-to-false change after reduced settlement cannot replay work.
    topMql.dispatchChange(false);
    await Promise.resolve();
    expect(executeCalls).toBe(1);
    expect(stableCalls).toBe(1);
    binding.release();
    claim.release();
    await store._runtime!.whenCleanupsSettled();
    expect(store._runtime!.pendingWorkCount).toBe(0);
  } finally {
    node.remove();
    store.destroy();
  }
});

it('re-enabling motion (true to false) does nothing and does not replay execute or stable (Row 6)', async () => {
  const { store, claim } = createFixture();
  const node = document.createElement('div');
  document.body.appendChild(node);

  try {
    const binding = claim.registry.bind(claim.registry.rootOwner, [{ name: 't', node, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'ct', priority: 1 });
    let executeCount = 0;
    let stableCount = 0;

    const run = binding.start({
      deadlineMs: 500,
      execute: () => {
        executeCount++;
        return new Promise<void>(() => {});
      },
      stable: () => {
        stableCount++;
      }
    });

    expect(executeCount).toBe(1);
    expect(topMql.listenersCount()).toBe(1);

    // Transition to false does nothing
    topMql.dispatchChange(false);
    expect(executeCount).toBe(1);
    expect(stableCount).toBe(0);
    expect(run.live).toBe(true);

    binding.release();
    expect(topMql.listenersCount()).toBe(0);
  } finally {
    node.remove();
    store.destroy();
  }
});

it('handles missing or throwing matchMedia as supported not-reduced without leaks (Row 7)', async () => {
  const throwingNode = iframeDoc.createElement('div');
  iframeDoc.body.appendChild(throwingNode);
  const queryFailure = new Error('matchMedia exploded');
  iframeMatchMediaSpy.mockImplementation(() => {
    throw queryFailure;
  });

  const { store, claim } = createFixture();
  try {
    const errors = expectConsole('error', 2);
    const binding = claim.registry.bind(claim.registry.rootOwner, [{ name: 'thr', node: throwingNode, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'cthr', priority: 1 });
    let executed = false;
    const run = binding.start({
      deadlineMs: 500,
      execute: () => {
        executed = true;
      },
      stable: () => {}
    });
    expect(executed).toBe(true);
    expect(errors.every(call => call.some(value => value === queryFailure || (value instanceof Error && value.message === 'matchMedia exploded')))).toBe(true);
    binding.release();
  } finally {
    throwingNode.remove();
    store.destroy();
  }
});

it('mixed-document binding skips if any target is reduced (Row 8)', async () => {
  const { store, claim } = createFixture();
  const topNode = document.createElement('div');
  document.body.appendChild(topNode);
  const iframeNode = iframeDoc.createElement('div');
  iframeDoc.body.appendChild(iframeNode);

  try {
    // Top is false, iframe is true -> mixed binding should skip
    const mixed = claim.registry.bind(
      claim.registry.rootOwner,
      [
        { name: 't', node: topNode, properties: ['opacity'], stable: { opacity: '1' } },
        { name: 'i', node: iframeNode, properties: ['opacity'], stable: { opacity: '1' } }
      ],
      { channel: 'cmixed', priority: 1 }
    );

    let executed = false;
    const run = mixed.start({
      deadlineMs: 500,
      execute: () => {
        executed = true;
      },
      stable: () => {}
    });
    expect(executed).toBe(false);
    const receipt = await run.settled;
    expect(receipt.outcome).toEqual({ status: 'skipped', reason: 'reducedMotion' });
    mixed.release();
  } finally {
    topNode.remove();
    iframeNode.remove();
    store.destroy();
  }
});

it('adoption: run ignores stale old-document callback once all nodes leave (Row 9)', async () => {
  topMql = createMqlStub(false);
  iframeMql = createMqlStub(false);

  const { store, claim } = createFixture();
  const node = document.createElement('div');
  document.body.appendChild(node);

  try {
    const binding = claim.registry.bind(claim.registry.rootOwner, [{ name: 't', node, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'cadopt', priority: 1 });
    const run = binding.start({ deadlineMs: 500, execute: () => new Promise<void>(() => {}), stable: () => {} });

    // Adopt node into iframe
    iframeDoc.body.appendChild(node);
    expect(node.ownerDocument).toBe(iframeDoc);

    // Change on old (top) document must be ignored
    topMql.dispatchChange(true);
    expect(run.live).toBe(true);

    // The next start rereads the node's new owner document.
    iframeMql.dispatchChange(true);
    let replayed = 0;
    const adoptedRun = binding.start({ deadlineMs: 500, execute: () => { replayed++; }, stable: () => {} });
    expect(replayed).toBe(0);
    expect((await adoptedRun.settled).outcome).toEqual({ status: 'skipped', reason: 'reducedMotion' });

    binding.release();
  } finally {
    node.remove();
    store.destroy();
  }
});

it('install race supersedes the predecessor before consumer execute and releases the new listener', async () => {
  const firstRead = createMqlStub(false);
  const registration = createMqlStub(true);
  topMatchMediaSpy.mockReset();
  topMatchMediaSpy
    .mockImplementationOnce(() => firstRead as unknown as MediaQueryList)
    .mockImplementation(() => registration as unknown as MediaQueryList);
  const { store, claim } = createFixture();
  const node = document.createElement('div');
  document.body.appendChild(node);
  try {
    const binding = claim.registry.bind(claim.registry.rootOwner, [{ name: 'race', node, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'race', priority: 1 });
    const baselinePending = store._runtime!.pendingWorkCount;
    let executeCalls = 0;
    let stableCalls = 0;
    const predecessor = binding.start({ deadlineMs: 500, execute: () => { executeCalls++; }, stable: () => { stableCalls++; } });
    expect((await predecessor.settled).outcome).toEqual({ status: 'superseded', reason: 'preferenceChanged' });
    expect(binding.current).toBeDefined();
    expect((await binding.current!.settled).outcome).toEqual({ status: 'skipped', reason: 'reducedMotion' });
    expect(executeCalls).toBe(0);
    expect(stableCalls).toBe(1);
    await store._runtime!.whenCleanupsSettled();
    expect(registration.listenersCount()).toBe(0);
    expect(registration.addEventListener).toHaveBeenCalledTimes(1);
    expect(registration.removeEventListener).toHaveBeenCalledTimes(1);
    expect(store._runtime!.pendingWorkCount).toBe(baselinePending + 1);
    binding.release();
    claim.release();
    await store._runtime!.whenCleanupsSettled();
    expect(store._runtime!.pendingWorkCount).toBe(0);
  } finally {
    node.remove();
    store.destroy();
  }
});

it('claim release and root destroy reclaim unreleased document watches and silence later callbacks', async () => {
  topMql = createMqlStub(false);
  const first = createFixture();
  const firstNode = document.createElement('div');
  document.body.appendChild(firstNode);
  let firstStable = 0;
  const firstBinding = first.claim.registry.bind(first.claim.registry.rootOwner, [{ name: 'first', node: firstNode, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'release', priority: 1 });
  firstBinding.start({ deadlineMs: 500, execute: () => new Promise<void>(() => {}), stable: () => { firstStable++; } });
  expect(topMql.listenersCount()).toBe(1);
  first.claim.release();
  await first.store._runtime!.whenCleanupsSettled();
  expect(topMql.listenersCount()).toBe(0);
  topMql.dispatchChange(true);
  expect(firstStable).toBe(0);
  expect(first.store._runtime!.pendingWorkCount).toBe(0);
  firstNode.remove();
  first.store.destroy();

  topMql = createMqlStub(false);
  const second = createFixture();
  const secondNode = document.createElement('div');
  document.body.appendChild(secondNode);
  let secondStable = 0;
  const secondBinding = second.claim.registry.bind(second.claim.registry.rootOwner, [{ name: 'second', node: secondNode, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'destroy', priority: 1 });
  secondBinding.start({ deadlineMs: 500, execute: () => new Promise<void>(() => {}), stable: () => { secondStable++; } });
  expect(topMql.listenersCount()).toBe(1);
  second.store.destroy();
  await second.store._runtime!.whenCleanupsSettled();
  expect(topMql.listenersCount()).toBe(0);
  topMql.dispatchChange(true);
  expect(secondStable).toBe(0);
  expect(second.store._runtime!.pendingWorkCount).toBe(0);
  secondNode.remove();
});

it('registry failure releases preference listener and leases and drains root work', async () => {
  topMql = createMqlStub(false);
  const { store, claim } = createFixture();
  const node = document.createElement('div');
  document.body.appendChild(node);
  const errors = expectConsole('error');
  const binding = claim.registry.bind(claim.registry.rootOwner, [{ name: 'failure', node, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'failure', priority: 1 });
  let lease: ReturnType<typeof binding.lease> | undefined;
  const run = binding.start({
    deadlineMs: 500,
    execute: context => {
      lease = binding.lease('failure', 'opacity', context);
      return new Promise<void>(() => {});
    },
    stable: () => {}
  });
  expect(topMql.listenersCount()).toBe(1);
  const failure = new Error('registry failed');
  claim.registry.fail(failure);
  await run.settled;
  await store._runtime!.whenCleanupsSettled();
  expect(lease?.live).toBe(false);
  expect(topMql.listenersCount()).toBe(0);
  topMql.dispatchChange(true);
  expect(store._runtime!.pendingWorkCount).toBe(0);
  expect(errors.some(call => call.some(value => value === failure))).toBe(true);
  node.remove();
  store.destroy();
});

it('unsupported documents and failed listener acquisition publish no preference resource', async () => {
  const diagnostics: unknown[] = [];
  const scope = new ResourceScope({ onCleanupError: error => diagnostics.push(error) });
  const preferences = createDocumentPreferences(options => scope.createRecord(options), error => diagnostics.push(error));
  const detached = document.implementation.createHTMLDocument('detached');
  const detachedNode = detached.createElement('div');
  const absentNode = { ownerDocument: { defaultView: {} } } as unknown as Node;
  const queryFailure = new Error('query failed');
  const throwingNode = { ownerDocument: { defaultView: { matchMedia: () => { throw queryFailure; } } } } as unknown as Node;
  let partialListener: (() => void) | undefined;
  const addFailure = new Error('add failed');
  const remove = vi.fn((_event: string, listener: () => void) => { if (partialListener === listener) partialListener = undefined; });
  const addThrowNode = { ownerDocument: { defaultView: { matchMedia: () => ({
    matches: false,
    addEventListener(_event: string, listener: () => void) { partialListener = listener; throw addFailure; },
    removeEventListener: remove
  }) } } } as unknown as Node;

  for (const node of [detachedNode, absentNode, throwingNode, addThrowNode]) {
    expect(preferences.reduced([node])).toBe(false);
    preferences.watch([node], () => {});
  }
  await Promise.resolve();
  expect(scope.size).toBe(0);
  expect(partialListener).toBeUndefined();
  expect(remove).toHaveBeenCalledTimes(1);
  expect(diagnostics).toContain(queryFailure);
  expect(diagnostics).toContain(addFailure);
  // reduced() and watch() are two explicit connection attempts; each failed
  // matchMedia call is diagnosed exactly once.
  expect(diagnostics.filter(error => error === queryFailure)).toHaveLength(2);
  preferences.dispose();
  scope.dispose();
});

it('remove failure and async subscriber rejection are diagnosed without blocking peer delivery', async () => {
  const diagnostics: unknown[] = [];
  const asyncFailure = new Error('async subscriber failed');
  const removeFailure = new Error('remove failed');
  let listener!: () => void;
  let matches = false;
  const media = {
    get matches() { return matches; },
    addEventListener: vi.fn((_event: string, value: () => void) => { listener = value; }),
    removeEventListener: vi.fn(() => { throw removeFailure; })
  };
  const node = { ownerDocument: { defaultView: { matchMedia: () => media } } } as unknown as Node;
  const scope = new ResourceScope({ onCleanupError: error => diagnostics.push(error) });
  const preferences = createDocumentPreferences(options => scope.createRecord(options), error => diagnostics.push(error));
  let peerCalls = 0;
  const first = preferences.watch([node], (() => Promise.reject(asyncFailure)) as unknown as () => void);
  const second = preferences.watch([node], () => { peerCalls++; });
  expect(scope.size).toBe(1);
  matches = true;
  listener();
  await Promise.resolve();
  await Promise.resolve();
  expect(peerCalls).toBe(1);
  expect(diagnostics).toContain(asyncFailure);
  first();
  second();
  await scope.whenCleanupsSettled();
  expect(scope.size).toBe(0);
  expect(diagnostics).toContain(removeFailure);
  preferences.dispose();
  scope.dispose();
});

it('buffers a synchronous false-to-true registration-hook event until subscriber ownership is published', async () => {
  let matches = false;
  let listener!: () => void;
  const media = {
    get matches() { return matches; },
    addEventListener: vi.fn((_event: string, value: () => void) => { listener = value; }),
    removeEventListener: vi.fn()
  };
  const node = { ownerDocument: { defaultView: { matchMedia: () => media } } } as unknown as Node;
  const scope = new ResourceScope();
  const preferences = createDocumentPreferences(options => {
    matches = true;
    listener();
    return scope.createRecord(options);
  }, () => {});
  let delivered = 0;
  const cleanup = preferences.watch([node], () => { delivered++; });
  expect(delivered).toBe(1);
  expect(scope.size).toBe(1);
  cleanup();
  await scope.whenCleanupsSettled();
  expect(media.removeEventListener).toHaveBeenCalledTimes(1);
  preferences.dispose();
  scope.dispose();
});

it('a ResourceScope registration observer reentrant watch joins the provisional entry and stays subscribed', async () => {
  let matches = false;
  const listeners = new Set<() => void>();
  const media = {
    get matches() { return matches; },
    addEventListener: vi.fn((_event: string, listener: () => void) => { listeners.add(listener); }),
    removeEventListener: vi.fn((_event: string, listener: () => void) => { listeners.delete(listener); })
  };
  const node = { ownerDocument: { defaultView: { matchMedia: () => media } } } as unknown as Node;
  let preferences!: ReturnType<typeof createDocumentPreferences>;
  let nestedCleanup: (() => void) | undefined;
  let nestedCalls = 0;
  let enter = true;
  const scope = new ResourceScope({
    onRegistered: record => {
      if (enter && record.description === 'Document motion preference') {
        enter = false;
        nestedCleanup = preferences.watch([node], () => { nestedCalls++; });
      }
    }
  });
  preferences = createDocumentPreferences(options => scope.createRecord(options), () => {});
  let outerCalls = 0;
  const outerCleanup = preferences.watch([node], () => { outerCalls++; });
  expect(media.addEventListener).toHaveBeenCalledTimes(1);
  expect(listeners.size).toBe(1);
  expect(scope.size).toBe(1);
  matches = true;
  for (const listener of [...listeners]) listener();
  expect(outerCalls).toBe(1);
  expect(nestedCalls).toBe(1);
  outerCleanup();
  expect(listeners.size).toBe(1);
  nestedCleanup?.();
  await scope.whenCleanupsSettled();
  expect(listeners.size).toBe(0);
  expect(media.removeEventListener).toHaveBeenCalledTimes(1);
  preferences.dispose();
  scope.dispose();
});

it('rechecks binding liveness when the injected initial preference read retires its owner', async () => {
  const { store, claim } = createFixture();
  const node = document.createElement('div');
  document.body.appendChild(node);
  const binding = claim.registry.bind(claim.registry.rootOwner, [{ name: 'retire', node, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'retire', priority: 1 });
  let executeCalls = 0;
  topMatchMediaSpy.mockImplementation(() => {
    claim.release();
    return topMql as unknown as MediaQueryList;
  });
  expect(() => binding.start({ deadlineMs: 500, execute: () => { executeCalls++; }, stable: () => {} })).toThrow(/live motion binding/i);
  expect(executeCalls).toBe(0);
  await store._runtime!.whenCleanupsSettled();
  expect(topMql.listenersCount()).toBe(0);
  expect(store._runtime!.pendingWorkCount).toBe(0);
  node.remove();
  store.destroy();
});

it('uses the post-acquisition state and delivers one owned initial reduction', async () => {
  let matches = false;
  const listeners = new Set<() => void>();
  const media = {
    get matches() { return matches; },
    addEventListener: vi.fn((_event: string, listener: () => void) => {
      listeners.add(listener);
      matches = true;
    }),
    removeEventListener: vi.fn((_event: string, listener: () => void) => listeners.delete(listener))
  };
  const node = { ownerDocument: { defaultView: { matchMedia: () => media } } } as unknown as Node;
  const scope = new ResourceScope();
  const preferences = createDocumentPreferences(options => scope.createRecord(options), () => {});
  let deliveries = 0;
  let ownedDuringDelivery = false;
  const cleanup = preferences.watch([node], () => {
    deliveries++;
    ownedDuringDelivery = scope.size === 1 && listeners.size === 1;
  });
  expect(deliveries).toBe(1);
  expect(ownedDuringDelivery).toBe(true);
  cleanup();
  await scope.whenCleanupsSettled();
  expect(media.removeEventListener).toHaveBeenCalledTimes(1);
  preferences.dispose();
  scope.dispose();
});

it('rolls back a throwing registration and lets a later watch reacquire', async () => {
  const diagnostics: unknown[] = [];
  const failure = new Error('register failed');
  const media = createMqlStub(true);
  const node = { ownerDocument: { defaultView: { matchMedia: () => media } } } as unknown as Node;
  const scope = new ResourceScope();
  let attempts = 0;
  const preferences = createDocumentPreferences(options => {
    if (++attempts === 1) throw failure;
    return scope.createRecord(options);
  }, error => diagnostics.push(error));
  let first = 0;
  const failedCleanup = preferences.watch([node], () => { first++; });
  expect(first).toBe(0);
  expect(media.listenersCount()).toBe(0);
  expect(media.removeEventListener).toHaveBeenCalledTimes(1);
  expect(scope.size).toBe(0);
  failedCleanup();
  let second = 0;
  const cleanup = preferences.watch([node], () => { second++; });
  expect(second).toBe(1);
  expect(media.addEventListener).toHaveBeenCalledTimes(2);
  expect(media.listenersCount()).toBe(1);
  expect(diagnostics).toContain(failure);
  cleanup();
  await scope.whenCleanupsSettled();
  expect(media.removeEventListener).toHaveBeenCalledTimes(2);
  preferences.dispose();
  scope.dispose();
});

it('rejects an already-dead registration record without delivery or publication', async () => {
  const media = createMqlStub(true);
  const node = { ownerDocument: { defaultView: { matchMedia: () => media } } } as unknown as Node;
  const scope = new ResourceScope();
  const preferences = createDocumentPreferences(options => {
    const record = scope.createRecord(options);
    record.dispose();
    return record;
  }, () => {});
  let deliveries = 0;
  const cleanup = preferences.watch([node], () => { deliveries++; });
  expect(deliveries).toBe(0);
  expect(media.listenersCount()).toBe(0);
  expect(media.removeEventListener).toHaveBeenCalledTimes(1);
  expect(scope.size).toBe(0);
  cleanup();
  preferences.dispose();
  scope.dispose();
});

it('dispose during registration retires the provisional connection before initial delivery', async () => {
  const media = createMqlStub(true);
  const node = { ownerDocument: { defaultView: { matchMedia: () => media } } } as unknown as Node;
  let preferences!: ReturnType<typeof createDocumentPreferences>;
  const scope = new ResourceScope({
    onRegistered: record => {
      if (record.description === 'Document motion preference') preferences.dispose();
    }
  });
  preferences = createDocumentPreferences(options => scope.createRecord(options), () => {});
  let deliveries = 0;
  const cleanup = preferences.watch([node], () => { deliveries++; });
  expect(deliveries).toBe(0);
  expect(media.listenersCount()).toBe(0);
  expect(media.removeEventListener).toHaveBeenCalledTimes(1);
  expect(scope.size).toBe(0);
  cleanup();
  scope.dispose();
});

it('an immediately cleaned nested registration watch leaves the outer subscriber as sole owner', async () => {
  const media = createMqlStub(false);
  const node = { ownerDocument: { defaultView: { matchMedia: () => media } } } as unknown as Node;
  let preferences!: ReturnType<typeof createDocumentPreferences>;
  let nestedCalls = 0;
  let enter = true;
  const scope = new ResourceScope({
    onRegistered: record => {
      if (enter && record.description === 'Document motion preference') {
        enter = false;
        preferences.watch([node], () => { nestedCalls++; })();
      }
    }
  });
  preferences = createDocumentPreferences(options => scope.createRecord(options), () => {});
  let outerCalls = 0;
  const outerCleanup = preferences.watch([node], () => { outerCalls++; });
  expect(media.listenersCount()).toBe(1);
  media.dispatchChange(true);
  expect(nestedCalls).toBe(0);
  expect(outerCalls).toBe(1);
  outerCleanup();
  await scope.whenCleanupsSettled();
  expect(media.removeEventListener).toHaveBeenCalledTimes(1);
  preferences.dispose();
  scope.dispose();
});

it('a nested provisional watch becomes inert when registration fails', () => {
  const diagnostics: unknown[] = [];
  const failure = new Error('registration failed after nested watch');
  const media = createMqlStub(false);
  const node = { ownerDocument: { defaultView: { matchMedia: () => media } } } as unknown as Node;
  let preferences!: ReturnType<typeof createDocumentPreferences>;
  let nestedCleanup: (() => void) | undefined;
  let nestedCalls = 0;
  let enter = true;
  preferences = createDocumentPreferences(() => {
    if (enter) {
      enter = false;
      nestedCleanup = preferences.watch([node], () => { nestedCalls++; });
    }
    throw failure;
  }, error => diagnostics.push(error));
  let outerCalls = 0;
  const outerCleanup = preferences.watch([node], () => { outerCalls++; });
  expect(media.listenersCount()).toBe(0);
  expect(media.removeEventListener).toHaveBeenCalledTimes(1);
  media.dispatchChange(true);
  expect(outerCalls).toBe(0);
  expect(nestedCalls).toBe(0);
  expect(() => nestedCleanup?.()).not.toThrow();
  expect(() => outerCleanup()).not.toThrow();
  expect(diagnostics).toContain(failure);
  preferences.dispose();
});

it('a synchronously throwing subscriber does not block a later peer', () => {
  const diagnostics: unknown[] = [];
  const failure = new Error('sync subscriber failed');
  const media = createMqlStub(false);
  const node = { ownerDocument: { defaultView: { matchMedia: () => media } } } as unknown as Node;
  const scope = new ResourceScope();
  const preferences = createDocumentPreferences(options => scope.createRecord(options), error => diagnostics.push(error));
  const first = preferences.watch([node], () => { throw failure; });
  let peerCalls = 0;
  const second = preferences.watch([node], () => { peerCalls++; });
  media.dispatchChange(true);
  expect(peerCalls).toBe(1);
  expect(diagnostics).toContain(failure);
  first();second();preferences.dispose();scope.dispose();
});

it('dispose reclaims an unreleased direct watch and silences later events', async () => {
  const media = createMqlStub(false);
  const node = { ownerDocument: { defaultView: { matchMedia: () => media } } } as unknown as Node;
  const scope = new ResourceScope();
  const preferences = createDocumentPreferences(options => scope.createRecord(options), () => {});
  let deliveries = 0;
  preferences.watch([node], () => { deliveries++; });
  expect(media.listenersCount()).toBe(1);
  preferences.dispose();
  await scope.whenCleanupsSettled();
  expect(media.listenersCount()).toBe(0);
  expect(media.removeEventListener).toHaveBeenCalledTimes(1);
  media.dispatchChange(true);
  expect(deliveries).toBe(0);
  scope.dispose();
});

it('capture uses its iframe document in both opposite top/frame preference directions', async () => {
  const runCase = async (topReduced: boolean, frameReduced: boolean) => {
    topMql = createMqlStub(topReduced);
    iframeMql = createMqlStub(frameReduced);
    const { store, claim } = createFixture();
    const surface = iframeDoc.createElement('div');
    surface.textContent = 'captured iframe surface';
    iframeDoc.body.appendChild(surface);
    const channel = new CaptureChannel(claim.registry);
    const unregister = channel.register({ topReduced, frameReduced }, () => surface);
    try {
      channel.prepare([]);
      channel.rendered();
      await Promise.resolve();
      const frameLayers = [...iframeDoc.body.children].filter(node => node.getAttribute('aria-hidden') === 'true');
      const topLayers = [...document.body.children].filter(node => node.getAttribute('aria-hidden') === 'true');
      expect(topLayers).toHaveLength(0);
      if (frameReduced) {
        expect(frameLayers).toHaveLength(0);
        expect(iframeMql.listenersCount()).toBe(0);
      } else {
        expect(frameLayers).toHaveLength(1);
        expect(frameLayers[0]?.ownerDocument).toBe(iframeDoc);
        expect(iframeMql.listenersCount()).toBe(1);
      }
    } finally {
      unregister();
      channel.dispose();
      claim.release();
      await store._runtime!.whenCleanupsSettled();
      expect(iframeMql.listenersCount()).toBe(0);
      expect(store._runtime!.pendingWorkCount).toBe(0);
      surface.remove();
      store.destroy();
    }
  };
  await runCase(true, false);
  await runCase(false, true);
});

it('preference supersession cancels the injected deterministic scheduler deadline', async () => {
  topMql = createMqlStub(false);
  const scheduler = new DeterministicScheduler();
  const clock = createMotionClock(scheduler);
  const resources = new ResourceScope();
  const observeCleanup = (cleanup: () => void | Promise<void>) => {
    resources.createRecord({ cleanup, description: 'Observed motion cleanup' }).dispose();
  };
  const registry = new TargetRegistry({}, () => true, undefined, {
    clock,
    register: options => resources.createRecord(options),
    observeCleanup
  }, clock);
  registry.attach();
  const node = document.createElement('div');
  document.body.appendChild(node);
  try {
    const binding = registry.bind(registry.rootOwner, [{ name: 'timer', node, properties: ['opacity'], stable: { opacity: '1' } }], { channel: 'timer', priority: 1 });
    const predecessor = binding.start({ deadlineMs: 1000, execute: () => new Promise<void>(() => {}), stable: () => {} });
    expect(scheduler.pendingTimersCount).toBe(1);
    topMql.dispatchChange(true);
    expect((await predecessor.settled).outcome).toEqual({ status: 'superseded', reason: 'preferenceChanged' });
    expect((await binding.current!.settled).outcome).toEqual({ status: 'skipped', reason: 'reducedMotion' });
    expect(scheduler.pendingTimersCount).toBe(0);
    expect(scheduler.pendingFramesCount).toBe(0);
    binding.release();
  } finally {
    registry.dispose();
    await resources.whenCleanupsSettled();
    expect(resources.size).toBe(0);
    node.remove();
  }
});
