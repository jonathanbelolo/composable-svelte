# Form System Guide - Composable Svelte

**Last Updated**: 2025-01-27

This guide documents the correct way to create forms in Composable Svelte, based on lessons learned during implementation and testing of the integrated form system.

## Table of Contents

1. [Overview](#overview)
2. [Form State Structure](#form-state-structure)
3. [Two Form Modes](#two-form-modes)
4. [Integrated Mode (Recommended for Complex Apps)](#integrated-mode-recommended-for-complex-apps)
5. [Common Pitfalls and Solutions](#common-pitfalls-and-solutions)
6. [Testing Forms in Browser](#testing-forms-in-browser)
7. [Component API Reference](#component-api-reference)

---

## Overview

The Composable Svelte form system is a **reducer-first** form state management solution with:

- **Zod validation** integration for type-safe schemas
- **Async validation** support (e.g., checking if email exists)
- **Field-level state tracking** (touched, dirty, errors, warnings)
- **Reducer composition** for integrating forms into parent reducers
- **Two modes**: Standalone (simple forms) and Integrated (complex apps)

---

## Form State Structure

### Core FormState Interface

```typescript
interface FormState<T extends Record<string, any>> {
  // Form data values
  data: T;

  // Per-field state (touched, dirty, error, isValidating, warnings)
  fields: {
    [K in keyof T]: FieldState;
  };

  // Zod schema for validation
  schema: ZodSchema<T>;

  // Form-level validation errors (cross-field validation)
  formErrors: string[];

  // Is entire form currently validating?
  isValidating: boolean;

  // Is form currently submitting?
  isSubmitting: boolean;  // ⚠️ NOT submission.status

  // Number of submission attempts
  submitCount: number;

  // Last submission error
  submitError: string | null;

  // Last successful submit timestamp
  lastSubmitted: Date | null;
}
```

### FieldState Structure

```typescript
interface FieldState {
  value: any;                // Current field value
  touched: boolean;          // Has user interacted with field?
  dirty: boolean;            // Has value changed from initial?
  error: string | null;      // Field validation error
  isValidating: boolean;     // Is field currently validating?
  warnings: string[];        // Non-blocking warnings
}
```

### ⚠️ CRITICAL: No `submission` object

**WRONG ❌:**
```typescript
formStore.state.submission.status === 'submitting'
```

**CORRECT ✅:**
```typescript
formStore.state.isSubmitting
```

The form state uses a **flat structure** with `isSubmitting` boolean, not a nested `submission: { status }` object.

---

## Two Form Modes

### 1. Standalone Mode

**When to use**: Simple forms that don't need parent coordination.

**Example**:
```svelte
<script lang="ts">
  import { Form, FormField } from '@composable-svelte/core/components/form';
  import { Button, Input } from '@composable-svelte/core/components/ui';

  const config: FormConfig<ContactData> = {
    schema: contactSchema,
    initialData: { name: '', email: '' },
    onSubmit: async (data) => {
      await api.submitContact(data);
    }
  };
</script>

<Form config={config}>
  <FormField name="name">
    {#snippet children({ field, send })}
      <Input
        value={field.value}
        oninput={(e) => send({ type: 'fieldChanged', field: 'name', value: e.currentTarget.value })}
        onblur={() => send({ type: 'fieldBlurred', field: 'name' })}
      />
      {#if field.error && field.touched}
        <p class="error">{field.error}</p>
      {/if}
    {/snippet}
  </FormField>
</Form>
```

### 2. Integrated Mode

**When to use**:
- Forms in larger apps with multiple features
- Parent needs to observe form events
- Multi-step forms
- Forms with side effects (e.g., show success message, track history)

**Example**: See [Integrated Mode](#integrated-mode-recommended-for-complex-apps) section below.

---

## Integrated Mode (Recommended for Complex Apps)

### Step 1: Define Form Config

```typescript
// features/contact-form/contact-form.config.ts
import { z } from 'zod';
import type { FormConfig } from '@composable-svelte/core/components/form';

export const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  message: z.string().min(10, 'Message must be at least 10 characters')
});

export type ContactFormData = z.infer<typeof contactSchema>;

export const contactFormConfig: FormConfig<ContactFormData> = {
  schema: contactSchema,
  initialData: { name: '', email: '', message: '' },
  mode: 'all',
  debounceMs: 500,

  asyncValidators: {
    email: async (email) => {
      // Example: Check if email is blocked
      if (email.endsWith('@spam.com')) {
        throw new Error('This email domain is not allowed');
      }
    }
  },

  onSubmit: async (data) => {
    console.log('Submitting contact form:', data);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('Contact form submitted successfully!', data);
  },

  onSubmitSuccess: (data) => {
    // This callback fires after onSubmit succeeds
    console.log('Form submission completed');
  }
};
```

### Step 2: Integrate Form Reducer into Parent

```typescript
// app/app.reducer.ts
import { createFormReducer } from '@composable-svelte/core/components/form';
import { scope } from '@composable-svelte/core/navigation';
import { Effect } from '@composable-svelte/core';
import { contactFormConfig } from '../features/contact-form/contact-form.config.js';

const formReducer = createFormReducer(contactFormConfig);

export const appReducer: Reducer<AppState, AppAction, {}> = (state, action, deps) => {
  // Run core reducer first
  const [s1, e1] = coreReducer(state, action, deps);

  // Scope form reducer
  const scopedFormReducer = scope<AppState, AppAction, any, any, {}>(
    (s) => s.contactForm,                           // Extract child state
    (s, child) => ({ ...s, contactForm: child }),   // Update parent with child
    (a) => (a.type === 'contactForm' ? a.action : null),  // Extract child action
    (childAction) => ({ type: 'contactForm', action: childAction }),  // Wrap child action
    formReducer
  );

  const [s2, e2] = scopedFormReducer(s1, action, deps);
  return [s2, Effect.batch(e1, e2)];
};

// Core reducer for parent-specific logic
const coreReducer: Reducer<AppState, AppAction, {}> = (state, action, deps) => {
  switch (action.type) {
    case 'contactForm': {
      // Parent observes form submission success
      if (action.action.type === 'submissionSucceeded') {
        const formData = state.contactForm.data;
        return [
          {
            ...state,
            submissionHistory: [...state.submissionHistory, {
              timestamp: new Date(),
              name: formData.name,
              email: formData.email
            }],
            successMessage: `Thank you, ${formData.name}! We'll be in touch soon.`
          },
          Effect.afterDelay(5000, (d) => d({ type: 'successMessageDismissed' }))
        ];
      }
      return [state, Effect.none()];
    }

    case 'successMessageDismissed': {
      return [{ ...state, successMessage: null }, Effect.none()];
    }

    default:
      return [state, Effect.none()];
  }
};
```

### Step 3: Define Parent State and Actions

```typescript
// app/app.types.ts
import type { FormState } from '@composable-svelte/core/components/form';
import type { ContactFormData } from '../features/contact-form/contact-form.config.js';

export interface AppState {
  contactForm: FormState<ContactFormData>;  // Integrated form state
  submissionHistory: Array<{
    timestamp: Date;
    name: string;
    email: string;
  }>;
  successMessage: string | null;
}

export type AppAction =
  | { type: 'contactForm'; action: FormAction<ContactFormData> }
  | { type: 'successMessageDismissed' };
```

### Step 4: Create Reactive Store Wrapper in Component

```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { Form, FormField } from '@composable-svelte/core/components/form';
  import { Button, Input, Textarea } from '@composable-svelte/core/components/ui';
  import { appReducer } from './app.reducer.js';
  import { createInitialAppState } from './app.state.js';

  // Create parent store
  const parentStore = createStore({
    initialState: createInitialAppState(),
    reducer: appReducer,
    dependencies: {}
  });

  // ⚠️ CRITICAL: Create reactive wrapper for form state
  // The Form component expects a store with a reactive `state` property
  let formStoreState = $state(parentStore.state.contactForm);

  $effect(() => {
    formStoreState = parentStore.state.contactForm;
  });

  const formStore = {
    get state() {
      return formStoreState;
    },
    dispatch(action: any) {
      parentStore.dispatch({ type: 'contactForm', action });
    },
    subscribe(listener: any) {
      return parentStore.subscribe(listener);
    }
  };

  // Subscribe to parent state for UI
  let submissionHistory = $state(parentStore.state.submissionHistory);
  let successMessage = $state(parentStore.state.successMessage);

  $effect(() => {
    submissionHistory = parentStore.state.submissionHistory;
    successMessage = parentStore.state.successMessage;
  });

  function dismissSuccessMessage() {
    parentStore.dispatch({ type: 'successMessageDismissed' });
  }
</script>

<div class="container">
  <!-- Success Message -->
  {#if successMessage}
    <div class="success-banner">
      <p>{successMessage}</p>
      <button onclick={dismissSuccessMessage}>✕</button>
    </div>
  {/if}

  <!-- Form -->
  <Form store={formStore}>
    <FormField name="name">
      {#snippet children({ field, send })}
        <div>
          <label for="name">Name *</label>
          <Input
            id="name"
            type="text"
            value={field.value}
            oninput={(e) => send({ type: 'fieldChanged', field: 'name', value: e.currentTarget.value })}
            onblur={() => send({ type: 'fieldBlurred', field: 'name' })}
          />
          {#if field.error && field.touched}
            <p class="error">{field.error}</p>
          {/if}
        </div>
      {/snippet}
    </FormField>

    <FormField name="email">
      {#snippet children({ field, send })}
        <div>
          <label for="email">Email *</label>
          <Input
            id="email"
            type="email"
            value={field.value}
            oninput={(e) => send({ type: 'fieldChanged', field: 'email', value: e.currentTarget.value })}
            onblur={() => send({ type: 'fieldBlurred', field: 'email' })}
          />
          {#if field.error && field.touched}
            <p class="error">{field.error}</p>
          {/if}
          {#if field.isValidating}
            <p class="validating">Validating...</p>
          {/if}
        </div>
      {/snippet}
    </FormField>

    <FormField name="message">
      {#snippet children({ field, send })}
        <div>
          <label for="message">Message *</label>
          <Textarea
            id="message"
            value={field.value}
            oninput={(e) => send({ type: 'fieldChanged', field: 'message', value: e.currentTarget.value })}
            onblur={() => send({ type: 'fieldBlurred', field: 'message' })}
            rows={4}
          />
          {#if field.error && field.touched}
            <p class="error">{field.error}</p>
          {/if}
        </div>
      {/snippet}
    </FormField>

    <Button type="submit">
      {formStore.state.isSubmitting ? 'Sending...' : 'Send Message'}
    </Button>
  </Form>

  <!-- Submission History -->
  {#if submissionHistory.length > 0}
    <div class="history">
      <h2>Submission History</h2>
      {#each submissionHistory as submission}
        <div class="submission-item">
          <p>{submission.timestamp.toLocaleString()}</p>
          <p>{submission.name} - {submission.email}</p>
        </div>
      {/each}
    </div>
  {/if}
</div>
```

---

## Common Pitfalls and Solutions

### ❌ Pitfall 1: Accessing `submission.status` instead of `isSubmitting`

**Problem**:
```svelte
<Button>
  {formStore.state.submission.status === 'submitting' ? 'Sending...' : 'Send'}
</Button>
```

**Error**: `Cannot read properties of undefined (reading 'status')`

**Solution**:
```svelte
<Button>
  {formStore.state.isSubmitting ? 'Sending...' : 'Send'}
</Button>
```

**Why**: FormState uses a flat structure with `isSubmitting: boolean`, not a nested `submission` object.

---

### ❌ Pitfall 2: Wrong FormField snippet signature

**Problem**:
```svelte
<FormField name="email">
  {#snippet children(fieldState)}
    <Input value={fieldState.value} />
  {/snippet}
</FormField>
```

**Error**: FormField snippet doesn't provide a `send` function.

**Solution**:
```svelte
<FormField name="email">
  {#snippet children({ field, send })}
    <Input
      value={field.value}
      oninput={(e) => send({ type: 'fieldChanged', field: 'email', value: e.currentTarget.value })}
    />
  {/snippet}
</FormField>
```

**Why**: FormField provides `{ field: FieldState, send: (action) => void }` to the snippet, not just `FieldState`.

---

### ❌ Pitfall 3: Non-reactive store wrapper

**Problem**:
```typescript
const formStore = {
  get state() {
    return parentStore.state.contactForm;
  },
  dispatch(action) {
    parentStore.dispatch({ type: 'contactForm', action });
  }
};
```

**Error**: FormField can't access reactive state, UI doesn't update.

**Solution**:
```typescript
// Use $state() and $effect() to make wrapper reactive
let formStoreState = $state(parentStore.state.contactForm);

$effect(() => {
  formStoreState = parentStore.state.contactForm;
});

const formStore = {
  get state() {
    return formStoreState;  // Returns reactive $state proxy
  },
  dispatch(action) {
    parentStore.dispatch({ type: 'contactForm', action });
  },
  subscribe(listener) {
    return parentStore.subscribe(listener);
  }
};
```

**Why**: Svelte 5's `$derived` in FormField requires the store's `state` property to be reactive. A plain getter doesn't trigger reactivity tracking.

---

### ❌ Pitfall 4: Wrong import paths

**Problem**:
```typescript
import { Button, Input } from '@composable-svelte/core/components/form';
```

**Error**: `does not provide an export named 'Button'`

**Solution**:
```typescript
// Form components
import { Form, FormField } from '@composable-svelte/core/components/form';

// UI components
import { Button, Input, Textarea } from '@composable-svelte/core/components/ui';
```

**Why**: Form system exports `Form` and `FormField`. UI primitives (Button, Input, Textarea) are separate exports.

---

### ❌ Pitfall 5: Missing Vite alias for `$lib`

**Problem**:
```
Failed to resolve import "$lib/utils.js" from "Spinner.svelte"
```

**Solution**:
```typescript
// vite.config.ts
export default defineConfig({
  resolve: {
    alias: {
      '@composable-svelte/core': resolve(__dirname, '../../packages/core/src'),
      '$lib': resolve(__dirname, '../../packages/core/src/lib')  // Add this
    }
  }
});
```

**Why**: UI components internally use `$lib` for utility functions. The alias must be configured in every example/app.

---

### ❌ Pitfall 6: JSDoc with code blocks in .svelte files

**Problem**:
```svelte
<script>
/**
 * Form component
 * @example
 * ```svelte
 * <script>
 *   const config = ...
 * </script>
 * ```
 */
</script>
```

**Error**: `Expected "*/" to terminate multi-line comment`

**Solution**:
```svelte
<script>
// Form component - Creates and manages form state using the reducer pattern.
//
// Supports two modes:
// 1. Standalone mode: Pass `config` to create internal store
// 2. Integrated mode: Pass `store` to use external store from parent reducer
</script>
```

**Why**: Svelte's parser gets confused by `<script>` tags inside JSDoc comments. Use single-line comments instead.

---

## Testing Forms in Browser

### Required Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      '@composable-svelte/core': resolve(__dirname, '../../packages/core/src'),
      '$lib': resolve(__dirname, '../../packages/core/src/lib')  // REQUIRED
    }
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright({
        launch: {
          headless: true,
          args: ['--headless=new']
        }
      }),
      instances: [
        { browser: 'chromium' }
      ],
      headless: true
    },
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}']
  }
});
```

### Example Browser Test

```typescript
// tests/app.browser.test.ts
import { render, screen } from 'vitest-browser-svelte';
import { expect, test, describe } from 'vitest';
import App from '../src/app/App.svelte';

describe('Contact Form - Integrated Mode', () => {
  describe('Field Validation', () => {
    test('shows validation error when name is too short', async () => {
      render(App);

      const nameInput = screen.getByLabelText('Name *');
      const nameField = screen.getByTestId('name-field');

      // Type short name
      await nameInput.fill('J');
      await nameInput.blur();

      // Wait for validation error
      await expect.element(nameField).toHaveTextContent('Name must be at least 2 characters');
    });
  });

  describe('Form Submission', () => {
    test('successfully submits valid form', async () => {
      render(App);

      // Fill form
      await screen.getByLabelText('Name *').fill('John Doe');
      await screen.getByLabelText('Email *').fill('john@example.com');
      await screen.getByLabelText('Message *').fill('This is a test message that is long enough.');

      // Submit
      await screen.getByTestId('submit-button').click();

      // Wait for success message
      await expect.element(screen.getByTestId('success-message')).toBeVisible();
      await expect.element(screen.getByTestId('success-message')).toHaveTextContent('Thank you, John Doe!');
    });
  });
});
```

### Running Browser Tests

```bash
cd examples/contact-form
pnpm test
```

**Output**:
```
✓ chromium tests/app.browser.test.ts (13 tests) 10165ms
  ✓ shows validation error when name is too short 348ms
  ✓ clears validation errors when input becomes valid 466ms
  ✓ successfully submits valid form 2101ms
  ✓ adds submission to history 2067ms
  ✓ dismisses success message when clicked 2181ms
  ✓ does not submit invalid form 1033ms
  ✓ rejects blocked email domains 784ms

Test Files  1 passed (1)
Tests  13 passed (13)
```

---

## Component API Reference

### `<Form>` Component

**Props**:
- `config?: FormConfig<T>` - Form configuration (standalone mode)
- `store?: Store<FormState<T>, FormAction<T>>` - External store (integrated mode)
- `class?: string` - Optional CSS class

**Usage**:
```svelte
<!-- Standalone -->
<Form config={formConfig}>
  ...
</Form>

<!-- Integrated -->
<Form store={formStore}>
  ...
</Form>
```

**Important**: Must provide either `config` OR `store`, not both.

---

### `<FormField>` Component

**Props**:
- `name: keyof T & string` - Field name (must match form data key)
- `class?: string` - Optional CSS class
- `children?: Snippet<[{ field: FieldState, send: (action) => void }]>` - Snippet for rendering field

**Snippet Props**:
- `field: FieldState` - Current field state (value, touched, error, etc.)
- `send: (action: FormAction<T>) => void` - Function to dispatch actions

**Usage**:
```svelte
<FormField name="email">
  {#snippet children({ field, send })}
    <Input
      value={field.value}
      oninput={(e) => send({ type: 'fieldChanged', field: 'email', value: e.currentTarget.value })}
      onblur={() => send({ type: 'fieldBlurred', field: 'email' })}
    />
    {#if field.error && field.touched}
      <p class="error">{field.error}</p>
    {/if}
  {/snippet}
</FormField>
```

---

### FormAction Types

**Field Interactions**:
```typescript
{ type: 'fieldChanged'; field: keyof T; value: unknown }
{ type: 'fieldBlurred'; field: keyof T }
{ type: 'fieldFocused'; field: keyof T }
```

**Submission**:
```typescript
{ type: 'submitTriggered' }
{ type: 'submissionStarted' }
{ type: 'submissionSucceeded'; response?: unknown }
{ type: 'submissionFailed'; error: string }
```

**Form Management**:
```typescript
{ type: 'formReset'; data?: T }
{ type: 'setFieldValue'; field: keyof T; value: unknown }
{ type: 'setFieldError'; field: keyof T; error: string }
{ type: 'clearFieldError'; field: keyof T }
```

---

## Summary Checklist

When creating a new form, verify:

- [ ] **Form config** defines Zod schema and handlers correctly
- [ ] **Parent state** includes `FormState<YourData>` field
- [ ] **Parent actions** wrap form actions: `{ type: 'formField', action: FormAction<YourData> }`
- [ ] **Reducer uses `scope()`** to integrate form reducer
- [ ] **Component creates reactive wrapper** using `$state()` and `$effect()`
- [ ] **FormField snippets** use `{ field, send }` destructuring
- [ ] **Submit button** accesses `isSubmitting` (not `submission.status`)
- [ ] **Imports are correct**: Form/FormField from `form`, Button/Input from `ui`
- [ ] **Vite config** includes `$lib` alias
- [ ] **Browser tests** use `vitest-browser-svelte` and Playwright

---

## Additional Resources

- **Example**: `examples/contact-form` - Full integrated mode example with tests
- **Type Definitions**: `packages/core/src/components/form/form.types.ts`
- **Form Reducer**: `packages/core/src/components/form/form.reducer.ts`
- **Tests**: `packages/core/tests/form.test.ts` - TestStore unit tests

---

**Document Version**: 1.0
**Contributors**: Assistant, based on implementation debugging 2025-01-27
