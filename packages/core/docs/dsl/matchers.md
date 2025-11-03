# Matcher API

The Matcher API provides type-safe, ergonomic helpers for observing and reacting to child actions in parent reducers. These matchers enable parent observation patterns without breaking encapsulation.

## Table of Contents

- [Overview](#overview)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
  - [matchPresentationAction()](#matchpresentationaction)
  - [isActionAtPath()](#isactionatpath)
  - [matchPaths()](#matchpaths)
  - [extractDestinationOnAction()](#extractdestinationonaction)
- [Case Paths](#case-paths)
- [Integration with Destination DSL](#integration-with-destination-dsl)
- [Usage Patterns](#usage-patterns)
- [Best Practices](#best-practices)
- [Performance](#performance)

## Overview

### The Problem

In a composable architecture, child reducers manage their own state and dispatch their own actions. However, parents often need to observe specific child actions to coordinate application state:

```typescript
// Parent wants to know when child saves an item
case 'destination':
  // How do we know if the child dispatched 'saveButtonTapped'?
  // We need to unwrap the nested action structure manually...
  if (
    action.action.type === 'presented' &&
    action.action.action &&
    action.action.action.type === 'saveButtonTapped'
  ) {
    // Finally! But this is verbose and error-prone
  }
```

Problems with manual matching:
- Verbose nested property access
- Easy to make mistakes
- No autocomplete
- Hard to maintain
- Doesn't work well with TypeScript narrowing

### The Solution

The Matcher API provides type-safe helpers that handle the complexity:

```typescript
// Clean, type-safe, autocomplete-friendly!
const saveAction = matchPresentationAction(action, 'destination.saveButtonTapped');
if (saveAction) {
  // TypeScript knows saveAction is SaveButtonTappedAction
  // Handle the save
}
```

Benefits:
- Type-safe with full inference
- Template literal types for autocomplete
- Compile-time typo detection
- Clean, readable code
- Zero runtime overhead

## Core Concepts

### PresentationAction Wrapper

All child actions are wrapped in a `PresentationAction` envelope when passed to parents:

```typescript
type PresentationAction<T> =
  | { type: 'presented'; action: T }
  | { type: 'dismiss' };
```

This wrapper serves two purposes:
1. **Lifecycle Management**: Distinguishes child actions from dismiss requests
2. **Parent Observation**: Enables parents to observe child actions without breaking encapsulation

### Nested Action Structure

Actions form a nested hierarchy:

```typescript
// Parent action
{
  type: 'destination',  // Parent action field
  action: {
    type: 'presented',  // PresentationAction wrapper
    action: {
      type: 'saveButtonTapped'  // Actual child action
    }
  }
}
```

The matcher API navigates this hierarchy automatically.

### Case Paths

Case paths are dot-separated strings that describe the path to a child action:

```typescript
"destination.saveButtonTapped"
 ↑           ↑
 |           └── Child action type
 └── Parent action field
```

Template literal types provide autocomplete and compile-time validation:

```typescript
type CasePath =
  | "destination.saveButtonTapped"
  | "destination.cancelButtonTapped"
  | "destination.deleteButtonTapped";

const path: CasePath = "destination.saveButonTapped";  // ✗ Typo detected!
```

## API Reference

### matchPresentationAction()

Matches an action against a case path and extracts the child action if matched.

**Signature:**
```typescript
function matchPresentationAction<A>(
  action: unknown,
  path: CasePath
): A | null
```

**Parameters:**
- `action` - The parent action to match (can be any shape)
- `path` - The case path to match (e.g., `"destination.saveButtonTapped"`)

**Returns:**
- The child action if path matches
- `null` if path doesn't match

**Example:**
```typescript
interface SaveAction {
  type: 'saveButtonTapped';
  data: { name: string; quantity: number };
}

type ParentAction =
  | { type: 'addButtonTapped' }
  | { type: 'destination'; action: PresentationAction<SaveAction> };

const reducer: Reducer<ParentState, ParentAction> = (state, action) => {
  // Check if child dispatched saveButtonTapped
  const saveAction = matchPresentationAction<SaveAction>(
    action,
    'destination.saveButtonTapped'
  );

  if (saveAction) {
    // TypeScript knows saveAction is SaveAction
    return [
      {
        ...state,
        items: [...state.items, saveAction.data],
        destination: null
      },
      Effect.none()
    ];
  }

  // Otherwise, delegate to child via ifLet
  return ifLet(...)(state, action, deps);
};
```

**Path Traversal:**

The function navigates the nested action structure step by step:

```typescript
// Path: "destination.saveButtonTapped"

// Step 1: Check action.type === 'destination'
// Step 2: Check action.action.type === 'presented'
// Step 3: Check action.action.action.type === 'saveButtonTapped'
// Step 4: Return action.action.action (the child action)
```

**Handling Dismiss:**

Dismiss actions don't have a nested child action:

```typescript
const dismissAction = {
  type: 'destination',
  action: { type: 'dismiss' }
};

const result = matchPresentationAction(dismissAction, 'destination.saveButtonTapped');
// Result: null (dismiss actions don't match specific child actions)
```

**Deeply Nested Paths:**

Supports arbitrary nesting depth:

```typescript
// Match deeply nested action
const childAction = matchPresentationAction(
  action,
  'settings.account.security.changePassword'
);
```

**Error Handling:**

Returns `null` for malformed actions (no exceptions thrown):

```typescript
matchPresentationAction(null, 'destination.save');       // null
matchPresentationAction(undefined, 'destination.save');  // null
matchPresentationAction({}, 'destination.save');         // null
matchPresentationAction('string', 'destination.save');   // null
```

### isActionAtPath()

Boolean check for whether an action matches a case path, with optional predicate.

**Signature:**
```typescript
function isActionAtPath<A = unknown>(
  action: unknown,
  path: CasePath,
  predicate?: (action: A) => boolean
): boolean
```

**Parameters:**
- `action` - The parent action to check
- `path` - The case path to match
- `predicate` - Optional predicate to test the matched action

**Returns:**
- `true` if action matches path and passes predicate (if provided)
- `false` otherwise

**Basic Usage:**
```typescript
const reducer: Reducer<ParentState, ParentAction> = (state, action) => {
  // Simple path check
  if (isActionAtPath(action, 'destination.cancelButtonTapped')) {
    return [{ ...state, destination: null }, Effect.none()];
  }

  // Continue with other logic
  return ifLet(...)(state, action, deps);
};
```

**With Predicate:**
```typescript
interface UpdateAction {
  type: 'itemUpdated';
  id: string;
  name: string;
}

const reducer: Reducer<ParentState, ParentAction> = (state, action) => {
  // Check if child updated a specific item
  if (isActionAtPath<UpdateAction>(
    action,
    'destination.itemUpdated',
    (a) => a.id === state.selectedId
  )) {
    // Child updated the selected item
    return [
      {
        ...state,
        items: state.items.map(i =>
          i.id === state.selectedId ? { ...i, name: a.name } : i
        )
      },
      Effect.none()
    ];
  }

  return ifLet(...)(state, action, deps);
};
```

**Guard Clauses:**
```typescript
const reducer: Reducer<ParentState, ParentAction> = (state, action) => {
  // Early return for cancel
  if (isActionAtPath(action, 'destination.cancelButtonTapped')) {
    return [{ ...state, destination: null }, Effect.none()];
  }

  // Early return for dismiss
  if (isActionAtPath(action, 'destination')) {
    // Matches any destination action (prefix matching)
    return handleDestinationAction(state, action, deps);
  }

  return [state, Effect.none()];
};
```

**Predicate with Type Narrowing:**
```typescript
interface SaveAction {
  type: 'saveButtonTapped';
  data?: { name: string; quantity: number };
}

// Check if save action has data
if (isActionAtPath<SaveAction>(
  action,
  'destination.saveButtonTapped',
  (a) => a.data !== undefined
)) {
  // TypeScript knows action matched AND has data
  const matched = matchPresentationAction<SaveAction>(action, 'destination.saveButtonTapped');
  if (matched?.data) {
    console.log('Saving:', matched.data.name);
  }
}
```

### matchPaths()

Matches an action against multiple paths and executes handlers.

**Signature:**
```typescript
function matchPaths<T>(
  action: unknown,
  handlers: Record<CasePath, (action: any) => T>
): T | null
```

**Parameters:**
- `action` - The parent action to match
- `handlers` - Object mapping case paths to handler functions

**Returns:**
- The result of the matched handler
- `null` if no handlers matched

**Example:**
```typescript
const reducer: Reducer<ParentState, ParentAction> = (state, action, deps) => {
  // Match multiple child actions with handlers
  const result = matchPaths(action, {
    'destination.saveButtonTapped': (saveAction) => {
      return [
        {
          ...state,
          items: [...state.items, saveAction.data],
          destination: null
        },
        Effect.none()
      ] as const;
    },

    'destination.cancelButtonTapped': () => {
      return [
        { ...state, destination: null },
        Effect.none()
      ] as const;
    },

    'destination.deleteButtonTapped': (deleteAction) => {
      return [
        {
          ...state,
          items: state.items.filter(i => i.id !== deleteAction.id),
          destination: null
        },
        Effect.none()
      ] as const;
    }
  });

  // If a handler matched, return its result
  if (result) {
    return result;
  }

  // Otherwise, delegate to child reducer
  return ifLet(...)(state, action, deps);
};
```

**Type-Safe Handlers:**
```typescript
interface SaveAction {
  type: 'saveButtonTapped';
  name: string;
  quantity: number;
}

interface DeleteAction {
  type: 'deleteButtonTapped';
  id: string;
}

const result = matchPaths<[ParentState, Effect<ParentAction>]>(action, {
  'destination.saveButtonTapped': (saveAction: SaveAction) => {
    // TypeScript knows saveAction is SaveAction
    return [
      {
        ...state,
        items: [...state.items, { name: saveAction.name, qty: saveAction.quantity }]
      },
      Effect.none()
    ] as const;
  },

  'destination.deleteButtonTapped': (deleteAction: DeleteAction) => {
    // TypeScript knows deleteAction is DeleteAction
    return [
      {
        ...state,
        items: state.items.filter(i => i.id !== deleteAction.id)
      },
      Effect.none()
    ] as const;
  }
});
```

**Handler Order:**

Handlers are tried in object iteration order (first match wins):

```typescript
// Order matters!
const result = matchPaths(action, {
  'destination.saveButtonTapped': () => 'specific',
  'destination': () => 'prefix'  // Never reached if save matches
});
```

**Fallback Patterns:**
```typescript
const result = matchPaths(action, {
  'destination.saveButtonTapped': (a) => handleSave(a),
  'destination.cancelButtonTapped': (a) => handleCancel(a),
  'destination': (a) => handleOtherDestinationActions(a)  // Fallback
});
```

### extractDestinationOnAction()

Combines action matching with state extraction for convenience.

**Signature:**
```typescript
function extractDestinationOnAction<ParentState, DestState>(
  action: unknown,
  state: ParentState,
  path: CasePath,
  getDestination: (state: ParentState) => DestState | null
): DestState | null
```

**Parameters:**
- `action` - The parent action to match
- `state` - The parent state containing destination
- `path` - The case path to match
- `getDestination` - Function to extract destination from parent state

**Returns:**
- The destination state if action matches
- `null` otherwise

**Example:**
```typescript
type DestinationState =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState };

interface ParentState {
  items: Item[];
  destination: DestinationState | null;
}

const reducer: Reducer<ParentState, ParentAction> = (state, action) => {
  // Extract destination state when child saves
  const destState = extractDestinationOnAction(
    action,
    state,
    'destination.saveButtonTapped',
    (s) => s.destination
  );

  if (destState) {
    // We have destination state AND action matched
    if (destState.type === 'addItem') {
      const itemData = destState.state;
      return [
        {
          ...state,
          items: [...state.items, { name: itemData.name, qty: itemData.quantity }],
          destination: null
        },
        Effect.none()
      ];
    }

    if (destState.type === 'editItem') {
      const itemData = destState.state;
      return [
        {
          ...state,
          items: state.items.map(i =>
            i.id === itemData.id
              ? { ...i, name: itemData.name, qty: itemData.quantity }
              : i
          ),
          destination: null
        },
        Effect.none()
      ];
    }
  }

  return ifLet(...)(state, action, deps);
};
```

**Nested State Access:**
```typescript
interface AppState {
  navigation: {
    modal: ModalState | null;
  };
}

const modalState = extractDestinationOnAction(
  action,
  state,
  'modal.confirm',
  (s) => s.navigation.modal
);
```

**Use Cases:**

1. **Observing child save actions:**
   ```typescript
   const dest = extractDestinationOnAction(
     action,
     state,
     'destination.saveButtonTapped',
     (s) => s.destination
   );
   if (dest) {
     // Save the data from destination state
   }
   ```

2. **Coordinating multi-step flows:**
   ```typescript
   const wizardState = extractDestinationOnAction(
     action,
     state,
     'wizard.stepCompleted',
     (s) => s.wizard
   );
   if (wizardState) {
     // Move to next step based on wizard state
   }
   ```

3. **Validation before dismissal:**
   ```typescript
   const formState = extractDestinationOnAction(
     action,
     state,
     'form.submit',
     (s) => s.form
   );
   if (formState && !isValid(formState)) {
     // Show validation error instead of dismissing
   }
   ```

## Case Paths

### Format

Case paths are dot-separated strings representing the path to a child action:

```typescript
"field.childField.actionType"
```

Components:
1. **Field** - Parent action field name (e.g., `"destination"`)
2. **Child Field** (optional) - Nested child field
3. **Action Type** - The child action type

### Examples

**Simple Path:**
```typescript
"destination"  // Matches { type: 'destination', ... }
```

**Nested Path:**
```typescript
"destination.saveButtonTapped"
// Matches:
// {
//   type: 'destination',
//   action: {
//     type: 'presented',
//     action: { type: 'saveButtonTapped' }
//   }
// }
```

**Deeply Nested:**
```typescript
"settings.account.security.changePassword"
// Matches:
// {
//   type: 'settings',
//   action: {
//     type: 'presented',
//     action: {
//       type: 'account',
//       action: {
//         type: 'presented',
//         action: {
//           type: 'security',
//           action: {
//             type: 'presented',
//             action: { type: 'changePassword' }
//           }
//         }
//       }
//     }
//   }
// }
```

### Type-Safe Paths

Define case path types for autocomplete and validation:

```typescript
type DestinationPaths =
  | "destination"
  | "destination.saveButtonTapped"
  | "destination.cancelButtonTapped"
  | "destination.deleteButtonTapped"
  | "destination.nameChanged"
  | "destination.quantityChanged";

// TypeScript enforces valid paths
const path: DestinationPaths = "destination.saveButtonTapped";  // ✓
const invalid: DestinationPaths = "destination.saveButonTapped";  // ✗ Typo!
```

**Generate from Destination DSL:**
```typescript
const Destination = createDestination({
  addItem: addItemReducer,
  editItem: editItemReducer
});

// Use generated types
type Paths = DestinationCasePath<typeof Destination._types.State>;
// Result:
// | "addItem"
// | "addItem.saveButtonTapped"
// | "addItem.cancelButtonTapped"
// | "editItem"
// | "editItem.saveButtonTapped"
// | "editItem.deleteButtonTapped"
```

## Integration with Destination DSL

The Matcher API integrates seamlessly with the Destination DSL for powerful parent observation patterns.

### Combined Usage

```typescript
// 1. Create destination with auto-generated matchers
const Destination = createDestination({
  addItem: addItemReducer,
  editItem: editItemReducer
});

// 2. Use matchers in parent reducer
const parentReducer: Reducer<ParentState, ParentAction> = (state, action, deps) => {
  // Option A: Use Destination.is() and Destination.matchCase()
  const addState = Destination.matchCase(
    action,
    state.destination,
    'addItem.saveButtonTapped'
  );

  if (addState) {
    return [
      {
        ...state,
        items: [...state.items, { name: addState.name, qty: addState.quantity }],
        destination: null
      },
      Effect.none()
    ];
  }

  // Option B: Use standalone matchers
  const saveAction = matchPresentationAction(action, 'destination.saveButtonTapped');
  if (saveAction) {
    // Handle save
  }

  // Delegate to child
  return ifLetPresentation(...)(state, action, deps);
};
```

### Destination.match() vs matchPaths()

Both provide multi-path matching, but with different trade-offs:

**Destination.match()** - Type-safe, destination-scoped:
```typescript
const result = Destination.match(action, state.destination, {
  'addItem.saveButtonTapped': (addState) => {
    // TypeScript knows addState is AddItemState
    return { type: 'add', item: addState };
  },
  'editItem.saveButtonTapped': (editState) => {
    // TypeScript knows editState is EditItemState
    return { type: 'edit', item: editState };
  }
});
```

**matchPaths()** - Flexible, action-scoped:
```typescript
const result = matchPaths(action, {
  'destination.saveButtonTapped': (saveAction) => {
    // saveAction is the actual action object
    return handleSave(saveAction);
  },
  'destination.cancelButtonTapped': () => {
    return handleCancel();
  }
});
```

**When to use each:**
- Use `Destination.match()` when you need destination state in handlers
- Use `matchPaths()` when you only need the action itself
- Use `Destination.match()` for better type safety with destination unions
- Use `matchPaths()` for more flexible matching across different action types

## Usage Patterns

### Pattern 1: Guard Clauses

Use matchers for early returns in reducers:

```typescript
const reducer: Reducer<ParentState, ParentAction> = (state, action, deps) => {
  // Guard: Handle cancel action
  if (isActionAtPath(action, 'destination.cancelButtonTapped')) {
    return [{ ...state, destination: null }, Effect.none()];
  }

  // Guard: Handle save action
  const saveAction = matchPresentationAction(action, 'destination.saveButtonTapped');
  if (saveAction) {
    return [
      {
        ...state,
        items: [...state.items, saveAction.data],
        destination: null
      },
      Effect.none()
    ];
  }

  // Default: Delegate to child
  return ifLetPresentation(...)(state, action, deps);
};
```

### Pattern 2: Multi-Path Matching

Use `matchPaths()` for handling multiple child actions:

```typescript
const reducer: Reducer<ParentState, ParentAction> = (state, action, deps) => {
  const result = matchPaths<[ParentState, Effect<ParentAction>]>(action, {
    'destination.saveButtonTapped': (saveAction) => {
      return [
        {
          ...state,
          items: [...state.items, saveAction.data],
          destination: null
        },
        Effect.none()
      ] as const;
    },

    'destination.deleteButtonTapped': (deleteAction) => {
      return [
        {
          ...state,
          items: state.items.filter(i => i.id !== deleteAction.id),
          destination: null
        },
        Effect.none()
      ] as const;
    },

    'destination.cancelButtonTapped': () => {
      return [
        { ...state, destination: null },
        Effect.none()
      ] as const;
    }
  });

  if (result) return result;

  return ifLetPresentation(...)(state, action, deps);
};
```

### Pattern 3: Conditional Observation

Observe child actions only when certain conditions are met:

```typescript
const reducer: Reducer<ParentState, ParentAction> = (state, action) => {
  // Only observe save if validation passes
  if (isActionAtPath(action, 'destination.saveButtonTapped')) {
    const destState = extractDestinationOnAction(
      action,
      state,
      'destination.saveButtonTapped',
      (s) => s.destination
    );

    if (destState) {
      const isValid = validateDestination(destState);

      if (!isValid) {
        // Show validation error instead of saving
        return [
          {
            ...state,
            error: 'Validation failed. Please check your input.'
          },
          Effect.none()
        ];
      }

      // Validation passed - save
      return [
        {
          ...state,
          items: [...state.items, extractItemData(destState)],
          destination: null,
          error: null
        },
        Effect.none()
      ];
    }
  }

  return ifLetPresentation(...)(state, action, deps);
};
```

### Pattern 4: Parent Coordination

Coordinate multiple child features:

```typescript
const reducer: Reducer<ParentState, ParentAction> = (state, action, deps) => {
  // Child saved - show confirmation alert
  if (isActionAtPath(action, 'destination.saveButtonTapped')) {
    return [
      {
        ...state,
        destination: null,  // Close modal
        alert: {
          type: 'confirmation',
          message: 'Item saved successfully!'
        }
      },
      Effect.none()
    ];
  }

  // Child cancelled - no alert needed
  if (isActionAtPath(action, 'destination.cancelButtonTapped')) {
    return [
      { ...state, destination: null },
      Effect.none()
    ];
  }

  return ifLetPresentation(...)(state, action, deps);
};
```

### Pattern 5: Effect Coordination

Dispatch effects based on child actions:

```typescript
const reducer: Reducer<ParentState, ParentAction> = (state, action, deps) => {
  const saveAction = matchPresentationAction(action, 'destination.saveButtonTapped');

  if (saveAction) {
    return [
      {
        ...state,
        items: [...state.items, saveAction.data],
        destination: null
      },
      Effect.batch(
        // Analytics
        Effect.fireAndForget(async () => {
          deps.analytics.track('item_saved', { name: saveAction.data.name });
        }),
        // Persistence
        Effect.run(async (dispatch) => {
          await deps.api.saveItem(saveAction.data);
          dispatch({ type: 'itemSaved', id: saveAction.data.id });
        }),
        // Notification
        Effect.run(async (dispatch) => {
          dispatch({ type: 'showToast', message: 'Item saved!' });
        })
      )
    ];
  }

  return ifLetPresentation(...)(state, action, deps);
};
```

## Best Practices

### 1. Type Your Matchers

Always provide type parameters for better type safety:

```typescript
// ✓ Good: Explicit type
const saveAction = matchPresentationAction<SaveAction>(
  action,
  'destination.saveButtonTapped'
);

// ✗ Bad: Implicit any
const saveAction = matchPresentationAction(action, 'destination.saveButtonTapped');
```

### 2. Define Case Path Types

Create type aliases for case paths:

```typescript
// ✓ Good: Type-safe paths
type DestinationPaths =
  | "destination.saveButtonTapped"
  | "destination.cancelButtonTapped"
  | "destination.deleteButtonTapped";

const path: DestinationPaths = "destination.saveButtonTapped";

// ✗ Bad: Magic strings
const path = "destination.saveButtonTapped";  // No autocomplete, no validation
```

### 3. Use Guard Clauses

Place matcher checks early in reducers:

```typescript
// ✓ Good: Early return
const reducer = (state, action) => {
  if (isActionAtPath(action, 'destination.cancelButtonTapped')) {
    return [{ ...state, destination: null }, Effect.none()];
  }

  // Continue with main logic
  return ifLetPresentation(...)(state, action, deps);
};

// ✗ Bad: Nested conditions
const reducer = (state, action) => {
  if (action.type === 'destination') {
    if (isActionAtPath(action, 'destination.cancelButtonTapped')) {
      return [{ ...state, destination: null }, Effect.none()];
    }
  }
  return ifLetPresentation(...)(state, action, deps);
};
```

### 4. Prefer Destination.match() for Multiple Paths

When working with Destination DSL, prefer `Destination.match()`:

```typescript
// ✓ Good: Uses Destination.match()
const result = Destination.match(action, state.destination, {
  'addItem.saveButtonTapped': (addState) => handleAdd(addState),
  'editItem.saveButtonTapped': (editState) => handleEdit(editState)
});

// ✗ Okay but verbose: Multiple matchCase calls
const addState = Destination.matchCase(action, state.destination, 'addItem.saveButtonTapped');
if (addState) return handleAdd(addState);

const editState = Destination.matchCase(action, state.destination, 'editItem.saveButtonTapped');
if (editState) return handleEdit(editState);
```

### 5. Document Observed Actions

Comment which child actions the parent observes:

```typescript
const parentReducer: Reducer<ParentState, ParentAction> = (state, action, deps) => {
  // Parent observes:
  // - destination.saveButtonTapped → Save item and dismiss
  // - destination.cancelButtonTapped → Dismiss without saving
  // - destination.deleteButtonTapped → Delete item and dismiss

  const result = matchPaths(action, {
    'destination.saveButtonTapped': (a) => { /* ... */ },
    'destination.cancelButtonTapped': (a) => { /* ... */ },
    'destination.deleteButtonTapped': (a) => { /* ... */ }
  });

  if (result) return result;

  // All other actions delegated to child
  return ifLetPresentation(...)(state, action, deps);
};
```

### 6. Avoid Over-Observation

Don't observe every child action - only observe coordination points:

```typescript
// ✓ Good: Observe coordination points only
const reducer = (state, action) => {
  // Parent only observes save/cancel
  if (isActionAtPath(action, 'destination.saveButtonTapped')) {
    return handleSave(state);
  }

  // All field changes handled by child
  return ifLetPresentation(...)(state, action, deps);
};

// ✗ Bad: Over-observation
const reducer = (state, action) => {
  // Parent observes every field change (too coupled!)
  if (isActionAtPath(action, 'destination.nameChanged')) {
    // Validate name
  }
  if (isActionAtPath(action, 'destination.quantityChanged')) {
    // Validate quantity
  }
  // ...etc
};
```

## Performance

### Benchmarks

Matcher functions have minimal overhead:

- **matchPresentationAction()**: < 2µs per call
- **isActionAtPath()**: < 1µs per call
- **matchPaths()**: < 5µs for 5 handlers (linear scan, short-circuits)
- **extractDestinationOnAction()**: < 3µs per call

### Optimization Tips

**1. Order handlers by frequency:**
```typescript
// Most common actions first
const result = matchPaths(action, {
  'destination.nameChanged': () => { /* Most common */ },
  'destination.quantityChanged': () => { /* Common */ },
  'destination.saveButtonTapped': () => { /* Least common */ }
});
```

**2. Use boolean checks when you don't need the action:**
```typescript
// ✓ Faster: Just boolean check
if (isActionAtPath(action, 'destination.cancelButtonTapped')) {
  return [{ ...state, destination: null }, Effect.none()];
}

// ✗ Slower: Extract action you don't use
const cancelAction = matchPresentationAction(action, 'destination.cancelButtonTapped');
if (cancelAction) {
  return [{ ...state, destination: null }, Effect.none()];
}
```

**3. Short-circuit with guards:**
```typescript
// ✓ Good: Early return avoids further matching
if (isActionAtPath(action, 'destination.cancelButtonTapped')) {
  return [{ ...state, destination: null }, Effect.none()];
}

// Continue with expensive operations
const result = matchPaths(action, { /* many handlers */ });
```

**4. Cache path strings:**
```typescript
// ✓ Good: Reuse path constants
const SAVE_PATH = 'destination.saveButtonTapped';
if (isActionAtPath(action, SAVE_PATH)) { /* ... */ }

// ✗ Bad: Recreate strings
if (isActionAtPath(action, 'destination.saveButtonTapped')) { /* ... */ }
```
