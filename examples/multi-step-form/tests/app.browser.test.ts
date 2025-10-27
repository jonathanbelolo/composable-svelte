/**
 * Browser integration tests for Multi-Step Form Example
 *
 * Tests verify:
 * - Step navigation (next/previous/direct)
 * - Form validation on each step
 * - Data accumulation across steps
 * - Step indicator updates
 * - Review step displays all data
 * - Final submission workflow
 * - Error handling
 */

import { expect, test, describe } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import App from '../src/app/App.svelte';

// Helper to wait for DOM updates
const waitForUpdates = () => new Promise(resolve => setTimeout(resolve, 100));

// Helper to wait for async validation
const waitForAsyncValidation = () => new Promise(resolve => setTimeout(resolve, 400));

describe('Multi-Step Form - Integrated Mode', () => {
  describe('Initial Render', () => {
    test('renders step 1 (personal info) initially', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const personalInfoStep = container.querySelector('[data-testid="personal-info-step"]');
      expect(personalInfoStep).toBeTruthy();

      const addressStep = container.querySelector('[data-testid="address-step"]');
      expect(addressStep).toBeNull();

      const reviewStep = container.querySelector('[data-testid="review-step"]');
      expect(reviewStep).toBeNull();
    });

    test('renders step indicator with correct initial state', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const stepIndicator = container.querySelector('[data-testid="step-indicator"]');
      expect(stepIndicator).toBeTruthy();

      // Step 1 should be current
      const step1 = container.querySelector('[data-testid="step-personalInfo"]');
      expect(step1).toBeTruthy();
      expect(step1?.className).toContain('bg-blue-600');
    });

    test('shows Next button but not Previous button on first step', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const nextButton = container.querySelector('[data-testid="next-button"]');
      const previousButton = container.querySelector('[data-testid="previous-button"]');

      expect(nextButton).toBeTruthy();
      expect(previousButton).toBeNull();
    });
  });

  describe('Step 1 - Personal Info Validation', () => {
    test('shows validation error for firstName too short', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const firstNameInput = container.querySelector('#firstName') as HTMLInputElement;
      expect(firstNameInput).toBeTruthy();

      await userEvent.clear(firstNameInput);
      await userEvent.type(firstNameInput, 'J');
      await userEvent.click(container);
      await waitForUpdates();

      const firstNameError = container.querySelector('[data-testid="firstName-error"]');
      expect(firstNameError).toBeTruthy();
      expect(firstNameError?.textContent).toContain('at least 2 characters');
    });

    test('shows validation error for invalid email', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const emailInput = container.querySelector('#email') as HTMLInputElement;
      expect(emailInput).toBeTruthy();

      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'not-an-email');
      await userEvent.click(container);
      await waitForUpdates();

      const emailError = container.querySelector('[data-testid="email-error"]');
      expect(emailError).toBeTruthy();
      expect(emailError?.textContent).toContain('Invalid email');
    });

    test('shows validation error for invalid phone format', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const phoneInput = container.querySelector('#phone') as HTMLInputElement;
      expect(phoneInput).toBeTruthy();

      await userEvent.clear(phoneInput);
      await userEvent.type(phoneInput, '1234567890');
      await userEvent.click(container);
      await waitForUpdates();

      const phoneError = container.querySelector('[data-testid="phone-error"]');
      expect(phoneError).toBeTruthy();
      expect(phoneError?.textContent).toContain('123-456-7890');
    });

    test('shows error for blocked email domain', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const emailInput = container.querySelector('#email') as HTMLInputElement;
      expect(emailInput).toBeTruthy();

      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'test@blocked.com');
      await userEvent.click(container);
      await waitForUpdates();

      // Wait for async validation
      await waitForAsyncValidation();

      const emailError = container.querySelector('[data-testid="email-error"]');
      expect(emailError).toBeTruthy();
      expect(emailError?.textContent).toContain('not allowed');
    });
  });

  describe('Step Navigation - Next', () => {
    test('prevents moving to step 2 with invalid data', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const nextButton = container.querySelector('[data-testid="next-button"]') as HTMLButtonElement;
      expect(nextButton).toBeTruthy();

      // Click Next without filling form
      await userEvent.click(nextButton);
      await waitForUpdates();

      // Should still be on step 1
      const personalInfoStep = container.querySelector('[data-testid="personal-info-step"]');
      expect(personalInfoStep).toBeTruthy();

      // Should show validation errors
      const firstNameError = container.querySelector('[data-testid="firstName-error"]');
      expect(firstNameError).toBeTruthy();
    });

    test('moves to step 2 with valid data', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Fill step 1 with valid data
      const firstNameInput = container.querySelector('#firstName') as HTMLInputElement;
      const lastNameInput = container.querySelector('#lastName') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const phoneInput = container.querySelector('#phone') as HTMLInputElement;

      await userEvent.clear(firstNameInput);
      await userEvent.type(firstNameInput, 'John');

      await userEvent.clear(lastNameInput);
      await userEvent.type(lastNameInput, 'Doe');

      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'john@example.com');

      await userEvent.clear(phoneInput);
      await userEvent.type(phoneInput, '123-456-7890');

      // Wait for validation
      await waitForAsyncValidation();

      // Click Next
      const nextButton = container.querySelector('[data-testid="next-button"]') as HTMLButtonElement;
      await userEvent.click(nextButton);
      await waitForUpdates();

      // Should be on step 2
      const addressStep = container.querySelector('[data-testid="address-step"]');
      expect(addressStep).toBeTruthy();

      // Step 1 should be marked as completed in indicator
      const step1 = container.querySelector('[data-testid="step-personalInfo"]');
      expect(step1?.className).toContain('bg-green-600');
    });
  });

  describe('Step 2 - Address Validation', () => {
    async function navigateToStep2(container: HTMLElement) {
      // Fill and submit step 1
      const firstNameInput = container.querySelector('#firstName') as HTMLInputElement;
      const lastNameInput = container.querySelector('#lastName') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const phoneInput = container.querySelector('#phone') as HTMLInputElement;

      await userEvent.clear(firstNameInput);
      await userEvent.type(firstNameInput, 'John');
      await userEvent.clear(lastNameInput);
      await userEvent.type(lastNameInput, 'Doe');
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'john@example.com');
      await userEvent.clear(phoneInput);
      await userEvent.type(phoneInput, '123-456-7890');

      await waitForAsyncValidation();

      const nextButton = container.querySelector('[data-testid="next-button"]') as HTMLButtonElement;
      await userEvent.click(nextButton);
      await waitForUpdates();
    }

    test('shows validation error for street too short', async () => {
      const { container } = render(App);
      await waitForUpdates();

      await navigateToStep2(container);

      const streetInput = container.querySelector('#street') as HTMLInputElement;
      expect(streetInput).toBeTruthy();

      await userEvent.clear(streetInput);
      await userEvent.type(streetInput, 'Main');
      await userEvent.click(container);
      await waitForUpdates();

      const streetError = container.querySelector('[data-testid="street-error"]');
      expect(streetError).toBeTruthy();
      expect(streetError?.textContent).toContain('at least 5 characters');
    });

    test('shows validation error for invalid state format', async () => {
      const { container } = render(App);
      await waitForUpdates();

      await navigateToStep2(container);

      const stateInput = container.querySelector('#state') as HTMLInputElement;
      expect(stateInput).toBeTruthy();

      await userEvent.clear(stateInput);
      await userEvent.type(stateInput, 'California');
      await userEvent.click(container);
      await waitForUpdates();

      const stateError = container.querySelector('[data-testid="state-error"]');
      expect(stateError).toBeTruthy();
      expect(stateError?.textContent).toContain('must be');
    });

    test('shows validation error for invalid zip code format', async () => {
      const { container } = render(App);
      await waitForUpdates();

      await navigateToStep2(container);

      const zipCodeInput = container.querySelector('#zipCode') as HTMLInputElement;
      expect(zipCodeInput).toBeTruthy();

      await userEvent.clear(zipCodeInput);
      await userEvent.type(zipCodeInput, '1234');
      await userEvent.click(container);
      await waitForUpdates();

      const zipCodeError = container.querySelector('[data-testid="zipCode-error"]');
      expect(zipCodeError).toBeTruthy();
      expect(zipCodeError?.textContent).toContain('5 digits');
    });

    test('shows error for invalid zip code (async validation)', async () => {
      const { container } = render(App);
      await waitForUpdates();

      await navigateToStep2(container);

      const zipCodeInput = container.querySelector('#zipCode') as HTMLInputElement;
      expect(zipCodeInput).toBeTruthy();

      await userEvent.clear(zipCodeInput);
      await userEvent.type(zipCodeInput, '00000');
      await userEvent.click(container);
      await waitForUpdates();

      // Wait for async validation
      await waitForAsyncValidation();

      const zipCodeError = container.querySelector('[data-testid="zipCode-error"]');
      expect(zipCodeError).toBeTruthy();
      expect(zipCodeError?.textContent).toContain('not serviceable');
    });

    test('shows Previous and Next buttons on step 2', async () => {
      const { container } = render(App);
      await waitForUpdates();

      await navigateToStep2(container);

      const previousButton = container.querySelector('[data-testid="previous-button"]');
      const nextButton = container.querySelector('[data-testid="next-button"]');

      expect(previousButton).toBeTruthy();
      expect(nextButton).toBeTruthy();
    });
  });

  describe('Step Navigation - Previous', () => {
    async function navigateToStep2(container: HTMLElement) {
      const firstNameInput = container.querySelector('#firstName') as HTMLInputElement;
      const lastNameInput = container.querySelector('#lastName') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const phoneInput = container.querySelector('#phone') as HTMLInputElement;

      await userEvent.clear(firstNameInput);
      await userEvent.type(firstNameInput, 'John');
      await userEvent.clear(lastNameInput);
      await userEvent.type(lastNameInput, 'Doe');
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'john@example.com');
      await userEvent.clear(phoneInput);
      await userEvent.type(phoneInput, '123-456-7890');

      await waitForAsyncValidation();

      const nextButton = container.querySelector('[data-testid="next-button"]') as HTMLButtonElement;
      await userEvent.click(nextButton);
      await waitForUpdates();
    }

    test('goes back to step 1 from step 2', async () => {
      const { container } = render(App);
      await waitForUpdates();

      await navigateToStep2(container);

      // Verify on step 2
      let addressStep = container.querySelector('[data-testid="address-step"]');
      expect(addressStep).toBeTruthy();

      // Click Previous
      const previousButton = container.querySelector('[data-testid="previous-button"]') as HTMLButtonElement;
      await userEvent.click(previousButton);
      await waitForUpdates();

      // Should be back on step 1
      const personalInfoStep = container.querySelector('[data-testid="personal-info-step"]');
      expect(personalInfoStep).toBeTruthy();

      // Data should be preserved
      const firstNameInput = container.querySelector('#firstName') as HTMLInputElement;
      expect(firstNameInput.value).toBe('John');
    });
  });

  describe('Step 3 - Review', () => {
    async function navigateToReviewStep(container: HTMLElement) {
      // Fill step 1
      const firstNameInput = container.querySelector('#firstName') as HTMLInputElement;
      const lastNameInput = container.querySelector('#lastName') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const phoneInput = container.querySelector('#phone') as HTMLInputElement;

      await userEvent.clear(firstNameInput);
      await userEvent.type(firstNameInput, 'Jane');
      await userEvent.clear(lastNameInput);
      await userEvent.type(lastNameInput, 'Smith');
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'jane@example.com');
      await userEvent.clear(phoneInput);
      await userEvent.type(phoneInput, '555-123-4567');

      await waitForAsyncValidation();

      let nextButton = container.querySelector('[data-testid="next-button"]') as HTMLButtonElement;
      await userEvent.click(nextButton);
      await waitForUpdates();

      // Fill step 2
      const streetInput = container.querySelector('#street') as HTMLInputElement;
      const cityInput = container.querySelector('#city') as HTMLInputElement;
      const stateInput = container.querySelector('#state') as HTMLInputElement;
      const zipCodeInput = container.querySelector('#zipCode') as HTMLInputElement;

      await userEvent.clear(streetInput);
      await userEvent.type(streetInput, '456 Oak Avenue');
      await userEvent.clear(cityInput);
      await userEvent.type(cityInput, 'Portland');
      await userEvent.clear(stateInput);
      await userEvent.type(stateInput, 'OR');
      await userEvent.clear(zipCodeInput);
      await userEvent.type(zipCodeInput, '97201');

      await waitForAsyncValidation();

      nextButton = container.querySelector('[data-testid="next-button"]') as HTMLButtonElement;
      await userEvent.click(nextButton);
      await waitForUpdates();
    }

    test('displays all personal info data on review step', async () => {
      const { container } = render(App);
      await waitForUpdates();

      await navigateToReviewStep(container);

      const reviewStep = container.querySelector('[data-testid="review-step"]');
      expect(reviewStep).toBeTruthy();

      // Check personal info is displayed
      expect(reviewStep?.textContent).toContain('Jane');
      expect(reviewStep?.textContent).toContain('Smith');
      expect(reviewStep?.textContent).toContain('jane@example.com');
      expect(reviewStep?.textContent).toContain('555-123-4567');
    });

    test('displays all address data on review step', async () => {
      const { container } = render(App);
      await waitForUpdates();

      await navigateToReviewStep(container);

      const reviewStep = container.querySelector('[data-testid="review-step"]');
      expect(reviewStep).toBeTruthy();

      // Check address is displayed
      expect(reviewStep?.textContent).toContain('456 Oak Avenue');
      expect(reviewStep?.textContent).toContain('Portland');
      expect(reviewStep?.textContent).toContain('OR');
      expect(reviewStep?.textContent).toContain('97201');
    });

    test('shows Submit button instead of Next button', async () => {
      const { container } = render(App);
      await waitForUpdates();

      await navigateToReviewStep(container);

      const submitButton = container.querySelector('[data-testid="submit-button"]');
      const nextButton = container.querySelector('[data-testid="next-button"]');

      expect(submitButton).toBeTruthy();
      expect(nextButton).toBeNull();
    });

    test('allows editing personal info from review step', async () => {
      const { container } = render(App);
      await waitForUpdates();

      await navigateToReviewStep(container);

      // Click edit personal info
      const editPersonalInfoButton = container.querySelector('[data-testid="edit-personal-info"]') as HTMLButtonElement;
      expect(editPersonalInfoButton).toBeTruthy();

      await userEvent.click(editPersonalInfoButton);
      await waitForUpdates();

      // Should be on step 1
      const personalInfoStep = container.querySelector('[data-testid="personal-info-step"]');
      expect(personalInfoStep).toBeTruthy();

      // Data should be preserved
      const firstNameInput = container.querySelector('#firstName') as HTMLInputElement;
      expect(firstNameInput.value).toBe('Jane');
    });

    test('allows editing address from review step', async () => {
      const { container } = render(App);
      await waitForUpdates();

      await navigateToReviewStep(container);

      // Click edit address
      const editAddressButton = container.querySelector('[data-testid="edit-address"]') as HTMLButtonElement;
      expect(editAddressButton).toBeTruthy();

      await userEvent.click(editAddressButton);
      await waitForUpdates();

      // Should be on step 2
      const addressStep = container.querySelector('[data-testid="address-step"]');
      expect(addressStep).toBeTruthy();

      // Data should be preserved
      const streetInput = container.querySelector('#street') as HTMLInputElement;
      expect(streetInput.value).toBe('456 Oak Avenue');
    });
  });

  describe('Final Submission', () => {
    async function completeAllSteps(container: HTMLElement) {
      // Step 1
      const firstNameInput = container.querySelector('#firstName') as HTMLInputElement;
      const lastNameInput = container.querySelector('#lastName') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const phoneInput = container.querySelector('#phone') as HTMLInputElement;

      await userEvent.clear(firstNameInput);
      await userEvent.type(firstNameInput, 'Alice');
      await userEvent.clear(lastNameInput);
      await userEvent.type(lastNameInput, 'Johnson');
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'alice@example.com');
      await userEvent.clear(phoneInput);
      await userEvent.type(phoneInput, '777-888-9999');

      await waitForAsyncValidation();

      let nextButton = container.querySelector('[data-testid="next-button"]') as HTMLButtonElement;
      await userEvent.click(nextButton);
      await waitForUpdates();

      // Step 2
      const streetInput = container.querySelector('#street') as HTMLInputElement;
      const cityInput = container.querySelector('#city') as HTMLInputElement;
      const stateInput = container.querySelector('#state') as HTMLInputElement;
      const zipCodeInput = container.querySelector('#zipCode') as HTMLInputElement;

      await userEvent.clear(streetInput);
      await userEvent.type(streetInput, '789 Maple Drive');
      await userEvent.clear(cityInput);
      await userEvent.type(cityInput, 'Austin');
      await userEvent.clear(stateInput);
      await userEvent.type(stateInput, 'TX');
      await userEvent.clear(zipCodeInput);
      await userEvent.type(zipCodeInput, '73301');

      await waitForAsyncValidation();

      nextButton = container.querySelector('[data-testid="next-button"]') as HTMLButtonElement;
      await userEvent.click(nextButton);
      await waitForUpdates();
    }

    test('successfully submits and shows success screen', async () => {
      const { container } = render(App);
      await waitForUpdates();

      await completeAllSteps(container);

      // Submit
      const submitButton = container.querySelector('[data-testid="submit-button"]') as HTMLButtonElement;
      await userEvent.click(submitButton);
      await waitForUpdates();

      // Wait for submission
      await new Promise(resolve => setTimeout(resolve, 1700));

      // Should show success state
      const successState = container.querySelector('[data-testid="success-state"]');
      expect(successState).toBeTruthy();
      expect(successState?.textContent).toContain('Onboarding Complete');
      expect(successState?.textContent).toContain('Alice Johnson');
      expect(successState?.textContent).toContain('alice@example.com');
      expect(successState?.textContent).toContain('789 Maple Drive');
    });

    test('shows submitting state during submission', async () => {
      const { container } = render(App);
      await waitForUpdates();

      await completeAllSteps(container);

      const submitButton = container.querySelector('[data-testid="submit-button"]') as HTMLButtonElement;
      await userEvent.click(submitButton);
      await waitForUpdates();

      // Check button text changed
      expect(submitButton.textContent).toContain('Submitting');
    });

    test('allows starting over from success screen', async () => {
      const { container } = render(App);
      await waitForUpdates();

      await completeAllSteps(container);

      const submitButton = container.querySelector('[data-testid="submit-button"]') as HTMLButtonElement;
      await userEvent.click(submitButton);
      await new Promise(resolve => setTimeout(resolve, 1700));

      // Verify success state
      let successState = container.querySelector('[data-testid="success-state"]');
      expect(successState).toBeTruthy();

      // Click Start Over
      const resetButton = successState?.querySelector('button') as HTMLButtonElement;
      expect(resetButton).toBeTruthy();
      await userEvent.click(resetButton);
      await waitForUpdates();

      // Should be back on step 1
      const personalInfoStep = container.querySelector('[data-testid="personal-info-step"]');
      expect(personalInfoStep).toBeTruthy();

      // Form should be reset
      const firstNameInput = container.querySelector('#firstName') as HTMLInputElement;
      expect(firstNameInput.value).toBe('');
    });
  });

  describe('Step Indicator Interactions', () => {
    async function fillStep1(container: HTMLElement) {
      const firstNameInput = container.querySelector('#firstName') as HTMLInputElement;
      const lastNameInput = container.querySelector('#lastName') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const phoneInput = container.querySelector('#phone') as HTMLInputElement;

      await userEvent.clear(firstNameInput);
      await userEvent.type(firstNameInput, 'Bob');
      await userEvent.clear(lastNameInput);
      await userEvent.type(lastNameInput, 'Williams');
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'bob@example.com');
      await userEvent.clear(phoneInput);
      await userEvent.type(phoneInput, '321-654-9870');

      await waitForAsyncValidation();

      const nextButton = container.querySelector('[data-testid="next-button"]') as HTMLButtonElement;
      await userEvent.click(nextButton);
      await waitForUpdates();
    }

    test('can click on completed step to navigate back', async () => {
      const { container } = render(App);
      await waitForUpdates();

      await fillStep1(container);

      // Verify on step 2
      let addressStep = container.querySelector('[data-testid="address-step"]');
      expect(addressStep).toBeTruthy();

      // Click on step 1 in indicator
      const step1Button = container.querySelector('[data-testid="step-personalInfo"]') as HTMLButtonElement;
      await userEvent.click(step1Button);
      await waitForUpdates();

      // Should be back on step 1
      const personalInfoStep = container.querySelector('[data-testid="personal-info-step"]');
      expect(personalInfoStep).toBeTruthy();
    });

    test('cannot click on incomplete steps', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Try to click on step 2 (not completed yet)
      const step2Button = container.querySelector('[data-testid="step-address"]') as HTMLButtonElement;
      expect(step2Button.disabled).toBe(true);
    });
  });
});
