# Phase 9: `forEach` - Collection Management DSL

## Overview

Eliminate boilerplate for managing dynamic collections of child features by providing `forEach` composition primitives inspired by Swift TCA's `forEach` operator.

**Problem**: Current pattern requires 50+ lines of repetitive code:
- **Reducer**: 28 lines (findIndex, guard, update array, map effect)
- **View**: 23 lines (createScopedStore with manual getter/dispatcher)

**Solution**: Reduce to ~3 lines per collection with type-safe DSL.

---

## Current Boilerplate Analysis

### Reducer Boilerplate (28 lines)

```typescript
case 'counter': {
  // 1. Find item by ID (2 lines)
  const index = state.counters.findIndex(c => c.id === action.id);
  if (index === -1) {
    return [state, Effect.none()];
  }

  // 2. Get item and run child reducer (3 lines)
  const counter = state.counters[index];
  const [newCounterState, childEffect] = counterReducer(
    counter.state,
    action.action,
    deps
  );

  // 3. Update array immutably (2 lines)
  const newCounters = [...state.counters];
  newCounters[index] = { ...counter, state: newCounterState };

  // 4. Map child effects (3 lines)
  const mappedEffect = Effect.map(
    childEffect,
    (childAction: CounterAction) => ({ type: 'counter' as const, id: action.id, action: childAction })
  );

  // 5. Return updated state (3 lines)
  return [
    { ...state, counters: newCounters },
    mappedEffect
  ];
}
```

**Issues**:
- Easy to forget Effect.map (breaks child effects)
- Easy to mutate array instead of immutable update
- Repetitive across every collection
- ID type safety requires manual casting
- Same pattern for todos, users, products, etc.

### View Boilerplate (23 lines)

```typescript
function createScopedStore(id: string): Store<CounterState, CounterAction> {
  const parentStore = store;
  const scopedStore: Store<CounterState, CounterAction> = {
    get state() {
      const counter = parentStore.state.counters.find(c => c.id === id);
      return counter ? counter.state : { count: 0, isLoading: false };
    },
    dispatch(action: CounterAction) {
      parentStore.dispatch({ type: 'counter', id, action });
    },
    select(selector) {
      return selector(scopedStore.state);
    },
    subscribe(listener) {
      return parentStore.subscribe((parentState) => {
        const counter = parentState.counters.find(c => c.id === id);
        if (counter) {
          listener(counter.state);
        }
      });
    },
    history: [],
    destroy() {}
  };
  return scopedStore;
}
```

**Issues**:
- Recreated for every collection type
- Manual Store interface implementation
- Fallback state handling inconsistent
- No memoization (creates new store on every render in loop)

---

## Design Goals

1. **Eliminate Boilerplate**: Reduce 50+ lines to ~3 lines
2. **Type Safety**: Full inference, no `any` casts
3. **Composability**: Works with existing `integrate` DSL
4. **Performance**: O(n) find is acceptable, immutable updates efficient
5. **Flexibility**: Common case trivial, complex cases possible
6. **Consistency**: Mirror Swift TCA naming and patterns
7. **Testability**: Works seamlessly with TestStore

---

## API Design

### 1. Core Primitive: `forEach`

Full-control version for complex cases:

```typescript
export function forEach<
  ParentState,
  ParentAction,
  ChildState,
  ChildAction,
  ID extends string | number,
  Dependencies
>(config: {
  // Array access
  getArray: (state: ParentState) => Array<{ id: ID; state: ChildState }>;
  setArray: (state: ParentState, array: Array<{ id: ID; state: ChildState }>) => ParentState;

  // Action routing
  extractChild: (action: ParentAction) => { id: ID; action: ChildAction } | null;
  wrapChild: (id: ID, action: ChildAction) => ParentAction;

  // Child reducer
  childReducer: Reducer<ChildState, ChildAction, Dependencies>;
}): Reducer<ParentState, ParentAction, Dependencies>;
```

