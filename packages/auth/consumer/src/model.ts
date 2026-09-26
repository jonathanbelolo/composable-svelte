import { Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, defineApplication, optionalSlot } from '@composable-svelte/core/application';
import { createAuthFeature, type AuthFeatureAction, type AuthFeatureDependencies, type AuthFeatureState, type AuthMfaOutcome, type AuthOAuthOutcome, type AuthMagicLinkOutcome, type AuthConnectedAccountsOutcome, type AuthChangeEmailOutcome, type AuthChangeEmailConfirmOutcome, type AuthChangePasswordOutcome, type AuthDeleteAccountOutcome, type AuthSessionRefreshOutcome } from '@composable-svelte/auth/application';

export type Side = 'left' | 'right';
export type MfaOperation = Extract<AuthMfaOutcome, { kind: 'reauthenticationRequired' }>['operation'];
/** The parent's read of each account: `enabled` is unknown until read; `retry` awaits a prompt. */
export type Account = {
  readonly enabled: boolean | undefined;
  readonly retry: MfaOperation | null;
  readonly providers: readonly string[] | undefined;
  readonly hasPassword: boolean | undefined;
};

export type State = {
  left: AuthFeatureState | null;
  right: AuthFeatureState | null;
  outcomes: readonly string[];
  accounts: Readonly<Record<Side, Account>>;
};
/** What a server request supplies; accounts start unread when omitted. */
export type StateInput = Omit<State, 'accounts'> & { accounts?: State['accounts'] };
export type Action =
  | { type: 'left'; action: PresentationAction<AuthFeatureAction> }
  | { type: 'right'; action: PresentationAction<AuthFeatureAction> }
  | { type: 'resetLeft' }
  | { type: 'removeLeft' }
  | { type: 'restoreLeft' }
  | { type: 'accountRead'; side: Side; enabled: boolean }
  | { type: 'tick' };

const unread: State['accounts'] = {
  left: { enabled: undefined, retry: null, providers: undefined, hasPassword: undefined },
  right: { enabled: undefined, retry: null, providers: undefined, hasPassword: undefined }
};

function withAccount(state: State, side: Side, account: Partial<Account>): State {
  return { ...state, accounts: { ...state.accounts, [side]: { ...state.accounts[side], ...account } } };
}

/**
 * Route one MFA settings outcome, read after its own routed action. A real
 * parent re-reads the account (`fetchAccount`) on each success; this consumer
 * records what that read would say.
 */
function routeMfa(state: State, side: Side, outcome: AuthMfaOutcome): [State, Effect<Action>] {
  const outcomes = [...state.outcomes, `${side}:mfa:${outcome.kind}${outcome.kind === 'reauthenticationRequired' ? `:${outcome.operation}` : ''}`];
  const next = { ...state, outcomes };
  switch (outcome.kind) {
    case 'enrolmentAcknowledged':
      // The codes were shown and saved: now the parent closes the enrolment.
      return [withAccount(next, side, { enabled: true, retry: null }), Effect.run<Action>(async (dispatch) => {
        dispatch({ type: side, action: { type: 'presented', action: { type: 'closeMfaEnrolment' } } });
      })];
    case 'disabled':
      return [withAccount(next, side, { enabled: false, retry: null }), Effect.none()];
    case 'recoveryCodesRegenerated':
      return [withAccount(next, side, { retry: null }), Effect.none()];
    case 'reauthenticationRequired':
      return [withAccount(next, side, { retry: outcome.operation }), Effect.none()];
  }
}

function routeConnectedAccounts(state: State, side: Side, outcome: AuthConnectedAccountsOutcome): [State, Effect<Action>] {
  const detail =
    outcome.kind === 'unlinked'
      ? `:${outcome.provider}`
      : `:${outcome.provider}:${outcome.methods.join(',')}`;
  const outcomes: readonly string[] = [...state.outcomes, `${side}:connectedAccounts:${outcome.kind}${detail}`];
  let next: State = { ...state, outcomes };
  if (outcome.kind === 'unlinked') {
    const currentProviders = state.accounts[side].providers;
    if (currentProviders) {
      const updated = currentProviders.filter((p) => p !== outcome.provider);
      next = withAccount(next, side, { providers: updated });
    }
    return [
      next,
      Effect.run<Action>(async (dispatch) => {
        dispatch({
          type: side,
          action: {
            type: 'presented',
            action: {
              type: 'account',
              action: { type: 'presented', action: { type: 'reloadRequested' } }
            }
          }
        });
      })
    ];
  }
  return [next, Effect.none()];
}

