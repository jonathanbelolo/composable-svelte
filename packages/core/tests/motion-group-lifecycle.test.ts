// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const planning = vi.hoisted(() => ({ requests: [] as Array<{ availableTargets?: readonly string[] | undefined }> }));

vi.mock('../src/lib/application/motion/playback-plan.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/application/motion/playback-plan.js')>();
  return {
    ...actual,
    planPlayback: (recipe: Parameters<typeof actual.planPlayback>[0], request: Parameters<typeof actual.planPlayback>[1]) => {
      planning.requests.push(request);
      return actual.planPlayback(recipe, request);
    },
  };
});

import { defineMotionRecipe, type TargetSchema } from '../src/lib/application/motion/compiler.js';
import {
  createMotionSetLifecycle,
  type MotionSetLifecycle,
  type MotionPresentEntry,
} from '../src/lib/application/renderer/motion-lifecycle.js';
import { createMotionPlayback } from '../src/lib/application/renderer/motion-playback.js';
import { TargetRegistry, type RootTargetResources } from '../src/lib/application/renderer/target-registry.js';
import type { PlaybackDecision } from '../src/lib/application/motion/playback-plan.js';
import type { MotionClock, MotionRun } from '../src/lib/application/renderer/motion-run.js';
import { ResourceScope, safeCleanup, type CleanupFunction, type ResourceRecordOptions } from '../src/lib/execution/resources.js';

const clock: MotionClock = { schedule: () => () => {} };

function rig() {
  const resources = new ResourceScope();
  const root: RootTargetResources = {
    clock,
    register: (options: Omit<ResourceRecordOptions, 'ownerToken'>) => resources.createRecord(options),
    observeCleanup: (cleanup: CleanupFunction) => { void safeCleanup(cleanup); },
  };
  const registry = new TargetRegistry({}, () => true, undefined, root, clock);
  return { registry, resources };
}

function groupRecipe(optionalTitle = false, channel = 'group') {
  return defineMotionRecipe({
    targets: {
      surface: { properties: ['opacity'] },
      title: { properties: ['opacity'], optional: optionalTitle },
      badge: { properties: ['opacity'], optional: true },
    },
    states: {
      off: { surface: { opacity: 0 }, title: { opacity: 0 }, badge: { opacity: 0 } },
      on: { surface: { opacity: 1 }, title: { opacity: 1 }, badge: { opacity: 1 } },
    },
    graph: {
      kind: 'sequence',
      steps: [
        { kind: 'track', target: 'surface', properties: ['opacity'], channel },
        { kind: 'track', target: 'title', properties: ['opacity'], channel },
        { kind: 'track', target: 'badge', properties: ['opacity'], channel },
      ],
    },
    interruption: 'replace',
  });
}

function tracklessPresentRecipe() {
  return defineMotionRecipe({
    targets: {
      surface: { properties: ['opacity'], optional: true },
      title: { properties: ['opacity'], optional: true },
    },
    states: {
      off: { surface: { opacity: 0 }, title: { opacity: 0 } },
      on: { surface: { opacity: 1 }, title: { opacity: 1 } },
    },
    graph: { kind: 'track', target: 'title', properties: ['opacity'], channel: 'group' },
    interruption: 'replace',
  });
}

function playbackRecorder(decisions: PlaybackDecision<TargetSchema>[]) {
  const createPlayback: typeof createMotionPlayback = () => ({
    request<T extends TargetSchema>(decision: PlaybackDecision<T>): MotionRun | undefined {
      decisions.push(decision as PlaybackDecision<TargetSchema>);
      return undefined;
    },
    diagnostics: Object.freeze([]),
  });
  return createPlayback;
}

beforeEach(() => {
  planning.requests.length = 0;
});

