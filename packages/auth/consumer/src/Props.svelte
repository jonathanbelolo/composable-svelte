<script lang="ts">
  import type { ComponentProps, Snippet } from 'svelte';
  import type { PresentationView } from '@composable-svelte/core/application';
  import type { Store } from '@composable-svelte/core';
  import { LoginForm, MfaChallengeForm, SignupForm, ForgotPasswordForm, ResetPasswordForm, EmailVerification, MfaEnrolment, MfaManagementPanel, OAuthSignIn, OAuthCallback, MagicLinkRequestForm, MagicLinkSignIn, ConnectedAccountsPanel, ChangeEmailForm, EmailChangeConfirmation, ChangePasswordForm, DeleteAccountPanel, SessionRefresh, AuthGuard, RoleGate, PasswordInput, PasswordCriteria, OneTimeCodeInput } from '@composable-svelte/auth/components';
  import type { LoginAction, LoginState, MfaChallengeAction, MfaChallengeState, SignupAction, SignupState, ForgotPasswordAction, ForgotPasswordState, ResetPasswordAction, ResetPasswordState, EmailVerificationAction, EmailVerificationState, MfaEnrolmentAction, MfaEnrolmentState, MfaManagementAction, MfaManagementState, OAuthStartAction, OAuthStartState, OAuthCallbackAction, OAuthCallbackState, MagicLinkRequestAction, MagicLinkRequestState, MagicLinkSignInAction, MagicLinkSignInState, AccountAction, AccountState, ConnectedAccountsAction, ConnectedAccountsState, OAuthProvider, ChangeEmailAction, ChangeEmailState, ChangeEmailConfirmAction, ChangeEmailConfirmState, ChangePasswordAction, ChangePasswordState, DeleteAccountAction, DeleteAccountState, SessionRefreshAction, SessionRefreshState } from '@composable-svelte/auth/flows';
  import type { SessionAction, SessionState } from '@composable-svelte/auth/session';

  type LoginProps = ComponentProps<typeof LoginForm>;
  type MfaProps = ComponentProps<typeof MfaChallengeForm>;
  type SignupProps = ComponentProps<typeof SignupForm>;
  type ForgotProps = ComponentProps<typeof ForgotPasswordForm>;
  type ResetProps = ComponentProps<typeof ResetPasswordForm>;
  type VerificationProps = ComponentProps<typeof EmailVerification>;
  export function props(login: PresentationView<LoginState, LoginAction>, mfa: PresentationView<MfaChallengeState, MfaChallengeAction>, signup: PresentationView<SignupState, SignupAction>, forgot: PresentationView<ForgotPasswordState, ForgotPasswordAction>, reset: PresentationView<ResetPasswordState, ResetPasswordAction>, verification: PresentationView<EmailVerificationState, EmailVerificationAction>, session: { dispatch(action: SessionAction): void }) {
    const managedLogin: LoginProps = { mode: 'managed', flowStore: login };
    const managedMfa: MfaProps = { mode: 'managed', flowStore: mfa };
    const injected = { sessionStore: session };
    // @ts-expect-error managed handoff belongs to the feature even through spreads.
    const illegalLogin: LoginProps = { mode: 'managed', flowStore: login, ...injected };
    // @ts-expect-error managed MFA navigation belongs to the feature.
    const illegalMfa: MfaProps = { mode: 'managed', flowStore: mfa, onStartOver: () => {} };
    const managedSignup: SignupProps = { mode: 'managed', flowStore: signup };
    // @ts-expect-error managed signup handoff belongs to the feature even through spreads.
    const illegalSignup: SignupProps = { mode: 'managed', flowStore: signup, ...injected };
    // @ts-expect-error managed "Sign in instead" is signInRequested, not a callback.
    const illegalSignIn: SignupProps = { mode: 'managed', flowStore: signup, onSignIn: () => {} };
    const managedForgot: ForgotProps = { mode: 'managed', flowStore: forgot };
    // @ts-expect-error managed recovery output stays in the feature for parent routing.
    const illegalForgot: ForgotProps = { mode: 'managed', flowStore: forgot, onSent: () => {} };
    const managedReset: ResetProps = { mode: 'managed', flowStore: reset };
    // @ts-expect-error managed reset handoff belongs to the feature even through spreads.
    const illegalReset: ResetProps = { mode: 'managed', flowStore: reset, ...injected };
    // @ts-expect-error managed link navigation is a feature action.
    const illegalNewLink: ResetProps = { mode: 'managed', flowStore: reset, onRequestNewLink: () => {} };
    const managedVerification: VerificationProps = { mode: 'managed', flowStore: verification, token: 'token' };
    // @ts-expect-error managed verification handoff belongs to the feature.
    const illegalVerification: VerificationProps = { mode: 'managed', flowStore: verification, ...injected };
    // @ts-expect-error managed no-session sign-in is a feature action.
    const illegalVerifySignIn: VerificationProps = { mode: 'managed', flowStore: verification, onSignIn: () => {} };
    return [managedLogin, managedMfa, managedSignup, managedForgot, managedReset, managedVerification, illegalLogin, illegalMfa, illegalSignup, illegalSignIn, illegalForgot, illegalReset, illegalNewLink, illegalVerification, illegalVerifySignIn];
  }

  type EnrolmentProps = ComponentProps<typeof MfaEnrolment>;
  type ManagementProps = ComponentProps<typeof MfaManagementPanel>;
  export function mfaProps(enrolment: PresentationView<MfaEnrolmentState, MfaEnrolmentAction>, management: PresentationView<MfaManagementState, MfaManagementAction>, enrolmentStore: Store<MfaEnrolmentState, MfaEnrolmentAction>, managementStore: Store<MfaManagementState, MfaManagementAction>) {
    const managedEnrolment: EnrolmentProps = { mode: 'managed', flowStore: enrolment };
    const managedPanel: ManagementProps = { mode: 'managed', store: management, mfaEnabled: undefined };
    // @ts-expect-error managed acknowledgement is recoveryCodesAcknowledged, routed as mfaOutcome.
    const illegalDone: EnrolmentProps = { mode: 'managed', flowStore: enrolment, onDone: () => {} };
    // @ts-expect-error managed successes are routed as mfaOutcome.
    const illegalChanged: ManagementProps = { mode: 'managed', store: management, onChanged: () => {} };
    // @ts-expect-error managed re-authentication demands are routed as mfaOutcome.
    const illegalReauth: ManagementProps = { mode: 'managed', store: management, onReauthenticationRequired: () => {} };
    // @ts-expect-error a plain store is not the feature's presentation view.
    const illegalStore: ManagementProps = { mode: 'managed', store: managementStore };
    const standaloneEnrolment: EnrolmentProps = { flowStore: enrolmentStore, onDone: () => {} };
    const standalonePanel: ManagementProps = { store: managementStore, mfaEnabled: true, onChanged: () => {}, onReauthenticationRequired: () => {} };
    return [managedEnrolment, managedPanel, illegalDone, illegalChanged, illegalReauth, illegalStore, standaloneEnrolment, standalonePanel];
  }

  type OAuthStartProps = ComponentProps<typeof OAuthSignIn>;
  type OAuthCallbackProps = ComponentProps<typeof OAuthCallback>;
  export function oauthProps(
    start: PresentationView<OAuthStartState, OAuthStartAction>,
    callback: PresentationView<OAuthCallbackState, OAuthCallbackAction>,
    startStore: Store<OAuthStartState, OAuthStartAction>,
    callbackStore: Store<OAuthCallbackState, OAuthCallbackAction>,
    session: { dispatch(action: SessionAction): void }
  ) {
    const providers = [{ id: 'github', label: 'GitHub' }];
    const managedStart: OAuthStartProps = { mode: 'managed', flowStore: start, providers };
    const managedCallback: OAuthCallbackProps = { mode: 'managed', flowStore: callback };

    // @ts-expect-error a plain store is not the genuine presentation view.
    const illegalStartStore: OAuthStartProps = { mode: 'managed', flowStore: startStore, providers };
    // @ts-expect-error a retired view may have no state, which standalone cannot accept.
    const illegalStartRetired: OAuthStartProps = { flowStore: start, providers };
    // @ts-expect-error sessionStore is never accepted in managed OAuthCallback.
    const illegalCallbackSession: OAuthCallbackProps = { mode: 'managed', flowStore: callback, sessionStore: session };
    // @ts-expect-error onSuccess is never accepted in managed OAuthCallback.
    const illegalCallbackSuccess: OAuthCallbackProps = { mode: 'managed', flowStore: callback, onSuccess: () => {} };
    // @ts-expect-error onStartOver is never accepted in managed OAuthCallback.
    const illegalCallbackStartOver: OAuthCallbackProps = { mode: 'managed', flowStore: callback, onStartOver: () => {} };
    // @ts-expect-error onMfaRequired is never accepted in managed OAuthCallback.
    const illegalCallbackMfa: OAuthCallbackProps = { mode: 'managed', flowStore: callback, onMfaRequired: () => {} };
    // @ts-expect-error a plain store is not the genuine presentation view.
    const illegalCallbackStore: OAuthCallbackProps = { mode: 'managed', flowStore: callbackStore };
    // @ts-expect-error a retired view may have no state, which standalone cannot accept.
    const illegalCallbackRetired: OAuthCallbackProps = { flowStore: callback, sessionStore: session, onSuccess: () => {}, onStartOver: () => {} };

    const standaloneStart: OAuthStartProps = { flowStore: startStore, providers };
    const standaloneCallback: OAuthCallbackProps = {
      flowStore: callbackStore,
      sessionStore: session,
      onSuccess: () => {},
      onStartOver: () => {}
    };

    return [
      managedStart,
      managedCallback,
      illegalStartStore,
      illegalStartRetired,
      illegalCallbackSession,
      illegalCallbackSuccess,
      illegalCallbackStartOver,
      illegalCallbackMfa,
      illegalCallbackStore,
      illegalCallbackRetired,
      standaloneStart,
      standaloneCallback
    ];
  }

  type MagicLinkRequestProps = ComponentProps<typeof MagicLinkRequestForm>;
  type MagicLinkSignInProps = ComponentProps<typeof MagicLinkSignIn>;
  export function magicLinkProps(
    request: PresentationView<MagicLinkRequestState, MagicLinkRequestAction>,
    signIn: PresentationView<MagicLinkSignInState, MagicLinkSignInAction>,
    requestStore: Store<MagicLinkRequestState, MagicLinkRequestAction>,
    signInStore: Store<MagicLinkSignInState, MagicLinkSignInAction>,
    session: { dispatch(action: SessionAction): void }
  ) {
    const managedRequest: MagicLinkRequestProps = { mode: 'managed', flowStore: request };
    const managedSignIn: MagicLinkSignInProps = { mode: 'managed', flowStore: signIn };

    // @ts-expect-error a plain store is not the genuine presentation view.
    const illegalRequestStore: MagicLinkRequestProps = { mode: 'managed', flowStore: requestStore };
    // @ts-expect-error onSent is not accepted in managed mode.
    const illegalRequestOnSent: MagicLinkRequestProps = { mode: 'managed', flowStore: request, onSent: () => {} };
    // @ts-expect-error a plain store is not the genuine presentation view.
    const illegalSignInStore: MagicLinkSignInProps = { mode: 'managed', flowStore: signInStore };
    // @ts-expect-error sessionStore is not accepted in managed mode.
    const illegalSignInSession: MagicLinkSignInProps = { mode: 'managed', flowStore: signIn, sessionStore: session };
    // @ts-expect-error onMfaRequired is not accepted in managed mode.
    const illegalSignInMfa: MagicLinkSignInProps = { mode: 'managed', flowStore: signIn, onMfaRequired: () => {} };
    // @ts-expect-error onRequestNewLink is not accepted in managed mode.
    const illegalSignInNewLink: MagicLinkSignInProps = { mode: 'managed', flowStore: signIn, onRequestNewLink: () => {} };
    // @ts-expect-error onStartOver is not accepted in managed mode.
    const illegalSignInStartOver: MagicLinkSignInProps = { mode: 'managed', flowStore: signIn, onStartOver: () => {} };

    const standaloneRequest: MagicLinkRequestProps = { flowStore: requestStore };
    const standaloneSignIn: MagicLinkSignInProps = {
      flowStore: signInStore,
      sessionStore: session,
      onRequestNewLink: () => {}
    };

    return [
      managedRequest,
      managedSignIn,
      illegalRequestStore,
      illegalRequestOnSent,
      illegalSignInStore,
      illegalSignInSession,
      illegalSignInMfa,
      illegalSignInNewLink,
      illegalSignInStartOver,
      standaloneRequest,
      standaloneSignIn
    ];
  }

  type ConnectedAccountsProps = ComponentProps<typeof ConnectedAccountsPanel>;
  export function connectedAccountsProps(
    connected: PresentationView<ConnectedAccountsState, ConnectedAccountsAction>,
    account: PresentationView<AccountState, AccountAction>,
    oauthStart: PresentationView<OAuthStartState, OAuthStartAction>,
    connectedStore: Store<ConnectedAccountsState, ConnectedAccountsAction>,
    accountStore: Store<AccountState, AccountAction>
  ) {
    const managedPanel: ConnectedAccountsProps = {
      mode: 'managed',
      store: connected,
      accountStore: account,
      oauthStore: oauthStart,
      onLink: (_provider: OAuthProvider) => {}
    };

    // @ts-expect-error a plain store is not the genuine presentation view.
    const illegalStore: ConnectedAccountsProps = { mode: 'managed', store: connectedStore };
    // @ts-expect-error a plain store is not accepted as managed accountStore.
    const illegalAccountStore: ConnectedAccountsProps = { mode: 'managed', store: connected, accountStore: accountStore };
    // @ts-expect-error onUnlinked callback is forbidden in managed mode.
    const illegalUnlinked: ConnectedAccountsProps = { mode: 'managed', store: connected, onUnlinked: () => {} };
    // @ts-expect-error onReauthenticationRequired callback is forbidden in managed mode.
    const illegalReauth: ConnectedAccountsProps = { mode: 'managed', store: connected, onReauthenticationRequired: () => {} };

    const standalonePanel: ConnectedAccountsProps = {
      store: connectedStore,
      accountStore: accountStore,
      onUnlinked: () => {},
      onReauthenticationRequired: () => {}
    };

    // @ts-expect-error a retired view may have no state, which standalone cannot accept.
    const illegalRetired: ConnectedAccountsProps = {
      store: connected
    };

    return [
      managedPanel,
      illegalStore,
      illegalAccountStore,
      illegalUnlinked,
      illegalReauth,
      standalonePanel,
      illegalRetired
    ];
  }

  type ChangeEmailProps = ComponentProps<typeof ChangeEmailForm>;
  type ChangeEmailConfirmProps = ComponentProps<typeof EmailChangeConfirmation>;
  export function changeEmailProps(
    changeEmail: PresentationView<ChangeEmailState, ChangeEmailAction>,
    changeEmailConfirm: PresentationView<ChangeEmailConfirmState, ChangeEmailConfirmAction>,
    changeEmailStore: Store<ChangeEmailState, ChangeEmailAction>,
    confirmStore: Store<ChangeEmailConfirmState, ChangeEmailConfirmAction>
  ) {
    const managedRequest: ChangeEmailProps = { mode: 'managed', flowStore: changeEmail };
    const managedConfirm: ChangeEmailConfirmProps = { mode: 'managed', flowStore: changeEmailConfirm, token: 'tok' };

    // @ts-expect-error a plain store is not the genuine presentation view.
    const illegalRequestStore: ChangeEmailProps = { mode: 'managed', flowStore: changeEmailStore };
    // @ts-expect-error onChanged callback is forbidden in managed mode.
    const illegalRequestChanged: ChangeEmailProps = { mode: 'managed', flowStore: changeEmail, onChanged: () => {} };
    // @ts-expect-error onReauthenticationRequired callback is forbidden in managed mode.
    const illegalRequestReauth: ChangeEmailProps = { mode: 'managed', flowStore: changeEmail, onReauthenticationRequired: () => {} };

    // @ts-expect-error a plain store is not the genuine presentation view.
    const illegalConfirmStore: ChangeEmailConfirmProps = { mode: 'managed', flowStore: confirmStore };
    // @ts-expect-error onConfirmed callback is forbidden in managed mode.
    const illegalConfirmConfirmed: ChangeEmailConfirmProps = { mode: 'managed', flowStore: changeEmailConfirm, onConfirmed: () => {} };
    // @ts-expect-error onSignIn callback is forbidden in managed mode.
    const illegalConfirmSignIn: ChangeEmailConfirmProps = { mode: 'managed', flowStore: changeEmailConfirm, onSignIn: () => {} };

    const standaloneRequest: ChangeEmailProps = { flowStore: changeEmailStore, onChanged: () => {}, onReauthenticationRequired: () => {} };
    const standaloneConfirm: ChangeEmailConfirmProps = { flowStore: confirmStore, token: 'tok', onSignIn: () => {}, onConfirmed: () => {} };

    // @ts-expect-error a retired view may have no state, which standalone cannot accept.
    const illegalRequestRetired: ChangeEmailProps = { flowStore: changeEmail };
    // @ts-expect-error a retired view may have no state, which standalone cannot accept.
    const illegalConfirmRetired: ChangeEmailConfirmProps = { flowStore: changeEmailConfirm, onSignIn: () => {} };

    return [
      managedRequest,
      managedConfirm,
      illegalRequestStore,
      illegalRequestChanged,
      illegalRequestReauth,
      illegalConfirmStore,
      illegalConfirmConfirmed,
      illegalConfirmSignIn,
      standaloneRequest,
      standaloneConfirm,
      illegalRequestRetired,
      illegalConfirmRetired
    ];
  }

  type ChangePasswordProps = ComponentProps<typeof ChangePasswordForm>;
  type DeleteAccountProps = ComponentProps<typeof DeleteAccountPanel>;
  export function passwordDeleteProps(
    changePassword: PresentationView<ChangePasswordState, ChangePasswordAction>,
    deleteAccount: PresentationView<DeleteAccountState, DeleteAccountAction>,
    changePasswordStore: Store<ChangePasswordState, ChangePasswordAction>,
    deleteAccountStore: Store<DeleteAccountState, DeleteAccountAction>,
    session: { dispatch(action: SessionAction): void }
  ) {
    const managedPassword: ChangePasswordProps = { mode: 'managed', flowStore: changePassword };
    const managedDelete: DeleteAccountProps = { mode: 'managed', store: deleteAccount };

    // @ts-expect-error a plain store is not the genuine presentation view.
    const illegalPasswordStore: ChangePasswordProps = { mode: 'managed', flowStore: changePasswordStore };
    // @ts-expect-error sessionStore is forbidden in managed ChangePasswordForm.
    const illegalPasswordSession: ChangePasswordProps = { mode: 'managed', flowStore: changePassword, sessionStore: session };
    // @ts-expect-error onChanged callback is forbidden in managed ChangePasswordForm.
    const illegalPasswordChanged: ChangePasswordProps = { mode: 'managed', flowStore: changePassword, onChanged: () => {} };
    // @ts-expect-error onReauthenticationRequired callback is forbidden in managed ChangePasswordForm.
    const illegalPasswordReauth: ChangePasswordProps = { mode: 'managed', flowStore: changePassword, onReauthenticationRequired: () => {} };

    // @ts-expect-error a plain store is not the genuine presentation view.
    const illegalDeleteStore: DeleteAccountProps = { mode: 'managed', store: deleteAccountStore };
    // @ts-expect-error sessionStore is forbidden in managed DeleteAccountPanel.
    const illegalDeleteSession: DeleteAccountProps = { mode: 'managed', store: deleteAccount, sessionStore: session };
    // @ts-expect-error onDeleted callback is forbidden in managed DeleteAccountPanel.
    const illegalDeleteDeleted: DeleteAccountProps = { mode: 'managed', store: deleteAccount, onDeleted: () => {} };
    // @ts-expect-error onReauthenticationRequired callback is forbidden in managed DeleteAccountPanel.
    const illegalDeleteReauth: DeleteAccountProps = { mode: 'managed', store: deleteAccount, onReauthenticationRequired: () => {} };

    const standalonePassword: ChangePasswordProps = {
      flowStore: changePasswordStore,
      sessionStore: session,
      onChanged: () => {},
      onReauthenticationRequired: () => {}
    };
    const standaloneDelete: DeleteAccountProps = {
      store: deleteAccountStore,
      sessionStore: session,
      onDeleted: () => {},
      onReauthenticationRequired: () => {}
    };

    // @ts-expect-error a retired view may have no state, which standalone cannot accept.
    const illegalPasswordRetired: ChangePasswordProps = { flowStore: changePassword, sessionStore: session };
    // @ts-expect-error a retired view may have no state, which standalone cannot accept.
    const illegalDeleteRetired: DeleteAccountProps = { store: deleteAccount, sessionStore: session };

    return [
      managedPassword,
      managedDelete,
      illegalPasswordStore,
      illegalPasswordSession,
      illegalPasswordChanged,
      illegalPasswordReauth,
      illegalDeleteStore,
      illegalDeleteSession,
      illegalDeleteDeleted,
      illegalDeleteReauth,
      standalonePassword,
      standaloneDelete,
      illegalPasswordRetired,
      illegalDeleteRetired
    ];
  }

  type SessionRefreshProps = ComponentProps<typeof SessionRefresh>;
  export function sessionRefreshProps(
    sessionRefresh: PresentationView<SessionRefreshState, SessionRefreshAction>,
    sessionRefreshStore: Store<SessionRefreshState, SessionRefreshAction>,
    session: { readonly state: SessionState; dispatch(action: SessionAction): void },
    endedSnippet: Snippet
  ) {
    const managedStore: SessionRefreshProps = {
      mode: 'managed',
      store: sessionRefresh
    };
    const managedFlowStore: SessionRefreshProps = {
      mode: 'managed',
      flowStore: sessionRefresh,
      ended: endedSnippet
    };

    // @ts-expect-error a plain store is not the genuine presentation view.
    const illegalStore: SessionRefreshProps = { mode: 'managed', store: sessionRefreshStore };
    // @ts-expect-error a plain store is not the genuine presentation view.
    const illegalFlowStore: SessionRefreshProps = { mode: 'managed', flowStore: sessionRefreshStore };
    // @ts-expect-error sessionStore is forbidden in managed mode.
    const illegalSessionStore: SessionRefreshProps = { mode: 'managed', store: sessionRefresh, sessionStore: session };
    // @ts-expect-error sessionStore is forbidden in managed mode.
    const illegalSessionFlowStore: SessionRefreshProps = { mode: 'managed', flowStore: sessionRefresh, sessionStore: session };

    const standaloneOk: SessionRefreshProps = {
      flowStore: sessionRefreshStore,
      sessionStore: session,
      ended: endedSnippet
    };

    // @ts-expect-error standalone requires sessionStore.
    const standaloneMissingSession: SessionRefreshProps = {
      flowStore: sessionRefreshStore
    };

    // @ts-expect-error a retired view may have no state, which standalone cannot accept.
    const illegalRetired: SessionRefreshProps = { flowStore: sessionRefresh, sessionStore: session };

    return [
      managedStore,
      managedFlowStore,
      illegalStore,
      illegalFlowStore,
      illegalSessionStore,
      illegalSessionFlowStore,
      standaloneOk,
      standaloneMissingSession,
      illegalRetired
    ];
  }

  type AuthGuardProps = ComponentProps<typeof AuthGuard>;
  type RoleGateProps = ComponentProps<typeof RoleGate>;
  type PasswordInputProps = ComponentProps<typeof PasswordInput>;
  type PasswordCriteriaProps = ComponentProps<typeof PasswordCriteria>;
  type OneTimeCodeInputProps = ComponentProps<typeof OneTimeCodeInput>;

  export function gatingAndInputProps(sessionStore: { readonly state: SessionState }) {
    const validGuard: AuthGuardProps = { store: sessionStore };
    const validRoleGate: RoleGateProps = { store: sessionStore, roles: ['admin'] };
    const validPasswordInput: PasswordInputProps = { id: 'test-pass', value: 'secret', oninput: () => {} };
    const validPasswordCriteria: PasswordCriteriaProps = { password: 'secret' };
    const validOtp: OneTimeCodeInputProps = { id: 'otp-id', name: 'code', value: '123456', oninput: () => {} };

    // @ts-expect-error missing store
    const illegalGuardMissingStore: AuthGuardProps = {};
    // @ts-expect-error missing roles
    const illegalRoleGateMissingRoles: RoleGateProps = { store: sessionStore };
    // @ts-expect-error missing oninput
    const illegalPasswordInputMissingOnInput: PasswordInputProps = { id: 'test-pass', value: 'secret' };
    // @ts-expect-error missing password
    const illegalPasswordCriteriaMissingPassword: PasswordCriteriaProps = {};
    // @ts-expect-error missing name
    const illegalOtpMissingName: OneTimeCodeInputProps = { id: 'otp-id', value: '123', oninput: () => {} };

    return [
      validGuard,
      validRoleGate,
      validPasswordInput,
      validPasswordCriteria,
      validOtp,
      illegalGuardMissingStore,
      illegalRoleGateMissingRoles,
      illegalPasswordInputMissingOnInput,
      illegalPasswordCriteriaMissingPassword,
      illegalOtpMissingName
    ];
  }
</script>
