/**
 * Tests for stack navigation utilities
 */

import { describe, it, expect } from 'vitest';
import { Effect } from '../../src/effect.js';
import {
  push,
  pop,
  popToRoot,
  setPath,
  handleStackAction,
  topScreen,
  rootScreen,
  canGoBack,
  stackDepth,
  type StackAction,
  type PresentationAction
} from '../../src/navigation/index.js';
import type { Reducer } from '../../src/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

interface ScreenState {
  step: number;
  data: string;
}

type ScreenAction =
  | { type: 'updateData'; value: string }
  | { type: 'next' }
  | { type: 'back' };

interface ParentState {
  stack: readonly ScreenState[];
  history: string[];
}

type ParentAction =
  | { type: 'startFlow' }
  | { type: 'stack'; action: StackAction<ScreenAction> };

const screenReducer: Reducer<ScreenState, ScreenAction, null> = (state, action) => {
  switch (action.type) {
    case 'updateData':
      return [{ ...state, data: action.value }, Effect.none()];
    case 'next':
      return [
        state,
        Effect.run<ScreenAction>((dispatch) => {
          dispatch({ type: 'updateData', value: `${state.data}-next` });
        })
      ];
    default:
      return [state, Effect.none()];
  }
};

// ============================================================================
// Stack Operation Tests
// ============================================================================

describe('Stack Operations', () => {
  describe('push()', () => {
    it('adds screen to end of stack', () => {
      const stack: readonly ScreenState[] = [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' }
      ];

      const newScreen: ScreenState = { step: 3, data: 'third' };

      const [newStack, effect] = push(stack, newScreen);

      expect(newStack).toHaveLength(3);
      expect(newStack[2]).toEqual({ step: 3, data: 'third' });
      expect(effect._tag).toBe('None');
    });

    it('returns new array (immutability check)', () => {
      const stack: readonly ScreenState[] = [{ step: 1, data: 'first' }];
      const newScreen: ScreenState = { step: 2, data: 'second' };

      const [newStack] = push(stack, newScreen);

      expect(newStack).not.toBe(stack); // Different reference
      expect(stack).toHaveLength(1); // Original unchanged
      expect(newStack).toHaveLength(2);
    });

    it('works with empty stack', () => {
      const stack: readonly ScreenState[] = [];
      const newScreen: ScreenState = { step: 1, data: 'first' };

      const [newStack, effect] = push(stack, newScreen);

      expect(newStack).toHaveLength(1);
      expect(newStack[0]).toEqual({ step: 1, data: 'first' });
      expect(effect._tag).toBe('None');
    });
  });

  describe('pop()', () => {
    it('removes top screen from stack', () => {
      const stack: readonly ScreenState[] = [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' },
        { step: 3, data: 'third' }
      ];

      const [newStack, effect] = pop(stack);

      expect(newStack).toHaveLength(2);
      expect(newStack[0]).toEqual({ step: 1, data: 'first' });
      expect(newStack[1]).toEqual({ step: 2, data: 'second' });
      expect(effect._tag).toBe('None');
    });

    it('returns unchanged stack when only one element', () => {
      const stack: readonly ScreenState[] = [{ step: 1, data: 'first' }];

      const [newStack, effect] = pop(stack);

      expect(newStack).toBe(stack); // Same reference (optimization)
      expect(newStack).toHaveLength(1);
      expect(effect._tag).toBe('None');
    });

    it('returns unchanged stack when empty', () => {
      const stack: readonly ScreenState[] = [];

      const [newStack, effect] = pop(stack);

      expect(newStack).toBe(stack); // Same reference
      expect(newStack).toHaveLength(0);
      expect(effect._tag).toBe('None');
    });

    it('returns new array (immutability check)', () => {
      const stack: readonly ScreenState[] = [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' }
      ];

      const [newStack] = pop(stack);

      expect(newStack).not.toBe(stack); // Different reference
      expect(stack).toHaveLength(2); // Original unchanged
      expect(newStack).toHaveLength(1);
    });
  });

  describe('popToRoot()', () => {
    it('keeps only first screen', () => {
      const stack: readonly ScreenState[] = [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' },
        { step: 3, data: 'third' }
      ];

      const [newStack, effect] = popToRoot(stack);

      expect(newStack).toHaveLength(1);
      expect(newStack[0]).toEqual({ step: 1, data: 'first' });
      expect(effect._tag).toBe('None');
    });

    it('handles empty stack', () => {
      const stack: readonly ScreenState[] = [];

      const [newStack, effect] = popToRoot(stack);

      expect(newStack).toBe(stack); // Same reference
      expect(newStack).toHaveLength(0);
      expect(effect._tag).toBe('None');
    });

    it('returns same stack when only one element', () => {
      const stack: readonly ScreenState[] = [{ step: 1, data: 'first' }];

      const [newStack, effect] = popToRoot(stack);

      // Should return new array with just the root element
      expect(newStack).toHaveLength(1);
      expect(newStack[0]).toEqual({ step: 1, data: 'first' });
      expect(effect._tag).toBe('None');
    });

    it('returns new array (immutability check)', () => {
      const stack: readonly ScreenState[] = [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' }
      ];

      const [newStack] = popToRoot(stack);

      expect(newStack).not.toBe(stack); // Different reference
      expect(stack).toHaveLength(2); // Original unchanged
      expect(newStack).toHaveLength(1);
    });
  });

  describe('setPath()', () => {
    it('replaces entire stack', () => {
      const oldStack: readonly ScreenState[] = [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' }
      ];

      const newPath: readonly ScreenState[] = [
        { step: 1, data: 'first' },
        { step: 3, data: 'third' },
        { step: 4, data: 'fourth' }
      ];

      const [newStack, effect] = setPath(newPath);

      expect(newStack).toBe(newPath); // Same reference
      expect(newStack).toHaveLength(3);
      expect(effect._tag).toBe('None');
    });

    it('handles empty path', () => {
      const newPath: readonly ScreenState[] = [];

      const [newStack, effect] = setPath(newPath);

      expect(newStack).toBe(newPath);
      expect(newStack).toHaveLength(0);
      expect(effect._tag).toBe('None');
    });

    it('can set single-element path', () => {
      const newPath: readonly ScreenState[] = [{ step: 1, data: 'only' }];

      const [newStack, effect] = setPath(newPath);

      expect(newStack).toHaveLength(1);
      expect(newStack[0]).toEqual({ step: 1, data: 'only' });
      expect(effect._tag).toBe('None');
    });
  });
});