**Implementation Strategy**:
```typescript
export function forEach<...>(config: ForEachConfig<...>): Reducer<...> {
  const { getArray, setArray, extractChild, wrapChild, childReducer } = config;

  return (state, action, deps) => {
    // 1. Extract child action + ID
    const extracted = extractChild(action);
    if (!extracted) {
      return [state, Effect.none()];
    }

    const { id, action: childAction } = extracted;

    // 2. Find item
    const array = getArray(state);
    const index = array.findIndex(item => item.id === id);

    if (index === -1) {
      // ID not found - ignore silently (item may have been removed)
      return [state, Effect.none()];
    }

    // 3. Run child reducer
    const item = array[index];
    const [newChildState, childEffect] = childReducer(item.state, childAction, deps);

    // 4. Update array immutably
    const newArray = [...array];
    newArray[index] = { ...item, state: newChildState };

    // 5. Map child effect
    const mappedEffect = Effect.map(childEffect, (a: ChildAction) => wrapChild(id, a));

    return [setArray(state, newArray), mappedEffect];
  };
}
```

### 2. Convenience: `forEachElement`

Simplified API for standard pattern (90% of cases):

```typescript
export function forEachElement<
  ParentState,
  ParentAction extends { type: string },
  ChildState,
  ChildAction,
  ID extends string | number,
  Dependencies
>(
  actionType: string,
  getArray: (state: ParentState) => Array<{ id: ID; state: ChildState }>,
  setArray: (state: ParentState, array: Array<{ id: ID; state: ChildState }>) => ParentState,
  childReducer: Reducer<ChildState, ChildAction, Dependencies>
): Reducer<ParentState, ParentAction, Dependencies>;
```

**Implementation**:
```typescript
export function forEachElement<...>(
  actionType: string,
  getArray,
  setArray,
  childReducer
): Reducer<...> {
  return forEach({
    getArray,
    setArray,
    extractChild: (action) => {
      if (action.type === actionType && 'id' in action && 'action' in action) {
        const { id, action: childAction } = action as any;
        return { id, action: childAction };
      }
      return null;
    },
    wrapChild: (id, action) => ({ type: actionType, id, action } as ParentAction),
    childReducer
  });
}
```

### 3. Integration with `integrate` DSL

Add `forEach` method to `IntegrateBuilder`:

```typescript
class IntegrateBuilder<State, Action, Deps> {
  private reducers: Array<Reducer<State, Action, Deps>> = [];

  forEach<ChildState, ChildAction, ID extends string | number>(
    actionType: string,
    getArray: (state: State) => Array<{ id: ID; state: ChildState }>,
    setArray: (state: State, array: Array<{ id: ID; state: ChildState }>) => State,
    childReducer: Reducer<ChildState, ChildAction, Deps>
  ): IntegrateBuilder<State, Action, Deps> {
    this.reducers.push(
      forEachElement(actionType, getArray, setArray, childReducer)
    );
    return this;
  }

  // Existing methods...
  with(reducer: Reducer<State, Action, Deps>): IntegrateBuilder<State, Action, Deps>
  reduce(reducer: Reducer<State, Action, Deps>): IntegrateBuilder<State, Action, Deps>
  build(): Reducer<State, Action, Deps>
}
```

**Usage**:
```typescript
const reducer = integrate<CountersState, CountersAction, Deps>()
  .forEach(
    'counter',                                      // action type
    s => s.counters,                                // getter
    (s, counters) => ({ ...s, counters }),         // setter
    counterReducer                                   // child reducer
  )
  .reduce((state, action) => {
    // Only handle add/remove, forEach handles routing
    switch (action.type) {
      case 'addCounter':
        return [...];
      case 'removeCounter':
        return [...];
      default:
        return [state, Effect.none()];
    }
  })
  .build();
```

### 4. View Layer: `scopeToElement`

Eliminate createScopedStore boilerplate:

