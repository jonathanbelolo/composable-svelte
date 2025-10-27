/**
 * Browser integration tests for Registration Form Example
 *
 * These tests verify the integrated form mode works correctly with:
 * - Cross-field validation (password confirmation)
 * - Async validators (username/email availability)
 * - Complex validation rules (username format, password strength)
 * - Parent observation of submission success
 * - Success screen display
 */

import { expect, test, describe } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import App from '../src/app/App.svelte';

// Helper to wait for DOM updates
const waitForUpdates = () => new Promise(resolve => setTimeout(resolve, 100));

// Helper to wait for async validation
const waitForAsyncValidation = () => new Promise(resolve => setTimeout(resolve, 600));

describe('Registration Form - Integrated Mode', () => {
  describe('Initial Render', () => {
    test('renders registration form with all fields', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Check form fields exist
      const usernameField = container.querySelector('[data-testid="username-field"]');
      const emailField = container.querySelector('[data-testid="email-field"]');
      const passwordField = container.querySelector('[data-testid="password-field"]');
      const confirmPasswordField = container.querySelector('[data-testid="confirm-password-field"]');
      const submitButton = container.querySelector('[data-testid="submit-button"]');

      expect(usernameField).toBeTruthy();
      expect(emailField).toBeTruthy();
      expect(passwordField).toBeTruthy();
      expect(confirmPasswordField).toBeTruthy();
      expect(submitButton).toBeTruthy();
    });

    test('does not show success state initially', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const successState = container.querySelector('[data-testid="success-state"]');
      expect(successState).toBeNull();
    });
  });

  describe('Username Validation', () => {
    test('shows validation error for username too short', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const usernameInput = container.querySelector('#username') as HTMLInputElement;
      expect(usernameInput).toBeTruthy();

      // Enter invalid username
      await userEvent.clear(usernameInput);
      await userEvent.type(usernameInput, 'ab');

      // Blur to trigger validation
      await userEvent.click(container);
      await waitForUpdates();

      // Check for error message
      const usernameError = container.querySelector('[data-testid="username-error"]');
      expect(usernameError).toBeTruthy();
      expect(usernameError?.textContent).toContain('at least 3 characters');
    });

    test('shows validation error for invalid username format', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const usernameInput = container.querySelector('#username') as HTMLInputElement;
      expect(usernameInput).toBeTruthy();

      // Enter invalid username with special characters
      await userEvent.clear(usernameInput);
      await userEvent.type(usernameInput, 'user@name');

      // Blur to trigger validation
      await userEvent.click(container);
      await waitForUpdates();

      // Check for error message
      const usernameError = container.querySelector('[data-testid="username-error"]');
      expect(usernameError).toBeTruthy();
    });

    test('shows "checking availability" during async validation', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const usernameInput = container.querySelector('#username') as HTMLInputElement;
      expect(usernameInput).toBeTruthy();

      // Enter valid username
      await userEvent.clear(usernameInput);
      await userEvent.type(usernameInput, 'newuser');

      // Blur to trigger validation
      await userEvent.click(container);
      await waitForUpdates();

      // Check for "checking availability" message
      const validatingMessage = container.querySelector('[data-testid="username-validating"]');
      expect(validatingMessage).toBeTruthy();
      expect(validatingMessage?.textContent).toContain('Checking availability');
    });

    test('shows error for taken username', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const usernameInput = container.querySelector('#username') as HTMLInputElement;
      expect(usernameInput).toBeTruthy();

      // Enter taken username
      await userEvent.clear(usernameInput);
      await userEvent.type(usernameInput, 'admin');

      // Blur to trigger validation
      await userEvent.click(container);
      await waitForUpdates();

      // Wait for async validation
      await waitForAsyncValidation();

      // Check for error message
      const usernameError = container.querySelector('[data-testid="username-error"]');
      expect(usernameError).toBeTruthy();
      expect(usernameError?.textContent).toContain('already taken');
    });
  });

  describe('Email Validation', () => {
    test('shows validation error for invalid email format', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const emailInput = container.querySelector('#email') as HTMLInputElement;
      expect(emailInput).toBeTruthy();

      // Enter invalid email
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'not-an-email');

      // Blur to trigger validation
      await userEvent.click(container);
      await waitForUpdates();

      // Check for error message
      const emailError = container.querySelector('[data-testid="email-error"]');
      expect(emailError).toBeTruthy();
      expect(emailError?.textContent).toContain('Invalid email');
    });

    test('shows error for taken email', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const emailInput = container.querySelector('#email') as HTMLInputElement;
      expect(emailInput).toBeTruthy();

      // Enter taken email
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'admin@example.com');

      // Blur to trigger validation
      await userEvent.click(container);
      await waitForUpdates();

      // Wait for async validation
      await waitForAsyncValidation();

      // Check for error message
      const emailError = container.querySelector('[data-testid="email-error"]');
      expect(emailError).toBeTruthy();
      expect(emailError?.textContent).toContain('already registered');
    });
  });

  describe('Password Validation', () => {
    test('shows validation error for password too short', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const passwordInput = container.querySelector('#password') as HTMLInputElement;
      expect(passwordInput).toBeTruthy();

      // Enter short password
      await userEvent.clear(passwordInput);
      await userEvent.type(passwordInput, 'Pass1');

      // Blur to trigger validation
      await userEvent.click(container);
      await waitForUpdates();

      // Check for error message
      const passwordError = container.querySelector('[data-testid="password-error"]');
      expect(passwordError).toBeTruthy();
      expect(passwordError?.textContent).toContain('at least 8 characters');
    });

    test('shows validation error for password missing uppercase', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const passwordInput = container.querySelector('#password') as HTMLInputElement;
      expect(passwordInput).toBeTruthy();

      // Enter password without uppercase
      await userEvent.clear(passwordInput);
      await userEvent.type(passwordInput, 'password123');

      // Blur to trigger validation
      await userEvent.click(container);
      await waitForUpdates();

      // Check for error message
      const passwordError = container.querySelector('[data-testid="password-error"]');
      expect(passwordError).toBeTruthy();
      expect(passwordError?.textContent).toContain('uppercase');
    });

    test('shows validation error for password missing number', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const passwordInput = container.querySelector('#password') as HTMLInputElement;
      expect(passwordInput).toBeTruthy();

      // Enter password without number
      await userEvent.clear(passwordInput);
      await userEvent.type(passwordInput, 'Password');

      // Blur to trigger validation
      await userEvent.click(container);
      await waitForUpdates();

      // Check for error message
      const passwordError = container.querySelector('[data-testid="password-error"]');
      expect(passwordError).toBeTruthy();
      expect(passwordError?.textContent).toContain('number');
    });
  });

  describe('Cross-Field Validation (Password Confirmation)', () => {
    test('shows error when passwords do not match on submit', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Fill all required fields except matching passwords
      const usernameInput = container.querySelector('#username') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const passwordInput = container.querySelector('#password') as HTMLInputElement;
      const confirmPasswordInput = container.querySelector('#confirmPassword') as HTMLInputElement;
      const submitButton = container.querySelector('[data-testid="submit-button"]') as HTMLButtonElement;

      expect(passwordInput).toBeTruthy();
      expect(confirmPasswordInput).toBeTruthy();

      await userEvent.clear(usernameInput);
      await userEvent.type(usernameInput, 'testuser');

      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'test@example.com');

      // Enter password
      await userEvent.clear(passwordInput);
      await userEvent.type(passwordInput, 'Password123');

      // Enter different confirm password
      await userEvent.clear(confirmPasswordInput);
      await userEvent.type(confirmPasswordInput, 'Password456');

      // Wait for async validation
      await waitForAsyncValidation();

      // Try to submit - this triggers cross-field validation
      await userEvent.click(submitButton);
      await waitForUpdates();

      // Check for error message on confirm password field
      const confirmPasswordError = container.querySelector('[data-testid="confirm-password-error"]');
      expect(confirmPasswordError).toBeTruthy();
      expect(confirmPasswordError?.textContent).toContain('do not match');
    });

    test('submits successfully when passwords match', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const usernameInput = container.querySelector('#username') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const passwordInput = container.querySelector('#password') as HTMLInputElement;
      const confirmPasswordInput = container.querySelector('#confirmPassword') as HTMLInputElement;
      const submitButton = container.querySelector('[data-testid="submit-button"]') as HTMLButtonElement;

      expect(passwordInput).toBeTruthy();
      expect(confirmPasswordInput).toBeTruthy();

      await userEvent.clear(usernameInput);
      await userEvent.type(usernameInput, 'testuser2');

      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'test2@example.com');

      // Enter matching passwords
      await userEvent.clear(passwordInput);
      await userEvent.type(passwordInput, 'Password123');

      await userEvent.clear(confirmPasswordInput);
      await userEvent.type(confirmPasswordInput, 'Password123');

      // Wait for async validation
      await waitForAsyncValidation();

      // Submit form
      await userEvent.click(submitButton);
      await waitForUpdates();

      // Wait for submission
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Should show success screen (not error)
      const successState = container.querySelector('[data-testid="success-state"]');
      expect(successState).toBeTruthy();

      // Should NOT have password mismatch error
      const confirmPasswordError = container.querySelector('[data-testid="confirm-password-error"]');
      expect(confirmPasswordError).toBeNull();
    });
  });

  describe('Form Submission', () => {
    test('successfully submits valid form and shows success screen', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Fill all fields with valid data
      const usernameInput = container.querySelector('#username') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const passwordInput = container.querySelector('#password') as HTMLInputElement;
      const confirmPasswordInput = container.querySelector('#confirmPassword') as HTMLInputElement;
      const submitButton = container.querySelector('[data-testid="submit-button"]') as HTMLButtonElement;

      await userEvent.clear(usernameInput);
      await userEvent.type(usernameInput, 'newuser123');

      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'newuser@example.com');

      await userEvent.clear(passwordInput);
      await userEvent.type(passwordInput, 'Password123');

      await userEvent.clear(confirmPasswordInput);
      await userEvent.type(confirmPasswordInput, 'Password123');

      // Wait for async validation to complete
      await waitForAsyncValidation();

      // Submit form
      await userEvent.click(submitButton);
      await waitForUpdates();

      // Wait for submission to complete
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Check for success state
      const successState = container.querySelector('[data-testid="success-state"]');
      expect(successState).toBeTruthy();
      expect(successState?.textContent).toContain('Registration Successful');
      expect(successState?.textContent).toContain('newuser123');
      expect(successState?.textContent).toContain('newuser@example.com');
    });

    test('shows "Creating Account..." button text during submission', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Fill all fields with valid data
      const usernameInput = container.querySelector('#username') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const passwordInput = container.querySelector('#password') as HTMLInputElement;
      const confirmPasswordInput = container.querySelector('#confirmPassword') as HTMLInputElement;
      const submitButton = container.querySelector('[data-testid="submit-button"]') as HTMLButtonElement;

      await userEvent.clear(usernameInput);
      await userEvent.type(usernameInput, 'newuser456');

      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'newuser456@example.com');

      await userEvent.clear(passwordInput);
      await userEvent.type(passwordInput, 'Password123');

      await userEvent.clear(confirmPasswordInput);
      await userEvent.type(confirmPasswordInput, 'Password123');

      // Wait for async validation
      await waitForAsyncValidation();

      // Submit form
      await userEvent.click(submitButton);
      await waitForUpdates();

      // Check button text changed
      expect(submitButton.textContent).toContain('Creating Account');
    });

    test('does not submit invalid form', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Fill form with mismatched passwords
      const usernameInput = container.querySelector('#username') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const passwordInput = container.querySelector('#password') as HTMLInputElement;
      const confirmPasswordInput = container.querySelector('#confirmPassword') as HTMLInputElement;
      const submitButton = container.querySelector('[data-testid="submit-button"]') as HTMLButtonElement;

      await userEvent.clear(usernameInput);
      await userEvent.type(usernameInput, 'validuser');

      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'valid@example.com');

      await userEvent.clear(passwordInput);
      await userEvent.type(passwordInput, 'Password123');

      await userEvent.clear(confirmPasswordInput);
      await userEvent.type(confirmPasswordInput, 'DifferentPass123');

      // Wait for validation
      await waitForAsyncValidation();

      // Try to submit
      await userEvent.click(submitButton);
      await waitForUpdates();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Success state should NOT appear
      const successState = container.querySelector('[data-testid="success-state"]');
      expect(successState).toBeNull();
    });
  });

  describe('Success Screen', () => {
    test('allows resetting to register another account', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Fill and submit form
      const usernameInput = container.querySelector('#username') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const passwordInput = container.querySelector('#password') as HTMLInputElement;
      const confirmPasswordInput = container.querySelector('#confirmPassword') as HTMLInputElement;
      const submitButton = container.querySelector('[data-testid="submit-button"]') as HTMLButtonElement;

      await userEvent.clear(usernameInput);
      await userEvent.type(usernameInput, 'testuser789');

      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'testuser789@example.com');

      await userEvent.clear(passwordInput);
      await userEvent.type(passwordInput, 'Password123');

      await userEvent.clear(confirmPasswordInput);
      await userEvent.type(confirmPasswordInput, 'Password123');

      await waitForAsyncValidation();
      await userEvent.click(submitButton);
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Verify success state
      let successState = container.querySelector('[data-testid="success-state"]');
      expect(successState).toBeTruthy();

      // Click "Register Another Account" button
      const resetButton = successState?.querySelector('button');
      expect(resetButton).toBeTruthy();
      await userEvent.click(resetButton!);
      await waitForUpdates();

      // Success state should be gone, form should be visible again
      successState = container.querySelector('[data-testid="success-state"]');
      expect(successState).toBeNull();

      // Form should be visible
      const formUsername = container.querySelector('#username');
      expect(formUsername).toBeTruthy();
    });
  });
});
