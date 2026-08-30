---
name: composable-svelte-forms
description: Form patterns and validation for Composable Svelte. Use when building forms, validating user input, or integrating Zod schemas. Covers FormConfig, createFormReducer, field-level validation, async validation, form state management, and reactive wrapper patterns.
---

# Composable Svelte Forms

This skill covers form patterns, Zod validation integration, and state management for forms in Composable Svelte applications.

---

## FORMS SYSTEM

### Two Modes

1. **Standalone Mode**: Pass `config` to `<Form>` — it creates its own internal store
2. **Integrated Mode** (Recommended): Pass `store` to `<Form>` — uses external store from parent reducer via `scope()`

Passing both, or neither, throws at runtime (`Form.svelte:39-44`).

```svelte
<!-- Standalone: Form owns the store. Good for prototypes and self-contained forms. -->
<Form config={contactFormConfig}>
  <FormField name="name">
    {#snippet children({ field, send })}
      <Input value={field.value} oninput={(e) => send({ type: 'fieldChanged', field: 'name', value: e.currentTarget.value })} />
    {/snippet}
  </FormField>
</Form>
```

**Choose integrated mode whenever the parent must react to submission** — standalone
state is invisible to the parent reducer. Everything below uses integrated mode.

---

## COMPLETE EXAMPLE (Integrated Mode)

### 1. Define Zod Schema

```typescript
import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  message: z.string().min(10, 'Message must be at least 10 characters')
});

type ContactData = z.infer<typeof contactSchema>;
```

### 2. Create Form Config

```typescript
import type { FormConfig } from '@composable-svelte/core/components/form';

export const contactFormConfig: FormConfig<ContactData> = {
  schema: contactSchema,
  initialData: { name: '', email: '', message: '' },
  mode: 'onBlur',
  debounceMs: 500,
  async onSubmit(_data) {
    // Command dispatch handled by parent reducer on submissionSucceeded
  }
};
```

### 3. Parent State & Actions

```typescript
import type { FormState, FormAction } from '@composable-svelte/core/components/form';

interface AppState {
  contactForm: FormState<ContactData>;
  submissions: Submission[];
  successMessage: string | null;
}

type AppAction =
  | { type: 'contactForm'; action: FormAction<ContactData> }
  | { type: 'successMessageDismissed' };
```

Every action in the union must be reachable and handled — an action the reducer
never produces or consumes is dead weight that hides real gaps.

### 4. Parent Reducer with scope()

Two pieces: your own logic, then the scoped form reducer. Keeping them separate is
what lets the parent observe form events without reaching into form internals.

```typescript
import { Effect, scope, type Reducer } from '@composable-svelte/core';
import { createFormReducer } from '@composable-svelte/core/components/form';

const formReducer = createFormReducer(contactFormConfig);

// 1. Parent-level logic — observes the child's actions
const coreReducer: Reducer<AppState, AppAction> = (state, action) => {
  switch (action.type) {
    case 'contactForm':
      if (action.action.type === 'submissionSucceeded') {
        const { name, email } = state.contactForm.data;
        return [
          {
            ...state,
            submissions: [...state.submissions, { name, email, at: new Date() }],
            successMessage: `Thank you, ${name}!`
          },
          Effect.afterDelay(5000, (d) => d({ type: 'successMessageDismissed' }))
        ];
      }
      return [state, Effect.none()]; // the form reducer handles the rest

    case 'successMessageDismissed':
      return [{ ...state, successMessage: null }, Effect.none()];
  }
};

// 2. Compose: parent logic first, then the scoped form
export const appReducer: Reducer<AppState, AppAction> = (state, action, deps) => {
  const [s1, e1] = coreReducer(state, action, deps);

  const scopedForm = scope<AppState, AppAction, FormState<ContactData>, FormAction<ContactData>>(
    (s) => s.contactForm,
    (s, child) => ({ ...s, contactForm: child }),
    (a) => (a.type === 'contactForm' ? a.action : null),
    (childAction) => ({ type: 'contactForm', action: childAction }),
    formReducer
  );

  const [s2, e2] = scopedForm(s1, action, deps);
  return [s2, Effect.batch(e1, e2)];
};
```