function routeOAuth(state: State, side: Side, outcome: AuthOAuthOutcome): [State, Effect<Action>] {
  const detail =
    outcome.kind === 'signedIn' || outcome.kind === 'linkCompleted'
      ? outcome.returnTo ? `:${outcome.returnTo}` : ''
      : outcome.kind === 'mfaRequired'
        ? `:${outcome.challengeId}`
        : `:${outcome.error.code}`;
  const outcomes = [...state.outcomes, `${side}:oauth:${outcome.kind}${detail}`];
  return [{ ...state, outcomes }, Effect.none()];
}

export const auth = createAuthFeature();
export const leftSlot = optionalSlot<State, Action>()('left');
export const rightSlot = optionalSlot<State, Action>()('right');

/**
 * Each account read belongs to one management panel. When a section's panel
 * goes — closed, restarted, retired by logout or an account switch, or the
 * whole auth section reset or removed — its read and any pending retry go
 * with it, so a new panel or account starts unread with no stale prompt.
 */
function scopeAccounts(state: State, action: Action): State {
  let next = state;
  for (const side of ['left', 'right'] as const) {
    const restarted = action.type === side && action.action.type === 'presented' && action.action.action.type === 'restartMfaManagement';
    const gone = state[side]?.mfaManagement == null;
    if ((gone || restarted) && next.accounts[side] !== unread[side]) {
      next = { ...next, accounts: { ...next.accounts, [side]: unread[side] } };
    }
  }
  return next;
}

const reducer: Reducer<State, Action, AuthFeatureDependencies> = (state, action, deps) => {
  const [next, effect] = routeParent(state, action, deps);
  return [scopeAccounts(next, action), effect];
};

