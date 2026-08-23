/**
 * Tests for dismiss dependency
 */

import { describe, it, expect } from 'vitest';
import { Effect } from '../../src/lib/effect.js';
import {
  createDismissDependency,
  createDismissDependencyWithCleanup,
  dismissDependency,
  type DismissDependency,
  type PresentationAction
} from '../../src/lib/navigation/index.js';
import type { Dispatch, Reducer } from '../../src/lib/types.js';
import { ifLet } from '../../src/lib/navigation/if-let.js';

// ============================================================================
// Test Fixtures
// ============================================================================

type ChildAction =
  | { type: 'save' }
  | { type: 'cancel' }
  | { type: 'update'; value: string };

type ParentAction =
  | { type: 'showModal' }
  | { type: 'modal'; action: PresentationAction<ChildAction> };

// ============================================================================
// createDismissDependency() Tests
// ============================================================================

describe('createDismissDependency()', () => {
  it('creates function that returns Effect', () => {
    const dispatched: ParentAction[] = [];
    const dispatch: Dispatch<ParentAction> = (action) => {
      dispatched.push(action);
    };

    const dismiss = createDismissDependency<ParentAction>(
      dispatch,
      (pa) => ({ type: 'modal', action: pa })
    );

    expect(typeof dismiss).toBe('function');

    const effect = dismiss();
    expect(effect._tag).toBe('Run');
  });

  it('dispatches PresentationAction.dismiss when effect is executed', () => {
    const dispatched: ParentAction[] = [];
    const dispatch: Dispatch<ParentAction> = (action) => {
      dispatched.push(action);
    };

    const dismiss = createDismissDependency<ParentAction>(
      dispatch,
      (pa) => ({ type: 'modal', action: pa })
    );

    const effect = dismiss();

    // Execute the effect
    if (effect._tag === 'Run') {
      effect.execute(dispatch);
    }

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      type: 'modal',
      action: { type: 'dismiss' }
    });
  });

  it('wraps dismiss in user-provided action structure', () => {
    const dispatched: ParentAction[] = [];
    const dispatch: Dispatch<ParentAction> = (action) => {
      dispatched.push(action);
    };

    // Custom action wrapper
    const dismiss = createDismissDependency<ParentAction>(
      dispatch,
      (pa) => ({ type: 'modal', action: pa })
    );

    const effect = dismiss();

    if (effect._tag === 'Run') {
      effect.execute(dispatch);
    }

    expect(dispatched[0]!.type).toBe('modal');
    expect(dispatched[0]).toMatchObject({
      type: 'modal',
      action: { type: 'dismiss' }
    });
  });

  it('can be called multiple times', () => {
    const dispatched: ParentAction[] = [];
    const dispatch: Dispatch<ParentAction> = (action) => {
      dispatched.push(action);
    };

    const dismiss = createDismissDependency<ParentAction>(
      dispatch,
      (pa) => ({ type: 'modal', action: pa })
    );

    // Call dismiss twice
    const effect1 = dismiss();
    const effect2 = dismiss();

    if (effect1._tag === 'Run') {
      effect1.execute(dispatch);
    }
    if (effect2._tag === 'Run') {
      effect2.execute(dispatch);
    }

    expect(dispatched).toHaveLength(2);
    expect(dispatched[0]).toEqual({
      type: 'modal',
      action: { type: 'dismiss' }
    });
    expect(dispatched[1]).toEqual({
      type: 'modal',
      action: { type: 'dismiss' }
    });
  });

  it('works with different action field names', () => {
    type CustomParentAction =
      | { type: 'showDestination' }
      | { type: 'destination'; action: PresentationAction<ChildAction> };

    const dispatched: CustomParentAction[] = [];
    const dispatch: Dispatch<CustomParentAction> = (action) => {
      dispatched.push(action);
    };

    const dismiss = createDismissDependency<CustomParentAction>(
      dispatch,
      (pa) => ({ type: 'destination', action: pa })
    );

    const effect = dismiss();

    if (effect._tag === 'Run') {
      effect.execute(dispatch);
    }

    expect(dispatched[0]).toEqual({
      type: 'destination',
      action: { type: 'dismiss' }
    });
  });
});

// ============================================================================
// createDismissDependencyWithCleanup() Tests
// ============================================================================

