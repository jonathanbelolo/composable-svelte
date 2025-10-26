# Navigation Matcher Specification

**Version:** 1.0.0
**Date:** 2025-10-25
**Status:** Draft

## Overview

This specification defines the **case path matcher system** for Composable Svelte navigation. The matcher system provides type-safe, elegant pattern matching for deeply nested navigation actions and states.

### Relationship to Navigation Spec

This matcher specification **extends** the navigation-spec.md with a higher-level DSL for working with destinations. The navigation spec (section 7.2: "Helper: Deep Action Matching" under "7. Integration Patterns") defines low-level helpers:

- `matchPresentationAction<T>(action, path)`: Generic path-based action matching
- `isActionAtPath<T>(action, path, predicate)`: Path matching with predicates

The matcher API in this spec provides:

- **Generated from domain models**: `createDestination()` auto-generates matchers from reducers
- **Type-safe case paths**: Full TypeScript inference for `'addItem.saveButtonTapped'`
- **Integrated state extraction**: `matchCase()` combines action matching + state extraction
- **Multiple handler support**: `match()` with exhaustive case handling

**Both approaches are valid**:
- Use **navigation-spec helpers** for generic, low-level matching when you don't have generated matchers
- Use **matcher API** for type-safe, domain-specific matching when using `createDestination()`

---

## Table of Contents

