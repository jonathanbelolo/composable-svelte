import {placementActivityFor} from '../src/lib/application/renderer/placement-activity.svelte.js';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { tick } from 'svelte';
import { TargetRegistry } from '../src/lib/application/renderer/target-registry.js';
import { createMotionClock } from '../src/lib/application/renderer/motion-run.js';
import { createDeterministicScheduler } from '../src/lib/execution/scheduler.js';

afterEach(() => vi.restoreAllMocks());

const clock = () => createMotionClock(createDeterministicScheduler());

describe('placement validation coalescing', () => {
  it('coalesces N requests into one scan, runs another scan on later burst, and stops pending scan on disposal', async () => {
    const registry = new TargetRegistry({}, () => true, undefined, undefined, clock());
    registry.attach();

    const spy = vi.spyOn(registry, 'validatePlacements');
    expect(spy).toHaveBeenCalledTimes(0);

    for (let i = 0; i < 10; i++) {
      registry.requestPlacementValidation();
    }
    expect(spy).toHaveBeenCalledTimes(0);

    await tick();
    expect(spy).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 5; i++) {
      registry.requestPlacementValidation();
    }
    expect(spy).toHaveBeenCalledTimes(1);

    await tick();
    expect(spy).toHaveBeenCalledTimes(2);

    registry.requestPlacementValidation();
    registry.dispose();

    await tick();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('fails owner when coalesced validation detects invalid layout', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    let failedError: unknown = null;
    const registry = new TargetRegistry({}, () => true, error => {
      failedError = error;
    }, undefined, clock());
    registry.attach();

    const owner = {};
    registry.registerPlacementScope(() => {}, owner);
    registry.registerPlacementScope(() => {}, owner);

    registry.requestPlacementValidation();
    await tick();

    await vi.waitFor(() => expect(failedError).toBeInstanceOf(Error));
    expect((failedError as Error).message).toContain('Duplicate rendering layout for one feature owner');
    expect(registry.isAttached).toBe(false);
    log.mockRestore();
  });

  it('preserves initial attach synchronous validation and fatal invalid layout behavior', () => {
    const registry = new TargetRegistry({}, () => true, undefined, undefined, clock());
    registry.registerPlacementScope(() => {
      throw new Error('Initial invalid placement');
    });

    expect(() => registry.attach()).toThrow('Initial invalid placement');
    expect(registry.isAttached).toBe(false);
  });
});

describe('direct registration compatibility', () => {
 it('a direct registration cannot be hidden by an unacknowledged framework registration',()=>{
  const registry=new TargetRegistry({},()=>true,undefined,undefined,clock());registry.attach();const owner={};
  const presence=placementActivityFor(registry).create(()=>{});
  registry.registerPlacementScope(()=>{},owner,presence);registry.registerPlacementScope(()=>{},owner);
  placementActivityFor(registry).challenge();placementActivityFor(registry).settle();
  expect(()=>registry.validatePlacements()).toThrow('Duplicate rendering layout');
  registry.dispose();
 });

it('counts separate direct registrations even when they share a validator function',()=>{
 const registry=new TargetRegistry({},()=>true,undefined,undefined,clock());registry.attach();const owner={},validate=()=>{};
 const first=registry.registerPlacementScope(validate,owner);const second=registry.registerPlacementScope(validate,owner);
 expect(()=>registry.validatePlacements()).toThrow('Duplicate rendering layout');first();expect(()=>registry.validatePlacements()).not.toThrow();second();registry.dispose();
});

});

describe('private placement presence', () => {
  it('skips a suspended framework registration while validating its live sibling', () => {
    const registry = new TargetRegistry({}, () => true, undefined, undefined, clock());
    registry.attach();
    const activity = placementActivityFor(registry), owner = {};
    const paused = activity.create(() => {}), live = activity.create(() => {});
    paused.acknowledge(); live.acknowledge();
    const pausedCheck = vi.fn(), liveCheck = vi.fn();
    registry.registerPlacementScope(pausedCheck, owner, paused);
    registry.registerPlacementScope(liveCheck, owner, live);
    activity.challenge(); live.acknowledge(); activity.settle();
    expect(() => registry.validatePlacements()).not.toThrow();
    expect(pausedCheck).not.toHaveBeenCalled();
    expect(liveCheck).toHaveBeenCalledOnce();
    registry.dispose();
  });

  it('keeps never-acknowledged records strict rather than losing validation', () => {
    const registry = new TargetRegistry({}, () => true, undefined, undefined, clock());
    registry.attach();
    const activity = placementActivityFor(registry), owner = {};
    registry.registerPlacementScope(() => {}, owner, activity.create(() => {}));
    registry.registerPlacementScope(() => {}, owner, activity.create(() => {}));
    activity.challenge(); activity.settle();
    expect(() => registry.validatePlacements()).toThrow('Duplicate rendering layout');
    registry.dispose();
  });

  it('disposal between challenge and settlement prevents scans and failure delivery', async () => {
    const failed = vi.fn();
    const registry = new TargetRegistry({}, () => true, failed, undefined, clock());
    registry.attach();
    const activity = placementActivityFor(registry), owner = {};
    for (let i = 0; i < 2; i++) {
      const presence = activity.create(() => {}); presence.acknowledge();
      registry.registerPlacementScope(() => {}, owner, presence);
    }
    const scan = vi.spyOn(registry, 'validatePlacements');
    registry.requestPlacementValidation();
    await tick();
    registry.dispose();
    await tick(); await tick();
    expect(scan).not.toHaveBeenCalled(); expect(failed).not.toHaveBeenCalled();
  });

  it('a foreign-owner challenge suspends only paused validation and resume restores it', async () => {
    const registry = new TargetRegistry({}, () => true, undefined, undefined, clock());
    registry.attach();
    const activity = placementActivityFor(registry), ownerX = {}, ownerY = {};
    const x = activity.create(() => {}), y = activity.create(() => registry.requestPlacementValidation());
    x.acknowledge(); y.acknowledge();
    const yCheck = vi.fn();
    registry.registerPlacementScope(() => {}, ownerX, x);
    registry.registerPlacementScope(yCheck, ownerY, y);
    activity.challenge(); x.acknowledge(); activity.settle();
    registry.validatePlacements(); expect(yCheck).not.toHaveBeenCalled();
    const scan = vi.spyOn(registry, 'validatePlacements');
    y.acknowledge(); await tick();
    expect(scan).toHaveBeenCalledOnce(); expect(yCheck).toHaveBeenCalledOnce();
    registry.dispose();
  });
});
