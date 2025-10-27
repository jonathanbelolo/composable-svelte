# Form System Design: Composable Svelte

**Date**: 2025-10-27
**Status**: Design / Pre-Implementation
**Goal**: Build a reducer-first form system that integrates Zod validation with zero compromises

---

## Table of Contents

1. [Analysis: shadcn-svelte Forms](#analysis-shadcn-svelte-forms)
2. [Our Requirements](#our-requirements)
3. [Architecture Decision](#architecture-decision)
4. [Complete Form System Design](#complete-form-system-design)
5. [Implementation Examples](#implementation-examples)
6. [Testing Strategy](#testing-strategy)
7. [Migration from shadcn-svelte](#migration-from-shadcn-svelte)

---

## Analysis: shadcn-svelte Forms

### Their Stack

```
┌─────────────────────────────────────────┐
│ shadcn-svelte Form Components           │
│ (UI layer with styling)                 │
└─────────────┬───────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Formsnap                                │
│ (Compositional field components)        │
└─────────────┬───────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ SvelteKit Superforms                    │
│ (State management + server integration) │
└─────────────┬───────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│ Zod (Validation schemas)                │
└─────────────────────────────────────────┘
```

### What They Do Well

✅ **Type-safe schemas** - Zod integration provides excellent type inference
✅ **Compositional API** - `Form.Field`, `Form.Control`, `Form.Label` pattern is clean
✅ **Auto-association** - Labels automatically link to inputs
✅ **Validation ecosystem** - Leverage Zod's rich validation library
✅ **Error display** - Clear error messaging patterns
✅ **Progressive enhancement** - Works without JS (SvelteKit forms)
✅ **Tainted tracking** - Know which fields user touched

### What Doesn't Fit Our Architecture

❌ **Not reducer-driven** - State management unclear/implicit
❌ **SvelteKit coupling** - Superforms requires SvelteKit
❌ **No effect system** - Async operations not structured
❌ **Not TestStore-testable** - Can't exhaustively test state transitions
❌ **Server-side coupling** - Hard to use without SvelteKit backend
❌ **Implicit state flow** - Hard to reason about validation timing

### Key Insight

**We should keep**:
- Zod for validation (don't reinvent!)
- Compositional component API
- Type safety via schemas
- Error display patterns

**We should replace**:
- Superforms → Our reducer + Effect system
- Formsnap → Our Form components backed by reducer
- Implicit state → Explicit reducer state
- Server coupling → Backend-agnostic (works with any API)

---

## Our Requirements

### Non-Negotiables

1. **Fully reducer-driven** - All state in reducer, all transitions testable
2. **Effect-based async** - Validation, submission via Effect system
3. **TestStore-first** - Exhaustive test coverage for all flows
4. **Zod integration** - Don't reinvent validation, use Zod
5. **Backend-agnostic** - Works with any backend (REST, GraphQL, SvelteKit, etc.)
6. **Type-safe** - Full type inference from schema to components
7. **Accessible** - WCAG AA compliant
8. **Composable** - Field-level and form-level composition

### User Experience Goals

1. **Clear validation feedback** - Show errors at right time (not too early, not too late)
2. **Async validation** - Email availability, username checks, etc.
3. **Cross-field validation** - Password confirmation, date ranges, etc.
4. **Optimistic UI** - Immediate feedback, background validation
5. **Submission states** - Loading, success, error handling
6. **Field dependencies** - Conditional validation based on other fields
7. **Progressive disclosure** - Multi-step forms, wizards

---

## Architecture Decision

### Design: **Reducer + Zod Hybrid**

We'll build a **two-layer architecture**:

1. **Validation Layer** (Zod) - Handles validation logic
2. **State Layer** (Reducer) - Manages form state, orchestrates validation via effects

```
┌──────────────────────────────────────────────────────────┐
│ Form Components (UI)                                     │
│ Form, Form.Field, Form.Control, Form.Label, etc.        │
└────────────────────┬─────────────────────────────────────┘
                     ↓
┌──────────────────────────────────────────────────────────┐
│ Form Reducer (State Management)                         │
│ - Field state (value, touched, dirty, error)            │
│ - Form state (submitting, errors, attempts)             │
│ - Validation orchestration via Effects                  │
└────────────┬───────────────────┬─────────────────────────┘
             ↓                   ↓
┌──────────────────────┐  ┌──────────────────────────────┐
│ Effect System        │  │ Zod Validation               │
│ - Debounced validate │  │ - Schema validation          │
│ - Async validation   │  │ - Type inference             │
│ - Form submission    │  │ - Custom refinements         │
└──────────────────────┘  └──────────────────────────────┘
```

### Why This Works

✅ **Best of both worlds**: Zod's validation power + our reducer patterns
✅ **Fully testable**: TestStore can test all state transitions
✅ **Effect-driven async**: Validation/submission as effects
✅ **Type-safe**: Zod schema → TypeScript types → Components
✅ **Backend-agnostic**: No SvelteKit coupling
✅ **Explicit state flow**: Every transition is an action
✅ **Composable**: Reducers compose, schemas compose

---

## Complete Form System Design

### 1. Form State

```typescript
// form.types.ts

/**
 * Complete form state for a given data shape.
 */
interface FormState<T extends Record<string, any>> {
  /**
   * Current form data values.
   */
  data: T;

  /**
   * Per-field state tracking.
   */
  fields: {
    [K in keyof T]: FieldState;
  };

  /**
   * Zod schema for validation.
   */
  schema: z.ZodSchema<T>;

  /**
   * Form-level validation errors (cross-field, etc.)
   */
  formErrors: string[];

  /**
   * Is form currently validating?
   */
  isValidating: boolean;

  /**
   * Is form currently submitting?
   */
  isSubmitting: boolean;

  /**
   * Number of submission attempts.
   */
  submitCount: number;

  /**
   * Last submission error (if any).
   */
  submitError: string | null;

  /**
   * Last successful submit timestamp.
   */
  lastSubmitted: Date | null;
}

/**
 * State for individual form field.
 */
interface FieldState {
  /**
   * Has user interacted with this field?
   */
  touched: boolean;

  /**
   * Has value changed from initial?
   */
  dirty: boolean;

  /**
   * Field-level validation error.
   */
  error: string | null;

  /**
   * Is this field currently validating?
   */
  isValidating: boolean;

  /**
   * Validation warnings (non-blocking).
   */
  warnings: string[];
}

/**
 * Form configuration.
 */
interface FormConfig<T extends Record<string, any>> {
  /**
   * Zod schema for validation.
   */
  schema: z.ZodSchema<T>;

  /**
   * Initial form data.
   */
  initialData: T;

  /**
   * Validation mode.
   * - 'onBlur': Validate when field loses focus
   * - 'onChange': Validate as user types (debounced)
   * - 'onSubmit': Only validate on submit
   * - 'all': Validate on blur and change
   */
  mode?: 'onBlur' | 'onChange' | 'onSubmit' | 'all';

  /**
   * Debounce delay for onChange validation (ms).
   * @default 300
   */
  debounceMs?: number;

  /**
   * Custom async validators per field.
   */
  asyncValidators?: Partial<{
    [K in keyof T]: (value: T[K]) => Promise<void>;
  }>;

  /**
   * Submission handler.
   */
  onSubmit: (data: T) => Promise<void>;

  /**
   * Success callback.
   */
  onSubmitSuccess?: (data: T) => void;

  /**
   * Error callback.
   */
  onSubmitError?: (error: Error) => void;
}
```

### 2. Form Actions

```typescript
// form.actions.ts

/**
 * All possible form actions.
 */
type FormAction<T extends Record<string, any>> =
  // Field interactions
  | { type: 'fieldChanged'; field: keyof T; value: unknown }
  | { type: 'fieldBlurred'; field: keyof T }
  | { type: 'fieldFocused'; field: keyof T }

  // Field validation
  | { type: 'fieldValidationStarted'; field: keyof T }
  | { type: 'fieldValidationCompleted'; field: keyof T; error: string | null; warnings?: string[] }

  // Form validation
  | { type: 'formValidationStarted' }
  | { type: 'formValidationCompleted'; fieldErrors: Partial<Record<keyof T, string>>; formErrors: string[] }

  // Submission
  | { type: 'submitTriggered' }
  | { type: 'submissionStarted' }
  | { type: 'submissionSucceeded'; response?: unknown }
  | { type: 'submissionFailed'; error: string }

  // Form management
  | { type: 'formReset' }
  | { type: 'formReset'; data: T }
  | { type: 'setFieldValue'; field: keyof T; value: unknown }
  | { type: 'setFieldError'; field: keyof T; error: string }
  | { type: 'clearFieldError'; field: keyof T };
```

### 3. Form Reducer

```typescript
// form.reducer.ts

/**
 * Form reducer with Zod validation integration.
 */
export function createFormReducer<T extends Record<string, any>>(
  config: FormConfig<T>
) {
  const { schema, mode = 'all', debounceMs = 300, asyncValidators, onSubmit } = config;

  return (
    state: FormState<T>,
    action: FormAction<T>,
    deps: FormDependencies
  ): [FormState<T>, Effect<FormAction<T>>] => {
    switch (action.type) {
      // ================================================================
      // FIELD CHANGED
      // ================================================================
      case 'fieldChanged': {
        const { field, value } = action;

        const newState = {
          ...state,
          data: { ...state.data, [field]: value },
          fields: {
            ...state.fields,
            [field]: {
              ...state.fields[field],
              dirty: true,
              error: null // Clear error on change
            }
          }
        };

        // Trigger validation based on mode
        if (mode === 'onChange' || mode === 'all') {
          // Debounced validation
          return [
            newState,
            Effect.afterDelay(debounceMs, (dispatch) => {
              dispatch({ type: 'fieldValidationStarted', field });
            })
          ];
        }

        return [newState, Effect.none()];
      }

      // ================================================================
      // FIELD BLURRED
      // ================================================================
      case 'fieldBlurred': {
        const { field } = action;

        const newState = {
          ...state,
          fields: {
            ...state.fields,
            [field]: {
              ...state.fields[field],
              touched: true
            }
          }
        };

        // Trigger validation based on mode
        if (mode === 'onBlur' || mode === 'all') {
          return [
            newState,
            Effect.fireAndForget((dispatch) => {
              dispatch({ type: 'fieldValidationStarted', field });
            })
          ];
        }

        return [newState, Effect.none()];
      }

      // ================================================================
      // FIELD VALIDATION STARTED
      // ================================================================
      case 'fieldValidationStarted': {
        const { field } = action;

        const newState = {
          ...state,
          fields: {
            ...state.fields,
            [field]: {
              ...state.fields[field],
              isValidating: true
            }
          }
        };

        // Run Zod validation + async validators
        return [
          newState,
          Effect.run<FormAction<T>>(async (dispatch) => {
            const fieldValue = state.data[field];
            let error: string | null = null;
            const warnings: string[] = [];

            // 1. Zod schema validation for this field
            try {
              // Extract field schema from main schema
              const fieldSchema = schema.shape[field];
              if (fieldSchema) {
                fieldSchema.parse(fieldValue);
              }
            } catch (e) {
              if (e instanceof z.ZodError) {
                error = e.errors[0]?.message ?? 'Validation error';
              }
            }

            // 2. Async validator (if provided)
            if (!error && asyncValidators?.[field]) {
              try {
                await asyncValidators[field]!(fieldValue as any);
              } catch (e) {
                error = e instanceof Error ? e.message : 'Validation failed';
              }
            }

            dispatch({
              type: 'fieldValidationCompleted',
              field,
              error,
              warnings
            });
          })
        ];
      }

      // ================================================================
      // FIELD VALIDATION COMPLETED
      // ================================================================
      case 'fieldValidationCompleted': {
        const { field, error, warnings = [] } = action;

        return [
          {
            ...state,
            fields: {
              ...state.fields,
              [field]: {
                ...state.fields[field],
                isValidating: false,
                error,
                warnings
              }
            }
          },
          Effect.none()
        ];
      }

      // ================================================================
      // SUBMIT TRIGGERED
      // ================================================================
      case 'submitTriggered': {
        // Validate entire form first
        return [
          { ...state, isValidating: true },
          Effect.fireAndForget<FormAction<T>>((dispatch) => {
            dispatch({ type: 'formValidationStarted' });
          })
        ];
      }

      // ================================================================
      // FORM VALIDATION STARTED
      // ================================================================
      case 'formValidationStarted': {
        return [
          state,
          Effect.run<FormAction<T>>(async (dispatch) => {
            try {
              // Validate entire form with Zod
              schema.parse(state.data);

              // No errors - proceed to submission
              dispatch({
                type: 'formValidationCompleted',
                fieldErrors: {},
                formErrors: []
              });
            } catch (e) {
              if (e instanceof z.ZodError) {
                // Map Zod errors to field errors
                const fieldErrors: Partial<Record<keyof T, string>> = {};
                const formErrors: string[] = [];

                for (const error of e.errors) {
                  const path = error.path[0];
                  if (path && typeof path === 'string') {
                    fieldErrors[path as keyof T] = error.message;
                  } else {
                    formErrors.push(error.message);
                  }
                }

                dispatch({
                  type: 'formValidationCompleted',
                  fieldErrors,
                  formErrors
                });
              }
            }
          })
        ];
      }

      // ================================================================
      // FORM VALIDATION COMPLETED
      // ================================================================
      case 'formValidationCompleted': {
        const { fieldErrors, formErrors } = action;

        const hasErrors = Object.keys(fieldErrors).length > 0 || formErrors.length > 0;

        if (hasErrors) {
          // Update field errors and stop
          const newFields = { ...state.fields };
          for (const field in fieldErrors) {
            newFields[field as keyof T] = {
              ...newFields[field as keyof T],
              error: fieldErrors[field as keyof T] ?? null,
              touched: true
            };
          }

          return [
            {
              ...state,
              fields: newFields,
              formErrors,
              isValidating: false,
              submitCount: state.submitCount + 1
            },
            Effect.none()
          ];
        }

        // No errors - proceed to submission
        return [
          { ...state, isValidating: false },
          Effect.fireAndForget<FormAction<T>>((dispatch) => {
            dispatch({ type: 'submissionStarted' });
          })
        ];
      }

      // ================================================================
      // SUBMISSION STARTED
      // ================================================================
      case 'submissionStarted': {
        return [
          {
            ...state,
            isSubmitting: true,
            submitError: null
          },
          Effect.run<FormAction<T>>(async (dispatch) => {
            try {
              await onSubmit(state.data);
              dispatch({ type: 'submissionSucceeded' });
            } catch (e) {
              dispatch({
                type: 'submissionFailed',
                error: e instanceof Error ? e.message : 'Submission failed'
              });
            }
          })
        ];
      }

      // ================================================================
      // SUBMISSION SUCCEEDED
      // ================================================================
      case 'submissionSucceeded': {
        return [
          {
            ...state,
            isSubmitting: false,
            lastSubmitted: new Date(),
            submitCount: state.submitCount + 1
          },
          Effect.none()
        ];
      }

      // ================================================================
      // SUBMISSION FAILED
      // ================================================================
      case 'submissionFailed': {
        return [
          {
            ...state,
            isSubmitting: false,
            submitError: action.error,
            submitCount: state.submitCount + 1
          },
          Effect.none()
        ];
      }

      // ================================================================
      // FORM RESET
      // ================================================================
      case 'formReset': {
        const resetData = 'data' in action ? action.data : config.initialData;

        return [
          createInitialFormState(config, resetData),
          Effect.none()
        ];
      }

      // ================================================================
      // SET FIELD VALUE (Programmatic)
      // ================================================================
      case 'setFieldValue': {
        return [
          {
            ...state,
            data: { ...state.data, [action.field]: action.value },
            fields: {
              ...state.fields,
              [action.field]: {
                ...state.fields[action.field],
                dirty: true
              }
            }
          },
          Effect.none()
        ];
      }

      // ================================================================
      // SET FIELD ERROR (Programmatic)
      // ================================================================
      case 'setFieldError': {
        return [
          {
            ...state,
            fields: {
              ...state.fields,
              [action.field]: {
                ...state.fields[action.field],
                error: action.error
              }
            }
          },
          Effect.none()
        ];
      }

      // ================================================================
      // CLEAR FIELD ERROR (Programmatic)
      // ================================================================
      case 'clearFieldError': {
        return [
          {
            ...state,
            fields: {
              ...state.fields,
              [action.field]: {
                ...state.fields[action.field],
                error: null
              }
            }
          },
          Effect.none()
        ];
      }

      default:
        return [state, Effect.none()];
    }
  };
}

/**
 * Create initial form state from config.
 */
function createInitialFormState<T extends Record<string, any>>(
  config: FormConfig<T>,
  data?: T
): FormState<T> {
  const formData = data ?? config.initialData;

  const fields: any = {};
  for (const key in formData) {
    fields[key] = {
      touched: false,
      dirty: false,
      error: null,
      isValidating: false,
      warnings: []
    };
  }

  return {
    data: formData,
    fields,
    schema: config.schema,
    formErrors: [],
    isValidating: false,
    isSubmitting: false,
    submitCount: 0,
    submitError: null,
    lastSubmitted: null
  };
}

/**
 * Dependencies for form reducer.
 */
interface FormDependencies {
  // Can add custom dependencies here
}
```

### 4. Form Components

```typescript
// Form.svelte
<script lang="ts" generics="T extends Record<string, any>">
  import { createStore, type Store } from '@composable-svelte/core';
  import { createFormReducer, createInitialFormState, type FormConfig, type FormState, type FormAction } from './form.reducer';
  import type { Snippet } from 'svelte';
  import { setContext } from 'svelte';

  interface FormProps<T> {
    /**
     * Form configuration (schema, validation mode, submission handler).
     */
    config: FormConfig<T>;

    /**
     * Children with access to form store.
     */
    children: Snippet<{ store: Store<FormState<T>, FormAction<T>> }>;
  }

  let { config, children }: FormProps<T> = $props();

  // Create form store
  const store = createStore({
    initialState: createInitialFormState(config),
    reducer: createFormReducer(config),
    dependencies: {}
  });

  // Provide store to descendants
  setContext('formStore', store);

  // Handle form submission
  function handleSubmit(e: Event) {
    e.preventDefault();
    store.dispatch({ type: 'submitTriggered' });
  }
</script>

<form onsubmit={handleSubmit}>
  {@render children({ store })}
</form>
```

```typescript
// FormField.svelte
<script lang="ts" generics="T extends Record<string, any>, K extends keyof T">
  import { getContext } from 'svelte';
  import type { Store } from '@composable-svelte/core';
  import type { FormState, FormAction } from './form.reducer';
  import type { Snippet } from 'svelte';

  interface FormFieldProps<T, K extends keyof T> {
    /**
     * Field name.
     */
    name: K;

    /**
     * Children with access to field state.
     */
    children: Snippet<{
      value: T[K];
      error: string | null;
      touched: boolean;
      dirty: boolean;
      isValidating: boolean;
      warnings: string[];
    }>;
  }

  let { name, children }: FormFieldProps<T, K> = $props();

  const store = getContext<Store<FormState<T>, FormAction<T>>>('formStore');

  // Derive field state
  const fieldState = $derived(store.state.fields[name]);
  const value = $derived(store.state.data[name]);
</script>

{@render children({
  value,
  error: fieldState.error,
  touched: fieldState.touched,
  dirty: fieldState.dirty,
  isValidating: fieldState.isValidating,
  warnings: fieldState.warnings
})}
```

```typescript
// FormControl.svelte
<script lang="ts" generics="T extends Record<string, any>, K extends keyof T">
  import { getContext } from 'svelte';
  import type { Store } from '@composable-svelte/core';
  import type { FormState, FormAction } from './form.reducer';
  import type { Snippet } from 'svelte';

  interface FormControlProps<T, K extends keyof T> {
    /**
     * Field name.
     */
    name: K;

    /**
     * Input element (pass through slot).
     */
    children: Snippet;
  }

  let { name, children }: FormControlProps<T, K> = $props();

  const store = getContext<Store<FormState<T>, FormAction<T>>>('formStore');

  // Field event handlers
  function handleChange(value: T[K]) {
    store.dispatch({ type: 'fieldChanged', field: name, value });
  }

  function handleBlur() {
    store.dispatch({ type: 'fieldBlurred', field: name });
  }

  function handleFocus() {
    store.dispatch({ type: 'fieldFocused', field: name });
  }
</script>

<div
  class="form-control"
  data-field={String(name)}
  data-error={store.state.fields[name].error !== null}
  data-touched={store.state.fields[name].touched}
  data-dirty={store.state.fields[name].dirty}
>
  {@render children()}
</div>
```

---

## Implementation Examples

### Example 1: Contact Form

```typescript
// ContactForm.svelte
<script lang="ts">
  import { z } from 'zod';
  import { Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage, Button, Input, Textarea } from '@composable-svelte/core/components';

  // 1. Define schema
  const contactSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    message: z.string().min(10, 'Message must be at least 10 characters')
  });

  type ContactFormData = z.infer<typeof contactSchema>;

  // 2. Async validators
  const asyncValidators = {
    email: async (email: string) => {
      // Check if email is already registered
      const response = await fetch(`/api/check-email?email=${email}`);
      const { available } = await response.json();
      if (!available) {
        throw new Error('Email already registered');
      }
    }
  };

  // 3. Submission handler
  async function handleSubmit(data: ContactFormData) {
    const response = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error('Failed to send message');
    }
  }

  // 4. Form config
  const formConfig = {
    schema: contactSchema,
    initialData: {
      name: '',
      email: '',
      message: ''
    },
    mode: 'all' as const,
    debounceMs: 500,
    asyncValidators,
    onSubmit: handleSubmit,
    onSubmitSuccess: () => {
      alert('Message sent successfully!');
    },
    onSubmitError: (error) => {
      alert(`Error: ${error.message}`);
    }
  };
</script>

<Form config={formConfig}>
  {#snippet children({ store })}
    <div class="space-y-4">
      <FormField name="name">
        {#snippet children({ value, error, touched, isValidating })}
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl name="name">
              <Input
                type="text"
                value={value}
                onchange={(e) => store.dispatch({
                  type: 'fieldChanged',
                  field: 'name',
                  value: e.currentTarget.value
                })}
                onblur={() => store.dispatch({ type: 'fieldBlurred', field: 'name' })}
                disabled={store.state.isSubmitting}
              />
            </FormControl>
            <FormDescription>Your full name</FormDescription>
            {#if touched && error}
              <FormMessage variant="error">{error}</FormMessage>
            {/if}
            {#if isValidating}
              <FormMessage variant="loading">Validating...</FormMessage>
            {/if}
          </FormItem>
        {/snippet}
      </FormField>

      <FormField name="email">
        {#snippet children({ value, error, touched, isValidating })}
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl name="email">
              <Input
                type="email"
                value={value}
                onchange={(e) => store.dispatch({
                  type: 'fieldChanged',
                  field: 'email',
                  value: e.currentTarget.value
                })}
                onblur={() => store.dispatch({ type: 'fieldBlurred', field: 'email' })}
                disabled={store.state.isSubmitting}
              />
            </FormControl>
            <FormDescription>We'll never share your email</FormDescription>
            {#if touched && error}
              <FormMessage variant="error">{error}</FormMessage>
            {/if}
            {#if isValidating}
              <FormMessage variant="loading">Checking availability...</FormMessage>
            {/if}
          </FormItem>
        {/snippet}
      </FormField>

      <FormField name="message">
        {#snippet children({ value, error, touched })}
          <FormItem>
            <FormLabel>Message</FormLabel>
            <FormControl name="message">
              <Textarea
                value={value}
                onchange={(e) => store.dispatch({
                  type: 'fieldChanged',
                  field: 'message',
                  value: e.currentTarget.value
                })}
                onblur={() => store.dispatch({ type: 'fieldBlurred', field: 'message' })}
                disabled={store.state.isSubmitting}
                rows={4}
              />
            </FormControl>
            <FormDescription>Your message to us</FormDescription>
            {#if touched && error}
              <FormMessage variant="error">{error}</FormMessage>
            {/if}
          </FormItem>
        {/snippet}
      </FormField>

      {#if store.state.submitError}
        <FormMessage variant="error">{store.state.submitError}</FormMessage>
      {/if}

      <div class="flex gap-2">
        <Button
          type="submit"
          loading={store.state.isSubmitting}
          disabled={store.state.isValidating}
        >
          Send Message
        </Button>

        <Button
          type="button"
          variant="ghost"
          onclick={() => store.dispatch({ type: 'formReset' })}
          disabled={store.state.isSubmitting}
        >
          Reset
        </Button>
      </div>

      {#if store.state.lastSubmitted}
        <p class="text-sm text-green-600">
          Last submitted: {store.state.lastSubmitted.toLocaleTimeString()}
        </p>
      {/if}
    </div>
  {/snippet}
</Form>
```

### Example 2: Registration with Cross-Field Validation

```typescript
// RegistrationForm.svelte
<script lang="ts">
  import { z } from 'zod';
  import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, Button, Input } from '@composable-svelte/core/components';

  // Schema with refinements for cross-field validation
  const registrationSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    email: z.string().email('Invalid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string()
  }).refine(
    (data) => data.password === data.confirmPassword,
    {
      message: "Passwords don't match",
      path: ['confirmPassword'] // Error goes to confirmPassword field
    }
  );

  type RegistrationData = z.infer<typeof registrationSchema>;

  const formConfig = {
    schema: registrationSchema,
    initialData: {
      username: '',
      email: '',
      password: '',
      confirmPassword: ''
    },
    mode: 'all' as const,
    asyncValidators: {
      username: async (username: string) => {
        const response = await fetch(`/api/check-username?username=${username}`);
        const { available } = await response.json();
        if (!available) {
          throw new Error('Username already taken');
        }
      }
    },
    onSubmit: async (data: RegistrationData) => {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error('Registration failed');
      }
    }
  };
</script>

<Form config={formConfig}>
  {#snippet children({ store })}
    <!-- Username field -->
    <FormField name="username">
      {#snippet children({ value, error, touched, isValidating })}
        <FormItem>
          <FormLabel>Username</FormLabel>
          <FormControl name="username">
            <Input
              type="text"
              value={value}
              onchange={(e) => store.dispatch({
                type: 'fieldChanged',
                field: 'username',
                value: e.currentTarget.value
              })}
              onblur={() => store.dispatch({ type: 'fieldBlurred', field: 'username' })}
            />
          </FormControl>
          {#if touched && error}
            <FormMessage variant="error">{error}</FormMessage>
          {/if}
          {#if isValidating}
            <FormMessage variant="loading">Checking availability...</FormMessage>
          {/if}
        </FormItem>
      {/snippet}
    </FormField>

    <!-- Email, Password, Confirm Password fields... -->

    <Button type="submit" loading={store.state.isSubmitting}>
      Register
    </Button>
  {/snippet}
</Form>
```

---

## Testing Strategy

### TestStore Comprehensive Coverage

```typescript
// form.test.ts
import { describe, it, expect, vi } from 'vitest';
import { TestStore } from '@composable-svelte/core/test';
import { createFormReducer, createInitialFormState } from './form.reducer';
import { z } from 'zod';

describe('Form Reducer', () => {
  const schema = z.object({
    name: z.string().min(2, 'Too short'),
    email: z.string().email('Invalid email')
  });

  const config = {
    schema,
    initialData: { name: '', email: '' },
    mode: 'all' as const,
    onSubmit: vi.fn().mockResolvedValue(undefined)
  };

  it('updates field value on change', async () => {
    const store = new TestStore({
      initialState: createInitialFormState(config),
      reducer: createFormReducer(config),
      dependencies: {}
    });

    await store.send(
      { type: 'fieldChanged', field: 'name', value: 'John' },
      (state) => {
        expect(state.data.name).toBe('John');
        expect(state.fields.name.dirty).toBe(true);
        expect(state.fields.name.error).toBe(null);
      }
    );

    // Should trigger debounced validation
    await store.receive(
      { type: 'fieldValidationStarted', field: 'name' }
    );

    await store.receive(
      { type: 'fieldValidationCompleted', field: 'name', error: null }
    );

    store.finish();
  });

  it('validates field on blur', async () => {
    const store = new TestStore({
      initialState: createInitialFormState(config),
      reducer: createFormReducer(config),
      dependencies: {}
    });

    // Change field
    await store.send({ type: 'fieldChanged', field: 'name', value: 'J' });
    await store.receive({ type: 'fieldValidationStarted', field: 'name' });
    await store.receive({ type: 'fieldValidationCompleted', field: 'name', error: null });

    // Blur field - should trigger validation
    await store.send(
      { type: 'fieldBlurred', field: 'name' },
      (state) => {
        expect(state.fields.name.touched).toBe(true);
      }
    );

    await store.receive({ type: 'fieldValidationStarted', field: 'name' });

    await store.receive(
      { type: 'fieldValidationCompleted', field: 'name', error: 'Too short' },
      (state) => {
        expect(state.fields.name.error).toBe('Too short');
      }
    );

    store.finish();
  });

  it('prevents submission with validation errors', async () => {
    const onSubmit = vi.fn();
    const configWithSubmit = { ...config, onSubmit };

    const store = new TestStore({
      initialState: createInitialFormState(configWithSubmit),
      reducer: createFormReducer(configWithSubmit),
      dependencies: {}
    });

    // Try to submit empty form
    await store.send({ type: 'submitTriggered' });

    await store.receive({ type: 'formValidationStarted' });

    await store.receive(
      {
        type: 'formValidationCompleted',
        fieldErrors: {
          name: 'Too short',
          email: 'Invalid email'
        },
        formErrors: []
      },
      (state) => {
        expect(state.fields.name.error).toBe('Too short');
        expect(state.fields.email.error).toBe('Invalid email');
        expect(state.isValidating).toBe(false);
        expect(state.submitCount).toBe(1);
      }
    );

    expect(onSubmit).not.toHaveBeenCalled();
    store.finish();
  });

  it('submits form with valid data', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const configWithSubmit = { ...config, onSubmit };

    const initialState = createInitialFormState(configWithSubmit);
    initialState.data = { name: 'John', email: 'john@example.com' };

    const store = new TestStore({
      initialState,
      reducer: createFormReducer(configWithSubmit),
      dependencies: {}
    });

    await store.send({ type: 'submitTriggered' });
    await store.receive({ type: 'formValidationStarted' });
    await store.receive({ type: 'formValidationCompleted', fieldErrors: {}, formErrors: [] });
    await store.receive({ type: 'submissionStarted' });
    await store.receive({ type: 'submissionSucceeded' }, (state) => {
      expect(state.isSubmitting).toBe(false);
      expect(state.lastSubmitted).toBeInstanceOf(Date);
    });

    expect(onSubmit).toHaveBeenCalledWith({ name: 'John', email: 'john@example.com' });
    store.finish();
  });

  it('handles async validation', async () => {
    const asyncValidator = vi.fn().mockRejectedValue(new Error('Already taken'));

    const configWithAsync = {
      ...config,
      asyncValidators: { email: asyncValidator }
    };

    const store = new TestStore({
      initialState: createInitialFormState(configWithAsync),
      reducer: createFormReducer(configWithAsync),
      dependencies: {}
    });

    await store.send({ type: 'fieldChanged', field: 'email', value: 'test@example.com' });
    await store.receive({ type: 'fieldValidationStarted', field: 'email' });
    await store.receive(
      { type: 'fieldValidationCompleted', field: 'email', error: 'Already taken' },
      (state) => {
        expect(state.fields.email.error).toBe('Already taken');
      }
    );

    expect(asyncValidator).toHaveBeenCalledWith('test@example.com');
    store.finish();
  });
});
```

---

## Migration from shadcn-svelte

### What Changes

| shadcn-svelte | Composable Svelte |
|---------------|-------------------|
| Superforms state | Form reducer state |
| `bind:value` | `value` + `onchange` dispatch |
| Formsnap field context | FormField snippet with state |
| Server validation | Client validation (can integrate server) |
| `use:enhance` | Manual submission via reducer |

### Migration Example

**Before (shadcn-svelte)**:
```svelte
<script>
  import { superForm } from 'sveltekit-superforms/client';
  import { contactSchema } from './schema';

  export let data;
  const form = superForm(data.form, {
    validators: zod(contactSchema)
  });
  const { form: formData, enhance } = form;
</script>

<form method="POST" use:enhance>
  <Form.Field {form} name="name">
    <Form.Control let:attrs>
      <Form.Label>Name</Form.Label>
      <Input {...attrs} bind:value={$formData.name} />
    </Form.Control>
    <Form.FieldErrors />
  </Form.Field>
</form>
```

**After (Composable Svelte)**:
```svelte
<script>
  import { Form, FormField, FormControl, FormLabel, FormMessage, Input } from '@composable-svelte/core/components';
  import { contactSchema } from './schema';

  const config = {
    schema: contactSchema,
    initialData: { name: '', email: '', message: '' },
    onSubmit: async (data) => {
      const response = await fetch('/api/contact', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed');
    }
  };
</script>

<Form {config}>
  {#snippet children({ store })}
    <FormField name="name">
      {#snippet children({ value, error, touched })}
        <FormItem>
          <FormLabel>Name</FormLabel>
          <FormControl name="name">
            <Input
              value={value}
              onchange={(e) => store.dispatch({
                type: 'fieldChanged',
                field: 'name',
                value: e.currentTarget.value
              })}
              onblur={() => store.dispatch({ type: 'fieldBlurred', field: 'name' })}
            />
          </FormControl>
          {#if touched && error}
            <FormMessage variant="error">{error}</FormMessage>
          {/if}
        </FormItem>
      {/snippet}
    </FormField>
  {/snippet}
</Form>
```

---

## Summary

### What We're Building

✅ **Reducer-first form system** - All state in reducer, all transitions testable
✅ **Zod integration** - Don't reinvent validation, use the best
✅ **Effect-based async** - Debounced validation, async validators, submission
✅ **TestStore coverage** - Exhaustive testing of all flows
✅ **Backend-agnostic** - Works with any API (not SvelteKit-specific)
✅ **Type-safe** - Full type inference from schema to components
✅ **Composable components** - Form.Field, Form.Control, Form.Label pattern
✅ **Progressive validation** - onBlur, onChange, onSubmit modes
✅ **Cross-field validation** - Zod refinements for password confirmation, etc.
✅ **Async validation** - Email availability, username checks, etc.
✅ **Optimistic UI** - Clear errors on change, show loading states
✅ **Accessible** - Proper ARIA attributes, label association

### Key Innovations

1. **Zod + Reducer Hybrid** - Best of both worlds
2. **Debounced validation effects** - User-friendly validation timing
3. **Explicit state flow** - Every transition is an action
4. **Backend flexibility** - Not coupled to SvelteKit
5. **TestStore-first** - Every flow is testable

### No Compromises

✅ Validation power of Zod
✅ State management of reducers
✅ Testability of TestStore
✅ Composability of components
✅ Type safety throughout
✅ Flexibility for any backend

**This is the form system that showcases why Composable Svelte exists.**
