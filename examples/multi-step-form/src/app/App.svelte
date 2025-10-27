<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { Form, FormField } from '@composable-svelte/core/components/form';
  import { Button, Input } from '@composable-svelte/core/components/ui';
  import { appReducer } from './app.reducer.js';
  import { createInitialAppState } from './app.state.js';
  import StepIndicator from '../components/StepIndicator.svelte';
  import type { OnboardingStep } from '../features/onboarding/onboarding.types.js';

  // Create parent store
  const parentStore = createStore({
    initialState: createInitialAppState(),
    reducer: appReducer,
    dependencies: {}
  });

  // Create reactive wrappers for form states
  let personalInfoFormState = $state(parentStore.state.personalInfoForm);
  let addressFormState = $state(parentStore.state.addressForm);

  $effect(() => {
    personalInfoFormState = parentStore.state.personalInfoForm;
    addressFormState = parentStore.state.addressForm;
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

  const addressFormStore = {
    get state() {
      return addressFormState;
    },
    dispatch(action: any) {
      parentStore.dispatch({ type: 'addressForm', action });
    },
    subscribe(listener: any) {
      return parentStore.subscribe(listener);
    }
  };

  // Subscribe to parent state
  let currentStep = $state(parentStore.state.currentStep);
  let completedData = $state(parentStore.state.completedData);
  let isSubmitting = $state(parentStore.state.isSubmitting);
  let submitError = $state(parentStore.state.submitError);
  let submissionComplete = $state(parentStore.state.submissionComplete);
  let submittedData = $state(parentStore.state.submittedData);

  $effect(() => {
    currentStep = parentStore.state.currentStep;
    completedData = parentStore.state.completedData;
    isSubmitting = parentStore.state.isSubmitting;
    submitError = parentStore.state.submitError;
    submissionComplete = parentStore.state.submissionComplete;
    submittedData = parentStore.state.submittedData;
  });

  // Compute completed steps
  let completedSteps = $derived(
    new Set<OnboardingStep>(
      [
        completedData.personalInfo ? 'personalInfo' : null,
        completedData.address ? 'address' : null
      ].filter((s): s is OnboardingStep => s !== null)
    )
  );

  function handleNextStep() {
    parentStore.dispatch({ type: 'nextStep' });
  }

  function handlePreviousStep() {
    parentStore.dispatch({ type: 'previousStep' });
  }

  function handleStepClick(step: OnboardingStep) {
    parentStore.dispatch({ type: 'goToStep', step });
  }

  function handleSubmit() {
    parentStore.dispatch({ type: 'submitOnboarding' });
  }

  function handleReset() {
    parentStore.dispatch({ type: 'resetOnboarding' });
  }
</script>

<div class="min-h-screen bg-gray-50 py-12 px-4">
  <div class="max-w-3xl mx-auto">
    <h1 class="text-3xl font-bold text-gray-900 mb-2">Complete Your Profile</h1>
    <p class="text-gray-600 mb-8">Multi-step onboarding wizard</p>

    {#if submissionComplete && submittedData}
      <!-- Success State -->
      <div class="bg-white shadow-sm rounded-lg p-8" data-testid="success-state">
        <div class="text-center">
          <div class="mb-4">
            <svg class="w-16 h-16 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 class="text-2xl font-semibold text-gray-900 mb-2">Onboarding Complete!</h2>
          <p class="text-gray-600 mb-4">
            Welcome, <span class="font-medium">{submittedData.personalInfo.firstName} {submittedData.personalInfo.lastName}</span>!
          </p>
          <p class="text-sm text-gray-500 mb-6">Your profile has been successfully created.</p>

          <!-- Summary -->
          <div class="text-left bg-gray-50 p-4 rounded-lg mb-6">
            <h3 class="font-medium text-gray-900 mb-2">Profile Summary:</h3>
            <dl class="space-y-1 text-sm text-gray-600">
              <div>
                <dt class="inline font-medium">Email:</dt>
                <dd class="inline ml-1">{submittedData.personalInfo.email}</dd>
              </div>
              <div>
                <dt class="inline font-medium">Phone:</dt>
                <dd class="inline ml-1">{submittedData.personalInfo.phone}</dd>
              </div>
              <div>
                <dt class="inline font-medium">Address:</dt>
                <dd class="inline ml-1">
                  {submittedData.address.street}, {submittedData.address.city}, {submittedData.address.state} {submittedData.address.zipCode}
                </dd>
              </div>
            </dl>
          </div>

          <Button onclick={handleReset} variant="outline">
            Start Over
          </Button>
        </div>
      </div>
    {:else}
      <!-- Multi-Step Form -->
      <div class="bg-white shadow-sm rounded-lg p-8">
        <!-- Step Indicator -->
        <StepIndicator
          currentStep={currentStep}
          completedSteps={completedSteps}
          onStepClick={handleStepClick}
        />

        <div class="mt-8">
          {#if currentStep === 'personalInfo'}
            <!-- Step 1: Personal Info -->
            <div data-testid="personal-info-step">
              <h2 class="text-xl font-semibold text-gray-900 mb-4">Personal Information</h2>
              <Form store={personalInfoFormStore}>
                <div class="space-y-6">
                  <!-- First Name -->
                  <FormField name="firstName">
                    {#snippet children({ field, send })}
                      <div data-testid="firstName-field">
                        <label for="firstName" class="block text-sm font-medium text-gray-700 mb-1">
                          First Name *
                        </label>
                        <Input
                          id="firstName"
                          type="text"
                          value={field.value}
                          oninput={(e) => send({ type: 'fieldChanged', field: 'firstName', value: e.currentTarget.value })}
                          onblur={() => send({ type: 'fieldBlurred', field: 'firstName' })}
                          class="w-full"
                          placeholder="John"
                        />
                        {#if field.error && field.touched}
                          <p class="text-sm text-red-600 mt-1" data-testid="firstName-error">{field.error}</p>
                        {/if}
                      </div>
                    {/snippet}
                  </FormField>

                  <!-- Last Name -->
                  <FormField name="lastName">
                    {#snippet children({ field, send })}
                      <div data-testid="lastName-field">
                        <label for="lastName" class="block text-sm font-medium text-gray-700 mb-1">
                          Last Name *
                        </label>
                        <Input
                          id="lastName"
                          type="text"
                          value={field.value}
                          oninput={(e) => send({ type: 'fieldChanged', field: 'lastName', value: e.currentTarget.value })}
                          onblur={() => send({ type: 'fieldBlurred', field: 'lastName' })}
                          class="w-full"
                          placeholder="Doe"
                        />
                        {#if field.error && field.touched}
                          <p class="text-sm text-red-600 mt-1" data-testid="lastName-error">{field.error}</p>
                        {/if}
                      </div>
                    {/snippet}
                  </FormField>

                  <!-- Email -->
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

                  <!-- Phone -->
                  <FormField name="phone">
                    {#snippet children({ field, send })}
                      <div data-testid="phone-field">
                        <label for="phone" class="block text-sm font-medium text-gray-700 mb-1">
                          Phone *
                        </label>
                        <Input
                          id="phone"
                          type="tel"
                          value={field.value}
                          oninput={(e) => send({ type: 'fieldChanged', field: 'phone', value: e.currentTarget.value })}
                          onblur={() => send({ type: 'fieldBlurred', field: 'phone' })}
                          class="w-full"
                          placeholder="123-456-7890"
                        />
                        {#if field.error && field.touched}
                          <p class="text-sm text-red-600 mt-1" data-testid="phone-error">{field.error}</p>
                        {/if}
                        <p class="text-xs text-gray-500 mt-1">Format: 123-456-7890</p>
                      </div>
                    {/snippet}
                  </FormField>
                </div>
              </Form>
            </div>
          {:else if currentStep === 'address'}
            <!-- Step 2: Address -->
            <div data-testid="address-step">
              <h2 class="text-xl font-semibold text-gray-900 mb-4">Address</h2>
              <Form store={addressFormStore}>
                <div class="space-y-6">
                  <!-- Street -->
                  <FormField name="street">
                    {#snippet children({ field, send })}
                      <div data-testid="street-field">
                        <label for="street" class="block text-sm font-medium text-gray-700 mb-1">
                          Street Address *
                        </label>
                        <Input
                          id="street"
                          type="text"
                          value={field.value}
                          oninput={(e) => send({ type: 'fieldChanged', field: 'street', value: e.currentTarget.value })}
                          onblur={() => send({ type: 'fieldBlurred', field: 'street' })}
                          class="w-full"
                          placeholder="123 Main St"
                        />
                        {#if field.error && field.touched}
                          <p class="text-sm text-red-600 mt-1" data-testid="street-error">{field.error}</p>
                        {/if}
                      </div>
                    {/snippet}
                  </FormField>

                  <!-- City -->
                  <FormField name="city">
                    {#snippet children({ field, send })}
                      <div data-testid="city-field">
                        <label for="city" class="block text-sm font-medium text-gray-700 mb-1">
                          City *
                        </label>
                        <Input
                          id="city"
                          type="text"
                          value={field.value}
                          oninput={(e) => send({ type: 'fieldChanged', field: 'city', value: e.currentTarget.value })}
                          onblur={() => send({ type: 'fieldBlurred', field: 'city' })}
                          class="w-full"
                          placeholder="San Francisco"
                        />
                        {#if field.error && field.touched}
                          <p class="text-sm text-red-600 mt-1" data-testid="city-error">{field.error}</p>
                        {/if}
                      </div>
                    {/snippet}
                  </FormField>

                  <!-- State and Zip (2 columns) -->
                  <div class="grid grid-cols-2 gap-4">
                    <FormField name="state">
                      {#snippet children({ field, send })}
                        <div data-testid="state-field">
                          <label for="state" class="block text-sm font-medium text-gray-700 mb-1">
                            State *
                          </label>
                          <Input
                            id="state"
                            type="text"
                            value={field.value}
                            oninput={(e) => send({ type: 'fieldChanged', field: 'state', value: e.currentTarget.value })}
                            onblur={() => send({ type: 'fieldBlurred', field: 'state' })}
                            class="w-full"
                            placeholder="CA"
                            maxlength="2"
                          />
                          {#if field.error && field.touched}
                            <p class="text-sm text-red-600 mt-1" data-testid="state-error">{field.error}</p>
                          {/if}
                          <p class="text-xs text-gray-500 mt-1">2-letter code</p>
                        </div>
                      {/snippet}
                    </FormField>

                    <FormField name="zipCode">
                      {#snippet children({ field, send })}
                        <div data-testid="zipCode-field">
                          <label for="zipCode" class="block text-sm font-medium text-gray-700 mb-1">
                            Zip Code *
                          </label>
                          <Input
                            id="zipCode"
                            type="text"
                            value={field.value}
                            oninput={(e) => send({ type: 'fieldChanged', field: 'zipCode', value: e.currentTarget.value })}
                            onblur={() => send({ type: 'fieldBlurred', field: 'zipCode' })}
                            class="w-full"
                            placeholder="94102"
                            maxlength="5"
                          />
                          {#if field.error && field.touched}
                            <p class="text-sm text-red-600 mt-1" data-testid="zipCode-error">{field.error}</p>
                          {/if}
                          {#if field.isValidating}
                            <p class="text-sm text-gray-500 mt-1" data-testid="zipCode-validating">Validating...</p>
                          {/if}
                        </div>
                      {/snippet}
                    </FormField>
                  </div>
                </div>
              </Form>
            </div>
          {:else if currentStep === 'review'}
            <!-- Step 3: Review -->
            <div data-testid="review-step">
              <h2 class="text-xl font-semibold text-gray-900 mb-4">Review Your Information</h2>
              <p class="text-gray-600 mb-6">Please review your information before submitting.</p>

              <div class="space-y-6">
                <!-- Personal Info Section -->
                <div class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="font-medium text-gray-900">Personal Information</h3>
                    <button
                      type="button"
                      class="text-sm text-blue-600 hover:text-blue-700"
                      onclick={() => handleStepClick('personalInfo')}
                      data-testid="edit-personal-info"
                    >
                      Edit
                    </button>
                  </div>
                  {#if completedData.personalInfo}
                    <dl class="space-y-2 text-sm">
                      <div class="flex">
                        <dt class="font-medium text-gray-600 w-24">Name:</dt>
                        <dd class="text-gray-900">{completedData.personalInfo.firstName} {completedData.personalInfo.lastName}</dd>
                      </div>
                      <div class="flex">
                        <dt class="font-medium text-gray-600 w-24">Email:</dt>
                        <dd class="text-gray-900">{completedData.personalInfo.email}</dd>
                      </div>
                      <div class="flex">
                        <dt class="font-medium text-gray-600 w-24">Phone:</dt>
                        <dd class="text-gray-900">{completedData.personalInfo.phone}</dd>
                      </div>
                    </dl>
                  {/if}
                </div>

                <!-- Address Section -->
                <div class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="font-medium text-gray-900">Address</h3>
                    <button
                      type="button"
                      class="text-sm text-blue-600 hover:text-blue-700"
                      onclick={() => handleStepClick('address')}
                      data-testid="edit-address"
                    >
                      Edit
                    </button>
                  </div>
                  {#if completedData.address}
                    <dl class="space-y-2 text-sm">
                      <div class="flex">
                        <dt class="font-medium text-gray-600 w-24">Street:</dt>
                        <dd class="text-gray-900">{completedData.address.street}</dd>
                      </div>
                      <div class="flex">
                        <dt class="font-medium text-gray-600 w-24">City:</dt>
                        <dd class="text-gray-900">{completedData.address.city}</dd>
                      </div>
                      <div class="flex">
                        <dt class="font-medium text-gray-600 w-24">State:</dt>
                        <dd class="text-gray-900">{completedData.address.state}</dd>
                      </div>
                      <div class="flex">
                        <dt class="font-medium text-gray-600 w-24">Zip Code:</dt>
                        <dd class="text-gray-900">{completedData.address.zipCode}</dd>
                      </div>
                    </dl>
                  {/if}
                </div>
              </div>

              <!-- Submit Error -->
              {#if submitError}
                <div class="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg" data-testid="submit-error">
                  <p class="text-sm text-red-600">{submitError}</p>
                </div>
              {/if}
            </div>
          {/if}

          <!-- Navigation Buttons -->
          <div class="flex justify-between mt-8 pt-6 border-t border-gray-200">
            <div>
              {#if currentStep !== 'personalInfo'}
                <Button
                  variant="outline"
                  onclick={handlePreviousStep}
                  disabled={isSubmitting}
                  data-testid="previous-button"
                >
                  Previous
                </Button>
              {/if}
            </div>

            <div>
              {#if currentStep === 'review'}
                <Button
                  onclick={handleSubmit}
                  disabled={isSubmitting}
                  data-testid="submit-button"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit'}
                </Button>
              {:else}
                <Button
                  onclick={handleNextStep}
                  data-testid="next-button"
                >
                  Next
                </Button>
              {/if}
            </div>
          </div>
        </div>
      </div>

      <!-- Testing Info -->
      <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p class="text-sm text-blue-800 font-medium mb-2">For testing:</p>
        <p class="text-xs text-blue-700">
          <strong>Blocked email domain:</strong> @blocked.com<br />
          <strong>Invalid zip codes:</strong> 00000, 99999
        </p>
      </div>
    {/if}
  </div>
</div>