```typescript
export function scopeToElement<ParentState, ParentAction, ChildState, ChildAction, ID>(
  parentStore: Store<ParentState, ParentAction>,
  actionType: string,
  getArray: (state: ParentState) => Array<{ id: ID; state: ChildState }>,
  id: ID
): Store<ChildState, ChildAction> | null;
```

**Implementation**:
```typescript
export function scopeToElement<...>(
  parentStore,
  actionType,
  getArray,
  id
): Store<ChildState, ChildAction> | null {
  // Check if item exists
  const item = getArray(parentStore.state).find(i => i.id === id);
  if (!item) return null;

  return {
    get state() {
      const current = getArray(parentStore.state).find(i => i.id === id);
      if (!current) {
        throw new Error(`Element with id ${id} was removed`);
      }
      return current.state;
    },

    dispatch(action: ChildAction) {
      parentStore.dispatch({
        type: actionType,
        id,
        action
      } as any as ParentAction);
    },

    select<T>(selector: (state: ChildState) => T): T {
      return selector(this.state);
    },

    subscribe(listener: (state: ChildState) => void) {
      let previousState = this.state;

      return parentStore.subscribe((parentState) => {
        const current = getArray(parentState).find(i => i.id === id);
        if (current && current.state !== previousState) {
          previousState = current.state;
          listener(current.state);
        }
      });
    },

    subscribeToActions: undefined,
    history: [],
    destroy: () => {}
  };
}
```

**Usage**:
```svelte
{#each $store.counters as counter (counter.id)}
  <Counter store={scopeToElement(store, 'counter', s => s.counters, counter.id)} />
{/each}
```

### 5. Type Helpers

```typescript
// Standard item shape
export type IdentifiedItem<ID, State> = { id: ID; state: State };

// Standard action shape
export type ElementAction<ActionType extends string, ID, Action> = {
  type: ActionType;
  id: ID;
  action: Action;
};

// Helper to create element actions
export function elementAction<ActionType extends string, ID, Action>(
  type: ActionType,
  id: ID,
  action: Action
): ElementAction<ActionType, ID, Action> {
  return { type, id, action };
}
```

---

## Before/After Comparison

### Reducer

**Before** (28 lines):
```typescript
case 'counter': {
  const index = state.counters.findIndex(c => c.id === action.id);
  if (index === -1) return [state, Effect.none()];

  const counter = state.counters[index];
  const [newCounterState, childEffect] = counterReducer(
    counter.state,
    action.action,
    deps
  );

  const newCounters = [...state.counters];
  newCounters[index] = { ...counter, state: newCounterState };

  const mappedEffect = Effect.map(
    childEffect,
    (childAction: CounterAction) => ({ type: 'counter' as const, id: action.id, action: childAction })
  );

  return [{ ...state, counters: newCounters }, mappedEffect];
}
```

**After** (3 lines):
```typescript
const reducer = integrate<CountersState, CountersAction, Deps>()
  .forEach('counter', s => s.counters, (s, counters) => ({ ...s, counters }), counterReducer)
  .reduce(/* only add/remove logic */)
  .build();
```

### View

**Before** (23 lines + function definition):
```svelte
<script>
  function createScopedStore(id: string): Store<CounterState, CounterAction> {
    // ... 23 lines
  }
</script>

{#each $store.counters as counter}
  <Counter store={createScopedStore(counter.id)} />
{/each}
```

**After** (1 line):
```svelte
{#each $store.counters as counter (counter.id)}
  <Counter store={scopeToElement(store, 'counter', s => s.counters, counter.id)} />
{/each}
```

**Savings**: 50+ lines → 4 lines (92% reduction)

---

## Edge Cases & Error Handling

### 1. ID Not Found

```typescript
// In forEach: Silently ignore (item may have been removed mid-effect)
if (index === -1) {
  return [state, Effect.none()];
}
```

**Rationale**: Effects may dispatch actions for removed items. Silent ignore prevents crashes.

### 2. Item Removed While Subscribed

