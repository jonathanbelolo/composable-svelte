<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { Form, FormField } from '@composable-svelte/core/components/form';
  import { Button, Input } from '@composable-svelte/core/components/ui';
  import { appReducer } from './app.reducer.js';
  import { createInitialAppState } from './app.state.js';

  // Create parent store
  const parentStore = createStore({
    initialState: createInitialAppState(),
    reducer: appReducer,
    dependencies: {}
  });

  // Create reactive wrapper for form state
  let formStoreState = $state(parentStore.state.registrationForm);

  $effect(() => {
    formStoreState = parentStore.state.registrationForm;
  });

  const formStore = {
    get state() {
      return formStoreState;
    },
    dispatch(action: any) {
      parentStore.dispatch({ type: 'registrationForm', action });
    },
    subscribe(listener: any) {
      return parentStore.subscribe(listener);
    }
  };

  // Subscribe to parent state
  let registrationSuccess = $state(parentStore.state.registrationSuccess);
  let registeredUser = $state(parentStore.state.registeredUser);

  $effect(() => {
    registrationSuccess = parentStore.state.registrationSuccess;
    registeredUser = parentStore.state.registeredUser;
  });

  function resetRegistration() {
    parentStore.dispatch({ type: 'registrationReset' });
    // Also reset the form
    parentStore.dispatch({
      type: 'registrationForm',
      action: { type: 'formReset' }
    });
  }
</script>

<div class="min-h-screen bg-gray-50 py-12 px-4">
  <div class="max-w-md mx-auto">
    <h1 class="text-3xl font-bold text-gray-900 mb-2">Create Account</h1>
    <p class="text-gray-600 mb-8">Registration form with cross-field validation</p>

    {#if registrationSuccess && registeredUser}
      <!-- Success State -->
      <div class="bg-white shadow-sm rounded-lg p-8" data-testid="success-state">
        <div class="text-center">
          <div class="mb-4">
            <svg class="w-16 h-16 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 class="text-2xl font-semibold text-gray-900 mb-2">Registration Successful!</h2>
          <p class="text-gray-600 mb-4">Welcome, <span class="font-medium">{registeredUser.username}</span>!</p>
          <p class="text-sm text-gray-500 mb-6">A confirmation email has been sent to {registeredUser.email}</p>
          <Button onclick={resetRegistration} variant="outline">
            Register Another Account
          </Button>
        </div>
      </div>
    {:else}
      <!-- Registration Form -->
      <div class="bg-white shadow-sm rounded-lg p-8">
        <Form store={formStore}>
          <div class="space-y-6">
            <!-- Username Field -->
            <FormField name="username">
              {#snippet children({ field, send })}
                <div data-testid="username-field">
                  <label for="username" class="block text-sm font-medium text-gray-700 mb-1">
                    Username *
                  </label>
                  <Input
                    id="username"
                    type="text"
                    value={field.value}
                    oninput={(e) => send({ type: 'fieldChanged', field: 'username', value: e.currentTarget.value })}
                    onblur={() => send({ type: 'fieldBlurred', field: 'username' })}
                    class="w-full"
                    placeholder="john_doe"
                  />
                  {#if field.error && field.touched}
                    <p class="text-sm text-red-600 mt-1" data-testid="username-error">{field.error}</p>
                  {/if}
                  {#if field.isValidating}
                    <p class="text-sm text-gray-500 mt-1" data-testid="username-validating">Checking availability...</p>
                  {/if}
                  <p class="text-xs text-gray-500 mt-1">3-20 characters, letters, numbers, underscores, and hyphens only</p>
                </div>
              {/snippet}
            </FormField>

            <!-- Email Field -->
            <FormField name="email">
              {#snippet children({ field, send })}
                <div data-testid="email-field">
                  <label for="email" class="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <Input
                    id="email"
                    type="email"
                    value={field.value}
                    oninput={(e) => send({ type: 'fieldChanged', field: 'email', value: e.currentTarget.value })}
                    onblur={() => send({ type: 'fieldBlurred', field: 'email' })}
                    class="w-full"
                    placeholder="john@example.com"
                  />
                  {#if field.error && field.touched}
                    <p class="text-sm text-red-600 mt-1" data-testid="email-error">{field.error}</p>
                  {/if}
                  {#if field.isValidating}
                    <p class="text-sm text-gray-500 mt-1" data-testid="email-validating">Checking availability...</p>
                  {/if}
                </div>
              {/snippet}
            </FormField>

            <!-- Password Field -->
            <FormField name="password">
              {#snippet children({ field, send })}
                <div data-testid="password-field">
                  <label for="password" class="block text-sm font-medium text-gray-700 mb-1">
                    Password *
                  </label>
                  <Input
                    id="password"
                    type="password"
                    value={field.value}
                    oninput={(e) => send({ type: 'fieldChanged', field: 'password', value: e.currentTarget.value })}
                    onblur={() => send({ type: 'fieldBlurred', field: 'password' })}
                    class="w-full"
                    placeholder="••••••••"
                  />
                  {#if field.error && field.touched}
                    <p class="text-sm text-red-600 mt-1" data-testid="password-error">{field.error}</p>
                  {/if}
                  <p class="text-xs text-gray-500 mt-1">
                    Minimum 8 characters, must include uppercase, lowercase, and number
                  </p>
                </div>
              {/snippet}
            </FormField>

            <!-- Confirm Password Field -->
            <FormField name="confirmPassword">
              {#snippet children({ field, send })}
                <div data-testid="confirm-password-field">
                  <label for="confirmPassword" class="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password *
                  </label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={field.value}
                    oninput={(e) => send({ type: 'fieldChanged', field: 'confirmPassword', value: e.currentTarget.value })}
                    onblur={() => send({ type: 'fieldBlurred', field: 'confirmPassword' })}
                    class="w-full"
                    placeholder="••••••••"
                  />
                  {#if field.error && field.touched}
                    <p class="text-sm text-red-600 mt-1" data-testid="confirm-password-error">{field.error}</p>
                  {/if}
                </div>
              {/snippet}
            </FormField>

            <!-- Submit Button -->
            <Button
              type="submit"
              class="w-full"
              data-testid="submit-button"
            >
              {formStore.state.isSubmitting ? 'Creating Account...' : 'Create Account'}
            </Button>

            <!-- Helper Text -->
            <p class="text-xs text-gray-500 text-center">
              Already have an account? <a href="#" class="text-blue-600 hover:text-blue-700">Sign in</a>
            </p>
          </div>
        </Form>
      </div>

      <!-- Taken Usernames/Emails Reference -->
      <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p class="text-sm text-blue-800 font-medium mb-2">For testing async validation:</p>
        <p class="text-xs text-blue-700">
          <strong>Taken usernames:</strong> admin, user, test, demo<br />
          <strong>Taken emails:</strong> admin@example.com, user@example.com, test@example.com
        </p>
      </div>
    {/if}
  </div>
</div>