describe('shared motion set lifecycle', () => {
  it('fixes policy over the declared selection before presence and keeps exact declared styles', () => {
    let reads = 0;
    const mixed = defineMotionRecipe({
      targets: { surface: { properties: ['opacity'] }, title: { properties: ['opacity'] } },
      states: {
        off: { surface: { opacity: 0 }, title: { opacity: 0 } },
        on: { surface: { opacity: 1 }, title: { opacity: 1 } },
      },
      graph: {
        kind: 'sequence',
        steps: [
          { kind: 'track', target: 'surface', properties: ['opacity'], channel: 'a' },
          { kind: 'track', target: 'title', properties: ['opacity'], channel: 'b' },
        ],
      },
      interruption: 'replace',
    });
    expect(() => createMotionSetLifecycle(mixed, ['surface', 'title'], {
      initial: 'off', read: () => { reads++; return 'off'; }, registry: undefined, owner: undefined,
    })).toThrow(/^Conflicting motion binding policies/);
    expect(reads).toBe(0);

    const lifecycle = createMotionSetLifecycle(groupRecipe(false, 'x'.repeat(128)), ['surface', 'badge'], {
      initial: 'off', read: () => 'off', registry: undefined, owner: undefined,
    });
    expect(lifecycle.styles).toEqual({ surface: 'opacity:0', badge: 'opacity:0' });
    expect(Object.isFrozen(lifecycle.styles)).toBe(true);
    expect(() => createMotionSetLifecycle(groupRecipe(false, 'x'.repeat(129)), ['surface', 'badge'], {
      initial: 'off', read: () => 'off', registry: undefined, owner: undefined,
    })).toThrow('Motion binding channel exceeds 128 characters');
  });

  it('binds a physical subset in declared order and reuses one frozen availability array', () => {
    const { registry, resources } = rig();
    registry.attach();
    const bind = vi.spyOn(registry, 'bind');
    const decisions: PlaybackDecision<TargetSchema>[] = [];
    const lifecycle = createMotionSetLifecycle(groupRecipe(true), ['surface', 'title', 'badge'], {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner,
      createPlayback: playbackRecorder(decisions),
    });
    lifecycle.reconcile([
      { name: 'badge', node: document.createElement('i'), token: {} },
      { name: 'surface', node: document.createElement('div'), token: {} },
    ]);
    lifecycle.update('on');
    lifecycle.update('off');

    expect(bind.mock.calls[0]?.[1].map((entry) => entry.name)).toEqual(['surface', 'badge']);
    expect(planning.requests).toHaveLength(2);
    expect(planning.requests[0]?.availableTargets).toEqual(['surface', 'badge']);
    expect(planning.requests[1]?.availableTargets).toBe(planning.requests[0]?.availableTargets);
    expect(Object.isFrozen(planning.requests[0]?.availableTargets)).toBe(true);
    lifecycle.destroy(); registry.dispose(); resources.dispose();
  });

  it('captures hostile entry fields once and makes an identical token snapshot a true no-op', () => {
    const { registry, resources } = rig();
    registry.attach();
    const bind = vi.spyOn(registry, 'bind');
    let reads = 0;
    let adapters = 0;
    const node = document.createElement('div');
    const token = {};
    const counts = { name: 0, node: 0, token: 0 };
    const entry = Object.defineProperties({}, {
      name: { enumerable: true, get: () => { counts.name++; return 'surface'; } },
      node: { enumerable: true, get: () => { counts.node++; return node; } },
      token: { enumerable: true, get: () => { counts.token++; return token; } },
    }) as MotionPresentEntry<ReturnType<typeof groupRecipe>['targets'], 'surface'>;
    const lifecycle = createMotionSetLifecycle(groupRecipe(), ['surface'], {
      initial: 'off', read: () => { reads++; return 'off'; }, registry, owner: registry.rootOwner,
      createPlayback: () => { adapters++; return { request: () => undefined, diagnostics: Object.freeze([]) }; },
    });

    lifecycle.reconcile([entry]);
    lifecycle.reconcile([{ name: 'surface', node, token }]);
    expect(counts).toEqual({ name: 1, node: 1, token: 1 });
    expect(reads).toBe(1);
    expect(bind).toHaveBeenCalledTimes(1);
    expect(adapters).toBe(1);
    lifecycle.destroy(); registry.dispose(); resources.dispose();
  });

  it('keeps an empty physical set authority-free and retires a live pair synchronously once', () => {
    const { registry, resources } = rig();
    registry.attach();
    const bind = vi.spyOn(registry, 'bind');
    let reads = 0;
    let adapters = 0;
    const lifecycle = createMotionSetLifecycle(groupRecipe(), ['surface'], {
      initial: 'off', read: () => { reads++; return 'off'; }, registry, owner: registry.rootOwner,
      createPlayback: () => { adapters++; return { request: () => undefined, diagnostics: Object.freeze([]) }; },
    });
    lifecycle.reconcile([]);
    lifecycle.update('on');
    expect(reads).toBe(0);
    expect(bind).not.toHaveBeenCalled();
    expect(adapters).toBe(0);
    expect(planning.requests[0]?.availableTargets).toEqual([]);

    lifecycle.reconcile([{ name: 'surface', node: document.createElement('div'), token: {} }]);
    const binding = bind.mock.results[0]?.value;
    const release = vi.spyOn(binding!, 'release');
    lifecycle.topologyChanged();
    expect(release).toHaveBeenCalledTimes(1);
    expect(lifecycle.phase).toBe('idle');
    lifecycle.topologyChanged();
    lifecycle.reconcile([]);
    expect(release).toHaveBeenCalledTimes(1);
    lifecycle.destroy(); registry.dispose(); resources.dispose();
  });

  it('binds a physically present trackless target and routes all-optional-skipped through its adapter', () => {
    const { registry, resources } = rig();
    registry.attach();
    const decisions: PlaybackDecision<TargetSchema>[] = [];
    const createPlayback = vi.fn(playbackRecorder(decisions));
    const lifecycle = createMotionSetLifecycle(tracklessPresentRecipe(), ['surface', 'title'], {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner, createPlayback,
    });
    lifecycle.reconcile([{ name: 'surface', node: document.createElement('div'), token: {} }]);
    lifecycle.update('on');
    expect(createPlayback).toHaveBeenCalledTimes(1);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ kind: 'stable-only', reason: 'all-optional-skipped' });
    expect(Object.keys(decisions[0]!.publishable)).toEqual(['surface']);

    const empty = createMotionSetLifecycle(tracklessPresentRecipe(), ['surface', 'title'], {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner,
      createPlayback: () => { throw new Error('empty physical set must not create playback'); },
    });
    empty.update('on');
    expect(empty.diagnostics.some((entry) => entry.kind === 'lifecycle' && entry.code === 'unbound-update' && entry.name === 'all-optional-skipped')).toBe(true);
    lifecycle.destroy(); empty.destroy(); registry.dispose(); resources.dispose();
  });

  it('routes a missing-required subset through the existing adapter', () => {
    const { registry, resources } = rig();
    registry.attach();
    const decisions: PlaybackDecision<TargetSchema>[] = [];
    const lifecycle = createMotionSetLifecycle(groupRecipe(false), ['surface', 'title'], {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner,
      createPlayback: playbackRecorder(decisions),
    });
    lifecycle.reconcile([{ name: 'surface', node: document.createElement('div'), token: {} }]);
    lifecycle.update('on');
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ kind: 'stable-only', reason: 'missing-required' });
    expect(Object.keys(decisions[0]!.publishable)).toEqual(['surface']);

    const optionalDecisions: PlaybackDecision<TargetSchema>[] = [];
    const optional = createMotionSetLifecycle(groupRecipe(true), ['surface', 'title'], {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner,
      createPlayback: playbackRecorder(optionalDecisions),
    });
    optional.reconcile([{ name: 'surface', node: document.createElement('div'), token: {} }]);
    optional.update('on');
    expect(optionalDecisions[0]?.kind).toBe('play');
    expect(Object.keys(optionalDecisions[0]!.publishable)).toEqual(['surface']);
    lifecycle.destroy(); optional.destroy(); registry.dispose(); resources.dispose();
  });

  it('retires before replacement and adopts latest state without an entrance request', () => {
    const { registry, resources } = rig();
    registry.attach();
    const bind = vi.spyOn(registry, 'bind');
    let state: 'off' | 'on' = 'off';
    let requests = 0;
    const lifecycle = createMotionSetLifecycle(groupRecipe(), ['surface'], {
      initial: state, read: () => state, registry, owner: registry.rootOwner,
      createPlayback: () => ({ request: () => { requests++; return undefined; }, diagnostics: Object.freeze([]) }),
    });
    const first = document.createElement('div');
    lifecycle.reconcile([{ name: 'surface', node: first, token: {} }]);
    const release = vi.spyOn(bind.mock.results[0]!.value, 'release');
    state = 'on';
    lifecycle.topologyChanged();
    expect(release).toHaveBeenCalledTimes(1);
    const second = document.createElement('div');
    lifecycle.reconcile([{ name: 'surface', node: second, token: {} }]);
    expect(second.style.opacity).toBe('1');
    expect(requests).toBe(0);
    expect(bind).toHaveBeenCalledTimes(2);
    lifecycle.destroy(); registry.dispose(); resources.dispose();
  });

  it('invalidates stale reconciliation during the latest-state getter', () => {
    const { registry, resources } = rig();
    registry.attach();
    const bind = vi.spyOn(registry, 'bind');
    let lifecycle!: MotionSetLifecycle<ReturnType<typeof groupRecipe>['targets'], 'off' | 'on', 'surface'>;
    lifecycle = createMotionSetLifecycle(groupRecipe(), ['surface'], {
      initial: 'off',
      read: () => { lifecycle.topologyChanged(); return 'on'; },
      registry,
      owner: registry.rootOwner,
    });
    lifecycle.reconcile([{ name: 'surface', node: document.createElement('div'), token: {} }]);
    expect(bind).not.toHaveBeenCalled();
    expect(lifecycle.phase).toBe('idle');
    lifecycle.destroy(); registry.dispose(); resources.dispose();
  });

  it('releases authority acquired by a reconciliation invalidated during bind', () => {
    const { registry, resources } = rig();
    registry.attach();
    const bind = registry.bind.bind(registry);
    let acquired: ReturnType<TargetRegistry['bind']> | undefined;
    let lifecycle!: MotionSetLifecycle<ReturnType<typeof groupRecipe>['targets'], 'off' | 'on', 'surface'>;
    const bindSpy = vi.spyOn(registry, 'bind').mockImplementation((...input) => {
      acquired = bind(...input);
      lifecycle.topologyChanged();
      return acquired;
    });
    let adapters = 0;
    lifecycle = createMotionSetLifecycle(groupRecipe(), ['surface'], {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner,
      createPlayback: () => { adapters++; return { request: () => undefined, diagnostics: Object.freeze([]) }; },
    });
    lifecycle.reconcile([{ name: 'surface', node: document.createElement('div'), token: {} }]);
    expect(bindSpy).toHaveBeenCalledTimes(1);
    expect(acquired?.live).toBe(false);
    expect(adapters).toBe(0);
    expect(lifecycle.phase).toBe('idle');
    lifecycle.destroy(); registry.dispose(); resources.dispose();
  });

  it('releases authority acquired by a reconciliation invalidated during adapter construction', () => {
    const { registry, resources } = rig();
    registry.attach();
    let lifecycle!: MotionSetLifecycle<ReturnType<typeof groupRecipe>['targets'], 'off' | 'on', 'surface'>;
    let releaseCalls = 0;
    lifecycle = createMotionSetLifecycle(groupRecipe(), ['surface'], {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner,
      createPlayback: (binding) => {
        const release = binding.release.bind(binding);
        vi.spyOn(binding, 'release').mockImplementation(() => { releaseCalls++; release(); });
        lifecycle.topologyChanged();
        return { request: () => undefined, diagnostics: Object.freeze([]) };
      },
    });
    lifecycle.reconcile([{ name: 'surface', node: document.createElement('div'), token: {} }]);
    expect(releaseCalls).toBe(1);
    expect(lifecycle.phase).toBe('idle');
    lifecycle.destroy(); registry.dispose(); resources.dispose();
  });

  it('keeps cleanup-enrollment reentrancy from reviving the retired pair', () => {
    const { registry, resources } = rig();
    registry.attach();
    const bind = registry.bind.bind(registry);
    let lifecycle!: MotionSetLifecycle<ReturnType<typeof groupRecipe>['targets'], 'off' | 'on', 'surface'>;
    let releaseCalls = 0;
    vi.spyOn(registry, 'bind').mockImplementation((...input) => {
      const binding = bind(...input);
      const release = binding.release.bind(binding);
      vi.spyOn(binding, 'release').mockImplementation(() => { releaseCalls++; release(); });
      const enroll = binding.record.addCleanup.bind(binding.record);
      vi.spyOn(binding.record, 'addCleanup').mockImplementation((cleanup) => {
        enroll(cleanup);
        lifecycle.topologyChanged();
      });
      return binding;
    });
    lifecycle = createMotionSetLifecycle(groupRecipe(), ['surface'], {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner,
    });
    lifecycle.reconcile([{ name: 'surface', node: document.createElement('div'), token: {} }]);
    expect(releaseCalls).toBe(1);
    expect(lifecycle.phase).toBe('idle');
    lifecycle.update('on');
    expect(lifecycle.phase).toBe('idle');
    lifecycle.destroy(); registry.dispose(); resources.dispose();
  });

  it('keeps a stale changed snapshot inert after a fresh pair is installed', () => {
    const { registry, resources } = rig();
    registry.attach();
    const bind = vi.spyOn(registry, 'bind');
    const lifecycle = createMotionSetLifecycle(groupRecipe(), ['surface'], {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner,
    });
    const token = {};
    lifecycle.reconcile([{ name: 'surface', node: document.createElement('div'), token }]);
    lifecycle.reconcile([{ name: 'surface', node: document.createElement('div'), token: {} }]);
    expect(bind).toHaveBeenCalledTimes(1);
    expect(lifecycle.phase).toBe('bound');
    lifecycle.destroy(); registry.dispose(); resources.dispose();
  });

  it('keeps a stale empty snapshot from retiring a healthy installed pair', () => {
    const { registry, resources } = rig();
    registry.attach();
    const bind = vi.spyOn(registry, 'bind');
    const lifecycle = createMotionSetLifecycle(groupRecipe(), ['surface'], {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner,
    });
    lifecycle.reconcile([{ name: 'surface', node: document.createElement('div'), token: {} }]);
    const release = vi.spyOn(bind.mock.results[0]!.value, 'release');
    lifecycle.reconcile([]);
    expect(release).not.toHaveBeenCalled();
    expect(lifecycle.phase).toBe('bound');
    lifecycle.destroy(); registry.dispose(); resources.dispose();
  });

  it('keeps a getter-installed fresh pair when the stale outer snapshot becomes empty', () => {
    const { registry, resources } = rig();
    registry.attach();
    const bind = vi.spyOn(registry, 'bind');
    let lifecycle!: MotionSetLifecycle<ReturnType<typeof groupRecipe>['targets'], 'off' | 'on', 'surface'>;
    const fresh = { name: 'surface' as const, node: document.createElement('div'), token: {} };
    let replaced = false;
    const stale = (node: HTMLElement): MotionPresentEntry<ReturnType<typeof groupRecipe>['targets'], 'surface'> =>
      Object.defineProperties({}, {
        name: { enumerable: true, get: () => {
          if (!replaced) {
            replaced = true;
            lifecycle.topologyChanged();
            lifecycle.reconcile([fresh]);
          }
          return 'surface';
        } },
        node: { enumerable: true, get: () => node },
        token: { enumerable: true, get: () => ({}) },
      }) as MotionPresentEntry<ReturnType<typeof groupRecipe>['targets'], 'surface'>;
    lifecycle = createMotionSetLifecycle(groupRecipe(), ['surface'], {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner,
    });
    lifecycle.reconcile([stale(document.createElement('div')), stale(document.createElement('div'))]);
    expect(bind).toHaveBeenCalledTimes(1);
    const freshBinding = bind.mock.results[0]!.value;
    const release = vi.spyOn(freshBinding, 'release');
    expect(freshBinding.live).toBe(true);
    expect(lifecycle.phase).toBe('bound');
    lifecycle.update('on');
    expect(release).not.toHaveBeenCalled();
    lifecycle.destroy(); registry.dispose(); resources.dispose();
  });

  it('contains duplicate and unknown physical names before authority acquisition', () => {
    const { registry, resources } = rig();
    registry.attach();
    const bind = vi.spyOn(registry, 'bind');
    const lifecycle = createMotionSetLifecycle(groupRecipe(), ['surface'], {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner,
    });
    lifecycle.reconcile([
      { name: 'surface', node: document.createElement('div'), token: {} },
      { name: 'surface', node: document.createElement('div'), token: {} },
    ]);
    expect(bind).not.toHaveBeenCalled();
    expect(lifecycle.diagnostics).toContainEqual(expect.objectContaining({
      kind: 'lifecycle',
      code: 'duplicate-attachment',
      message: 'A duplicate live target name was excluded from motion reconciliation',
    }));
    expect(() => Reflect.apply(lifecycle.reconcile, lifecycle, [[
      { name: 'title', node: document.createElement('div'), token: {} },
    ]])).toThrow('Unknown motion target title');
    expect(bind).not.toHaveBeenCalled();
    lifecycle.destroy(); registry.dispose(); resources.dispose();
  });

  it('drops the whole pair on owner cleanup without a second release', () => {
    const { registry, resources } = rig();
    registry.attach();
    const bind = vi.spyOn(registry, 'bind');
    const lifecycle = createMotionSetLifecycle(groupRecipe(), ['surface', 'title'], {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner,
    });
    lifecycle.reconcile([
      { name: 'surface', node: document.createElement('div'), token: {} },
      { name: 'title', node: document.createElement('h1'), token: {} },
    ]);
    const release = vi.spyOn(bind.mock.results[0]!.value, 'release');
    resources.dispose();
    expect(lifecycle.phase).toBe('displaced');
    lifecycle.destroy();
    expect(release).not.toHaveBeenCalled();
    registry.dispose();
  });
});
