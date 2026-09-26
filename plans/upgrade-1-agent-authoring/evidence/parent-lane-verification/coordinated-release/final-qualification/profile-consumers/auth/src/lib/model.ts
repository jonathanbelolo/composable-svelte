import { Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
import {
  ManagedIntegrationBuilder,
  defineApplication,
  optionalSlot,
  type PresentationSlotHandle
} from '@composable-svelte/core/application';
import {
  createAuthFeature,
  type AuthChangePasswordOutcome,
  type AuthFeature,
  type AuthFeatureAction,
  type AuthFeatureDependencies,
  type AuthFeatureState
} from '@composable-svelte/auth/application';

export type AppRoute = 'login' | 'dashboard';

/** Login activity row supplied by the injected fetchActivity service */
export interface AccountActivityRow {
  date: string;
  logins: number;
  service: string;
}

/** Account profile and data owned by the application */
export interface AccountData {
  subjectId: string;
  email: string;
  displayName: string;
  role: string;
  metrics: AccountActivityRow[];
}

/** Root application state */
export interface AppState {
  route: AppRoute;
  auth: AuthFeatureState | null;
  /** Subject whose account view is loaded or loading; null when no account is shown. */
  accountSubjectId: string | null;
  /** Acceptance epoch for account loads: only the latest request's result is accepted. */
  accountRequest: number;
  accountData: AccountData | null;
  accountLoading: boolean;
  accountError: string | null;
  passwordChangeMessage: string | null;
}

/** Root application actions */
export type AppAction =
  | { type: 'navigate'; route: AppRoute }
  | { type: 'auth'; action: PresentationAction<AuthFeatureAction> }
  | { type: 'loadAccount' }
  | { type: 'accountLoaded'; request: number; data: AccountData }
  | { type: 'accountLoadFailed'; request: number; error: string }
  | { type: 'openChangePassword' }
  | { type: 'closeChangePassword' }
  | { type: 'logout' };

/**
 * Dependencies injected into the application: Auth's services plus the app's own
 * account-activity service. The auth composition reads only what it declares.
 */
export interface AppDependencies extends AuthFeatureDependencies {
  fetchActivity(subjectId: string, signal?: AbortSignal): Promise<readonly AccountActivityRow[]>;
}

export const auth: AuthFeature = createAuthFeature();
export const authSlot = optionalSlot<AppState, AppAction>()('auth');

type AuthenticatedSubject = Extract<AuthFeatureState['session']['subject'], { kind: 'authenticated' }>;

const ACCOUNT_LOAD = 'account-load';

function authenticatedSubject(state: AppState): AuthenticatedSubject | null {
  const subject = state.auth?.session.subject;
  return subject?.kind === 'authenticated' ? subject : null;
}

const openLogin = (): Effect<AppAction> =>
  Effect.run<AppAction>(async (dispatch) => {
    dispatch({ type: 'auth', action: { type: 'presented', action: { type: 'openLogin' } } });
  });

/** Start loading the account view for `subject`, replacing any former account's view and load. */
function startAccountLoad(
  state: AppState,
  subject: AuthenticatedSubject,
  deps: AppDependencies
): [AppState, Effect<AppAction>] {
  const request = state.accountRequest + 1;
  const subjectId = subject.id;
  const roles = subject.attributes['roles'];
  return [
    {
      ...state,
      accountSubjectId: subjectId,
      accountRequest: request,
      accountLoading: true,
      accountError: null,
      accountData: null,
      passwordChangeMessage: null
    },
    Effect.cancellable<AppAction>(ACCOUNT_LOAD, async (dispatch, signal) => {
      try {
        // Sequential within this one owned effect: the account first, then the
        // activity for that account. A failed account never requests activity.
        const snapshot = await deps.fetchAccount(signal);
        const activity = await deps.fetchActivity(subjectId, signal);
        const data: AccountData = {
          subjectId,
          email: snapshot.email,
          displayName: String(subject.attributes['display_name'] ?? subjectId),
          role: Array.isArray(roles) && roles.includes('admin') ? 'Administrator' : 'Member',
          metrics: [...activity]
        };
        dispatch({ type: 'accountLoaded', request, data });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        dispatch({ type: 'accountLoadFailed', request, error: message });
      }
    })
  ];
}

/** Remove the former account's views and retire its pending load. */
function retireAccount(state: AppState): [AppState, Effect<AppAction>] {
  return [
    {
      ...state,
      route: 'login',
      accountSubjectId: null,
      accountRequest: state.accountRequest + 1,
      accountData: null,
      accountLoading: false,
      accountError: null,
      passwordChangeMessage: null
    },
    Effect.cancel(ACCOUNT_LOAD)
  ];
}

function passwordChangeMessage(outcome: AuthChangePasswordOutcome): string {
  switch (outcome.kind) {
    case 'changed':
      return 'Password successfully changed.';
    case 'reauthenticationRequired':
      return 'Re-authentication required to change password.';
    case 'rejected':
      return `Password change rejected: ${outcome.reason}`;
  }
}

export const appReducer: Reducer<AppState, AppAction, AppDependencies> = (state, action, deps) => {
  if (action.type === 'navigate') {
    const subject = authenticatedSubject(state);
    // Business rule: the dashboard is for authenticated accounts that are not
    // logging out, and a signed-in account has no sign-in page to return to.
    if (action.route === 'dashboard' && (subject === null || state.auth?.session.status === 'loggingOut')) {
      return [state, Effect.none()];
    }
    if (action.route === 'login' && subject !== null && state.route === 'dashboard') return [state, Effect.none()];
    if (state.route === action.route) return [state, Effect.none()];
    const next: AppState = { ...state, route: action.route };
    // The dashboard shows only the current subject's account.
    if (subject !== null && action.route === 'dashboard' && next.accountSubjectId !== subject.id) {
      return startAccountLoad(next, subject, deps);
    }
    return [next, Effect.none()];
  }

  if (action.type === 'auth') {
    if (action.action.type !== 'presented') return [state, Effect.none()];
    // Child-first reduction: `state.auth` already holds this reduction's
    // one-reduction outputs (`handoff`, `changePasswordOutcome`).
    const feature = state.auth;
    const subject = authenticatedSubject(state);
    let next = state;
    const effects: Effect<AppAction>[] = [];

    if (subject === null) {
      // Logout or expiry: the former account's views and pending load go with it.
      if (state.accountSubjectId !== null || state.route !== 'login') {
        const [retired, cancel] = retireAccount(state);
        next = retired;
        effects.push(cancel, openLogin());
      }
    } else {
      // Documented acceptance: only an accepted handoff moves to the dashboard.
      if (feature?.handoff?.kind === 'accepted') next = { ...next, route: 'dashboard' };
      // The account view belongs to one subject. A same-subject handoff (such as a
      // rotated password session) keeps it; a different subject replaces it on any
      // route, and the dashboard always loads the current subject's account.
      if (
        next.accountSubjectId !== subject.id &&
        (next.route === 'dashboard' || next.accountSubjectId !== null)
      ) {
        const [loading, load] = startAccountLoad(next, subject, deps);
        next = loading;
        effects.push(load);
      }
    }

    // A refused handoff finished the sign-in flow without a session; offer sign-in again.
    if (feature?.handoff?.kind === 'refused') effects.push(openLogin());

    const outcome = feature?.changePasswordOutcome;
    if (outcome) next = { ...next, passwordChangeMessage: passwordChangeMessage(outcome) };

    return [next, effects.length === 0 ? Effect.none() : Effect.batch(...effects)];
  }


  if (action.type === 'loadAccount') {
    const subject = authenticatedSubject(state);
    if (subject === null || state.accountLoading) return [state, Effect.none()];
    if (state.accountSubjectId === subject.id && state.accountData !== null) return [state, Effect.none()];
    return startAccountLoad(state, subject, deps);
  }

  if (action.type === 'accountLoaded') {
    // Only the latest request for the current account is accepted; a result that
    // outlived logout, a subject change or a newer load is dropped.
    if (action.request !== state.accountRequest || !state.accountLoading) return [state, Effect.none()];
    return [
      {
        ...state,
        accountLoading: false,
        accountData: action.data,
        accountError: null
      },
      Effect.none()
    ];
  }

  if (action.type === 'accountLoadFailed') {
    if (action.request !== state.accountRequest || !state.accountLoading) return [state, Effect.none()];
    return [{ ...state, accountLoading: false, accountError: action.error }, Effect.none()];
  }

  if (action.type === 'openChangePassword') {
    if (authenticatedSubject(state) === null) return [state, Effect.none()];
    return [
      state,
      Effect.run<AppAction>(async (dispatch) => {
        dispatch({
          type: 'auth',
          action: { type: 'presented', action: { type: 'openChangePassword' } }
        });
      })
    ];
  }

  if (action.type === 'closeChangePassword') {
    return [
      state,
      Effect.run<AppAction>(async (dispatch) => {
        dispatch({
          type: 'auth',
          action: { type: 'presented', action: { type: 'closeChangePassword' } }
        });
      })
    ];
  }

  if (action.type === 'logout') {
    // Remove the former account's views immediately; the auth feature's logout
    // retires its own flows and pending requests. Sign-in is then offered anew.
    const [retired, cancel] = retireAccount(state);
    return [
      retired,
      Effect.batch(
        cancel,
        Effect.run<AppAction>(async (dispatch) => {
          dispatch({
            type: 'auth',
            action: { type: 'presented', action: { type: 'session', action: { type: 'logout' } } }
          });
          dispatch({ type: 'auth', action: { type: 'presented', action: { type: 'openLogin' } } });
        })
      )
    ];
  }

  return [state, Effect.none()];
};

export const composition = new ManagedIntegrationBuilder<AppState, AppAction, AppDependencies>(
  appReducer
)
  .with(authSlot, auth.composition)
  .build();

export interface ApplicationInitialInput {
  route?: AppRoute;
  initialData?: AccountData;
}

export function createInitialAppState(input?: ApplicationInitialInput): AppState {
  return {
    route: input?.route ?? 'login',
    auth: auth.initialState(),
    accountSubjectId: input?.initialData?.subjectId ?? null,
    accountRequest: 0,
    accountData: input?.initialData ?? null,
    accountLoading: false,
    accountError: null,
    passwordChangeMessage: null
  };
}

export const application = defineApplication(composition, {
  initialState: createInitialAppState,
  startup: (state) => {
    // If authenticated without loaded account, initiate loading
    if (state.auth?.session?.subject?.kind === 'authenticated') {
      if (state.accountData === null && !state.accountLoading) {
        return { type: 'loadAccount' };
      }
      return undefined;
    }
    // If unauthenticated and on login route, open the login flow
    if (state.auth?.login === null) {
      return {
        type: 'auth',
        action: { type: 'presented', action: { type: 'openLogin' } }
      };
    }
    return undefined;
  },
  routing: {
    fragment: 'native',
    serialize: (state) => (state.route === 'dashboard' ? '/dashboard' : '/login'),
    request: (url) => {
      if (url === '/login' || url === '/') {
        return { action: { type: 'navigate', route: 'login' }, expectedURL: '/login' };
      }
      if (url === '/dashboard') {
        return { action: { type: 'navigate', route: 'dashboard' }, expectedURL: '/dashboard' };
      }
      return undefined;
    }
  }
});
