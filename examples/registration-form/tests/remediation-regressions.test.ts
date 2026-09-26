/**
 * Remediation Regressions Tests for Registration Form (B030-001 through B030-009)
 */

import { expect, test, describe } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import App from '../src/app/App.svelte';
import { appReducer } from '../src/app/app.reducer.js';
import { createInitialAppState } from '../src/app/app.state.js';

const waitForUpdates = () => new Promise((resolve) => setTimeout(resolve, 100));
const waitForAsyncValidation = () => new Promise((resolve) => setTimeout(resolve, 600));

describe('Remediation Regressions (B030)', () => {
  describe('Stale form completion guard (B030-008)', () => {
    test('ignores stale submissionSucceeded action with mismatched submissionId', () => {
      const initialState = createInitialAppState();
      const submittingState = {
        ...initialState,
        registrationForm: {
          ...initialState.registrationForm,
          isSubmitting: true,
          submissionId: 2,
          data: {
            username: 'alice',
            email: 'alice@example.com',
            password: 'Password123',
            confirmPassword: 'Password123'
          }
        }
      };

      const staleAction = {
        type: 'registrationForm' as const,
        action: {
          type: 'submissionSucceeded' as const,
          submissionId: 1
        }
      };

      const [nextState] = appReducer(submittingState, staleAction, {});
      expect(nextState.registrationSuccess).toBe(false);
      expect(nextState.registeredUser).toBeNull();
    });

    test('ignores submissionSucceeded action when form is not submitting', () => {
      const initialState = createInitialAppState();
      const action = {
        type: 'registrationForm' as const,
        action: {
          type: 'submissionSucceeded' as const,
          submissionId: 1
        }
      };

      const [nextState] = appReducer(initialState, action, {});
      expect(nextState.registrationSuccess).toBe(false);
      expect(nextState.registeredUser).toBeNull();
    });
  });

  describe('Semantic single reset via composition (B030-004)', () => {
    test('registrationReset action resets both parent and child form state', () => {
      const initialState = createInitialAppState();
      const stateWithData = {
        ...initialState,
        registrationSuccess: true,
        registeredUser: { username: 'alice', email: 'alice@example.com' },
        registrationForm: {
          ...initialState.registrationForm,
          data: {
            username: 'alice',
            email: 'alice@example.com',
            password: 'Password123',
            confirmPassword: 'Password123'
          }
        }
      };

      const [nextState] = appReducer(stateWithData, { type: 'registrationReset' }, {});
      expect(nextState.registrationSuccess).toBe(false);
      expect(nextState.registeredUser).toBeNull();
      expect(nextState.registrationForm.data.username).toBe('');
      expect(nextState.registrationForm.data.email).toBe('');
    });
  });

  describe('Accessibility & UI validations (B030-003, B030-006, B030-009)', () => {
    test('sets aria-invalid and aria-describedby on invalid fields', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const usernameInput = container.querySelector('#username') as HTMLInputElement;
      expect(usernameInput.getAttribute('aria-invalid')).toBe('false');
      expect(usernameInput.getAttribute('aria-describedby')).toBeNull();

      await userEvent.type(usernameInput, 'ab');
      await userEvent.click(container);
      await waitForUpdates();

      expect(usernameInput.getAttribute('aria-invalid')).toBe('true');
      expect(usernameInput.getAttribute('aria-describedby')).toBe('username-error');
      const errorEl = container.querySelector('#username-error');
      expect(errorEl).toBeTruthy();
      expect(errorEl?.textContent).toContain('at least 3 characters');
    });

    test('submit button is disabled while form is submitting', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const usernameInput = container.querySelector('#username') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const passwordInput = container.querySelector('#password') as HTMLInputElement;
      const confirmPasswordInput = container.querySelector('#confirmPassword') as HTMLInputElement;
      const submitButton = container.querySelector('[data-testid="submit-button"]') as HTMLButtonElement;

      await userEvent.type(usernameInput, 'validuser');
      await userEvent.type(emailInput, 'valid@example.com');
      await userEvent.type(passwordInput, 'Password123');
      await userEvent.type(confirmPasswordInput, 'Password123');

      await waitForAsyncValidation();
      await userEvent.click(submitButton);
      await waitForUpdates();

      await expect.poll(() => submitButton.disabled, {timeout:3000}).toBe(true);
      await expect.poll(() => container.querySelector('[data-testid="success-state"]'), {timeout:3000}).not.toBeNull();
    });

    test('blocks submission when credentials are taken', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const usernameInput = container.querySelector('#username') as HTMLInputElement;
      const emailInput = container.querySelector('#email') as HTMLInputElement;
      const passwordInput = container.querySelector('#password') as HTMLInputElement;
      const confirmPasswordInput = container.querySelector('#confirmPassword') as HTMLInputElement;
      const submitButton = container.querySelector('[data-testid="submit-button"]') as HTMLButtonElement;

      await userEvent.type(usernameInput, 'admin');
      await userEvent.type(emailInput, 'admin@example.com');
      await userEvent.type(passwordInput, 'Password123');
      await userEvent.type(confirmPasswordInput, 'Password123');

      await waitForAsyncValidation();

      const usernameError = container.querySelector('[data-testid="username-error"]');
      expect(usernameError?.textContent).toContain('already taken');

      await userEvent.click(submitButton);
      await waitForUpdates();

      const successState = container.querySelector('[data-testid="success-state"]');
      expect(successState).toBeNull();
    });

    test('unmounts cleanly without errors (B030-001)', async () => {
      const { unmount } = render(App);
      await waitForUpdates();
      expect(() => unmount()).not.toThrow();
    });
  });
});
