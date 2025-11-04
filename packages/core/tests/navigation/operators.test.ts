/**
 * Tests for navigation operators: ifLet, createDestinationReducer, matchers
 */

import { describe, it, expect } from 'vitest';
import { Effect } from '../../src/lib/effect.js';
import {
  ifLet,
  ifLetPresentation,
  createDestinationReducer,
  createDestination,
  isDestinationType,
  extractDestinationState,
  matchPresentationAction,
  isActionAtPath,
  matchPaths,
  extractDestinationOnAction,
  type PresentationAction,
  type DestinationState
} from '../../src/lib/navigation/index.js';
import type { Reducer } from '../../src/lib/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

// Child state and actions for ifLet tests
interface ChildState {
  count: number;
  message: string;
}

type ChildAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'setMessage'; message: string };

// Parent state and actions
interface ParentState {
  child: ChildState | null;
  parentCount: number;
}

type ParentAction =
  | { type: 'showChild' }
  | { type: 'hideChild' }
  | { type: 'child'; action: PresentationAction<ChildAction> }
  | { type: 'incrementParent' };

// Child reducer for testing
const childReducer: Reducer<ChildState, ChildAction, null> = (state, action) => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];
    case 'decrement':
      return [{ ...state, count: state.count - 1 }, Effect.none()];
    case 'setMessage':
      return [{ ...state, message: action.message }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

// Destination states for enum tests
type AddItemState = { item: string; quantity: number };
type EditItemState = { id: string; item: string; quantity: number };

type Destination =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState };

type DestinationAction =
  | { type: 'updateItem'; value: string }
  | { type: 'updateQuantity'; value: number }
  | { type: 'save' }
  | { type: 'cancel' };

