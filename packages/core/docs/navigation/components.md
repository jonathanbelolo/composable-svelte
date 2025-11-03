# Navigation Components

State-driven UI components for rendering navigation destinations in Composable Svelte.

## Table of Contents

1. [Overview](#overview)
2. [Component Catalog](#component-catalog)
3. [Modal](#modal)
4. [Sheet](#sheet)
5. [Drawer](#drawer)
6. [Alert](#alert)
7. [Sidebar](#sidebar)
8. [NavigationStack](#navigationstack)
9. [Popover](#popover)
10. [DestinationRouter](#destinationrouter)
11. [Animation Integration](#animation-integration)
12. [Styling and Customization](#styling-and-customization)
13. [Accessibility](#accessibility)
14. [Best Practices](#best-practices)

## Overview

Navigation components render UI based on your application's navigation state. They're **state-driven**: when a destination field is non-null, the component renders; when null, it dismisses.

### Key Principles

1. **State-Driven**: Components render based on state, not imperative commands
2. **Scoped Stores**: Each component receives a scoped store focused on its destination
3. **Animation Lifecycle**: Optional PresentationState for animated transitions
4. **Dismissal Integration**: Built-in click-outside, Escape key, and programmatic dismissal
5. **Accessibility First**: ARIA attributes, focus management, keyboard navigation

### Component Architecture

```
Styled Component (Modal.svelte)
  ├─ Default styling (Tailwind CSS classes)
  ├─ Prop forwarding to primitive
  └─ Wraps Primitive Component
      └─ ModalPrimitive.svelte
          ├─ Core presentation logic
          ├─ Animation integration
          ├─ Event handling (click-outside, keyboard)
          ├─ Focus management
          └─ Portal rendering
```

Each component has two layers:
- **Styled Component**: Pre-styled with sensible defaults, customizable via props
- **Primitive Component**: Unstyled core logic, accessible via `unstyled={true}`

## Component Catalog

| Component | Use Case | Presentation Style | Dismissible |
|-----------|----------|-------------------|-------------|
| **Modal** | Critical actions, forms | Centered overlay with backdrop | Yes |
| **Sheet** | Filters, settings, forms | Bottom/side slide-in panel | Yes |
| **Drawer** | Navigation menus, sidebars | Side panel that pushes content | Yes |
| **Alert** | Confirmations, warnings | Centered dialog (smaller) | Optional |
| **Sidebar** | Persistent navigation | Inline side panel (layout) | Yes |
| **NavigationStack** | Multi-step flows, wizards | Stacked screens with back button | Yes (via back) |
| **Popover** | Tooltips, dropdowns, menus | Positioned near trigger | Yes |
| **DestinationRouter** | Declarative routing | Renders child components | N/A (router) |

## Modal

Centered dialog overlay for critical interactions. Prevents interaction with background content.

### Basic Usage

```svelte
<script lang="ts">
  import { Modal } from '@composable-svelte/core';
  import { scopeToDestination } from '@composable-svelte/core/navigation';

  const { store } = $props();

  // Scope to optional destination
  const addItemStore = scopeToDestination(
    store,
    ['destination'],
    'addItem',
    'destination'
  );
</script>

<Modal store={addItemStore}>
  {#snippet children({ store })}
    <h2>Add Item</h2>
    <form>
      <input
        type="text"
        value={store.state.name}
        oninput={(e) => store.dispatch({
          type: 'nameChanged',
          name: e.currentTarget.value
        })}
      />
      <button onclick={() => store.dispatch({ type: 'saveButtonTapped' })}>
        Save
      </button>
      <button onclick={() => store.dismiss()}>
        Cancel
      </button>
    </form>
  {/snippet}
</Modal>
```

### Props

```typescript
interface ModalProps<State, Action> {
  // Required: Scoped store (null = hidden)
  store: ScopedDestinationStore<State, Action> | null;

  // Optional: Animation lifecycle tracking
  presentation?: PresentationState<any>;

  // Animation callbacks
  onPresentationComplete?: () => void;
  onDismissalComplete?: () => void;

  // Spring physics override
  springConfig?: Partial<SpringConfig>;

  // Styling
  unstyled?: boolean;              // Disable all default styles
  backdropClass?: string;          // Custom backdrop classes
  class?: string;                  // Custom content classes

  // Behavior
  disableClickOutside?: boolean;   // Prevent backdrop click dismiss
  disableEscapeKey?: boolean;      // Prevent Escape key dismiss
}
```

### With Animation Lifecycle

```typescript
interface FeatureState {
  destination: AddItemState | null;
  presentation: PresentationState<AddItemState>;
}

case 'addButtonTapped':
  return [
    {
      ...state,
      destination: { name: '', quantity: 0 },
      presentation: {
        status: 'presenting',
        content: { name: '', quantity: 0 },
        duration: 300
      }
    },
    Effect.animated({
      duration: 300,
      onComplete: { type: 'presentation', event: { type: 'presentationCompleted' } }
    })
  ];
```

```svelte
<Modal
  store={addItemStore}
  presentation={store.state.presentation}
  onPresentationComplete={() => store.dispatch({
    type: 'presentation',
    event: { type: 'presentationCompleted' }
  })}
  onDismissalComplete={() => store.dispatch({
    type: 'presentation',
    event: { type: 'dismissalCompleted' }
  })}
>
  <!-- Content -->
</Modal>
```

### Styling

```svelte
<!-- Default styling -->
<Modal store={addItemStore}>
  {#snippet children({ store })}
    <div class="space-y-4">
      <h2 class="text-lg font-semibold">Title</h2>
      <p class="text-sm text-muted-foreground">Description</p>
    </div>
  {/snippet}
</Modal>

<!-- Custom backdrop and content -->
<Modal
  store={addItemStore}
  backdropClass="bg-black/50"
  class="max-w-2xl p-8 rounded-xl"
>
  <!-- Content -->
</Modal>

<!-- Completely unstyled -->
<Modal store={addItemStore} unstyled={true}>
  {#snippet children({ store })}
    <div style="your custom styles">
      <!-- Content -->
    </div>
  {/snippet}
</Modal>
```

### Accessibility

- `role="dialog"` with `aria-modal="true"`
- Focus trap: focus stays within modal
- Focus restoration: returns to trigger element on dismiss
- Keyboard navigation: Tab/Shift+Tab cycle through focusable elements
- Escape key: dismisses modal (unless disabled)
- Body scroll lock: prevents background scrolling

### Best Practices

```svelte
<!-- ✅ GOOD: Descriptive title for screen readers -->
<Modal store={addItemStore}>
  {#snippet children({ store })}
    <h2 id="modal-title">Add New Item</h2>
    <div aria-describedby="modal-title">
      <!-- Content -->
    </div>
  {/snippet}
</Modal>

<!-- ✅ GOOD: Clear actions -->
<Modal store={confirmStore}>
  {#snippet children({ store })}
    <h2>Delete Item?</h2>
    <p>This action cannot be undone.</p>
    <div class="flex gap-2">
      <button onclick={() => store.dispatch({ type: 'confirmed' })}>
        Delete
      </button>
      <button onclick={() => store.dismiss()}>
        Cancel
      </button>
    </div>
  {/snippet}
</Modal>

<!-- ❌ BAD: No way to dismiss -->
<Modal store={addItemStore} disableClickOutside disableEscapeKey>
  {#snippet children({ store })}
    <h2>Add Item</h2>
    <!-- No cancel button! User is trapped -->
  {/snippet}
</Modal>
```

## Sheet

Bottom or side slide-in panel for secondary actions. Less intrusive than Modal.

### Basic Usage

```svelte
<script lang="ts">
  import { Sheet } from '@composable-svelte/core';
  import { scopeToDestination } from '@composable-svelte/core/navigation';

  const { store } = $props();

  const filterStore = scopeToDestination(
    store,
    ['destination'],
    'filter',
    'destination'
  );
</script>

<Sheet store={filterStore} side="bottom" height="60vh">
  {#snippet children({ store })}
    <h2>Filter Items</h2>
    <div class="space-y-4">
      <!-- Filter controls -->
    </div>
  {/snippet}
</Sheet>
```

### Props

```typescript
interface SheetProps<State, Action> {
  store: ScopedDestinationStore<State, Action> | null;
  presentation?: PresentationState<any>;
  onPresentationComplete?: () => void;
  onDismissalComplete?: () => void;
  springConfig?: Partial<SpringConfig>;

  // Styling
  unstyled?: boolean;
  backdropClass?: string;
  class?: string;

  // Behavior
  disableClickOutside?: boolean;
  disableEscapeKey?: boolean;

  // Sheet-specific
  side?: 'bottom' | 'left' | 'right';  // Default: 'bottom'
  height?: string;                      // Default: '60vh' (bottom only)
}
```

### Side Variants

```svelte
<!-- Bottom sheet (mobile-friendly) -->
<Sheet store={filterStore} side="bottom" height="60vh">
  {#snippet children({ store })}
    <!-- Content slides up from bottom -->
  {/snippet}
</Sheet>

<!-- Left sheet -->
<Sheet store={menuStore} side="left">
  {#snippet children({ store })}
    <!-- Content slides in from left -->
  {/snippet}
</Sheet>

<!-- Right sheet -->
<Sheet store={detailsStore} side="right">
  {#snippet children({ store })}
    <!-- Content slides in from right -->
  {/snippet}
</Sheet>
```

### Use Cases

```svelte
<!-- Filters and search -->
<Sheet store={filterStore} side="bottom">
  {#snippet children({ store })}
    <h2>Filter Options</h2>
    <label>
      <input type="checkbox" bind:checked={store.state.inStock} />
      In Stock Only
    </label>
    <label>
      Category:
      <select bind:value={store.state.category}>
        <option>All</option>
        <option>Electronics</option>
        <option>Clothing</option>
      </select>
    </label>
    <button onclick={() => store.dispatch({ type: 'applyFilters' })}>
      Apply
    </button>
  {/snippet}
</Sheet>

<!-- Mobile navigation menu -->
<Sheet store={menuStore} side="left">
  {#snippet children({ store })}
    <nav>
      <a href="/home">Home</a>
      <a href="/products">Products</a>
      <a href="/about">About</a>
    </nav>
  {/snippet}
</Sheet>

<!-- Detail panel -->
<Sheet store={detailStore} side="right">
  {#snippet children({ store })}
    <h2>{store.state.item.name}</h2>
    <p>{store.state.item.description}</p>
    <button onclick={() => store.dispatch({ type: 'addToCart' })}>
      Add to Cart
    </button>
  {/snippet}
</Sheet>
```

### Accessibility

- `role="dialog"` with `aria-modal="true"`
- `aria-label="Bottom sheet"` (or "Side sheet")
- Focus trap active
- Escape key dismisses
- Click outside dismisses (unless disabled)

## Drawer

Side panel that slides in and pushes content. For persistent navigation.

### Basic Usage

```svelte
<script lang="ts">
  import { Drawer } from '@composable-svelte/core';
  import { scopeToDestination } from '@composable-svelte/core/navigation';

  const { store } = $props();

  const menuStore = scopeToDestination(
    store,
    ['destination'],
    'menu',
    'destination'
  );
</script>

<Drawer store={menuStore} side="left" width="280px">
  {#snippet children({ store })}
    <nav>
      <a href="/dashboard">Dashboard</a>
      <a href="/products">Products</a>
      <a href="/customers">Customers</a>
      <a href="/settings">Settings</a>
    </nav>
  {/snippet}
</Drawer>
```

### Props

```typescript
interface DrawerProps<State, Action> {
  store: ScopedDestinationStore<State, Action> | null;
  presentation?: PresentationState<any>;
  onPresentationComplete?: () => void;
  onDismissalComplete?: () => void;
  springConfig?: Partial<SpringConfig>;

  // Styling
  unstyled?: boolean;
  backdropClass?: string;
  class?: string;

  // Behavior
  disableClickOutside?: boolean;
  disableEscapeKey?: boolean;

  // Drawer-specific
  side?: 'left' | 'right';  // Default: 'left'
  width?: string;           // Default: '320px'
}
```

### Modal vs Sheet vs Drawer

```typescript
// Modal: Blocks interaction, centered, critical
<Modal store={deleteConfirmStore}>
  <h2>Delete permanently?</h2>
  <button onclick={() => store.dispatch({ type: 'confirmed' })}>Delete</button>
</Modal>

// Sheet: Partial overlay, bottom/side, secondary
<Sheet store={filterStore} side="bottom">
  <h2>Filter Options</h2>
  <!-- Filter controls -->
</Sheet>

// Drawer: Pushes content, persistent, navigation
<Drawer store={menuStore} side="left">
  <nav>
    <a href="/home">Home</a>
    <a href="/settings">Settings</a>
  </nav>
</Drawer>
```

## Alert

Non-dismissible dialog for critical confirmations. User must choose an action.

### Basic Usage

```svelte
<script lang="ts">
  import { Alert } from '@composable-svelte/core';
  import { scopeToDestination } from '@composable-svelte/core/navigation';

  const { store } = $props();

  const confirmStore = scopeToDestination(
    store,
    ['destination'],
    'confirm',
    'destination'
  );
</script>

<Alert
  store={confirmStore}
  disableClickOutside={true}
  disableEscapeKey={true}
>
  {#snippet children({ store })}
    <h2>Confirm Action</h2>
    <p>Are you sure you want to delete this item?</p>
    <div class="flex gap-2">
      <button onclick={() => store.dispatch({ type: 'confirmed' })}>
        Delete
      </button>
      <button onclick={() => store.dismiss()}>
        Cancel
      </button>
    </div>
  {/snippet}
</Alert>
```

### Props

```typescript
interface AlertProps<State, Action> {
  store: ScopedDestinationStore<State, Action> | null;
  presentation?: PresentationState<any>;
  onPresentationComplete?: () => void;
  onDismissalComplete?: () => void;
  springConfig?: Partial<SpringConfig>;

  // Styling
  unstyled?: boolean;
  backdropClass?: string;
  class?: string;

  // Behavior (typically both disabled for alerts)
  disableClickOutside?: boolean;
  disableEscapeKey?: boolean;
}
```

### Alert vs Modal

```svelte
<!-- Alert: Forces decision, no dismissal -->
<Alert
  store={confirmStore}
  disableClickOutside={true}
  disableEscapeKey={true}
>
  {#snippet children({ store })}
    <h2>Delete Item?</h2>
    <p>This cannot be undone.</p>
    <button onclick={() => store.dispatch({ type: 'confirmed' })}>
      Delete
    </button>
    <button onclick={() => store.dismiss()}>
      Cancel
    </button>
  {/snippet}
</Alert>

<!-- Modal: Can dismiss without action -->
<Modal store={addItemStore}>
  {#snippet children({ store })}
    <h2>Add Item</h2>
    <!-- Click backdrop or press Escape to dismiss -->
  {/snippet}
</Modal>
```

### Accessibility

- `role="alertdialog"` with `aria-modal="true"`
- More assertive than `role="dialog"`
- Screen readers announce immediately
- Keyboard focus trapped
- Must provide clear actions

## Sidebar

Inline navigation panel that's part of page layout (not overlay).

### Basic Usage

```svelte
<script lang="ts">
  import { Sidebar } from '@composable-svelte/core';
  import { scopeToDestination } from '@composable-svelte/core/navigation';

  const { store } = $props();

  const sidebarStore = scopeToDestination(
    store,
    ['destination'],
    'sidebar',
    'destination'
  );
</script>

<div class="flex h-screen">
  <Sidebar store={sidebarStore} side="left" width="240px">
    {#snippet children({ store })}
      <nav class="p-4">
        <a href="/dashboard">Dashboard</a>
        <a href="/products">Products</a>
        <a href="/customers">Customers</a>
      </nav>
    {/snippet}
  </Sidebar>

  <main class="flex-1">
    <!-- Main content -->
  </main>
</div>
```

### Props

```typescript
interface SidebarProps<State, Action> {
  store: ScopedDestinationStore<State, Action> | null;
  presentation?: PresentationState<any>;
  onPresentationComplete?: () => void;
  onDismissalComplete?: () => void;
  springConfig?: Partial<SpringConfig>;

  // Styling
  unstyled?: boolean;
  class?: string;

  // Behavior
  disableEscapeKey?: boolean;  // No click-outside (inline component)

  // Sidebar-specific
  side?: 'left' | 'right';  // Default: 'left'
  width?: string;           // Default: '240px'
}
```

### Sidebar vs Drawer

```svelte
<!-- Sidebar: Inline, part of layout, animates width -->
<div class="flex">
  <Sidebar store={sidebarStore} width="240px">
    <!-- Navigation -->
  </Sidebar>
  <main class="flex-1">
    <!-- Content shifts when sidebar opens -->
  </main>
</div>

<!-- Drawer: Overlay, fixed position, with backdrop -->
<Drawer store={menuStore} width="280px">
  <!-- Navigation -->
</Drawer>
<main>
  <!-- Content stays in place, drawer overlays -->
</main>
```

### Responsive Sidebar

```svelte
<script lang="ts">
  // Mobile: Use Drawer (overlay)
  // Desktop: Use Sidebar (inline)

  import { Sidebar, Drawer } from '@composable-svelte/core';
  import { mediaQuery } from '$lib/utils';

  const isMobile = mediaQuery('(max-width: 768px)');
</script>

{#if isMobile}
  <Drawer store={menuStore}>
    <nav><!-- Menu items --></nav>
  </Drawer>
{:else}
  <Sidebar store={menuStore}>
    <nav><!-- Menu items --></nav>
  </Sidebar>
{/if}
```

## NavigationStack

Multi-screen linear flow with back navigation. For wizards, drill-down navigation.

### Basic Usage

```svelte
<script lang="ts">
  import { NavigationStack } from '@composable-svelte/core';
  import { scopeToDestination } from '@composable-svelte/core/navigation';

  const { store } = $props();

  const wizardStore = scopeToDestination(
    store,
    ['destination'],
    'wizard',
    'destination'
  );
</script>

<NavigationStack
  store={wizardStore}
  stack={wizardStore?.state?.stack ?? []}
  onBack={() => store.dispatch({ type: 'backButtonTapped' })}
>
  {#snippet children({ store, currentScreen, canGoBack })}
    {#if currentScreen.step === 1}
      <Step1 {store} />
    {:else if currentScreen.step === 2}
      <Step2 {store} />
    {:else if currentScreen.step === 3}
      <Step3 {store} />
    {/if}
  {/snippet}
</NavigationStack>
```

### Props

```typescript
interface NavigationStackProps<State, Action> {
  store: ScopedDestinationStore<State, Action> | null;
  stack: readonly State[];  // Array of screen states

  // Callbacks
  onBack?: () => void;

  // Styling
  unstyled?: boolean;
  class?: string;
  headerClass?: string;
  contentClass?: string;

  // Behavior
  showBackButton?: boolean;  // Default: true
}
```

### State Pattern

```typescript
interface WizardState {
  stack: readonly StepState[];
}

interface StepState {
  step: number;
  data: {
    name?: string;
    email?: string;
    preferences?: Preferences;
  };
}

type WizardAction =
  | { type: 'nextButtonTapped' }
  | { type: 'backButtonTapped' }
  | { type: 'stack'; action: StackAction<StepAction> };
```

### Reducer Integration

```typescript
import { push, pop, popToRoot } from '@composable-svelte/core/navigation';

const wizardReducer: Reducer<WizardState, WizardAction, WizardDeps> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'nextButtonTapped': {
      const currentStep = state.stack[state.stack.length - 1];
      const nextStep = {
        step: currentStep.step + 1,
        data: {}
      };
      const [newStack] = push(state.stack, nextStep);
      return [{ ...state, stack: newStack }, Effect.none()];
    }

    case 'backButtonTapped': {
      const [newStack] = pop(state.stack);
      return [{ ...state, stack: newStack }, Effect.none()];
    }

    case 'finishButtonTapped': {
      const [newStack] = popToRoot(state.stack);
      return [{ ...state, stack: newStack }, Effect.none()];
    }
  }
};
```

### Multi-Step Wizard

```svelte
<NavigationStack store={wizardStore} stack={wizardStore?.state?.stack ?? []}>
  {#snippet children({ store, currentScreen, canGoBack })}
    <div class="space-y-6">
      <!-- Step indicator -->
      <div class="flex justify-center gap-2">
        {#each { length: 3 } as _, i}
          <div
            class="h-2 w-12 rounded"
            class:bg-primary={i < currentScreen.step}
            class:bg-muted={i >= currentScreen.step}
          />
        {/each}
      </div>

      <!-- Step content -->
      {#if currentScreen.step === 1}
        <div>
          <h2>Step 1: Basic Info</h2>
          <input
            type="text"
            placeholder="Name"
            value={store.state.data.name ?? ''}
            oninput={(e) => store.dispatch({
              type: 'dataChanged',
              field: 'name',
              value: e.currentTarget.value
            })}
          />
        </div>
      {:else if currentScreen.step === 2}
        <div>
          <h2>Step 2: Contact</h2>
          <input
            type="email"
            placeholder="Email"
            value={store.state.data.email ?? ''}
            oninput={(e) => store.dispatch({
              type: 'dataChanged',
              field: 'email',
              value: e.currentTarget.value
            })}
          />
        </div>
      {:else if currentScreen.step === 3}
        <div>
          <h2>Step 3: Preferences</h2>
          <!-- Preference controls -->
        </div>
      {/if}

      <!-- Navigation buttons -->
      <div class="flex justify-between">
        {#if canGoBack}
          <button onclick={() => store.dispatch({ type: 'backButtonTapped' })}>
            Back
          </button>
        {/if}

        {#if currentScreen.step < 3}
          <button onclick={() => store.dispatch({ type: 'nextButtonTapped' })}>
            Next
          </button>
        {:else}
          <button onclick={() => store.dispatch({ type: 'finishButtonTapped' })}>
            Finish
          </button>
        {/if}
      </div>
    </div>
  {/snippet}
</NavigationStack>
```

## Popover

Positioned overlay for tooltips, dropdowns, and context menus.

### Basic Usage

```svelte
<script lang="ts">
  import { Popover } from '@composable-svelte/core';
  import { scopeToDestination } from '@composable-svelte/core/navigation';

  const { store } = $props();
  let buttonElement: HTMLElement;

  const menuStore = scopeToDestination(
    store,
    ['destination'],
    'menu',
    'destination'
  );

  // Calculate position relative to trigger
  const popoverStyle = $derived(() => {
    if (!buttonElement) return '';
    const rect = buttonElement.getBoundingClientRect();
    return `top: ${rect.bottom + 8}px; left: ${rect.left}px;`;
  });
</script>

<button
  bind:this={buttonElement}
  onclick={() => store.dispatch({ type: 'menuButtonTapped' })}
>
  Open Menu
</button>

<Popover store={menuStore} style={popoverStyle()}>
  {#snippet children({ store })}
    <div class="min-w-[200px]">
      <button onclick={() => store.dispatch({ type: 'editSelected' })}>
        Edit
      </button>
      <button onclick={() => store.dispatch({ type: 'deleteSelected' })}>
        Delete
      </button>
      <button onclick={() => store.dispatch({ type: 'shareSelected' })}>
        Share
      </button>
    </div>
  {/snippet}
</Popover>
```

### Props

```typescript
interface PopoverProps<State, Action> {
  store: ScopedDestinationStore<State, Action> | null;
  presentation?: PresentationState<any>;
  onPresentationComplete?: () => void;
  onDismissalComplete?: () => void;
  springConfig?: Partial<SpringConfig>;

  // Styling
  unstyled?: boolean;
  class?: string;
  style?: string;  // Custom positioning (required!)

  // Behavior
  disableClickOutside?: boolean;
  disableEscapeKey?: boolean;
}
```

### Positioning Strategies

```svelte
<script lang="ts">
  // Manual positioning
  let triggerElement: HTMLElement;

  function calculatePosition() {
    if (!triggerElement) return '';
    const rect = triggerElement.getBoundingClientRect();

    // Below trigger
    return `top: ${rect.bottom + 8}px; left: ${rect.left}px;`;

    // Above trigger
    // return `bottom: ${window.innerHeight - rect.top + 8}px; left: ${rect.left}px;`;

    // Right of trigger
    // return `top: ${rect.top}px; left: ${rect.right + 8}px;`;
  }
</script>

<button bind:this={triggerElement}>Open</button>
<Popover store={menuStore} style={calculatePosition()}>
  <!-- Content -->
</Popover>
```

### Dropdown Menu

```svelte
<Popover store={menuStore} style={popoverStyle()}>
  {#snippet children({ store })}
    <nav class="py-1">
      <button
        class="w-full px-4 py-2 text-left hover:bg-accent"
        onclick={() => {
          store.dispatch({ type: 'action1Selected' });
          store.dismiss();
        }}
      >
        Action 1
      </button>
      <button
        class="w-full px-4 py-2 text-left hover:bg-accent"
        onclick={() => {
          store.dispatch({ type: 'action2Selected' });
          store.dismiss();
        }}
      >
        Action 2
      </button>
      <div class="border-t my-1"></div>
      <button
        class="w-full px-4 py-2 text-left text-destructive hover:bg-accent"
        onclick={() => {
          store.dispatch({ type: 'deleteSelected' });
          store.dismiss();
        }}
      >
        Delete
      </button>
    </nav>
  {/snippet}
</Popover>
```

## DestinationRouter

Declarative routing component that reduces navigation boilerplate by 70%.

### Basic Usage

```svelte
<script lang="ts">
  import { DestinationRouter } from '@composable-svelte/core';
  import AddItemModal from './AddItemModal.svelte';
  import EditItemModal from './EditItemModal.svelte';
  import FilterSheet from './FilterSheet.svelte';

  const { store } = $props();
</script>

<DestinationRouter
  {store}
  field="destination"
  routes={{
    addItem: {
      component: AddItemModal,
      presentation: 'modal'
    },
    editItem: {
      component: EditItemModal,
      presentation: 'modal'
    },
    filter: {
      component: FilterSheet,
      presentation: 'sheet',
      presentationProps: {
        side: 'bottom',
        height: '60vh'
      }
    }
  }}
/>
```

### Props

```typescript
interface DestinationRouterProps<State, Action> {
  store: Store<State, Action>;
  field: keyof State & string;  // Destination field name

  // Map of case types to route configs
  routes: Record<string, RouteConfig>;
}

interface RouteConfig {
  component: Component;              // Svelte component to render
  presentation: 'modal' | 'sheet' | 'drawer';

  // Optional: Props for presentation component
  presentationProps?: {
    side?: 'bottom' | 'left' | 'right';
    height?: string;
    width?: string;
    disableClickOutside?: boolean;
    // ... other presentation props
  };

  // Optional: Props for child component
  componentProps?: Record<string, any>;
}
```

### Before and After

```svelte
<!-- ❌ BEFORE: Manual scoping and routing (verbose) -->
<script lang="ts">
  import { Modal, Sheet, Drawer } from '@composable-svelte/core';
  import { scopeTo } from '@composable-svelte/core/navigation';

  const { store } = $props();

  const addItemStore = scopeTo(store).into('destination').case('addItem');
  const editItemStore = scopeTo(store).into('destination').case('editItem');
  const filterStore = scopeTo(store).into('destination').case('filter');
  const detailStore = scopeTo(store).into('destination').case('detail');
</script>

<Modal store={addItemStore}>
  {#snippet children({ store })}
    <AddItemModal {store} />
  {/snippet}
</Modal>

<Modal store={editItemStore}>
  {#snippet children({ store })}
    <EditItemModal {store} />
  {/snippet}
</Modal>

<Sheet store={filterStore} side="bottom">
  {#snippet children({ store })}
    <FilterSheet {store} />
  {/snippet}
</Sheet>

<Drawer store={detailStore} side="right">
  {#snippet children({ store })}
    <DetailView {store} />
  {/snippet}
</Drawer>

<!-- ✅ AFTER: Declarative routing (70% less code) -->
<DestinationRouter
  {store}
  field="destination"
  routes={{
    addItem: { component: AddItemModal, presentation: 'modal' },
    editItem: { component: EditItemModal, presentation: 'modal' },
    filter: {
      component: FilterSheet,
      presentation: 'sheet',
      presentationProps: { side: 'bottom' }
    },
    detail: {
      component: DetailView,
      presentation: 'drawer',
      presentationProps: { side: 'right' }
    }
  }}
/>
```

### Passing Props

```svelte
<DestinationRouter
  {store}
  field="destination"
  routes={{
    addItem: {
      component: AddItemModal,
      presentation: 'modal',
      // Props for Modal component
      presentationProps: {
        disableClickOutside: true,
        backdropClass: 'bg-black/70'
      },
      // Props for AddItemModal component
      componentProps: {
        theme: 'dark',
        showAdvancedOptions: true
      }
    }
  }}
/>
```

## Animation Integration

All navigation components support animation lifecycle via `PresentationState`.

### Animation States

```typescript
type PresentationState<T> =
  | { status: 'idle' }
  | { status: 'presenting'; content: T; duration?: number }
  | { status: 'presented'; content: T }
  | { status: 'dismissing'; content: T; duration?: number };
```

### Lifecycle Flow

```
User Action → Reducer Sets 'presenting'
    ↓
Component Animates In (300ms)
    ↓
Component Dispatches 'presentationCompleted'
    ↓
Reducer Sets 'presented'
    ↓
User Dismisses → Reducer Sets 'dismissing'
    ↓
Component Animates Out (200ms)
    ↓
Component Dispatches 'dismissalCompleted'
    ↓
Reducer Sets 'idle' + Clears Destination
```

### Reducer Setup

```typescript
interface FeatureState {
  destination: AddItemState | null;
  presentation: PresentationState<AddItemState>;
}

type FeatureAction =
  | { type: 'addButtonTapped' }
  | { type: 'closeButtonTapped' }
  | { type: 'presentation'; event: PresentationEvent }
  | { type: 'destination'; action: PresentationAction<AddItemAction> };

const reducer: Reducer<FeatureState, FeatureAction, FeatureDeps> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'addButtonTapped': {
      const content = { name: '', quantity: 0 };
      return [
        {
          ...state,
          destination: content,
          presentation: {
            status: 'presenting',
            content,
            duration: 300
          }
        },
        Effect.animated({
          duration: 300,
          onComplete: {
            type: 'presentation',
            event: { type: 'presentationCompleted' }
          }
        })
      ];
    }

    case 'closeButtonTapped': {
      // Guard: Only dismiss if presented
      if (state.presentation.status !== 'presented') {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          presentation: {
            status: 'dismissing',
            content: state.presentation.content,
            duration: 200
          }
        },
        Effect.animated({
          duration: 200,
          onComplete: {
            type: 'presentation',
            event: { type: 'dismissalCompleted' }
          }
        })
      ];
    }

    case 'presentation': {
      const { event } = action;

      // Presentation completed
      if (event.type === 'presentationCompleted') {
        if (state.presentation.status !== 'presenting') {
          return [state, Effect.none()];
        }

        return [
          {
            ...state,
            presentation: {
              status: 'presented',
              content: state.presentation.content
            }
          },
          Effect.none()
        ];
      }

      // Dismissal completed
      if (event.type === 'dismissalCompleted') {
        if (state.presentation.status !== 'dismissing') {
          return [state, Effect.none()];
        }

        return [
          {
            ...state,
            destination: null,
            presentation: { status: 'idle' }
          },
          Effect.none()
        ];
      }
    }
  }
};
```

### Component Integration

```svelte
<Modal
  store={addItemStore}
  presentation={store.state.presentation}
  onPresentationComplete={() => store.dispatch({
    type: 'presentation',
    event: { type: 'presentationCompleted' }
  })}
  onDismissalComplete={() => store.dispatch({
    type: 'presentation',
    event: { type: 'dismissalCompleted' }
  })}
>
  {#snippet children({ store })}
    <!-- Content -->
  {/snippet}
</Modal>
```

### Custom Spring Physics

```typescript
import type { SpringConfig } from '@composable-svelte/core/animation';

const customSpring: Partial<SpringConfig> = {
  stiffness: 400,
  damping: 30,
  mass: 1
};
```

```svelte
<Modal
  store={addItemStore}
  presentation={store.state.presentation}
  springConfig={customSpring}
>
  <!-- Content -->
</Modal>
```

## Styling and Customization

### Default Styling

All styled components use Tailwind CSS classes by default:

```typescript
// Modal
const defaultBackdropClasses = 'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm';
const defaultContentClasses = 'fixed left-[50%] top-[50%] z-[51] grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg sm:rounded-lg';

// Sheet
const defaultBackdropClasses = 'fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm';
const defaultContentClasses = 'fixed bottom-0 left-0 right-0 z-[61] border-t bg-background shadow-lg rounded-t-xl';
```

### Overriding Classes

```svelte
<!-- Extend default classes -->
<Modal
  backdropClass="bg-black/70"
  class="max-w-2xl p-8 rounded-2xl"
>
  <!-- Content -->
</Modal>

<!-- Replace entirely with unstyled -->
<Modal unstyled={true}>
  {#snippet children({ store })}
    <div class="my-custom-modal">
      <!-- Fully custom styling -->
    </div>
  {/snippet}
</Modal>
```

### Theming

```svelte
<!-- Light theme (default) -->
<Modal store={addItemStore}>
  <div class="bg-background text-foreground">
    <!-- Light theme content -->
  </div>
</Modal>

<!-- Dark theme -->
<Modal store={addItemStore} class="dark">
  <div class="bg-background text-foreground">
    <!-- Dark theme content (if CSS variables support it) -->
  </div>
</Modal>

<!-- Custom theme -->
<Modal
  backdropClass="bg-purple-900/50"
  class="bg-purple-100 border-purple-300"
>
  <div class="text-purple-900">
    <!-- Purple theme -->
  </div>
</Modal>
```

## Accessibility

### ARIA Attributes

All components include proper ARIA attributes:

```html
<!-- Modal -->
<div role="dialog" aria-modal="true" aria-label="Modal dialog">

<!-- Sheet -->
<div role="dialog" aria-modal="true" aria-label="Bottom sheet">

<!-- Alert -->
<div role="alertdialog" aria-modal="true" aria-label="Alert dialog">

<!-- NavigationStack -->
<div role="navigation" aria-label="Navigation stack">
```

### Focus Management

```svelte
<!-- Focus trap active when modal open -->
<Modal store={addItemStore}>
  {#snippet children({ store })}
    <!-- Focus stays within these elements -->
    <button>First focusable</button>
    <input type="text" />
    <button>Last focusable</button>
  {/snippet}
</Modal>

<!-- Focus returns to trigger on dismiss -->
<script>
  let buttonElement: HTMLElement;
</script>

<button bind:this={buttonElement}>Open Modal</button>

<Modal store={addItemStore} returnFocusTo={buttonElement}>
  <!-- Content -->
</Modal>
```

### Keyboard Navigation

- **Tab/Shift+Tab**: Cycle through focusable elements
- **Escape**: Dismiss (unless disabled)
- **Enter/Space**: Activate buttons
- **Arrow keys**: Navigate lists/menus (custom implementation)

### Screen Reader Support

```svelte
<!-- Descriptive titles -->
<Modal store={addItemStore}>
  {#snippet children({ store })}
    <h2 id="modal-title">Add New Item</h2>
    <div aria-describedby="modal-title">
      <!-- Content -->
    </div>
  {/snippet}
</Modal>

<!-- Status updates -->
<Modal store={saveStore}>
  {#snippet children({ store })}
    <h2>Saving...</h2>
    {#if store.state.isSaving}
      <div aria-live="polite" aria-atomic="true">
        Saving your changes...
      </div>
    {/if}
  {/snippet}
</Modal>

<!-- Error announcements -->
<Modal store={formStore}>
  {#snippet children({ store })}
    {#if store.state.error}
      <div role="alert" aria-live="assertive">
        Error: {store.state.error}
      </div>
    {/if}
  {/snippet}
</Modal>
```

## Best Practices

### 1. Always Provide Dismissal

```svelte
<!-- ✅ GOOD: Multiple ways to dismiss -->
<Modal store={addItemStore}>
  {#snippet children({ store })}
    <h2>Add Item</h2>
    <!-- Explicit cancel button -->
    <button onclick={() => store.dismiss()}>Cancel</button>
    <!-- Backdrop click enabled (default) -->
    <!-- Escape key enabled (default) -->
  {/snippet}
</Modal>

<!-- ⚠️ CAUTION: Ensure alternative dismissal -->
<Modal
  store={criticalStore}
  disableClickOutside={true}
  disableEscapeKey={true}
>
  {#snippet children({ store })}
    <h2>Critical Action</h2>
    <!-- MUST provide explicit dismiss button -->
    <button onclick={() => store.dismiss()}>Cancel</button>
  {/snippet}
</Modal>
```

### 2. Guard Animation States

```typescript
// ✅ GOOD: Check state before transitions
case 'closeButtonTapped': {
  if (state.presentation.status !== 'presented') {
    return [state, Effect.none()];  // Guard prevents invalid transition
  }
  return [
    { ...state, presentation: { status: 'dismissing', ... } },
    Effect.animated(...)
  ];
}

// ❌ BAD: No guard, can dismiss during animation
case 'closeButtonTapped': {
  return [
    { ...state, presentation: { status: 'dismissing', ... } },
    Effect.animated(...)
  ];
}
```

### 3. Use Semantic HTML

```svelte
<!-- ✅ GOOD: Semantic structure -->
<Modal store={formStore}>
  {#snippet children({ store })}
    <h2>Edit Profile</h2>
    <form onsubmit={(e) => {
      e.preventDefault();
      store.dispatch({ type: 'saveButtonTapped' });
    }}>
      <label>
        Name:
        <input type="text" bind:value={store.state.name} />
      </label>
      <button type="submit">Save</button>
      <button type="button" onclick={() => store.dismiss()}>Cancel</button>
    </form>
  {/snippet}
</Modal>

<!-- ❌ BAD: No semantic structure -->
<Modal store={formStore}>
  {#snippet children({ store })}
    <div>Edit Profile</div>
    <div onclick={() => store.dispatch({ type: 'saveButtonTapped' })}>
      Save
    </div>
  {/snippet}
</Modal>
```

### 4. Handle Loading States

```svelte
<Modal store={saveStore}>
  {#snippet children({ store })}
    <h2>Save Changes?</h2>

    <button
      onclick={() => store.dispatch({ type: 'confirmed' })}
      disabled={store.state.isSaving}
    >
      {store.state.isSaving ? 'Saving...' : 'Save'}
    </button>

    <button
      onclick={() => store.dismiss()}
      disabled={store.state.isSaving}
    >
      Cancel
    </button>
  {/snippet}
</Modal>
```

### 5. Responsive Design

```svelte
<!-- Modal: Use max-width for desktop -->
<Modal class="max-w-lg sm:max-w-xl lg:max-w-2xl">
  <!-- Content -->
</Modal>

<!-- Sheet: Different heights for mobile/desktop -->
<Sheet
  side="bottom"
  height="80vh sm:60vh lg:50vh"
>
  <!-- Content -->
</Sheet>

<!-- Drawer: Narrower on mobile -->
<Drawer width="100vw sm:320px lg:400px">
  <!-- Content -->
</Drawer>
```

### 6. Test Accessibility

```typescript
// Vitest + @testing-library/svelte
import { render, screen } from '@testing-library/svelte';
import { axe } from 'jest-axe';

describe('Modal Accessibility', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(Modal, { store: mockStore });
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('traps focus within modal', () => {
    render(Modal, { store: mockStore });
    const modal = screen.getByRole('dialog');
    expect(modal).toHaveFocus();
  });

  it('dismisses on Escape key', async () => {
    const { component } = render(Modal, { store: mockStore });
    await userEvent.keyboard('{Escape}');
    expect(mockStore.dismiss).toHaveBeenCalled();
  });
});
```

## Next Steps

- **[Tree-Based Navigation](./tree-based.md)** - State-driven navigation patterns
- **[Dismiss Dependency](./dismiss.md)** - Child self-dismissal patterns
- **[Animation Integration](./animation.md)** - Advanced animation techniques
- **[Store and Reducers](../core-concepts/store-and-reducers.md)** - Core state management

## Related Documentation

- [Effects](../core-concepts/effects.md) - Side effect system
- [Testing](../core-concepts/testing.md) - Testing navigation components
- [Composition](../core-concepts/composition.md) - Reducer composition patterns
