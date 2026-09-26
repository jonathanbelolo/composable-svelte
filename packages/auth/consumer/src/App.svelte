<script lang="ts">
  import { ApplicationHost, ApplicationRoot, FeatureOutlet, FeatureViews, defineViews, type PresentationFeatureViewProps } from '@composable-svelte/core/application';
  import { LoginForm, MfaChallengeForm, SignupForm, ForgotPasswordForm, ResetPasswordForm, EmailVerification, MfaEnrolment, OAuthSignIn, OAuthCallback, MagicLinkRequestForm, MagicLinkSignIn, ChangeEmailForm, EmailChangeConfirmation, ChangePasswordForm, DeleteAccountPanel, SessionRefresh, AuthGuard, RoleGate, PasswordInput, PasswordCriteria } from '@composable-svelte/auth/components';
  import type { AuthFeatureAction, AuthFeatureCatalog, AuthFeatureDependencies, AuthFeatureState } from '@composable-svelte/auth/application';
  import {
    oauthParamsFromUrl,
    type LoginAction,
    type LoginState,
    type MfaChallengeAction,
    type MfaChallengeState,
    type SignupAction,
    type SignupState,
    type ForgotPasswordAction,
    type ForgotPasswordState,
    type ResetPasswordAction,
    type ResetPasswordState,
    type EmailVerificationAction,
    type EmailVerificationState,
    type MfaEnrolmentAction,
    type MfaEnrolmentState,
    type MfaManagementAction,
    type MfaManagementState,
    type OAuthStartAction,
    type OAuthStartState,
    type OAuthCallbackAction,
    type OAuthCallbackState,
    type OAuthCallbackParams,
    type MagicLinkRequestAction,
    type MagicLinkRequestState,
    type MagicLinkSignInAction,
    type MagicLinkSignInState,
    type AccountAction,
    type AccountState,
    type ConnectedAccountsAction,
    type ConnectedAccountsState,
    type ChangeEmailAction,
    type ChangeEmailState,
    type ChangeEmailConfirmAction,
    type ChangeEmailConfirmState,
    type ChangePasswordAction,
    type ChangePasswordState,
    type DeleteAccountAction,
    type DeleteAccountState,
    type SessionRefreshAction,
    type SessionRefreshState
  } from '@composable-svelte/auth/flows';
  import { createMockAuthDeps } from '@composable-svelte/auth/testing';
  import { application, auth, composition, type StateInput } from './model.js';
  import AccountScope from './AccountScope.svelte';
  import AccountViewPort from './AccountViewPort.svelte';
  import OAuthStartViewPort from './OAuthStartViewPort.svelte';
  import MfaSettings from './MfaSettings.svelte';
  import ConnectedAccountsSettings from './ConnectedAccountsSettings.svelte';

  let {
    dependencies = createMockAuthDeps(),
    initialState,
    verificationToken = 'consumer-verify-token',
    callbackParams,
    changeEmailConfirmToken = 'consumer-confirm-token',
    providers = [
      { id: 'github', label: 'GitHub' },
      { id: 'google', label: 'Google' }
    ]
  }: {
    dependencies?: AuthFeatureDependencies;
    initialState?: StateInput;
    verificationToken?: string | null;
    callbackParams?: OAuthCallbackParams | null | undefined;
    changeEmailConfirmToken?: string | null | undefined;
    providers?: readonly { id: string; label: string }[] | undefined;
  } = $props();

  const effectiveCallbackParams = $derived(
    callbackParams !== undefined
      ? callbackParams
      : typeof window !== 'undefined'
        ? oauthParamsFromUrl(window.location.href)
        : null
  );

  function subjectId(subject: AuthFeatureState['session']['subject'] | undefined): string {
    return subject?.kind === 'authenticated' ? subject.id : 'none';
  }

  function displayName(subject: AuthFeatureState['session']['subject'] | undefined): string {
    return subject?.kind === 'authenticated' ? String(subject.attributes['display_name'] ?? '') : 'none';
  }

  let guidancePassword = $state('');

  const authViews = defineViews(auth.composition, {
    login: { content: loginContent },
    mfa: { content: mfaContent },
    signup: { content: signupContent },
    forgotPassword: { content: forgotContent },
    resetPassword: { content: resetContent },
    emailVerification: { content: verificationContent },
    mfaEnrolment: { content: enrolmentContent },
    mfaManagement: { content: managementContent },
    oauthStart: { content: oauthStartContent },
    oauthCallback: { content: oauthCallbackContent },
    magicLinkRequest: { content: magicLinkRequestContent },
    magicLinkSignIn: { content: magicLinkSignInContent },
    account: { content: accountContent },
    connectedAccounts: { content: connectedAccountsContent },
    changeEmail: { content: changeEmailContent },
    changeEmailConfirm: { content: changeEmailConfirmContent },
    changePassword: { content: changePasswordContent },
    deleteAccount: { content: deleteAccountContent },
    sessionRefresh: { content: sessionRefreshContent }
  });
  const views = defineViews(composition, {
    left: { content: leftContent, children: authViews },
    right: { content: rightContent, children: authViews }
  });
