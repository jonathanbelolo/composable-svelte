# Radix UI & shadcn/ui Reuse Guide

**Purpose**: Guide for adapting battle-tested UI patterns from Radix UI and shadcn/ui to our Composable Svelte architecture.

**Philosophy**: Don't reinvent the wheel. Leverage years of polish and refinement from industry-leading UI libraries, adapted to our state-driven architecture.

**Last Updated**: October 26, 2025

---

## Table of Contents

1. [Overview](#overview)
2. [What We Can Reuse](#what-we-can-reuse)
3. [What We Cannot Reuse](#what-we-cannot-reuse)
4. [Adaptation Strategy](#adaptation-strategy)
5. [Component-by-Component Guide](#component-by-component-guide)
6. [File Mapping Reference](#file-mapping-reference)
7. [Dependencies](#dependencies)
8. [Licensing](#licensing)
9. [Implementation Checklist](#implementation-checklist)

---

## Overview

### Source Libraries

**Radix UI** (Headless Primitives)
- Repository: https://github.com/radix-ui/primitives
- License: MIT
- What we use: Logic patterns, accessibility, keyboard handling, positioning algorithms
- Language: React (we adapt to Svelte)

**shadcn/ui** (Tailwind Styled Components)
- Repository: https://github.com/shadcn-ui/ui
- License: MIT
- What we use: Tailwind classes, CSS variables, visual design
- Language: React (we adapt to Svelte)

**Our Approach**: Copy styling 90%, adapt logic 70%, integrate with our store architecture 100% custom.

### Three-Layer Reuse Strategy

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3: Styled Components (Modal.svelte)                 │
│  ────────────────────────────────────────────────────────   │
│  Source: shadcn/ui *.tsx files                              │
│  Reuse: 90% - Copy Tailwind classes directly               │
│  Adapt: 10% - JSX → Svelte syntax, remove animations       │
│  Custom: unstyled prop, store integration wrapper          │
└─────────────────────────────────────────────────────────────┘
              ▲
              │ wraps
              ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2: Primitive Components (ModalPrimitive.svelte)     │
│  ────────────────────────────────────────────────────────   │
│  Source: Radix UI primitives                                │
│  Reuse: 70% - Logic patterns, accessibility, keyboard      │
│  Adapt: 30% - React → Svelte, hooks → runes/stores         │
│  Custom: Store-driven visibility, action dispatch          │
└─────────────────────────────────────────────────────────────┘
              ▲
              │ uses
              ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: Store/Reducer (100% OURS)                         │
│  ────────────────────────────────────────────────────────   │
│  Source: Our architecture                                   │
│  Reuse: 0% - This is what makes us unique                  │
│  Custom: 100% - State-driven navigation via reducers       │
└─────────────────────────────────────────────────────────────┘
```

---

## What We Can Reuse

### ✅ From shadcn/ui (95-100% Reusable)

#### **Tailwind Classes** (100% copy)
Copy entire class strings verbatim. These are framework-agnostic.

**Example**:
```tsx
// shadcn/ui dialog.tsx
className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg"

// Our Modal.svelte - EXACT SAME CLASSES
class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg"
```

**Exception**: Remove animation classes (we'll add our own in Phase 4)
```tsx
// ❌ REMOVE THESE in Phase 2
"duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out"
"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
"data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"

// ✅ KEEP THESE
"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg"
"translate-x-[-50%] translate-y-[-50%]"
"gap-4 border bg-background p-6 shadow-lg sm:rounded-lg"
```

#### **CSS Variables** (100% copy)
Copy their entire CSS variable system for theming.

**File to copy**: `shadcn/ui/apps/www/app/globals.css`

```css
/* Copy this section verbatim */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 47.4% 11.2%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 47.4% 11.2%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 47.4% 11.2%;
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
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... copy all dark mode variables */
  }
}
```

#### **Tailwind Config** (95% copy)
Copy their `tailwind.config.js` setup, adapt paths.

**File to copy**: `shadcn/ui/apps/www/tailwind.config.js`

```typescript
// Copy their config, change content paths
export default {
  content: [
    './packages/core/src/**/*.{svelte,js,ts}',  // Our paths
  ],
  theme: {
    extend: {
      // Copy their entire theme extension
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        // ... copy all color definitions
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // ... copy all other extensions
    },
  },
  plugins: [require("tailwindcss-animate")], // Copy plugins
}
```

#### **Component Structure** (80% copy)
HTML structure and semantic elements.

```tsx
// shadcn/ui dialog.tsx - Copy this structure
<DialogPortal>
  <DialogOverlay />
  <DialogPrimitive.Content>
    <DialogHeader>
      <DialogTitle />
      <DialogDescription />
    </DialogHeader>
    {children}
    <DialogFooter>
      <DialogClose />
    </DialogFooter>
  </DialogPrimitive.Content>
</DialogPortal>

// Our Modal.svelte - Keep same structure
<ModalPrimitive {store}>
  <div class="overlay" />
  <div class="content">
    <div class="header">
      <slot name="title" />
      <slot name="description" />
    </div>
    <slot />
    <div class="footer">
      <slot name="footer" />
    </div>
  </div>
</ModalPrimitive>
```

### ✅ From Radix UI (70% Adaptable)

#### **Accessibility Attributes** (95% copy)
ARIA roles, attributes, and patterns.

**File to reference**: `radix-ui/primitives/packages/react/dialog/src/Dialog.tsx`

```typescript
// Radix Dialog - Copy these attributes
<Primitive.div
  role="dialog"
  aria-describedby={descriptionId}
  aria-labelledby={titleId}
  aria-modal={context.modal}
  data-state={getState(context.open)}
>

// Our ModalPrimitive.svelte - Same attributes
<div
  role="dialog"
  aria-describedby={descriptionId}
  aria-labelledby={titleId}
  aria-modal="true"
  data-state={store ? 'open' : 'closed'}
>
```

#### **Keyboard Navigation** (90% adapt)
Keyboard event handling patterns.

**Example: Tab navigation** (from Radix Tabs)

```typescript
// Radix Tabs keyboard handling - Adapt this logic
function handleKeyDown(event: React.KeyboardEvent) {
  const tabs = Array.from(tabListRef.current.querySelectorAll('[role="tab"]'));
  const currentIndex = tabs.indexOf(event.target);

  let nextIndex = currentIndex;

  switch (event.key) {
    case 'ArrowLeft':
      nextIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
      break;
    case 'ArrowRight':
      nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = tabs.length - 1;
      break;
  }

  if (nextIndex !== currentIndex) {
    tabs[nextIndex]?.focus();
    setActiveTab(tabs[nextIndex].dataset.value);
  }
}

// Our TabsPrimitive.svelte - Same logic, Svelte syntax
function handleKeydown(e: KeyboardEvent) {
  const tabs = Array.from(tablistRef.querySelectorAll('[role="tab"]'));
  const currentIndex = tabs.indexOf(e.target as HTMLElement);

  let nextIndex = currentIndex;

  switch (e.key) {
    case 'ArrowLeft':
      nextIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
      break;
    case 'ArrowRight':
      nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
      break;
    case 'Home':
      nextIndex = 0;
      break;
    case 'End':
      nextIndex = tabs.length - 1;
      break;
  }

  if (nextIndex !== currentIndex) {
    (tabs[nextIndex] as HTMLElement)?.focus();
    onTabChange?.(tabs[nextIndex].dataset.value!);
  }
}
```

#### **Positioning Logic** (100% copy via library)
Radix uses Floating UI - we should too!

**Library**: `@floating-ui/dom` (same library Radix uses)

```typescript
// Radix Popover uses Floating UI - We copy this approach
import { computePosition, flip, shift, offset } from '@floating-ui/dom';

async function updatePosition() {
  const { x, y, placement } = await computePosition(anchorRef, popoverRef, {
    placement: preferredSide,
    middleware: [
      offset(offsetValue),
      flip(), // Auto-flip when no space
      shift({ padding: 8 })
    ]
  });

  Object.assign(popoverRef.style, {
    left: `${x}px`,
    top: `${y}px`,
  });
}
```

#### **Click-Outside Detection** (80% adapt)
Radix has DismissableLayer - we adapt to Svelte action.

**Reference**: `radix-ui/primitives/packages/react/dismissable-layer/src/DismissableLayer.tsx`

```typescript
// Radix DismissableLayer logic - Adapt to Svelte action
function clickOutside(node: HTMLElement, callback: () => void) {
  function handleClick(event: MouseEvent) {
    if (!node.contains(event.target as Node)) {
      callback();
    }
  }

  // Radix pattern: Delay adding listener (allow opening click to complete)
  setTimeout(() => {
    document.addEventListener('pointerdown', handleClick);
  }, 0);

  return {
    destroy() {
      document.removeEventListener('pointerdown', handleClick);
    }
  };
}
```

#### **Focus Trap** (Phase 5 - defer for now)
Radix has focus scope logic - we'll add this in Phase 5.

**Reference**: `radix-ui/primitives/packages/react/focus-scope/src/FocusScope.tsx`

---

## What We Cannot Reuse

### ❌ React-Specific Code

#### **React Hooks → Svelte Runes/Stores**
```typescript
// ❌ CANNOT COPY - React hooks
const [open, setOpen] = React.useState(false);
const [activeTab, setActiveTab] = React.useState('tab1');

// ✅ OUR APPROACH - Store-driven state
let { store } = $props();
const visible = $derived(store !== null);

// OR for local component state
let activeTab = $state('tab1');
```

#### **React Context → Svelte Context**
```typescript
// ❌ CANNOT COPY - React Context
const DialogContext = React.createContext<DialogContextValue>(null);
const context = React.useContext(DialogContext);

// ✅ OUR APPROACH - Svelte context
import { getContext, setContext } from 'svelte';
setContext('dialog', dialogContext);
const context = getContext<DialogContext>('dialog');
```

#### **React Portals → Svelte Portals**
```tsx
// ❌ CANNOT COPY - React portal API
ReactDOM.createPortal(children, document.body)

// ✅ OUR APPROACH - Svelte portal library
import { portal } from 'svelte-portal';
<div use:portal={'body'}>
  {children}
</div>
```

### ❌ Internal State Management

Radix manages component state internally. We manage state in reducers/stores.

```typescript
// ❌ RADIX APPROACH - Internal state
const Dialog = ({ open, onOpenChange, children }) => {
  // Component controls its own state
  const [internalOpen, setInternalOpen] = useState(open);

  return <DialogImpl open={internalOpen} />;
}

// ✅ OUR APPROACH - External state (store)
interface ModalProps {
  store: Store<ModalState, ModalAction> | null;  // State lives in store
}

const visible = $derived(store !== null);  // Derive from store
// User controls state via actions, not component props
```

### ❌ Animation Systems

Both shadcn and Radix use animation libraries we'll replace.

```tsx
// ❌ REMOVE THESE - shadcn animations (Tailwind classes)
"duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out"
"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"

// ❌ REMOVE THESE - Radix animations (Framer Motion in some examples)
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
>

// ✅ PHASE 2 - No animations (instant show/hide)
{#if store}
  <div>Content</div>
{/if}

// ✅ PHASE 4 - Our animation system
{#if store}
  <div transition:customTransition>Content</div>
{/if}
```

---

## Adaptation Strategy

### Step-by-Step Process for Each Component

#### **Phase 1: Setup** (5 minutes)
1. Locate shadcn component file (e.g., `dialog.tsx`)
2. Locate Radix primitive file (e.g., `Dialog.tsx`)
3. Create our files:
   - `ModalPrimitive.svelte`
   - `Modal.svelte`

#### **Phase 2: Primitive Implementation** (1-2 hours per component)

**Step 2.1**: Copy Radix component structure
```typescript
// Radix Dialog.tsx
export const Dialog = (props) => {
  return (
    <DialogImpl {...props}>
      {props.children}
    </DialogImpl>
  );
};

// Our ModalPrimitive.svelte
<script lang="ts">
  interface Props {
    store: Store<any, any> | null;
    onEscapeKeyDown?: (e: KeyboardEvent) => void;
  }

  let { store, onEscapeKeyDown }: Props = $props();
</script>
```

**Step 2.2**: Copy accessibility attributes
```svelte
<!-- Copy from Radix -->
<div
  role="dialog"
  aria-modal="true"
  aria-describedby={descriptionId}
  aria-labelledby={titleId}
  data-state={store ? 'open' : 'closed'}
>
```

**Step 2.3**: Adapt keyboard handling
```typescript
// From Radix - translate to Svelte
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    onEscapeKeyDown?.(e);
    if (!e.defaultPrevented) {
      // Dispatch dismiss action to store
      store?.dispatch({ type: 'dismiss' });
    }
  }
}
```

**Step 2.4**: Add portal (Svelte-specific)
```svelte
<script>
  import { portal } from 'svelte-portal';
</script>

{#if store}
  <div use:portal={'body'}>
    <!-- content -->
  </div>
{/if}
```

**Step 2.5**: Add click-outside detection
```typescript
// Adapt from Radix DismissableLayer
import { clickOutside } from '$lib/actions';

<div use:clickOutside={() => store?.dispatch({ type: 'dismiss' })}>
```

#### **Phase 3: Styled Implementation** (30 min - 1 hour per component)

**Step 3.1**: Copy shadcn component
```tsx
// shadcn dialog.tsx - Copy entire component structure
const DialogContent = React.forwardRef<...>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay className="..." />
    <DialogPrimitive.Content className="..." />
  </DialogPortal>
))
```

**Step 3.2**: Convert JSX → Svelte
```svelte
<!-- Our Modal.svelte -->
<script lang="ts">
  import ModalPrimitive from './primitives/ModalPrimitive.svelte';

  interface Props {
    store: Store<any, any> | null;
    unstyled?: boolean;
    class?: string;
  }

  let { store, unstyled = false, class: className = '' }: Props = $props();
</script>

<ModalPrimitive {store}>
  {#if !unstyled}
    <!-- Copy shadcn HTML structure + classes -->
    <div class="fixed inset-0 z-50 bg-black/80" />
    <div class="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg {className}">
      <slot />
    </div>
  {:else}
    <slot />
  {/if}
</ModalPrimitive>
```

**Step 3.3**: Remove animation classes
```diff
<!-- shadcn classes -->
- duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out
- data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0
- data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95

<!-- Our classes (animations removed) -->
+ fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg
+ translate-x-[-50%] translate-y-[-50%]
+ gap-4 border bg-background p-6 shadow-lg sm:rounded-lg

<!-- TODO Phase 4: Add our animation system -->
```

**Step 3.4**: Add component variants (if needed)
```svelte
<!-- shadcn pattern - size variants -->
<script>
  let { size = 'default' } = $props();

  const sizeClasses = {
    sm: 'max-w-sm',
    default: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  };
</script>

<div class="... {sizeClasses[size]}">
```

---

## Component-by-Component Guide

### Modal Component

#### **Sources**
- **Primitive**: `radix-ui/primitives/packages/react/dialog/src/Dialog.tsx`
- **Styled**: `shadcn/ui/apps/www/registry/new-york/ui/dialog.tsx`

#### **What to Copy**

**From Radix Dialog**:
- ✅ `role="dialog"`, `aria-modal="true"` attributes
- ✅ Escape key handler
- ✅ Focus trap logic (Phase 5)
- ✅ Overlay click handler
- ✅ Portal to body pattern

**From shadcn Dialog**:
- ✅ Entire class string for overlay: `"fixed inset-0 z-50 bg-black/80"`
- ✅ Entire class string for content: `"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg"`
- ✅ DialogHeader, DialogFooter component structure
- ❌ Animation classes (remove for Phase 2)

#### **Implementation Template**

**ModalPrimitive.svelte**:
```svelte
<script lang="ts">
  import { portal } from 'svelte-portal';
  import { clickOutside } from '$lib/actions';
  import type { Store } from '@composable-svelte/core';

  interface Props {
    store: Store<any, any> | null;
    onEscapeKeyDown?: (e: KeyboardEvent) => void;
    onPointerDownOutside?: (e: PointerEvent) => void;
  }

  let {
    store,
    onEscapeKeyDown,
    onPointerDownOutside
  }: Props = $props();

  const visible = $derived(store !== null);

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onEscapeKeyDown?.(e);
      if (!e.defaultPrevented) {
        store?.dispatch({ type: 'presented', action: { type: 'dismiss' } });
      }
    }
  }

  function handleClickOutside(e: PointerEvent) {
    onPointerDownOutside?.(e);
    if (!e.defaultPrevented) {
      store?.dispatch({ type: 'presented', action: { type: 'dismiss' } });
    }
  }
</script>

{#if visible}
  <div use:portal={'body'}>
    <!-- Overlay -->
    <div
      data-state={visible ? 'open' : 'closed'}
      onclick={handleClickOutside}
    >
      <slot name="overlay" />
    </div>

    <!-- Content -->
    <div
      role="dialog"
      aria-modal="true"
      data-state={visible ? 'open' : 'closed'}
      onkeydown={handleKeydown}
      use:clickOutside={handleClickOutside}
    >
      <slot />
    </div>
  </div>
{/if}
```

**Modal.svelte**:
```svelte
<script lang="ts">
  import ModalPrimitive from './primitives/ModalPrimitive.svelte';
  import type { Store } from '@composable-svelte/core';

  interface Props {
    store: Store<any, any> | null;
    unstyled?: boolean;
    class?: string;
  }

  let { store, unstyled = false, class: className = '' }: Props = $props();
</script>

<ModalPrimitive {store}>
  {#if !unstyled}
    <!-- Overlay - copied from shadcn -->
    <div slot="overlay" class="fixed inset-0 z-50 bg-black/80" />

    <!-- Content - copied from shadcn -->
    <div class="
      fixed left-[50%] top-[50%] z-50
      grid w-full max-w-lg
      translate-x-[-50%] translate-y-[-50%]
      gap-4 border bg-background p-6 shadow-lg
      sm:rounded-lg
      {className}
    ">
      <slot />
    </div>
  {:else}
    <slot />
  {/if}
</ModalPrimitive>
```

---

### Popover Component

#### **Sources**
- **Primitive**: `radix-ui/primitives/packages/react/popover/src/Popover.tsx`
- **Styled**: `shadcn/ui/apps/www/registry/new-york/ui/popover.tsx`
- **Positioning**: `@floating-ui/dom` (same library Radix uses)

#### **What to Copy**

**From Radix Popover**:
- ✅ Floating UI integration pattern
- ✅ Auto-positioning logic (flip, shift)
- ✅ Click outside to close
- ✅ Escape key to close
- ✅ Scroll/resize listeners for position updates

**From shadcn Popover**:
- ✅ Class string: `"z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md"`
- ✅ Arrow component structure (if used)
- ❌ Animation classes (remove for Phase 2)

#### **Key Dependencies**
```bash
npm install @floating-ui/dom
```

#### **Implementation Template**

**PopoverPrimitive.svelte**:
```svelte
<script lang="ts">
  import { portal } from 'svelte-portal';
  import { computePosition, flip, shift, offset, arrow } from '@floating-ui/dom';
  import type { Store } from '@composable-svelte/core';

  interface Props {
    store: Store<any, any> | null;
    anchor: HTMLElement;
    side?: 'top' | 'bottom' | 'left' | 'right';
    align?: 'start' | 'center' | 'end';
    sideOffset?: number;
  }

  let {
    store,
    anchor,
    side = 'bottom',
    align = 'center',
    sideOffset = 8
  }: Props = $props();

  let popoverRef: HTMLElement;
  const visible = $derived(store !== null);

  async function updatePosition() {
    if (!anchor || !popoverRef) return;

    // Copy Radix's Floating UI usage pattern
    const { x, y, placement } = await computePosition(anchor, popoverRef, {
      placement: `${side}-${align}` as any,
      middleware: [
        offset(sideOffset),
        flip(),
        shift({ padding: 8 })
      ]
    });

    Object.assign(popoverRef.style, {
      left: `${x}px`,
      top: `${y}px`,
    });
  }

  $effect(() => {
    if (visible) {
      updatePosition();

      // Update on scroll/resize (Radix pattern)
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);

      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  });
</script>

{#if visible}
  <div use:portal={'body'}>
    <div
      bind:this={popoverRef}
      role="dialog"
      style="position: absolute; top: 0; left: 0;"
    >
      <slot />
    </div>
  </div>
{/if}
```

**Popover.svelte**:
```svelte
<script lang="ts">
  import PopoverPrimitive from './primitives/PopoverPrimitive.svelte';
  import type { Store } from '@composable-svelte/core';

  interface Props {
    store: Store<any, any> | null;
    anchor: HTMLElement;
    side?: 'top' | 'bottom' | 'left' | 'right';
    unstyled?: boolean;
    class?: string;
  }

  let { store, anchor, side, unstyled = false, class: className = '' }: Props = $props();
</script>

<PopoverPrimitive {store} {anchor} {side}>
  {#if !unstyled}
    <!-- Copy shadcn classes -->
    <div class="
      z-50 w-72 rounded-md border
      bg-popover p-4 text-popover-foreground shadow-md
      {className}
    ">
      <slot />
    </div>
  {:else}
    <slot />
  {/if}
</PopoverPrimitive>
```

---

### Tabs Component

#### **Sources**
- **Primitive**: `radix-ui/primitives/packages/react/tabs/src/Tabs.tsx`
- **Styled**: `shadcn/ui/apps/www/registry/new-york/ui/tabs.tsx`

#### **What to Copy**

**From Radix Tabs**:
- ✅ Keyboard navigation (arrows, Home, End)
- ✅ ARIA roles (`tablist`, `tab`, `tabpanel`)
- ✅ Disabled tab skip logic
- ✅ Focus management

**From shadcn Tabs**:
- ✅ TabsList classes: `"inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground"`
- ✅ TabsTrigger classes: `"inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium"`
- ✅ Active state classes: `"data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"`
- ❌ Animation classes (remove for Phase 2)

#### **Implementation Template**

**TabsPrimitive.svelte**:
```svelte
<script lang="ts">
  interface Tab {
    id: string;
    label: string;
    disabled?: boolean;
  }

  interface Props {
    tabs: Tab[];
    activeTab: string;
    onTabChange?: (tabId: string) => void;
  }

  let { tabs, activeTab, onTabChange }: Props = $props();
  let tablistRef: HTMLElement;

  // Copy Radix keyboard navigation
  function handleKeydown(e: KeyboardEvent) {
    const tabElements = Array.from(
      tablistRef.querySelectorAll('[role="tab"]:not([disabled])')
    ) as HTMLElement[];

    const currentIndex = tabElements.indexOf(e.target as HTMLElement);
    let nextIndex = currentIndex;

    switch (e.key) {
      case 'ArrowLeft':
        nextIndex = currentIndex > 0 ? currentIndex - 1 : tabElements.length - 1;
        break;
      case 'ArrowRight':
        nextIndex = currentIndex < tabElements.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabElements.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    tabElements[nextIndex]?.focus();
    onTabChange?.(tabs[nextIndex].id);
  }
</script>

<div role="tablist" bind:this={tablistRef} onkeydown={handleKeydown}>
  {#each tabs as tab}
    <button
      role="tab"
      tabindex={activeTab === tab.id ? 0 : -1}
      aria-selected={activeTab === tab.id}
      disabled={tab.disabled}
      data-state={activeTab === tab.id ? 'active' : 'inactive'}
      onclick={() => onTabChange?.(tab.id)}
    >
      <slot name="tab" {tab} active={activeTab === tab.id}>
        {tab.label}
      </slot>
    </button>
  {/each}
</div>
```

**Tabs.svelte**:
```svelte
<script lang="ts">
  import TabsPrimitive from './primitives/TabsPrimitive.svelte';

  interface Props {
    tabs: Array<{ id: string; label: string; disabled?: boolean }>;
    activeTab: string;
    onTabChange?: (tabId: string) => void;
    unstyled?: boolean;
    class?: string;
  }

  let { tabs, activeTab, onTabChange, unstyled = false, class: className = '' }: Props = $props();
</script>

{#if !unstyled}
  <TabsPrimitive {tabs} {activeTab} {onTabChange}>
    <!-- Copy shadcn TabsList classes -->
    <div class="
      inline-flex h-10 items-center justify-center
      rounded-md bg-muted p-1 text-muted-foreground
      {className}
    ">
      {#snippet tab({ tab, active })}
        <!-- Copy shadcn TabsTrigger classes -->
        <span class="
          inline-flex items-center justify-center whitespace-nowrap
          rounded-sm px-3 py-1.5 text-sm font-medium
          ring-offset-background transition-all
          focus-visible:outline-none focus-visible:ring-2
          {active ? 'bg-background text-foreground shadow-sm' : ''}
        ">
          {tab.label}
        </span>
      {/snippet}
    </div>
  </TabsPrimitive>
{:else}
  <TabsPrimitive {tabs} {activeTab} {onTabChange}>
    <slot />
  </TabsPrimitive>
{/if}
```

---

### Sidebar Component

#### **Sources**
- **Primitive**: Custom (Radix doesn't have Sidebar, use Dialog patterns for drawer mode)
- **Styled**: `shadcn/ui/apps/www/registry/new-york/ui/sidebar.tsx` (if exists) or custom

**Note**: Sidebar is simpler than other components - mostly CSS-based.

#### **What to Copy**

**From shadcn** (if available):
- ✅ Sidebar width classes
- ✅ Collapse/expand classes
- ✅ Icon-only collapsed state
- ✅ Responsive breakpoint behavior

#### **Implementation Template**

**SidebarPrimitive.svelte**:
```svelte
<script lang="ts">
  interface Props {
    expanded: boolean;
    side?: 'left' | 'right';
    onToggle?: () => void;
  }

  let { expanded, side = 'left', onToggle }: Props = $props();
</script>

<aside
  data-state={expanded ? 'expanded' : 'collapsed'}
  data-side={side}
>
  <slot {expanded} />
</aside>
```

**Sidebar.svelte**:
```svelte
<script lang="ts">
  import SidebarPrimitive from './primitives/SidebarPrimitive.svelte';
  import DrawerPrimitive from './primitives/DrawerPrimitive.svelte';

  interface Props {
    expanded: boolean;
    side?: 'left' | 'right';
    unstyled?: boolean;
    class?: string;
  }

  let { expanded, side = 'left', unstyled = false, class: className = '' }: Props = $props();

  // Detect mobile
  let isMobile = $state(false);

  $effect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1024px)');
    isMobile = mediaQuery.matches;

    const handler = (e: MediaQueryListEvent) => isMobile = e.matches;
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  });
</script>

{#if !isMobile}
  <!-- Desktop: Persistent sidebar -->
  <SidebarPrimitive {expanded} {side}>
    {#if !unstyled}
      <aside class="
        fixed {side === 'left' ? 'left-0' : 'right-0'} top-0 z-40
        h-screen border-r bg-background
        {expanded ? 'w-64' : 'w-16'}
        transition-[width]
        {className}
      ">
        <slot {expanded} />
      </aside>
    {:else}
      <slot {expanded} />
    {/if}
  </SidebarPrimitive>
{:else}
  <!-- Mobile: Drawer overlay -->
  <DrawerPrimitive store={expanded ? {} : null} {side}>
    <slot expanded={true} />
  </DrawerPrimitive>
{/if}
```

---

## File Mapping Reference

### shadcn/ui Files → Our Components

| shadcn/ui File | Our Styled Component | Copy What |
|----------------|----------------------|-----------|
| `ui/dialog.tsx` | `Modal.svelte` | Tailwind classes, structure |
| `ui/sheet.tsx` | `Sheet.svelte` | Tailwind classes, structure |
| `ui/drawer.tsx` | `Drawer.svelte` | Tailwind classes (or use Vaul patterns) |
| `ui/popover.tsx` | `Popover.svelte` | Tailwind classes, arrow SVG |
| `ui/tabs.tsx` | `Tabs.svelte` | Tailwind classes, variants |
| `ui/alert-dialog.tsx` | `Alert.svelte` | Tailwind classes, button styles |
| `ui/sidebar.tsx` | `Sidebar.svelte` | Tailwind classes, responsive |

**Key Files to Copy Entirely**:
- `shadcn/ui/apps/www/app/globals.css` → Our `globals.css`
- `shadcn/ui/apps/www/tailwind.config.js` → Our `tailwind.config.ts`

### Radix UI Files → Our Primitives

| Radix File | Our Primitive | Copy What |
|------------|---------------|-----------|
| `dialog/src/Dialog.tsx` | `ModalPrimitive.svelte` | Logic, ARIA, keyboard |
| `dialog/src/Dialog.tsx` | `SheetPrimitive.svelte` | Same as Modal |
| `dialog/src/Dialog.tsx` | `DrawerPrimitive.svelte` | Same as Modal, side variant |
| `popover/src/Popover.tsx` | `PopoverPrimitive.svelte` | Positioning, flip logic |
| `tabs/src/Tabs.tsx` | `TabsPrimitive.svelte` | Keyboard nav, ARIA |
| `alert-dialog/src/AlertDialog.tsx` | `AlertPrimitive.svelte` | Same as Modal, simpler |
| `navigation-menu/src/NavigationMenu.tsx` | Reference for `NavigationStack` | Roving focus patterns |

**Utility Files to Reference**:
- `dismissable-layer/src/DismissableLayer.tsx` → Our `clickOutside` action
- `focus-scope/src/FocusScope.tsx` → Phase 5 (focus management)
- `portal/src/Portal.tsx` → Use `svelte-portal` instead

---

## Dependencies

### Required

```json
{
  "dependencies": {
    "@floating-ui/dom": "^1.5.0"
  },
  "peerDependencies": {
    "svelte": "^5.0.0",
    "tailwindcss": "^3.4.0"
  },
  "devDependencies": {
    "tailwindcss-animate": "^1.0.7"
  }
}
```

### Optional (for full feature parity)

```bash
# svelte-portal (if not using built-in Svelte 5 portals)
npm install svelte-portal

# For NavigationStack transitions (Phase 4)
npm install motion  # Motion One (if we use it)
```

---

## Licensing

### shadcn/ui

**License**: MIT
**URL**: https://github.com/shadcn-ui/ui/blob/main/LICENSE.md

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software...
```

✅ **We can**: Copy classes, adapt structure, reuse patterns
✅ **Attribution**: Not required, but nice to include in docs
✅ **Their philosophy**: Built to be copied (literally the point of shadcn)

### Radix UI

**License**: MIT
**URL**: https://github.com/radix-ui/primitives/blob/main/LICENSE

```
MIT License
Copyright (c) 2022 WorkOS
[Same MIT terms as above]
```

✅ **We can**: Adapt logic, reference patterns, translate React → Svelte
✅ **Attribution**: Not required, but good practice
✅ **Derivative works**: Allowed (our Svelte adaptation is derivative)

### Our Attribution

Suggested credit in our docs:

```markdown
## Inspiration & Credits

Our styled components are heavily inspired by:
- **shadcn/ui** (https://ui.shadcn.com) - Tailwind styling and component design
- **Radix UI** (https://radix-ui.com) - Accessibility patterns and primitive logic

Both projects are MIT licensed and designed for adaptation and reuse.
```

---

## Implementation Checklist

### Initial Setup

- [ ] Copy `shadcn/ui/apps/www/app/globals.css` → `packages/core/src/styles/globals.css`
- [ ] Copy `shadcn/ui/apps/www/tailwind.config.js` → `packages/core/tailwind.config.ts` (adapt paths)
- [ ] Install dependencies: `npm install @floating-ui/dom svelte-portal`
- [ ] Install dev deps: `npm install -D tailwindcss-animate`
- [ ] Create `packages/core/src/lib/actions/clickOutside.ts` (adapt from Radix DismissableLayer)

### Per Component (Repeat for each)

#### Primitive Component
- [ ] Create `[Component]Primitive.svelte` file
- [ ] Reference corresponding Radix primitive file
- [ ] Copy accessibility attributes (ARIA roles, etc.)
- [ ] Adapt keyboard handling logic (React → Svelte)
- [ ] Add portal using `svelte-portal` or Svelte 5 built-in
- [ ] Add click-outside detection (use `clickOutside` action)
- [ ] Integrate with store prop (visibility based on `store !== null`)
- [ ] Dispatch actions instead of callbacks

#### Styled Component
- [ ] Create `[Component].svelte` file
- [ ] Reference corresponding shadcn component file
- [ ] Copy HTML structure (JSX → Svelte)
- [ ] Copy Tailwind classes verbatim
- [ ] Remove animation classes (mark `// TODO Phase 4`)
- [ ] Add `unstyled` prop logic
- [ ] Add `class` prop for overrides
- [ ] Wrap primitive component
- [ ] Test with default styling
- [ ] Test with `unstyled={true}`

#### Testing
- [ ] Test primitive shows/hides based on store
- [ ] Test keyboard navigation
- [ ] Test click-outside behavior
- [ ] Test styled appearance matches shadcn
- [ ] Test `unstyled` prop works
- [ ] Test responsive behavior (if applicable)

---

## Quick Reference

### Common Patterns

#### **Portal to Body**
```svelte
<script>
  import { portal } from 'svelte-portal';
</script>

<div use:portal={'body'}>
  <!-- content -->
</div>
```

#### **Click Outside**
```typescript
// lib/actions/clickOutside.ts
export function clickOutside(node: HTMLElement, callback: () => void) {
  function handleClick(event: MouseEvent) {
    if (!node.contains(event.target as Node)) {
      callback();
    }
  }

  setTimeout(() => {
    document.addEventListener('pointerdown', handleClick);
  }, 0);

  return {
    destroy() {
      document.removeEventListener('pointerdown', handleClick);
    }
  };
}
```

#### **Escape Key Handler**
```svelte
<script>
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onEscapeKeyDown?.(e);
      if (!e.defaultPrevented) {
        store?.dispatch({ type: 'dismiss' });
      }
    }
  }
</script>

<div onkeydown={handleKeydown}>
```

#### **Floating UI Positioning**
```typescript
import { computePosition, flip, shift, offset } from '@floating-ui/dom';

async function updatePosition() {
  const { x, y } = await computePosition(anchor, popover, {
    placement: side,
    middleware: [offset(8), flip(), shift({ padding: 8 })]
  });

  Object.assign(popover.style, { left: `${x}px`, top: `${y}px` });
}
```

---

## Tips & Best Practices

1. **Start with Modal**: Establish the pattern with one component, then replicate
2. **Comment animations**: Mark removed animation classes with `// Phase 4: Add animations`
3. **Test unstyled mode**: Ensure primitives work without any styling
4. **Check responsive**: Test mobile breakpoints for responsive components (Sidebar)
5. **Validate accessibility**: Run axe DevTools on each component
6. **Reference often**: Keep shadcn and Radix tabs open while implementing
7. **Copy, don't type**: Literally copy-paste Tailwind classes to avoid typos
8. **Test with real store**: Use actual store state, not just `null` checks

---

**Next Steps**: Reference this guide while implementing each component in Task 2.5.x