```typescript
// In scopeToElement.state getter: Throw error
get state() {
  const current = getArray(parentStore.state).find(i => i.id === id);
  if (!current) {
    throw new Error(`Element with id ${id} was removed`);
  }
  return current.state;
}
```

**Rationale**: Component should unmount before accessing removed item's state.

### 3. Duplicate IDs

**Prevention**: User responsibility to ensure unique IDs.

**Detection**: Could add debug mode warning:
```typescript
if (process.env.NODE_ENV === 'development') {
  const ids = array.map(item => item.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    console.warn('[forEach] Duplicate IDs detected:', ids);
  }
}
```

### 4. ID Type Coercion

**Strategy**: Use strict equality (`===`) for ID comparison.

**User guidance**: Ensure consistent ID types (all strings or all numbers).

### 5. Empty Arrays

```typescript
// Works naturally - findIndex returns -1, reducer returns [state, Effect.none()]
```

### 6. Effect Execution Order

**Guarantee**: Child effects execute after parent state update.

**Implementation**: Effect.map preserves execution order.

---

## Performance Considerations

### 1. `findIndex` Complexity

- **Complexity**: O(n) for each child action
- **Acceptable for**: Arrays up to ~1000 items (typical UI limits)
- **Alternative**: Add Map<ID, index> cache if needed (future optimization)

### 2. Immutable Array Updates

- **Strategy**: Shallow copy array, replace single item
- **Cost**: O(n) copy, but modern engines optimize this
- **Benefit**: Prevents accidental mutations, enables time-travel debugging

### 3. Store Scoping

**Problem**: Creating new store object on every render in `#each` loop.

**Solution**: Memoization via component `{#key}` block:
```svelte
{#each $store.counters as counter (counter.id)}
  {#key counter.id}
    <Counter store={scopeToElement(...)} />
  {/key}
{/each}
```

Or use derived store pattern (future enhancement):
```typescript
const childStores = derived(store, $store =>
  new Map($store.counters.map(c => [c.id, scopeToElement(store, 'counter', s => s.counters, c.id)]))
);
```

---

## Type Safety Analysis

### Generic Constraints

```typescript
forEach<
  ParentState,              // Parent reducer state
  ParentAction,             // Parent reducer action (no constraint needed)
  ChildState,               // Child reducer state
  ChildAction,              // Child reducer action
  ID extends string | number, // ID type (constrained to primitives for equality)
  Dependencies              // Dependency injection context
>
```

### Type Flow

1. **extractChild** returns `{ id: ID; action: ChildAction } | null`
   - TypeScript infers `ChildAction` from `childReducer`
   - ID type matches array item IDs

2. **wrapChild** must return `ParentAction`
   - Type checked at call site
   - Ensures action routing is bidirectional

3. **setArray** must accept same array type as getArray returns
   - Ensures state update consistency

### Inference Examples

```typescript
// TypeScript infers:
// - ChildState = CounterState
// - ChildAction = CounterAction
// - ID = string
integrate<CountersState, CountersAction, Deps>()
  .forEach('counter', s => s.counters, (s, c) => ({ ...s, counters: c }), counterReducer)
  //                      ^^^^^^^^^^^ Array<{ id: string; state: CounterState }>
  //                                                              ^^^^^^^^^^^^ inferred from counterReducer
```

---

## Testing Strategy

### 1. Unit Tests: `forEach` Reducer

