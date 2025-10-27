# Multi-Step Form Example - Composable Svelte

A comprehensive example of a multi-step onboarding wizard using Composable Svelte's integrated form mode. This example demonstrates how to build complex, stateful form flows with navigation, data accumulation, and validation across multiple steps.

## Features

### Form Architecture
- **3-Step Wizard**: Personal Info → Address → Review
- **Integrated Mode**: Forms composed into parent app reducer using `scope()`
- **Data Accumulation**: Each step's data is saved before progressing
- **Step Validation**: Cannot advance without valid current step data
- **Bidirectional Navigation**: Next/Previous buttons with data preservation
- **Review Step**: Read-only summary of all collected data with edit links

### Validation
- **Field-Level Validation**: Zod schemas for each step
- **Async Validation**: Email domain check (Step 1), Zip code validation (Step 2)
- **Cross-Step Validation**: Parent ensures all steps completed before final submission
- **Real-Time Feedback**: Validation on blur and change
- **Error Messages**: Field-specific errors with helpful guidance

### User Experience
- **Progress Indicator**: Visual step tracker with completed checkmarks
- **Click-to-Navigate**: Jump to completed steps via indicator
- **Edit from Review**: Quick links to edit specific sections
- **Loading States**: Clear feedback during async operations
- **Success Screen**: Confirmation with full data summary
- **Reset Flow**: Start over after completion

## Project Structure

```
multi-step-form/
├── src/
│   ├── features/onboarding/
│   │   ├── onboarding.types.ts          # Zod schemas for all steps
│   │   ├── personal-info.config.ts      # Form config for step 1
│   │   └── address.config.ts            # Form config for step 2
│   ├── components/
│   │   └── StepIndicator.svelte         # Progress indicator component
│   ├── app/
│   │   ├── app.types.ts                 # App state and action types
│   │   ├── app.state.ts                 # Initial state factory
│   │   ├── app.reducer.ts               # Parent reducer with step logic
│   │   └── App.svelte                   # Main component
│   └── main.ts
├── tests/
│   └── app.browser.test.ts              # Comprehensive browser tests
└── package.json
```

## Key Concepts

### 1. Form Composition with `scope()`

Each step has its own form reducer composed into the parent:

```typescript
// app.reducer.ts
const personalInfoFormReducer = createFormReducer(personalInfoFormConfig);
const addressFormReducer = createFormReducer(addressFormConfig);

export const appReducer: Reducer<AppState, AppAction, {}> = (state, action, deps) => {
  const [s1, e1] = coreReducer(state, action, deps);

  // Compose personal info form
  const scopedPersonalInfoFormReducer = scope<AppState, AppAction, any, any, {}>(
    (s) => s.personalInfoForm,                           // Extract child state
    (s, child) => ({ ...s, personalInfoForm: child }),   // Update parent
    (a) => (a.type === 'personalInfoForm' ? a.action : null),  // Extract action
    (childAction) => ({ type: 'personalInfoForm', action: childAction }),  // Wrap action
    personalInfoFormReducer
  );

  const [s2, e2] = scopedPersonalInfoFormReducer(s1, action, deps);

  // Compose address form
  const scopedAddressFormReducer = scope(/* ... */);
  const [s3, e3] = scopedAddressFormReducer(s2, action, deps);

  return [s3, Effect.batch(e1, e2, e3)];
};
```

### 2. Parent Observes Child Events

The parent reducer listens for form submission success to capture data:

```typescript
case 'personalInfoForm': {
  // Observe submission success
  if (action.action.type === 'submissionSucceeded') {
    const formData = state.personalInfoForm.data;
    return [
      {
        ...state,
        completedData: {
          ...state.completedData,
          personalInfo: formData  // Save data
        }
      },
      Effect.none()
    ];
  }
  return [state, Effect.none()];
}
```

### 3. Step Navigation Logic

Parent validates current step before allowing progression:

```typescript
case 'nextStep': {
  if (currentStep === 'personalInfo') {
    const form = state.personalInfoForm;
    if (!_isFormValid(form)) {
      // Trigger validation to show errors
      return [
        state,
        Effect.run(async (dispatch) => {
          dispatch({
            type: 'personalInfoForm',
            action: { type: 'submitTriggered' }
          });
        })
      ];
    }
    // Valid - move to next step
    return [{ ...state, currentStep: 'address' }, Effect.none()];
  }
  // ... similar for other steps
}
```

### 4. Reactive Store Wrappers

Components create reactive wrappers for scoped form access:

```svelte
<script lang="ts">
  // Create parent store
  const parentStore = createStore({ /* ... */ });

  // Create reactive wrapper for personal info form
  let personalInfoFormState = $state(parentStore.state.personalInfoForm);

  $effect(() => {
    personalInfoFormState = parentStore.state.personalInfoForm;
  });

  const personalInfoFormStore = {
    get state() {
      return personalInfoFormState;
    },
    dispatch(action: any) {
      parentStore.dispatch({ type: 'personalInfoForm', action });
    },
    subscribe(listener: any) {
      return parentStore.subscribe(listener);
    }
  };
</script>

<Form store={personalInfoFormStore}>
  <!-- form fields -->
</Form>
```

## Running the Example

### Development Server

```bash
cd examples/multi-step-form
pnpm install
pnpm dev
```

Visit http://localhost:5173

### Run Tests

```bash
pnpm test          # Run all tests once
pnpm test:watch    # Watch mode
pnpm test:ui       # Interactive UI
```