const addItemReducer: Reducer<AddItemState, DestinationAction, null> = (state, action) => {
  switch (action.type) {
    case 'updateItem':
      return [{ ...state, item: action.value }, Effect.none()];
    case 'updateQuantity':
      return [{ ...state, quantity: action.value }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

const editItemReducer: Reducer<EditItemState, DestinationAction, null> = (state, action) => {
  switch (action.type) {
    case 'updateItem':
      return [{ ...state, item: action.value }, Effect.none()];
    case 'updateQuantity':
      return [{ ...state, quantity: action.value }, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

// ============================================================================
// ifLet() Tests
// ============================================================================

describe('ifLet()', () => {
  it('returns unchanged state when child state is null', () => {
    const parentState: ParentState = { child: null, parentCount: 0 };
    const action: ParentAction = {
      type: 'child',
      action: { type: 'presented', action: { type: 'increment' } }
    };

    const reducer = ifLet<ParentState, ParentAction, ChildState, ChildAction, null>(
      (s) => s.child,
      (s, c) => ({ ...s, child: c }),
      (a) =>
        a.type === 'child' && a.action.type === 'presented' ? a.action.action : null,
      (ca) => ({ type: 'child', action: { type: 'presented', action: ca } }),
      childReducer
    );

    const [newState, effect] = reducer(parentState, action, null);

    expect(newState).toBe(parentState); // Same reference
    expect(effect._tag).toBe('None');
  });

  it('returns unchanged state when action does not match child', () => {
    const parentState: ParentState = {
      child: { count: 5, message: 'hello' },
      parentCount: 0
    };
    const action: ParentAction = { type: 'incrementParent' };

    const reducer = ifLet<ParentState, ParentAction, ChildState, ChildAction, null>(
      (s) => s.child,
      (s, c) => ({ ...s, child: c }),
      (a) =>
        a.type === 'child' && a.action.type === 'presented' ? a.action.action : null,
      (ca) => ({ type: 'child', action: { type: 'presented', action: ca } }),
      childReducer
    );

    const [newState, effect] = reducer(parentState, action, null);

    expect(newState).toBe(parentState); // Same reference
    expect(effect._tag).toBe('None');
  });

  it('runs child reducer when child state is non-null and action matches', () => {
    const parentState: ParentState = {
      child: { count: 5, message: 'hello' },
      parentCount: 0
    };
    const action: ParentAction = {
      type: 'child',
      action: { type: 'presented', action: { type: 'increment' } }
    };

    const reducer = ifLet<ParentState, ParentAction, ChildState, ChildAction, null>(
      (s) => s.child,
      (s, c) => ({ ...s, child: c }),
      (a) =>
        a.type === 'child' && a.action.type === 'presented' ? a.action.action : null,
      (ca) => ({ type: 'child', action: { type: 'presented', action: ca } }),
      childReducer
    );

    const [newState, effect] = reducer(parentState, action, null);

    expect(newState.child).not.toBeNull();
    expect(newState.child?.count).toBe(6); // Incremented
    expect(newState.child?.message).toBe('hello'); // Unchanged
    expect(newState.parentCount).toBe(0); // Unchanged
    expect(effect._tag).toBe('None');
  });

  it('updates child state correctly for different actions', () => {
    const parentState: ParentState = {
      child: { count: 5, message: 'hello' },
      parentCount: 0
    };

    const reducer = ifLet<ParentState, ParentAction, ChildState, ChildAction, null>(
      (s) => s.child,
      (s, c) => ({ ...s, child: c }),
      (a) =>
        a.type === 'child' && a.action.type === 'presented' ? a.action.action : null,
      (ca) => ({ type: 'child', action: { type: 'presented', action: ca } }),
      childReducer
    );

    // Test decrement
    const decrementAction: ParentAction = {
      type: 'child',
      action: { type: 'presented', action: { type: 'decrement' } }
    };
    const [state1] = reducer(parentState, decrementAction, null);
    expect(state1.child?.count).toBe(4);

    // Test setMessage
    const setMessageAction: ParentAction = {
      type: 'child',
      action: {
        type: 'presented',
        action: { type: 'setMessage', message: 'updated' }
      }
    };
    const [state2] = reducer(state1, setMessageAction, null);
    expect(state2.child?.message).toBe('updated');
    expect(state2.child?.count).toBe(4); // Unchanged
  });

  it('maps child effects to parent actions', () => {
    // Child reducer that produces an effect
    const childReducerWithEffect: Reducer<ChildState, ChildAction, null> = (
      state,
      action
    ) => {
      switch (action.type) {
        case 'increment':
          return [
            { ...state, count: state.count + 1 },
            Effect.run<ChildAction>((dispatch) => {
              dispatch({ type: 'setMessage', message: 'incremented' });
            })
          ];
        default:
          return [state, Effect.none()];
      }
    };

    const parentState: ParentState = {
      child: { count: 5, message: 'hello' },
      parentCount: 0
    };
    const action: ParentAction = {
      type: 'child',
      action: { type: 'presented', action: { type: 'increment' } }
    };

    const reducer = ifLet<ParentState, ParentAction, ChildState, ChildAction, null>(
      (s) => s.child,
      (s, c) => ({ ...s, child: c }),
      (a) =>
        a.type === 'child' && a.action.type === 'presented' ? a.action.action : null,
      (ca) => ({ type: 'child', action: { type: 'presented', action: ca } }),
      childReducerWithEffect
    );

    const [newState, effect] = reducer(parentState, action, null);

    expect(newState.child?.count).toBe(6);
    expect(effect._tag).toBe('Run'); // Effect was mapped

    // Execute the effect and verify it dispatches parent action
    const dispatched: ParentAction[] = [];
    if (effect._tag === 'Run') {
      effect.execute((a) => dispatched.push(a));
    }

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      type: 'child',
      action: {
        type: 'presented',
        action: { type: 'setMessage', message: 'incremented' }
      }
    });
  });
});

// ============================================================================
// ifLetPresentation() Tests
// ============================================================================

describe('ifLetPresentation()', () => {
  it('unwraps PresentationAction.presented automatically', () => {
    const parentState: ParentState = {
      child: { count: 5, message: 'hello' },
      parentCount: 0
    };
    const action: ParentAction = {
      type: 'child',
      action: { type: 'presented', action: { type: 'increment' } }
    };

    const reducer = ifLetPresentation<ParentState, ParentAction, ChildState, ChildAction, null>(
      (s) => s.child,
      (s, c) => ({ ...s, child: c }),
      'child',
      (ca) => ({ type: 'child', action: { type: 'presented', action: ca } }),
      childReducer
    );

    const [newState, effect] = reducer(parentState, action, null);

    expect(newState.child?.count).toBe(6); // Incremented
    expect(effect._tag).toBe('None');
  });

  it('handles dismiss action automatically by setting child to null', () => {
    const parentState: ParentState = {
      child: { count: 5, message: 'hello' },
      parentCount: 0
    };
    const action: ParentAction = {
      type: 'child',
      action: { type: 'dismiss' }
    };

    const reducer = ifLetPresentation<ParentState, ParentAction, ChildState, ChildAction, null>(
      (s) => s.child,
      (s, c) => ({ ...s, child: c }),
      'child',
      (ca) => ({ type: 'child', action: { type: 'presented', action: ca } }),
      childReducer
    );

    const [newState, effect] = reducer(parentState, action, null);

    expect(newState.child).toBeNull(); // Dismissed
    expect(effect._tag).toBe('None');
  });

  it('returns unchanged state for non-matching action types', () => {
    const parentState: ParentState = {
      child: { count: 5, message: 'hello' },
      parentCount: 0
    };
    const action: ParentAction = { type: 'incrementParent' };

    const reducer = ifLetPresentation<ParentState, ParentAction, ChildState, ChildAction, null>(
      (s) => s.child,
      (s, c) => ({ ...s, child: c }),
      'child',
      (ca) => ({ type: 'child', action: { type: 'presented', action: ca } }),
      childReducer
    );

    const [newState, effect] = reducer(parentState, action, null);

    expect(newState).toBe(parentState); // Same reference
    expect(effect._tag).toBe('None');
  });

  it('returns unchanged state when child is null', () => {
    const parentState: ParentState = { child: null, parentCount: 0 };
    const action: ParentAction = {
      type: 'child',
      action: { type: 'presented', action: { type: 'increment' } }
    };

    const reducer = ifLetPresentation<ParentState, ParentAction, ChildState, ChildAction, null>(
      (s) => s.child,
      (s, c) => ({ ...s, child: c }),
      'child',
      (ca) => ({ type: 'child', action: { type: 'presented', action: ca } }),
      childReducer
    );

    const [newState, effect] = reducer(parentState, action, null);

    expect(newState).toBe(parentState); // Same reference
    expect(effect._tag).toBe('None');
  });

  it('maps child effects to parent actions correctly', () => {
    const childReducerWithEffect: Reducer<ChildState, ChildAction, null> = (
      state,
      action
    ) => {
      switch (action.type) {
        case 'increment':
          return [
            { ...state, count: state.count + 1 },
            Effect.run<ChildAction>((dispatch) => {
              dispatch({ type: 'setMessage', message: 'incremented' });
            })
          ];
        default:
          return [state, Effect.none()];
      }
    };

    const parentState: ParentState = {
      child: { count: 5, message: 'hello' },
      parentCount: 0
    };
    const action: ParentAction = {
      type: 'child',
      action: { type: 'presented', action: { type: 'increment' } }
    };

    const reducer = ifLetPresentation<ParentState, ParentAction, ChildState, ChildAction, null>(
      (s) => s.child,
      (s, c) => ({ ...s, child: c }),
      'child',
      (ca) => ({ type: 'child', action: { type: 'presented', action: ca } }),
      childReducerWithEffect
    );

    const [newState, effect] = reducer(parentState, action, null);

    expect(newState.child?.count).toBe(6);
    expect(effect._tag).toBe('Run');

    // Execute and verify wrapped action
    const dispatched: ParentAction[] = [];
    if (effect._tag === 'Run') {
      effect.execute((a) => dispatched.push(a));
    }

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      type: 'child',
      action: {
        type: 'presented',
        action: { type: 'setMessage', message: 'incremented' }
      }
    });
  });
});

// ============================================================================
// createDestinationReducer() Tests
// ============================================================================

describe('createDestinationReducer()', () => {
  it('routes to correct reducer based on destination type', () => {
    const reducer = createDestinationReducer<Destination, DestinationAction, null>({
      addItem: addItemReducer,
      editItem: editItemReducer
    });

    const addDest: Destination = {
      type: 'addItem',
      state: { item: 'apple', quantity: 1 }
    };

    const action: DestinationAction = { type: 'updateItem', value: 'banana' };

    const [newDest] = reducer(addDest, action, null);

    expect(newDest.type).toBe('addItem');
    expect((newDest as { type: 'addItem'; state: AddItemState }).state.item).toBe(
      'banana'
    );
  });

  it('handles different destination types correctly', () => {
    const reducer = createDestinationReducer<Destination, DestinationAction, null>({
      addItem: addItemReducer,
      editItem: editItemReducer
    });

    const editDest: Destination = {
      type: 'editItem',
      state: { id: '123', item: 'orange', quantity: 5 }
    };

    const action: DestinationAction = { type: 'updateQuantity', value: 10 };

    const [newDest] = reducer(editDest, action, null);

    expect(newDest.type).toBe('editItem');
    const editState = (newDest as { type: 'editItem'; state: EditItemState }).state;
    expect(editState.quantity).toBe(10);
    expect(editState.item).toBe('orange'); // Unchanged
    expect(editState.id).toBe('123'); // Metadata preserved
  });

  it('returns unchanged destination for unknown destination type', () => {
    const reducer = createDestinationReducer<Destination, DestinationAction, null>({
      addItem: addItemReducer,
      editItem: editItemReducer
    });

    // Cast to bypass TypeScript (simulates runtime unknown type)
    const unknownDest = {
      type: 'unknown',
      state: { data: 'test' }
    } as any as Destination;

    const action: DestinationAction = { type: 'updateItem', value: 'test' };

    const [newDest, effect] = reducer(unknownDest, action, null);

    expect(newDest).toBe(unknownDest); // Unchanged
    expect(effect._tag).toBe('None');
  });

  it('preserves destination metadata during updates', () => {
    const reducer = createDestinationReducer<Destination, DestinationAction, null>({
      addItem: addItemReducer,
      editItem: editItemReducer
    });

    const editDest: Destination = {
      type: 'editItem',
      state: { id: '123', item: 'orange', quantity: 5 }
    };

    const action: DestinationAction = { type: 'updateItem', value: 'grape' };

    const [newDest] = reducer(editDest, action, null);

    expect(newDest.type).toBe('editItem');
    const editState = (newDest as { type: 'editItem'; state: EditItemState }).state;
    expect(editState.id).toBe('123'); // ID preserved
    expect(editState.item).toBe('grape'); // Item updated
  });
});

// ============================================================================
// Destination Helper Tests
// ============================================================================

describe('createDestination()', () => {
  it('creates destination with type and state', () => {
    const dest = createDestination('addItem', { item: 'apple', quantity: 1 });

    expect(dest.type).toBe('addItem');
    expect(dest.state).toEqual({ item: 'apple', quantity: 1 });
  });

  it('includes optional metadata', () => {
    const dest = createDestination(
      'editItem',
      { id: '123', item: 'banana', quantity: 2 },
      { timestamp: 123456 }
    );

    expect(dest.type).toBe('editItem');
    expect(dest.state).toEqual({ id: '123', item: 'banana', quantity: 2 });
    expect((dest as any).timestamp).toBe(123456);
  });
});

describe('isDestinationType()', () => {
  it('returns true for matching type', () => {
    const dest: Destination = {
      type: 'addItem',
      state: { item: 'apple', quantity: 1 }
    };

    expect(isDestinationType(dest, 'addItem')).toBe(true);
  });

  it('returns false for non-matching type', () => {
    const dest: Destination = {
      type: 'addItem',
      state: { item: 'apple', quantity: 1 }
    };

    expect(isDestinationType(dest, 'editItem')).toBe(false);
  });

  it('returns false for null destination', () => {
    expect(isDestinationType(null, 'addItem')).toBe(false);
  });

  it('narrows type correctly after check', () => {
    const dest: Destination = {
      type: 'addItem',
      state: { item: 'apple', quantity: 1 }
    };

    if (isDestinationType(dest, 'addItem')) {
      // Type is narrowed to { type: 'addItem'; state: AddItemState }
      expect(dest.state.item).toBe('apple');
    }
  });
});

describe('extractDestinationState()', () => {
  it('extracts state for matching type', () => {
    const dest: Destination = {
      type: 'addItem',
      state: { item: 'apple', quantity: 1 }
    };

    const state = extractDestinationState(dest, 'addItem');

    expect(state).toEqual({ item: 'apple', quantity: 1 });
  });

  it('returns null for non-matching type', () => {
    const dest: Destination = {
      type: 'addItem',
      state: { item: 'apple', quantity: 1 }
    };

    const state = extractDestinationState(dest, 'editItem');

    expect(state).toBeNull();
  });

  it('returns null for null destination', () => {
    const state = extractDestinationState(null, 'addItem');

    expect(state).toBeNull();
  });
});

// ============================================================================
// Matcher Tests
// ============================================================================

describe('matchPresentationAction()', () => {
  it('matches single-level path', () => {
    const action: ParentAction = { type: 'showChild' };

    const matched = matchPresentationAction<ParentAction>(action, 'showChild');

    expect(matched).toEqual({ type: 'showChild' });
  });

  it('matches nested PresentationAction path', () => {
    const action: ParentAction = {
      type: 'child',
      action: { type: 'presented', action: { type: 'increment' } }
    };

    const matched = matchPresentationAction<ChildAction>(action, 'child.increment');

    expect(matched).toEqual({ type: 'increment' });
  });

  it('returns null for non-matching path', () => {
    const action: ParentAction = { type: 'showChild' };

    const matched = matchPresentationAction<ParentAction>(action, 'hideChild');

    expect(matched).toBeNull();
  });

  it('returns null for non-matching nested path', () => {
    const action: ParentAction = {
      type: 'child',
      action: { type: 'presented', action: { type: 'increment' } }
    };

    const matched = matchPresentationAction<ChildAction>(action, 'child.decrement');

    expect(matched).toBeNull();
  });

  it('returns null for dismiss action when matching child action', () => {
    const action: ParentAction = {
      type: 'child',
      action: { type: 'dismiss' }
    };

    const matched = matchPresentationAction<ChildAction>(action, 'child.increment');

    expect(matched).toBeNull();
  });

  it('handles deep nested paths', () => {
    type DeepAction = {
      type: 'level1';
      action: PresentationAction<{
        type: 'level2';
        action: PresentationAction<{ type: 'level3'; value: number }>;
      }>;
    };

    const action: DeepAction = {
      type: 'level1',
      action: {
        type: 'presented',
        action: {
          type: 'level2',
          action: {
            type: 'presented',
            action: { type: 'level3', value: 42 }
          }
        }
      }
    };

    const matched = matchPresentationAction<{ type: 'level3'; value: number }>(
      action,
      'level1.level2.level3'
    );

    expect(matched).toEqual({ type: 'level3', value: 42 });
  });

  it('returns null for invalid action structure', () => {
    const action = { type: 'child' }; // Missing action field

    const matched = matchPresentationAction<ChildAction>(action, 'child.increment');

    expect(matched).toBeNull();
  });
});

describe('isActionAtPath()', () => {
  it('returns true for matching path without predicate', () => {
    const action: ParentAction = {
      type: 'child',
      action: { type: 'presented', action: { type: 'increment' } }
    };

    const result = isActionAtPath(action, 'child.increment');

    expect(result).toBe(true);
  });

  it('returns false for non-matching path', () => {
    const action: ParentAction = {
      type: 'child',
      action: { type: 'presented', action: { type: 'increment' } }
    };

    const result = isActionAtPath(action, 'child.decrement');

    expect(result).toBe(false);
  });

  it('applies predicate when provided', () => {
    const action: ParentAction = {
      type: 'child',
      action: {
        type: 'presented',
        action: { type: 'setMessage', message: 'hello' }
      }
    };

    const result = isActionAtPath<ChildAction>(
      action,
      'child.setMessage',
      (a) => a.type === 'setMessage' && a.message === 'hello'
    );

    expect(result).toBe(true);
  });

  it('returns false when predicate fails', () => {
    const action: ParentAction = {
      type: 'child',
      action: {
        type: 'presented',
        action: { type: 'setMessage', message: 'hello' }
      }
    };

    const result = isActionAtPath<ChildAction>(
      action,
      'child.setMessage',
      (a) => a.type === 'setMessage' && a.message === 'goodbye'
    );

    expect(result).toBe(false);
  });
});

describe('matchPaths()', () => {
  it('executes handler for first matching path', () => {
    const action: ParentAction = {
      type: 'child',
      action: { type: 'presented', action: { type: 'increment' } }
    };

    const result = matchPaths(action, {
      'child.increment': (a: ChildAction) => `incremented`,
      'child.decrement': (a: ChildAction) => `decremented`
    });

    expect(result).toBe('incremented');
  });

  it('returns null if no paths match', () => {
    const action: ParentAction = {
      type: 'child',
      action: {
        type: 'presented',
        action: { type: 'setMessage', message: 'hello' }
      }
    };

    const result = matchPaths(action, {
      'child.increment': (a: ChildAction) => `incremented`,
      'child.decrement': (a: ChildAction) => `decremented`
    });

    expect(result).toBeNull();
  });

  it('passes matched action to handler', () => {
    const action: ParentAction = {
      type: 'child',
      action: {
        type: 'presented',
        action: { type: 'setMessage', message: 'hello' }
      }
    };

    const result = matchPaths(action, {
      'child.setMessage': (a: ChildAction) => {
        expect(a.type).toBe('setMessage');
        if (a.type === 'setMessage') {
          return a.message;
        }
        return '';
      }
    });

    expect(result).toBe('hello');
  });

  it('returns null when no paths match', () => {
    const action: ParentAction = {
      type: 'child',
      action: { type: 'presented', action: { type: 'increment' } }
    };

    const result = matchPaths(action, {
      'child.decrement': (a: ChildAction) => `decremented`,
      'child.setMessage': (a: ChildAction) => `message set`
    });

    expect(result).toBeNull();
  });
});

describe('extractDestinationOnAction()', () => {
  interface TestParentState {
    destination: Destination | null;
  }

  it('returns destination state when action matches', () => {
    const state: TestParentState = {
      destination: {
        type: 'addItem',
        state: { item: 'apple', quantity: 1 }
      }
    };

    const action = {
      type: 'destination',
      action: {
        type: 'presented',
        action: { type: 'save' }
      }
    };

    const destState = extractDestinationOnAction(
      action,
      state,
      'destination.save',
      (s) => s.destination
    );

    expect(destState).toEqual({
      type: 'addItem',
      state: { item: 'apple', quantity: 1 }
    });
  });

  it('returns null when action does not match', () => {
    const state: TestParentState = {
      destination: {
        type: 'addItem',
        state: { item: 'apple', quantity: 1 }
      }
    };

    const action = {
      type: 'destination',
      action: {
        type: 'presented',
        action: { type: 'cancel' }
      }
    };

    const destState = extractDestinationOnAction(
      action,
      state,
      'destination.save',
      (s) => s.destination
    );

    expect(destState).toBeNull();
  });

  it('returns null when destination is null', () => {
    const state: TestParentState = {
      destination: null
    };

    const action = {
      type: 'destination',
      action: {
        type: 'presented',
        action: { type: 'save' }
      }
    };

    const destState = extractDestinationOnAction(
      action,
      state,
      'destination.save',
      (s) => s.destination
    );

    expect(destState).toBeNull();
  });
});