```typescript
describe('forEach reducer combinator', () => {
  it('routes actions to child reducer by ID', () => {
    const childReducer = vi.fn((state, action) => [{ ...state, value: action.value }, Effect.none()]);
    const reducer = forEach({
      getArray: s => s.items,
      setArray: (s, items) => ({ ...s, items }),
      extractChild: a => a.type === 'item' ? { id: a.id, action: a.action } : null,
      wrapChild: (id, action) => ({ type: 'item', id, action }),
      childReducer
    });

    const initialState = {
      items: [
        { id: 'a', state: { value: 0 } },
        { id: 'b', state: { value: 0 } }
      ]
    };

    const [newState] = reducer(initialState, { type: 'item', id: 'a', action: { value: 5 } }, {});

    expect(newState.items[0].state.value).toBe(5);
    expect(newState.items[1].state.value).toBe(0);
    expect(childReducer).toHaveBeenCalledTimes(1);
  });

  it('returns unchanged state when ID not found', () => {
    // ... test
  });

  it('maps child effects to parent actions', async () => {
    // ... test with Effect.run
  });

  it('handles empty arrays', () => {
    // ... test
  });

  it('preserves other reducers in integrate chain', () => {
    // ... test
  });
});
```

### 2. Integration Tests: With `integrate`

```typescript
describe('forEach with integrate DSL', () => {
  it('works alongside other reducers', () => {
    const reducer = integrate<State, Action, Deps>()
      .forEach('child', s => s.children, (s, c) => ({ ...s, children: c }), childReducer)
      .reduce((state, action) => {
        if (action.type === 'add') {
          return [{ ...state, children: [...state.children, newChild] }, Effect.none()];
        }
        return [state, Effect.none()];
      })
      .build();

    // Test add action
    // Test child action
  });
});
```

### 3. View Tests: `scopeToElement`

```typescript
describe('scopeToElement', () => {
  it('creates scoped store for item by ID', () => {
    const parentStore = createStore({
      initialState: { items: [{ id: 'a', state: { value: 5 } }] },
      reducer
    });

    const childStore = scopeToElement(parentStore, 'item', s => s.items, 'a');

    expect(childStore.state.value).toBe(5);
  });

  it('returns null when ID not found', () => {
    const childStore = scopeToElement(parentStore, 'item', s => s.items, 'nonexistent');
    expect(childStore).toBeNull();
  });

  it('dispatches actions wrapped with ID', () => {
    const dispatchSpy = vi.spyOn(parentStore, 'dispatch');
    childStore.dispatch({ type: 'increment' });

    expect(dispatchSpy).toHaveBeenCalledWith({
      type: 'item',
      id: 'a',
      action: { type: 'increment' }
    });
  });

  it('subscribes to child state changes', async () => {
    const listener = vi.fn();
    childStore.subscribe(listener);

    parentStore.dispatch({ type: 'item', id: 'a', action: { type: 'increment' } });

    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
  });
});
```

### 4. TestStore Compatibility

```typescript
describe('forEach with TestStore', () => {
  it('supports send/receive for child actions', async () => {
    const store = createTestStore({ initialState, reducer, dependencies });

    await store.send({ type: 'item', id: 'a', action: { type: 'load' } }, state => {
      expect(state.items[0].state.isLoading).toBe(true);
    });

    await store.receive({ type: 'item', id: 'a', action: { type: 'loadComplete', data: 42 } }, state => {
      expect(state.items[0].state.data).toBe(42);
      expect(state.items[0].state.isLoading).toBe(false);
    });
  });
});
```

---

## Implementation Plan

### Step 1: Core `forEach` Primitive

**File**: `packages/core/src/lib/composition/for-each.ts`

```typescript
// Type definitions
export type IdentifiedItem<ID, State> = { id: ID; state: State };
export type ElementAction<Type extends string, ID, Action> = { type: Type; id: ID; action: Action };

// Core forEach
export function forEach<...>(config: { ... }): Reducer<...> { ... }

// Convenience forEachElement
export function forEachElement<...>(...): Reducer<...> { ... }
```

**Tests**: `packages/core/tests/composition/for-each.test.ts`

### Step 2: Integrate DSL Extension

**File**: `packages/core/src/lib/navigation/integrate.ts`

Add `forEach` method to `IntegrateBuilder` class.

**Tests**: Add to existing `integrate.test.ts`

### Step 3: View Layer Helper

**File**: `packages/core/src/lib/navigation/scope-to-element.ts`