Observe by returning updated parent state directly. **Never** `dispatch(... as any)`
to escape your own action union — if you need a domain command, add it to
`AppAction`.

Working reference: `examples/contact-form/src/app/app.reducer.ts` (reducer only —
that example has no Tailwind pipeline, so it renders unstyled).

### 5. Component with Reactive Wrapper

```svelte
<script lang="ts">
  import { Form, FormField, FormItem, FormLabel, FormMessage } from '@composable-svelte/core/components/form';
  import { Input, Textarea, Button } from '@composable-svelte/core/components/ui';
  import type { Store } from '@composable-svelte/core';
  import type { FormAction } from '@composable-svelte/core/components/form';
  import type { ContactData } from './schemas';

  let { store, onSuccess }: {
    store: Store<AppState, AppAction>;
    onSuccess?: () => void;
  } = $props();

  // Reactive wrapper — exposes the form slice as a store-shaped object
  let formStoreState = $state(store.state.contactForm);
  $effect(() => {
    formStoreState = store.state.contactForm;
  });

  const formStore = {
    get state() { return formStoreState; },
    dispatch(action: FormAction<ContactData>) {
      store.dispatch({ type: 'contactForm', action });
    },
    // MUST emit the form slice, not parent state — FormField reads $store.data[name]
    subscribe(listener: (s: typeof formStoreState) => void) {
      return store.subscribe((s) => listener(s.contactForm));
    }
  };

  let prevSubmitted = $state<Date | null>(null);
  $effect(() => {
    const current = formStoreState?.lastSubmitted;
    if (current && current !== prevSubmitted) {
      prevSubmitted = current;
      onSuccess?.();
    }
  });
</script>

<Form store={formStore}>
  <div class="space-y-6">

    <!-- Text Input -->
    <FormField name="name">
      {#snippet children({ field, send })}
        <FormItem>
          <FormLabel>Name *</FormLabel>
          <Input
            value={field.value}
            oninput={(e) => send({ type: 'fieldChanged', field: 'name', value: e.currentTarget.value })}
            onblur={() => send({ type: 'fieldBlurred', field: 'name' })}
            placeholder="John Doe"
          />
          <FormMessage />
        </FormItem>
      {/snippet}
    </FormField>

    <!-- Email Input -->
    <FormField name="email">
      {#snippet children({ field, send })}
        <FormItem>
          <FormLabel>Email *</FormLabel>
          <Input
            type="email"
            value={field.value}
            oninput={(e) => send({ type: 'fieldChanged', field: 'email', value: e.currentTarget.value })}
            onblur={() => send({ type: 'fieldBlurred', field: 'email' })}
            placeholder="john@example.com"
          />
          <FormMessage />
        </FormItem>
      {/snippet}
    </FormField>

    <!-- Textarea -->
    <FormField name="message">
      {#snippet children({ field, send })}
        <FormItem>
          <FormLabel>Message *</FormLabel>
          <Textarea
            value={field.value}
            oninput={(e) => send({ type: 'fieldChanged', field: 'message', value: e.currentTarget.value })}
            onblur={() => send({ type: 'fieldBlurred', field: 'message' })}
            rows={4}
            placeholder="Your message here..."
          />
          <FormMessage />
        </FormItem>
      {/snippet}
    </FormField>

    <!-- Submit -->
    {#if formStoreState?.submitError}
      <div class="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{formStoreState.submitError}</div>
    {/if}
    <div class="flex gap-3">
      <Button type="submit" disabled={formStoreState?.isSubmitting}>
        {formStoreState?.isSubmitting ? 'Sending...' : 'Send Message'}
      </Button>
      <Button variant="outline" onclick={() => onSuccess?.()}>Cancel</Button>
    </div>

  </div>
</Form>
```

---

## FORMFIELD COMPONENT — THE CORE PATTERN