</script>

{#snippet loginContent({ store }: PresentationFeatureViewProps<LoginState, LoginAction>)}
  <LoginForm mode="managed" flowStore={store} />
{/snippet}
{#snippet mfaContent({ store }: PresentationFeatureViewProps<MfaChallengeState, MfaChallengeAction>)}
  <MfaChallengeForm mode="managed" flowStore={store} />
{/snippet}
{#snippet signupContent({ store }: PresentationFeatureViewProps<SignupState, SignupAction>)}
  <SignupForm mode="managed" flowStore={store} />
{/snippet}
{#snippet forgotContent({ store }: PresentationFeatureViewProps<ForgotPasswordState, ForgotPasswordAction>)}
  <ForgotPasswordForm mode="managed" flowStore={store} />
{/snippet}
{#snippet resetContent({ store }: PresentationFeatureViewProps<ResetPasswordState, ResetPasswordAction>)}
  <ResetPasswordForm mode="managed" flowStore={store} />
{/snippet}
{#snippet verificationContent({ store }: PresentationFeatureViewProps<EmailVerificationState, EmailVerificationAction>)}
  <EmailVerification mode="managed" flowStore={store} token={verificationToken} />
{/snippet}
{#snippet enrolmentContent({ store }: PresentationFeatureViewProps<MfaEnrolmentState, MfaEnrolmentAction>)}
  <MfaEnrolment mode="managed" flowStore={store} />
{/snippet}
{#snippet managementContent({ store }: PresentationFeatureViewProps<MfaManagementState, MfaManagementAction>)}
  <MfaSettings view={store} />
{/snippet}
{#snippet oauthStartContent({ store }: PresentationFeatureViewProps<OAuthStartState, OAuthStartAction>)}
  <OAuthStartViewPort view={store} />
  <OAuthSignIn mode="managed" flowStore={store} {providers} />
{/snippet}
{#snippet oauthCallbackContent({ store }: PresentationFeatureViewProps<OAuthCallbackState, OAuthCallbackAction>)}
  <OAuthCallback mode="managed" flowStore={store} params={effectiveCallbackParams} />
{/snippet}
{#snippet magicLinkRequestContent({ store }: PresentationFeatureViewProps<MagicLinkRequestState, MagicLinkRequestAction>)}
  <MagicLinkRequestForm mode="managed" flowStore={store} />
{/snippet}
{#snippet magicLinkSignInContent({ store }: PresentationFeatureViewProps<MagicLinkSignInState, MagicLinkSignInAction>)}
  <MagicLinkSignIn mode="managed" flowStore={store} />
{/snippet}
{#snippet accountContent({ store }: PresentationFeatureViewProps<AccountState, AccountAction>)}
  <AccountViewPort view={store} />
  <div data-testid="account-view">
    {#if store.state?.account}
      <span data-testid="account-email">{store.state.account.email}</span>
      <span data-testid="account-providers">{store.state.account.providers.join(',')}</span>
    {:else if store.state?.status === 'loading'}
      <span data-testid="account-loading">Loading account…</span>
    {:else}
      <span data-testid="account-idle">Account idle</span>
    {/if}
  </div>
{/snippet}
{#snippet connectedAccountsContent({ store }: PresentationFeatureViewProps<ConnectedAccountsState, ConnectedAccountsAction>)}
  <ConnectedAccountsSettings view={store} />
{/snippet}
{#snippet changeEmailContent({ store }: PresentationFeatureViewProps<ChangeEmailState, ChangeEmailAction>)}
  <ChangeEmailForm mode="managed" flowStore={store} />
{/snippet}
{#snippet changeEmailConfirmContent({ store }: PresentationFeatureViewProps<ChangeEmailConfirmState, ChangeEmailConfirmAction>)}
  <EmailChangeConfirmation mode="managed" flowStore={store} />
{/snippet}
{#snippet changePasswordContent({ store }: PresentationFeatureViewProps<ChangePasswordState, ChangePasswordAction>)}
  <ChangePasswordForm mode="managed" flowStore={store} />
{/snippet}
{#snippet deleteAccountContent({ store }: PresentationFeatureViewProps<DeleteAccountState, DeleteAccountAction>)}
  <DeleteAccountPanel mode="managed" store={store} />
{/snippet}
{#snippet sessionRefreshContent({ store }: PresentationFeatureViewProps<SessionRefreshState, SessionRefreshAction>)}
  <div data-testid="session-refresh-slot">
    <SessionRefresh mode="managed" store={store}>
      {#snippet ended()}
        <p data-testid="session-ended-notice">Session ended.</p>
      {/snippet}
    </SessionRefresh>
  </div>
{/snippet}

{#snippet leftContent({ store, views: children }: PresentationFeatureViewProps<AuthFeatureState, AuthFeatureAction, AuthFeatureCatalog>)}
  <section data-testid="left-auth">
    <button onclick={() => store.dispatch({ type: 'openLogin' })}>Open left login</button>
    <button onclick={() => store.dispatch({ type: 'openSignup' })}>Open left signup</button>
    <button onclick={() => store.dispatch({ type: 'openForgotPassword' })}>Open left recovery</button>
    <button onclick={() => store.dispatch({ type: 'openResetPassword', token: 'consumer-reset-token' })}>Open left reset</button>
    <button onclick={() => store.dispatch({ type: 'openResetPassword', token: 'expired-reset-token' })}>Open left expired reset</button>
    <button onclick={() => store.dispatch({ type: 'openEmailVerification', email: 'grace@example.com' })}>Open left verification</button>
    <button onclick={() => store.dispatch({ type: 'openOAuthStart' })}>Open left OAuth start</button>
    <button onclick={() => store.dispatch({ type: 'openOAuthCallback' })}>Open left OAuth callback</button>
    <button onclick={() => store.dispatch({ type: 'openMagicLinkRequest' })}>Open left magic request</button>
    <button onclick={() => store.dispatch({ type: 'openMagicLinkSignIn', token: 'consumer-magic-token' })}>Open left magic sign-in</button>
    <button onclick={() => store.dispatch({ type: 'openMagicLinkSignIn', token: null })}>Open left missing magic sign-in</button>
    <button onclick={() => store.dispatch({ type: 'session', action: { type: 'logout' } })}>Log out left</button>
    <button onclick={() => store.dispatch({ type: 'openMfaManagement' })}>Open left MFA settings</button>
    <button onclick={() => store.dispatch({ type: 'openMfaEnrolment' })}>Open left enrolment</button>
    <button onclick={() => store.dispatch({ type: 'openAccount' })}>Open left account</button>
    <button onclick={() => store.dispatch({ type: 'openConnectedAccounts' })}>Open left connected accounts</button>
    <button onclick={() => store.dispatch({ type: 'closeConnectedAccounts' })}>Close left connected accounts</button>
    <button onclick={() => store.dispatch({ type: 'openChangeEmail' })}>Open left change email</button>
    <button onclick={() => store.dispatch({ type: 'closeChangeEmail' })}>Close left change email</button>
    <button onclick={() => store.dispatch({ type: 'openChangePassword' })}>Open left change password</button>
    <button onclick={() => store.dispatch({ type: 'closeChangePassword' })}>Close left change password</button>
    <button onclick={() => store.dispatch({ type: 'openDeleteAccount' })}>Open left delete account</button>
    <button onclick={() => store.dispatch({ type: 'closeDeleteAccount' })}>Close left delete account</button>
    <button onclick={() => store.dispatch({ type: 'openChangeEmailConfirm', token: 'consumer-confirm-token' })}>Open left change email confirm</button>
    <button onclick={() => store.dispatch({ type: 'closeChangeEmailConfirm' })}>Close left change email confirm</button>
    <button onclick={() => store.dispatch({ type: 'restartChangeEmailConfirm', token: 'expired-confirm-token' })}>Restart left expired change email confirm</button>
    <button onclick={() => store.dispatch({ type: 'restartChangeEmailConfirm', token: null })}>Restart left missing change email confirm</button>
    <button onclick={() => store.dispatch({ type: 'cancelSignIn' })}>Dismiss login</button>
    <button onclick={() => store.dispatch({ type: 'openChangeEmailConfirm', token: 'expired-confirm-token' })}>Open left expired change email confirm</button>
    <button onclick={() => store.dispatch({ type: 'openChangeEmailConfirm', token: 'unauthorized-confirm-token' })}>Open left unauthorized change email confirm</button>
    <button onclick={() => store.dispatch({ type: 'openChangeEmailConfirm', token: null })}>Open left missing change email confirm</button>
    <button onclick={() => store.dispatch({ type: 'openSessionRefresh' })}>Open left session refresh</button>
    <button onclick={() => store.dispatch({ type: 'closeSessionRefresh' })}>Close left session refresh</button>
    <button onclick={() => store.dispatch({ type: 'restartSessionRefresh' })}>Restart left session refresh</button>
    <button onclick={() => store.dispatch({ type: 'sessionRefresh', action: { type: 'presented', action: { type: 'refreshRequested' } } })}>Request left refresh</button>
    {#if store.state?.session}
      {@const currentSession = store.state.session}
      <div data-testid="left-gates">
        <AuthGuard store={{ state: currentSession }}>
          {#snippet children({ isRevalidating })}
            <span data-testid="left-guard-authenticated">Authenticated (revalidating: {isRevalidating})</span>
            <RoleGate store={{ state: currentSession }} roles={['member']}>
              {#snippet children()}
                <span data-testid="left-role-member">Member access granted</span>
              {/snippet}
              {#snippet fallback()}
                <span data-testid="left-role-no-member">Member access denied</span>
              {/snippet}
            </RoleGate>
            <RoleGate store={{ state: currentSession }} roles={['admin']}>
              {#snippet children()}
                <span data-testid="left-role-admin">Admin access granted</span>
              {/snippet}
              {#snippet fallback()}
                <span data-testid="left-role-no-admin">Admin access denied</span>
              {/snippet}
            </RoleGate>
          {/snippet}
          {#snippet fallback()}
            <span data-testid="left-guard-anonymous">Anonymous</span>
          {/snippet}
          {#snippet pending()}
            <span data-testid="left-guard-pending">Resolving session…</span>
          {/snippet}
        </AuthGuard>
      </div>
    {/if}
    <FeatureOutlet view={children.login} />
    <FeatureOutlet view={children.mfa} />
    <FeatureOutlet view={children.signup} />
    <FeatureOutlet view={children.forgotPassword} />
    <FeatureOutlet view={children.resetPassword} />
    <FeatureOutlet view={children.emailVerification} />
    <FeatureOutlet view={children.changeEmailConfirm} />
    <AccountScope
      side="left"
      feature={() => store.state}
      onLink={(provider) => { store.dispatch({ type: 'startOAuthLink', provider }); }}
    >
      <FeatureOutlet view={children.oauthStart} />
      <FeatureOutlet view={children.oauthCallback} />
      <FeatureOutlet view={children.magicLinkRequest} />
      <FeatureOutlet view={children.magicLinkSignIn} />
      <FeatureOutlet view={children.mfaEnrolment} />
      <FeatureOutlet view={children.mfaManagement} />
      <FeatureOutlet view={children.account} />
      <FeatureOutlet view={children.connectedAccounts} />
      <FeatureOutlet view={children.changeEmail} />
      <FeatureOutlet view={children.changePassword} />
      <FeatureOutlet view={children.deleteAccount} />
      <FeatureOutlet view={children.sessionRefresh} />
    </AccountScope>
  </section>
{/snippet}
{#snippet rightContent({ store, views: children }: PresentationFeatureViewProps<AuthFeatureState, AuthFeatureAction, AuthFeatureCatalog>)}
  <section data-testid="right-auth">
    <button onclick={() => store.dispatch({ type: 'openLogin' })}>Open right login</button>
    <button onclick={() => store.dispatch({ type: 'openSignup' })}>Open right signup</button>
    <button onclick={() => store.dispatch({ type: 'openForgotPassword' })}>Open right recovery</button>
    <button onclick={() => store.dispatch({ type: 'openResetPassword', token: 'consumer-reset-token' })}>Open right reset</button>
    <button onclick={() => store.dispatch({ type: 'openEmailVerification', email: 'grace@example.com' })}>Open right verification</button>
    <button onclick={() => store.dispatch({ type: 'openOAuthStart' })}>Open right OAuth start</button>
    <button onclick={() => store.dispatch({ type: 'openOAuthCallback' })}>Open right OAuth callback</button>
    <button onclick={() => store.dispatch({ type: 'openMagicLinkRequest' })}>Open right magic request</button>
    <button onclick={() => store.dispatch({ type: 'openMagicLinkSignIn', token: 'consumer-magic-token' })}>Open right magic sign-in</button>
    <button onclick={() => store.dispatch({ type: 'openMfaManagement' })}>Open right MFA settings</button>
    <button onclick={() => store.dispatch({ type: 'openAccount' })}>Open right account</button>
    <button onclick={() => store.dispatch({ type: 'openConnectedAccounts' })}>Open right connected accounts</button>
    <button onclick={() => store.dispatch({ type: 'closeConnectedAccounts' })}>Close right connected accounts</button>
    <button onclick={() => store.dispatch({ type: 'openChangeEmail' })}>Open right change email</button>
    <button onclick={() => store.dispatch({ type: 'closeChangeEmail' })}>Close right change email</button>
    <button onclick={() => store.dispatch({ type: 'openChangePassword' })}>Open right change password</button>
    <button onclick={() => store.dispatch({ type: 'closeChangePassword' })}>Close right change password</button>
    <button onclick={() => store.dispatch({ type: 'openDeleteAccount' })}>Open right delete account</button>
    <button onclick={() => store.dispatch({ type: 'closeDeleteAccount' })}>Close right delete account</button>
    <button onclick={() => store.dispatch({ type: 'openChangeEmailConfirm', token: 'consumer-confirm-token' })}>Open right change email confirm</button>
    <button onclick={() => store.dispatch({ type: 'closeChangeEmailConfirm' })}>Close right change email confirm</button>
    <button onclick={() => store.dispatch({ type: 'openSessionRefresh' })}>Open right session refresh</button>
    <button onclick={() => store.dispatch({ type: 'closeSessionRefresh' })}>Close right session refresh</button>
    <button onclick={() => store.dispatch({ type: 'restartSessionRefresh' })}>Restart right session refresh</button>
    <button onclick={() => store.dispatch({ type: 'sessionRefresh', action: { type: 'presented', action: { type: 'refreshRequested' } } })}>Request right refresh</button>
    <FeatureOutlet view={children.login} />
    <FeatureOutlet view={children.mfa} />
    <FeatureOutlet view={children.signup} />
    <FeatureOutlet view={children.forgotPassword} />
    <FeatureOutlet view={children.resetPassword} />
    <FeatureOutlet view={children.emailVerification} />
    <FeatureOutlet view={children.changeEmailConfirm} />
    <AccountScope
      side="right"
      feature={() => store.state}
      onLink={(provider) => { store.dispatch({ type: 'startOAuthLink', provider }); }}
    >
      <FeatureOutlet view={children.oauthStart} />
      <FeatureOutlet view={children.oauthCallback} />
      <FeatureOutlet view={children.magicLinkRequest} />
      <FeatureOutlet view={children.magicLinkSignIn} />
      <FeatureOutlet view={children.mfaEnrolment} />
      <FeatureOutlet view={children.mfaManagement} />
      <FeatureOutlet view={children.account} />
      <FeatureOutlet view={children.connectedAccounts} />
      <FeatureOutlet view={children.changeEmail} />
      <FeatureOutlet view={children.changePassword} />
      <FeatureOutlet view={children.deleteAccount} />
      <FeatureOutlet view={children.sessionRefresh} />
    </AccountScope>
  </section>
{/snippet}

<ApplicationRoot definition={application} options={{ dependencies, initial: { input: initialState } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <main>
        <h1>Installed auth composition</h1>
        <button onclick={() => app.store.dispatch({ type: 'resetLeft' })}>Reset left</button>
        <button onclick={() => app.store.dispatch({ type: 'removeLeft' })}>Remove left</button>
        <button onclick={() => app.store.dispatch({ type: 'restoreLeft' })}>Restore left</button>
        <output data-testid="outcomes">{app.store.state.outcomes.join(',')}</output>
        <output data-testid="left-subject">{subjectId(app.store.state.left?.session.subject)}</output>
        <output data-testid="left-display-name">{displayName(app.store.state.left?.session.subject)}</output>
        <output data-testid="left-expiry">{app.store.state.left?.session.expiresAt ?? 'none'}</output>
        <button onclick={() => app.store.dispatch({ type: 'accountRead', side: 'left', enabled: true })}>Read left account</button>
        <section data-testid="password-guidance-section">
          <h2>Password guidance</h2>
          <label for="guidance-password-input">New password</label>
          <PasswordInput
            id="guidance-password-input"
            name="guidancePassword"
            value={guidancePassword}
            oninput={(e) => { guidancePassword = e.currentTarget.value; }}
            describedBy="guidance-password-criteria"
            autocomplete="new-password"
          />
          <PasswordCriteria
            id="guidance-password-criteria"
            password={guidancePassword}
          />
        </section>
        <AccountScope accounts={() => app.store.state.accounts} {providers}>
          <FeatureViews store={app.store} definition={views}>
            {#snippet children(handles)}
              <FeatureOutlet view={handles.left} />
              <FeatureOutlet view={handles.right} />
            {/snippet}
          </FeatureViews>
        </AccountScope>
      </main>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
