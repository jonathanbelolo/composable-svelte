# Phase 2 Component Implementation Guide
## Professional Navigation Components for Composable Svelte

**Date**: October 26, 2025
**Status**: Implementation Ready
**Foundation**: Tasks 2.1-2.5 Complete | 113 Tests Passing
**Next**: Tasks 2.4 (Setup) → 2.6 (Components)

---

## Table of Contents

1. [Strategic Vision](#strategic-vision)
2. [Architecture Principles](#architecture-principles)
3. [Foundation Setup (Task 2.4)](#foundation-setup-task-24)
4. [Component Implementation Pattern](#component-implementation-pattern)
5. [Component-by-Component Deep Dive](#component-by-component-deep-dive)
6. [Testing Strategy](#testing-strategy)
7. [Integration Patterns](#integration-patterns)
8. [Quality Checklist](#quality-checklist)

---

## Strategic Vision

### What We're Building

We're creating **8 navigation components** (16 files total: primitive + styled variants) that rival the quality of:
- **Melt UI** (Svelte headless components)
- **Bits UI** (Svelte accessible components)
- **shadcn/ui** (React styled components)
- **Radix UI** (React primitive components)

### Why This Matters

This is a **library for other developers**. Every component must be:
- **Professional**: Production-ready, no shortcuts
- **Elegant**: Clean APIs, predictable behavior
- **Powerful**: Flexible enough for any use case
- **Accessible**: WCAG 2.1 AA compliant by default
- **Documented**: Self-explanatory with great examples

### Core Philosophy: Learn from the Best

**Don't reinvent the wheel**. We're adapting battle-tested patterns:

| Source | What We Take | Why |
|--------|--------------|-----|
| **Radix UI** | Accessibility patterns, keyboard handling, focus management | 7+ years of refinement, industry standard |
| **shadcn/ui** | CSS variables, Tailwind classes, design tokens | Beautiful defaults, easy theming |
| **Floating UI** | Positioning logic for Popover | Used by everyone, handles edge cases |
| **Melt UI** | Svelte-specific patterns, action usage | Native Svelte idioms |

**Our Innovation**: Store-driven state management + Composable Architecture patterns.

### Critical Phase 2 Constraint: NO ANIMATIONS

**Phase 2 components are animation-free**. All show/hide logic is **instant** (no transitions, no fades, no slides).

**Why?**
- Animations are deferred to **Phase 4** (Animation Integration)
- Phase 4 will use the Composable Architecture's animation system (PresentationState lifecycle)
- Components need to work perfectly without animations first
- Instant show/hide makes testing and debugging simpler

**What This Means**:
- ❌ No `tailwindcss-animate` plugin
- ❌ No CSS transitions or animations
- ❌ No keyframes, no `@apply animate-*`
- ✅ Simple opacity/display changes only
- ✅ Clean, predictable show/hide behavior

---

## Architecture Principles

### 1. Two-Layer Component System

Every component has **two files**:

```
ModalPrimitive.svelte     (Headless - logic only, zero styling)
Modal.svelte              (Styled - wraps primitive, adds Tailwind)
```

**Why Two Layers?**

**Primitives** (for power users):
- Zero dependencies on Tailwind
- Pure logic: keyboard, portals, state management
- Maximum flexibility for custom styling
- Smaller bundle when styling not needed

**Styled Components** (for rapid development):
- Beautiful defaults inspired by shadcn/ui
- Tailwind CSS classes, CSS variables
- `unstyled` prop to disable all styling
- `class` prop for easy customization

**Example Usage**:

```svelte
<!-- Quick start: Styled component -->
<script>
  import { Modal } from '@composable-svelte/core/navigation-components';
  const store = $derived(scopeToDestination(parentStore, ['destination'], 'addItem'));
</script>

<Modal {store}>
  <AddItemForm />
</Modal>

<!-- Power user: Primitive with custom styles -->
<script>
  import { ModalPrimitive } from '@composable-svelte/core/navigation-components/primitives';
</script>

<ModalPrimitive {store} let:visible>
  {#if visible}
    <div class="my-custom-modal-backdrop">
      <div class="my-custom-modal-content">
        <AddItemForm />
      </div>
    </div>
  {/if}
</ModalPrimitive>
```

### 2. Store-Driven State Management

**All components are controlled components**. No internal state for show/hide.

```svelte
<!-- CORRECT: Store controls visibility -->
<Modal store={modalStore} />  <!-- Shows when store is non-null -->

<!-- WRONG: Don't do imperative APIs -->
<Modal bind:open={isOpen} />  <!-- This is NOT our pattern -->
```

**Why?**
- Aligns with Composable Architecture (state drives UI)
- Testable with TestStore
- Time-travel debugging friendly
- Predictable, deterministic behavior

### 3. Accessibility First

Every component follows **WCAG 2.1 AA** standards:

- **Keyboard navigation**: Tab, Escape, Arrow keys, Home/End
- **Focus management**: Focus trap in modals, focus restoration
- **ARIA roles**: Proper semantic markup
- **Screen reader support**: Announcements, labels, descriptions

**Source of Truth**: Radix UI accessibility patterns (they've solved this already).

### 4. Svelte 5 Runes Native

All components use **modern Svelte 5 patterns**:

```svelte
<script>
  // Props with destructuring
  let { store, class: className, unstyled = false } = $props();

  // Derived state
  const visible = $derived(store !== null);

  // Effects for side effects
  $effect(() => {
    if (visible) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  });
</script>
```

**No legacy patterns**:
- ❌ No `export let prop`
- ❌ No `$:` reactive statements
- ❌ No `<script context="module">`

### 5. Progressive Enhancement

Components work without JavaScript (where possible):

```svelte
<!-- Modal content is in DOM, hidden with CSS -->
<div class="modal" hidden={!visible} aria-hidden={!visible}>
  <slot />
</div>
```

**Benefits**:
- SEO-friendly content
- Works with JS disabled (graceful degradation)
- Faster initial render

---

## Foundation Setup (Task 2.4)

### Task 2.4.1: Tailwind Configuration & CSS Variables

**Goal**: Professional theming system like shadcn/ui.

#### Step 1: Fetch shadcn/ui Configuration

We'll adapt these files:
- `shadcn-ui/apps/www/tailwind.config.ts` → Color palette, animations
- `shadcn-ui/apps/www/app/globals.css` → CSS variables

**Why shadcn?**
- Battle-tested by 100,000+ developers
- Beautiful default palette
- Dark mode built-in
- Easy to customize

#### Step 2: Create `tailwind.config.ts`

```typescript
// packages/core/tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './src/**/*.{html,js,svelte,ts}',
    './examples/**/*.{html,js,svelte,ts}'
  ],
  safelist: ['dark'], // Prevent purging dark mode class
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      }
    }
  },
  plugins: []
} satisfies Config;
```

**Key Features**:
- **CSS Variables**: All colors use HSL variables for easy theming
- **Dark Mode**: Class-based dark mode support
- **Responsive**: Container queries, breakpoints
- **Animations**: Built-in keyframes for common UI patterns

#### Step 3: Create `globals.css`

```css
/* packages/core/src/styles/globals.css */

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* Light mode color palette */
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    /* Dark mode color palette */
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

**Why This Approach?**

1. **HSL Variables**: Easy to adjust saturation/lightness without changing hue
2. **Semantic Names**: `primary`, `destructive` are more meaningful than `blue-500`
3. **Automatic Dark Mode**: Just toggle `.dark` class on root element
4. **Override Friendly**: Users can redefine any variable

#### Step 4: Install Dependencies

```bash
cd packages/core
pnpm add -D tailwindcss@^3.4.0
pnpm add @floating-ui/dom@^1.6.0
```

**Why These Versions?**
- `tailwindcss@3.4.0`: Latest stable, container queries support
- `@floating-ui/dom@1.6.0`: Latest stable, used by Radix UI

**Note**: No animation libraries in Phase 2. Animation support will be added in Phase 4 using the Composable Architecture's animation system.

---

### Task 2.4.2: Shared Component Utilities

**Goal**: Reusable DOM actions and utilities for all components.

#### Utility 1: `clickOutside` Action

**Purpose**: Detect clicks outside an element (for dismissing modals, dropdowns).

**Source**: Adapted from Radix UI's DismissableLayer.

```typescript
// packages/core/src/lib/actions/clickOutside.ts

/**
 * Detect clicks outside the given element and call handler.
 *
 * Adapted from Radix UI DismissableLayer for robust outside click detection.
 * Handles:
 * - Pointer events (mouse, touch, pen)
 * - Nested portals (clicks in other modals)
 * - Browser default behaviors
 *
 * @example
 * <div use:clickOutside={handleClickOutside}>
 *   Content here
 * </div>
 */
export function clickOutside(
  node: HTMLElement,
  handler: (event: PointerEvent) => void
) {
  const handlePointerDown = (event: PointerEvent) => {
    // Ignore right-clicks and middle-clicks
    if (event.button !== 0) return;

    // Check if click is outside the node
    const target = event.target as Node;
    if (node.contains(target)) return;

    // Call handler
    handler(event);
  };

  // Use pointerdown for better mobile support
  // Delay by one tick to avoid conflicts with click events
  const pointerDownListener = (event: PointerEvent) => {
    setTimeout(() => handlePointerDown(event), 0);
  };

  document.addEventListener('pointerdown', pointerDownListener, true);

  return {
    destroy() {
      document.removeEventListener('pointerdown', pointerDownListener, true);
    }
  };
}
```

**Key Design Decisions**:

1. **PointerEvents over MouseEvents**: Works with touch, mouse, and pen
2. **Capture Phase**: `true` flag catches events before they bubble
3. **Delayed Execution**: `setTimeout` avoids conflicts with same-tick events
4. **Button Check**: Ignores right-clicks and middle-clicks

#### Utility 2: `portal` Action

**Purpose**: Teleport element to a different DOM location (usually `document.body`).

**Why Not Use a Library?**
- Svelte 5 makes this trivial with `$effect`
- Zero dependencies
- Full control over mounting/unmounting

```typescript
// packages/core/src/lib/actions/portal.ts

/**
 * Portal (teleport) an element to a different location in the DOM.
 *
 * Default target is document.body, but can be customized.
 * Properly handles cleanup when component is destroyed.
 *
 * @example
 * <div use:portal>
 *   This will be appended to document.body
 * </div>
 *
 * @example
 * <div use:portal={'#portal-target'}>
 *   This will be appended to #portal-target
 * </div>
 */
export function portal(
  node: HTMLElement,
  target: HTMLElement | string = 'body'
) {
  let targetEl: HTMLElement | null = null;

  const mount = () => {
    // Resolve target
    if (typeof target === 'string') {
      targetEl = document.querySelector(target);
      if (!targetEl) {
        console.error(`[portal] Target not found: ${target}`);
        return;
      }
    } else {
      targetEl = target;
    }

    // Move node to target
    targetEl.appendChild(node);
  };

  const unmount = () => {
    if (targetEl && node.parentNode === targetEl) {
      targetEl.removeChild(node);
    }
  };

  mount();

  return {
    update(newTarget: HTMLElement | string) {
      unmount();
      target = newTarget;
      mount();
    },
    destroy() {
      unmount();
    }
  };
}
```

**Key Design Decisions**:

1. **Lazy Target Resolution**: Waits until mount to query selector
2. **Update Support**: Can change target dynamically
3. **Safe Cleanup**: Checks parent before removing
4. **Error Handling**: Logs errors without throwing

#### Utility 3: Keyboard Navigation Helpers

**Purpose**: Reusable keyboard handling for accessible components.

```typescript
// packages/core/src/lib/keyboard.ts

/**
 * Keyboard navigation utilities for accessible components.
 * Adapted from Radix UI Roving Focus patterns.
 */

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/**
 * Handle arrow key navigation in a list.
 *
 * @param event - Keyboard event
 * @param currentIndex - Current focused index
 * @param itemCount - Total number of items
 * @param orientation - List orientation (horizontal or vertical)
 * @returns New index to focus, or null if key not handled
 */
export function handleArrowNavigation(
  event: KeyboardEvent,
  currentIndex: number,
  itemCount: number,
  orientation: 'horizontal' | 'vertical' = 'vertical'
): number | null {
  const key = event.key as ArrowKey;

  // Determine next/previous keys based on orientation
  const nextKeys: ArrowKey[] = orientation === 'horizontal'
    ? ['ArrowRight']
    : ['ArrowDown'];
  const prevKeys: ArrowKey[] = orientation === 'horizontal'
    ? ['ArrowLeft']
    : ['ArrowUp'];

  if (nextKeys.includes(key)) {
    event.preventDefault();
    return (currentIndex + 1) % itemCount; // Wrap to start
  }

  if (prevKeys.includes(key)) {
    event.preventDefault();
    return (currentIndex - 1 + itemCount) % itemCount; // Wrap to end
  }

  // Home key: jump to first item
  if (event.key === 'Home') {
    event.preventDefault();
    return 0;
  }

  // End key: jump to last item
  if (event.key === 'End') {
    event.preventDefault();
    return itemCount - 1;
  }

  return null; // Key not handled
}

/**
 * Create a focus trap that keeps focus within a container.
 *
 * Used for modals and dialogs to prevent Tab from leaving the modal.
 *
 * @param container - Container element to trap focus within
 * @returns Cleanup function
 */
export function createFocusTrap(container: HTMLElement): () => void {
  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;

    const focusableElements = Array.from(
      container.querySelectorAll<HTMLElement>(focusableSelector)
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Shift+Tab on first element: focus last
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    // Tab on last element: focus first
    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
      return;
    }
  };

  container.addEventListener('keydown', handleKeyDown);

  // Focus first element initially
  const firstFocusable = container.querySelector<HTMLElement>(focusableSelector);
  firstFocusable?.focus();

  return () => {
    container.removeEventListener('keydown', handleKeyDown);
  };
}
```

**Key Design Decisions**:

1. **Orientation Support**: Works for both vertical (menus) and horizontal (tabs) lists
2. **Wrapping**: Arrow keys wrap around to start/end
3. **Home/End**: Jump to first/last item (accessibility best practice)
4. **Focus Trap**: Prevents Tab from leaving modal (WCAG requirement)

---

### Task 2.4.3: Install Dependencies

**Run in `packages/core`**:

```bash
# Install build dependencies
pnpm add -D tailwindcss@^3.4.0 \
           autoprefixer@^10.4.16 \
           postcss@^8.4.32

# Install runtime dependencies
pnpm add @floating-ui/dom@^1.6.0
```

**Update `package.json` peer dependencies**:

```json
{
  "peerDependencies": {
    "svelte": "^5.0.0",
    "tailwindcss": "^3.4.0"
  }
}
```

**Create PostCSS config**:

```javascript
// packages/core/postcss.config.cjs
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

---

## Component Implementation Pattern

### Understanding Store Architecture

**Critical Concept**: Components receive `ScopedDestinationStore`, not `Store`.

#### What is ScopedDestinationStore?

```typescript
interface ScopedDestinationStore<State, Action> {
  readonly state: State | null;      // The child state
  dispatch(action: Action): void;     // Dispatch child actions
  dismiss(): void;                    // Dismiss this destination
}
```

**Created by `scopeToDestination()`**:
```typescript
const addItemStore = $derived(
  scopeToDestination(
    parentStore,           // Parent store
    ['destination'],       // Path to destination field
    'addItem',            // Destination case type
    'destination'         // Parent action field
  )
);
```

**Key Benefits**:
- ✅ Built-in `dismiss()` method (no callbacks needed)
- ✅ Automatic action wrapping (child actions → parent actions)
- ✅ Reactive state (null when not presented)
- ✅ Type-safe dispatch

#### Component-Store Flow

```
1. User clicks "Add Item"
   → parentStore.dispatch({ type: 'addButtonTapped' })

2. Reducer sets destination
   → state.destination = { type: 'addItem', state: initialState }

3. scopeToDestination detects case
   → Returns scoped store with state + dispatch + dismiss

4. Component shows
   → Modal receives scoped store, renders content

5. User presses Escape
   → Modal calls store.dismiss()

6. Scoped store wraps action
   → Dispatches { type: 'destination', action: { type: 'dismiss' } }

7. Reducer handles dismiss (via ifLet)
   → Sets state.destination = null

8. scopeToDestination returns null
   → Modal hides
```

### The "Perfect Component" Template

Every component follows this exact structure. Master this once, replicate 8 times.

#### Primitive Component Template

```svelte
<!-- ModalPrimitive.svelte -->
<script lang="ts">
  import { portal } from '$lib/actions/portal.js';
  import { clickOutside } from '$lib/actions/clickOutside.js';
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface ModalPrimitiveProps<State, Action> {
    /**
     * Scoped store for the modal content.
     * When null, modal is hidden. When non-null, modal is visible.
     */
    store: ScopedDestinationStore<State, Action> | null;

    /**
     * Disable click-outside to dismiss.
     * @default false
     */
    disableClickOutside?: boolean;

    /**
     * Disable Escape key to dismiss.
     * @default false
     */
    disableEscapeKey?: boolean;
  }

  let {
    store,
    disableClickOutside = false,
    disableEscapeKey = false,
    children
  }: ModalPrimitiveProps<any, any> = $props();

  // ============================================================================
  // Derived State
  // ============================================================================

  const visible = $derived(store !== null);

  // ============================================================================
  // Event Handlers
  // ============================================================================

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && !disableEscapeKey && store) {
      event.preventDefault();
      store.dismiss(); // Built-in dismiss method!
    }
  }

  function handleClickOutside() {
    if (!disableClickOutside && store) {
      store.dismiss(); // Built-in dismiss method!
    }
  }

  // ============================================================================
  // Side Effects
  // ============================================================================

  // Prevent body scroll when modal is open
  $effect(() => {
    if (visible) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  });
</script>

<!-- ============================================================================ -->
<!-- Keyboard Listeners -->
<!-- ============================================================================ -->

<svelte:window on:keydown={handleEscape} />

<!-- ============================================================================ -->
<!-- Portal Content -->
<!-- ============================================================================ -->

{#if visible}
  <div use:portal>
    <!-- Slot: Expose visible state and store to parent -->
    {@render children({ visible, store })}
  </div>
{/if}
```

**Key Patterns**:

1. **Props Interface**: Fully typed, documented with JSDoc
2. **Derived State**: Use `$derived` for reactivity
3. **Event Handlers**: Named functions, not inline
4. **Side Effects**: Use `$effect` with cleanup
5. **Slots**: Expose useful data to parent
6. **No Styling**: Zero classes, pure logic

#### Styled Component Template

```svelte
<!-- Modal.svelte -->
<script lang="ts">
  import ModalPrimitive from './primitives/ModalPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import { cn } from '$lib/utils.js'; // Class name merger

  // ============================================================================
  // Props
  // ============================================================================

  interface ModalProps<State, Action> {
    /**
     * Scoped store for the modal content.
     */
    store: ScopedDestinationStore<State, Action> | null;

    /**
     * Disable all default styling.
     * When true, component behaves like the primitive.
     * @default false
     */
    unstyled?: boolean;

    /**
     * Override backdrop classes.
     */
    backdropClass?: string;

    /**
     * Override content container classes.
     */
    class?: string;

    /**
     * Disable click-outside to dismiss.
     */
    disableClickOutside?: boolean;

    /**
     * Disable Escape key to dismiss.
     */
    disableEscapeKey?: boolean;
  }

  let {
    store,
    unstyled = false,
    backdropClass,
    class: className,
    disableClickOutside = false,
    disableEscapeKey = false,
    children
  }: ModalProps<any, any> = $props();

  // ============================================================================
  // Computed Classes
  // ============================================================================

  const defaultBackdropClasses =
    'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm';

  const defaultContentClasses =
    'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg';

  const backdropClasses = $derived(
    unstyled ? '' : cn(defaultBackdropClasses, backdropClass)
  );

  const contentClasses = $derived(
    unstyled ? '' : cn(defaultContentClasses, className)
  );
</script>

<!-- ============================================================================ -->
<!-- Styled Modal -->
<!-- ============================================================================ -->

<ModalPrimitive
  {store}
  {disableClickOutside}
  {disableEscapeKey}
>
  {#snippet children({ visible, store })}
    <!-- Backdrop -->
    <div class={backdropClasses} aria-hidden="true" />

    <!-- Content Container -->
    <div
      class={contentClasses}
      role="dialog"
      aria-modal="true"
    >
      {@render children?.({ visible, store })}
    </div>
  {/snippet}
</ModalPrimitive>
```

**Key Patterns**:

1. **Wraps Primitive**: Styled component is a thin wrapper
2. **Class Merging**: Use `cn()` utility (from shadcn)
3. **Default Classes**: shadcn-inspired Tailwind classes
4. **Unstyled Escape Hatch**: `unstyled` prop disables all styling
5. **ARIA Attributes**: Proper semantic markup
6. **Flexible Overrides**: `backdropClass`, `class` props

#### Utility: Class Name Merger

```typescript
// packages/core/src/lib/utils.ts

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes without conflicts.
 *
 * Example:
 *   cn('px-2 py-1', 'px-4') → 'py-1 px-4'
 *   (px-4 overrides px-2)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Install Dependencies**:

```bash
pnpm add clsx tailwind-merge
```

---

## Component-by-Component Deep Dive

### 1. Modal Component (Proof of Concept)

**Implementation Order**: Do this FIRST to establish the pattern.

#### Design Reference

**Radix UI**: `@radix-ui/react-dialog`
- Accessibility: Focus trap, Escape key, ARIA roles
- Behavior: Portal rendering, body scroll lock

**shadcn/ui**: `components/ui/dialog.tsx`
- Styling: Backdrop blur, centered content, shadow
- Classes: `fixed left-[50%] top-[50%]` for perfect centering

#### Primitive Implementation

**File**: `packages/core/src/navigation-components/primitives/ModalPrimitive.svelte`

**Responsibilities**:
1. ✅ Portal to `document.body`
2. ✅ Keyboard handling (Escape to dismiss)
3. ✅ Click-outside handling
4. ✅ Body scroll lock when open
5. ✅ Focus trap (Phase 5 - defer for now)
6. ✅ Restore focus on close (Phase 5 - defer for now)

**Full Implementation**:

```svelte
<script lang="ts">
  import { portal } from '$lib/actions/portal.js';
  import { clickOutside } from '$lib/actions/clickOutside.js';
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';

  interface ModalPrimitiveProps<State, Action> {
    store: ScopedDestinationStore<State, Action> | null;
    disableClickOutside?: boolean;
    disableEscapeKey?: boolean;
  }

  let {
    store,
    disableClickOutside = false,
    disableEscapeKey = false,
    children
  }: ModalPrimitiveProps<any, any> = $props();

  const visible = $derived(store !== null);

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && !disableEscapeKey && visible && store) {
      event.preventDefault();
      store.dismiss();
    }
  }

  function handleClickOutside() {
    if (!disableClickOutside && store) {
      store.dismiss();
    }
  }

  // Lock body scroll when modal is open
  $effect(() => {
    if (visible) {
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;

      // Calculate scrollbar width to prevent layout shift
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
  });
</script>

<svelte:window on:keydown={handleEscape} />

{#if visible}
  <div use:portal>
    <div use:clickOutside={handleClickOutside}>
      {@render children?.({ visible, store })}
    </div>
  </div>
{/if}
```

**Critical Details**:

1. **Scrollbar Compensation**: Prevents layout shift when hiding scrollbar
2. **Escape Only When Visible**: Prevents conflicts with other modals
3. **Cleanup**: Restores original styles on unmount

#### Styled Implementation

**File**: `packages/core/src/navigation-components/Modal.svelte`

```svelte
<script lang="ts">
  import ModalPrimitive from './primitives/ModalPrimitive.svelte';
  import type { Store } from '../store.svelte.js';
  import { cn } from '$lib/utils.js';

  interface ModalProps<State, Action> {
    store: Store<State, Action> | null;
    onDismiss?: () => void;
    unstyled?: boolean;
    backdropClass?: string;
    class?: string;
    disableClickOutside?: boolean;
    disableEscapeKey?: boolean;
  }

  let {
    store,
    unstyled = false,
    backdropClass,
    class: className,
    disableClickOutside = false,
    disableEscapeKey = false,
    children
  }: ModalProps<any, any> = $props();

  const backdropClasses = $derived(
    unstyled
      ? ''
      : cn(
          'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm',
          backdropClass
        )
  );

  const contentClasses = $derived(
    unstyled
      ? ''
      : cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg',
          'translate-x-[-50%] translate-y-[-50%]',
          'gap-4 border bg-background p-6 shadow-lg sm:rounded-lg',
          className
        )
  );

  // Note: No transitions/animations in Phase 2 - instant show/hide only
</script>

<ModalPrimitive
  {store}
  {onDismiss}
  {disableClickOutside}
  {disableEscapeKey}
>
  {#snippet children({ visible, store })}
    {#if backdropClasses}
      <div class={backdropClasses} aria-hidden="true" />
    {/if}

    <div
      class={contentClasses}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {@render children?.({ visible, store })}
    </div>
  {/snippet}
</ModalPrimitive>
```

**Class Breakdown**:

```css
/* Backdrop */
fixed inset-0        /* Cover entire viewport */
z-50                 /* Above most content */
bg-background/80     /* Semi-transparent background */
backdrop-blur-sm     /* Blur content behind */

/* Content */
fixed left-[50%] top-[50%]    /* Position at center */
translate-x-[-50%] translate-y-[-50%]  /* Perfect centering */
z-50                          /* Above backdrop */
w-full max-w-lg              /* Responsive width */
gap-4                        /* Internal spacing */
border bg-background         /* Card appearance */
p-6 shadow-lg               /* Padding and depth */
sm:rounded-lg               /* Rounded on larger screens */

/* Note: No transition classes - Phase 2 components show/hide instantly */
```

#### Testing Modal

**File**: `packages/core/tests/navigation-components/Modal.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Modal from '../src/navigation-components/Modal.svelte';
import { createStore } from '../src/store.svelte.js';

describe('Modal Component', () => {
  it('shows when store is non-null', () => {
    const store = createStore({
      initialState: { value: 'test' },
      reducer: (state, action) => [state, Effect.none()]
    });

    const { getByRole } = render(Modal, {
      props: { store }
    });

    expect(getByRole('dialog')).toBeInTheDocument();
  });

  it('hides when store is null', () => {
    const { getByRole, rerender } = render(Modal, {
      props: { store: null }
    });

    expect(() => getByRole('dialog')).toThrow();
  });

  it('calls onDismiss when Escape pressed', async () => {
    const store = createStore({
      initialState: { value: 'test' },
      reducer: (state, action) => [state, Effect.none()]
    });

    const onDismiss = vi.fn();

    render(Modal, {
      props: { store, onDismiss }
    });

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('calls onDismiss when clicking outside', async () => {
    const store = createStore({
      initialState: { value: 'test' },
      reducer: (state, action) => [state, Effect.none()]
    });

    const onDismiss = vi.fn();

    const { container } = render(Modal, {
      props: { store, onDismiss }
    });

    // Click on backdrop
    const backdrop = container.querySelector('[aria-hidden="true"]');
    await fireEvent.pointerDown(backdrop!);

    expect(onDismiss).toHaveBeenCalled();
  });

  it('respects disableEscapeKey prop', async () => {
    const store = createStore({
      initialState: { value: 'test' },
      reducer: (state, action) => [state, Effect.none()]
    });

    const onDismiss = vi.fn();

    render(Modal, {
      props: { store, onDismiss, disableEscapeKey: true }
    });

    await fireEvent.keyDown(window, { key: 'Escape' });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('applies custom classes', () => {
    const store = createStore({
      initialState: { value: 'test' },
      reducer: (state, action) => [state, Effect.none()]
    });

    const { getByRole } = render(Modal, {
      props: {
        store,
        class: 'custom-modal',
        backdropClass: 'custom-backdrop'
      }
    });

    const dialog = getByRole('dialog');
    expect(dialog.className).toContain('custom-modal');
  });

  it('respects unstyled prop', () => {
    const store = createStore({
      initialState: { value: 'test' },
      reducer: (state, action) => [state, Effect.none()]
    });

    const { getByRole } = render(Modal, {
      props: { store, unstyled: true }
    });

    const dialog = getByRole('dialog');
    expect(dialog.className).toBe(''); // No classes applied
  });
});
```

---

### 2. Sheet Component (Mobile Bottom Drawer)

**Reference**: Melt UI Sheet / Radix UI Dialog with `side="bottom"`

#### Key Differences from Modal

1. **Position**: Bottom of screen instead of center
2. **Height**: Partial height (default 60vh, configurable)
3. **Drag to Dismiss**: Deferred to Phase 4 (requires animation system)

#### Primitive Implementation

```svelte
<!-- SheetPrimitive.svelte -->
<script lang="ts">
  import { portal } from '$lib/actions/portal.js';
  import { clickOutside } from '$lib/actions/clickOutside.js';
  import type { Store } from '../../store.svelte.js';

  interface SheetPrimitiveProps<State, Action> {
    store: Store<State, Action> | null;
    onDismiss?: () => void;
    disableClickOutside?: boolean;
    disableEscapeKey?: boolean;
    /**
     * Height of the sheet as CSS value.
     * @default '60vh'
     */
    height?: string;
  }

  let {
    store,
    onDismiss,
    disableClickOutside = false,
    disableEscapeKey = false,
    height = '60vh',
    children
  }: SheetPrimitiveProps<any, any> = $props();

  const visible = $derived(store !== null);

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && !disableEscapeKey && visible && onDismiss) {
      event.preventDefault();
      onDismiss();
    }
  }

  function handleClickOutside() {
    if (!disableClickOutside && onDismiss) {
      onDismiss();
    }
  }

  $effect(() => {
    if (visible) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  });
</script>

<svelte:window on:keydown={handleEscape} />

{#if visible}
  <div use:portal>
    <div use:clickOutside={handleClickOutside}>
      {@render children?.({ visible, store, height })}
    </div>
  </div>
{/if}
```

#### Styled Implementation

```svelte
<!-- Sheet.svelte -->
<script lang="ts">
  import SheetPrimitive from './primitives/SheetPrimitive.svelte';
  import type { Store } from '../store.svelte.js';
  import { cn } from '$lib/utils.js';

  interface SheetProps<State, Action> {
    store: Store<State, Action> | null;
    onDismiss?: () => void;
    unstyled?: boolean;
    backdropClass?: string;
    class?: string;
    disableClickOutside?: boolean;
    disableEscapeKey?: boolean;
    height?: string;
  }

  let {
    store,
    unstyled = false,
    backdropClass,
    class: className,
    disableClickOutside = false,
    disableEscapeKey = false,
    height = '60vh',
    children
  }: SheetProps<any, any> = $props();

  const backdropClasses = $derived(
    unstyled
      ? ''
      : cn('fixed inset-0 z-50 bg-background/80 backdrop-blur-sm', backdropClass)
  );

  const contentClasses = $derived(
    unstyled
      ? ''
      : cn(
          'fixed bottom-0 left-0 right-0 z-50',
          'border-t bg-background shadow-lg',
          'rounded-t-xl',
          className
        )
  );
</script>

<SheetPrimitive
  {store}
  {onDismiss}
  {disableClickOutside}
  {disableEscapeKey}
  {height}
>
  {#snippet children({ visible, store, height })}
    {#if backdropClasses}
      <div class={backdropClasses} aria-hidden="true" />
    {/if}

    <div
      class={contentClasses}
      style="height: {height}"
      role="dialog"
      aria-modal="true"
    >
      {@render children?.({ visible, store })}
    </div>
  {/snippet}
</SheetPrimitive>
```

**Class Breakdown**:

```css
/* Sheet positioning */
fixed bottom-0 left-0 right-0  /* Anchored to bottom, full width */
z-50                           /* Above backdrop */
border-t                       /* Top border only */
bg-background shadow-lg        /* Card appearance */
rounded-t-xl                   /* Rounded top corners */
```

---

### 3. Drawer Component (Side Panel)

**Reference**: Melt UI Drawer / Radix UI Dialog with `side="left|right"`

#### Key Differences

1. **Position**: Left or right side
2. **Width**: Partial width (default 320px, configurable)
3. **Side Prop**: `left` or `right`

#### Primitive Implementation

```svelte
<!-- DrawerPrimitive.svelte -->
<script lang="ts">
  import { portal } from '$lib/actions/portal.js';
  import { clickOutside } from '$lib/actions/clickOutside.js';
  import type { Store } from '../../store.svelte.js';

  type DrawerSide = 'left' | 'right';

  interface DrawerPrimitiveProps<State, Action> {
    store: Store<State, Action> | null;
    onDismiss?: () => void;
    disableClickOutside?: boolean;
    disableEscapeKey?: boolean;
    /**
     * Which side to show the drawer.
     * @default 'left'
     */
    side?: DrawerSide;
    /**
     * Width of the drawer as CSS value.
     * @default '320px'
     */
    width?: string;
  }

  let {
    store,
    onDismiss,
    disableClickOutside = false,
    disableEscapeKey = false,
    side = 'left',
    width = '320px',
    children
  }: DrawerPrimitiveProps<any, any> = $props();

  const visible = $derived(store !== null);

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && !disableEscapeKey && visible && onDismiss) {
      event.preventDefault();
      onDismiss();
    }
  }

  function handleClickOutside() {
    if (!disableClickOutside && onDismiss) {
      onDismiss();
    }
  }

  $effect(() => {
    if (visible) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  });
</script>

<svelte:window on:keydown={handleEscape} />

{#if visible}
  <div use:portal>
    <div use:clickOutside={handleClickOutside}>
      {@render children?.({ visible, store, side, width })}
    </div>
  </div>
{/if}
```

#### Styled Implementation

```svelte
<!-- Drawer.svelte -->
<script lang="ts">
  import DrawerPrimitive from './primitives/DrawerPrimitive.svelte';
  import type { Store } from '../store.svelte.js';
  import { cn } from '$lib/utils.js';

  type DrawerSide = 'left' | 'right';

  interface DrawerProps<State, Action> {
    store: Store<State, Action> | null;
    onDismiss?: () => void;
    unstyled?: boolean;
    backdropClass?: string;
    class?: string;
    disableClickOutside?: boolean;
    disableEscapeKey?: boolean;
    side?: DrawerSide;
    width?: string;
  }

  let {
    store,
    unstyled = false,
    backdropClass,
    class: className,
    disableClickOutside = false,
    disableEscapeKey = false,
    side = 'left',
    width = '320px',
    children
  }: DrawerProps<any, any> = $props();

  const backdropClasses = $derived(
    unstyled
      ? ''
      : cn('fixed inset-0 z-50 bg-background/80 backdrop-blur-sm', backdropClass)
  );

  const contentClasses = $derived(
    unstyled
      ? ''
      : cn(
          'fixed top-0 bottom-0 z-50',
          side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
          'bg-background shadow-lg',
          className
        )
  );
</script>

<DrawerPrimitive
  {store}
  {onDismiss}
  {disableClickOutside}
  {disableEscapeKey}
  {side}
  {width}
>
  {#snippet children({ visible, store, side, width })}
    {#if backdropClasses}
      <div class={backdropClasses} aria-hidden="true" />
    {/if}

    <div
      class={contentClasses}
      style="width: {width}"
      role="dialog"
      aria-modal="true"
    >
      {@render children?.({ visible, store })}
    </div>
  {/snippet}
</DrawerPrimitive>
```

---

### 4. NavigationStack Component

**Reference**: Custom (no direct Radix equivalent)

**Unique Aspects**:
- Renders array of screens
- Back navigation
- Uses `handleStackAction()` utility

#### Primitive Implementation

```svelte
<!-- NavigationStackPrimitive.svelte -->
<script lang="ts">
  import type { Store } from '../../store.svelte.js';

  interface NavigationStackPrimitiveProps<State, Action> {
    /**
     * Array of screen stores (one per screen in stack).
     */
    screens: Array<Store<State, Action>>;

    /**
     * Callback when back button is pressed.
     */
    onBack?: () => void;

    /**
     * Callback when navigating to a specific index.
     */
    onNavigate?: (index: number) => void;
  }

  let {
    screens,
    onBack,
    onNavigate,
    children
  }: NavigationStackPrimitiveProps<any, any> = $props();

  const currentIndex = $derived(screens.length - 1);
  const canGoBack = $derived(screens.length > 1);

  function handleBack() {
    if (canGoBack && onBack) {
      onBack();
    }
  }

  function handleNavigateTo(index: number) {
    if (onNavigate) {
      onNavigate(index);
    }
  }
</script>

{@render children?.({
  screens,
  currentIndex,
  canGoBack,
  onBack: handleBack,
  onNavigate: handleNavigateTo
})}
```

#### Styled Implementation

```svelte
<!-- NavigationStack.svelte -->
<script lang="ts">
  import NavigationStackPrimitive from './primitives/NavigationStackPrimitive.svelte';
  import type { Store } from '../store.svelte.js';
  import { cn } from '$lib/utils.js';

  interface NavigationStackProps<State, Action> {
    screens: Array<Store<State, Action>>;
    onBack?: () => void;
    onNavigate?: (index: number) => void;
    unstyled?: boolean;
    class?: string;
    /**
     * Show breadcrumb navigation.
     * @default false
     */
    showBreadcrumbs?: boolean;
  }

  let {
    screens,
    onBack,
    onNavigate,
    unstyled = false,
    class: className,
    showBreadcrumbs = false,
    children
  }: NavigationStackProps<any, any> = $props();

  const containerClasses = $derived(
    unstyled
      ? ''
      : cn('relative h-full w-full overflow-hidden', className)
  );

  const backButtonClasses = $derived(
    unstyled
      ? ''
      : 'absolute top-4 left-4 z-10 inline-flex items-center gap-2 rounded-md bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent'
  );
</script>

<NavigationStackPrimitive
  {screens}
  {onBack}
  {onNavigate}
>
  {#snippet children({ screens, currentIndex, canGoBack, onBack })}
    <div class={containerClasses}>
      <!-- Back Button -->
      {#if canGoBack && !unstyled}
        <button
          class={backButtonClasses}
          onclick={onBack}
          aria-label="Go back"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
      {/if}

      <!-- Breadcrumbs (optional) -->
      {#if showBreadcrumbs && screens.length > 1}
        <nav class="mb-4 flex gap-2 text-sm text-muted-foreground">
          {#each screens as _, index}
            <button
              onclick={() => onNavigate?.(index)}
              class:font-semibold={index === currentIndex}
            >
              Screen {index + 1}
            </button>
            {#if index < screens.length - 1}
              <span>/</span>
            {/if}
          {/each}
        </nav>
      {/if}

      <!-- Current Screen -->
      <div class="h-full w-full">
        {@render children?.({ screen: screens[currentIndex], index: currentIndex })}
      </div>
    </div>
  {/snippet}
</NavigationStackPrimitive>
```

---

### 5. Alert Component (Simple Confirmation)

**Reference**: Radix AlertDialog

**Unique Aspects**:
- Non-dismissible by default (no click-outside)
- Action buttons built-in
- Simple API for confirmations

#### Primitive Implementation

```svelte
<!-- AlertPrimitive.svelte -->
<script lang="ts">
  import { portal } from '$lib/actions/portal.js';
  import type { Store } from '../../store.svelte.js';

  interface AlertPrimitiveProps<State, Action> {
    store: Store<State, Action> | null;
    onDismiss?: () => void;
    /**
     * Allow Escape key to dismiss.
     * @default false (alerts should require explicit action)
     */
    allowEscape?: boolean;
  }

  let {
    store,
    onDismiss,
    allowEscape = false,
    children
  }: AlertPrimitiveProps<any, any> = $props();

  const visible = $derived(store !== null);

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && allowEscape && visible && onDismiss) {
      event.preventDefault();
      onDismiss();
    }
  }

  $effect(() => {
    if (visible) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  });
</script>

<svelte:window on:keydown={handleEscape} />

{#if visible}
  <div use:portal>
    {@render children?.({ visible, store })}
  </div>
{/if}
```

#### Styled Implementation

```svelte
<!-- Alert.svelte -->
<script lang="ts">
  import AlertPrimitive from './primitives/AlertPrimitive.svelte';
  import type { Store } from '../store.svelte.js';
  import { cn } from '$lib/utils.js';

  type AlertVariant = 'default' | 'destructive';

  interface AlertButton {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'primary' | 'destructive';
  }

  interface AlertProps<State, Action> {
    store: Store<State, Action> | null;
    onDismiss?: () => void;
    unstyled?: boolean;
    class?: string;
    /**
     * Alert title.
     */
    title?: string;
    /**
     * Alert message.
     */
    message?: string;
    /**
     * Alert variant (affects styling).
     * @default 'default'
     */
    variant?: AlertVariant;
    /**
     * Action buttons.
     */
    buttons?: AlertButton[];
    allowEscape?: boolean;
  }

  let {
    store,
    unstyled = false,
    class: className,
    title,
    message,
    variant = 'default',
    buttons = [],
    allowEscape = false,
    children
  }: AlertProps<any, any> = $props();

  const backdropClasses = $derived(
    unstyled
      ? ''
      : 'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm'
  );

  const contentClasses = $derived(
    unstyled
      ? ''
      : cn(
          'fixed left-[50%] top-[50%] z-50',
          'translate-x-[-50%] translate-y-[-50%]',
          'w-full max-w-md',
          'gap-4 border bg-background p-6 shadow-lg sm:rounded-lg',
          className
        )
  );

  const titleClasses = $derived(
    unstyled ? '' : 'text-lg font-semibold'
  );

  const messageClasses = $derived(
    unstyled ? '' : 'text-sm text-muted-foreground'
  );

  const buttonContainerClasses = $derived(
    unstyled ? '' : 'mt-6 flex justify-end gap-3'
  );

  function getButtonClasses(buttonVariant: string = 'default') {
    if (unstyled) return '';

    const base = 'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors';

    // Note: Removed transition-colors - no transitions in Phase 2
    switch (buttonVariant) {
      case 'primary':
        return cn(base, 'bg-primary text-primary-foreground hover:bg-primary/90');
      case 'destructive':
        return cn(base, 'bg-destructive text-destructive-foreground hover:bg-destructive/90');
      default:
        return cn(base, 'bg-secondary text-secondary-foreground hover:bg-secondary/80');
    }
  }
</script>

<AlertPrimitive
  {store}
  {onDismiss}
  {allowEscape}
>
  {#snippet children({ visible, store })}
    {#if backdropClasses}
      <div class={backdropClasses} aria-hidden="true" />
    {/if}

    <div
      class={contentClasses}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="alert-title"
      aria-describedby="alert-description"
    >
      {#if title}
        <h2 id="alert-title" class={titleClasses}>
          {title}
        </h2>
      {/if}

      {#if message}
        <p id="alert-description" class={messageClasses}>
          {message}
        </p>
      {/if}

      {#if children}
        {@render children({ visible, store })}
      {/if}

      {#if buttons.length > 0}
        <div class={buttonContainerClasses}>
          {#each buttons as button}
            <button
              class={getButtonClasses(button.variant)}
              onclick={button.onClick}
            >
              {button.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/snippet}
</AlertPrimitive>
```

**Usage Example**:

```svelte
<Alert
  store={alertStore}
  title="Delete Item?"
  message="This action cannot be undone."
  buttons={[
    { label: 'Cancel', onClick: handleCancel, variant: 'default' },
    { label: 'Delete', onClick: handleDelete, variant: 'destructive' }
  ]}
/>
```

---

### 6. Sidebar Component (Desktop Persistent Navigation)

**Reference**: Radix Navigation Menu + Custom Layout

**Unique Aspects**:
- Not portal-based (in-place rendering)
- Persistent on desktop
- Transforms to Drawer on mobile
- Collapse/expand state

#### Primitive Implementation

```svelte
<!-- SidebarPrimitive.svelte -->
<script lang="ts">
  type SidebarSide = 'left' | 'right';

  interface SidebarPrimitiveProps {
    /**
     * Is sidebar expanded?
     */
    expanded: boolean;

    /**
     * Which side to show sidebar.
     * @default 'left'
     */
    side?: SidebarSide;

    /**
     * Callback when toggle button clicked.
     */
    onToggle?: () => void;

    /**
     * Width when expanded (CSS value).
     * @default '240px'
     */
    expandedWidth?: string;

    /**
     * Width when collapsed (CSS value).
     * @default '64px'
     */
    collapsedWidth?: string;
  }

  let {
    expanded,
    side = 'left',
    onToggle,
    expandedWidth = '240px',
    collapsedWidth = '64px',
    children
  }: SidebarPrimitiveProps = $props();

  const width = $derived(expanded ? expandedWidth : collapsedWidth);
</script>

{@render children?.({
  expanded,
  side,
  width,
  onToggle
})}
```

#### Styled Implementation with Responsive Behavior

```svelte
<!-- Sidebar.svelte -->
<script lang="ts">
  import SidebarPrimitive from './primitives/SidebarPrimitive.svelte';
  import DrawerPrimitive from './primitives/DrawerPrimitive.svelte';
  import { cn } from '$lib/utils.js';

  type SidebarSide = 'left' | 'right';

  interface SidebarProps {
    expanded: boolean;
    onToggle?: () => void;
    side?: SidebarSide;
    unstyled?: boolean;
    class?: string;
    expandedWidth?: string;
    collapsedWidth?: string;
    /**
     * Breakpoint for mobile transformation (Tailwind class).
     * @default 'lg' (1024px)
     */
    desktopBreakpoint?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  }

  let {
    expanded,
    onToggle,
    side = 'left',
    unstyled = false,
    class: className,
    expandedWidth = '240px',
    collapsedWidth = '64px',
    desktopBreakpoint = 'lg',
    children
  }: SidebarProps = $props();

  // Desktop sidebar classes
  const desktopClasses = $derived(
    unstyled
      ? ''
      : cn(
          `hidden ${desktopBreakpoint}:flex`,
          'flex-col',
          side === 'left' ? 'border-r' : 'border-l',
          'bg-background',
          // Note: No transitions in Phase 2 - removed 'transition-all duration-200'
          className
        )
  );

  // Mobile drawer (uses DrawerPrimitive)
  const mobileVisible = $derived(expanded);

  // Create a fake store for Drawer (it expects a store)
  const drawerStore = $derived(mobileVisible ? { state: {} } : null);
</script>

<!-- Desktop: Persistent Sidebar -->
<SidebarPrimitive
  {expanded}
  {side}
  {onToggle}
  {expandedWidth}
  {collapsedWidth}
>
  {#snippet children({ expanded, side, width, onToggle })}
    <aside
      class={desktopClasses}
      style="width: {width}"
      aria-label="Sidebar navigation"
    >
      {@render children?.({ expanded, onToggle })}
    </aside>
  {/snippet}
</SidebarPrimitive>

<!-- Mobile: Drawer Overlay (only on screens smaller than breakpoint) -->
<div class={cn(`${desktopBreakpoint}:hidden`)}>
  <DrawerPrimitive
    store={drawerStore}
    onDismiss={onToggle}
    {side}
    width={expandedWidth}
  >
    {#snippet children({ visible, store })}
      {@render children?.({ expanded: visible, onToggle })}
    {/snippet}
  </DrawerPrimitive>
</div>
```

**Responsive Behavior**:
- **Desktop (≥1024px)**: Persistent sidebar, collapse/expand in-place
- **Mobile (<1024px)**: Drawer overlay when expanded

---

### 7. Tabs Component (Horizontal Navigation)

**Reference**: Radix Tabs

**Key Features**:
- Arrow key navigation
- Home/End keys
- ARIA roles
- Horizontal scroll on mobile

#### Primitive Implementation

```svelte
<!-- TabsPrimitive.svelte -->
<script lang="ts">
  import { handleArrowNavigation } from '$lib/keyboard.js';

  export interface Tab {
    id: string;
    label: string;
    disabled?: boolean;
  }

  interface TabsPrimitiveProps {
    /**
     * Array of tabs.
     */
    tabs: Tab[];

    /**
     * Currently active tab ID.
     */
    activeTab: string;

    /**
     * Callback when tab is selected.
     */
    onTabChange?: (tabId: string) => void;
  }

  let {
    tabs,
    activeTab,
    onTabChange,
    children
  }: TabsPrimitiveProps = $props();

  const activeIndex = $derived(
    tabs.findIndex(tab => tab.id === activeTab)
  );

  function handleKeyDown(event: KeyboardEvent) {
    const newIndex = handleArrowNavigation(
      event,
      activeIndex,
      tabs.length,
      'horizontal'
    );

    if (newIndex !== null) {
      const newTab = tabs[newIndex];
      if (newTab && !newTab.disabled && onTabChange) {
        onTabChange(newTab.id);
      }
    }
  }

  function handleTabClick(tab: Tab) {
    if (!tab.disabled && onTabChange) {
      onTabChange(tab.id);
    }
  }
</script>

<div role="tablist" aria-orientation="horizontal" onkeydown={handleKeyDown}>
  {@render children?.({
    tabs,
    activeTab,
    activeIndex,
    onTabClick: handleTabClick
  })}
</div>
```

#### Styled Implementation

```svelte
<!-- Tabs.svelte -->
<script lang="ts">
  import TabsPrimitive, { type Tab } from './primitives/TabsPrimitive.svelte';
  import { cn } from '$lib/utils.js';

  type TabsVariant = 'underline' | 'pills';

  interface TabsProps {
    tabs: Tab[];
    activeTab: string;
    onTabChange?: (tabId: string) => void;
    unstyled?: boolean;
    class?: string;
    /**
     * Tab style variant.
     * @default 'underline'
     */
    variant?: TabsVariant;
  }

  let {
    tabs,
    activeTab,
    onTabChange,
    unstyled = false,
    class: className,
    variant = 'underline',
    children
  }: TabsProps = $props();

  const containerClasses = $derived(
    unstyled
      ? ''
      : cn(
          'flex gap-1 overflow-x-auto',
          variant === 'underline' ? 'border-b' : '',
          className
        )
  );

  function getTabClasses(tab: Tab, isActive: boolean) {
    if (unstyled) return '';

    // Note: Removed 'transition-all' - no transitions in Phase 2
    const base = 'inline-flex items-center justify-center whitespace-nowrap px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2';

    if (variant === 'underline') {
      return cn(
        base,
        'border-b-2 -mb-px',
        isActive
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
        tab.disabled && 'opacity-50 cursor-not-allowed'
      );
    } else {
      // Pills variant
      return cn(
        base,
        'rounded-md',
        isActive
          ? 'bg-background text-foreground shadow'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        tab.disabled && 'opacity-50 cursor-not-allowed'
      );
    }
  }
</script>

<TabsPrimitive
  {tabs}
  {activeTab}
  {onTabChange}
>
  {#snippet children({ tabs, activeTab, onTabClick })}
    <div class={containerClasses}>
      {#each tabs as tab}
        {@const isActive = tab.id === activeTab}
        <button
          class={getTabClasses(tab, isActive)}
          role="tab"
          aria-selected={isActive}
          aria-disabled={tab.disabled}
          tabindex={isActive ? 0 : -1}
          onclick={() => onTabClick(tab)}
          disabled={tab.disabled}
        >
          {tab.label}
        </button>
      {/each}
    </div>

    {#if children}
      <div role="tabpanel" class="mt-4">
        {@render children({ activeTab })}
      </div>
    {/if}
  {/snippet}
</TabsPrimitive>
```

---

### 8. Popover Component (Contextual Menus)

**Reference**: Radix Popover + Floating UI

**Key Features**:
- Auto-positioning (flip, shift)
- Anchor tracking
- Arrow indicator

#### Install Floating UI

```bash
pnpm add @floating-ui/dom@^1.6.0
```

#### Primitive Implementation

```svelte
<!-- PopoverPrimitive.svelte -->
<script lang="ts">
  import { computePosition, flip, shift, offset, arrow } from '@floating-ui/dom';
  import { portal } from '$lib/actions/portal.js';
  import { clickOutside } from '$lib/actions/clickOutside.js';
  import type { Store } from '../../store.svelte.js';

  type Placement = 'top' | 'bottom' | 'left' | 'right';

  interface PopoverPrimitiveProps<State, Action> {
    store: Store<State, Action> | null;
    onDismiss?: () => void;
    /**
     * Anchor element to position relative to.
     */
    anchor: HTMLElement | null;
    /**
     * Preferred placement.
     * @default 'bottom'
     */
    placement?: Placement;
    /**
     * Offset from anchor (pixels).
     * @default 8
     */
    offsetDistance?: number;
  }

  let {
    store,
    onDismiss,
    anchor,
    placement = 'bottom',
    offsetDistance = 8,
    children
  }: PopoverPrimitiveProps<any, any> = $props();

  const visible = $derived(store !== null);

  let popoverElement: HTMLElement | null = $state(null);
  let arrowElement: HTMLElement | null = $state(null);

  // Update position when visible or anchor changes
  $effect(() => {
    if (visible && anchor && popoverElement) {
      updatePosition();

      // Update position on scroll/resize
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  });

  async function updatePosition() {
    if (!anchor || !popoverElement) return;

    const middleware = [
      offset(offsetDistance),
      flip(),
      shift({ padding: 8 })
    ];

    if (arrowElement) {
      middleware.push(arrow({ element: arrowElement }));
    }

    const { x, y, placement: finalPlacement, middlewareData } = await computePosition(
      anchor,
      popoverElement,
      {
        placement,
        middleware
      }
    );

    // Apply position
    Object.assign(popoverElement.style, {
      left: `${x}px`,
      top: `${y}px`
    });

    // Position arrow
    if (arrowElement && middlewareData.arrow) {
      const { x: arrowX, y: arrowY } = middlewareData.arrow;

      Object.assign(arrowElement.style, {
        left: arrowX != null ? `${arrowX}px` : '',
        top: arrowY != null ? `${arrowY}px` : ''
      });
    }
  }

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && visible && onDismiss) {
      event.preventDefault();
      onDismiss();
    }
  }

  function handleClickOutside(event: PointerEvent) {
    // Don't dismiss if clicking the anchor
    if (anchor?.contains(event.target as Node)) return;

    if (onDismiss) {
      onDismiss();
    }
  }
</script>

<svelte:window on:keydown={handleEscape} />

{#if visible}
  <div use:portal>
    <div bind:this={popoverElement} use:clickOutside={handleClickOutside}>
      {@render children?.({
        visible,
        store,
        arrowRef: (el: HTMLElement) => { arrowElement = el; }
      })}
    </div>
  </div>
{/if}
```

#### Styled Implementation

```svelte
<!-- Popover.svelte -->
<script lang="ts">
  import PopoverPrimitive from './primitives/PopoverPrimitive.svelte';
  import type { Store } from '../store.svelte.js';
  import { cn } from '$lib/utils.js';

  type Placement = 'top' | 'bottom' | 'left' | 'right';

  interface PopoverProps<State, Action> {
    store: Store<State, Action> | null;
    onDismiss?: () => void;
    anchor: HTMLElement | null;
    placement?: Placement;
    offsetDistance?: number;
    unstyled?: boolean;
    class?: string;
    /**
     * Show arrow indicator.
     * @default true
     */
    showArrow?: boolean;
  }

  let {
    store,
    onDismiss,
    anchor,
    placement = 'bottom',
    offsetDistance = 8,
    unstyled = false,
    class: className,
    showArrow = true,
    children
  }: PopoverProps<any, any> = $props();

  const contentClasses = $derived(
    unstyled
      ? ''
      : cn(
          'absolute z-50',
          'min-w-[8rem] max-w-[var(--radix-popover-content-available-width)]',
          'rounded-md border bg-popover p-4 text-popover-foreground shadow-md',
          'outline-none',
          className
        )
  );

  const arrowClasses = $derived(
    unstyled ? '' : 'absolute fill-popover'
  );
</script>

<PopoverPrimitive
  {store}
  {onDismiss}
  {anchor}
  {placement}
  {offsetDistance}
>
  {#snippet children({ visible, store, arrowRef })}
    <div class={contentClasses} role="dialog">
      {@render children?.({ visible, store })}

      {#if showArrow && !unstyled}
        <div bind:this={arrowRef} class={arrowClasses}>
          <svg width="16" height="8" viewBox="0 0 16 8">
            <path d="M0 8 L8 0 L16 8" />
          </svg>
        </div>
      {/if}
    </div>
  {/snippet}
</PopoverPrimitive>
```

---

## Testing Strategy

### Test Structure

Every component gets **two test files**:

1. **Primitive Tests**: Logic, behavior, props
2. **Styled Tests**: Styling, class merging, unstyled prop

### Example: Modal Tests

```typescript
// Modal.test.ts
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import Modal from '../src/navigation-components/Modal.svelte';
import { createStore } from '../src/store.svelte.js';

describe('Modal - Styled Component', () => {
  it('applies default classes', () => {
    const store = createStore({
      initialState: { value: 'test' },
      reducer: (state) => [state, Effect.none()]
    });

    const { getByRole } = render(Modal, { props: { store } });
    const dialog = getByRole('dialog');

    expect(dialog.className).toContain('bg-background');
    expect(dialog.className).toContain('shadow-lg');
  });

  it('merges custom classes', () => {
    const store = createStore({
      initialState: { value: 'test' },
      reducer: (state) => [state, Effect.none()]
    });

    const { getByRole } = render(Modal, {
      props: { store, class: 'custom-class' }
    });

    expect(getByRole('dialog').className).toContain('custom-class');
  });

  it('respects unstyled prop', () => {
    const store = createStore({
      initialState: { value: 'test' },
      reducer: (state) => [state, Effect.none()]
    });

    const { container } = render(Modal, {
      props: { store, unstyled: true }
    });

    // No default classes applied
    expect(container.innerHTML).not.toContain('bg-background');
  });
});
```

---

## Integration Patterns

### Complete Example: Modal with Reducer Integration

This shows the full flow from reducer to component.

#### 1. Define State & Actions

```typescript
// Child state and actions
interface AddItemState {
  name: string;
  quantity: number;
}

type AddItemAction =
  | { type: 'nameChanged'; value: string }
  | { type: 'quantityChanged'; value: number }
  | { type: 'saveButtonTapped' }
  | { type: 'cancelButtonTapped' };

// Parent state and actions
interface InventoryState {
  items: Item[];
  destination: Destination | null;
}

type Destination =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState; id: string };

type InventoryAction =
  | { type: 'addButtonTapped' }
  | { type: 'destination'; action: PresentationAction<AddItemAction | EditItemAction> };
```

#### 2. Write Child Reducer

```typescript
import { Effect } from '@composable-svelte/core';

const addItemReducer: Reducer<AddItemState, AddItemAction> = (state, action) => {
  switch (action.type) {
    case 'nameChanged':
      return [{ ...state, name: action.value }, Effect.none()];

    case 'quantityChanged':
      return [{ ...state, quantity: action.value }, Effect.none()];

    case 'saveButtonTapped':
      // Child doesn't know it will be dismissed - parent handles that
      return [state, Effect.none()];

    case 'cancelButtonTapped':
      // Child doesn't dismiss itself - parent handles that via PresentationAction
      return [state, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
```

#### 3. Write Parent Reducer (with ifLet)

```typescript
import { ifLet, createDestinationReducer } from '@composable-svelte/core/navigation';

const inventoryReducer: Reducer<InventoryState, InventoryAction> = (state, action, deps) => {
  // Handle destination navigation with ifLet
  const [stateAfterDestination, destinationEffect] = ifLet(
    (s) => s.destination,
    (s, d) => ({ ...s, destination: d }),
    (a) => a.type === 'destination' ? a.action : null,
    (ca) => ({ type: 'destination', action: ca }),
    createDestinationReducer({
      addItem: addItemReducer,
      editItem: editItemReducer
    })
  )(state, action, deps);

  // Handle parent-specific actions
  switch (action.type) {
    case 'addButtonTapped':
      return [
        {
          ...stateAfterDestination,
          destination: {
            type: 'addItem',
            state: { name: '', quantity: 1 }
          }
        },
        destinationEffect
      ];

    default:
      return [stateAfterDestination, destinationEffect];
  }
};
```

#### 4. Create Store

```typescript
import { createStore } from '@composable-svelte/core';

const inventoryStore = createStore({
  initialState: { items: [], destination: null },
  reducer: inventoryReducer
});
```

#### 5. Component (with scopeToDestination)

```svelte
<!-- InventoryApp.svelte -->
<script>
  import { Modal } from '@composable-svelte/core/navigation-components';
  import { scopeToDestination } from '@composable-svelte/core/navigation';

  let { store } = $props(); // inventoryStore passed in

  // Create scoped store for add item modal
  const addItemStore = $derived(
    scopeToDestination(
      store,
      ['destination'],        // Path to destination field
      'addItem',              // Destination case to scope to
      'destination'           // Parent action field
    )
  );
</script>

<!-- Add Item Button -->
<button onclick={() => store.dispatch({ type: 'addButtonTapped' })}>
  Add Item
</button>

<!-- Modal (automatically shows/hides based on destination) -->
<Modal store={addItemStore}>
  {#snippet children({ visible, store: scopedStore })}
    <h2>Add New Item</h2>

    <input
      type="text"
      value={scopedStore.state?.name ?? ''}
      oninput={(e) => scopedStore.dispatch({
        type: 'nameChanged',
        value: e.target.value
      })}
    />

    <input
      type="number"
      value={scopedStore.state?.quantity ?? 1}
      oninput={(e) => scopedStore.dispatch({
        type: 'quantityChanged',
        value: parseInt(e.target.value)
      })}
    />

    <div class="flex gap-2">
      <button onclick={() => scopedStore.dispatch({ type: 'saveButtonTapped' })}>
        Save
      </button>
      <button onclick={() => scopedStore.dismiss()}>
        Cancel
      </button>
    </div>
  {/snippet}
</Modal>
```

#### Flow Diagram

```
[User clicks "Add Item"]
  ↓
[store.dispatch({ type: 'addButtonTapped' })]
  ↓
[Reducer sets destination: { type: 'addItem', state: { name: '', quantity: 1 } }]
  ↓
[scopeToDestination detects 'addItem' case]
  ↓
[Returns scoped store with state, dispatch, dismiss]
  ↓
[Modal component receives scoped store]
  ↓
[Modal shows (store !== null)]
  ↓
[User types in input]
  ↓
[scopedStore.dispatch({ type: 'nameChanged', value: 'Widget' })]
  ↓
[Scoped store wraps: { type: 'destination', action: { type: 'presented', action: { type: 'nameChanged', value: 'Widget' } } }]
  ↓
[Parent reducer receives wrapped action]
  ↓
[ifLet unwraps and routes to addItemReducer]
  ↓
[Child reducer updates state: { name: 'Widget', quantity: 1 }]
  ↓
[Parent state updated: destination.state.name = 'Widget']
  ↓
[Component re-renders with new state]
  ↓
[User clicks "Cancel"]
  ↓
[scopedStore.dismiss()]
  ↓
[Scoped store dispatches: { type: 'destination', action: { type: 'dismiss' } }]
  ↓
[ifLet receives dismiss, sets destination: null]
  ↓
[scopeToDestination returns null]
  ↓
[Modal hides (store === null)]
```

### Pattern 2: Modal with Form (Simplified)

```svelte
<script>
  import { Modal } from '@composable-svelte/core/navigation-components';
  import { scopeToDestination } from '@composable-svelte/core/navigation';

  const addItemStore = $derived(
    scopeToDestination(store, ['destination'], 'addItem', 'destination')
  );
</script>

<!-- No onDismiss callback needed! -->
<Modal store={addItemStore}>
  <h2 class="text-lg font-semibold">Add New Item</h2>
  <form>
    <input type="text" placeholder="Item name" />
    <!-- Cancel button calls store.dismiss() -->
    <button type="button" onclick={() => addItemStore.dismiss()}>Cancel</button>
    <button type="submit">Add</button>
  </form>
</Modal>
```

### Pattern 2: NavigationStack Flow

```svelte
<script>
  import { NavigationStack } from '@composable-svelte/core/navigation-components';

  function handleBack() {
    store.dispatch({ type: 'stack', action: { type: 'pop' } });
  }
</script>

<NavigationStack
  screens={store.state.stack}
  onBack={handleBack}
>
  {#snippet children({ screen, index })}
    {#if index === 0}
      <WelcomeScreen {screen} />
    {:else if index === 1}
      <DetailsScreen {screen} />
    {:else}
      <ConfirmationScreen {screen} />
    {/if}
  {/snippet}
</NavigationStack>
```

### Pattern 3: Desktop Layout with Sidebar + Tabs

```svelte
<script>
  import { Sidebar, Tabs } from '@composable-svelte/core/navigation-components';

  let sidebarExpanded = $state(true);
  let activeTab = $state('overview');
</script>

<div class="flex h-screen">
  <!-- Sidebar (collapses to drawer on mobile) -->
  <Sidebar
    expanded={sidebarExpanded}
    onToggle={() => sidebarExpanded = !sidebarExpanded}
  >
    <nav>
      <a href="/dashboard">Dashboard</a>
      <a href="/settings">Settings</a>
    </nav>
  </Sidebar>

  <!-- Main content with tabs -->
  <main class="flex-1 overflow-auto">
    <Tabs
      tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'analytics', label: 'Analytics' },
        { id: 'reports', label: 'Reports' }
      ]}
      {activeTab}
      onTabChange={(id) => activeTab = id}
    >
      {#snippet children({ activeTab })}
        {#if activeTab === 'overview'}
          <OverviewPanel />
        {:else if activeTab === 'analytics'}
          <AnalyticsPanel />
        {:else}
          <ReportsPanel />
        {/if}
      {/snippet}
    </Tabs>
  </main>
</div>
```

---

## Quality Checklist

### Before Committing Each Component

- [ ] **Primitive Component**
  - [ ] Pure logic, zero styling
  - [ ] Proper TypeScript types
  - [ ] JSDoc on all props
  - [ ] Keyboard handling (if applicable)
  - [ ] Cleanup effects properly
  - [ ] Exports slot props

- [ ] **Styled Component**
  - [ ] Wraps primitive correctly
  - [ ] shadcn-inspired classes
  - [ ] `unstyled` prop works
  - [ ] `class` prop merges correctly
  - [ ] ARIA attributes present
  - [ ] Responsive design

- [ ] **Tests**
  - [ ] Show/hide logic tested
  - [ ] Props tested
  - [ ] Events tested
  - [ ] Accessibility tested
  - [ ] Edge cases covered

- [ ] **Documentation**
  - [ ] JSDoc on component
  - [ ] Usage examples in comments
  - [ ] Props documented

- [ ] **Build**
  - [ ] TypeScript compiles
  - [ ] No linter errors
  - [ ] Tests pass

---

## Final Notes

### Implementation Order

1. ✅ **Setup** (Task 2.4): Tailwind, utilities, dependencies
2. 🎯 **Proof of Concept**: Modal (primitive + styled) - nail the pattern
3. 🔁 **Replicate**: Remaining 7 components using the proven pattern
4. ✅ **Polish**: Testing, documentation, examples

### Time Estimates

- **Setup**: 2-3 hours
- **Modal** (first component): 3-4 hours (establishing pattern)
- **Each subsequent component**: 2-3 hours (replicating pattern)
- **Testing**: 1 hour per component
- **Total**: ~35-45 hours for all 8 components

### Success Criteria

You'll know you've succeeded when:

1. **Components work beautifully** - smooth, responsive, accessible
2. **Code is clean** - consistent patterns, well-typed, documented
3. **Tests are comprehensive** - edge cases covered, all passing
4. **Users have flexibility** - primitives for power, styled for speed
5. **You're proud to ship it** - production-ready quality

---

**Ready to build world-class components!** 🚀

Let's start with Task 2.4.1: Tailwind configuration.