**FormField** uses Svelte 5 snippets to provide `field` state and `send` dispatcher to children:

```svelte
<FormField name="fieldName">
  {#snippet children({ field, send })}
    <FormItem>
      <FormLabel>Label</FormLabel>
      <!-- input component here -->
      <FormMessage />
    </FormItem>
  {/snippet}
</FormField>
```

**Props:**
- `name: string` — must match a key in the form data shape
- `children: Snippet<[{ field: FieldState, send: (action) => void }]>` — snippet providing field state and action dispatcher

**FieldState** (provided as `field`):
```typescript
{
  value: any;           // Current field value
  touched: boolean;     // Has user interacted?
  dirty: boolean;       // Has value changed from initial?
  error: string | null; // Validation error message
  isValidating: boolean; // Async validation in progress
  warnings: string[];   // Non-blocking warnings
}
```

**`send`** dispatches FormActions to the form store. Common actions:
- `send({ type: 'fieldChanged', field: 'name', value: newValue })`
- `send({ type: 'fieldBlurred', field: 'name' })`

---

## INPUT COMPONENT WIRING REFERENCE

### Text Input

```svelte
<Input
  value={field.value}
  oninput={(e) => send({ type: 'fieldChanged', field: 'name', value: e.currentTarget.value })}
  onblur={() => send({ type: 'fieldBlurred', field: 'name' })}
/>
```

### Number Input

```svelte
<Input
  type="number"
  value={field.value}
  oninput={(e) => send({ type: 'fieldChanged', field: 'quantity', value: Number(e.currentTarget.value) })}
  onblur={() => send({ type: 'fieldBlurred', field: 'quantity' })}
/>
```

### Textarea

```svelte
<Textarea
  value={field.value}
  oninput={(e) => send({ type: 'fieldChanged', field: 'message', value: e.currentTarget.value })}
  onblur={() => send({ type: 'fieldBlurred', field: 'message' })}
  rows={4}
/>
```

### Select (Dropdown)

**CRITICAL**: Select uses `onchange` callback (NOT `onValueChange`) and `options` prop (NOT `SelectTrigger`/`SelectContent`/`SelectItem` children).

```svelte
<Select
  value={field.value}
  options={[
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
  ]}
  onchange={(v) => send({ type: 'fieldChanged', field: 'fruit', value: v })}
  placeholder="Select..."
/>
```

**Select Props:**
- `options: { value: T; label: string; disabled?: boolean }[]`
- `value?: T | T[] | null` — current value
- `onchange?: (value: T | T[] | null) => void` — change callback
- `placeholder?: string`
- `searchable?: boolean`
- `multiple?: boolean`

### Switch (Toggle)

**CRITICAL**: Switch has no `onCheckedChange`. `checked` **is** `$bindable`
(`Switch.svelte:43`), so `bind:checked` works in general — but you cannot bind to
`field.value`, which is a read-only snippet parameter. Use one-way
`checked={field.value}` + `onclick`. A caller-supplied `onclick` replaces the
component's internal toggle (restProps are spread after it), which is what keeps
the store the single source of truth.

```svelte
<Switch
  checked={field.value}
  onclick={() => send({ type: 'fieldChanged', field: 'isActive', value: !field.value })}
/>
```

### Date Input

> ⚠️ `Input`'s `type` union is `'text' | 'email' | 'password' | 'number' | 'tel' |
> 'url' | 'search'` (`Input.svelte:46`) — it narrows the inherited HTML attribute
> type, so `type="date"` renders correctly at runtime but **fails `svelte-check`**.
> Use a plain `<input>` (below), the `Calendar` component, or widen the union.

```svelte
<input
  type="date"
  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
  value={field.value}
  oninput={(e) => send({ type: 'fieldChanged', field: 'date', value: e.currentTarget.value })}
  onblur={() => send({ type: 'fieldBlurred', field: 'date' })}