const routeParent: Reducer<State, Action, AuthFeatureDependencies> = (state, action) => {
  if (action.type === 'resetLeft') return [{ ...state, left: auth.initialState() }, Effect.none()];
  if (action.type === 'removeLeft') return [{ ...state, left: null }, Effect.none()];
  if (action.type === 'restoreLeft') return [{ ...state, left: auth.initialState() }, Effect.none()];
  if (action.type === 'accountRead') return [withAccount(state, action.side, { enabled: action.enabled, providers: ['github', 'google'], hasPassword: true }), Effect.none()];
  if (action.type !== 'left' && action.type !== 'right') return [state, Effect.none()];
  if (action.action.type !== 'presented') return [state, Effect.none()];
  const feature = state[action.type];
  let next = state;
  const handoff = feature?.handoff;
  if (handoff !== null && handoff !== undefined) {
    next = { ...next, outcomes: [...next.outcomes, `${action.type}:${handoff.kind}:${handoff.source}`] };
  }
  const oauthOutcome = feature?.oauthOutcome;
  if (oauthOutcome !== null && oauthOutcome !== undefined) {
    const [routedState, eff] = routeOAuth(next, action.type, oauthOutcome);
    return [routedState, eff];
  }
  const connectedAccountsOutcome = feature?.connectedAccountsOutcome;
  if (connectedAccountsOutcome !== null && connectedAccountsOutcome !== undefined) {
    return routeConnectedAccounts(next, action.type, connectedAccountsOutcome);
  }
  const mfaOutcome = feature?.mfaOutcome;
  if (mfaOutcome !== null && mfaOutcome !== undefined) return routeMfa(next, action.type, mfaOutcome);
  const magicLinkOutcome = feature?.magicLinkOutcome;
  if (magicLinkOutcome !== null && magicLinkOutcome !== undefined) {
    const detail =
      magicLinkOutcome.kind === 'requestSent'
        ? `:${magicLinkOutcome.email}`
        : magicLinkOutcome.kind === 'mfaRequired'
          ? `:${magicLinkOutcome.challengeId}`
          : '';
    return [{ ...next, outcomes: [...next.outcomes, `${action.type}:magicLink:${magicLinkOutcome.kind}${detail}`] }, Effect.none()];
  }
  const changeEmailOutcome = feature?.changeEmailOutcome;
  if (changeEmailOutcome !== null && changeEmailOutcome !== undefined) {
    const detail =
      changeEmailOutcome.kind === 'requested'
        ? `:${changeEmailOutcome.email}`
        : changeEmailOutcome.kind === 'reauthenticationRequired'
          ? `:${changeEmailOutcome.methods.join(',')}`
          : '';
    return [{ ...next, outcomes: [...next.outcomes, `${action.type}:changeEmail:${changeEmailOutcome.kind}${detail}`] }, Effect.none()];
  }
  const changeEmailConfirmOutcome = feature?.changeEmailConfirmOutcome;
  if (changeEmailConfirmOutcome !== null && changeEmailConfirmOutcome !== undefined) {
    const detail =
      changeEmailConfirmOutcome.kind === 'confirmed'
        ? `:${changeEmailConfirmOutcome.email}`
        : `:${changeEmailConfirmOutcome.error.code}`;
    return [{ ...next, outcomes: [...next.outcomes, `${action.type}:changeEmailConfirm:${changeEmailConfirmOutcome.kind}${detail}`] }, Effect.none()];
  }
  const changePasswordOutcome = feature?.changePasswordOutcome;
  if (changePasswordOutcome !== null && changePasswordOutcome !== undefined) {
    const detail =
      changePasswordOutcome.kind === 'changed'
        ? (changePasswordOutcome.session !== null ? ':rotated' : ':retained')
        : changePasswordOutcome.kind === 'reauthenticationRequired'
          ? `:${changePasswordOutcome.methods.join(',')}`
          : `:${changePasswordOutcome.reason}`;
    return [{ ...next, outcomes: [...next.outcomes, `${action.type}:changePassword:${changePasswordOutcome.kind}${detail}`] }, Effect.none()];
  }
  const deleteAccountOutcome = feature?.deleteAccountOutcome;
  if (deleteAccountOutcome !== null && deleteAccountOutcome !== undefined) {
    const detail =
      deleteAccountOutcome.kind === 'deleted'
        ? ''
        : `:${deleteAccountOutcome.methods.join(',')}`;
    return [{ ...next, outcomes: [...next.outcomes, `${action.type}:deleteAccount:${deleteAccountOutcome.kind}${detail}`] }, Effect.none()];
  }
  const sessionRefreshOutcome = feature?.sessionRefreshOutcome;
  if (sessionRefreshOutcome !== null && sessionRefreshOutcome !== undefined) {
    const detail =
      sessionRefreshOutcome.kind === 'refreshed'
        ? `:${sessionRefreshOutcome.expiresAt ?? 'none'}`
        : `:${sessionRefreshOutcome.error.code}`;
    return [{ ...next, outcomes: [...next.outcomes, `${action.type}:sessionRefresh:${sessionRefreshOutcome.kind}${detail}`] }, Effect.none()];
  }
  if (next !== state) return [next, Effect.none()];
  // The retained verification state is read only for this routed result. A later
  // auth action must not replay it, while a new feature may verify the same email.
  const routed = action.action.action;
  if (routed.type === 'forgotPassword' && routed.action.type === 'presented' && routed.action.action.type === 'requestSent') {
    const email = routed.action.action.email;
    if (feature?.forgotPassword?.status === 'sent' && feature.forgotPassword.requestedFor === email) {
      return [{ ...state, outcomes: [...state.outcomes, `${action.type}:recoverySent:${email}`] }, Effect.none()];
    }
  }
  if (routed.type === 'resetPassword' && routed.action.type === 'presented') {
    const result = routed.action.action;
    if (result.type === 'resetSucceeded' && result.session === null && feature?.resetPassword?.status === 'reset' && feature.resetPassword.session === null) {
      return [{ ...state, outcomes: [...state.outcomes, `${action.type}:resetWithoutSession`] }, Effect.none()];
    }
    if (result.type === 'resetFailed' && result.error.code === 'token_expired' && feature?.resetPassword?.error?.code === 'token_expired') {
      return [{ ...state, outcomes: [...state.outcomes, `${action.type}:resetExpired`] }, Effect.none()];
    }
  }
  if (routed.type === 'emailVerification' && routed.action.type === 'presented') {
    const result = routed.action.action;
    if (result.type === 'verificationSucceeded' && result.session === null && feature?.emailVerification?.status === 'verified' && feature.emailVerification.session === null) {
      return [{ ...state, outcomes: [...state.outcomes, `${action.type}:verifiedWithoutSession`] }, Effect.none()];
    }
    if (result.type === 'resendSucceeded' && feature?.emailVerification?.resendStatus === 'sent') {
      return [{ ...state, outcomes: [...state.outcomes, `${action.type}:verificationResent`] }, Effect.none()];
    }
  }
  if (routed.type !== 'signup' || routed.action.type !== 'presented' || routed.action.action.type !== 'verificationRequired') {
    return [state, Effect.none()];
  }
  const email = routed.action.action.email;
  if (feature?.signup?.status !== 'awaitingVerification' || feature.signup.pendingEmail !== email) {
    return [state, Effect.none()];
  }
  return [{ ...state, outcomes: [...state.outcomes, `${action.type}:verification:${email}`] }, Effect.none()];
};

export const composition = new ManagedIntegrationBuilder(reducer)
  .with(leftSlot, auth.composition, { dismissal: 'deferred', replaceOn: action => action.type === 'resetLeft' || action.type === 'restoreLeft' })
  .with(rightSlot, auth.composition, { dismissal: 'deferred' })
  .build();

export const application = defineApplication(composition, {
  initialState: (input: StateInput | undefined): State =>
    input ? { accounts: unread, ...input } : { left: auth.initialState(), right: auth.initialState(), outcomes: [], accounts: unread }
});