### Build for Production

```bash
pnpm build
pnpm preview
```

## Test Coverage

The example includes 30+ browser tests covering:

- **Initial Render**: Step indicator, form visibility, navigation buttons
- **Step 1 Validation**: Field validation (firstName, lastName, email, phone)
- **Step 2 Validation**: Address validation (street, city, state, zipCode)
- **Async Validation**: Email domain check, zip code serviceability
- **Navigation**: Next/Previous buttons, direct step navigation via indicator
- **Data Persistence**: Data preserved when navigating between steps
- **Review Step**: Display of all data, edit links to specific steps
- **Final Submission**: Success flow, loading states, reset functionality
- **Edge Cases**: Invalid data prevention, disabled states, error handling

## Form Schemas

### Step 1: Personal Info

```typescript
const personalInfoSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(/^\d{3}-\d{3}-\d{4}$/, 'Phone must be in format: 123-456-7890')
});
```

**Async Validation**:
- Email domain `@blocked.com` is rejected

### Step 2: Address

```typescript
const addressSchema = z.object({
  street: z.string().min(5, 'Street address must be at least 5 characters'),
  city: z.string().min(2, 'City must be at least 2 characters'),
  state: z.string().length(2, 'State must be 2 letters').regex(/^[A-Z]{2}$/, 'State must be uppercase'),
  zipCode: z.string().regex(/^\d{5}$/, 'Zip code must be 5 digits')
});
```

**Async Validation**:
- Zip codes `00000` and `99999` are rejected as "not serviceable"

## Architectural Decisions

### Why Integrated Mode?

Multi-step forms benefit from integrated mode because:

1. **Centralized State**: Parent manages overall wizard flow
2. **Cross-Step Logic**: Parent can validate completeness before final submission
3. **Data Accumulation**: Natural place to store completed step data
4. **Navigation Control**: Parent decides when/how to advance steps
5. **Testability**: Single store for entire flow simplifies testing

### Why Separate Form Configs?

Each step has its own form config for:

1. **Isolation**: Step 1 and Step 2 are independent concerns
2. **Reusability**: Forms could be used standalone elsewhere
3. **Validation Scope**: Each step validates only its own data
4. **Maintainability**: Changes to one step don't affect others

### Why Parent Observes Form Events?

The parent listens for `submissionSucceeded` to:

1. **Capture Data**: Save validated data before moving to next step
2. **Timing**: Know exactly when form is valid and ready
3. **Decoupling**: Forms don't need to know about parent's data structure
4. **Composability**: Pattern works for any number of forms

## Common Patterns

### Adding a New Step

1. Create Zod schema in `onboarding.types.ts`
2. Create form config in `features/onboarding/{step-name}.config.ts`
3. Add form state to `AppState` in `app.types.ts`
4. Add form action to `AppAction` union
5. Create form reducer and compose in `app.reducer.ts`
6. Add step to `OnboardingStep` union and `STEPS` metadata
7. Add step UI to `App.svelte`
8. Update `StepIndicator` to show new step

### Custom Validation Between Steps

```typescript
case 'nextStep': {
  if (currentStep === 'personalInfo') {
    // Custom validation before progressing
    const form = state.personalInfoForm;
    const email = form.data.email;

    if (email.endsWith('@competitor.com')) {
      return [
        state,
        Effect.run(async (dispatch) => {
          dispatch({
            type: 'personalInfoForm',
            action: {
              type: 'setFieldError',
              field: 'email',
              error: 'We do not accept competitor emails'
            }
          });
        })
      ];
    }
    // ... continue normal validation
  }
}
```

### Conditional Step Flow

```typescript
case 'nextStep': {
  if (currentStep === 'personalInfo') {
    // Skip address step for certain users
    const form = state.personalInfoForm;
    if (form.data.email.endsWith('@internal.com')) {
      return [
        {
          ...state,
          currentStep: 'review',  // Skip address
          completedData: {
            ...state.completedData,
            address: DEFAULT_INTERNAL_ADDRESS
          }
        },
        Effect.none()
      ];
    }
    // Normal flow for other users
    return [{ ...state, currentStep: 'address' }, Effect.none()];
  }
}
```

## Comparison to Other Examples

| Feature | Multi-Step Form | Registration Form | Contact Form |
|---------|----------------|-------------------|--------------|
| Form Mode | Integrated | Integrated | Integrated |
| Number of Forms | 2 (per step) | 1 | 1 |
| Parent Logic | Step navigation, data accumulation | Success tracking | Success message |
| Navigation | Multi-step flow | Single form | Single form |
| Data Flow | Progressive accumulation | Single submission | Single submission |
| Complexity | High | Medium | Low |

## Learning Outcomes

After studying this example, you'll understand:

1. How to compose multiple form reducers into a parent reducer
2. How parent reducers observe child form events
3. How to implement step-by-step validation
4. How to accumulate and preserve data across steps
5. How to create reusable step indicator components
6. How to test complex multi-step flows
7. How to handle navigation with validation gates
8. How to build review steps with edit capabilities

## Related Documentation

- [Form System Guide](../../docs/forms-guide.md) - Complete form patterns
- [Registration Form Example](../registration-form/README.md) - Simpler integrated form
- [Contact Form Example](../contact-form/README.md) - Basic integrated form
- [Composable Svelte Docs](../../README.md) - Core architecture

## License

MIT
