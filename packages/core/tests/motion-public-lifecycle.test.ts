// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { defineMotionRecipe, type TargetSchema } from '../src/lib/application/motion/compiler.js';
import { createMotionLifecycle } from '../src/lib/application/renderer/motion-lifecycle.js';
import { TargetRegistry, type MotionBinding, type RootTargetResources } from '../src/lib/application/renderer/target-registry.js';
import type { MotionClock, MotionRun } from '../src/lib/application/renderer/motion-run.js';
import { createMotionPlayback } from '../src/lib/application/renderer/motion-playback.js';
import type { PlaybackDecision } from '../src/lib/application/motion/playback-plan.js';
import { rendererOwner } from '../src/lib/application/renderer/owner.js';
import { createDeterministicScheduler } from '../src/lib/execution/scheduler.js';
import { createStore } from '../src/lib/store.svelte.js';
import { integrate } from '../src/lib/navigation/integrate.js';
import { Effect } from '../src/lib/effect.js';
import type { Reducer } from '../src/lib/types.js';
import { ResourceScope, safeCleanup, type CleanupFunction, type ResourceRecordOptions } from '../src/lib/execution/resources.js';
import { readFileSync } from 'node:fs';

const clock: MotionClock = {
  schedule(_delayMs: number, _callback: () => void): CleanupFunction {
    return () => {};
  },
};

function recipe(channel = 'default') {
  return defineMotionRecipe({
    targets: { box: { properties: ['opacity'] } },
    states: { off: { box: { opacity: 0 } }, on: { box: { opacity: 1 } } },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], channel },
    interruption: 'replace',
  });
}

function registryRig() {
  const resources = new ResourceScope();
  const rootResources: RootTargetResources = {
    clock,
    register: (options: Omit<ResourceRecordOptions, 'ownerToken'>) => resources.createRecord(options),
    observeCleanup: (cleanup: CleanupFunction) => {
      void safeCleanup(cleanup);
    },
  };
  const registry = new TargetRegistry({}, () => true, undefined, rootResources, clock);
  return { registry, resources };
}

