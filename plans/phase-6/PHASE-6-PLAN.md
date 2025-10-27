# Phase 6: Complete Component Library

**Status**: Planning
**Execute**: BEFORE Phase 5 (Polish/Documentation)
**Timeline**: 4-5 weeks
**Goal**: Build a complete, reducer-driven component library showcasing Composable Architecture

---

## Table of Contents

1. [Vision & Principles](#vision--principles)
2. [Component Architecture](#component-architecture)
3. [Styling Strategy](#styling-strategy)
4. [Animation Strategy](#animation-strategy)
5. [Distribution Strategy](#distribution-strategy)
6. [Component Catalog](#component-catalog)
7. [Advanced Components](#advanced-components)
8. [Implementation Roadmap](#implementation-roadmap)
9. [Testing Strategy](#testing-strategy)
10. [Success Criteria](#success-criteria)

## Related Documents

- **[Form System Design](./FORM-SYSTEM-DESIGN.md)** - Detailed design for reducer-driven form system with Zod validation integration (critical for Phase 6 Week 2)

---

## Vision & Principles

### Core Vision

Build a **complete component library** that:
1. **Fully showcases Composable Architecture** - not just a UI library with state management bolted on
2. **Provides both atomic and complex components** - from Button to DataTable
3. **Makes complex state management trivial** - that's the differentiator
4. **Teaches best practices** through exemplary implementations
5. **Ready for production** - not toys, but real tools

### Architectural Principles

1. **"Reducer-first for stateful, composable-first for atomic"**
   - Complex state → Reducers with effects
   - Simple UI → Props with optional action dispatch

2. **"Animation through Motion One, never CSS"**
   - All animations via our Phase 4 animation system
   - No CSS transitions or keyframe animations
   - Consistent timing and spring physics

3. **"Open and modifiable by default"**
   - Users own the code (copy-paste or import)
   - Full customization possible
   - No hidden magic

4. **"Integrate with parent reducers seamlessly"**
   - Atomic components can dispatch to parent
   - Stateful components expose reducer patterns
   - Clear integration examples

5. **"Third-party wrappers stay thin"**
   - Wrap external libraries (D3, Tiptap) with reducer state
   - Don't reinvent what exists
   - Focus on state management integration

---

## Component Architecture

### Three-Tier System

```
┌─────────────────────────────────────────────────────────────┐
│ TIER 1: ATOMIC COMPONENTS (~20 components)                  │
│ Presentational, no internal state, dispatch to parent       │
│ Examples: Button, Card, Badge, Avatar, Label, Input, etc.   │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ TIER 2: STATEFUL COMPONENTS (~15 components)                │
│ Reducer-driven, effects, TestStore tested                   │
│ Examples: Form, DataTable, Command, Combobox, Calendar      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ TIER 3: ADVANCED WRAPPERS (~5 components)                   │
│ Third-party library + reducer state management              │
│ Examples: Chart (D3), RichText (Tiptap), Code (CodeMirror)  │
└─────────────────────────────────────────────────────────────┘
```

### Tier 1: Atomic Components

**Philosophy**: Simple, composable, action-ready

**Characteristics**:
- No internal state (all via props)
- Can dispatch actions to parent reducer
- Styled with Tailwind
- Animated via Motion One when needed
- Accessible by default (ARIA)

**Example: Button**
```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Dispatch } from '@composable-svelte/core';

  interface ButtonProps<Action> {
    variant?: 'default' | 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    loading?: boolean;

    // Composable Architecture integration
    action?: Action;
    dispatch?: Dispatch<Action>;

    // Or traditional event handlers
    onclick?: (e: MouseEvent) => void;

    children: Snippet;
  }

  let {
    variant = 'default',
    size = 'md',
    disabled = false,
    loading = false,
    action,
    dispatch,
    onclick,
    children
  }: ButtonProps<unknown> = $props();

  function handleClick(e: MouseEvent) {
    if (loading || disabled) return;

    // Composable Architecture: dispatch action
    if (action && dispatch) {
      dispatch(action);
    }

    // Traditional: call event handler
    onclick?.(e);
  }
</script>

<button
  class={/* Tailwind classes based on variant/size */}
  disabled={disabled || loading}
  onclick={handleClick}
>
  {#if loading}
    <Spinner />
  {/if}
  {@render children()}
</button>
```

**Usage Patterns**:

```svelte
<!-- Pattern 1: Dispatch to parent reducer -->
<Button
  action={{ type: 'saveButtonTapped' }}
  dispatch={store.dispatch}
>
  Save
</Button>

<!-- Pattern 2: Traditional event handler -->
<Button onclick={() => console.log('clicked')}>
  Click Me
</Button>

<!-- Pattern 3: Inline action dispatch -->
<Button onclick={() => store.dispatch({ type: 'deleteItem', id })}>
  Delete
</Button>
```

### Tier 2: Stateful Components

**Philosophy**: Reducer-first, effect-powered, production-ready

**Characteristics**:
- State managed by reducer
- Side effects via Effect system
- TestStore comprehensive coverage
- Can be standalone OR integrated into parent
- Animation via Motion One
- Fully documented patterns

**Example: Form Component**

**File Structure**:
```
components/form/
├── form.reducer.ts       # FormState + reducer + effects
├── Form.svelte           # Main form component
├── FormField.svelte      # Field wrapper
├── FormItem.svelte       # Item with label/error
├── form.test.ts          # TestStore tests
└── examples/
    ├── ContactForm.svelte
    └── MultiStepForm.svelte
```

**Reducer** (`form.reducer.ts`):
```typescript
// State
interface FormState<T> {
  fields: Record<keyof T, FieldState>;
  validationErrors: ValidationError[];
  isValidating: boolean;
  isSubmitting: boolean;
  submitAttempts: number;
  submitError: string | null;
}

interface FieldState {
  value: unknown;
  touched: boolean;
  dirty: boolean;
  error: string | null;
  isValidating: boolean;
}

// Actions
type FormAction<T> =
  | { type: 'fieldChanged'; field: keyof T; value: unknown }
  | { type: 'fieldBlurred'; field: keyof T }
  | { type: 'fieldValidationStarted'; field: keyof T }
  | { type: 'fieldValidationCompleted'; field: keyof T; error: string | null }
  | { type: 'submitButtonTapped' }
  | { type: 'validationCompleted'; errors: ValidationError[] }
  | { type: 'submissionStarted' }
  | { type: 'submissionSucceeded' }
  | { type: 'submissionFailed'; error: string }
  | { type: 'resetForm' };

// Reducer
const formReducer = <T>(
  state: FormState<T>,
  action: FormAction<T>,
  deps: FormDependencies<T>
): [FormState<T>, Effect<FormAction<T>>] => {
  switch (action.type) {
    case 'fieldChanged': {
      const newState = {
        ...state,
        fields: {
          ...state.fields,
          [action.field]: {
            ...state.fields[action.field],
            value: action.value,
            dirty: true,
            error: null // Clear error on change
          }
        }
      };

      // Debounced validation effect
      return [
        newState,
        Effect.afterDelay(300, (dispatch) => {
          dispatch({
            type: 'fieldValidationStarted',
            field: action.field
          });
        })
      ];
    }

    case 'fieldValidationStarted': {
      const fieldValue = state.fields[action.field].value;
      const validator = deps.validators[action.field];

      return [
        {
          ...state,
          fields: {
            ...state.fields,
            [action.field]: {
              ...state.fields[action.field],
              isValidating: true
            }
          }
        },
        Effect.run(async (dispatch) => {
          try {
            await validator(fieldValue);
            dispatch({
              type: 'fieldValidationCompleted',
              field: action.field,
              error: null
            });
          } catch (error) {
            dispatch({
              type: 'fieldValidationCompleted',
              field: action.field,
              error: error.message
            });
          }
        })
      ];
    }

    case 'submitButtonTapped': {
      // Validate all fields
      return [
        { ...state, isValidating: true },
        Effect.run(async (dispatch) => {
          const errors = await deps.validateAll(state.fields);
          dispatch({ type: 'validationCompleted', errors });
        })
      ];
    }

    case 'validationCompleted': {
      if (action.errors.length > 0) {
        return [
          {
            ...state,
            isValidating: false,
            validationErrors: action.errors,
            submitAttempts: state.submitAttempts + 1
          },
          Effect.none()
        ];
      }

      // No errors, proceed to submit
      return [
        { ...state, isValidating: false },
        Effect.batch(
          Effect.fireAndForget((dispatch) => {
            dispatch({ type: 'submissionStarted' });
          })
        )
      ];
    }

    case 'submissionStarted': {
      return [
        { ...state, isSubmitting: true, submitError: null },
        Effect.run(async (dispatch) => {
          try {
            await deps.onSubmit(/* form data */);
            dispatch({ type: 'submissionSucceeded' });
          } catch (error) {
            dispatch({
              type: 'submissionFailed',
              error: error.message
            });
          }
        })
      ];
    }

    // ... more cases
  }
};
```

**Component** (`Form.svelte`):
```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { formReducer } from './form.reducer';
  import type { Snippet } from 'svelte';

  interface FormProps<T> {
    initialState: T;
    validators: Validators<T>;
    onSubmit: (data: T) => Promise<void>;
    children: Snippet<{ store: Store<FormState<T>, FormAction<T>> }>;
  }

  let { initialState, validators, onSubmit, children }: FormProps<unknown> = $props();

  // Create form store
  const store = createStore({
    initialState: createInitialFormState(initialState),
    reducer: formReducer,
    dependencies: { validators, onSubmit, validateAll }
  });
</script>

<form onsubmit|preventDefault={() => store.dispatch({ type: 'submitButtonTapped' })}>
  {@render children({ store })}
</form>
```

**Usage**:
```svelte
<script lang="ts">
  import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, Button, Input } from '@composable-svelte/core/components';

  interface ContactFormData {
    name: string;
    email: string;
    message: string;
  }

  const validators = {
    name: (value: string) => {
      if (!value) throw new Error('Name is required');
      if (value.length < 2) throw new Error('Name too short');
    },
    email: async (value: string) => {
      if (!value) throw new Error('Email is required');
      if (!isValidEmail(value)) throw new Error('Invalid email');
      // Async validation
      const available = await checkEmailAvailable(value);
      if (!available) throw new Error('Email already taken');
    },
    message: (value: string) => {
      if (!value) throw new Error('Message is required');
    }
  };

  async function handleSubmit(data: ContactFormData) {
    await fetch('/api/contact', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
</script>

<Form
  initialState={{ name: '', email: '', message: '' }}
  validators={validators}
  onSubmit={handleSubmit}
>
  {#snippet children({ store })}
    <FormField name="name" {store}>
      <FormItem>
        <FormLabel>Name</FormLabel>
        <FormControl>
          <Input
            value={store.state.fields.name.value}
            action={{ type: 'fieldChanged', field: 'name', value: $bindable }}
            dispatch={store.dispatch}
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField name="email" {store}>
      <FormItem>
        <FormLabel>Email</FormLabel>
        <FormControl>
          <Input
            type="email"
            value={store.state.fields.email.value}
            action={{ type: 'fieldChanged', field: 'email', value: $bindable }}
            dispatch={store.dispatch}
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField name="message" {store}>
      <FormItem>
        <FormLabel>Message</FormLabel>
        <FormControl>
          <Textarea
            value={store.state.fields.message.value}
            action={{ type: 'fieldChanged', field: 'message', value: $bindable }}
            dispatch={store.dispatch}
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <Button
      type="submit"
      loading={store.state.isSubmitting}
      disabled={store.state.isValidating}
    >
      Submit
    </Button>
  {/snippet}
</Form>
```

### Tier 3: Advanced Wrappers

**Philosophy**: Thin reducer layer over powerful third-party libraries

**Characteristics**:
- Wrap existing mature libraries (D3, Tiptap, CodeMirror, etc.)
- Add reducer state management
- Expose effect patterns
- Focus on integration, not reimplementation

**Example: Chart Component (D3 Wrapper)**

**Structure**:
```
components/chart/
├── chart.reducer.ts      # Chart state + interactions
├── Chart.svelte          # D3 integration
├── chart.test.ts
└── examples/
    ├── LineChart.svelte
    ├── BarChart.svelte
    └── InteractiveChart.svelte
```

**Reducer** (`chart.reducer.ts`):
```typescript
interface ChartState {
  data: DataPoint[];
  selectedPoints: Set<string>;
  hoveredPoint: string | null;
  zoom: { scale: number; x: number; y: number };
  isLoading: boolean;
}

type ChartAction =
  | { type: 'dataLoaded'; data: DataPoint[] }
  | { type: 'pointHovered'; id: string | null }
  | { type: 'pointClicked'; id: string }
  | { type: 'zoomed'; scale: number; x: number; y: number }
  | { type: 'resetZoom' };

// Reducer manages state, D3 handles rendering
const chartReducer = (state, action, deps) => {
  switch (action.type) {
    case 'pointClicked': {
      const newSelected = new Set(state.selectedPoints);
      if (newSelected.has(action.id)) {
        newSelected.delete(action.id);
      } else {
        newSelected.add(action.id);
      }

      return [
        { ...state, selectedPoints: newSelected },
        Effect.none()
      ];
    }

    case 'zoomed': {
      return [
        {
          ...state,
          zoom: { scale: action.scale, x: action.x, y: action.y }
        },
        Effect.none()
      ];
    }

    // ... more cases
  }
};
```

**Component** (`Chart.svelte`):
```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { chartReducer } from './chart.reducer';
  import * as d3 from 'd3';
  import { onMount } from 'svelte';

  interface ChartProps {
    data: DataPoint[];
    width: number;
    height: number;
  }

  let { data, width, height }: ChartProps = $props();

  const store = createStore({
    initialState: {
      data,
      selectedPoints: new Set(),
      hoveredPoint: null,
      zoom: { scale: 1, x: 0, y: 0 },
      isLoading: false
    },
    reducer: chartReducer,
    dependencies: {}
  });

  let svgElement: SVGSVGElement;

  // React to state changes and update D3 visualization
  $effect(() => {
    if (!svgElement) return;

    const svg = d3.select(svgElement);

    // D3 rendering based on state
    const { data, selectedPoints, hoveredPoint, zoom } = store.state;

    // Update scales with zoom
    const xScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.x))
      .range([0, width])
      .nice();

    const yScale = d3.scaleLinear()
      .domain(d3.extent(data, d => d.y))
      .range([height, 0])
      .nice();

    // Apply zoom transform
    const zoomTransform = d3.zoomIdentity
      .translate(zoom.x, zoom.y)
      .scale(zoom.scale);

    const zoomedXScale = zoomTransform.rescaleX(xScale);
    const zoomedYScale = zoomTransform.rescaleY(yScale);

    // Render points
    svg.selectAll('circle')
      .data(data)
      .join('circle')
      .attr('cx', d => zoomedXScale(d.x))
      .attr('cy', d => zoomedYScale(d.y))
      .attr('r', d => {
        if (selectedPoints.has(d.id)) return 8;
        if (hoveredPoint === d.id) return 6;
        return 4;
      })
      .attr('fill', d => {
        if (selectedPoints.has(d.id)) return 'var(--color-primary)';
        if (hoveredPoint === d.id) return 'var(--color-accent)';
        return 'var(--color-foreground)';
      })
      .on('mouseenter', (event, d) => {
        store.dispatch({ type: 'pointHovered', id: d.id });
      })
      .on('mouseleave', () => {
        store.dispatch({ type: 'pointHovered', id: null });
      })
      .on('click', (event, d) => {
        store.dispatch({ type: 'pointClicked', id: d.id });
      });

    // Setup zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.5, 10])
      .on('zoom', (event) => {
        store.dispatch({
          type: 'zoomed',
          scale: event.transform.k,
          x: event.transform.x,
          y: event.transform.y
        });
      });

    svg.call(zoom);
  });
</script>

<svg bind:this={svgElement} {width} {height}></svg>
```

---

## Styling Strategy

### Decision: **CSS Variables + Tailwind CSS**

**Rationale**:
- CSS Variables for theming (colors, spacing, radii, etc.)
- Tailwind for utility classes and rapid development
- Scoped `<style>` blocks for component-specific styles when needed
- No CSS-in-JS libraries (adds complexity, bundle size)

### Theme System

**CSS Variables** (`theme.css`):
```css
:root {
  /* Colors */
  --color-background: 0 0% 100%;
  --color-foreground: 222.2 84% 4.9%;
  --color-card: 0 0% 100%;
  --color-card-foreground: 222.2 84% 4.9%;
  --color-popover: 0 0% 100%;
  --color-popover-foreground: 222.2 84% 4.9%;
  --color-primary: 222.2 47.4% 11.2%;
  --color-primary-foreground: 210 40% 98%;
  --color-secondary: 210 40% 96.1%;
  --color-secondary-foreground: 222.2 47.4% 11.2%;
  --color-muted: 210 40% 96.1%;
  --color-muted-foreground: 215.4 16.3% 46.9%;
  --color-accent: 210 40% 96.1%;
  --color-accent-foreground: 222.2 47.4% 11.2%;
  --color-destructive: 0 84.2% 60.2%;
  --color-destructive-foreground: 210 40% 98%;
  --color-border: 214.3 31.8% 91.4%;
  --color-input: 214.3 31.8% 91.4%;
  --color-ring: 222.2 84% 4.9%;

  /* Radii */
  --radius-sm: 0.125rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --radius-xl: 0.75rem;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);

  /* Transitions */
  --transition-duration: 150ms;
  --transition-timing: cubic-bezier(0.4, 0, 0.2, 1);
}

.dark {
  --color-background: 222.2 84% 4.9%;
  --color-foreground: 210 40% 98%;
  /* ... dark mode overrides */
}
```

**Tailwind Config** (`tailwind.config.js`):
```javascript
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--color-background))',
        foreground: 'hsl(var(--color-foreground))',
        card: 'hsl(var(--color-card))',
        // ... map all CSS variables
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
    },
  },
};
```

### Component Styling Pattern

**Atomic Components**: Pure Tailwind classes
```svelte
<button
  class="
    inline-flex items-center justify-center
    rounded-md text-sm font-medium
    transition-colors focus-visible:outline-none
    focus-visible:ring-2 focus-visible:ring-ring
    disabled:pointer-events-none disabled:opacity-50
    {variantClasses[variant]}
    {sizeClasses[size]}
  "
>
  {@render children()}
</button>
```

**Stateful Components**: Tailwind + scoped styles when needed
```svelte
<script>
  // ...
</script>

<div class="data-table rounded-md border">
  <table class="w-full caption-bottom text-sm">
    <!-- ... -->
  </table>
</div>

<style>
  /* Component-specific styles that can't be done with Tailwind */
  .data-table :global(.row-selected) {
    background: hsl(var(--color-accent) / 0.5);
  }
</style>
```

### Dark Mode Support

**Implementation**: Use Tailwind's `dark:` variant
```svelte
<div class="bg-background text-foreground dark:bg-background dark:text-foreground">
  <!-- Content automatically adapts -->
</div>
```

**Toggle**: Provide a theme switcher utility
```typescript
// theme.svelte.ts
export function useTheme() {
  let theme = $state<'light' | 'dark' | 'system'>('system');

  function setTheme(newTheme: 'light' | 'dark' | 'system') {
    theme = newTheme;

    if (newTheme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.classList.toggle('dark', systemTheme === 'dark');
    } else {
      document.documentElement.classList.toggle('dark', newTheme === 'dark');
    }

    localStorage.setItem('theme', newTheme);
  }

  return { theme, setTheme };
}
```

---

## Animation Strategy

### Decision: **Motion One Only (Phase 4 System)**

**Rationale**:
- Consistent timing and physics across all components
- Spring-based animations (natural, premium feel)
- Integration with our `PresentationState` system
- No CSS transitions/animations (inconsistent, less control)

### Animation Patterns

**Pattern 1: Navigation Component Animations** (Already implemented in Phase 4)
```typescript
// Modal, Sheet, Drawer, Alert all use this pattern
$effect(() => {
  if (!presentation || !contentElement || !backdropElement) return;

  if (presentation.status === 'presenting') {
    Promise.all([
      animateModalIn(contentElement, springConfig),
      animateBackdropIn(backdropElement)
    ]).then(() => {
      onPresentationComplete?.();
    });
  }

  if (presentation.status === 'dismissing') {
    Promise.all([
      animateModalOut(contentElement, springConfig),
      animateBackdropOut(backdropElement)
    ]).then(() => {
      onDismissalComplete?.();
    });
  }
});
```

**Pattern 2: Atomic Component Interactions**
```typescript
// Button press animation
import { animate, spring } from 'motion';

function handlePress(element: HTMLElement) {
  animate(
    element,
    { scale: [1, 0.95, 1] },
    {
      type: 'spring',
      visualDuration: 0.2,
      bounce: 0.4
    }
  );
}
```

**Pattern 3: Stateful Component Transitions**
```typescript
// Toast enter/exit animations
export async function animateToastIn(
  element: HTMLElement,
  position: 'top' | 'bottom' = 'top'
): Promise<void> {
  const yStart = position === 'top' ? -100 : 100;

  await animate(
    element,
    {
      opacity: [0, 1],
      y: [yStart, 0]
    },
    {
      type: 'spring',
      visualDuration: 0.4,
      bounce: 0.3
    }
  ).finished;
}

export async function animateToastOut(
  element: HTMLElement,
  position: 'top' | 'bottom' = 'top'
): Promise<void> {
  const yEnd = position === 'top' ? -100 : 100;

  await animate(
    element,
    {
      opacity: [1, 0],
      y: [0, yEnd]
    },
    {
      type: 'spring',
      visualDuration: 0.3,
      bounce: 0.2
    }
  ).finished;
}
```

**Pattern 4: List Animations (Add/Remove)**
```typescript
// DataTable row animations
export async function animateRowIn(element: HTMLElement): Promise<void> {
  await animate(
    element,
    {
      opacity: [0, 1],
      scale: [0.95, 1]
    },
    {
      type: 'spring',
      visualDuration: 0.3,
      bounce: 0.25
    }
  ).finished;
}

export async function animateRowOut(element: HTMLElement): Promise<void> {
  await animate(
    element,
    {
      opacity: [1, 0],
      scale: [1, 0.95],
      x: [0, 20] // Slide out
    },
    {
      type: 'spring',
      visualDuration: 0.25,
      bounce: 0.15
    }
  ).finished;
}
```

### Animation Configuration

**Extend Phase 4 spring presets**:
```typescript
// animation/spring-config.ts (extend existing)
export const springPresets = {
  // Phase 4 presets
  modal: { visualDuration: 0.3, bounce: 0.25 },
  sheet: { visualDuration: 0.35, bounce: 0.3 },
  drawer: { visualDuration: 0.35, bounce: 0.25 },
  alert: { visualDuration: 0.25, bounce: 0.2 },

  // Phase 6 additions
  toast: { visualDuration: 0.4, bounce: 0.3 },
  dropdown: { visualDuration: 0.2, bounce: 0.2 },
  popover: { visualDuration: 0.25, bounce: 0.25 },
  tooltip: { visualDuration: 0.15, bounce: 0.1 },
  button: { visualDuration: 0.2, bounce: 0.4 },
  listItem: { visualDuration: 0.3, bounce: 0.25 },
  collapse: { visualDuration: 0.35, bounce: 0.25 },
} as const;
```

### NO CSS Animations

**❌ Never do this**:
```css
/* BAD - inconsistent with our animation system */
.button {
  transition: all 150ms ease-in-out;
}

.toast {
  animation: slide-in 300ms ease-out;
}

@keyframes slide-in {
  from { transform: translateY(-100%); }
  to { transform: translateY(0); }
}
```

**✅ Always do this**:
```typescript
// GOOD - uses Motion One
import { animate, spring } from 'motion';
import { springPresets } from '@composable-svelte/core/animation';

await animate(
  element,
  { y: [-100, 0] },
  {
    type: 'spring',
    ...springPresets.toast
  }
).finished;
```

---

## Distribution Strategy

### Decision: **Hybrid Approach**

Combine the best of both worlds:
1. **NPM Package** for core architecture (stores, effects, reducers)
2. **Copy-Paste** for components (full customization)

### Why Hybrid?

| Approach | Pros | Cons | Our Use Case |
|----------|------|------|--------------|
| **NPM Package** | Easy to install, version management, updates | Hard to customize, users don't own code | **Core architecture** (store, effects, navigation) |
| **Copy-Paste** | Full customization, no dependencies, transparent | No updates, manual copying, version drift | **Components** (UI, styling, specific implementations) |
| **Hybrid** | Easy core + customizable UI | Slightly more complex setup | **✅ Best fit** - stable core, flexible UI |

### Package Structure

```
@composable-svelte/core (NPM package)
├── store/                    # Core architecture
├── effect/
├── navigation/
├── animation/
└── test/

@composable-svelte/cli (NPM package)
└── Commands for copying components

Component Registry (GitHub/Docs site)
└── Copy-paste component source code
```

### Installation Flow

**Step 1: Install core package**
```bash
npm install @composable-svelte/core
```

**Step 2: Install CLI (optional)**
```bash
npm install -D @composable-svelte/cli
```

**Step 3: Initialize project**
```bash
npx composable-svelte init
```
This sets up:
- Tailwind config with CSS variables
- Theme CSS file
- Component directory structure
- tsconfig paths

**Step 4: Add components**
```bash
npx composable-svelte add button card form
```
This copies component source code to your project:
```
src/components/ui/
├── button.svelte
├── card.svelte
└── form/
    ├── Form.svelte
    ├── FormField.svelte
    ├── form.reducer.ts
    └── form.test.ts
```

**Step 5: Customize freely**
- Edit components directly
- Change styling
- Modify reducers
- Add features

### Component Registry

**Hosted on docs site**:
```
https://composable-svelte.dev/components/button
https://composable-svelte.dev/components/form
https://composable-svelte.dev/components/data-table
```

Each component page shows:
- Live demo
- Source code (copy button)
- Installation command
- API documentation
- Usage examples
- Integration patterns

### Versioning Strategy

**Core Package**: Semantic versioning
- Major: Breaking changes to store/effect API
- Minor: New features, new components
- Patch: Bug fixes

**Components**: Timestamped versions
- Each component has "Last updated" timestamp
- CLI tracks versions in `components.json`
- Users can update individual components or all at once

```bash
# Update all components
npx composable-svelte update

# Update specific component
npx composable-svelte update button

# See available updates
npx composable-svelte status
```

### What Goes Where?

**NPM Package** (`@composable-svelte/core`):
- ✅ Store implementation
- ✅ Effect system
- ✅ Reducer operators (scope, ifLet, etc.)
- ✅ Navigation types and utilities
- ✅ Animation system and spring configs
- ✅ TestStore
- ✅ Type utilities

**Copy-Paste** (Component registry):
- ✅ All UI components (Button, Card, Input, etc.)
- ✅ All stateful components (Form, DataTable, etc.)
- ✅ Component reducers
- ✅ Component styles
- ✅ Integration examples

**Why?**
- Core API is stable, rarely changes → safe to version
- Components are customizable, styling changes → users own code
- Best of both: reliable foundation + flexible implementation

---

## Component Catalog

### Complete Component List (50+ components)

#### **Tier 1: Atomic Components (20 components)**

**Layout**
1. Card - Container with header/footer
2. Panel - Generic content container
3. Box - Primitive box with padding/margin
4. Separator - Visual divider (horizontal/vertical)
5. Aspect Ratio - Maintain aspect ratio

**Typography**
6. Heading - H1-H6 with consistent styling
7. Text - Paragraph text with variants
8. Label - Form labels
9. Kbd - Keyboard key display

**Buttons & Actions**
10. Button - Primary action button
11. Button Group - Multiple buttons together
12. Icon Button - Button with icon only
13. Link Button - Button styled as link

**Form Inputs**
14. Input - Text input field
15. Textarea - Multi-line text input
16. Checkbox - Boolean checkbox
17. Radio - Radio button
18. Switch - Toggle switch

**Feedback & Status**
19. Badge - Status indicator
20. Avatar - User avatar image
21. Skeleton - Loading placeholder
22. Progress - Progress bar
23. Spinner - Loading spinner

**Visual**
24. Alert - Static informational message
25. Empty - Empty state placeholder

#### **Tier 2: Stateful Components (15 components)**

**Navigation & Overlays** (Extend Phase 2/4)
26. Modal ✅ - Centered dialog
27. Sheet ✅ - Sliding panel (bottom/left/right)
28. Drawer ✅ - Side navigation panel
29. Alert Dialog ✅ - Confirmation modal
30. Popover - Floating content box
31. Tooltip - Hover information
32. Dropdown Menu - Contextual menu
33. Context Menu - Right-click menu
34. Hover Card - Hover-triggered card

**Forms & Input**
35. **Form** - Form with validation reducer ([Design Doc](./FORM-SYSTEM-DESIGN.md))
36. Select - Dropdown select
37. **Combobox** - Searchable autocomplete
38. Slider - Range slider
39. Date Picker - **Calendar** reducer + picker

**Content Organization**
40. **Tabs** - Tabbed content (with state)
41. **Accordion** - Expandable sections
42. Collapsible - Toggleable content
43. **Tree View** - Hierarchical navigation

**Data Display**
44. **Data Table** - Sortable/filterable table
45. Pagination - Page navigation

**Feedback**
46. **Toast** - Notification queue reducer
47. **Command Palette** - Command + search reducer

**Upload & Media**
48. **File Upload** - Multi-file upload with progress
49. Carousel - Image carousel with state

**Advanced**
50. **Infinite Scroll** - Pagination + loading reducer

#### **Tier 3: Advanced Wrappers (5 components)**

51. **Chart** - D3.js wrapper with interaction state
52. **Rich Text Editor** - Tiptap wrapper with document state
53. **Code Editor** - CodeMirror wrapper with editor state
54. **Markdown Editor** - Markdown + preview with state
55. **Kanban Board** - Drag-drop board with column/card state

---

## Advanced Components

### Strategy for Third-Party Integrations

**Principle**: Thin reducer wrapper, delegate rendering to mature libraries

**Pattern**:
1. Identify state that should be managed by reducer
2. Identify interactions that should be actions
3. Identify side effects that should be effects
4. Let the library handle rendering/DOM

### Example: Rich Text Editor (Tiptap)

**File Structure**:
```
components/rich-text-editor/
├── editor.reducer.ts         # Editor state management
├── RichTextEditor.svelte     # Tiptap integration
├── Toolbar.svelte            # Editor toolbar
├── editor.test.ts
└── examples/
    └── DocumentEditor.svelte
```

**State Management**:
```typescript
// editor.reducer.ts
interface EditorState {
  content: JSONContent;
  selection: { from: number; to: number };
  isSaving: boolean;
  lastSaved: Date | null;
  isCollaborating: boolean;
  activeUsers: User[];
}

type EditorAction =
  | { type: 'contentChanged'; content: JSONContent }
  | { type: 'selectionChanged'; from: number; to: number }
  | { type: 'saveTriggered' }
  | { type: 'saveCompleted' }
  | { type: 'userJoined'; user: User }
  | { type: 'userLeft'; userId: string }
  | { type: 'boldButtonTapped' }
  | { type: 'italicButtonTapped' }
  | { type: 'headingButtonTapped'; level: number };

const editorReducer = (state, action, deps) => {
  switch (action.type) {
    case 'contentChanged': {
      return [
        { ...state, content: action.content },
        Effect.afterDelay(1000, (dispatch) => {
          dispatch({ type: 'saveTriggered' });
        })
      ];
    }

    case 'saveTriggered': {
      return [
        { ...state, isSaving: true },
        Effect.run(async (dispatch) => {
          await deps.saveContent(state.content);
          dispatch({ type: 'saveCompleted' });
        })
      ];
    }

    // ... more cases
  }
};
```

**Component Integration**:
```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { editorReducer } from './editor.reducer';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Collaboration from '@tiptap/extension-collaboration';
  import { onMount, onDestroy } from 'svelte';

  interface RichTextEditorProps {
    initialContent: JSONContent;
    onSave: (content: JSONContent) => Promise<void>;
  }

  let { initialContent, onSave }: RichTextEditorProps = $props();

  const store = createStore({
    initialState: {
      content: initialContent,
      selection: { from: 0, to: 0 },
      isSaving: false,
      lastSaved: null,
      isCollaborating: false,
      activeUsers: []
    },
    reducer: editorReducer,
    dependencies: { saveContent: onSave }
  });

  let editorElement: HTMLElement;
  let editor: Editor;

  onMount(() => {
    editor = new Editor({
      element: editorElement,
      extensions: [StarterKit],
      content: store.state.content,
      onUpdate: ({ editor }) => {
        store.dispatch({
          type: 'contentChanged',
          content: editor.getJSON()
        });
      },
      onSelectionUpdate: ({ editor }) => {
        const { from, to } = editor.state.selection;
        store.dispatch({
          type: 'selectionChanged',
          from,
          to
        });
      }
    });
  });

  onDestroy(() => {
    editor?.destroy();
  });

  // Update editor when state changes (e.g., collaboration)
  $effect(() => {
    if (!editor) return;

    // Only update if content changed externally
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(store.state.content)) {
      editor.commands.setContent(store.state.content);
    }
  });
</script>

<div class="editor-container">
  <Toolbar {store} {editor} />
  <div bind:this={editorElement} class="editor-content"></div>

  {#if store.state.isSaving}
    <div class="saving-indicator">Saving...</div>
  {:else if store.state.lastSaved}
    <div class="saved-indicator">Saved {formatTime(store.state.lastSaved)}</div>
  {/if}
</div>
```

**Toolbar Component**:
```svelte
<script lang="ts">
  import { Button, Separator } from '../ui';
  import type { Editor } from '@tiptap/core';
  import type { Store } from '@composable-svelte/core';

  interface ToolbarProps {
    store: Store<EditorState, EditorAction>;
    editor: Editor;
  }

  let { store, editor }: ToolbarProps = $props();

  const isActive = (name: string) => editor?.isActive(name) ?? false;
</script>

<div class="toolbar">
  <Button
    variant={isActive('bold') ? 'primary' : 'ghost'}
    size="sm"
    action={{ type: 'boldButtonTapped' }}
    dispatch={store.dispatch}
    onclick={() => editor.chain().focus().toggleBold().run()}
  >
    Bold
  </Button>

  <Button
    variant={isActive('italic') ? 'primary' : 'ghost'}
    size="sm"
    action={{ type: 'italicButtonTapped' }}
    dispatch={store.dispatch}
    onclick={() => editor.chain().focus().toggleItalic().run()}
  >
    Italic
  </Button>

  <Separator orientation="vertical" />

  <Button
    variant={isActive('heading', { level: 1 }) ? 'primary' : 'ghost'}
    size="sm"
    action={{ type: 'headingButtonTapped', level: 1 }}
    dispatch={store.dispatch}
    onclick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
  >
    H1
  </Button>

  <!-- More toolbar buttons -->
</div>
```

### Other Advanced Component Patterns

**Chart Component** (D3):
- State: data, selected points, zoom level, hover state
- Actions: point clicked, zoomed, hover started/ended
- Effects: data loading, export to PNG
- D3 handles: rendering, scales, axes, transitions

**Code Editor** (CodeMirror):
- State: content, cursor position, selection, errors, linting results
- Actions: content changed, format triggered, find/replace
- Effects: syntax highlighting, linting, autocomplete
- CodeMirror handles: editor rendering, keyboard shortcuts, themes

**Kanban Board** (dnd-kit):
- State: columns, cards, dragging state, filters
- Actions: card moved, card edited, column added, filter applied
- Effects: save board state, load board data
- dnd-kit handles: drag-drop interactions, animations

---

## Implementation Roadmap

### Timeline: 5 Weeks

#### **Week 1: Foundation + Atomic Components**

**Days 1-2: Setup & Infrastructure**
- CLI tool setup (`@composable-svelte/cli`)
  - `init` command (Tailwind, theme, directories)
  - `add` command (copy components)
  - `update` command (update components)
  - `status` command (check for updates)
- Component registry structure
- Documentation site setup
- Animation presets extension

**Days 3-5: Atomic Components (Batch 1)**
- Layout: Card, Panel, Box, Separator, Aspect Ratio
- Typography: Heading, Text, Label, Kbd
- Buttons: Button, Button Group, Icon Button, Link Button
- Tests: Visual regression tests for all

**Deliverable**: CLI + 13 atomic components

---

#### **Week 2: Atomic Components + Forms Foundation**

**Days 1-2: Atomic Components (Batch 2)**
- Form Inputs: Input, Textarea, Checkbox, Radio, Switch
- Feedback: Badge, Avatar, Skeleton, Progress, Spinner
- Visual: Alert (static), Empty
- Tests: Interaction tests for inputs

**Days 3-5: Form System (Tier 2)**
- **See [Form System Design](./FORM-SYSTEM-DESIGN.md) for complete implementation details**
- Form reducer with Zod validation integration
- Form components: Form, FormField, FormItem, FormLabel, FormControl, FormMessage
- Field-level validation effects (debounced, async)
- Cross-field validation (Zod refinements)
- Async validation with debouncing (email availability, etc.)
- Progressive validation modes (onBlur, onChange, onSubmit, all)
- TestStore comprehensive tests (exhaustive state transition coverage)
- Examples: Contact form, multi-step form, registration form

**Deliverable**: 12 more atomic components + Form system (reducer + Zod hybrid)

---

#### **Week 3: Navigation Extensions + Data Components**

**Days 1-2: Navigation Components (Extend Phase 2/4)**
- Popover (floating content with positioning)
- Tooltip (hover with delays)
- Dropdown Menu (menu items as navigation destinations)
- Context Menu (right-click menu)
- Hover Card (hover-triggered card)
- All with `destination` + `presentation` pattern
- Animation integration (Motion One)
- Tests: Browser tests for all interactions

**Days 3-5: Data Table (Tier 2)**
- Table reducer (sorting, filtering, pagination, selection)
- DataTable components: DataTable, DataTableHeader, DataTableBody, DataTableRow, DataTablePagination
- Server-side integration patterns
- Optimistic UI updates
- Bulk actions
- TestStore comprehensive tests
- Examples: Product list, user management, analytics dashboard

**Deliverable**: 5 navigation components + DataTable system

---

#### **Week 4: Stateful Components**

**Days 1-2: Command & Toast**
- Command Palette reducer (search, keyboard nav, actions)
- Command components: Command, CommandInput, CommandList, CommandGroup, CommandItem
- Toast Queue reducer (queue management, auto-dismiss)
- Toast components: Toaster, Toast, ToastTitle, ToastDescription, ToastAction
- TestStore tests for both
- Examples: App command palette, notification system

**Days 2-3: Select & Combobox**
- Select reducer (selection state)
- Combobox reducer (search, filtering, async loading)
- Components: Select, SelectTrigger, SelectContent, SelectItem, Combobox, ComboboxInput
- Debounced search effects
- Keyboard navigation
- TestStore tests
- Examples: Country select, user search, product picker

**Days 4-5: Content Organization**
- Tabs reducer (active tab state)
- Accordion reducer (expanded panels)
- Tree View reducer (expansion, selection, lazy loading)
- Components for each
- TestStore tests
- Examples: Settings page, FAQ, file browser

**Deliverable**: 7 stateful components (Command, Toast, Select, Combobox, Tabs, Accordion, TreeView)

---

#### **Week 5: Advanced Components + Polish**

**Days 1-2: Calendar & Date Picker**
- Calendar reducer (date selection, range selection, navigation)
- Date Picker components: Calendar, DatePicker, RangePicker
- Date validation and constraints
- TestStore tests
- Examples: Booking form, date range filter

**Days 2-3: Advanced Wrappers**
- Chart component (D3 wrapper)
  - Chart reducer (selection, zoom, hover state)
  - D3 integration
  - Examples: Line chart, bar chart, scatter plot
- Rich Text Editor (Tiptap wrapper)
  - Editor reducer (content, selection, save state)
  - Tiptap integration
  - Toolbar component
  - Example: Document editor

**Days 4-5: Final Components + Polish**
- File Upload (progress tracking, retry logic)
- Infinite Scroll (pagination effects)
- Remaining components: Carousel, Slider, Pagination, Collapsible, Hover Card
- Documentation pass for all components
- Example app: Complete dashboard with all components

**Deliverable**: All remaining components + complete documentation

---

## Testing Strategy

### Three Testing Tiers (Match Component Tiers)

#### **Tier 1: Atomic Components**

**Visual Regression Tests** (Playwright screenshots)
```typescript
// button.visual.test.ts
import { test, expect } from '@playwright/test';

test.describe('Button Visual Tests', () => {
  test('renders all variants', async ({ page }) => {
    await page.goto('/tests/button');

    await expect(page.locator('[data-test="button-default"]')).toHaveScreenshot();
    await expect(page.locator('[data-test="button-primary"]')).toHaveScreenshot();
    await expect(page.locator('[data-test="button-secondary"]')).toHaveScreenshot();
    await expect(page.locator('[data-test="button-ghost"]')).toHaveScreenshot();
    await expect(page.locator('[data-test="button-danger"]')).toHaveScreenshot();
  });

  test('renders all sizes', async ({ page }) => {
    await page.goto('/tests/button');

    await expect(page.locator('[data-test="button-sm"]')).toHaveScreenshot();
    await expect(page.locator('[data-test="button-md"]')).toHaveScreenshot();
    await expect(page.locator('[data-test="button-lg"]')).toHaveScreenshot();
  });
});
```

**Accessibility Tests**
```typescript
// button.a11y.test.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Button accessibility', async ({ page }) => {
  await page.goto('/tests/button');

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze();
  expect(accessibilityScanResults.violations).toEqual([]);
});
```

**Interaction Tests**
```typescript
// input.interaction.test.ts
import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import Input from './Input.svelte';

test('Input dispatches action on change', async () => {
  const dispatched: any[] = [];
  const dispatch = (action: any) => dispatched.push(action);

  render(Input, {
    props: {
      value: '',
      action: { type: 'inputChanged', value: '$bindable' },
      dispatch
    }
  });

  const input = screen.getByRole('textbox');
  await userEvent.type(input, 'Hello');

  expect(dispatched).toContainEqual({
    type: 'inputChanged',
    value: 'Hello'
  });
});
```

#### **Tier 2: Stateful Components**

**TestStore Comprehensive Tests**
```typescript
// form.test.ts
import { describe, it, expect, vi } from 'vitest';
import { TestStore } from '@composable-svelte/core/test';
import { formReducer, type FormState, type FormAction } from './form.reducer';

describe('Form Reducer', () => {
  it('validates field on change after debounce', async () => {
    const validator = vi.fn().mockResolvedValue(undefined);

    const store = new TestStore({
      initialState: createInitialFormState({ name: '' }),
      reducer: formReducer,
      dependencies: {
        validators: { name: validator },
        onSubmit: vi.fn()
      }
    });

    // User types in field
    await store.send({ type: 'fieldChanged', field: 'name', value: 'John' }, (state) => {
      expect(state.fields.name.value).toBe('John');
      expect(state.fields.name.dirty).toBe(true);
    });

    // Wait for debounce and validation
    await store.receive({ type: 'fieldValidationStarted', field: 'name' }, (state) => {
      expect(state.fields.name.isValidating).toBe(true);
    });

    await store.receive({ type: 'fieldValidationCompleted', field: 'name', error: null }, (state) => {
      expect(state.fields.name.isValidating).toBe(false);
      expect(state.fields.name.error).toBe(null);
    });

    expect(validator).toHaveBeenCalledWith('John');
    store.finish();
  });

  it('prevents submission with validation errors', async () => {
    const onSubmit = vi.fn();

    const store = new TestStore({
      initialState: createInitialFormState({ name: '', email: '' }),
      reducer: formReducer,
      dependencies: {
        validators: {
          name: (v) => { if (!v) throw new Error('Required'); },
          email: (v) => { if (!v) throw new Error('Required'); }
        },
        onSubmit,
        validateAll: async (fields) => [
          { field: 'name', message: 'Required' },
          { field: 'email', message: 'Required' }
        ]
      }
    });

    // User clicks submit without filling fields
    await store.send({ type: 'submitButtonTapped' }, (state) => {
      expect(state.isValidating).toBe(true);
    });

    await store.receive({ type: 'validationCompleted', errors: [
      { field: 'name', message: 'Required' },
      { field: 'email', message: 'Required' }
    ]}, (state) => {
      expect(state.isValidating).toBe(false);
      expect(state.validationErrors).toHaveLength(2);
      expect(state.submitAttempts).toBe(1);
    });

    expect(onSubmit).not.toHaveBeenCalled();
    store.finish();
  });

  it('submits form with valid data', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    const store = new TestStore({
      initialState: createInitialFormState({ name: 'John', email: 'john@example.com' }),
      reducer: formReducer,
      dependencies: {
        validators: {
          name: () => {},
          email: () => {}
        },
        onSubmit,
        validateAll: async () => []
      }
    });

    await store.send({ type: 'submitButtonTapped' });
    await store.receive({ type: 'validationCompleted', errors: [] });
    await store.receive({ type: 'submissionStarted' }, (state) => {
      expect(state.isSubmitting).toBe(true);
    });
    await store.receive({ type: 'submissionSucceeded' }, (state) => {
      expect(state.isSubmitting).toBe(false);
    });

    expect(onSubmit).toHaveBeenCalled();
    store.finish();
  });
});
```

**Browser Integration Tests**
```typescript
// form.browser.test.ts
import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { userEvent } from '@testing-library/user-event';
import FormExample from './examples/ContactForm.svelte';

test('Form validates and submits', async () => {
  const { component } = render(FormExample);

  // Fill out form
  await userEvent.type(screen.getByLabelText('Name'), 'John Doe');
  await userEvent.type(screen.getByLabelText('Email'), 'john@example.com');
  await userEvent.type(screen.getByLabelText('Message'), 'Hello world');

  // Submit
  await userEvent.click(screen.getByText('Submit'));

  // Wait for success message
  await screen.findByText('Form submitted successfully!');
});

test('Form shows validation errors', async () => {
  render(FormExample);

  // Try to submit empty form
  await userEvent.click(screen.getByText('Submit'));

  // Wait for validation errors
  await screen.findByText('Name is required');
  await screen.findByText('Email is required');
  await screen.findByText('Message is required');
});
```

#### **Tier 3: Advanced Components**

**Integration Tests** (Verify wrapper + library integration)
```typescript
// chart.integration.test.ts
import { test, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ChartExample from './examples/LineChart.svelte';

test('Chart renders with D3', async () => {
  const data = [
    { x: 0, y: 10 },
    { x: 1, y: 20 },
    { x: 2, y: 15 }
  ];

  render(ChartExample, { props: { data } });

  // Verify SVG rendered
  const svg = screen.getByRole('img');
  expect(svg).toBeInTheDocument();

  // Verify data points rendered
  const circles = svg.querySelectorAll('circle');
  expect(circles).toHaveLength(3);
});

test('Chart handles point selection', async () => {
  const data = [
    { id: '1', x: 0, y: 10 },
    { id: '2', x: 1, y: 20 }
  ];

  render(ChartExample, { props: { data } });

  const circles = screen.getAllByRole('button'); // Points are interactive
  await userEvent.click(circles[0]);

  // Verify point is selected (visual change)
  expect(circles[0]).toHaveClass('selected');
});
```

**Reducer Tests** (TestStore for state management)
```typescript
// chart.reducer.test.ts
import { describe, it, expect } from 'vitest';
import { TestStore } from '@composable-svelte/core/test';
import { chartReducer } from './chart.reducer';

describe('Chart Reducer', () => {
  it('toggles point selection', async () => {
    const store = new TestStore({
      initialState: {
        data: [{ id: '1', x: 0, y: 10 }],
        selectedPoints: new Set(),
        hoveredPoint: null,
        zoom: { scale: 1, x: 0, y: 0 },
        isLoading: false
      },
      reducer: chartReducer,
      dependencies: {}
    });

    // Select point
    await store.send({ type: 'pointClicked', id: '1' }, (state) => {
      expect(state.selectedPoints.has('1')).toBe(true);
    });

    // Deselect point
    await store.send({ type: 'pointClicked', id: '1' }, (state) => {
      expect(state.selectedPoints.has('1')).toBe(false);
    });

    store.finish();
  });

  it('updates zoom state', async () => {
    const store = new TestStore({
      initialState: {
        data: [],
        selectedPoints: new Set(),
        hoveredPoint: null,
        zoom: { scale: 1, x: 0, y: 0 },
        isLoading: false
      },
      reducer: chartReducer,
      dependencies: {}
    });

    await store.send({ type: 'zoomed', scale: 2, x: 50, y: 50 }, (state) => {
      expect(state.zoom).toEqual({ scale: 2, x: 50, y: 50 });
    });

    store.finish();
  });
});
```

### Test Coverage Goals

| Component Tier | Test Type | Coverage Goal |
|----------------|-----------|---------------|
| Tier 1 (Atomic) | Visual regression | 100% variants |
| Tier 1 (Atomic) | Accessibility | 100% components |
| Tier 1 (Atomic) | Interaction | 80%+ coverage |
| Tier 2 (Stateful) | TestStore | 100% state transitions |
| Tier 2 (Stateful) | Browser integration | 80%+ user flows |
| Tier 2 (Stateful) | Accessibility | 100% components |
| Tier 3 (Advanced) | Reducer tests | 100% state transitions |
| Tier 3 (Advanced) | Integration tests | 70%+ library interaction |

---

## Success Criteria

### Phase 6 Complete When:

1. ✅ **50+ components implemented** across all three tiers
2. ✅ **All Tier 2 components** have reducer + TestStore tests
3. ✅ **CLI tool functional** with init, add, update, status commands
4. ✅ **Component registry live** with docs and examples
5. ✅ **All animations via Motion One** (no CSS transitions)
6. ✅ **Dark mode support** for all components
7. ✅ **Accessibility tested** (WCAG AA compliant)
8. ✅ **Complete example app** showcasing all components
9. ✅ **Integration guides** for all Tier 2+ components
10. ✅ **Migration from shadcn** documentation

### Quality Metrics

| Metric | Target | Measured By |
|--------|--------|-------------|
| Test coverage (Tier 2) | 90%+ | Vitest coverage report |
| Accessibility violations | 0 | Axe automated tests |
| Animation consistency | 100% Motion One | Code review |
| Documentation completeness | 100% components | Docs site |
| Example app completeness | All components used | Visual inspection |
| Build size (gzipped) | <50KB core | Bundle analyzer |

### User Experience Validation

- ✅ Developer can build a complete app using only our components
- ✅ Complex state management (forms, tables) is trivial
- ✅ Clear upgrade path from other libraries (shadcn, etc.)
- ✅ Customization is straightforward (copy-paste + edit)
- ✅ Learning curve aided by exemplary implementations

---

## Next Steps

### After Phase 6 Approval

1. **Create detailed specs** for first batch of components (Week 1 scope)
2. **Setup CLI tool** infrastructure and commands
3. **Begin atomic components** implementation
4. **Daily progress tracking** with completed components list

### Then: Phase 5 (Polish & Release)

After Phase 6 completes, we'll do Phase 5:
- Final documentation pass
- Performance optimization
- Bundle size optimization
- Example apps
- Migration guides
- 1.0.0 Release

---

## Summary

**Phase 6** transforms Composable Svelte from an architecture framework into a **complete application toolkit**. By providing:

- **50+ production-ready components**
- **Exemplary reducer-driven implementations**
- **Flexible distribution** (NPM core + copy-paste components)
- **Consistent styling** (CSS Variables + Tailwind)
- **Unified animations** (Motion One only)
- **Advanced integrations** (D3, Tiptap, etc.)

...we create a library that's **differentiated by its architecture**, not just its aesthetics. Users choose Composable Svelte because it makes complex state management trivial, not because it has pretty buttons.

**The goal**: Build apps faster AND better with state management that scales.