```typescript
export function scopeToElement<...>(...): Store<ChildState, ChildAction> | null { ... }
```

**Tests**: `packages/core/tests/navigation/scope-to-element.test.ts`

### Step 4: Export from Index

**File**: `packages/core/src/lib/composition/index.ts`
```typescript
export { forEach, forEachElement, type IdentifiedItem, type ElementAction } from './for-each.js';
```

**File**: `packages/core/src/lib/index.ts`
```typescript
// Add to composition exports
export { scopeToElement } from './navigation/scope-to-element.js';
```

### Step 5: Documentation

**File**: `packages/core/docs/for-each-guide.md`

- Motivation (boilerplate problem)
- API overview
- Before/after examples
- Type safety guide
- Performance notes
- Common patterns
- Troubleshooting

### Step 6: Update User Demo

**Files**:
- `_client_tests/user-demo/src/routes/counters/counters.store.ts`
- `_client_tests/user-demo/src/routes/counters/+page.svelte`

Refactor to use new `forEach` and `scopeToElement` APIs.

---

## Success Criteria

1. ✅ Reduce boilerplate by >90% (50+ lines → <5 lines)
2. ✅ Full type inference (no manual type annotations needed)
3. ✅ Works with `integrate` DSL
4. ✅ Compatible with `TestStore`
5. ✅ Performance acceptable for arrays up to 1000 items
6. ✅ All tests passing (unit + integration)
7. ✅ User demo refactored successfully
8. ✅ Documentation complete

---

## Future Enhancements (Phase 10+)

### 1. Optimized Large Collections

For arrays >1000 items:
```typescript
forEachOptimized({
  // ... same config, but with Map<ID, index> caching
})
```

### 2. Derived Store Caching

Memoize scoped stores:
```typescript
const childStoresCache = scopeToElementCache(store, 'counter', s => s.counters);
// Returns Map<ID, Store<ChildState, ChildAction>>
```

### 3. Bulk Operations

```typescript
forEachBulk({
  // Update multiple items in single action
  extractChildren: (action) => Array<{ id, action }>
})
```

### 4. Sorted/Filtered Collections

```typescript
forEach({
  getArray: s => s.items.filter(i => i.isActive).sort((a, b) => a.priority - b.priority),
  // ... rest
})
```

### 5. Nested Collections

```typescript
forEach({
  getArray: s => s.groups.flatMap(g => g.items),
  // ... handle nested updates
})
```

---

## Comparison to Swift TCA

### Swift TCA

```swift
Reduce { state, action in
  switch action {
  case .add:
    state.items.append(Item(id: UUID()))
    return .none
  case .item:
    return .none
  }
}
.forEach(\.items, action: /Action.item) {
  ItemFeature()
}
```

### Composable Svelte

```typescript
integrate<State, Action, Deps>()
  .forEach('item', s => s.items, (s, items) => ({ ...s, items }), itemReducer)
  .reduce((state, action) => {
    if (action.type === 'add') {
      return [{ ...state, items: [...state.items, newItem] }, Effect.none()];
    }
    return [state, Effect.none()];
  })
  .build();
```

**Similarities**:
- Same name (`forEach`)
- Same concept (route actions by ID)
- Same composability (works with other reducers)

**Differences**:
- Swift uses key paths (`\.items`), we use getters/setters
- Swift uses case paths (`/Action.item`), we use string action types
- Swift has more concise syntax (language features)
- Our API is more explicit (no magic)

---

## Conclusion

The `forEach` DSL eliminates the most common boilerplate pattern in collection management, reducing code by >90% while improving type safety and consistency. It's a natural extension of our existing composition primitives and brings us closer to Swift TCA's ergonomics.

**Impact**:
- Every dynamic list becomes trivial to implement
- Fewer bugs from manual array updates
- Consistent pattern across entire codebase
- Easier onboarding (less boilerplate to explain)

**Next Steps**: Implement Step 1 (core primitive) and validate with counters example.