/>
```

---

## COMMON CALLBACK MISTAKES

| Component | WRONG | CORRECT |
|-----------|-------|---------|
| Select | `onValueChange` | `onchange` |
| Select | `<SelectTrigger>/<SelectItem>` children | `options` prop |
| Switch | `onCheckedChange` | `onclick` with manual toggle |
| Switch | `bind:checked={field.value}` (field.value is read-only) | `checked={field.value}` (one-way) + `onclick` |
| Input | `onchange` | `oninput` |

---

## FORM COMPONENTS

All exported from `@composable-svelte/core/components/form`:

| Component | Purpose |
|-----------|---------|
| `Form` | `<form>` wrapper — handles submit, provides store context. Pass `store` (integrated) or `config` (standalone) |
| `FormField` | Field wrapper — provides `{ field, send }` via snippet to children |
| `FormItem` | Layout wrapper — consistent spacing (`space-y-2`) for label + input + message |
| `FormLabel` | Label with error styling. Emits `for={fieldName}`, but only links if `FormControl` wraps the input — that is the only thing that sets a matching `id` |
| `FormMessage` | Error display — auto-shows field error from context |
| `FormDescription` | Helper text below a field |
| `FormControl` | Optional input wrapper (spread-props pattern) |

UI inputs from `@composable-svelte/core/components/ui`:

| Component | Props for forms |
|-----------|----------------|
| `Input` | `value`, `oninput`, `onblur`, `type`, `placeholder`, `class` |
| `Textarea` | `value`, `oninput`, `onblur`, `rows`, `placeholder`, `class` |
| `Select` | `value`, `options`, `onchange`, `placeholder`, `searchable`, `class` |
| `Switch` | `checked`, `onclick`, `disabled`, `class` |
| `Button` | `type="submit"`, `disabled`, `variant`, `class` |

---

## FORM STATE REFERENCE

### FormState Type

```typescript
interface FormState<T extends Record<string, any>> {
  data: T;                                    // Current form data
  fields: { [K in keyof T]: FieldState };     // Per-field state
  schema: ZodSchema<T>;                       // Zod schema
  formErrors: string[];                       // Cross-field validation errors
  isValidating: boolean;                      // Form-level validation in progress
  isSubmitting: boolean;                      // Currently submitting
  submitCount: number;                        // Submission attempts
  submitError: string | null;                 // Last submission error
  lastSubmitted: Date | null;                 // Last successful submit timestamp
}

interface FieldState {
  value: any;           // Current field value
  touched: boolean;     // Has user interacted?
  dirty: boolean;       // Has value changed from initial?
  error: string | null; // Validation error
  isValidating: boolean; // Async validation in progress
  warnings: string[];   // Non-blocking warnings
}
```

### Accessing Field Errors

```svelte
// Via FormMessage component (automatic — reads from context)
<FormMessage />

