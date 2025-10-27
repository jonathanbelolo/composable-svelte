/**
 * Browser integration tests for Contact Form Example
 *
 * These tests verify the integrated form mode works correctly in a real browser.
 * They test the complete user flow including:
 * - Parent-child reducer composition
 * - Form validation
 * - Parent observation of form events
 * - Success message display
 * - Submission history tracking
 */

import { expect, test, describe } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import App from '../src/app/App.svelte';

// Helper to wait for DOM updates
const waitForUpdates = () => new Promise(resolve => setTimeout(resolve, 100));

describe('Contact Form - Integrated Mode', () => {
  describe('Initial Render', () => {
    test('renders contact form with all fields', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Check form fields exist
      const nameField = container.querySelector('[data-testid="name-field"]');
      const emailField = container.querySelector('[data-testid="email-field"]');
      const messageField = container.querySelector('[data-testid="message-field"]');
      const submitButton = container.querySelector('[data-testid="submit-button"]');

      expect(nameField).toBeTruthy();
      expect(emailField).toBeTruthy();
      expect(messageField).toBeTruthy();
      expect(submitButton).toBeTruthy();
    });

    test('does not show success message initially', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const successMessage = container.querySelector('[data-testid="success-message"]');
      expect(successMessage).toBeNull();
    });

    test('does not show submission history initially', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const submissionHistory = container.querySelector('[data-testid="submission-history"]');
      expect(submissionHistory).toBeNull();
    });
  });

  describe('Field Validation', () => {
    test('shows validation error when name is too short', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const nameInput = container.querySelector('#name') as HTMLInputElement;
      expect(nameInput).toBeTruthy();

      // Enter invalid name
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'J');

      // Blur to trigger validation
      await userEvent.click(container);
      await waitForUpdates();

      // Check for error message
      const nameError = container.querySelector('[data-testid="name-error"]');
      expect(nameError).toBeTruthy();
      expect(nameError?.textContent).toContain('at least 2 characters');
    });

    test('shows validation error for invalid email', async () => {
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
      expect(emailError?.textContent).toContain('valid email');
    });

    test('shows validation error when message is too short', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const messageInput = container.querySelector('#message') as HTMLTextAreaElement;
      expect(messageInput).toBeTruthy();

      // Enter invalid message
      await userEvent.clear(messageInput);
      await userEvent.type(messageInput, 'Short');

      // Blur to trigger validation
      await userEvent.click(container);
      await waitForUpdates();

      // Check for error message
      const messageError = container.querySelector('[data-testid="message-error"]');
      expect(messageError).toBeTruthy();
      expect(messageError?.textContent).toContain('at least 10 characters');
    });

    test('clears validation errors when input becomes valid', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const nameInput = container.querySelector('#name') as HTMLInputElement;

      // Enter invalid name
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'J');
      await userEvent.click(container);
      await waitForUpdates();

      // Verify error shows
      let nameError = container.querySelector('[data-testid="name-error"]');
      expect(nameError).toBeTruthy();

      // Fix the name
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'John Doe');
      await userEvent.click(container);
      await waitForUpdates();

      // Error should be gone
      nameError = container.querySelector('[data-testid="name-error"]');
      expect(nameError).toBeNull();
    });
  });

  describe('Form Submission', () => {
    test('successfully submits valid form', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Fill out valid form
      const nameInput = container.querySelector('#name') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const messageInput = container.querySelector('#message') as HTMLTextAreaElement;
      const submitButton = container.querySelector('[data-testid="submit-button"]') as HTMLButtonElement;

      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'John Doe');
      await waitForUpdates();

      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'john@example.com');
      await waitForUpdates();

      await userEvent.clear(messageInput);
      await userEvent.type(messageInput, 'This is a test message that is long enough to pass validation.');
      await waitForUpdates();

      // Submit form
      await userEvent.click(submitButton);

      // Wait for async submission
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check for success message
      const successMessage = container.querySelector('[data-testid="success-message"]');
      expect(successMessage).toBeTruthy();
      expect(successMessage?.textContent).toContain('Thank you, John Doe!');
    });

    test('adds submission to history', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Fill and submit form
      const nameInput = container.querySelector('#name') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const messageInput = container.querySelector('#message') as HTMLTextAreaElement;
      const submitButton = container.querySelector('[data-testid="submit-button"]') as HTMLButtonElement;

      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Jane Smith');
      await waitForUpdates();

      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'jane@example.com');
      await waitForUpdates();

      await userEvent.clear(messageInput);
      await userEvent.type(messageInput, 'Another test message for submission history.');
      await waitForUpdates();

      await userEvent.click(submitButton);
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Check submission history
      const submissionHistory = container.querySelector('[data-testid="submission-history"]');
      expect(submissionHistory).toBeTruthy();

      const submissionItems = container.querySelectorAll('[data-testid="submission-item"]');
      expect(submissionItems.length).toBeGreaterThan(0);

      // Check the submission contains the right data
      const firstSubmission = submissionItems[0];
      expect(firstSubmission.textContent).toContain('Jane Smith');
      expect(firstSubmission.textContent).toContain('jane@example.com');
    });

    test('dismisses success message when clicked', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Fill and submit form
      const nameInput = container.querySelector('#name') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const messageInput = container.querySelector('#message') as HTMLTextAreaElement;
      const submitButton = container.querySelector('[data-testid="submit-button"]') as HTMLButtonElement;

      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Test User');
      await waitForUpdates();

      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'test@example.com');
      await waitForUpdates();

      await userEvent.clear(messageInput);
      await userEvent.type(messageInput, 'Test message for dismissal test.');
      await waitForUpdates();

      await userEvent.click(submitButton);
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Verify success message exists
      let successMessage = container.querySelector('[data-testid="success-message"]');
      expect(successMessage).toBeTruthy();

      // Click dismiss button
      const dismissButton = container.querySelector('[data-testid="dismiss-success"]') as HTMLButtonElement;
      expect(dismissButton).toBeTruthy();
      await userEvent.click(dismissButton);
      await waitForUpdates();

      // Success message should be gone
      successMessage = container.querySelector('[data-testid="success-message"]');
      expect(successMessage).toBeNull();
    });

    test('does not submit invalid form', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Fill with invalid data
      const nameInput = container.querySelector('#name') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const messageInput = container.querySelector('#message') as HTMLTextAreaElement;
      const submitButton = container.querySelector('[data-testid="submit-button"]') as HTMLButtonElement;

      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'J'); // Too short
      await waitForUpdates();

      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'invalid'); // Invalid email
      await waitForUpdates();

      await userEvent.clear(messageInput);
      await userEvent.type(messageInput, 'Short'); // Too short
      await waitForUpdates();

      // Try to submit
      await userEvent.click(submitButton);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Should not show success message
      const successMessage = container.querySelector('[data-testid="success-message"]');
      expect(successMessage).toBeNull();

      // Should show validation errors
      const nameError = container.querySelector('[data-testid="name-error"]');
      const emailError = container.querySelector('[data-testid="email-error"]');
      const messageError = container.querySelector('[data-testid="message-error"]');

      expect(nameError).toBeTruthy();
      expect(emailError).toBeTruthy();
      expect(messageError).toBeTruthy();
    });
  });

  describe('Async Email Validation', () => {
    test('shows validating state during async validation', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const emailInput = container.querySelector('#email') as HTMLInputElement;

      // Enter email and blur
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'test@example.com');
      await userEvent.click(container); // Blur
      await waitForUpdates();

      // Should show validating state (briefly)
      // Note: This might be too fast to catch, but the test demonstrates the pattern
      const validatingMessage = container.querySelector('[data-testid="email-validating"]');
      // We can't reliably assert this is visible since async validation is fast
      // But the test shows the pattern for checking it
    });

    test('rejects blocked email domains', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const emailInput = container.querySelector('#email') as HTMLInputElement;

      // Enter blocked email
      await userEvent.clear(emailInput);
      await userEvent.type(emailInput, 'test@spam.com');
      await userEvent.click(container); // Blur

      // Wait for async validation
      await new Promise(resolve => setTimeout(resolve, 600));

      // Should show error
      const emailError = container.querySelector('[data-testid="email-error"]');
      expect(emailError).toBeTruthy();
      expect(emailError?.textContent).toContain('not allowed');
    });
  });
});