describe('createDismissDependencyWithCleanup()', () => {
  it('runs cleanup before dismissing', async () => {
    const dispatched: ParentAction[] = [];
    const dispatch: Dispatch<ParentAction> = (action) => {
      dispatched.push(action);
    };

    const cleanupCalls: string[] = [];

    const dismiss = createDismissDependencyWithCleanup<ParentAction>(
      dispatch,
      (pa) => ({ type: 'modal', action: pa }),
      () => {
        cleanupCalls.push('cleanup');
      }
    );

    const effect = dismiss();

    if (effect._tag === 'Run') {
      await effect.execute(dispatch);
    }

    expect(cleanupCalls).toHaveLength(1);
    expect(cleanupCalls[0]).toBe('cleanup');
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      type: 'modal',
      action: { type: 'dismiss' }
    });
  });

  it('handles async cleanup', async () => {
    const dispatched: ParentAction[] = [];
    const dispatch: Dispatch<ParentAction> = (action) => {
      dispatched.push(action);
    };

    const cleanupCalls: string[] = [];

    const dismiss = createDismissDependencyWithCleanup<ParentAction>(
      dispatch,
      (pa) => ({ type: 'modal', action: pa }),
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        cleanupCalls.push('async-cleanup');
      }
    );

    const effect = dismiss();

    if (effect._tag === 'Run') {
      await effect.execute(dispatch);
    }

    expect(cleanupCalls).toHaveLength(1);
    expect(cleanupCalls[0]).toBe('async-cleanup');
    expect(dispatched).toHaveLength(1);
  });

  it('dispatches dismiss after cleanup completes', async () => {
    const dispatched: ParentAction[] = [];
    const dispatch: Dispatch<ParentAction> = (action) => {
      dispatched.push(action);
    };

    const events: string[] = [];

    const dismiss = createDismissDependencyWithCleanup<ParentAction>(
      dispatch,
      (pa) => {
        events.push('dispatch');
        return { type: 'modal', action: pa };
      },
      async () => {
        events.push('cleanup-start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push('cleanup-end');
      }
    );

    const effect = dismiss();

    if (effect._tag === 'Run') {
      await effect.execute(dispatch);
    }

    // Verify order: cleanup runs before dispatch
    expect(events).toEqual(['cleanup-start', 'cleanup-end', 'dispatch']);
  });

  it('works without cleanup function', async () => {
    const dispatched: ParentAction[] = [];
    const dispatch: Dispatch<ParentAction> = (action) => {
      dispatched.push(action);
    };

    const dismiss = createDismissDependencyWithCleanup<ParentAction>(
      dispatch,
      (pa) => ({ type: 'modal', action: pa })
      // No cleanup function
    );

    const effect = dismiss();

    if (effect._tag === 'Run') {
      await effect.execute(dispatch);
    }

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      type: 'modal',
      action: { type: 'dismiss' }
    });
  });

  it('handles cleanup errors gracefully', async () => {
    const dispatched: ParentAction[] = [];
    const dispatch: Dispatch<ParentAction> = (action) => {
      dispatched.push(action);
    };

    const dismiss = createDismissDependencyWithCleanup<ParentAction>(
      dispatch,
      (pa) => ({ type: 'modal', action: pa }),
      async () => {
        throw new Error('Cleanup failed');
      }
    );

    const effect = dismiss();

    // Cleanup error should be thrown/caught by effect executor
    if (effect._tag === 'Run') {
      await expect(effect.execute(dispatch)).rejects.toThrow('Cleanup failed');
    }
  });
});

// ============================================================================
// dismissDependency() Tests
// ============================================================================

