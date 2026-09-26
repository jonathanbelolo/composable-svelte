import { createMockAuthDeps } from '@composable-svelte/auth/testing';
import type { SessionSnapshot, AccountSnapshot, AuthError } from '@composable-svelte/auth';
import type { AccountActivityRow, AppDependencies } from './model.js';

export interface ControlledBackendOptions {
  initialSession?: SessionSnapshot | null;
  latencyMs?: number;
  reauthenticateForChangePassword?: boolean;
  delayChangePassword?: boolean;
  delayAccountLoad?: boolean;
  delayLogout?: boolean;
  delayActivity?: boolean;
}

export interface ControlledBackend extends AppDependencies {
  readonly counters: {
    loginCalls: number;
    verifyMfaCalls: number;
    fetchAccountCalls: number;
    fetchActivityCalls: number;
    changePasswordCalls: number;
    logoutCalls: number;
  };
  /** Signals handed to fetchActivity, in call order, so tests can observe cancellation. */
  readonly activitySignals: readonly (AbortSignal | undefined)[];
  setReauthenticateForChangePassword(value: boolean): void;
  setDelayChangePassword(value: boolean): void;
  setDelayAccountLoad(value: boolean): void;
  setDelayLogout(value: boolean): void;
  setDelayActivity(value: boolean): void;
  resolveDelayedChangePassword(result?: SessionSnapshot | null): void;
  rejectDelayedChangePassword(error: AuthError): void;
  resolveDelayedAccountLoad(snapshot?: AccountSnapshot): void;
  resolveDelayedLogout(): void;
  /** Resolve the oldest held activity request; it ignores abort, so only the app can drop its result. */
  resolveDelayedActivity(): void;
}

const defaultAdaSession: SessionSnapshot = {
  subject_id: 'sub-ada-1',
  display_name: 'Ada Lovelace',
  roles: ['member']
};

const defaultMfaSession: SessionSnapshot = {
  subject_id: 'sub-mfa-1',
  display_name: 'MFA User',
  roles: ['member']
};

/** Per-subject activity rows served by the controlled backend. */
const activityBySubject: Readonly<Record<string, readonly AccountActivityRow[]>> = {
  'sub-ada-1': [
    { date: '2026-09-20', logins: 4, service: 'Web Dashboard' },
    { date: '2026-09-21', logins: 7, service: 'Web Dashboard' },
    { date: '2026-09-22', logins: 3, service: 'Mobile App' },
    { date: '2026-09-23', logins: 9, service: 'Web Dashboard' },
    { date: '2026-09-24', logins: 12, service: 'API Client' },
    { date: '2026-09-25', logins: 6, service: 'Web Dashboard' },
    { date: '2026-09-26', logins: 8, service: 'Web Dashboard' }
  ],
  'sub-mfa-1': [
    { date: '2026-09-24', logins: 2, service: 'Mobile App' },
    { date: '2026-09-25', logins: 5, service: 'Web Dashboard' },
    { date: '2026-09-26', logins: 1, service: 'Mobile App' }
  ]
};

const defaultAccountSnapshot: AccountSnapshot = {
  email: 'ada@example.com',
  emailVerified: true,
  hasPassword: true,
  mfaEnabled: false,
  providers: ['github'],
  pendingEmail: null
};