describe('public motion lifecycle pure creation and attachment', () => {
  it('keeps motion authority in the private lifecycle and exposes only the dedicated subpath', () => {
    const lifecycle = readFileSync('src/lib/application/renderer/motion-lifecycle.ts', 'utf8');
    const motionPublic = readFileSync('src/lib/application/motion-public.ts', 'utf8');
    const motionGroup = readFileSync('src/lib/application/use-motion-group.svelte.ts', 'utf8');
    const application = readFileSync('src/lib/application/index.ts', 'utf8');
    const root = readFileSync('src/lib/index.ts', 'utf8');
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { exports: Record<string, unknown> };

    expect(lifecycle.match(/registry\.bind\(/g)).toHaveLength(1);
    expect(lifecycle.match(/createMotionPlayback\(/g)).toHaveLength(1);
    expect(motionGroup.match(/createMotionSetLifecycle<T, S, N, keyof T & string>\(/g)).toHaveLength(1);
    const stable = motionGroup.indexOf('stableProjection(recipe, initial)');
    const policy = motionGroup.indexOf('bindingPolicy(recipe, declared)');
    const context = motionGroup.indexOf('BROWSER ? useRegistry() : optionalRegistry()');
    const controller = motionGroup.indexOf('createMotionSetLifecycle<T, S, N, keyof T & string>(');
    expect(stable).toBeGreaterThan(-1);
    expect(policy).toBeGreaterThan(stable);
    expect(context).toBeGreaterThan(policy);
    expect(controller).toBeGreaterThan(context);
    expect(motionPublic).toContain('useMotionGroup');
    expect(application).not.toContain('MotionElement');
    expect(application).not.toContain('useMotion');
    expect(application).not.toContain('useMotionGroup');
    expect(root).not.toContain('motion-public');
    expect(root).not.toContain('useMotionGroup');
    expect(Object.hasOwn(packageJson.exports, './application/motion')).toBe(true);
  });

  it('uses the caller-captured initial state and reads exactly once per attachment', () => {
    let reads = 0;
    const lifecycle = createMotionLifecycle(recipe(), 'box', {
      initial: 'off',
      read: () => {
        reads++;
        return 'on';
      },
      registry: undefined,
      owner: undefined,
    });

    expect(reads).toBe(0);
    expect(lifecycle.style).toBe('opacity:0');
    lifecycle.attach(document.createElement('div'));
    expect(reads).toBe(1);
    expect(lifecycle.logical).toBe('on');
    expect(lifecycle.committed).toBe('on');
  });

  it('rejects a 129-character channel during pure creation and accepts 128', () => {
    const options = {
      initial: 'off' as const,
      read: () => 'off' as const,
      registry: undefined,
      owner: undefined,
    };
    expect(() => createMotionLifecycle(recipe('x'.repeat(129)), 'box', options)).toThrow(
      'Motion binding channel exceeds 128 characters',
    );
    expect(createMotionLifecycle(recipe('x'.repeat(128)), 'box', options).style).toBe('opacity:0');
  });

  it('rejects mixed policy before any attachment authority is needed', () => {
    const mixed = defineMotionRecipe({
      targets: { box: { properties: ['opacity'] } },
      states: { off: { box: { opacity: 0 } }, on: { box: { opacity: 1 } } },
      graph: {
        kind: 'sequence',
        steps: [
          { kind: 'track', target: 'box', properties: ['opacity'], channel: 'a' },
          { kind: 'track', target: 'box', properties: ['opacity'], channel: 'b' },
        ],
      },
      interruption: 'replace',
    });
    expect(() =>
      createMotionLifecycle(mixed, 'box', {
        initial: 'off',
        read: () => 'off',
        registry: undefined,
        owner: undefined,
      }),
    ).toThrow(/^Conflicting motion binding policies/);
  });

  it('does not acquire from a stale projection when the attachment state read fails', () => {
    const { registry, resources } = registryRig();
    const bind = vi.spyOn(registry, 'bind').mockImplementation(() => {
      throw new Error('bind must not be reached');
    });
    const lifecycle = createMotionLifecycle(recipe(), 'box', {
      initial: 'off',
      read: () => {
        throw new Error('latest state failed');
      },
      registry,
      owner: registry.rootOwner,
    });

    expect(() => lifecycle.attach(document.createElement('div'))).not.toThrow();
    expect(bind).not.toHaveBeenCalled();
    expect(lifecycle.phase).toBe('idle');
    expect(lifecycle.logical).toBe('off');
    expect(lifecycle.committed).toBe('off');
    expect(lifecycle.diagnostics.map((entry) => entry.kind === 'lifecycle' ? entry.code : entry.kind)).toEqual([
      'invalid-state',
    ]);

    lifecycle.destroy();
    registry.dispose();
    resources.dispose();
  });

  it('keeps one binding and adapter across updates and replaces only after releasing the old pair', () => {
    const { registry, resources } = registryRig();
    registry.attach();
    const bind = vi.spyOn(registry, 'bind');
    const bindings: MotionBinding[] = [];
    const releases: ReturnType<typeof vi.fn>[] = [];
    let requests = 0;
    let adapters = 0;
    const createPlayback: typeof createMotionPlayback = (binding) => {
      adapters++;
      bindings.push(binding);
      const release = vi.spyOn(binding, 'release');
      releases.push(release);
      return {
        request<T extends TargetSchema>(_decision: PlaybackDecision<T>): MotionRun | undefined {
          requests++;
          return undefined;
        },
        diagnostics: Object.freeze([]),
      };
    };
    let state: 'off' | 'on' = 'off';
    const lifecycle = createMotionLifecycle(recipe(), 'box', {
      initial: state,
      read: () => state,
      registry,
      owner: registry.rootOwner,
      createPlayback,
    });

    const firstDetach = lifecycle.attach(document.createElement('div'));
    expect(bind).toHaveBeenCalledTimes(1);
    expect(adapters).toBe(1);
    expect(requests).toBe(0);

    lifecycle.update('on');
    expect(requests).toBe(1);
    lifecycle.update('on');
    expect(requests).toBe(1);
    expect(bind).toHaveBeenCalledTimes(1);
    expect(adapters).toBe(1);

    state = 'on';
    const secondDetach = lifecycle.attach(document.createElement('div'));
    expect(releases[0]).toHaveBeenCalledTimes(1);
    expect(bind).toHaveBeenCalledTimes(2);
    expect(adapters).toBe(2);
    expect(requests).toBe(1);

    firstDetach();
    expect(releases[1]).not.toHaveBeenCalled();
    secondDetach();
    expect(releases[1]).toHaveBeenCalledTimes(1);
    lifecycle.destroy();
    expect(releases[1]).toHaveBeenCalledTimes(1);
    registry.dispose();
    resources.dispose();
  });

  it('keeps no pair while detached and reattaches by adopting the latest state without entrance', () => {
    const { registry, resources } = registryRig();
    registry.attach();
    const bind = vi.spyOn(registry, 'bind');
    let requests = 0;
    let adapters = 0;
    const createPlayback: typeof createMotionPlayback = () => {
      adapters++;
      return {
        request<T extends TargetSchema>(_decision: PlaybackDecision<T>): MotionRun | undefined {
          requests++;
          return undefined;
        },
        diagnostics: Object.freeze([]),
      };
    };
    let state: 'off' | 'on' = 'off';
    const lifecycle = createMotionLifecycle(recipe(), 'box', {
      initial: state,
      read: () => state,
      registry,
      owner: registry.rootOwner,
      createPlayback,
    });

    const detach = lifecycle.attach(document.createElement('div'));
    detach();
    state = 'on';
    lifecycle.update('on');
    expect(bind).toHaveBeenCalledTimes(1);
    expect(adapters).toBe(1);
    expect(requests).toBe(0);
    expect(lifecycle.phase).toBe('idle');
    expect(lifecycle.diagnostics.some((entry) => entry.kind === 'lifecycle' && entry.code === 'unbound-update')).toBe(true);

    lifecycle.attach(document.createElement('div'));
    expect(bind).toHaveBeenCalledTimes(2);
    expect(adapters).toBe(2);
    expect(requests).toBe(0);
    expect(lifecycle.logical).toBe('on');
    expect(lifecycle.committed).toBe('on');

    lifecycle.destroy();
    registry.dispose();
    resources.dispose();
  });

  it('contains adapter construction and request failures as bounded diagnostics', () => {
    const first = registryRig();
    first.registry.attach();
    const construction = createMotionLifecycle(recipe(), 'box', {
      initial: 'off',
      read: () => 'off',
      registry: first.registry,
      owner: first.registry.rootOwner,
      createPlayback: () => {
        throw new Error('adapter construction');
      },
    });
    expect(() => construction.attach(document.createElement('div'))).not.toThrow();
    expect(construction.phase).toBe('displaced');
    expect(construction.diagnostics.some((entry) => entry.kind === 'lifecycle' && entry.code === 'playback-failed')).toBe(true);
    construction.destroy();
    first.registry.dispose();
    first.resources.dispose();

    const second = registryRig();
    second.registry.attach();
    const requesting = createMotionLifecycle(recipe(), 'box', {
      initial: 'off',
      read: () => 'off',
      registry: second.registry,
      owner: second.registry.rootOwner,
      createPlayback: () => ({
        request(): MotionRun | undefined {
          throw new Error('adapter request');
        },
        diagnostics: Object.freeze([]),
      }),
    });
    requesting.attach(document.createElement('div'));
    expect(() => requesting.update('on')).not.toThrow();
    expect(requesting.logical).toBe('on');
    expect(requesting.committed).toBe('on');
    expect(requesting.diagnostics.some((entry) => entry.kind === 'lifecycle' && entry.code === 'request-failed')).toBe(true);
    requesting.destroy();
    second.registry.dispose();
    second.resources.dispose();
  });

  it('contains an actual binding arbitration failure without displacing the incumbent', () => {
    const { registry, resources } = registryRig();
    registry.attach();
    const node = document.createElement('div');
    const incumbent = registry.bind(
      registry.rootOwner,
      [{ name: 'box', node, properties: ['opacity'], stable: { opacity: '0' } }],
      { channel: 'default', priority: 1 },
    );
    let adapters = 0;
    const lifecycle = createMotionLifecycle(recipe(), 'box', {
      initial: 'off',
      read: () => 'off',
      registry,
      owner: registry.rootOwner,
      createPlayback: () => {
        adapters++;
        return { request: () => undefined, diagnostics: Object.freeze([]) };
      },
    });

    expect(() => lifecycle.attach(node)).not.toThrow();
    expect(lifecycle.phase).toBe('displaced');
    expect(adapters).toBe(0);
    expect(incumbent.live).toBe(true);
    expect(registry.size).toBe(1);
    expect(lifecycle.diagnostics.filter(
      (entry) => entry.kind === 'lifecycle' && entry.code === 'bind-failed',
    )).toHaveLength(1);
    incumbent.stable('box', { opacity: '0.75' });
    expect(node.style.opacity).toBe('0.75');

    lifecycle.destroy();
    incumbent.release();
    registry.dispose();
    resources.dispose();
  });

  it('lets cleanup-triggered reattachment win over the interrupted replacement attach', () => {
    const { registry, resources } = registryRig();
    registry.attach();
    const nodes = [document.createElement('div'), document.createElement('div'), document.createElement('div')];
    const bindings: MotionBinding[] = [];
    const lifecycle = createMotionLifecycle(recipe(), 'box', {
      initial: 'off',
      read: () => 'off',
      registry,
      owner: registry.rootOwner,
      createPlayback: (binding) => {
        bindings.push(binding);
        return { request: () => undefined, diagnostics: Object.freeze([]) };
      },
    });

    lifecycle.attach(nodes[0]!);
    let newestDetach = () => {};
    bindings[0]!.record.addCleanup(() => {
      newestDetach = lifecycle.attach(nodes[2]!);
    });

    const interruptedDetach = lifecycle.attach(nodes[1]!);
    expect(bindings).toHaveLength(2);
    expect(bindings[0]!.live).toBe(false);
    expect(bindings[1]!.live).toBe(true);
    expect(nodes[1]!.style.opacity).toBe('');
    expect(nodes[2]!.style.opacity).toBe('0');
    expect(lifecycle.phase).toBe('bound');

    interruptedDetach();
    expect(bindings[1]!.live).toBe(true);
    expect(lifecycle.phase).toBe('bound');
    newestDetach();
    expect(bindings[1]!.live).toBe(false);
    expect(lifecycle.phase).toBe('idle');

    lifecycle.destroy();
    registry.dispose();
    resources.dispose();
  });

  it('bounds lifecycle diagnostics and records a replaced recipe only once', () => {
    const lifecycle = createMotionLifecycle(recipe(), 'box', {
      initial: 'off',
      read: () => 'off',
      registry: undefined,
      owner: undefined,
    });
    lifecycle.recipeChangeIgnored();
    lifecycle.recipeChangeIgnored();
    for (let index = 0; index < 40; index++) lifecycle.update(`unknown-${index}` as 'off');
    expect(lifecycle.diagnostics).toHaveLength(32);
    expect(lifecycle.diagnostics.filter((entry) => entry.kind === 'lifecycle' && entry.code === 'recipe-change-ignored')).toHaveLength(0);
    expect(lifecycle.diagnostics.every((entry) => entry.kind !== 'lifecycle' || entry.name.length <= 128)).toBe(true);
    expect(lifecycle.diagnostics.every((entry) => entry.kind !== 'lifecycle' || entry.message.length <= 1024)).toBe(true);
  });


  it('does not let an older throwing request overwrite a reentrant newer state', () => {
    const { registry, resources } = registryRig();
    registry.attach();
    let lifecycle!: ReturnType<typeof createMotionLifecycle<ReturnType<typeof recipe>['targets'], 'off' | 'on'>>;
    let requests = 0;
    lifecycle = createMotionLifecycle(recipe(), 'box', {
      initial: 'off',
      read: () => 'off',
      registry,
      owner: registry.rootOwner,
      createPlayback: () => ({
        request<T extends TargetSchema>(_decision: PlaybackDecision<T>): MotionRun | undefined {
          requests++;
          if (requests === 1) {
            lifecycle.update('off');
            throw new Error('older request failed');
          }
          return undefined;
        },
        diagnostics: Object.freeze([]),
      }),
    });
    lifecycle.attach(document.createElement('div'));

    lifecycle.update('on');
    expect(requests).toBe(2);
    expect(lifecycle.logical).toBe('off');
    expect(lifecycle.committed).toBe('off');
    expect(lifecycle.phase).toBe('bound');
    expect(lifecycle.diagnostics.some((entry) => entry.kind === 'lifecycle' && entry.code === 'request-failed')).toBe(true);

    lifecycle.destroy();
    registry.dispose();
    resources.dispose();
  });

  it('does not let an older throwing stable publication overwrite a reentrant newer state', () => {
    const { registry, resources } = registryRig();
    let lifecycle!: ReturnType<typeof createMotionLifecycle<ReturnType<typeof recipe>['targets'], 'off' | 'on'>>;
    let stableCalls = 0;
    lifecycle = createMotionLifecycle(recipe(), 'box', {
      initial: 'off',
      read: () => 'off',
      registry,
      owner: registry.rootOwner,
      createPlayback: (binding) => {
        const original = binding.stable.bind(binding);
        binding.stable = (target, values) => {
          stableCalls++;
          if (stableCalls === 1) {
            lifecycle.update('off');
            throw new Error('older stable publication failed');
          }
          original(target, values);
        };
        return { request: () => undefined, diagnostics: Object.freeze([]) };
      },
    });
    lifecycle.attach(document.createElement('div'));

    lifecycle.update('on');
    expect(stableCalls).toBe(2);
    expect(lifecycle.logical).toBe('off');
    expect(lifecycle.committed).toBe('off');
    expect(lifecycle.phase).toBe('bound');
    expect(lifecycle.diagnostics.some((entry) => entry.kind === 'lifecycle' && entry.code === 'stable-failed')).toBe(true);

    lifecycle.destroy();
    registry.dispose();
    resources.dispose();
  });


  it('uses the managed root Access.scheduler for lifecycle-started motion work', () => {
    type State = { readonly value: number };
    type Action = { readonly type: 'noop' };
    const reducer: Reducer<State, Action> = (state) => [state, Effect.none()];
    const definition = integrate(reducer).managed().build();
    const scheduler = createDeterministicScheduler();
    const execution = { ...definition.execution, scheduler };
    const store = createStore({ initialState: { value: 0 }, ...definition, execution });
    const claim = rendererOwner(store, execution).claim();
    claim.attach();
    const ambientSetTimeout = vi.spyOn(globalThis, 'setTimeout');
    const ambientClearTimeout = vi.spyOn(globalThis, 'clearTimeout');
    try {
      const lifecycle = createMotionLifecycle(recipe(), 'box', {
        initial: 'off',
        read: () => 'off',
        registry: claim.registry,
        owner: claim.registry.rootOwner,
        createPlayback: (binding) => ({
          request<T extends TargetSchema>(_decision: PlaybackDecision<T>): MotionRun | undefined {
            return binding.start({
              deadlineMs: 50,
              execute: () => new Promise<void>(() => {}),
              stable() {},
            });
          },
          diagnostics: Object.freeze([]),
        }),
      });
      lifecycle.attach(document.createElement('div'));
      lifecycle.update('on');
      expect(scheduler.pendingTimersCount).toBe(1);
      expect(ambientSetTimeout).not.toHaveBeenCalled();
      expect(ambientClearTimeout).not.toHaveBeenCalled();
      lifecycle.destroy();
      expect(scheduler.pendingTimersCount).toBe(0);
    } finally {
      ambientSetTimeout.mockRestore();
      ambientClearTimeout.mockRestore();
      store.destroy();
    }
  });

});
