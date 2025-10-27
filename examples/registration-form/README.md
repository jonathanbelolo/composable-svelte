# Registration Form Example - Cross-Field Validation

This example demonstrates **cross-field validation** using Zod refinements in Composable Svelte's form system.

## What This Shows

### 1. Cross-Field Validation with Zod Refinements

The password confirmation field is validated against the password field using Zod's `.refine()`:

```typescript
export const registrationSchema = z
  .object({
    username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/),
    email: z.string().email(),
    password: z
      .string()
      .min(8)
      .regex(/[A-Z]/, 'Must contain uppercase')
      .regex(/[a-z]/, 'Must contain lowercase')
      .regex(/[0-9]/, 'Must contain number'),
    confirmPassword: z.string()
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'] // Set error on confirmPassword field
  });
```

**Key Points**:
- The refinement runs **after** all field-level validations pass
- Error is set on the `confirmPassword` field using the `path` option
- This is a form-level validation (cross-field dependency)

### 2. Async Validation for Availability Checks

Username and email fields have async validators that simulate API calls:

```typescript
asyncValidators: {
  username: async (username) => {
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay
    if (existingUsernames.has(username.toLowerCase())) {
      throw new Error('Username is already taken');
    }
  },
  email: async (email) => {
    await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay
    if (existingEmails.has(email.toLowerCase())) {
      throw new Error('Email is already registered');
    }
  }
}
```

**For Testing**:
- **Taken usernames**: `admin`, `user`, `test`, `demo`
- **Taken emails**: `admin@example.com`, `user@example.com`, `test@example.com`

### 3. Complex Validation Rules

**Username**:
- 3-20 characters
- Only letters, numbers, underscores, and hyphens
- Async availability check

**Email**:
- Valid email format
- Async availability check

**Password**:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

**Confirm Password**:
- Must match password field (cross-field validation)

### 4. Parent Observation of Success

The parent reducer observes the form submission success and updates app state:

```typescript
case 'registrationForm': {
  if (action.action.type === 'submissionSucceeded') {
    const formData = state.registrationForm.data;
    return [
      {
        ...state,
        registrationSuccess: true,
        registeredUser: {
          username: formData.username,
          email: formData.email
        }
      },
      Effect.none()
    ];
  }
  return [state, Effect.none()];
}
```

After successful registration:
- Shows success screen with welcome message
- Displays registered username and email
- Provides option to register another account

## Running the Example

```bash
cd examples/registration-form
pnpm install
pnpm dev
```

Open http://localhost:5173

## Testing Cross-Field Validation

1. Fill in all fields with valid data
2. Enter different values for Password and Confirm Password
3. Try to submit - you'll see "Passwords do not match" error on Confirm Password field
4. Make the passwords match - error disappears
5. Submit the form successfully

## Testing Async Validation

Try entering these values to trigger async validation errors:

**Taken Usernames**:
- `admin`
- `user`
- `test`
- `demo`

**Taken Emails**:
- `admin@example.com`
- `user@example.com`
- `test@example.com`

You'll see "Checking availability..." while the async validator runs, then an error if the username/email is taken.

## Key Patterns Demonstrated

1. **Zod Refinements** - Cross-field validation using `.refine()`
2. **Error Path Targeting** - Setting errors on specific fields using `path` option
3. **Async Validators** - Simulating API calls for availability checks
4. **Complex Validation Rules** - Multiple regex patterns, length constraints
5. **Success State Handling** - Parent observes submission and shows success screen
6. **Form Reset** - Reset form and parent state to register another account

## Files to Study

- `registration.types.ts` - Zod schema with `.refine()` for cross-field validation
- `registration.config.ts` - Async validators for username/email availability
- `app.reducer.ts` - Parent observation of submission success
- `App.svelte` - Success screen and form reset handling

## Comparison with Contact Form

| Feature | Contact Form | Registration Form |
|---------|--------------|-------------------|
| **Validation Type** | Field-level + async | Field-level + async + **cross-field** |
| **Cross-Field** | ❌ None | ✅ Password confirmation |
| **Refinements** | ❌ None | ✅ `.refine()` for password match |
| **Success Handling** | Success message banner | Full success screen |
| **Reset** | Auto-clear after delay | Manual reset button |

## Architecture

```
┌─────────────────────────────────────┐
│ App Reducer (Parent)                │
│                                     │
│ - registrationSuccess: boolean      │
│ - registeredUser: { username, email } │
│ - Observes submissionSucceeded      │
└────────────┬────────────────────────┘
             │
             │ scope() composition
             │
             ↓
┌─────────────────────────────────────┐
│ Form Reducer (Child)                │
│                                     │
│ - data: { username, email, ... }    │
│ - Zod validation (field-level)      │
│ - Zod refinement (cross-field)      │
│ - Async validators (availability)   │
└─────────────────────────────────────┘
```

## Next Steps

See the **Multi-Step Form** example for even more complex state management with:
- Multiple form steps
- Step-by-step validation
- Progress indicator
- Data accumulation across steps
