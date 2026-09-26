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
- ✅ **Accessible foundations** - keyboard, focus-boundary, focus-restoration, and dismissal primitives for accessible navigation
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

The parent observes presented child actions that carry business results. Managed
composition routes those actions through the child reducer and owns the separate
presentation dismissal action.

```typescript
const rootReducer: Reducer<AppState, AppAction, AppDeps> = (state, action) => {
  if (action.type === 'destination' &&
      action.action.type === 'presented' &&
      action.action.action.type === 'saved') {
    return [
      { ...state, destination: null, saved: action.action.action.value },
      Effect.none()
    ];
  }
  return [state, Effect.none()];
};
```

Do not replace an observable save/cancel result with `deps.dismiss()`: dismissal carries
no business payload. For a close button whose only meaning is close, inject
`managedDismissDependency()` into the child and return its `dismiss()` effect.

---

## Tree-Based Navigation

Use managed composition for every presentation rendered by `Modal`, `Alert`, `Sheet`,
`Drawer`, `Popover`, or `Sidebar`. The slot owns lifetime and dismissal; the root
reducer owns business events such as opening or replacing a destination.

```typescript
import { Effect, createDestination, type PresentationAction, type Reducer } from '@composable-svelte/core';
import { destinationSlot, ManagedIntegrationBuilder } from '@composable-svelte/core/application';

const destination = createDestination({
  addToCart: addToCartReducer,
  share: shareReducer
});

type DestinationState = typeof destination._types.State;
type DestinationAction = typeof destination._types.Action;

interface AppState { destination: DestinationState | null }
type AppAction =
  | { type: 'openAddToCart' }
  | { type: 'destination'; action: PresentationAction<DestinationAction> };

const reducer: Reducer<AppState, AppAction, AppDeps> = (state, action) => {
  if (action.type === 'openAddToCart') {
    return [{ destination: destination.initial('addToCart', initialAddToCart) }, Effect.none()];
  }
  // The managed slot handles PresentationAction.dismiss. Observe presented child
  // actions here when the parent must save data or start parent-owned work.
  return [state, Effect.none()];
};

const slot = destinationSlot<AppState, AppAction>()('destination', destination);
export const composition = new ManagedIntegrationBuilder(reducer)
  .with(slot, { replaceOn: action => action.type === 'openAddToCart' })
  .build();
```

Declare each destination case once. `FeatureViews` supplies framework-minted views;
components never mint, copy, or cast dismissal capability.

Register the snippet as the `content` for the `addToCart` case in the application’s
`defineViews` plan:

```svelte
<script lang="ts">
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { Sheet } from '@composable-svelte/core/navigation-components';
</script>

{#snippet addToCartView({ store, surface }: PresentationFeatureViewProps<AddToCartState, AddToCartAction>)}
  <Sheet {store} ariaLabel="Add to cart">
    <form use:surface>
      {#if store.state}
        <AddToCartContent state={store.state} onAction={action => store.dispatch(action)} />
      {/if}
      <button type="button" onclick={() => store.dismiss()}>Cancel</button>
    </form>
  </Sheet>
{/snippet}
```

Legacy `scopeToDestination`, `scopeToOptional`, and fluent `scopeTo` remain useful for
state reads and action dispatch outside presentation rendering. Their stores do not
carry dismissal authority and must not be passed to dismissing components.

