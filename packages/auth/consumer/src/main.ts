import { mount } from 'svelte';
import { createMockAuthDeps } from '@composable-svelte/auth/testing';
import App from './App.svelte';

const initialExpiry = '2030-01-01T12:00:00.000Z';

const mock = createMockAuthDeps({
  takenEmails: ['taken@example.com'],
  takenChangeEmails: ['taken-change@example.com'],
  emailChangeTokens: ['consumer-confirm-token', 'change_demo'],
  expiredResetTokens: ['expired-reset-token'],
  magicLinkTokens: ['consumer-magic-token'],
  sessionExpiresAt: initialExpiry,
  session: {
    subject_id: '00000000-0000-4000-8000-000000000001',
    display_name: 'Ada Lovelace',
    roles: ['member'],
    expires_at: initialExpiry
  },
  account: {
    email: 'ada@example.com',
    emailVerified: true,
    hasPassword: true,
    mfaEnabled: false,
    providers: ['github', 'google'],
    pendingEmail: null
  }
});
const counters = {
  fetchAccountCalls: 0,
  requestMagicLinkCalls: 0,
  signInWithMagicLinkCalls: 0,
  requestEmailChangeCalls: 0,
  resendEmailChangeCalls: 0,
  confirmEmailChangeCalls: 0,
  changePasswordCalls: 0,
  deleteAccountCalls: 0,
  refreshSessionCalls: 0
};
(window as Window & { __authConsumerCounters?: typeof counters }).__authConsumerCounters = counters;

let disableAttempts = 0;
let unlinkGoogleAttempts = 0;
let deleteAttempts = 0;
const dependencies = {
  ...mock,
  fetchAccount: async (signal?: AbortSignal) => {
    counters.fetchAccountCalls++;
    await new Promise((r) => setTimeout(r, 50));
    return mock.fetchAccount(signal);
  },
  requestMagicLink: (email: string, signal?: AbortSignal) => {
    counters.requestMagicLinkCalls++;
    return mock.requestMagicLink(email, signal);
  },
  signInWithMagicLink: (token: string, signal?: AbortSignal) => {
    counters.signInWithMagicLinkCalls++;
    return mock.signInWithMagicLink(token, signal);
  },
  requestEmailChange: async (newEmail: string, signal?: AbortSignal) => {
    counters.requestEmailChangeCalls++;
    if (newEmail === 'reauth-change@example.com') {
      throw { code: 'reauthentication_required', message: 'Confirm it is you.', methods: ['password'] };
    }
    return mock.requestEmailChange(newEmail, signal);
  },
  resendEmailChange: async (signal?: AbortSignal) => {
    counters.resendEmailChangeCalls++;
    return mock.resendEmailChange(signal);
  },
  confirmEmailChange: async (token: string, signal?: AbortSignal) => {
    counters.confirmEmailChangeCalls++;
    if (token === 'expired-confirm-token') {
      throw { code: 'token_expired', message: 'That link is no longer valid.' };
    }
    if (token === 'unauthorized-confirm-token') {
      throw { code: 'invalid_credentials', message: 'You are not signed in.' };
    }
    if (token === 'consumer-confirm-token') {
      return 'confirmed-email@example.com';
    }
    return mock.confirmEmailChange(token, signal);
  },
  // The first two disables demand re-authentication, as a backend would for a
  // stale session: one is abandoned by logging out, and the parent's prompt
  // retries the other with the same operation.
  disableMfa: (signal?: AbortSignal): Promise<void> =>
    ++disableAttempts <= 2
      ? Promise.reject({ code: 'reauthentication_required', message: 'Confirm it is you.', methods: ['password'] })
      : mock.disableMfa(signal),
  unlinkOAuthProvider: (provider: string, signal?: AbortSignal): Promise<void> =>
    provider === 'google' && ++unlinkGoogleAttempts === 1
      ? Promise.reject({ code: 'reauthentication_required', message: 'Confirm it is you.', methods: ['password', 'totp'] })
      : mock.unlinkOAuthProvider(provider, signal),
  changePassword: async (password: string, signal?: AbortSignal) => {
    counters.changePasswordCalls++;
    if (password === 'reauth-pass-1234') {
      throw { code: 'reauthentication_required', message: 'Confirm it is you.', methods: ['password'] };
    }
    if (password === 'rotated-pass-1234') {
      return {
        subject_id: '00000000-0000-4000-8000-000000000001',
        display_name: 'Ada Lovelace (Rotated)',
        roles: ['member']
      };
    }
    if (password === 'mismatch-pass-1234') {
      return {
        subject_id: '00000000-0000-9999-8000-000000000001',
        display_name: 'Intruder',
        roles: ['member']
      };
    }
    return mock.changePassword(password, signal);
  },
  deleteAccount: async (signal?: AbortSignal): Promise<void> => {
    counters.deleteAccountCalls++;
    if (++deleteAttempts === 1) {
      throw { code: 'reauthentication_required', message: 'Confirm it is you.', methods: ['password'] };
    }
    return mock.deleteAccount(signal);
  },
  refreshSession: async (signal?: AbortSignal) => {
    counters.refreshSessionCalls++;
    return mock.refreshSession(signal);
  },
  redirect: (url: string) => {
    (window as Window & { __authConsumerLastRedirect?: string }).__authConsumerLastRedirect = url;
  }
};
mount(App, { target: document.getElementById('app')!, props: { dependencies } });
