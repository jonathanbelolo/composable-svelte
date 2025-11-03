# Navigation System Guide

Complete guide to building navigation flows with @composable-svelte/core.

## Table of Contents

1. [Overview](#overview)
2. [Core Concepts](#core-concepts)
3. [Tree-Based Navigation](#tree-based-navigation)
4. [Stack-Based Navigation](#stack-based-navigation)
5. [Navigation Components](#navigation-components)
6. [Best Practices](#best-practices)
7. [TypeScript Patterns](#typescript-patterns)
8. [Examples](#examples)

---

## Overview

The composable-svelte navigation system provides **state-driven navigation** that is:

- ✅ **Type-safe** - Full TypeScript inference
- ✅ **Testable** - Pure reducers, no side effects
- ✅ **Composable** - Nest navigation arbitrarily deep
- ✅ **Accessible** - WCAG 2.1 AA compliant components
- ✅ **Predictable** - State determines UI, always

### Navigation Patterns

**Tree Navigation** (Modal/Sheet/Alert):
```
Parent
├─ Destination A (Modal)
│  ├─ Nested Child (Sheet)
│  └─ Another Child (Alert)
└─ Destination B (Sheet)
```

**Stack Navigation** (Multi-screen flows):
```
Screen 1 → Screen 2 → Screen 3 → Screen 4
(Step 1)   (Step 2)   (Step 3)   (Complete)
```

---

## Core Concepts

### 1. PresentationAction

Wraps child actions with presentation lifecycle:

```typescript
type PresentationAction<T> =
  | { type: 'presented'; action: T }  // Child dispatched action
  | { type: 'dismiss' };               // Child requests dismissal
```

**Usage**:
```typescript
// Child action sent to parent
{ type: 'destination', action: { type: 'presented', action: childAction } }

// User closes modal
{ type: 'destination', action: { type: 'dismiss' } }
```

### 2. Tree-Based Navigation State

Use optional state fields for navigation:

```typescript
interface ParentState {
  // null = dismissed, non-null = presented
  destination: DestinationState | null;
}

type DestinationState =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState };
```

**Key Principle**: `null` means dismissed, non-null means presented.

### 3. Parent Observation Pattern

**✅ CORRECT**: Parent observes child actions and handles dismissal

```typescript
case 'destination': {
  const [newState, effect] = ifLetPresentation(
    (s) => s.destination,
    (s, d) => ({ ...s, destination: d }),
    'destination',
    (childAction): ParentAction => ({
      type: 'destination',
      action: { type: 'presented', action: childAction }
    }),
    destinationReducer
  )(state, action, deps);

  // Observe dismiss
  if ('action' in action && action.action.type === 'dismiss') {
    return [{ ...newState, destination: null }, effect];
  }

  // Observe child completion actions
  if ('action' in action &&
      action.action.type === 'presented' &&
      action.action.action.type === 'saveButtonTapped') {
    // Child completed - dismiss and handle
    return [
      { ...newState, destination: null },
      Effect.run(async (dispatch) => {
        // Handle save...
      })
    ];
  }

  return [newState, effect];
}
```

**❌ WRONG**: Child calling `deps.dismiss()` directly

```typescript
// DON'T DO THIS - violates separation of concerns
case 'saveButtonTapped':
  deps.dismiss();  // ❌ Child shouldn't control parent state
  return [state, Effect.none()];
```

---

## Tree-Based Navigation

### Using `ifLetPresentation`

The `ifLetPresentation` operator composes a child reducer for optional state:

```typescript
ifLetPresentation<ParentState, ParentAction, ChildState, ChildAction, Dependencies>(
  toChildState,      // Extract child state: (s) => s.destination
  fromChildState,    // Update child state: (s, d) => ({ ...s, destination: d })
  actionType,        // Action type string: 'destination'
  fromChildAction,   // Wrap child action: (ca) => ({ type: 'destination', ... })
  childReducer       // Child reducer function
): Reducer<ParentState, ParentAction, Dependencies>
```

**Complete Example**:

```typescript
import { ifLetPresentation } from '@composable-svelte/core/navigation';

interface AppState {
  productDetail: ProductDetailState | null;
}

type AppAction =
  | { type: 'productClicked'; productId: string }
  | { type: 'productDetail'; action: PresentationAction<ProductDetailAction> };

const appReducer: Reducer<AppState, AppAction, AppDeps> = (state, action, deps) => {
  switch (action.type) {
    case 'productClicked':
      // Show product detail
      return [{
        ...state,
        productDetail: { productId: action.productId }
      }, Effect.none()];

    case 'productDetail': {
      // Compose child reducer
      const [newState, effect] = ifLetPresentation(
        (s: AppState) => s.productDetail,
        (s: AppState, detail) => ({ ...s, productDetail: detail }),
        'productDetail',
        (childAction): AppAction => ({
          type: 'productDetail',
          action: { type: 'presented', action: childAction }
        }),
        productDetailReducer
      )(state, action, deps);

      // Observe dismiss
      if ('action' in action && action.action.type === 'dismiss') {
        return [{ ...newState, productDetail: null }, effect];
      }

      return [newState, effect];
    }

    default:
      return [state, Effect.none()];
  }
};
```

### Enum Destinations

For multiple destination types, use discriminated unions:

```typescript
type Destination =
  | { type: 'addToCart'; state: AddToCartState }
  | { type: 'share'; state: ShareState }
  | { type: 'quickView'; state: QuickViewState }
  | { type: 'deleteAlert'; state: DeleteAlertState };

interface ProductDetailState {
  productId: string;
  destination: Destination | null;
}
```

**Reducer Helper**:

```typescript
import { createDestinationReducer } from '@composable-svelte/core/navigation';

const destinationReducer = createDestinationReducer<
  Destination,
  DestinationAction,
  Dependencies
>({
  addToCart: addToCartReducer,
  share: shareReducer,
  quickView: quickViewReducer,
  deleteAlert: deleteAlertReducer
});
```

### Store Scoping

Create scoped stores for child components:

```typescript
import { scopeToDestination } from '@composable-svelte/core/navigation';

// In your Svelte component
const addToCartStore = $derived(
  scopeToDestination(store, 'destination', 'addToCart')
);
```

**Component Usage**:

```svelte
<script lang="ts">
  import { Sheet } from '@composable-svelte/core/navigation-components';

  let { store } = $props();

  const addToCartStore = $derived(
    scopeToDestination(store, 'destination', 'addToCart')
  );
</script>

{#if addToCartStore}
  <Sheet
    open={true}
    onOpenChange={(open) => !open && addToCartStore.dismiss()}
  >
    <AddToCartContent store={addToCartStore} />
  </Sheet>
{/if}
```

---

## Stack-Based Navigation

For multi-screen flows (wizards, drill-down navigation):

### Stack State

```typescript
interface WizardState {
  stack: WizardScreen[];
}

type WizardScreen =
  | { type: 'step1'; data: Step1Data }
  | { type: 'step2'; data: Step2Data }
  | { type: 'step3'; data: Step3Data };

type WizardAction =
  | { type: 'nextStep' }
  | { type: 'previousStep' }
  | { type: 'stack'; action: StackAction<WizardScreenAction> };
```

### Stack Helpers

```typescript
import { push, pop, handleStackAction } from '@composable-svelte/core/navigation';

const wizardReducer: Reducer<WizardState, WizardAction, WizardDeps> = (state, action, deps) => {
  switch (action.type) {
    case 'nextStep':
      // Push new screen onto stack
      return push(state.stack, nextScreen);

    case 'previousStep':
      // Pop current screen
      return pop(state.stack);

    case 'stack':
      // Handle stack actions (screen dispatched action)
      return handleStackAction(
        state,
        action,
        (screenState, screenAction, screenDeps) =>
          screenReducer(screenState, screenAction, screenDeps),
        deps
      );

    default:
      return [state, Effect.none()];
  }
};
```

### Stack Component

```svelte
<script lang="ts">
  import { NavigationStack } from '@composable-svelte/core/navigation-components';

  let { store } = $props();
</script>

<NavigationStack store={store}>
  {#snippet renderScreen(screen, index)}
    {#if screen.type === 'step1'}
      <Step1Screen state={screen.data} store={store} />
    {:else if screen.type === 'step2'}
      <Step2Screen state={screen.data} store={store} />
    {:else if screen.type === 'step3'}
      <Step3Screen state={screen.data} store={store} />
    {/if}
  {/snippet}
</NavigationStack>
```

---

## Navigation Components

### Modal

Full-screen overlay dialog:

```svelte
<Modal
  open={true}
  title="Product Details"
  onOpenChange={(open) => !open && store.dismiss()}
>
  <ProductDetails store={store} />
</Modal>
```

**Styling**:
- Mobile: Full viewport
- Desktop: Centered, max-width 600px
- Backdrop: Dark overlay
- Focus: Trapped, returns on close

### Sheet

Bottom drawer (mobile-first):

```svelte
<Sheet
  open={true}
  title="Add to Cart"
  onOpenChange={(open) => !open && store.dismiss()}
>
  <AddToCartForm store={store} />
</Sheet>
```

**Styling**:
- Mobile: Slides from bottom, 60vh default
- Desktop: Same as mobile (mobile-first)
- Swipe-to-dismiss: Supported
- Focus: Trapped, returns on close

### Alert

Confirmation dialog:

```svelte
<Alert
  open={true}
  title="Delete Product?"
  description="This action cannot be undone."
  onOpenChange={(open) => !open && store.dismiss()}
  actions={[
    { label: 'Cancel', variant: 'outline', onClick: () => store.dispatch({ type: 'cancelButtonTapped' }) },
    { label: 'Delete', variant: 'destructive', onClick: () => store.dispatch({ type: 'confirmButtonTapped' }) }
  ]}
/>
```

**Styling**:
- Centered dialog
- Max-width 400px
- Action buttons at bottom
- Focus: Trapped, returns on close

### Drawer

Side panel (left/right):

```svelte
<Drawer
  open={true}
  side="right"
  title="Filters"
  onOpenChange={(open) => !open && store.dismiss()}
>
  <FilterOptions store={store} />
</Drawer>
```

**Styling**:
- Default width: 320px
- Sides: left, right
- Backdrop: Dark overlay
- Focus: Trapped, returns on close

### Popover

Contextual menu/tooltip:

```svelte
<Popover
  open={true}
  triggerElement={buttonRef}
  placement="bottom"
  onOpenChange={(open) => !open && store.dismiss()}
>
  <ProductInfo product={product} />
</Popover>
```

**Styling**:
- No backdrop
- Positioned relative to trigger
- Auto-placement to stay in viewport
- Focus: Trapped, click-outside closes

### Sidebar

Persistent navigation (desktop):

```svelte
<Sidebar
  expanded={state.sidebarExpanded}
  onToggle={() => dispatch({ type: 'sidebarToggled' })}
>
  {#snippet content()}
    <nav>
      <a href="/dashboard">Dashboard</a>
      <a href="/products">Products</a>
      <a href="/orders">Orders</a>
    </nav>
  {/snippet}
</Sidebar>
```

**Styling**:
- Expanded: 240px
- Collapsed: 64px (icon-only)
- Persistent: Not modal
- Focus: Normal tab order

### Tabs

Horizontal tabbed navigation:

```svelte
<Tabs
  tabs={[
    { id: 'details', label: 'Details' },
    { id: 'reviews', label: 'Reviews' },
    { id: 'specs', label: 'Specifications' }
  ]}
  selectedId={state.selectedTab}
  onSelect={(id) => dispatch({ type: 'tabSelected', tabId: id })}
>
  {#snippet panel(tabId)}
    {#if tabId === 'details'}
      <DetailsPanel />
    {:else if tabId === 'reviews'}
      <ReviewsPanel />
    {:else}
      <SpecsPanel />
    {/if}
  {/snippet}
</Tabs>
```

**Styling**:
- Horizontal tabs at top
- Underline indicator
- Keyboard: Arrow keys, Home/End
- ARIA: tab, tabpanel roles

---

## Best Practices

### 1. Parent Observation Over Child Dismissal

**✅ DO**: Parent observes and handles

```typescript
// Parent reducer
case 'addToCart': {
  const [newState, effect] = ifLetPresentation(...)(state, action, deps);

  // Observe completion
  if (action.action.type === 'presented' &&
      action.action.action.type === 'addButtonTapped') {
    return [
      { ...newState, destination: null }, // Dismiss
      Effect.batch(
        effect,
        Effect.run(async (dispatch) => {
          // Handle add to cart...
        })
      )
    ];
  }

  return [newState, effect];
}
```

**❌ DON'T**: Child calls dismiss directly

```typescript
// Child reducer
case 'addButtonTapped':
  deps.dismiss(); // ❌ Breaks separation of concerns
  return [state, Effect.none()];
```

### 2. Type Annotations for Action Mappers

Always annotate the return type of `fromChildAction`:

```typescript
// ✅ GOOD: Type annotation ensures proper inference
ifLetPresentation(
  (s) => s.destination,
  (s, d) => ({ ...s, destination: d }),
  'destination',
  (childAction): ParentAction => ({  // ← Type annotation
    type: 'destination',
    action: { type: 'presented', action: childAction }
  }),
  childReducer
)

// ❌ BAD: No type annotation, inference fails
ifLetPresentation(
  (s) => s.destination,
  (s, d) => ({ ...s, destination: d }),
  'destination',
  (childAction) => ({  // ← TypeScript infers `string` for type field
    type: 'destination',
    action: { type: 'presented', action: childAction }
  }),
  childReducer
)
```

### 3. Null Checks for Optional State

Always check for null before rendering:

```svelte
<script lang="ts">
  const scopedStore = $derived(scopeToDestination(store, 'destination', 'addToCart'));
</script>

{#if scopedStore}
  <Sheet open={true} onOpenChange={(open) => !open && scopedStore.dismiss()}>
    <AddToCartContent store={scopedStore} />
  </Sheet>
{/if}
```

### 4. Dismiss on Modal Close

Always dismiss when modal is closed:

```svelte
<Modal
  open={true}
  onOpenChange={(open) => {
    if (!open) {
      store.dismiss(); // Or dispatch dismiss action
    }
  }}
>
  <Content />
</Modal>
```

### 5. Focus Management

Navigation components automatically manage focus:

- ✅ Focus trap: Tab stays within modal
- ✅ Focus return: Returns to trigger on close
- ✅ Auto-focus: First focusable element on open
- ✅ Escape key: Closes modal

**No additional work needed** - built into components!

---

## TypeScript Patterns

### Action Type Definitions

```typescript
import type { PresentationAction } from '@composable-svelte/core/navigation';

// Parent actions include wrapped child actions
type ParentAction =
  | { type: 'parentAction' }
  | { type: 'destination'; action: PresentationAction<ChildAction> };

// Child actions are pure, no presentation wrapper
type ChildAction =
  | { type: 'saveButtonTapped' }
  | { type: 'cancelButtonTapped' };
```

### State Type Definitions

```typescript
// Parent state with optional child
interface ParentState {
  destination: ChildState | null;
}

// Or with enum destinations
interface ParentState {
  destination: Destination | null;
}

type Destination =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState };
```

### Store Typing

```typescript
import type { Store } from '@composable-svelte/core';

// Fully typed store
const store: Store<AppState, AppAction> = createStore({
  initialState,
  reducer: appReducer,
  dependencies: appDependencies
});

// Scoped store is also fully typed
const childStore = scopeToDestination(store, 'destination', 'addItem');
// Type: Store<AddItemState, AddItemAction> | null
```

---

## Examples

### Complete Flow Example

See `examples/product-gallery/` for a comprehensive example demonstrating:

- ✅ All 8 navigation components in real use
- ✅ Nested navigation (3 levels deep)
- ✅ Parent observation pattern throughout
- ✅ 39 tests with 100% pass rate
- ✅ Full TypeScript type safety
- ✅ Comprehensive architecture guide

**Key Files**:
- `examples/product-gallery/README.md` - Architecture guide
- `examples/product-gallery/src/app/app.reducer.ts` - Root navigation
- `examples/product-gallery/src/features/product-detail/` - Nested navigation
- `examples/product-gallery/tests/app.browser.test.ts` - Integration tests

### Quick Start

```bash
# Install
pnpm add @composable-svelte/core

# Run example
cd examples/product-gallery
pnpm install
pnpm dev
```

---

## Additional Resources

- **Navigation Spec**: `/specs/frontend/navigation-spec.md` - Detailed specification
- **Best Practices**: `/docs/navigation-best-practices.md` - Common patterns and pitfalls
- **Product Gallery**: `/examples/product-gallery/README.md` - Complete example
- **Core Spec**: `/specs/frontend/composable-svelte-spec.md` - Core architecture

---

## Getting Help

**Found a bug?** Open an issue at https://github.com/jonathanbelolo/composable-svelte/issues

**Have questions?** Check the examples and specs first, then open a discussion.

---

**Happy navigating!** 🚀