export function createControlledBackend(options: ControlledBackendOptions = {}): ControlledBackend {
  let reauthChangePassword = options.reauthenticateForChangePassword ?? false;
  let delayChangePass = options.delayChangePassword ?? false;
  let delayAccount = options.delayAccountLoad ?? false;
  let delayLogOut = options.delayLogout ?? false;
  let delayActivity = options.delayActivity ?? false;

  let pendingChangePasswordResolve: ((val: SessionSnapshot | null) => void) | null = null;
  let pendingChangePasswordReject: ((err: AuthError) => void) | null = null;
  let pendingAccountLoadResolve: ((val: AccountSnapshot) => void) | null = null;
  let pendingLogoutResolve: (() => void) | null = null;
  const pendingActivity: (() => void)[] = [];
  const activitySignals: (AbortSignal | undefined)[] = [];

  const counters = {
    loginCalls: 0,
    verifyMfaCalls: 0,
    fetchAccountCalls: 0,
    fetchActivityCalls: 0,
    changePasswordCalls: 0,
    logoutCalls: 0
  };

  const mock = createMockAuthDeps({
    session: options.initialSession ?? defaultAdaSession,
    latencyMs: options.latencyMs ?? 0,
    accepts: { email: 'ada@example.com', password: 'ValidPassword123!' },
    validCodes: ['123456'],
    account: defaultAccountSnapshot
  });

  const backend: ControlledBackend = {
    ...mock,
    counters,
    activitySignals,

    setReauthenticateForChangePassword(val: boolean) {
      reauthChangePassword = val;
    },
    setDelayChangePassword(val: boolean) {
      delayChangePass = val;
    },
    setDelayAccountLoad(val: boolean) {
      delayAccount = val;
    },
    setDelayLogout(val: boolean) {
      delayLogOut = val;
    },
    setDelayActivity(val: boolean) {
      delayActivity = val;
    },

    resolveDelayedChangePassword(result: SessionSnapshot | null = null) {
      if (pendingChangePasswordResolve) {
        const resolve = pendingChangePasswordResolve;
        pendingChangePasswordResolve = null;
        pendingChangePasswordReject = null;
        resolve(result);
      }
    },
    rejectDelayedChangePassword(error: AuthError) {
      if (pendingChangePasswordReject) {
        const reject = pendingChangePasswordReject;
        pendingChangePasswordResolve = null;
        pendingChangePasswordReject = null;
        reject(error);
      }
    },
    resolveDelayedAccountLoad(snapshot: AccountSnapshot = defaultAccountSnapshot) {
      if (pendingAccountLoadResolve) {
        const resolve = pendingAccountLoadResolve;
        pendingAccountLoadResolve = null;
        resolve(snapshot);
      }
    },
    resolveDelayedActivity() {
      pendingActivity.shift()?.();
    },
    resolveDelayedLogout() {
      if (pendingLogoutResolve) {
        const resolve = pendingLogoutResolve;
        pendingLogoutResolve = null;
        resolve();
      }
    },

    login: async (credentials, signal) => {
      counters.loginCalls++;
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      // MFA User: returns mfa_required
      if (credentials.email === 'mfa@example.com') {
        if (credentials.password === 'ValidPassword123!') {
          const mfaError: AuthError = {
            code: 'mfa_required',
            message: 'Enter the code from your authenticator app.',
            challengeId: 'mfa-challenge-1',
            methods: ['totp']
          };
          throw mfaError;
        } else {
          throw {
            code: 'invalid_credentials',
            message: 'Invalid email or password.'
          } as AuthError;
        }
      }

      // Default user Ada
      return mock.login(credentials, signal);
    },

    verifyMfaChallenge: async (challengeId, code, method, signal) => {
      counters.verifyMfaCalls++;
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (challengeId === 'mfa-challenge-1' && code === '123456') {
        return defaultMfaSession;
      }
      return mock.verifyMfaChallenge(challengeId, code, method, signal);
    },

    fetchAccount: async (signal) => {
      counters.fetchAccountCalls++;
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      if (delayAccount) {
        return new Promise<AccountSnapshot>((resolve, reject) => {
          pendingAccountLoadResolve = resolve;
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }

      return mock.fetchAccount(signal);
    },

    fetchActivity: async (subjectId, signal) => {
      counters.fetchActivityCalls++;
      activitySignals.push(signal);
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const rows = activityBySubject[subjectId] ?? [];
      if (delayActivity) {
        // Deliberately ignores abort: a late response is still delivered to the caller.
        return new Promise<readonly AccountActivityRow[]>((resolve) => {
          pendingActivity.push(() => resolve(rows));
        });
      }
      return rows;
    },

    changePassword: async (newPassword, signal) => {
      counters.changePasswordCalls++;
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      if (reauthChangePassword) {
        const reauthError: AuthError = {
          code: 'reauthentication_required',
          message: 'Confirm it is you before changing your password.',
          methods: ['password']
        };
        throw reauthError;
      }

      if (delayChangePass) {
        return new Promise<SessionSnapshot | null>((resolve, reject) => {
          pendingChangePasswordResolve = resolve;
          pendingChangePasswordReject = reject;
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }

      return mock.changePassword(newPassword, signal);
    },

    fetchLogout: async (signal) => {
      counters.logoutCalls++;
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      if (delayLogOut) {
        return new Promise<void>((resolve, reject) => {
          pendingLogoutResolve = resolve;
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        });
      }

      return mock.fetchLogout(signal);
    }
  };

  return backend;
}
