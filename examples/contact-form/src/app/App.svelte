<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { scopeTo } from '@composable-svelte/core/navigation';
  import {
    Form,
    FormField
  } from '@composable-svelte/core/components/form';
  import { Button, Input, Textarea } from '@composable-svelte/core/components/ui';
  import { appReducer } from './app.reducer.js';
  import { createInitialAppState } from './app.state.js';

  // Create store with integrated form reducer
  const parentStore = createStore({
    initialState: createInitialAppState(),
    reducer: appReducer,
    dependencies: {}
  });

  // Create a reactive wrapper store that exposes just the form state
  // Using $state to make the formStore.state reactive
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

  // Subscribe to state changes to get submission history and success message
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

<div class="min-h-screen bg-gray-50 py-12 px-4">
  <div class="max-w-3xl mx-auto">
    <h1 class="text-3xl font-bold text-gray-900 mb-2">Contact Form Example</h1>
    <p class="text-gray-600 mb-8">Demonstrating integrated form mode with parent-child composition</p>

    <!-- Success Message -->
    {#if successMessage}
      <div class="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg" data-testid="success-message">
        <div class="flex justify-between items-start">
          <div class="flex-1">
            <p class="text-green-800 font-medium">{successMessage}</p>
          </div>
          <button
            onclick={dismissSuccessMessage}
            class="text-green-600 hover:text-green-800"
            data-testid="dismiss-success"
          >
            ✕
          </button>
        </div>
      </div>
    {/if}

    <!-- Contact Form -->
    <div class="bg-white shadow-sm rounded-lg p-8 mb-8">
      <h2 class="text-xl font-semibold text-gray-900 mb-6">Send us a message</h2>

      <Form store={formStore}>
        <div class="space-y-6">
          <!-- Name Field -->
          <FormField name="name">
            {#snippet children({ field, send })}
              <div data-testid="name-field">
                <label for="name" class="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <Input
                  id="name"
                  type="text"
                  value={field.value}
                  oninput={(e) => send({ type: 'fieldChanged', field: 'name', value: e.currentTarget.value })}
                  onblur={() => send({ type: 'fieldBlurred', field: 'name' })}
                  class="w-full"
                  placeholder="John Doe"
                />
                {#if field.error && field.touched}
                  <p class="text-sm text-red-600 mt-1" data-testid="name-error">{field.error}</p>
                {/if}
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
                  <p class="text-sm text-gray-500 mt-1" data-testid="email-validating">Validating...</p>
                {/if}
              </div>
            {/snippet}
          </FormField>

          <!-- Message Field -->
          <FormField name="message">
            {#snippet children({ field, send })}
              <div data-testid="message-field">
                <label for="message" class="block text-sm font-medium text-gray-700 mb-1">
                  Message *
                </label>
                <Textarea
                  id="message"
                  value={field.value}
                  oninput={(e) => send({ type: 'fieldChanged', field: 'message', value: e.currentTarget.value })}
                  onblur={() => send({ type: 'fieldBlurred', field: 'message' })}
                  class="w-full"
                  rows={4}
                  placeholder="Your message here..."
                />
                {#if field.error && field.touched}
                  <p class="text-sm text-red-600 mt-1" data-testid="message-error">{field.error}</p>
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
            {formStore.state.isSubmitting ? 'Sending...' : 'Send Message'}
          </Button>
        </div>
      </Form>
    </div>

    <!-- Submission History -->
    {#if submissionHistory.length > 0}
      <div class="bg-white shadow-sm rounded-lg p-8">
        <h2 class="text-xl font-semibold text-gray-900 mb-4">Submission History</h2>
        <div class="space-y-4" data-testid="submission-history">
          {#each submissionHistory as submission}
            <div class="border-l-4 border-blue-500 pl-4 py-2" data-testid="submission-item">
              <p class="text-sm text-gray-600">{submission.timestamp.toLocaleString()}</p>
              <p class="font-medium text-gray-900">{submission.name}</p>
              <p class="text-sm text-gray-600">{submission.email}</p>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>