1. [Core Concepts](#1-core-concepts)
2. [Matcher API](#2-matcher-api)
3. [Implementation](#3-implementation)
4. [Usage Examples](#4-usage-examples)
5. [Advanced Patterns](#5-advanced-patterns)
6. [Testing](#6-testing)
7. [Performance](#7-performance)

---

## 1. Core Concepts

### 1.1 Case Paths

A **case path** is a dot-separated string that describes a path through nested discriminated unions (enums).

```typescript
// Given this structure:
type AppAction =
  | { type: 'destination'; action: PresentationAction<DestinationAction> }
  | { type: 'itemDeleted'; id: string };

type DestinationAction =
  | { type: 'addItem'; action: AddItemAction }
  | { type: 'editItem'; action: EditItemAction };

type AddItemAction =
  | { type: 'saveButtonTapped' }
  | { type: 'cancelButtonTapped' };

// Case paths:
'destination.addItem.saveButtonTapped'
'destination.editItem.cancelButtonTapped'
```

### 1.2 Why Case Paths?

**Problem**: Deep nesting is hard to read and maintain:

```typescript
if (
  action.type === 'destination' &&
  action.action.type === 'presented' &&
  action.action.action.type === 'editItem' &&
  action.action.action.action.type === 'saveButtonTapped'
) {
  // Finally here...
}
```

**Solution**: Case paths are declarative and type-safe:

```typescript
if (Destination.is(action, 'editItem.saveButtonTapped')) {
  // Clean and typed!
}
```

### 1.3 Design Goals

1. **Type Safety**: Full TypeScript inference and autocomplete
2. **Elegance**: Concise, readable syntax
3. **Performance**: Fast lookup, minimal overhead
4. **Integration**: Generated from domain definitions
5. **Composability**: Works with nested destinations

---

## 2. Matcher API

### 2.1 `Destination.is()` - Boolean Check

Check if an action matches a case path.

```typescript
/**
 * Check if action matches a case path.
 * Returns true/false.
 */
Destination.is(
  action: ParentAction,
  casePath: CasePath
): boolean

// Example
if (Destination.is(action, 'editItem.saveButtonTapped')) {
  // Action matched!
}
```

### 2.2 `Destination.extract()` - State Extraction

Extract child state from parent state for a specific case.

```typescript
/**
 * Extract child state for a specific destination case.
 * Returns typed child state or null.
 */
Destination.extract(
  state: ParentState,
  caseType: CaseType
): ChildState | null

// Example
const editState = Destination.extract(state.destination, 'editItem');
if (editState) {
  // editState is EditItemState
  const item = editState.item;
}
```

### 2.3 `Destination.match()` - Action + State Matching

Match action and extract state in one call.

```typescript
/**
 * Match action against multiple case paths.
 * Execute handler for first match.
 * Returns { matched: boolean; value?: T }
 */
Destination.match<T>(
  action: ParentAction,
  state: ParentState,
  handlers: Record<CasePath, (childState: ChildState) => T>
): { matched: boolean; value?: T }

// Example
const result = Destination.match(action, state, {
  'addItem.saveButtonTapped': (addState) => {
    return { item: addState.item, created: true };
  },
  'editItem.saveButtonTapped': (editState) => {
    return { item: editState.item, created: false };
  }
});

if (result.matched) {
  const { item, created } = result.value;
  // Handle save
}
```

### 2.4 `Destination.matchCase()` - Single Case Match

Match a single case and extract state.

```typescript
/**
 * Match specific case path and extract state.
 * Returns typed child state or null.
 */
Destination.matchCase(
  action: ParentAction,
  state: ParentState,
  casePath: CasePath
): ChildState | null

// Example
const editState = Destination.matchCase(
  action,
  state,
  'editItem.saveButtonTapped'
);

if (editState) {
  // editState is EditItemState
  // action was editItem.saveButtonTapped
  const item = editState.item;
}
```

### 2.5 `Destination.on()` - Reactive Matching

Create a reactive matcher that subscribes to actions (for effects).

```typescript
/**
 * Subscribe to specific case path matches.
 * Returns unsubscribe function.
 */
Destination.on(
  store: Store<State, Action>,
  casePath: CasePath,
  handler: (childState: ChildState, action: ChildAction) => void
): () => void

// Example
const unsubscribe = Destination.on(
  store,
  'editItem.saveButtonTapped',
  (editState, action) => {
    console.log('Save tapped!', editState.item);
  }
);

// Later
unsubscribe();
```

---

## 3. Implementation

### 3.1 Enhanced `createDestination()`

```typescript
// lib/composable/navigation/destination.ts

import type { Reducer } from '../types';
import { Effect } from '../effect';

export function createDestination<
  Reducers extends Record<string, Reducer<any, any>>
>(reducers: Reducers) {
  // Infer State type
  type State = {
    [K in keyof Reducers]: {
      type: K;
      state: Reducers[K] extends Reducer<infer S, any> ? S : never;
    };
  }[keyof Reducers];

  // Infer Action type
  type Action = {
    [K in keyof Reducers]: {
      type: K;
      action: Reducers[K] extends Reducer<any, infer A> ? A : never;
    };
  }[keyof Reducers];

  // Extract all possible case paths from a reducer's action type
  type ExtractCasePaths<A> = A extends { type: infer T extends string }
    ? T
    : never;

  // Build case path map: 'caseType.actionType' -> handler
  type CasePathMap = {
    [K in keyof Reducers]: Reducers[K] extends Reducer<infer S, infer A>
      ? {
          [P in ExtractCasePaths<A> as `${K & string}.${P}`]: {
            state: S;
            action: Extract<A, { type: P }>;
          };
        }
      : never;
  }[keyof Reducers];

  type CasePath = keyof CasePathMap;

  // Create reducer
  const reducer: Reducer<State, Action> = (state, action, deps) => {
    const key = state.type as keyof Reducers;

    if (state.type !== action.type) {
      return [state, Effect.none()];
    }

    const childReducer = reducers[key];
    const [newState, effect] = childReducer(
      (state as any).state,
      (action as any).action,
      deps
    );

    return [
      { type: state.type, state: newState } as State,
      Effect.map(effect, (a) => ({ type: action.type, action: a } as Action))
    ];
  };

  // Helper: Create initial state
  function initial<K extends keyof Reducers>(
    type: K,
    state: Reducers[K] extends Reducer<infer S, any> ? S : never
  ): State {
    return { type, state } as State;
  }

  // Helper: Extract child state by case type
  function extract<K extends keyof Reducers>(
    state: State | null | undefined,
    type: K
  ): (Reducers[K] extends Reducer<infer S, any> ? S : never) | null {
    if (!state || state.type !== type) {
      return null;
    }
    return (state as any).state;
  }

  // Helper: Check if action matches case path
  function is(
    action: unknown,
    casePath: CasePath
  ): boolean {
    // Validate action structure
    if (!action || typeof action !== 'object' || !('type' in action)) {
      return false;
    }

    const [caseType, ...actionPath] = String(casePath).split('.');

    // Must be a destination action (or direct case type for testing)
    let current: any = action;

    // If it's wrapped in parent action (e.g., 'destination'), unwrap it
    if (current.type === 'destination') {
      // Validate action.action exists and is an object
      if (!current.action || typeof current.action !== 'object' || !('type' in current.action)) {
        return false;
      }
      current = current.action;

      // Unwrap presentation action if present
      if (current.type === 'presented') {
        if (!current.action || typeof current.action !== 'object' || !('type' in current.action)) {
          return false;
        }
        current = current.action;
      }
    } else if (current.type === 'presented') {
      // Handle direct presentation action (for testing)
      if (!current.action || typeof current.action !== 'object' || !('type' in current.action)) {
        return false;
      }
      current = current.action;
    }

    // Check case type matches
    if (!current || typeof current !== 'object' || !('type' in current) || current.type !== caseType) {
      return false;
    }

    // Navigate through child action to check the action path
    let actionCurrent = current.action;

    // Check each segment of the action path
    for (let i = 0; i < actionPath.length; i++) {
      const segment = actionPath[i];

      if (actionCurrent?.type !== segment) {
        return false;
      }

      // Move to next level if not at the end
      if (i < actionPath.length - 1 && actionCurrent.action) {
        actionCurrent = actionCurrent.action;
      }
    }

    return true;
  }

  // Helper: Match action and extract state
  function matchCase<K extends keyof Reducers>(
    action: unknown,
    state: { destination: State | null } | State | null,
    casePath: CasePath
  ): (Reducers[K] extends Reducer<infer S, any> ? S : never) | null {
    if (!is(action, casePath)) {
      return null;
    }

    // Extract case type from path
    const [caseType] = String(casePath).split('.');

    // Extract destination state
    const destState = state && typeof state === 'object' && 'destination' in state
      ? state.destination
      : state;

    return extract(destState, caseType as K);
  }

  // Helper: Match multiple cases with handlers
  function match<T>(
    action: unknown,
    state: { destination: State | null } | State | null,
    handlers: Partial<{
      [P in CasePath]: (
        state: CasePathMap[P]['state'],
        action: CasePathMap[P]['action']
      ) => T;
    }>
  ): { matched: true; value: T } | { matched: false; value?: never } {
    for (const [casePath, handler] of Object.entries(handlers)) {
      if (is(action, casePath as CasePath)) {
        const childState = matchCase(action, state, casePath as CasePath);
        if (childState && handler) {
          // Extract the child action from the wrapped structure
          const [caseType, ...actionPath] = String(casePath).split('.');

          let childAction = action;
          // Unwrap parent action
          if (action.type === 'destination' && action.action) {
            childAction = action.action;
            if (childAction?.type === 'presented' && childAction.action) {
              childAction = childAction.action;
            }
          }

          // Get the actual child action (past the case type)
          childAction = childAction?.action;

          return {
            matched: true,
            value: handler(childState, childAction)
          };
        }
      }
    }

    return { matched: false };
  }

  // Helper: Subscribe to case path matches
  function on<K extends keyof Reducers, StoreType extends { subscribeToActions?: Function }>(
    store: StoreType,
    casePath: CasePath,
    handler: (
      state: Reducers[K] extends Reducer<infer S, any> ? S : never,
      action: unknown
    ) => void
  ): () => void {
    if (!store.subscribeToActions) {
      console.warn(
        'Store does not support action subscriptions. ' +
        'Add subscribeToActions() method to your store for Destination.on() to work.'
      );
      return () => {}; // No-op unsubscribe
    }

    // Subscribe to all actions using the store's action subscription API
    const unsubscribe = store.subscribeToActions((action: unknown, state: unknown) => {
      const childState = matchCase(action, state, casePath);
      if (childState) {
        // Extract child action
        const [caseType] = String(casePath).split('.');
        let childAction = action;

        if (action.type === 'destination' && action.action) {
          childAction = action.action;
          if (childAction?.type === 'presented' && childAction.action) {
            childAction = childAction.action;
          }
        }

        // Get the action past the case type
        childAction = childAction?.action;

        handler(childState, childAction);
      }
    });

    return unsubscribe;
  }

  return {
    reducer,
    initial,
    extract,
    is,
    match,
    matchCase,
    on,
    _types: {} as {
      State: State;
      Action: Action;
      CasePath: CasePath;
    }
  };
}

// Type helpers
export type DestinationState<T> = T extends { _types: { State: infer S } }
  ? S
  : never;

export type DestinationAction<T> = T extends { _types: { Action: infer A } }
  ? A
  : never;

export type DestinationCasePath<T> = T extends { _types: { CasePath: infer C } }
  ? C
  : never;
```

### 3.2 Store Enhancement for Action Observation

For the `Destination.on()` API to work, the store needs to support action subscriptions. This enhancement is **optional** but recommended for reactive effects.

```typescript
// lib/composable/store.svelte.ts

export interface Store<State, Action> {
  state: State;
  dispatch: (action: Action) => void;
  subscribe: (listener: (state: State) => void) => () => void;
  // New: Subscribe to actions (for Destination.on())
  subscribeToActions?: (listener: (action: Action, state: State) => void) => () => void;
}

export function createStore<State, Action, Dependencies = any>(
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action> {
  // ... existing implementation ...

  // Add action observers for matcher support
  const actionSubscribers = new Set<(action: Action, state: State) => void>();

  function dispatchCore(action: Action): void {
    // Record action
    actionHistory.push(action);

    // Run reducer
    const [newState, effect] = config.reducer(
      state,
      action,
      config.dependencies
    );

    // Update state
    const stateChanged = !Object.is(state, newState);
    if (stateChanged) {
      state = newState;
      subscribers.forEach(listener => listener(state));
    }

    // Notify action subscribers AFTER state update (for matchers)
    actionSubscribers.forEach(subscriber => subscriber(action, state));

    // Execute effect
    executeEffect(effect);
  }

  // ... rest of implementation ...

  function subscribeToActions(
    listener: (action: Action, state: State) => void
  ): () => void {
    actionSubscribers.add(listener);
    return () => {
      actionSubscribers.delete(listener);
    };
  }

  return {
    state: $state.snapshot(state),
    dispatch,
    subscribe: (listener) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    // Add action subscription support
    subscribeToActions
  };
}
```

---

## 4. Usage Examples

### 4.1 Basic Matching

```typescript
// features/inventory/reducer.ts

import { Destination } from './destination';
import { Effect } from '$lib/composable/effect';
import type { Reducer } from '$lib/composable/types';

const inventoryReducer: Reducer<InventoryState, InventoryAction> = (
  state,
  action,
  deps
) => {
  // Better: Use matchCase to check action AND extract state atomically
  const addState = Destination.matchCase(action, state, 'addItem.saveButtonTapped');
  if (addState) {
    return [
      {
        ...state,
        items: [...state.items, addState.item],
        destination: null
      },
      Effect.fireAndForget(async () => {
        await deps.apiClient.post('/items', addState.item);
      })
    ];
  }

  // Match multiple cases
  const result = Destination.match(action, state, {
    'addItem.saveButtonTapped': (addState) => {
      return { item: addState.item, action: 'add' as const };
    },
    'editItem.saveButtonTapped': (editState) => {
      return { item: editState.item, action: 'update' as const };
    }
  });

  if (result.matched) {
    const { item, action: saveAction } = result.value;

    if (saveAction === 'add') {
      return [
        {
          ...state,
          items: [...state.items, item],
          destination: null
        },
        Effect.run(async () => {
          await deps.apiClient.post('/items', item);
        })
      ];
    } else {
      return [
        {
          ...state,
          items: state.items.map(i => (i.id === item.id ? item : i)),
          destination: null
        },
        Effect.run(async () => {
          await deps.apiClient.put(`/items/${item.id}`, item);
        })
      ];
    }
  }

  // ... rest of reducer
  return [state, Effect.none()];
};
```

### 4.2 Combining with Core Logic

```typescript
import { Destination } from './destination';
import { initialState as initialAddItemState } from '../add-item/state';

const inventoryReducer: Reducer<InventoryState, InventoryAction> = (
  state,
  action,
  deps
) => {
  // Handle core actions
  switch (action.type) {
    case 'addButtonTapped':
      return [
        {
          ...state,
          destination: Destination.initial('addItem', initialAddItemState)
        },
        Effect.none()
      ];

    case 'itemDeleted':
      return [
        { ...state, items: state.items.filter(i => i.id !== action.id) },
        Effect.none()
      ];
  }

  // Handle child save actions with matcher - distinguishes add vs edit
  const saveResult = Destination.match(action, state, {
    'addItem.saveButtonTapped': (addState) => ({
      type: 'add' as const,
      item: addState.item
    }),
    'editItem.saveButtonTapped': (editState) => ({
      type: 'edit' as const,
      item: editState.item
    })
  });

  if (saveResult.matched) {
    const { type, item } = saveResult.value;

    if (type === 'add') {
      return [
        {
          ...state,
          items: [...state.items, item],
          destination: null
        },
        Effect.batch(
          Effect.run(async () => {
            await deps.apiClient.post('/items', item);
          }),
          Effect.fireAndForget(() => {
            deps.analytics.track('item_added', { itemId: item.id });
          })
        )
      ];
    } else {
      // Edit: update existing item
      return [
        {
          ...state,
          items: state.items.map(i => (i.id === item.id ? item : i)),
          destination: null
        },
        Effect.batch(
          Effect.run(async () => {
            await deps.apiClient.put(`/items/${item.id}`, item);
          }),
          Effect.fireAndForget(() => {
            deps.analytics.track('item_edited', { itemId: item.id });
          })
        )
      ];
    }
  }

  return [state, Effect.none()];
};
```

### 4.3 Reactive Subscriptions (Effects)

```typescript
// features/inventory/analytics.ts

export function setupAnalytics(store: Store<InventoryState, InventoryAction>) {
  // Track when items are saved
  const unsubSave = Destination.on(
    store,
    'addItem.saveButtonTapped',
    (addState) => {
      analytics.track('item_added', {
        itemName: addState.item.name,
        itemId: addState.item.id
      });
    }
  );

  // Track when items are edited
  const unsubEdit = Destination.on(
    store,
    'editItem.saveButtonTapped',
    (editState) => {
      analytics.track('item_edited', {
        itemId: editState.item.id
      });
    }
  );

  // Return cleanup function
  return () => {
    unsubSave();
    unsubEdit();
  };
}

// Usage
const cleanup = setupAnalytics(store);

// Later
cleanup();
```

---

## 5. Advanced Patterns

### 5.1 Nested Destinations

**Note**: Nested destination matching (e.g., `'inventory.addItem.saveButtonTapped'`) is **not currently supported** in the implementation. The current matcher API supports two-level paths: `caseType.actionType`.

For nested destinations, create matchers at each level:

```typescript
// features/app/destination.ts

// Create nested destinations
const InventoryDestination = createDestination({
  addItem: addItemReducer,
  editItem: editItemReducer
});

// App-level matching
const AppDestination = createDestination({
  inventory: inventoryReducer,
  settings: settingsReducer
});

// Match at app level, then at inventory level
if (AppDestination.is(action, 'inventory')) {
  const inventoryState = AppDestination.extract(state.destination, 'inventory');
  if (inventoryState) {
    // Now match at inventory level
    if (InventoryDestination.is(action, 'addItem.saveButtonTapped')) {
      const addState = InventoryDestination.extract(
        inventoryState.destination,
        'addItem'
      );
      // Handle save
    }
  }
}

// Or use matchCase at inventory level directly
const addState = InventoryDestination.matchCase(
  action,
  state.inventory,  // Navigate to inventory state first
  'addItem.saveButtonTapped'
);
```

### 5.2 Prefix Matching (Case-Level Matching)

The `is()` function supports **prefix matching**. A case path without an action type (e.g., `'addItem'`) matches ANY action for that case:

```typescript
// Prefix match: matches ANY addItem action
if (Destination.is(action, 'addItem')) {
  // ✓ Matches: { type: 'destination', action: { type: 'presented', action: { type: 'addItem', action: { type: 'saveButtonTapped' } } } }
  // ✓ Matches: { type: 'destination', action: { type: 'presented', action: { type: 'addItem', action: { type: 'cancelButtonTapped' } } } }
  // ✓ Matches: { type: 'destination', action: { type: 'presented', action: { type: 'addItem', action: { type: 'fieldChanged' } } } }
  // ✗ Does NOT match: editItem actions

  const addState = Destination.extract(state.destination, 'addItem');
  if (addState) {
    // Handle ANY addItem action
    console.log('Some addItem action occurred');
  }
}

// Full path match: matches only specific action
if (Destination.is(action, 'addItem.saveButtonTapped')) {
  // ✓ Only matches saveButtonTapped
}

// Practical use: common handling for all actions of a case
if (Destination.is(action, 'addItem')) {
  // Log all addItem interactions
  analytics.track('addItem_interaction', {
    actionType: /* extract from action */
  });
}

// For specific handling, use match with explicit handlers
const result = Destination.match(action, state, {
  'addItem.saveButtonTapped': (s) => ({ type: 'save', state: s }),
  'addItem.cancelButtonTapped': (s) => ({ type: 'cancel', state: s }),
  'addItem.fieldChanged': (s) => ({ type: 'change', state: s })
});
```

### 5.3 Guard Clauses

```typescript
// Match with additional guards
const result = Destination.match(action, state, {
  'addItem.saveButtonTapped': (addState) => {
    // Guard: only if item is valid
    if (!addState.isValid) return null;
    return addState.item;
  }
});

if (result.matched && result.value) {
  // Item was valid and matched
}
```

### 5.4 Type-Safe Path Strings with Template Literal Types

> **Note:** This section describes an **optional enhancement** to add compile-time type safety to case paths. The basic string-based implementation (sections 3-4) works perfectly well and is recommended for most use cases. This enhancement is for teams that want additional TypeScript protection against typos in path strings.

**Problem**: Current implementation uses string literals for case paths, which are not type-checked:

```typescript
// ❌ Typos won't be caught by TypeScript
Destination.is(action, 'editItem.saveButonTapped');  // Typo: "Buton" vs "Button"
Destination.is(action, 'ediItem.saveButtonTapped');  // Typo: "edi" vs "edit"
Destination.is(action, 'addItem.nonExistentAction'); // Wrong action name
```

**Solution**: Use TypeScript's **template literal types** (TypeScript 4.1+) to generate type-safe case path unions.

#### Implementation

```typescript
// lib/composable/navigation/destination.ts

/**
 * Extract valid case paths from a Destination type.
 * Uses template literal types to generate type-safe path strings.
 */
type ExtractCasePaths<Reducers extends Record<string, Reducer<any, any>>> = {
  [CaseKey in keyof Reducers]: Reducers[CaseKey] extends Reducer<any, infer Action>
    ? Action extends { type: infer ActionType }
      ? ActionType extends string
        // Generate "caseKey.actionType" for each valid combination
        ? `${CaseKey & string}.${ActionType}`
        : never
      : never
    : never;
}[keyof Reducers];

/**
 * Generate type-safe case path type from createDestination result.
 */
export type CasePath<D> = D extends ReturnType<typeof createDestination<infer R>>
  ? ExtractCasePaths<R>
  : never;

/**
 * Updated createDestination with CasePath export.
 */
export function createDestination<Reducers extends Record<string, Reducer<any, any>>>(
  reducers: Reducers
) {
  // ... existing implementation ...

  // Export type-safe case path type
  type ValidCasePath = ExtractCasePaths<Reducers>;

  return {
    // ... existing properties ...
    reducer,
    initial,
    match: matchFunction as <K extends keyof Reducers>(
      state: State,
      caseType: K
    ) => (Reducers[K] extends Reducer<infer S, any> ? S : never) | null,
    extract,

    // Updated is() with type-safe case path
    is: (action: unknown, casePath: ValidCasePath | keyof Reducers): boolean => {
      return is(action, casePath as string);
    },

    // Updated matchCase() with type-safe case path
    matchCase: <K extends keyof Reducers>(
      action: unknown,
      state: { destination: State | null } | State | null,
      casePath: ValidCasePath
    ): (Reducers[K] extends Reducer<infer S, any> ? S : never) | null => {
      return matchCase(action, state, casePath as string) as any;
    },

    // Type export for external use
    _casePaths: {} as ValidCasePath
  };
}

// Helper type to extract case paths from Destination object
export type DestinationCasePath<D> = D extends { _casePaths: infer P } ? P : never;
```

#### Usage with Full Type Safety

```typescript
// features/inventory/destination.ts

import { createDestination } from '$lib/composable/navigation';
import { addItemReducer } from '../add-item/reducer';
import { editItemReducer } from '../edit-item/reducer';

// Create destination with type-safe paths
export const Destination = createDestination({
  addItem: addItemReducer,   // Actions: saveButtonTapped, cancelButtonTapped, nameChanged
  editItem: editItemReducer  // Actions: saveButtonTapped, cancelButtonTapped, nameChanged
});

// Extract the type-safe case path type
export type DestinationCasePath = DestinationCasePath<typeof Destination>;

// DestinationCasePath is now:
// | 'addItem.saveButtonTapped'
// | 'addItem.cancelButtonTapped'
// | 'addItem.nameChanged'
// | 'editItem.saveButtonTapped'
// | 'editItem.cancelButtonTapped'
// | 'editItem.nameChanged'
```

**Benefits**:

```typescript
// ✅ TypeScript provides autocomplete for all valid paths
Destination.is(action, 'addItem.saveButtonTapped');  // ✓ Valid

// ❌ TypeScript catches typos at compile time
Destination.is(action, 'addItem.saveButonTapped');   // ✗ Type error: "saveButonTapped" doesn't exist
Destination.is(action, 'ediItem.saveButtonTapped');  // ✗ Type error: "ediItem" doesn't exist
Destination.is(action, 'addItem.nonExistent');       // ✗ Type error: "nonExistent" doesn't exist

// ✅ Refactoring is safe
// If you rename AddItemAction.saveButtonTapped → AddItemAction.save,
// TypeScript will show errors everywhere the old name is used
```

#### Typed Helper Functions

```typescript
// features/inventory/matcher-helpers.ts

import { Destination, type DestinationCasePath } from './destination';
import type { InventoryAction, InventoryState } from './types';

/**
 * Type-safe wrapper around Destination.match() with full autocomplete.
 */
export function matchDestination<T>(
  action: InventoryAction,
  state: InventoryState,
  handlers: Partial<Record<DestinationCasePath, (state: any) => T>>
) {
  return Destination.match(action, state, handlers);
}

// Usage with perfect type safety
const result = matchDestination(action, state, {
  'addItem.saveButtonTapped': (addState) => ({
    type: 'save' as const,
    item: addState.item
  }),
  'editItem.saveButtonTapped': (editState) => ({
    type: 'update' as const,
    item: editState.item
  }),
  // TypeScript autocomplete shows ALL valid case paths!
  // Typos are caught immediately!
});
```

#### Advanced: Constrained Case Paths

For even more type safety, constrain paths to specific cases:

```typescript
/**
 * Extract only case paths for a specific case.
 */
type CasePathsForCase<
  D,
  CaseKey extends string
> = D extends { _casePaths: infer P }
  ? P extends `${CaseKey}.${infer Action}`
    ? `${CaseKey}.${Action}`
    : never
  : never;

// Usage: Get only addItem paths
type AddItemPaths = CasePathsForCase<typeof Destination, 'addItem'>;
// Result: 'addItem.saveButtonTapped' | 'addItem.cancelButtonTapped' | 'addItem.nameChanged'

/**
 * Helper that only accepts paths for a specific case.
 */
function matchAddItem<T>(
  action: InventoryAction,
  state: InventoryState,
  handlers: Partial<Record<CasePathsForCase<typeof Destination, 'addItem'>, (state: AddItemState) => T>>
) {
  return Destination.match(action, state, handlers as any);
}

// Usage: Only addItem paths allowed
matchAddItem(action, state, {
  'addItem.saveButtonTapped': (s) => s.item,
  'editItem.saveButtonTapped': (s) => s.item  // ✗ Type error: editItem not allowed!
});
```

#### Comparison: Before vs After

| Feature | String Literals | Template Literal Types |
|---------|-----------------|------------------------|
| Typo detection | ❌ Runtime only | ✅ Compile time |
| Autocomplete | ❌ None | ✅ Full |
| Refactoring | ❌ Manual find/replace | ✅ IDE refactoring |
| Documentation | ❌ None | ✅ Types document valid paths |
| Learning curve | ✅ Low | ⚠️ Medium |
| Type complexity | ✅ Simple | ⚠️ Complex |

#### Recommendation

**For production codebases**: Use template literal types for maximum type safety and developer experience.

**For prototypes/small projects**: String literals are simpler and faster to implement.

**Migration path**: Start with string literals, add template literal types later when the API stabilizes.

---

## 6. Testing

### 6.1 Testing Matchers

```typescript
// features/inventory/reducer.test.ts

import { describe, it, expect } from 'vitest';
import { Destination } from './destination';

describe('Destination matchers', () => {
  it('matches case path', () => {
    const action = {
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'addItem',
          action: { type: 'saveButtonTapped' }
        }
      }
    };

    expect(Destination.is(action, 'addItem.saveButtonTapped')).toBe(true);
    expect(Destination.is(action, 'editItem.saveButtonTapped')).toBe(false);
  });

  it('extracts state for case', () => {
    const state = {
      destination: {
        type: 'addItem',
        state: { item: { name: 'Test' }, isValid: true }
      }
    };

    const addState = Destination.extract(state.destination, 'addItem');
    expect(addState).toEqual({ item: { name: 'Test' }, isValid: true });

    const editState = Destination.extract(state.destination, 'editItem');
    expect(editState).toBeNull();
  });

  it('matches and extracts in one call', () => {
    const action = {
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'addItem',
          action: { type: 'saveButtonTapped' }
        }
      }
    };

    const state = {
      destination: {
        type: 'addItem',
        state: { item: { name: 'Test' }, isValid: true }
      }
    };

    const addState = Destination.matchCase(
      action,
      state,
      'addItem.saveButtonTapped'
    );

    expect(addState).toEqual({ item: { name: 'Test' }, isValid: true });
  });

  it('matches multiple handlers', () => {
    const action = {
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'editItem',
          action: { type: 'saveButtonTapped' }
        }
      }
    };

    const state = {
      destination: {
        type: 'editItem',
        state: { item: { id: '1', name: 'Updated' }, isValid: true }
      }
    };

    const result = Destination.match(action, state, {
      'addItem.saveButtonTapped': (s) => ({ action: 'add', item: s.item }),
      'editItem.saveButtonTapped': (s) => ({ action: 'edit', item: s.item })
    });

    expect(result.matched).toBe(true);
    expect(result.value).toEqual({
      action: 'edit',
      item: { id: '1', name: 'Updated' }
    });
  });
});
```

### 6.2 Testing with TestStore

```typescript
it('handles save with matcher', async () => {
  const store = new TestStore({
    initialState: {
      items: [],
      destination: {
        type: 'addItem',
        state: { item: { name: 'Test' }, isValid: true }
      }
    },
    reducer: inventoryReducer
  });

  await store.send({
    type: 'destination',
    action: {
      type: 'presented',
      action: {
        type: 'addItem',
        action: { type: 'saveButtonTapped' }
      }
    }
  }, (state) => {
    expect(state.items).toHaveLength(1);
    expect(state.items[0].name).toBe('Test');
    expect(state.destination).toBeNull();
  });
});
```

---

## 7. Performance

### 7.1 Optimization Strategies

**1. Early Exit**
```typescript
function is(action: any, casePath: CasePath): boolean {
  // Quick type check first
  if (action.type !== 'destination' && !casePath.startsWith(action.type)) {
    return false;
  }
  // ... rest of checks
}
```

**2. Path Caching**
```typescript
const pathCache = new Map<CasePath, string[]>();

function parsePath(casePath: CasePath): string[] {
  if (!pathCache.has(casePath)) {
    pathCache.set(casePath, String(casePath).split('.'));
  }
  return pathCache.get(casePath)!;
}
```

**3. Memoized Matchers**
```typescript
// Create matcher once
const saveItemMatcher = createMatcher({
  'addItem.saveButtonTapped': (s) => ({ action: 'add', item: s.item }),
  'editItem.saveButtonTapped': (s) => ({ action: 'edit', item: s.item })
});

// Reuse in reducer
const result = saveItemMatcher(action, state);
```

### 7.2 Benchmarks

Target performance:
- `is()`: < 1µs per call
- `extract()`: < 0.5µs per call
- `match()`: < 5µs per call (with 5 handlers)
- `matchCase()`: < 2µs per call

**Example benchmark**:
```typescript
const action = createComplexAction();
const state = createComplexState();

console.time('Destination.is');
for (let i = 0; i < 100000; i++) {
  Destination.is(action, 'editItem.saveButtonTapped');
}
console.timeEnd('Destination.is');
// Target: < 100ms total (< 1µs per call)
```

---

## 8. Comparison with Alternatives

### Manual Nesting

```typescript
// Manual: 8 lines, hard to read
if (
  action.type === 'destination' &&
  action.action.type === 'presented' &&
  action.action.action.type === 'editItem' &&
  action.action.action.action.type === 'saveButtonTapped'
) {
  if (state.destination?.type === 'editItem') {
    const item = state.destination.state.item;
  }
}

// Matcher: 2 lines, clear intent
const editState = Destination.matchCase(action, state, 'editItem.saveButtonTapped');
if (editState) { const item = editState.item; }
```

### Switch Statements

```typescript
// Switch: 20+ lines for multiple cases
switch (action.type) {
  case 'destination':
    if (action.action.type === 'presented') {
      switch (action.action.action.type) {
        case 'addItem':
          if (action.action.action.action.type === 'saveButtonTapped') {
            // ...
          }
          break;
        case 'editItem':
          // ...
          break;
      }
    }
    break;
}

// Matcher: 5 lines, flat structure
const result = Destination.match(action, state, {
  'addItem.saveButtonTapped': (s) => handleAdd(s),
  'editItem.saveButtonTapped': (s) => handleEdit(s)
});
```

---

## 9. API Summary

| Method | Purpose | Returns | Use When |
|--------|---------|---------|----------|
| `is()` | Check if action matches path | `boolean` | Simple boolean check |
| `extract()` | Get state for case | `State \| null` | Have state, need to extract case |
| `matchCase()` | Match path + extract state | `State \| null` | Single case, need both |
| `match()` | Match multiple paths | `{ matched, value }` | Multiple cases, need handler |
| `on()` | Subscribe to path | `() => void` | Reactive effects/side effects |

---

## 10. Migration Guide

### From Manual Matching

```typescript
// Before
if (
  action.type === 'destination' &&
  action.action.type === 'presented' &&
  action.action.action.type === 'editItem' &&
  action.action.action.action.type === 'saveButtonTapped' &&
  state.destination?.type === 'editItem'
) {
  const item = state.destination.state.item;
  // handle save
}

// After
const editState = Destination.matchCase(
  action,
  state,
  'editItem.saveButtonTapped'
);
if (editState) {
  const item = editState.item;
  // handle save
}
```

### From Switch Statements

```typescript
// Before
switch (action.type) {
  case 'destination':
    // 15+ lines of nested switches
    break;
}

// After
const result = Destination.match(action, state, {
  'addItem.saveButtonTapped': handleAdd,
  'editItem.saveButtonTapped': handleEdit
});
```

---

## 11. Appendix: Complete Integration Example

This appendix demonstrates how **all five specs** work together in a real-world application:
- `composable-svelte-spec.md` - Core architecture
- `navigation-spec.md` - Tree-based navigation
- `navigation-dsl-spec.md` - Ergonomic helpers
- `navigation-matcher-spec.md` - Type-safe matching (this spec)
- `animation-integration-spec.md` - Animated presentations

### 11.1 Feature Overview: Inventory Management

We'll build an inventory management app with:
- **List view** - Shows all inventory items
- **Add modal** - Animated modal for adding items
- **Edit modal** - Animated modal for editing items
- **Detail sheet** - Bottom sheet showing item details

All three modals use:
- ✅ Tree-based navigation (navigation-spec.md)
- ✅ Destination matchers (this spec)
- ✅ Animated presentations (animation-integration-spec.md)
- ✅ DSL helpers (navigation-dsl-spec.md)
- ✅ Composable architecture (composable-svelte-spec.md)

### 11.2 State Definition

```typescript
// features/inventory/state.ts

import type { AddItemState } from '../add-item/state';
import type { EditItemState } from '../edit-item/state';
import type { DetailItemState } from '../detail-item/state';
import type { PresentationState } from '$lib/composable/navigation';

// Define destination enum
export type DestinationState =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState }
  | { type: 'detailItem'; state: DetailItemState };

export interface InventoryState {
  items: Item[];
  selectedId: string | null;
  isLoading: boolean;
  destination: DestinationState | null;  // From navigation-spec.md
  presentation: PresentationState<DestinationState>;  // From animation-integration-spec.md
}

export interface Item {
  id: string;
  name: string;
  quantity: number;
  price: number;
}

export const initialState: InventoryState = {
  items: [],
  selectedId: null,
  isLoading: false,
  destination: null,
  presentation: { status: 'idle' }
};
```

### 11.3 Actions Definition

```typescript
// features/inventory/actions.ts

import type { AddItemAction } from '../add-item/actions';
import type { EditItemAction } from '../edit-item/actions';
import type { DetailItemAction } from '../detail-item/actions';
import type { PresentationAction } from '$lib/composable/navigation';

// Destination actions (navigation-spec.md)
export type DestinationAction =
  | { type: 'addItem'; action: AddItemAction }
  | { type: 'editItem'; action: EditItemAction }
  | { type: 'detailItem'; action: DetailItemAction };

export type InventoryAction =
  | { type: 'loadItems' }
  | { type: 'itemsLoaded'; items: Item[] }
  | { type: 'addButtonTapped' }
  | { type: 'editButtonTapped'; id: string }
  | { type: 'detailButtonTapped'; id: string }
  | { type: 'closeButtonTapped' }
  | { type: 'destination'; action: PresentationAction<DestinationAction> }  // Wrapped destination actions
  | { type: 'presentation'; event: PresentationEvent };  // Animation lifecycle events
```

### 11.4 Reducer with All Features

```typescript
// features/inventory/reducer.ts

import { Effect } from '$lib/composable/effect';
import { createDestination } from '$lib/composable/navigation';
import { addItemReducer } from '../add-item/reducer';
import { editItemReducer } from '../edit-item/reducer';
import { detailItemReducer } from '../detail-item/reducer';
import type { Reducer } from '$lib/composable/types';

// Create destination using DSL (navigation-dsl-spec.md + navigation-matcher-spec.md)
const Destination = createDestination({
  addItem: addItemReducer,
  editItem: editItemReducer,
  detailItem: detailItemReducer
});

export const inventoryReducer: Reducer<InventoryState, InventoryAction> = (state, action, deps) => {
  switch (action.type) {
    // Load items
    case 'loadItems':
      return [
        { ...state, isLoading: true },
        Effect.run(async (dispatch) => {
          const items = await deps.apiClient.fetch<Item[]>('/api/items');
          dispatch({ type: 'itemsLoaded', items });
        })
      ];

    case 'itemsLoaded':
      return [{ ...state, items: action.items, isLoading: false }, Effect.none()];

    // Open add modal with animation (animation-integration-spec.md)
    case 'addButtonTapped': {
      if (state.presentation.status !== 'idle') {
        return [state, Effect.none()];
      }

      const destination: DestinationState = {
        type: 'addItem',
        state: { name: '', quantity: 0, price: 0 }
      };

      return [
        {
          ...state,
          destination,
          presentation: { status: 'presenting', content: destination, duration: 300 }
        },
        Effect.afterDelay(300, (d) =>
          d({ type: 'presentation', event: { type: 'presentationCompleted' } })
        )
      ];
    }

    // Open edit modal with animation
    case 'editButtonTapped': {
      if (state.presentation.status !== 'idle') {
        return [state, Effect.none()];
      }

      const item = state.items.find(i => i.id === action.id);
      if (!item) {
        return [state, Effect.none()];
      }

      const destination: DestinationState = {
        type: 'editItem',
        state: { id: item.id, name: item.name, quantity: item.quantity, price: item.price }
      };

      return [
        {
          ...state,
          destination,
          presentation: { status: 'presenting', content: destination, duration: 300 }
        },
        Effect.afterDelay(300, (d) =>
          d({ type: 'presentation', event: { type: 'presentationCompleted' } })
        )
      ];
    }

    // Close modal with animation
    case 'closeButtonTapped': {
      if (state.presentation.status !== 'presented') {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          presentation: {
            status: 'dismissing',
            content: state.presentation.content!,
            duration: 200
          }
        },
        Effect.afterDelay(200, (d) =>
          d({ type: 'presentation', event: { type: 'dismissalCompleted' } })
        )
      ];
    }

    // Handle presentation lifecycle (animation-integration-spec.md)
    case 'presentation': {
      if (action.event.type === 'presentationCompleted') {
        if (state.presentation.status !== 'presenting') {
          return [state, Effect.none()];
        }

        return [
          {
            ...state,
            presentation: { status: 'presented', content: state.presentation.content! }
          },
          Effect.none()
        ];
      }

      if (action.event.type === 'dismissalCompleted') {
        if (state.presentation.status !== 'dismissing') {
          return [state, Effect.none()];
        }

        return [
          { ...state, destination: null, presentation: { status: 'idle' } },
          Effect.none()
        ];
      }

      return [state, Effect.none()];
    }

    // Handle destination actions (navigation-spec.md)
    case 'destination': {
      if (!state.destination) {
        return [state, Effect.none()];
      }

      const childAction = action.action;

      // Only handle 'presented' actions
      if (childAction.type !== 'presented') {
        return [state, Effect.none()];
      }

      // Run child reducer
      const [newDestination, destinationEffect] = Destination.reducer(
        state.destination,
        childAction.action,
        deps
      );

      // USE MATCHER to detect save actions (navigation-matcher-spec.md)
      const result = Destination.match(action, state, {
        'addItem.saveButtonTapped': (addState) => {
          // Save new item
          return Effect.run(async (dispatch) => {
            const newItem = await deps.apiClient.post<Item>('/api/items', {
              name: addState.name,
              quantity: addState.quantity,
              price: addState.price
            });

            dispatch({ type: 'itemsLoaded', items: [...state.items, newItem] });
            dispatch({ type: 'closeButtonTapped' });
          });
        },
        'editItem.saveButtonTapped': (editState) => {
          // Update existing item
          return Effect.run(async (dispatch) => {
            const updated = await deps.apiClient.put<Item>(
              `/api/items/${editState.id}`,
              {
                name: editState.name,
                quantity: editState.quantity,
                price: editState.price
              }
            );

            const items = state.items.map(i => i.id === updated.id ? updated : i);
            dispatch({ type: 'itemsLoaded', items });
            dispatch({ type: 'closeButtonTapped' });
          });
        }
      });

      // Map destination effect to parent action
      const mappedEffect = Effect.map(
        destinationEffect,
        (a) => ({ type: 'destination' as const, action: { type: 'presented' as const, action: a } })
      );

      // Combine effects
      const combinedEffect = result.matched
        ? Effect.batch(mappedEffect, result.value)
        : mappedEffect;

      return [{ ...state, destination: newDestination }, combinedEffect];
    }

    default:
      const _exhaustive: never = action;
      return [state, Effect.none()];
  }
};
```

### 11.5 View with DSL Helpers

```svelte
<!-- features/inventory/Inventory.svelte -->
<script lang="ts">
  import { createStore } from '$lib/composable/store.svelte';
  import { scopeTo } from '$lib/composable/navigation';  // DSL helper
  import { inventoryReducer } from './reducer';
  import { initialState } from './state';
  import { liveDependencies } from '$lib/dependencies/live';
  import Modal from '$lib/composable/navigation-components/Modal.svelte';
  import AddItemView from '../add-item/AddItem.svelte';
  import EditItemView from '../edit-item/EditItem.svelte';
  import DetailItemView from '../detail-item/DetailItem.svelte';
  import { onMount, onDestroy } from 'svelte';

  const store = createStore({
    initialState,
    reducer: inventoryReducer,
    dependencies: liveDependencies
  });

  // Use DSL helpers to scope to child features (navigation-dsl-spec.md)
  const addItemStore = $derived(
    scopeTo(store).into('destination').case('addItem')
  );

  const editItemStore = $derived(
    scopeTo(store).into('destination').case('editItem')
  );

  const detailItemStore = $derived(
    scopeTo(store).into('destination').case('detailItem')
  );

  onMount(() => {
    store.dispatch({ type: 'loadItems' });
  });

  onDestroy(() => {
    store.destroy();
  });
</script>

<div class="inventory">
  <header>
    <h1>Inventory</h1>
    <button onclick={() => store.dispatch({ type: 'addButtonTapped' })}>
      Add Item
    </button>
  </header>

  {#if store.state.isLoading}
    <div class="loading">Loading...</div>
  {:else}
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Quantity</th>
          <th>Price</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each store.state.items as item (item.id)}
          <tr>
            <td>{item.name}</td>
            <td>{item.quantity}</td>
            <td>${item.price.toFixed(2)}</td>
            <td>
              <button onclick={() => store.dispatch({ type: 'editButtonTapped', id: item.id })}>
                Edit
              </button>
              <button onclick={() => store.dispatch({ type: 'detailButtonTapped', id: item.id })}>
                Details
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <!-- Animated modals using presentation state (animation-integration-spec.md) -->
  {#if addItemStore}
    <Modal
      presentation={store.state.presentation}
      onClose={() => store.dispatch({ type: 'closeButtonTapped' })}
    >
      <AddItemView store={addItemStore} />
    </Modal>
  {/if}

  {#if editItemStore}
    <Modal
      presentation={store.state.presentation}
      onClose={() => store.dispatch({ type: 'closeButtonTapped' })}
    >
      <EditItemView store={editItemStore} />
    </Modal>
  {/if}

  {#if detailItemStore}
    <Modal
      presentation={store.state.presentation}
      onClose={() => store.dispatch({ type: 'closeButtonTapped' })}
    >
      <DetailItemView store={detailItemStore} />
    </Modal>
  {/if}
</div>

<style>
  .inventory {
    padding: 2rem;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th, td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid #ddd;
  }

  button {
    margin-right: 0.5rem;
  }
</style>
```

### 11.6 Testing the Complete Integration

```typescript
// features/inventory/reducer.test.ts

import { describe, it, expect } from 'vitest';
import { TestStore } from '$lib/composable/test';
import { inventoryReducer } from './reducer';
import { initialState } from './state';
import { createDestination } from '$lib/composable/navigation';

describe('Inventory Integration', () => {
  it('complete flow: load → add → save → close', async () => {
    const mockDeps = {
      apiClient: {
        fetch: async () => [
          { id: '1', name: 'Widget', quantity: 10, price: 9.99 }
        ],
        post: async (url, body) => ({
          id: '2',
          ...body
        })
      },
      uuid: () => 'test-uuid',
      now: () => new Date(),
      storage: {} as any,
      analytics: { track: () => {}, identify: () => {} }
    };

    const store = new TestStore({
      initialState,
      reducer: inventoryReducer,
      dependencies: mockDeps
    });

    // 1. Load items
    await store.send({ type: 'loadItems' });
    await store.receive({ type: 'itemsLoaded' }, (state) => {
      expect(state.items).toHaveLength(1);
    });

    // 2. Open add modal
    await store.send({ type: 'addButtonTapped' }, (state) => {
      expect(state.presentation.status).toBe('presenting');
      expect(state.destination?.type).toBe('addItem');
    });

    // 3. Complete presentation animation
    await store.receive({ type: 'presentation' }, (state) => {
      expect(state.presentation.status).toBe('presented');
    });

    // 4. Fill out form
    await store.send({
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'addItem',
          action: { type: 'nameChanged', value: 'Gadget' }
        }
      }
    });

    await store.send({
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'addItem',
          action: { type: 'quantityChanged', value: 5 }
        }
      }
    });

    // 5. Save item (triggers matcher logic)
    await store.send({
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'addItem',
          action: { type: 'saveButtonTapped' }
        }
      }
    });

    // 6. Item saved and modal closed
    await store.receive({ type: 'itemsLoaded' }, (state) => {
      expect(state.items).toHaveLength(2);
      expect(state.items[1].name).toBe('Gadget');
    });

    await store.receive({ type: 'closeButtonTapped' });

    // 7. Dismissal animation completes
    await store.receive({ type: 'presentation' }, (state) => {
      expect(state.presentation.status).toBe('idle');
      expect(state.destination).toBeNull();
    });

    store.assertNoPendingActions();
  });
});
```

### 11.7 What This Example Demonstrates

This complete integration example shows:

1. **composable-svelte-spec.md**
   - ✅ Store creation with `createStore()`
   - ✅ Pure reducers returning `[state, effect]`
   - ✅ Effect composition with `Effect.batch()` and `Effect.map()`
   - ✅ TestStore for comprehensive testing

2. **navigation-spec.md**
   - ✅ Tree-based navigation with `destination` field
   - ✅ `PresentationAction<T>` wrapping child actions
   - ✅ `ifLet()` pattern for optional child state

3. **navigation-matcher-spec.md (this spec)**
   - ✅ `createDestination()` for type-safe destination enum
   - ✅ `Destination.match()` for detecting save actions
   - ✅ `Destination.reducer` for running child reducers

4. **navigation-dsl-spec.md**
   - ✅ `scopeTo()` helper for ergonomic view scoping
   - ✅ Fluent API: `scopeTo(store).into('destination').case('addItem')`

5. **animation-integration-spec.md**
   - ✅ `PresentationState<T>` for animation lifecycle
   - ✅ Separate `destination` and `presentation` fields
   - ✅ `Effect.afterDelay()` for animation timing
   - ✅ Animation guards preventing race conditions

**Result**: A fully type-safe, testable, composable inventory management system with animated modals and declarative navigation.

---

**End of Matcher Specification**
