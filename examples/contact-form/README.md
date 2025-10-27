# Contact Form Example - Integrated Mode

This example demonstrates the **composable architecture** pattern for forms in Composable Svelte.

## What This Shows

### 1. Form Integration with Parent Reducer

The contact form is integrated into the app reducer using `scope()`:

```typescript
const formReducer = createFormReducer(contactFormConfig);

export const appReducer: Reducer<AppState, AppAction, {}> = (state, action, deps) => {
  // Run core reducer first
  const [s1, e1] = coreReducer(state, action, deps);

  // Then run scoped form reducer
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
```

This means:
- ✅ Form state is managed by the parent reducer
- ✅ Form actions flow through the parent
- ✅ Parent can observe form events (e.g., submission success)
- ✅ Form is fully testable with TestStore
- ✅ Form state persists across navigation (if needed)

### 2. Parent Observing Child Actions

The parent reducer can react to form events:

```typescript
case 'contactForm': {
  // Observe form submission success
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
        successMessage: `Thank you, ${formData.name}!`
      },
      Effect.afterDelay(5000, (d) => d({ type: 'successMessageDismissed' }))
    ];
  }
  return [state, Effect.none()];
}
```

### 3. Scoped Store for Components

The UI component receives a scoped store pointing at the form state:

```typescript
const store = createStore({ initialState, reducer: appReducer, dependencies: {} });
const formStore = scopeTo(store).into('contactForm');
```

Then pass it to the Form component in **integrated mode**:

```svelte
<Form store={formStore}>
  <FormField name="email">
    <!-- ... -->
  </FormField>
</Form>
```

## Architecture Diagram

```
┌──────────────────────────────────────────┐
│ App Reducer (Parent)                     │
│                                          │
│ - submissionHistory                      │
│ - successMessage                         │
│ - Observes form.submissionSucceeded      │
└────────────────┬─────────────────────────┘
                 │
                 │ scope() composition
                 │
                 ↓
┌──────────────────────────────────────────┐
│ Form Reducer (Child)                     │
│                                          │
│ - data: { name, email, message }         │
│ - fields: { touched, error, ... }        │
│ - validation state                       │
│ - submission state                       │
└──────────────────────────────────────────┘
```

## Key Patterns Demonstrated

1. **Reducer Composition** - `scope()` composes child reducers into parent
2. **Scoped Stores** - `scopeTo().into()` creates component-level stores
3. **Parent Observation** - Parent reacts to child form events
4. **Effect Orchestration** - Auto-dismiss success message with `Effect.afterDelay()`
5. **Type Safety** - Full type inference from Zod schema to components
6. **Testability** - Every state transition testable with TestStore

## Comparison: Standalone vs Integrated

| Pattern | When to Use | How |
|---------|-------------|-----|
| **Standalone** | Simple forms that don't need parent coordination | `<Form config={formConfig}>` |
| **Integrated** | Forms in larger apps, multi-step forms, need parent observation | `<Form store={scopedStore}>` |

## Files to Study

1. `contact-form.types.ts` - Zod schema and type definitions
2. `contact-form.config.ts` - Form configuration (validation, submission)
3. `app.types.ts` - Parent state with integrated form
4. `app.reducer.ts` - **Key file** - Shows integration and observation patterns
5. `App.svelte` - UI component using scoped store

## Testing

The integrated form can be fully tested with TestStore:

```typescript
const store = createTestStore({ initialState, reducer: appReducer });

// Test form submission flows through parent
await store.send({ type: 'contactForm', action: { type: 'submitTriggered' } });
await store.receive({ type: 'contactForm', action: { type: 'formValidationStarted' } });
// ... etc

// Test parent observation
expect(store.state.submissionHistory).toHaveLength(1);
expect(store.state.successMessage).toContain('Thank you');
```

## Run This Example

```bash
cd examples/contact-form
pnpm install
pnpm dev
```

Open http://localhost:5173 and submit the form to see:
- Real-time validation
- Async email validation
- Success message after submission
- Submission history tracking