`ifLetPresentation` remains supported at a reducer-only legacy boundary. Such a
boundary handles `PresentationAction.dismiss` itself because no managed slot owns it.
Do not duplicate that manual branch after adopting `ManagedIntegrationBuilder`.

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
      // (state, action, deps, screenReducer, getStack, setStack, options?) — the
  // deps come before the reducer, the next two say how the stack is read from
  // and written back into the parent state, and the optional last one names
  // the parent action type (default 'stack') and a screen identity so a late
  // effect result for a screen that left is dropped — and the screen's
  // effects are cancelled when it leaves (pop, popToRoot, a shrinking
  // setPath, a screen dismiss).
  return handleStackAction(
        state,
        action,
        deps,
        screenReducer,
        (s) => s.stack,
        (s, stack) => ({ ...s, stack })
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

{#if store.state}
  <NavigationStack {store} stack={store.state.stack} onBack={() => store.dispatch({ type: 'popped' })}>
    {#snippet children({ currentScreen })}
      {@const screen = currentScreen as WizardScreen | undefined}
      {#if screen?.type === 'step1'}
        <Step1Screen state={screen.data} store={store} />
      {:else if screen?.type === 'step2'}
        <Step2Screen state={screen.data} store={store} />
      {:else if screen?.type === 'step3'}
        <Step3Screen state={screen.data} store={store} />
      {/if}
    {/snippet}
  </NavigationStack>
{/if}
```

---

## Navigation Components

The six dismissing families require a framework-minted `PresentationView` from a
managed optional slot or destination case. In a `defineViews` content snippet, pass
the supplied `store` directly and attach `surface` to the presentation boundary.

```svelte
<script lang="ts">
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { Modal } from '@composable-svelte/core/navigation-components';
</script>

{#snippet modalView({ store, surface }: PresentationFeatureViewProps<State, Action>)}
  <Modal {store} ariaLabel="Details">
    <section use:surface>...</section>
  </Modal>
{/snippet}
```

```svelte
<script lang="ts">
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { Alert } from '@composable-svelte/core/navigation-components';
</script>

{#snippet alertView({ store, surface }: PresentationFeatureViewProps<State, Action>)}
  <Alert {store} ariaLabel="Confirm">
    <section use:surface>...</section>
  </Alert>
{/snippet}
```

```svelte
<script lang="ts">
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { Sheet } from '@composable-svelte/core/navigation-components';
</script>

{#snippet sheetView({ store, surface }: PresentationFeatureViewProps<State, Action>)}
  <Sheet {store} side="bottom">
    <section use:surface>...</section>
  </Sheet>
{/snippet}
```

```svelte
<script lang="ts">
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { Drawer } from '@composable-svelte/core/navigation-components';
</script>

{#snippet drawerView({ store, surface }: PresentationFeatureViewProps<State, Action>)}
  <Drawer {store} side="right">
    <section use:surface>...</section>
  </Drawer>
{/snippet}
```

```svelte
<script lang="ts">
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { Popover } from '@composable-svelte/core/navigation-components';
</script>

{#snippet popoverView({ store, surface }: PresentationFeatureViewProps<State, Action>)}
  <Popover {store} style="top: 100%; left: 0">
    <section use:surface>...</section>
  </Popover>
{/snippet}
```

```svelte
<script lang="ts">
  import type { PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { Sidebar } from '@composable-svelte/core/navigation-components';
</script>

{#snippet sidebarView({ store, surface }: PresentationFeatureViewProps<State, Action>)}
  <Sidebar {store} side="left" width="240px">
    <nav use:surface>...</nav>
  </Sidebar>
{/snippet}
```

- Modal, Alert, Sheet, and Drawer are modal focus boundaries and render a backdrop.
- Popover has no backdrop and is non-modal, while still owning Escape and outside-pointer dismissal.
- Sidebar is a dismissing managed presentation; it is not the old boolean-expanded widget.
- Each family also has a `*Primitive` form with the same managed-view authority boundary.

`Tabs`, `NavigationStack`, and `AnimatedNavigationStack` are non-dismissing families.
They consume a `ChildView`; they do not expose `dismiss()`.

```svelte
<script lang="ts">
  import { NavigationStack } from '@composable-svelte/core/navigation-components';
</script>

{#if store.state}
  <NavigationStack {store} stack={store.state.stack} onBack={() => store.dispatch({ type: 'popped' })}>
    {#snippet children({ currentScreen })}
      {@const screen = currentScreen as Screen | undefined}
      {#if screen?.type === 'step1'}
        <Step1 {store} />
      {/if}
    {/snippet}
  </NavigationStack>
{/if}
```

---

## Best Practices

### Parent observation and child dismissal

Use ordinary presented child actions when the parent must save data, navigate, or
start parent-owned work. A close/cancel action may return `deps.dismiss()` when the
dependency was created with `managedDismissDependency()` and the child does not need
to send business data to its parent.

```typescript
case 'saveButtonTapped':
  return [state, Effect.run(dispatch => dispatch({ type: 'saved', value: state.value }))];

case 'cancelButtonTapped':
  return [state, deps.dismiss()];
```

`deps.dismiss()` is an effect. Return or batch it. It is accepted only while executing
through the framework lift for the exact live managed presentation; a stale, copied,
or raw dispatch cannot mint dismissal authority.

### Rendering optional state

Render through the declared application view. `FeatureOutlet` renders nothing when
the managed slot has no live view. Inside a presentation snippet, `store.state` can
become `undefined` when the owner retires, so guard reads that require live state.

```svelte
<FeatureViews store={app.store} definition={viewPlan}>
  {#snippet children(views)}
    <FeatureOutlet view={views.destination} />
  {/snippet}
</FeatureViews>
```

### Replacement identity

Use a slot policy's `replaceOn` for a business action that replaces a non-null child
with a new owner. Ordinary child updates retain the owner. Do not infer replacement
from object inequality and do not reuse a captured view after its owner retires.

### Focus and dismissal

The components coordinate initial focus, containment, Escape, outside pointer,
return focus, portals, and document adoption. Supply actual content boundaries with
the snippet's `surface` action. Do not add application timers, document listeners, or
deep-active-element fallbacks to duplicate that coordinator.

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

### View and Store Typing

An application instance exposes an `ApplicationStore<State, Action>` managed projection.
The broader `Store<State, Action>` remains the type for a legacy store created directly with
`createStore`; it is not the type of `app.store`. Managed render declarations receive either
`FeatureViewProps` or `PresentationFeatureViewProps`; dismissing families require the latter's
nominal `PresentationView`.

```typescript
import type {
  ApplicationStore,
  PresentationFeatureViewProps,
  FeatureViewProps
} from '@composable-svelte/core/application';

const root: ApplicationStore<AppState, AppAction> = app.store;
type DialogProps = PresentationFeatureViewProps<DialogState, DialogAction>;
type StackProps = FeatureViewProps<WizardState, WizardAction>;
```

Legacy scopes return read/dispatch stores. They remain valid for non-presentation code,
but they are deliberately not assignable to a dismissing component's `store` prop.

---

## Examples

### Complete Flow Example

See `examples/product-gallery/` for a larger application example. When reading older
example code, keep the authority boundary from this guide: dismissing components take
managed presentation views, while legacy scopes remain read/dispatch-only.

**Key Files**:
- `examples/product-gallery/README.md` - Architecture guide
- `examples/product-gallery/src/app/app.reducer.ts` - Root navigation
- `examples/product-gallery/src/features/product-detail/` - Nested navigation
- `examples/product-gallery/tests/app.browser.test.ts` - Integration tests

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
