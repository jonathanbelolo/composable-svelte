# Navigation Best Practices

**A comprehensive guide to using the @composable-svelte/core navigation system correctly**

This guide documents best practices, common pitfalls, and patterns for implementing tree-based navigation in Composable Svelte applications.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Parent Observation Pattern](#parent-observation-pattern)
3. [Dependency Management](#dependency-management)
4. [Common Mistakes](#common-mistakes)
5. [Navigation Patterns](#navigation-patterns)
6. [Testing Guidelines](#testing-guidelines)
7. [Troubleshooting](#troubleshooting)

---

## Core Principles

### ✅ DO: Prefer Parent Observation for Dismissal

The library supports two approaches to dismissal. **Parent observation** is the recommended default because it keeps child reducers pure and gives the parent full control. The **dismiss dependency** (`createDismissDependency()`) is also fully supported and appropriate for simple cases where the child just needs to close itself. See "When to use which" below.

```typescript
// ✅ CORRECT: Parent observes child action
case 'destination': {
  const [newState, effect] = ifLetPresentation(
    (s) => s.destination,
    (s, d) => ({ ...s, destination: d }),
    'destination',
    childReducer
  )(state, action, deps);

  // Observe child's completion action
  if (
    action.action.type === 'presented' &&
    action.action.action.type === 'saveButtonTapped'
  ) {
    // Parent dismisses by setting destination to null
    return [{ ...newState, destination: null }, effect];
  }

  return [newState, effect];
}
```

**Dismiss Dependency (fine for simple cases)**:

```typescript
import { createDismissDependency } from '@composable-svelte/core/navigation';

// Simple child that just needs to close itself
const childReducer = (state, action, deps) => {
  case 'closeButtonTapped':
    deps.dismiss();  // OK when parent doesn't need to observe this
    return [state, Effect.none()];
}
```

**When to use which**:
- **Parent observation**: When the parent needs to react to the child's action (save data, update lists, show confirmation)
- **Dismiss dependency**: When the child simply needs to close and the parent doesn't care why

### ✅ DO: Keep Child Reducers Pure

Child reducers should be **pure functions** that only return state and effects. They should not directly trigger side effects like dismissal (unless using the dismiss dependency for simple close actions).

```typescript
// ✅ CORRECT: Pure child reducer
export const addToCartReducer: Reducer<
  AddToCartState,
  AddToCartAction,
  AddToCartDependencies
> = (state, action, deps) => {
  switch (action.type) {
    case 'addButtonTapped':
      // Just return state - parent will observe this action
      return [state, Effect.none()];

    case 'cancelButtonTapped':
      // Just return state - parent will observe this action
      return [state, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
```

### ✅ DO: Use Empty Dependencies When No Callbacks Needed

If a child reducer doesn't need any external dependencies, use an empty interface:

```typescript
// ✅ CORRECT: Empty dependencies interface
export interface AddToCartDependencies {
  // No dependencies needed - parent observes actions
}
```

---

## Parent Observation Pattern

### The Three-Step Pattern

1. **Child Dispatches Action**: Child feature dispatches an action (e.g., `saveButtonTapped`)
2. **Parent Observes**: Parent reducer observes the child action via `ifLetPresentation`
3. **Parent Handles**: Parent updates state (e.g., sets `destination: null`) and/or dispatches effects

### Complete Example

```typescript
// Child Reducer (AddToCart)
export interface AddToCartDependencies {
  // No dependencies needed
}

export const addToCartReducer: Reducer<
  AddToCartState,
  AddToCartAction,
  AddToCartDependencies
> = (state, action, deps) => {
  switch (action.type) {
    case 'addButtonTapped':
      // Parent will observe this action
      return [state, Effect.none()];

    case 'cancelButtonTapped':
      // Parent will observe this action
      return [state, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
```

```typescript
// Parent Reducer (ProductDetail)
export interface ProductDetailDependencies {
  onCartItemAdded?: (productId: string, quantity: number) => void;
}

export const productDetailReducer: Reducer<
  ProductDetailState,
  ProductDetailAction,
  ProductDetailDependencies
> = (state, action, deps) => {
  switch (action.type) {
    case 'destination': {
      const [newState, effect] = ifLetPresentation(
        (s) => s.destination,
        (s, d) => ({ ...s, destination: d }),
        'destination',
        destinationReducer
      )(state, action, deps);

      const presentedAction = action.action;

      // Observe AddToCart completion
      if (
        presentedAction.type === 'presented' &&
        presentedAction.action.type === 'addToCart' &&
        presentedAction.action.action.type === 'addButtonTapped'
      ) {
        const addToCartState = state.destination;
        if (addToCartState?.type === 'addToCart') {
          const { productId, quantity } = addToCartState.state;

          // Notify grandparent and dismiss
          if (deps.onCartItemAdded) {
            return [
              { ...newState, destination: null },  // Dismiss
              Effect.batch(
                effect,
                Effect.run((dispatch) => {
                  deps.onCartItemAdded!(productId, quantity);
                })
              )
            ];
          }
        }
      }

      // Observe AddToCart cancellation
      if (
        presentedAction.type === 'presented' &&
        presentedAction.action.type === 'addToCart' &&
        presentedAction.action.action.type === 'cancelButtonTapped'
      ) {
        // Just dismiss
        return [{ ...newState, destination: null }, effect];
      }

      return [newState, effect];
    }

    default:
      return [state, Effect.none()];
  }
};
```

---

## Dependency Management

### When to Use Dependencies

Use dependencies for:
- ✅ **Upward Communication**: Notifying parent/grandparent of important events
- ✅ **External Services**: API clients, analytics, logging
- ✅ **Shared Resources**: User session, app configuration

```typescript
// ✅ CORRECT: Dependencies for upward communication
export interface ProductDetailDependencies {
  onCartItemAdded?: (productId: string, quantity: number) => void;
  onProductDeleted?: (productId: string) => void;
}
```

### When NOT to Use Dependencies

Do **not** use dependencies for:
- ❌ **Navigation**: Use state changes instead
- ❌ **Dispatch Functions**: Pass via store, not dependencies

```typescript
// ❌ WRONG: Using dependencies for dispatch
export interface ChildDependencies {
  dispatch: (action: ParentAction) => void;  // ❌ Don't do this
}
```

Note: The `dismiss` dependency is a valid use case — see `createDismissDependency()` from `@composable-svelte/core/navigation`. Use it for simple close actions; use parent observation when the parent needs to react.

### Providing Dependencies

Always provide the correct dependencies when calling child reducers:

```typescript
// ✅ CORRECT: Provide dependencies
case 'productDetail': {
  const productDetailDeps = {
    onCartItemAdded: (productId: string, quantity: number) => {
      // Will be called via Effect.run() when cart item is added
    },
    onProductDeleted: (productId: string) => {
      // Will be called via Effect.run() when product is deleted
    }
  };

  const [newState, effect] = ifLetPresentation(
    (s) => s.productDetail,
    (s, detail) => ({ ...s, productDetail: detail }),
    'productDetail',
    productDetailReducer
  )(state, action, productDetailDeps);  // ✅ Provide dependencies

  return [newState, effect];
}
```

```typescript
// ❌ WRONG: Empty dependencies when callbacks are expected
const [newState, effect] = ifLetPresentation(
  (s) => s.productDetail,
  (s, detail) => ({ ...s, productDetail: detail }),
  'productDetail',
  productDetailReducer
)(state, action, {});  // ❌ Missing required dependencies
```

---

## Common Mistakes

### Mistake 1: Using `deps.dismiss()` When Parent Needs to Observe

**Problem**: Child reducer calls `deps.dismiss()` for an action the parent needs to react to (e.g., saving data).

```typescript
// ❌ WRONG when parent needs to handle the save
case 'saveButtonTapped':
  deps.dismiss();  // Parent never sees this action!
  return [state, Effect.none()];
```

**Solution**: Let parent observe the action so it can handle both the save and the dismissal.

```typescript
// ✅ CORRECT for actions the parent needs to observe
case 'saveButtonTapped':
  // Parent will observe this action, handle the save, and dismiss
  return [state, Effect.none()];
```

Note: `deps.dismiss()` is fine for simple close/cancel actions where the parent doesn't need to react.

### Mistake 2: Not Providing Required Dependencies

**Problem**: Parent reducer passes empty dependencies when child expects callbacks.

```typescript
// ❌ WRONG
const [newState, effect] = ifLetPresentation(
  (s) => s.destination,
  (s, d) => ({ ...s, destination: d }),
  'destination',
  childReducer
)(state, action, {});  // ❌ Empty dependencies
```

**Solution**: Provide the expected dependencies.

```typescript
// ✅ CORRECT
const childDeps = {
  onItemAdded: (item: Item) => {
    // Handle in Effect
  }
};

const [newState, effect] = ifLetPresentation(
  (s) => s.destination,
  (s, d) => ({ ...s, destination: d }),
  'destination',
  childReducer
)(state, action, childDeps);  // ✅ Provide dependencies
```

### Mistake 3: Forgetting to Observe Cancel Actions

**Problem**: Parent observes "success" actions but forgets to observe "cancel" actions.

```typescript
// ❌ INCOMPLETE
if (
  presentedAction.type === 'presented' &&
  presentedAction.action.type === 'addToCart' &&
  presentedAction.action.action.type === 'addButtonTapped'
) {
  return [{ ...newState, destination: null }, effect];
}
// ❌ Missing cancelButtonTapped observation
```

**Solution**: Observe all actions that should trigger dismissal.

```typescript
// ✅ CORRECT
// Observe success action
if (
  presentedAction.type === 'presented' &&
  presentedAction.action.type === 'addToCart' &&
  presentedAction.action.action.type === 'addButtonTapped'
) {
  return [{ ...newState, destination: null }, effect];
}

// ✅ Observe cancel action
if (
  presentedAction.type === 'presented' &&
  presentedAction.action.type === 'addToCart' &&
  presentedAction.action.action.type === 'cancelButtonTapped'
) {
  return [{ ...newState, destination: null }, effect];
}
```

### Mistake 4: Using `disableClickOutside` Incorrectly

**Problem**: Not disabling click-outside when child presents nested modals/sheets/alerts.

```typescript
// ❌ WRONG: Click-outside enabled on parent modal
<Modal store={parentStore}>
  <!-- Child can present sheets/alerts -->
  <!-- User clicks outside child sheet -> parent modal dismisses! -->
</Modal>
```

**Solution**: Disable click-outside on parent when children can present their own UI.

```typescript
// ✅ CORRECT: Disable click-outside on parent
<Modal store={parentStore} disableClickOutside>
  <!-- Child can safely present sheets/alerts -->
  <!-- Clicking outside child sheet only dismisses child, not parent -->
</Modal>
```

---

## Navigation Patterns

### Pattern 1: Simple Modal with No Nested Navigation

```typescript
// State
interface AppState {
  addItem: AddItemState | null;
}

// Reducer
case 'addItem': {
  const [newState, effect] = ifLetPresentation(
    (s) => s.addItem,
    (s, item) => ({ ...s, addItem: item }),
    'addItem',
    addItemReducer
  )(state, action, {});

  // Observe save action
  if (
    action.action.type === 'presented' &&
    action.action.action.type === 'saveButtonTapped'
  ) {
    // Dismiss
    return [{ ...newState, addItem: null }, effect];
  }

  return [newState, effect];
}

// Component
<Modal store={scopeToDestination(store, ['addItem'], 'addItem', 'addItem')}>
  {#snippet children({ store: childStore })}
    <AddItem store={childStore} />
  {/snippet}
</Modal>
```

### Pattern 2: Modal with Nested Sheets/Alerts

```typescript
// State
interface ProductDetailState {
  destination: ProductDetailDestination | null;
}

type ProductDetailDestination =
  | { type: 'addToCart'; state: AddToCartState }
  | { type: 'share'; state: ShareState }
  | { type: 'deleteAlert'; state: DeleteAlertState };

// Reducer
case 'destination': {
  const [newState, effect] = ifLetPresentation(
    (s) => s.destination,
    (s, d) => ({ ...s, destination: d }),
    'destination',
    destinationReducer
  )(state, action, deps);

  // Observe all child completion actions
  if (
    action.action.type === 'presented' &&
    action.action.action.type === 'addToCart' &&
    action.action.action.action.type === 'addButtonTapped'
  ) {
    return [{ ...newState, destination: null }, effect];
  }

  // ... more observations ...

  return [newState, effect];
}

// Component - IMPORTANT: disableClickOutside on parent!
<Modal store={parentStore} disableClickOutside>
  {#snippet children({ store })}
    <ProductDetail store={store} />
  {/snippet}
</Modal>
```

### Pattern 3: Upward Communication via Dependencies

```typescript
// Grandchild notifies grandparent via dependencies
export interface ChildDependencies {
  onImportantEvent?: (data: EventData) => void;
}

// Child reducer
case 'eventHappened': {
  return [
    state,
    Effect.run((dispatch) => {
      if (deps.onImportantEvent) {
        deps.onImportantEvent(eventData);
      }
    })
  ];
}

// Parent provides dependency that bubbles to grandparent
case 'childDestination': {
  const childDeps = {
    onImportantEvent: (data: EventData) => {
      // Bubble up to grandparent via our own dependency
      if (deps.onGrandchildEvent) {
        // Will execute in Effect
      }
    }
  };

  const [newState, effect] = ifLetPresentation(
    (s) => s.childDestination,
    (s, d) => ({ ...s, childDestination: d }),
    'childDestination',
    childReducer
  )(state, action, childDeps);

  return [newState, effect];
}
```

---

## Testing Guidelines

### Testing Child Reducers

Test child reducers in isolation without dependencies:

```typescript
describe('AddToCartReducer', () => {
  it('returns state unchanged when add button tapped', () => {
    const state: AddToCartState = {
      productId: 'prod-1',
      quantity: 2
    };

    const [newState, effect] = addToCartReducer(
      state,
      { type: 'addButtonTapped' },
      {}  // Empty dependencies
    );

    expect(newState).toEqual(state);
    expect(effect._tag).toBe('None');
  });

  it('returns state unchanged when cancel button tapped', () => {
    const state: AddToCartState = {
      productId: 'prod-1',
      quantity: 2
    };

    const [newState, effect] = addToCartReducer(
      state,
      { type: 'cancelButtonTapped' },
      {}  // Empty dependencies
    );

    expect(newState).toEqual(state);
    expect(effect._tag).toBe('None');
  });
});
```

### Testing Parent Observation

Test that parent correctly observes child actions:

```typescript
describe('ProductDetailReducer - Parent Observation', () => {
  it('dismisses AddToCart when add button tapped', () => {
    const state: ProductDetailState = {
      productId: 'prod-1',
      destination: {
        type: 'addToCart',
        state: { productId: 'prod-1', quantity: 2 }
      }
    };

    const action: ProductDetailAction = {
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'addToCart',
          action: { type: 'addButtonTapped' }
        }
      }
    };

    const deps = {
      onCartItemAdded: vi.fn()
    };

    const [newState, effect] = productDetailReducer(state, action, deps);

    // Destination should be dismissed
    expect(newState.destination).toBeNull();

    // Dependency should be called (in effect)
    // Test effect execution separately
  });
});
```

### Testing with Vitest Browser Mode

Test the complete integration with actual UI:

```typescript
import { render } from '@testing-library/svelte';
import { expect, test } from 'vitest';

test('Add to Cart flow - Add button dismisses sheet', async () => {
  const { page } = render(App);

  // Open product detail
  await page.getByRole('button', { name: /Bluetooth Speaker/ }).click();

  // Open add to cart
  await page.getByRole('button', { name: 'Add to Cart' }).click();

  // Click add button
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // Sheet should be dismissed
  expect(page.getByRole('dialog', { name: 'Bottom sheet' })).not.toBeVisible();

  // Modal should still be visible
  expect(page.getByRole('dialog', { name: 'Modal dialog' })).toBeVisible();
});
```

---

## Troubleshooting

### Console Error: "deps.dismiss is not a function"

**Problem**: Child reducer is trying to call `deps.dismiss()` but the dependency wasn't provided.

**Solution** (choose one):
1. **Provide the dependency**: Use `createDismissDependency()` from `@composable-svelte/core/navigation` when setting up the child
2. **Switch to parent observation**: Remove `deps.dismiss()` from the child, let the parent observe the action and set `destination: null`

### Child Action Not Observed by Parent

**Problem**: Parent reducer doesn't see child actions, dismissal doesn't happen.

**Checklist**:
1. ✅ Is `ifLetPresentation` being used correctly?
2. ✅ Is the action type matching exactly (case-sensitive)?
3. ✅ Is the action wrapped correctly? Check: `action.action.type === 'presented'`
4. ✅ Is the destination case type matching? Check: `action.action.action.type === 'addToCart'`
5. ✅ Is the child action type matching? Check: `action.action.action.action.type === 'addButtonTapped'`

**Debugging**: Add console.log to see action structure:

```typescript
case 'destination': {
  console.log('Destination action:', JSON.stringify(action, null, 2));
  // Check the actual structure
}
```

### Modal/Sheet Not Dismissing

**Problem**: UI component doesn't dismiss even though state is set to `null`.

**Checklist**:
1. ✅ Is the scoped store correctly observing state changes?
2. ✅ Is `scopeToDestination` being used with correct parameters?
3. ✅ Is the state path correct? (e.g., `['destination']`)
4. ✅ Is the case type correct? (e.g., `'addToCart'`)
5. ✅ Is the action field correct? (e.g., `'destination'`)

**Common Fix**: Check `scopeToDestination` parameters:

```typescript
// ✅ CORRECT
const addToCartStore = scopeToDestination(
  store,
  ['destination'],    // Path to destination in state
  'addToCart',        // Case type to match
  'destination'       // Action field name
);
```

### Click-Outside Dismissing Parent and Child

**Problem**: Clicking outside a child sheet/alert dismisses both child AND parent modal.

**Solution**: Add `disableClickOutside` to parent modal:

```typescript
<Modal store={parentStore} disableClickOutside>
  <!-- Children are safe now -->
</Modal>
```

### Effect Not Executing

**Problem**: `Effect.run()` callback isn't being called.

**Checklist**:
1. ✅ Is the effect being returned from the reducer?
2. ✅ Is the effect being passed up through `Effect.batch()` or `Effect.map()`?
3. ✅ Is the store actually executing effects?

**Common Fix**: Ensure effect is returned and not lost:

```typescript
// ✅ CORRECT: Return the effect
return [
  { ...newState, destination: null },
  Effect.batch(
    effect,  // ✅ Include child effect
    Effect.run((dispatch) => {
      deps.onImportantEvent!(data);
    })
  )
];

// ❌ WRONG: Effect is lost
return [
  { ...newState, destination: null },
  Effect.none()  // ❌ Child effect is lost!
];
```

---

## Quick Reference

### ✅ DO

- ✅ Prefer parent observation for dismissal when the parent needs to react
- ✅ Use `dismiss` dependency for simple close/cancel actions
- ✅ Keep child reducers pure
- ✅ Provide required dependencies
- ✅ Observe both success AND cancel actions
- ✅ Use `disableClickOutside` on parent modals with nested UI
- ✅ Return effects from child reducers via `Effect.batch()` or `Effect.map()`
- ✅ Test parent observation patterns
- ✅ Use empty dependency interfaces when no callbacks needed

### ❌ DON'T

- ❌ Use `deps.dismiss()` for actions the parent needs to observe (saves, confirmations)
- ❌ Pass empty dependencies when callbacks are expected
- ❌ Forget to observe cancel actions
- ❌ Enable click-outside on parents with nested UI
- ❌ Lose child effects when batching
- ❌ Use dependencies for dispatch functions
- ❌ Forget to provide dependency callbacks

---

## Additional Resources

- [Navigation Specification](../specs/frontend/navigation-spec.md)
- [Product Gallery Example](../examples/product-gallery/README.md)
- [Composable Architecture Spec](../specs/frontend/composable-svelte-spec.md)

---

**Version**: 1.1.0
**Last Updated**: 2026-03-28
**Maintainer**: Composable Svelte Team