describe('dismissDependency()', () => {
  it('creates dismiss with correct action wrapper', () => {
    const dispatched: ParentAction[] = [];
    const dispatch: Dispatch<ParentAction> = (action) => {
      dispatched.push(action);
    };

    const dismiss = dismissDependency<ParentAction>(dispatch, 'modal');

    const effect = dismiss();

    if (effect._tag === 'Run') {
      effect.execute(dispatch);
    }

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      type: 'modal',
      action: { type: 'dismiss' }
    });
  });

  it('convenience helper works same as full API', () => {
    const dispatched1: ParentAction[] = [];
    const dispatch1: Dispatch<ParentAction> = (action) => {
      dispatched1.push(action);
    };

    const dispatched2: ParentAction[] = [];
    const dispatch2: Dispatch<ParentAction> = (action) => {
      dispatched2.push(action);
    };

    // Using convenience helper
    const dismiss1 = dismissDependency<ParentAction>(dispatch1, 'modal');

    // Using full API
    const dismiss2 = createDismissDependency<ParentAction>(
      dispatch2,
      (pa) => ({ type: 'modal', action: pa })
    );

    // Execute both
    const effect1 = dismiss1();
    const effect2 = dismiss2();

    if (effect1._tag === 'Run') {
      effect1.execute(dispatch1);
    }
    if (effect2._tag === 'Run') {
      effect2.execute(dispatch2);
    }

    // Both should produce the same result
    expect(dispatched1).toEqual(dispatched2);
  });

  it('works with different field names', () => {
    type CustomParentAction =
      | { type: 'showSheet' }
      | { type: 'sheet'; action: PresentationAction<ChildAction> };

    const dispatched: CustomParentAction[] = [];
    const dispatch: Dispatch<CustomParentAction> = (action) => {
      dispatched.push(action);
    };

    const dismiss = dismissDependency<CustomParentAction>(dispatch, 'sheet');

    const effect = dismiss();

    if (effect._tag === 'Run') {
      effect.execute(dispatch);
    }

    expect(dispatched[0]).toEqual({
      type: 'sheet',
      action: { type: 'dismiss' }
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Dismiss Dependency Integration', () => {
  it('integrates with child reducer', () => {
    interface ChildState {
      data: string;
      isDirty: boolean;
    }

    interface ChildDeps {
      dismiss: DismissDependency;
    }

    const childReducer: Reducer<ChildState, ChildAction, ChildDeps> = (
      state,
      action,
      deps
    ) => {
      switch (action.type) {
        case 'cancel':
          // Dismiss when user cancels
          return [state, deps.dismiss()];
        case 'save':
          // Save and dismiss
          return [
            { ...state, isDirty: false },
            Effect.batch(
              Effect.run(() => {
                console.log('Saving...');
              }),
              deps.dismiss()
            )
          ];
        default:
          return [state, Effect.none()];
      }
    };

    const dispatched: ParentAction[] = [];
    const dispatch: Dispatch<ParentAction> = (action) => {
      dispatched.push(action);
    };

    const deps: ChildDeps = {
      dismiss: dismissDependency<ParentAction>(dispatch, 'modal')
    };

    const state: ChildState = { data: 'test', isDirty: true };

    // Test cancel action
    const [newState1, effect1] = childReducer(state, { type: 'cancel' }, deps);

    if (effect1!._tag === 'Run') {
      effect1!.execute(() => {});
    }

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      type: 'modal',
      action: { type: 'dismiss' }
    });

    // Test save action
    dispatched.length = 0; // Clear

    const [newState2, effect2] = childReducer(state, { type: 'save' }, deps);

    expect(newState2!.isDirty).toBe(false);
    expect(effect2!._tag).toBe('Batch');

    if (effect2!._tag === 'Batch') {
      effect2.effects!.forEach((e) => {
        if (e._tag === 'Run') {
          e.execute(() => {});
        }
      });
    }

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      type: 'modal',
      action: { type: 'dismiss' }
    });
  });

  it('child does not know parent structure', () => {
    interface ChildState {
      value: string;
    }

    interface ChildDeps {
      dismiss: DismissDependency;
    }

    const childReducer: Reducer<ChildState, ChildAction, ChildDeps> = (
      state,
      action,
      deps
    ) => {
      if (action.type === 'cancel') {
        // Child just calls deps.dismiss() - no knowledge of parent
        return [state, deps.dismiss()];
      }
      return [state, Effect.none()];
    };

    // Parent can change its action structure
    type ParentAction1 = { type: 'modal'; action: PresentationAction<ChildAction> };
    type ParentAction2 = {
      type: 'destination';
      action: PresentationAction<ChildAction>;
    };

    const dispatched1: ParentAction1[] = [];
    const dispatch1: Dispatch<ParentAction1> = (action) => {
      dispatched1.push(action);
    };

    const dispatched2: ParentAction2[] = [];
    const dispatch2: Dispatch<ParentAction2> = (action) => {
      dispatched2.push(action);
    };

    // Same child reducer works with different parent structures
    const deps1: ChildDeps = {
      dismiss: dismissDependency<ParentAction1>(dispatch1, 'modal')
    };

    const deps2: ChildDeps = {
      dismiss: dismissDependency<ParentAction2>(dispatch2, 'destination')
    };

    const state: ChildState = { value: 'test' };

    // Execute with first parent structure
    const [, effect1] = childReducer(state, { type: 'cancel' }, deps1);
    if (effect1!._tag === 'Run') {
      effect1!.execute(() => {});
    }

    expect(dispatched1[0]).toEqual({
      type: 'modal',
      action: { type: 'dismiss' }
    });

    // Execute with second parent structure
    const [, effect2] = childReducer(state, { type: 'cancel' }, deps2);
    if (effect2!._tag === 'Run') {
      effect2!.execute(() => {});
    }

    expect(dispatched2[0]).toEqual({
      type: 'destination',
      action: { type: 'dismiss' }
    });
  });

  it('supports analytics tracking with cleanup', async () => {
    const dispatched: ParentAction[] = [];
    const dispatch: Dispatch<ParentAction> = (action) => {
      dispatched.push(action);
    };

    const analyticsEvents: string[] = [];

    const dismiss = createDismissDependencyWithCleanup<ParentAction>(
      dispatch,
      (pa) => ({ type: 'modal', action: pa }),
      async () => {
        // Track analytics before dismissing
        await new Promise((resolve) => setTimeout(resolve, 5));
        analyticsEvents.push('modal_dismissed');
      }
    );

    const effect = dismiss();

    if (effect._tag === 'Run') {
      await effect.execute(dispatch);
    }

    expect(analyticsEvents).toHaveLength(1);
    expect(analyticsEvents[0]).toBe('modal_dismissed');
    expect(dispatched).toHaveLength(1);
  });

  describe('through ifLet', () => {
    /**
     * The dismiss effect has to reach the parent *directly*. `ifLet` maps every
     * child effect with `fromChildAction`, and `actionWrapper` already produces
     * a parent action, so an implementation that dispatched through the
     * effect's own dispatch wrapped the dismiss twice — the parent received
     * `{ child: { presented: { child: { dismiss } } } }` and could not route
     * it, so the child never dismissed. Every test above executes the effect
     * directly with the parent's dispatch, which is why none of them could see
     * it: with no `ifLet` in the path there is no second wrapping.
     */
    type ChildState = { n: number };
    type ChildAction = { type: 'cancelTapped' };
    type ParentState = { child: ChildState | null };
    type ParentAction = { type: 'child'; action: PresentationAction<ChildAction> };

    const parentReducerWith = (
      deps: { dismiss: DismissDependency }
    ): Reducer<ParentState, ParentAction, { dismiss: DismissDependency }> => {
      const childReducer: Reducer<ChildState, ChildAction, typeof deps> = (s, _a, d) => [
        s,
        d.dismiss()
      ];
      return ifLet<ParentState, ParentAction, ChildState, ChildAction, typeof deps>(
        (s) => s.child,
        (s, c) => ({ ...s, child: c }),
        (a) => (a.type === 'child' && a.action.type === 'presented' ? a.action.action : null),
        (ca) => ({ type: 'child', action: { type: 'presented', action: ca } }),
        childReducer
      );
    };

    const presentedCancel: ParentAction = {
      type: 'child',
      action: { type: 'presented', action: { type: 'cancelTapped' } }
    };

    it('delivers a singly-wrapped dismiss to the parent', async () => {
      const dispatched: ParentAction[] = [];
      const dispatch: Dispatch<ParentAction> = (a) => dispatched.push(a);
      const deps = {
        dismiss: createDismissDependency<ParentAction>(dispatch, (pa) => ({
          type: 'child' as const,
          action: pa as PresentationAction<ChildAction>
        }))
      };

      const [, effect] = parentReducerWith(deps)({ child: { n: 1 } }, presentedCancel, deps);
      if (effect._tag === 'Run') await effect.execute(() => {});

      expect(dispatched).toEqual([{ type: 'child', action: { type: 'dismiss' } }]);
    });

    it('delivers a singly-wrapped dismiss with cleanup', async () => {
      const dispatched: ParentAction[] = [];
      const order: string[] = [];
      const dispatch: Dispatch<ParentAction> = (a) => {
        dispatched.push(a);
        order.push('dispatch');
      };
      const deps = {
        dismiss: createDismissDependencyWithCleanup<ParentAction>(
          dispatch,
          (pa) => ({ type: 'child' as const, action: pa as PresentationAction<ChildAction> }),
          async () => {
            await new Promise((r) => setTimeout(r, 1));
            order.push('cleanup');
          }
        )
      };

      const [, effect] = parentReducerWith(deps)({ child: { n: 1 } }, presentedCancel, deps);
      if (effect._tag === 'Run') await effect.execute(() => {});

      expect(dispatched).toEqual([{ type: 'child', action: { type: 'dismiss' } }]);
      expect(order, 'cleanup must finish before the dismiss lands').toEqual([
        'cleanup',
        'dispatch'
      ]);
    });
  });

  describe('documented call shapes', () => {
    /**
     * Both shapes below are copied from the docs. They used to throw
     * `TypeError: actionWrapper is not a function` — quick-reference.md passed
     * only the wrapper, and tree-based.md passed the action *field name* where
     * a wrapper function is required. Nothing executed the documented form, so
     * neither was visible.
     */
    it('createDismissDependency, as documented in quick-reference.md', async () => {
      const dispatched: unknown[] = [];
      const dep = createDismissDependency<{ type: string; action: unknown }>(
        (a) => dispatched.push(a),
        (action) => ({ type: 'destination', action })
      );
      await dep().execute(() => {});
      expect(dispatched).toEqual([{ type: 'destination', action: { type: 'dismiss' } }]);
    });

    it('createDismissDependencyWithCleanup, as documented in tree-based.md', async () => {
      const dispatched: unknown[] = [];
      const dep = createDismissDependencyWithCleanup<{ type: string; action: unknown }>(
        (a) => dispatched.push(a),
        (presentationAction) => ({ type: 'destination', action: presentationAction }),
        async () => {}
      );
      await dep().execute(() => {});
      expect(dispatched).toEqual([{ type: 'destination', action: { type: 'dismiss' } }]);
    });
  });
});