// ============================================================================
// handleStackAction() Tests
// ============================================================================

describe('handleStackAction()', () => {
  it('handles push action', () => {
    const state: ParentState = {
      stack: [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' }
      ],
      history: []
    };

    const action: StackAction<ScreenAction> = {
      type: 'push',
      state: { step: 3, data: 'third' }
    };

    const [newState, effect] = handleStackAction<
      ParentState,
      ParentAction,
      ScreenState,
      ScreenAction,
      null
    >(
      state,
      action,
      null,
      screenReducer,
      (s) => s.stack,
      (s, stack) => ({ ...s, stack })
    );

    expect(newState.stack).toHaveLength(3);
    expect(newState.stack[2]).toEqual({ step: 3, data: 'third' });
    expect(effect._tag).toBe('None');
  });

  it('handles pop action', () => {
    const state: ParentState = {
      stack: [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' },
        { step: 3, data: 'third' }
      ],
      history: []
    };

    const action: StackAction<ScreenAction> = {
      type: 'pop'
    };

    const [newState, effect] = handleStackAction<
      ParentState,
      ParentAction,
      ScreenState,
      ScreenAction,
      null
    >(
      state,
      action,
      null,
      screenReducer,
      (s) => s.stack,
      (s, stack) => ({ ...s, stack })
    );

    expect(newState.stack).toHaveLength(2);
    expect(newState.stack[0]).toEqual({ step: 1, data: 'first' });
    expect(newState.stack[1]).toEqual({ step: 2, data: 'second' });
    expect(effect._tag).toBe('None');
  });

  it('handles popToRoot action', () => {
    const state: ParentState = {
      stack: [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' },
        { step: 3, data: 'third' }
      ],
      history: []
    };

    const action: StackAction<ScreenAction> = {
      type: 'popToRoot'
    };

    const [newState, effect] = handleStackAction<
      ParentState,
      ParentAction,
      ScreenState,
      ScreenAction,
      null
    >(
      state,
      action,
      null,
      screenReducer,
      (s) => s.stack,
      (s, stack) => ({ ...s, stack })
    );

    expect(newState.stack).toHaveLength(1);
    expect(newState.stack[0]).toEqual({ step: 1, data: 'first' });
    expect(effect._tag).toBe('None');
  });

  it('handles setPath action', () => {
    const state: ParentState = {
      stack: [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' }
      ],
      history: []
    };

    const newPath = [
      { step: 1, data: 'first' },
      { step: 3, data: 'third' },
      { step: 4, data: 'fourth' }
    ];

    const action: StackAction<ScreenAction> = {
      type: 'setPath',
      path: newPath
    };

    const [newState, effect] = handleStackAction<
      ParentState,
      ParentAction,
      ScreenState,
      ScreenAction,
      null
    >(
      state,
      action,
      null,
      screenReducer,
      (s) => s.stack,
      (s, stack) => ({ ...s, stack })
    );

    expect(newState.stack).toHaveLength(3);
    expect(newState.stack).toEqual(newPath);
    expect(effect._tag).toBe('None');
  });

  it('handles screen action with presented', () => {
    const state: ParentState = {
      stack: [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' }
      ],
      history: []
    };

    const action: StackAction<ScreenAction> = {
      type: 'screen',
      index: 1,
      action: {
        type: 'presented',
        action: { type: 'updateData', value: 'updated' }
      }
    };

    const [newState, effect] = handleStackAction<
      ParentState,
      ParentAction,
      ScreenState,
      ScreenAction,
      null
    >(
      state,
      action,
      null,
      screenReducer,
      (s) => s.stack,
      (s, stack) => ({ ...s, stack })
    );

    expect(newState.stack).toHaveLength(2);
    expect(newState.stack[0]).toEqual({ step: 1, data: 'first' }); // Unchanged
    expect(newState.stack[1]).toEqual({ step: 2, data: 'updated' }); // Updated
    expect(effect._tag).toBe('None');
  });

  it('handles screen action with dismiss', () => {
    const state: ParentState = {
      stack: [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' },
        { step: 3, data: 'third' }
      ],
      history: []
    };

    // Dismiss screen at index 1 (removes it and everything above)
    const action: StackAction<ScreenAction> = {
      type: 'screen',
      index: 1,
      action: { type: 'dismiss' }
    };

    const [newState, effect] = handleStackAction<
      ParentState,
      ParentAction,
      ScreenState,
      ScreenAction,
      null
    >(
      state,
      action,
      null,
      screenReducer,
      (s) => s.stack,
      (s, stack) => ({ ...s, stack })
    );

    expect(newState.stack).toHaveLength(1);
    expect(newState.stack[0]).toEqual({ step: 1, data: 'first' });
    expect(effect._tag).toBe('None');
  });

  it('validates screen index and logs warning for invalid index', () => {
    const state: ParentState = {
      stack: [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' }
      ],
      history: []
    };

    const action: StackAction<ScreenAction> = {
      type: 'screen',
      index: 5, // Invalid index
      action: {
        type: 'presented',
        action: { type: 'updateData', value: 'test' }
      }
    };

    const [newState, effect] = handleStackAction<
      ParentState,
      ParentAction,
      ScreenState,
      ScreenAction,
      null
    >(
      state,
      action,
      null,
      screenReducer,
      (s) => s.stack,
      (s, stack) => ({ ...s, stack })
    );

    expect(newState).toBe(state); // Unchanged
    expect(effect._tag).toBe('None');
  });

  it('validates negative screen index', () => {
    const state: ParentState = {
      stack: [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' }
      ],
      history: []
    };

    const action: StackAction<ScreenAction> = {
      type: 'screen',
      index: -1, // Negative index
      action: {
        type: 'presented',
        action: { type: 'updateData', value: 'test' }
      }
    };

    const [newState, effect] = handleStackAction<
      ParentState,
      ParentAction,
      ScreenState,
      ScreenAction,
      null
    >(
      state,
      action,
      null,
      screenReducer,
      (s) => s.stack,
      (s, stack) => ({ ...s, stack })
    );

    expect(newState).toBe(state); // Unchanged
    expect(effect._tag).toBe('None');
  });

  it('maps screen effects to parent actions', () => {
    const state: ParentState = {
      stack: [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' }
      ],
      history: []
    };

    const action: StackAction<ScreenAction> = {
      type: 'screen',
      index: 1,
      action: {
        type: 'presented',
        action: { type: 'next' } // This produces an effect
      }
    };

    const [newState, effect] = handleStackAction<
      ParentState,
      ParentAction,
      ScreenState,
      ScreenAction,
      null
    >(
      state,
      action,
      null,
      screenReducer,
      (s) => s.stack,
      (s, stack) => ({ ...s, stack })
    );

    expect(effect._tag).toBe('Run'); // Effect was mapped

    // Execute effect and verify parent action structure
    const dispatched: ParentAction[] = [];
    if (effect._tag === 'Run') {
      effect.execute((a) => dispatched.push(a));
    }

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      type: 'stack',
      action: {
        type: 'screen',
        index: 1,
        action: {
          type: 'presented',
          action: { type: 'updateData', value: 'second-next' }
        }
      }
    });
  });

  it('updates screen at index 0 correctly', () => {
    const state: ParentState = {
      stack: [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' }
      ],
      history: []
    };

    const action: StackAction<ScreenAction> = {
      type: 'screen',
      index: 0,
      action: {
        type: 'presented',
        action: { type: 'updateData', value: 'root-updated' }
      }
    };

    const [newState] = handleStackAction<
      ParentState,
      ParentAction,
      ScreenState,
      ScreenAction,
      null
    >(
      state,
      action,
      null,
      screenReducer,
      (s) => s.stack,
      (s, stack) => ({ ...s, stack })
    );

    expect(newState.stack[0]).toEqual({ step: 1, data: 'root-updated' });
    expect(newState.stack[1]).toEqual({ step: 2, data: 'second' }); // Unchanged
  });
});