// Manual access
{#if field.error && field.touched}
  <p class="text-sm text-destructive">{field.error}</p>
{/if}
```

---

## FORM ACTIONS

```typescript
type FormAction<T> =
  // Field interactions
  | { type: 'fieldChanged'; field: keyof T; value: unknown }
  | { type: 'fieldBlurred'; field: keyof T }
  | { type: 'fieldFocused'; field: keyof T }
  // Validation lifecycle
  | { type: 'fieldValidationStarted'; field: keyof T }
  | { type: 'fieldValidationCompleted'; field: keyof T; error: string | null; warnings?: string[] }
  | { type: 'formValidationStarted' }
  | { type: 'formValidationCompleted'; fieldErrors: Partial<Record<keyof T, string>>; formErrors: string[] }
  // Submission lifecycle
  | { type: 'submitTriggered' }
  | { type: 'submissionStarted' }
  | { type: 'submissionSucceeded'; response?: unknown }  // reducer never populates response
  | { type: 'submissionFailed'; error: string }
  // Form management
  | { type: 'formReset'; data?: T }
  | { type: 'setFieldValue'; field: keyof T; value: unknown }
  | { type: 'setFieldError'; field: keyof T; error: string }
  | { type: 'clearFieldError'; field: keyof T };
```

---

## REACTIVE WRAPPER PATTERN

**Why needed**: The `<Form>` component expects a store-like object with `state`, `dispatch`, and `subscribe`. In integrated mode, we create a wrapper that delegates to the parent store.

```typescript
// Reactive wrapper for form store
let formStoreState = $state(parentStore.state.contactForm);

$effect(() => {
  formStoreState = parentStore.state.contactForm;
});

const formStore = {
  get state() { return formStoreState; },
  dispatch(action: FormAction<ContactData>) {
    parentStore.dispatch({ type: 'contactForm', action });
  },
  subscribe(listener: any) {
    return parentStore.subscribe((s: any) => listener(s.contactForm));
  }
};
```

---

## PARENT OBSERVATION

The parent reducer observes form lifecycle events by matching on the wrapped child
action and returning updated parent state — see `coreReducer` in step 4 above for
the full pattern.

```typescript
case 'contactForm':
  if (action.action.type === 'submissionSucceeded') {
    // Update parent state directly. No Effect.run, no dispatch, no `as any`.
    return [{ ...state, successMessage: 'Saved' }, Effect.none()];
  }
  return [state, Effect.none()];
```

Events worth observing: `submissionSucceeded`, `submissionFailed`,
`fieldChanged`, `formValidationCompleted`.

---

## FORM CONFIGURATION

```typescript
interface FormConfig<T> {
  schema: z.ZodSchema<T>;                // Zod validation schema
  initialData: T;                        // Initial form values
  mode?: 'onBlur' | 'onChange' | 'onSubmit' | 'all';  // When to validate
  debounceMs?: number;                   // Debounce for onChange (default: 300ms)
  onSubmit: (data: T) => Promise<void>;  // Submission handler
  onSubmitSuccess?: (data: T) => void;   // Success callback
  onSubmitError?: (error: Error) => void; // Error callback
  asyncValidators?: {                    // Per-field async validators
    [K in keyof T]?: (value: T[K]) => Promise<void>
  };
}
```

### Async Validation

`asyncValidators` are **per-field functions on `FormConfig`** — not `z.refine(async …)`,
which the reducer never invokes. They run only after that field's Zod validation
passes. Throw to fail; the thrown message becomes the field error
(`form.reducer.ts:215-223`).

```typescript
const config: FormConfig<ContactData> = {
  schema: contactSchema,
  initialData: { name: '', email: '' },
  asyncValidators: {
    email: async (email) => {
      const available = await api.checkEmail(email);
      if (!available) throw new Error('Email already registered');
    }
  },
  onSubmit: async (data) => { await api.createContact(data); }
};
```

Lifecycle: `fieldValidationStarted` → Zod → async validator →
`fieldValidationCompleted`. Show progress with `field.isValidating`. Network errors
are caught and surfaced as the field error rather than crashing.

Working reference: `examples/contact-form/src/features/contact-form/contact-form.config.ts`.

### Validation Modes

- `'onBlur'` — Validate on blur + submit (recommended for most forms)
- `'onChange'` — Validate on change (debounced) + submit
- `'onSubmit'` — Validate only on submit
- `'all'` — Validate on blur, change, and submit (most feedback)

---

## SUBMISSION FLOW

```
User clicks submit button (type="submit")
  → <Form> intercepts with onsubmit, calls event.preventDefault()
  → Dispatches { type: 'submitTriggered' }
  → Form reducer validates entire form with Zod schema
  → If validation fails: sets field errors, increments submitCount, stops
  → If validation passes: dispatches { type: 'submissionStarted' }
  → Calls config.onSubmit(data)
  → On success: dispatches { type: 'submissionSucceeded' }, sets lastSubmitted
  → On failure: dispatches { type: 'submissionFailed', error: message }
  → Parent observes submissionSucceeded to dispatch domain command
```

---

## ANTI-PATTERNS

### 1. Wrong FormField API

```svelte
<!-- WRONG — old prop-based API that doesn't exist -->
<FormField field="name" send={...} state={...}>
  <input type="text" />
</FormField>

<!-- CORRECT — snippet-based API -->
<FormField name="name">
  {#snippet children({ field, send })}
    <FormItem>
      <FormLabel>Name</FormLabel>
      <Input value={field.value} oninput={...} onblur={...} />
      <FormMessage />
    </FormItem>
  {/snippet}
</FormField>
```

### 2. Wrong Select API

```svelte
<!-- WRONG — onValueChange doesn't exist, child components not supported -->
<Select value={field.value} onValueChange={(v) => send(...)}>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="a">A</SelectItem>
  </SelectContent>
</Select>

<!-- CORRECT — onchange + options prop -->
<Select
  value={field.value}
  options={[{ value: 'a', label: 'A' }]}
  onchange={(v) => send({ type: 'fieldChanged', field: 'name', value: v })}
/>
```

### 3. Wrong Switch API

```svelte
<!-- WRONG -->
<Switch checked={field.value} onCheckedChange={(v) => send(...)} />
<Switch bind:checked={field.value} />

<!-- CORRECT -->
<Switch checked={field.value} onclick={() => send({ type: 'fieldChanged', field: 'active', value: !field.value })} />
```

### 4. Raw form instead of Form component

```svelte
<!-- WRONG — manual form, bypasses Form component's submit handling -->
<form onsubmit={(e) => { e.preventDefault(); formStore.dispatch({ type: 'submit' }); }}>

<!-- CORRECT — Form component handles submit internally -->
<Form store={formStore}>
```

### 5. Wrong state access

```typescript
// WRONG — errors record doesn't exist
formStore.state.errors.email

// CORRECT — per-field state
formStore.state.fields.email.error

// WRONG — submission.status doesn't exist
formStore.state.submission.status === 'submitting'

// CORRECT
formStore.state.isSubmitting
```

---

## CHECKLIST

- [ ] Define Zod schema
- [ ] Create FormConfig with schema, initialData, mode, onSubmit
- [ ] Add `FormState<T>` to parent state
- [ ] Create form reducer with `createFormReducer(config)`
- [ ] Wire into parent reducer with `scope()`
- [ ] Parent observes `submissionSucceeded` to dispatch domain command
- [ ] Create reactive wrapper in component (`$state` + `$effect`)
- [ ] Use `<Form store={formStore}>` (NOT raw `<form>`)
- [ ] Use `<FormField name="...">` with `{#snippet children({ field, send })}` pattern
- [ ] Use correct callbacks: `oninput`/`onblur` for Input/Textarea, `onchange` for Select, `onclick` for Switch
- [ ] Use `formStoreState?.isSubmitting` for loading state
- [ ] Watch `formStoreState?.lastSubmitted` to navigate back on success
- [ ] Test the reducer with `createTestStore` from `@composable-svelte/core/test` — see **composable-svelte-testing**

### Working examples in this repo

Reference these for **reducer composition and form config**, not for styling —
none of the three has a Tailwind pipeline (no `postcss.config`, no
`tailwind.config`), so the core components in them render unstyled.

- `examples/contact-form/` — integrated mode, parent observation, `asyncValidators`
- `examples/registration-form/` — cross-field refinement
- `examples/multi-step-form/` — two scoped forms plus step progression

---

## SUMMARY

1. **Form component** wraps everything, handles submit via `{ type: 'submitTriggered' }`
2. **FormField snippet** provides `{ field, send }` — field state + action dispatcher
3. **Input/Textarea**: `value` + `oninput` + `onblur`
4. **Select**: `value` + `options` + `onchange` (NOT onValueChange, NOT child components)
5. **Switch**: `checked` + `onclick` (no onCheckedChange; can't bind to the read-only `field.value`)
6. **Reactive wrapper**: `$state` + `$effect` + getter/dispatch/subscribe object
7. **Parent observation**: watch for `submissionSucceeded` to dispatch domain commands

For core architecture, see **composable-svelte-core** skill.
For navigation with forms, see **composable-svelte-navigation** skill.
For testing forms, see **composable-svelte-testing** skill.
For component library, see **composable-svelte-components** skill.
