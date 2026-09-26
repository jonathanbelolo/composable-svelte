// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const planning = vi.hoisted(() => ({
  requests: [] as Array<{ availableTargets?: readonly string[] | undefined }>,
  failure: undefined as unknown,
}));

vi.mock('../src/lib/application/motion/playback-plan.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/application/motion/playback-plan.js')>();
  return {
    ...actual,
    planPlayback: (recipe: Parameters<typeof actual.planPlayback>[0], request: Parameters<typeof actual.planPlayback>[1]) => {
      planning.requests.push(request);
      if (planning.failure !== undefined) throw planning.failure;
      return actual.planPlayback(recipe, request);
    },
  };
});

import { defineMotionRecipe } from '../src/lib/application/motion/compiler.js';
import { createMotionLifecycle } from '../src/lib/application/renderer/motion-lifecycle.js';
import { createMotionPlayback } from '../src/lib/application/renderer/motion-playback.js';
import { TargetRegistry, type MotionBinding, type RootTargetResources } from '../src/lib/application/renderer/target-registry.js';
import type { MotionClock } from '../src/lib/application/renderer/motion-run.js';
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

function recipe(optional = false, durationMs = 120) {
  return defineMotionRecipe({
    targets: { box: { properties: ['opacity'], optional } },
    states: { off: { box: { opacity: 0 } }, on: { box: { opacity: 1 } } },
    graph: { kind: 'track', target: 'box', properties: ['opacity'], durationMs },
    interruption: 'replace',
  });
}

beforeEach(() => {
  planning.requests.length = 0;
  planning.failure = undefined;
});

describe('public lifecycle planning and zero-work routing', () => {
  it('distinguishes a planning fault from a playback request fault', () => {
    const { registry, resources } = rig();
    registry.attach();
    const requestFailure = new Error('request failed');
    const request = vi.fn(() => { throw requestFailure; });
    const lifecycle = createMotionLifecycle(recipe(), 'box', {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner,
      createPlayback: () => ({ request, diagnostics: Object.freeze([]) }),
    });
    lifecycle.attach(document.createElement('div'));

    planning.failure = new Error('planning failed');
    lifecycle.update('on');
    expect(request).not.toHaveBeenCalled();
    expect(lifecycle.diagnostics.filter((entry) => entry.kind === 'lifecycle').map((entry) => entry.code)).toContain('plan-failed');
    expect(lifecycle.diagnostics.some((entry) => entry.kind === 'lifecycle' && entry.code === 'request-failed')).toBe(false);

    planning.failure = undefined;
    lifecycle.update('off');
    expect(request).toHaveBeenCalledTimes(1);
    expect(lifecycle.diagnostics.filter((entry) => entry.kind === 'lifecycle').map((entry) => entry.code)).toContain('request-failed');
    lifecycle.destroy(); registry.dispose(); resources.dispose();
  });

  it('uses one frozen exact present-name array for every attached plan', () => {
    const { registry, resources } = rig();
    registry.attach();
    const bind = vi.spyOn(registry, 'bind');
    const lifecycle = createMotionLifecycle(recipe(), 'box', {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner,
      createPlayback: () => ({ request: () => undefined, diagnostics: Object.freeze([]) }),
    });
    lifecycle.attach(document.createElement('div'));
    lifecycle.update('on');
    lifecycle.update('off');

    expect(bind.mock.calls[0]?.[1].map((entry) => entry.name)).toEqual(['box']);
    expect(planning.requests).toHaveLength(2);
    expect(planning.requests[0]?.availableTargets).toEqual(['box']);
    expect(planning.requests[1]?.availableTargets).toBe(planning.requests[0]?.availableTargets);
    expect(Object.isFrozen(planning.requests[0]?.availableTargets)).toBe(true);
    lifecycle.destroy(); registry.dispose(); resources.dispose();
  });

  it('classifies zero-present required and optional targets without acquiring authority', () => {
    const required = createMotionLifecycle(recipe(false), 'box', {
      initial: 'off', read: () => 'off', registry: undefined, owner: undefined,
    });
    required.update('on');
    expect(required.diagnostics.some((entry) => entry.kind === 'lifecycle' && entry.code === 'unbound-update' && entry.name === 'missing-required')).toBe(true);
    expect(planning.requests[0]?.availableTargets).toEqual([]);

    const optional = createMotionLifecycle(recipe(true), 'box', {
      initial: 'off', read: () => 'off', registry: undefined, owner: undefined,
    });
    optional.update('on');
    expect(optional.diagnostics.some((entry) => entry.kind === 'lifecycle' && entry.code === 'unbound-update' && entry.name === 'all-optional-skipped')).toBe(true);
    expect(planning.requests[1]?.availableTargets).toEqual([]);
    expect(Object.isFrozen(planning.requests[0]?.availableTargets)).toBe(true);
    expect(Object.isFrozen(planning.requests[1]?.availableTargets)).toBe(true);
  });

  it('routes a zero-work successor through the real adapter to cancel an incumbent with no new engine start', () => {
    const { registry, resources } = rig();
    registry.attach();
    let binding!: MotionBinding;
    const play = vi.fn(() => { throw new Error('zero-work must not start an engine'); });
    const lifecycle = createMotionLifecycle(recipe(false, 0), 'box', {
      initial: 'off', read: () => 'off', registry, owner: registry.rootOwner,
      createPlayback: (value) => { binding = value; return createMotionPlayback(value, { play }); },
    });
    lifecycle.attach(document.createElement('div'));
    const incumbent = binding.start({ deadlineMs: 100, execute: () => new Promise<void>(() => {}), stable() {} });
    expect(incumbent.live).toBe(true);

    lifecycle.update('on');
    expect(incumbent.live).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(binding.current).toBeDefined();
    expect(binding.current?.live).toBe(false);
    lifecycle.destroy(); registry.dispose(); resources.dispose();
  });
});