// ============================================================================
// Stack Utility Tests
// ============================================================================

describe('Stack Utilities', () => {
  describe('topScreen()', () => {
    it('returns last element from stack', () => {
      const stack: readonly ScreenState[] = [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' },
        { step: 3, data: 'third' }
      ];

      const top = topScreen(stack);

      expect(top).toEqual({ step: 3, data: 'third' });
    });

    it('returns null for empty stack', () => {
      const stack: readonly ScreenState[] = [];

      const top = topScreen(stack);

      expect(top).toBeNull();
    });

    it('returns only element for single-element stack', () => {
      const stack: readonly ScreenState[] = [{ step: 1, data: 'only' }];

      const top = topScreen(stack);

      expect(top).toEqual({ step: 1, data: 'only' });
    });
  });

  describe('rootScreen()', () => {
    it('returns first element from stack', () => {
      const stack: readonly ScreenState[] = [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' },
        { step: 3, data: 'third' }
      ];

      const root = rootScreen(stack);

      expect(root).toEqual({ step: 1, data: 'first' });
    });

    it('returns null for empty stack', () => {
      const stack: readonly ScreenState[] = [];

      const root = rootScreen(stack);

      expect(root).toBeNull();
    });

    it('returns only element for single-element stack', () => {
      const stack: readonly ScreenState[] = [{ step: 1, data: 'only' }];

      const root = rootScreen(stack);

      expect(root).toEqual({ step: 1, data: 'only' });
    });
  });

  describe('canGoBack()', () => {
    it('returns true when stack length > 1', () => {
      const stack: readonly ScreenState[] = [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' }
      ];

      expect(canGoBack(stack)).toBe(true);
    });

    it('returns false when stack length is 1', () => {
      const stack: readonly ScreenState[] = [{ step: 1, data: 'only' }];

      expect(canGoBack(stack)).toBe(false);
    });

    it('returns false when stack is empty', () => {
      const stack: readonly ScreenState[] = [];

      expect(canGoBack(stack)).toBe(false);
    });

    it('returns true for stack with many elements', () => {
      const stack: readonly ScreenState[] = [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' },
        { step: 3, data: 'third' },
        { step: 4, data: 'fourth' }
      ];

      expect(canGoBack(stack)).toBe(true);
    });
  });

  describe('stackDepth()', () => {
    it('returns stack length', () => {
      const stack: readonly ScreenState[] = [
        { step: 1, data: 'first' },
        { step: 2, data: 'second' },
        { step: 3, data: 'third' }
      ];

      expect(stackDepth(stack)).toBe(3);
    });

    it('returns 0 for empty stack', () => {
      const stack: readonly ScreenState[] = [];

      expect(stackDepth(stack)).toBe(0);
    });

    it('returns 1 for single-element stack', () => {
      const stack: readonly ScreenState[] = [{ step: 1, data: 'only' }];

      expect(stackDepth(stack)).toBe(1);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Stack Integration', () => {
  it('handles complete navigation flow', () => {
    let state: ParentState = {
      stack: [{ step: 1, data: 'start' }],
      history: []
    };

    // Push second screen
    const [newStack1] = push(state.stack, { step: 2, data: 'second' });
    state = { ...state, stack: newStack1 };
    expect(state.stack).toHaveLength(2);

    // Push third screen
    const [newStack2] = push(state.stack, { step: 3, data: 'third' });
    state = { ...state, stack: newStack2 };
    expect(state.stack).toHaveLength(3);

    // Pop back
    const [newStack3] = pop(state.stack);
    state = { ...state, stack: newStack3 };
    expect(state.stack).toHaveLength(2);
    expect(topScreen(state.stack)?.step).toBe(2);

    // Pop to root
    const [newStack4] = popToRoot(state.stack);
    state = { ...state, stack: newStack4 };
    expect(state.stack).toHaveLength(1);
    expect(topScreen(state.stack)?.step).toBe(1);
  });

  it('handles deep linking with setPath', () => {
    let state: ParentState = {
      stack: [{ step: 1, data: 'start' }],
      history: []
    };

    // Deep link to step 5
    const deepPath = [
      { step: 1, data: 'start' },
      { step: 2, data: 'second' },
      { step: 3, data: 'third' },
      { step: 4, data: 'fourth' },
      { step: 5, data: 'fifth' }
    ];

    const [newStack] = setPath(deepPath);
    state = { ...state, stack: newStack };

    expect(state.stack).toHaveLength(5);
    expect(topScreen(state.stack)?.step).toBe(5);
    expect(rootScreen(state.stack)?.step).toBe(1);
    expect(canGoBack(state.stack)).toBe(true);
    expect(stackDepth(state.stack)).toBe(5);
  });

  it('maintains immutability throughout navigation', () => {
    const originalStack: readonly ScreenState[] = [
      { step: 1, data: 'first' },
      { step: 2, data: 'second' }
    ];

    // Push
    const [afterPush] = push(originalStack, { step: 3, data: 'third' });
    expect(originalStack).toHaveLength(2); // Original unchanged

    // Pop
    const [afterPop] = pop(afterPush);
    expect(originalStack).toHaveLength(2); // Original unchanged
    expect(afterPush).toHaveLength(3); // Previous step unchanged

    // PopToRoot
    const [afterPopToRoot] = popToRoot(afterPop);
    expect(originalStack).toHaveLength(2); // Original unchanged
    expect(afterPop).toHaveLength(2); // Previous step unchanged
    expect(afterPopToRoot).toHaveLength(1); // Result correct
  });
});
