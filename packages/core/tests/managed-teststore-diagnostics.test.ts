import { describe, it, expect } from 'vitest';
import { createTestStore } from '../src/lib/test/test-store.js';
import { Effect } from '../src/lib/effect.js';
import { DeterministicScheduler } from '../src/lib/execution/scheduler.js';
import { ManagedIntegrationBuilder, optionalSlot } from '../src/lib/navigation/managed-integration.js';
import type { PresentationAction } from '../src/lib/navigation/types.js';
import type { Reducer } from '../src/lib/types.js';
import { controlledCompletion } from './helpers/controlled-completion.js';

describe('managed TestStore diagnostics', () => {
  it('two owners with the same local id are separately named in finish diagnostics, settled resources are absent, and finish recovers', async () => {
    type Child = { active: boolean };
    type ChildAction = { type: 'start' } | { type: 'cancel' };
    type State = { editorA: Child | null; editorB: Child | null };
    type Action = { type: 'editorA'; action: PresentationAction<ChildAction> } | { type: 'editorB'; action: PresentationAction<ChildAction> };
    const slots = {
      editorA: optionalSlot<State, Action>()('editorA'),
      editorB: optionalSlot<State, Action>()('editorB')
    };
    const child: Reducer<Child, ChildAction> = (state, action) => action.type === 'start'
      ? [{ active: true }, Effect.subscription('save-listener', () => () => {})]
      : [{ active: false }, Effect.cancel('save-listener')];
    const composition = new ManagedIntegrationBuilder<State, Action, unknown>(state => [state, Effect.none()])
      .with(slots.editorA, child)
      .with(slots.editorB, child)
      .build();
    const store = createTestStore({
      initialState: { editorA: { active: false }, editorB: { active: false } },
      reducer: composition.reducer,
      execution: composition.execution
    });

    try {
      await store.send(slots.editorA.wrap({ type: 'start' }));
      await store.send(slots.editorB.wrap({ type: 'start' }));

      let finishError: Error | undefined;
      try {
        await store.finish(10);
      } catch (error) {
        finishError = error as Error;
      }

      expect(finishError).toBeDefined();
      expect(finishError!.message).toContain('[TestStore] finish(): 2 managed resource(s) still pending after 10ms');
      expect(finishError!.message).toContain('subscription Subscription');
      expect(finishError!.message).toContain('identical local keys in sibling owners are independent');
      expect(finishError!.message).toContain('destroyAndSettle()');
      expect(finishError!.message).toContain('node_modules/@composable-svelte/core/docs/testing-owned-work.md');

      const ownerMatches = [...finishError!.message.matchAll(/\[\["owner",(\d+)\],"id","save-listener"\]/g)];
      expect(ownerMatches).toHaveLength(2);
      expect(ownerMatches[0]![1]).not.toBe(ownerMatches[1]![1]);

      await store.send(slots.editorA.wrap({ type: 'cancel' }));

      let secondFinishError: Error | undefined;
      try {
        await store.finish(10);
      } catch (error) {
        secondFinishError = error as Error;
      }

      expect(secondFinishError).toBeDefined();
      expect(secondFinishError!.message).toContain('[TestStore] finish(): 1 managed resource(s) still pending after 10ms');
      expect(secondFinishError!.message).not.toContain(ownerMatches[0]![0]);
      expect(secondFinishError!.message).toContain(ownerMatches[1]![0]);

      await store.send(slots.editorB.wrap({ type: 'cancel' }));
      await store.finish();
    } finally {
      store.destroy();
    }
  });

  it('anonymous work is understandable in finish and receive diagnostics without undefined text, and finish recovers', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });

    const store = createTestStore({
      initialState: 0,
      reducer: (state: number, action: { type: 'run' | 'cancel' | 'nonexistent' }) => {
        if (action.type === 'run') {
          return [
            state + 1,
            Effect.inGroup(Effect.run(() => gate), 'anonymous-group')
          ];
        }
        return [state, Effect.cancelGroup('anonymous-group')];
      },
      execution: { mode: 'managed' }
    });

    try {
      await store.send({ type: 'run' });

      let finishError: Error | undefined;
      try {
        await store.finish(10);
      } catch (error) {
        finishError = error as Error;
      }

      expect(finishError).toBeDefined();
      expect(finishError!.message).toContain('[TestStore] finish(): 1 managed resource(s) still pending after 10ms');
      expect(finishError!.message).toContain('execution Run');
      expect(finishError!.message).not.toMatch(/undefined/);

      let receiveError: Error | undefined;
      try {
        await store.receive({ type: 'nonexistent' }, undefined, 10);
      } catch (error) {
        receiveError = error as Error;
      }

      expect(receiveError).toBeDefined();
      expect(receiveError!.message).toContain('Expected to receive action matching {"type":"nonexistent"} within 10ms.');
      expect(receiveError!.message).toContain('Managed resources pending: 1.');
      expect(receiveError!.message).toContain('execution Run');
      expect(receiveError!.message).not.toMatch(/undefined/);
      expect(receiveError!.message).toContain('Advance the injected scheduler explicitly for timer or frame work.');
      expect(receiveError!.message).toContain("Already queued actions still require the reducer's request acceptance checks.");

      await store.send({ type: 'cancel' });
      release();
      await store.finish();
    } finally {
      release();
      store.destroy();
    }
  });

  it.each([true, false])('controlled completion detects cancellation, with omitted cancellation as a negative control (%s)', async (cancel) => {
    const service = controlledCompletion<number>();
    type Action = { type: 'start' } | { type: 'cancel' } | { type: 'completed'; value: number };
    const reducer: Reducer<number, Action> = (state, action) => {
      if (action.type === 'start') return [state, Effect.cancellable('load', async (dispatch) => {
        const value = await service.promise;
        dispatch({ type: 'completed', value });
      })];
      if (action.type === 'cancel') return [state, cancel ? Effect.cancel('load') : Effect.none()];
      return [action.value, Effect.none()];
    };
    const store = createTestStore({ initialState: 0, reducer, execution: { mode: 'managed' } });
    try {
      await store.send({ type: 'start' });
      await store.send({ type: 'cancel' });
      service.resolve(42);
      await service.promise;
      if (cancel) {
        await expect(store.receive({ type: 'completed' }, undefined, 10)).rejects.toThrow(
          'If the expected callback belongs to cancelled or retired work, managed dispatch drops it'
        );
        expect(store.getState()).toBe(0);
      } else {
        await store.receive({ type: 'completed', value: 42 });
        expect(store.getState()).toBe(42);
      }
      await store.finish();
    } finally {
      service.resolve(42);
      await store.destroyAndSettle();
    }
  });

  it('pending cleanup is counted after live resource removal without claiming a live label, and settles cleanly', async () => {
    let releaseCleanup!: () => void;
    const cleanupPromise = new Promise<void>((resolve) => { releaseCleanup = resolve; });

    const store = createTestStore({
      initialState: 0,
      reducer: (state: number, action: { type: 'start' | 'cancel' | 'nonexistent' }) => {
        if (action.type === 'start') {
          return [
            state + 1,
            Effect.subscription('async-feed', () => () => cleanupPromise)
          ];
        }
        return [state, Effect.cancel('async-feed')];
      },
      execution: { mode: 'managed' }
    });

    try {
      await store.send({ type: 'start' });
      await store.send({ type: 'cancel' });

      expect(store._runtime!.resourceScope.size).toBe(0);
      expect(store._runtime!.resourceScope.pendingCleanupCount).toBe(1);

      let finishError: Error | undefined;
      try {
        await store.finish(10);
      } catch (error) {
        finishError = error as Error;
      }

      expect(finishError).toBeDefined();
      expect(finishError!.message).toContain('[TestStore] finish(): 1 managed resource(s) still pending after 10ms');
      expect(finishError!.message).toContain('Pending cleanup(s): 1');
      expect(finishError!.message).not.toContain('async-feed');
      expect(finishError!.message).not.toContain('subscription Subscription');

      let receiveError: Error | undefined;
      try {
        await store.receive({ type: 'nonexistent' }, undefined, 10);
      } catch (error) {
        receiveError = error as Error;
      }

      expect(receiveError).toBeDefined();
      expect(receiveError!.message).toContain('Managed resources pending: 1.');
      expect(receiveError!.message).toContain('Pending cleanup(s): 1');
      expect(receiveError!.message).not.toContain('async-feed');

      releaseCleanup();
      await store._runtime!.whenCleanupsSettled();
      await store.finish();
    } finally {
      releaseCleanup();
      store.destroy();
    }
  });

  it('pins existing immediate timer guard in managed mode and legacy TestStore error output', async () => {
    const scheduler = new DeterministicScheduler();
    const managedStore = createTestStore({
      initialState: 0,
      reducer: (state: number, _action: { type: 'delay' }) => [
        state,
        Effect.afterDelay(50, () => {})
      ],
      execution: { mode: 'managed', scheduler }
    });

    try {
      await managedStore.send({ type: 'delay' });
      await expect(managedStore.finish()).rejects.toThrow(/pending timer\(s\): AfterDelay/);
      await managedStore.advanceTime(50);
      await managedStore.finish();
    } finally {
      managedStore.destroy();
    }

    let releaseLegacy!: () => void;
    const legacyGate = new Promise<void>((resolve) => { releaseLegacy = resolve; });

    const legacyStore = createTestStore({
      initialState: 0,
      reducer: (state: number, action: { type: 'run' | 'cancel' | 'nonexistent' }) => {
        if (action.type === 'run') {
          return [
            state + 1,
            Effect.cancellable('legacy-job', () => legacyGate)
          ];
        }
        return [state, Effect.cancel('legacy-job')];
      }
    });

    try {
      await legacyStore.send({ type: 'run' });

      let legacyFinishError: Error | undefined;
      try {
        await legacyStore.finish(10);
      } catch (error) {
        legacyFinishError = error as Error;
      }
      expect(legacyFinishError).toBeDefined();
      expect(legacyFinishError!.message).toContain(
        "finish(): 1 effect(s) still running after 10ms: Cancellable 'legacy-job'. Cancel it (Effect.cancel(id) for a cancellable), or call store.destroy() instead."
      );

      let legacyReceiveError: Error | undefined;
      try {
        await legacyStore.receive({ type: 'nonexistent' }, undefined, 10);
      } catch (error) {
        legacyReceiveError = error as Error;
      }
      expect(legacyReceiveError).toBeDefined();
      expect(legacyReceiveError!.message).toContain("Effects in flight: Cancellable 'legacy-job'");

      await legacyStore.send({ type: 'cancel' });
      releaseLegacy();
      await legacyStore.finish();
    } finally {
      releaseLegacy();
      legacyStore.destroy();
    }
  });
});
