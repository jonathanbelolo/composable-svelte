import { createServer } from 'vite';
const server = await createServer({ configFile: './vite.config.ts', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { render } = await server.ssrLoadModule('svelte/server');
  const { default: App } = await server.ssrLoadModule('/src/App.svelte');
  const { auth } = await server.ssrLoadModule('/src/model.ts');
  const { createInitialForgotPasswordState, createInitialResetPasswordState, createInitialEmailVerificationState } = await server.ssrLoadModule('@composable-svelte/auth/flows');
  const one = render(App, { props: { initialState: { left: auth.initialState(), right: null, outcomes: ['request-one'] } } }).body;
  const two = render(App, { props: { initialState: { left: null, right: auth.initialState(), outcomes: ['request-two'] } } }).body;
  if (!one.includes('Installed auth composition') || !two.includes('Installed auth composition')) throw new Error('SSR output missing app');
  if (!one.includes('request-one') || one.includes('request-two')) throw new Error('request one leaked');
  if (!two.includes('request-two') || two.includes('request-one')) throw new Error('request two leaked');
  if (one.includes('Sign in') || two.includes('Sign in')) throw new Error('SSR created a temporary login flow');
  const recovery = render(App, { props: { initialState: { left: { ...auth.initialState(), forgotPassword: createInitialForgotPasswordState() }, right: null, outcomes: [] } } }).body;
  if (!recovery.includes('Send reset link') || recovery.includes('Set new password')) throw new Error('SSR recovery flow did not render only its request form');
  const missing = render(App, { props: { initialState: { left: { ...auth.initialState(), resetPassword: createInitialResetPasswordState() }, right: null, outcomes: [] } } }).body;
  if (!missing.includes('This link is incomplete') || missing.includes('name="password"')) throw new Error('SSR missing-token reset rendered an unusable form');
  const expiredState = createInitialResetPasswordState('expired-token');
  const expired = render(App, { props: { initialState: { left: { ...auth.initialState(), resetPassword: { ...expiredState, error: { code: 'token_expired', message: 'Expired.' } } }, right: null, outcomes: [] } } }).body;
  if (!expired.includes('This link has expired') || !expired.includes('Send me a new link') || expired.includes('name="password"')) throw new Error('SSR expired reset must offer a fresh link');
  const missingVerification = render(App, { props: { verificationToken: null, initialState: { left: { ...auth.initialState(), emailVerification: createInitialEmailVerificationState('grace@example.com') }, right: null, outcomes: [] } } }).body;
  if (!missingVerification.includes('Confirm your email') || !missingVerification.includes('Send another link') || missingVerification.includes('Confirming your email')) throw new Error('SSR missing verification token started work or hid resend');
  const verifiedState = { ...createInitialEmailVerificationState('grace@example.com'), status: 'verified', session: null };
  const verified = render(App, { props: { initialState: { left: { ...auth.initialState(), emailVerification: verifiedState }, right: null, outcomes: [] } } }).body;
  if (!verified.includes('Your address is confirmed') || !verified.includes('Sign in')) throw new Error('SSR no-session verification did not render sign-in route');
  const { createInitialMfaEnrolmentState, createInitialMfaManagementState } = await server.ssrLoadModule('@composable-svelte/auth/flows');
  const { createMockAuthDeps } = await server.ssrLoadModule('@composable-svelte/auth/testing');
  const mock = createMockAuthDeps();
  let mfaCalls = 0;
  const counted = name => (...args) => { mfaCalls++; return mock[name](...args); };
  const spying = { ...mock, beginMfaEnrolment: counted('beginMfaEnrolment'), confirmMfaEnrolment: counted('confirmMfaEnrolment'), disableMfa: counted('disableMfa'), regenerateRecoveryCodes: counted('regenerateRecoveryCodes') };
  const settings = render(App, { props: { dependencies: spying, initialState: { left: { ...auth.initialState(), mfaEnrolment: createInitialMfaEnrolmentState(), mfaManagement: createInitialMfaManagementState() }, right: null, outcomes: ['request-settings'] } } }).body;
  const codes = render(App, { props: { dependencies: spying, initialState: { left: null, right: { ...auth.initialState(), mfaManagement: { ...createInitialMfaManagementState(), recoveryCodes: ['right-only-code'] } }, outcomes: ['request-codes'], accounts: { left: { enabled: undefined, retry: null }, right: { enabled: true, retry: null } } } } }).body;
  await new Promise(resolve => setTimeout(resolve, 50));
  if (!settings.includes('Preparing your setup key') || !settings.includes('Reading your account') || settings.includes('Turn off')) throw new Error('SSR MFA settings must render idle enrolment and an unread account without guessing');
  if (!codes.includes('right-only-code') || !codes.includes('Turn off') || settings.includes('right-only-code') || codes.includes('request-settings')) throw new Error('SSR MFA roots leaked');
  if (mfaCalls !== 0) throw new Error(`SSR started ${mfaCalls} MFA request(s)`);
  const { createInitialOAuthStartState, createInitialOAuthCallbackState } = await server.ssrLoadModule('@composable-svelte/auth/flows');
  let oauthCalls = 0;
  const countedOAuth = name => (...args) => { oauthCalls++; return mock[name](...args); };
  const spyingOAuth = {
    ...spying,
    beginOAuth: countedOAuth('beginOAuth'),
    completeOAuth: countedOAuth('completeOAuth'),
    linkOAuthProvider: countedOAuth('linkOAuthProvider')
  };
  const oauthStartRender = render(App, {
    props: {
      dependencies: spyingOAuth,
      initialState: {
        left: { ...auth.initialState(), oauthStart: createInitialOAuthStartState() },
        right: null,
        outcomes: ['request-oauth-start']
      }
    }
  }).body;
  const oauthCallbackRender = render(App, {
    props: {
      dependencies: spyingOAuth,
      callbackParams: { code: null, state: null, error: null, errorDescription: null },
      initialState: {
        left: null,
        right: { ...auth.initialState(), oauthCallback: createInitialOAuthCallbackState() },
        outcomes: ['request-oauth-cb']
      }
    }
  }).body;
  if (!oauthStartRender.includes('Or continue with') || !oauthStartRender.includes('GitHub')) throw new Error('SSR OAuth start did not render buttons');
  if (!oauthCallbackRender.includes('Nothing to finish here') || !oauthCallbackRender.includes('Back to sign in')) throw new Error('SSR OAuth callback did not render empty notice');
  if (oauthStartRender.includes('request-oauth-cb') || oauthCallbackRender.includes('request-oauth-start')) throw new Error('SSR OAuth roots leaked');
  if (oauthCalls !== 0) throw new Error(`SSR started ${oauthCalls} OAuth request(s)`);

  const { createInitialMagicLinkRequestState, createInitialMagicLinkSignInState } = await server.ssrLoadModule('@composable-svelte/auth/flows');
  let magicCalls = 0;
  const countedMagic = name => (...args) => { magicCalls++; return mock[name](...args); };
  const spyingMagic = {
    ...spying,
    requestMagicLink: countedMagic('requestMagicLink'),
    signInWithMagicLink: countedMagic('signInWithMagicLink')
  };
  const magicRequestRender = render(App, {
    props: {
      dependencies: spyingMagic,
      initialState: {
        left: { ...auth.initialState(), magicLinkRequest: createInitialMagicLinkRequestState() },
        right: null,
        outcomes: ['request-magic-req']
      }
    }
  }).body;
  const magicSignInRender = render(App, {
    props: {
      dependencies: spyingMagic,
      initialState: {
        left: null,
        right: { ...auth.initialState(), magicLinkSignIn: createInitialMagicLinkSignInState('ssr-token-consumer') },
        outcomes: ['request-magic-signin']
      }
    }
  }).body;
  if (!magicRequestRender.includes('Email me a link') || !magicRequestRender.includes('magic-request__form')) throw new Error('SSR magic link request did not render form');
  if (!magicSignInRender.includes('Sign in') || !magicSignInRender.includes('magic-signin__action')) throw new Error('SSR magic link sign-in did not render action');
  if (magicRequestRender.includes('request-magic-signin') || magicSignInRender.includes('request-magic-req')) throw new Error('SSR magic link roots leaked');
  if (magicCalls !== 0) throw new Error(`SSR started ${magicCalls} magic link request(s)`);

  const { createInitialAccountState, createInitialConnectedAccountsState } = await server.ssrLoadModule('@composable-svelte/auth/flows');
  let accountCalls = 0;
  const countedAccount = name => (...args) => { accountCalls++; return mock[name](...args); };
  const spyingAccount = {
    ...spyingMagic,
    fetchAccount: countedAccount('fetchAccount'),
    unlinkOAuthProvider: countedAccount('unlinkOAuthProvider')
  };
  const connIdleRender = render(App, {
    props: {
      dependencies: spyingAccount,
      initialState: {
        left: { ...auth.initialState(), account: createInitialAccountState(), connectedAccounts: createInitialConnectedAccountsState() },
        right: null,
        outcomes: ['request-conn-idle']
      }
    }
  }).body;
  const connLoadedRender = render(App, {
    props: {
      dependencies: spyingAccount,
      initialState: {
        left: null,
        right: {
          ...auth.initialState(),
          account: {
            ...createInitialAccountState(),
            status: 'loaded',
            account: {
              email: 'ssr-right@example.com',
              emailVerified: true,
              hasPassword: true,
              mfaEnabled: false,
              providers: ['github', 'google'],
              pendingEmail: null
            }
          },
          connectedAccounts: createInitialConnectedAccountsState()
        },
        outcomes: ['request-conn-loaded']
      }
    }
  }).body;
  if (!connIdleRender.includes('Reading your account') || connIdleRender.includes('Disconnect')) {
    throw new Error('SSR connected accounts must render truthful idle state without Disconnect buttons');
  }
  if (!connLoadedRender.includes('GitHub') || !connLoadedRender.includes('Disconnect') || connLoadedRender.includes('Reading your account')) {
    throw new Error('SSR loaded account must render attached providers');
  }
  if (connIdleRender.includes('request-conn-loaded') || connLoadedRender.includes('request-conn-idle')) {
    throw new Error('SSR connected accounts roots leaked');
  }
  if (accountCalls !== 0) throw new Error(`SSR started ${accountCalls} account request(s)`);

  const { createInitialChangeEmailState, createInitialChangeEmailConfirmState } = await server.ssrLoadModule('@composable-svelte/auth/flows');
  let emailChangeCalls = 0;
  const countedEmailChange = name => (...args) => { emailChangeCalls++; return mock[name](...args); };
  const spyingEmailChange = {
    ...spyingAccount,
    requestEmailChange: countedEmailChange('requestEmailChange'),
    resendEmailChange: countedEmailChange('resendEmailChange'),
    confirmEmailChange: countedEmailChange('confirmEmailChange')
  };
  const changeEmailRender = render(App, {
    props: {
      dependencies: spyingEmailChange,
      initialState: {
        left: { ...auth.initialState(), changeEmail: createInitialChangeEmailState() },
        right: null,
        outcomes: ['request-change-email']
      }
    }
  }).body;
  const changeEmailConfirmRender = render(App, {
    props: {
      dependencies: spyingEmailChange,
      changeEmailConfirmToken: null,
      initialState: {
        left: null,
        right: { ...auth.initialState(), changeEmailConfirm: createInitialChangeEmailConfirmState() },
        outcomes: ['request-change-confirm']
      }
    }
  }).body;
  if (!changeEmailRender.includes('Change your email address') || !changeEmailRender.includes('name="email"')) {
    throw new Error('SSR change email did not render form');
  }
  if (!changeEmailConfirmRender.includes('Confirming your new address') || !changeEmailConfirmRender.includes('This page needs the link from the email we sent you.')) {
    throw new Error('SSR change email confirmation did not render instructions');
  }
  if (changeEmailRender.includes('request-change-confirm') || changeEmailConfirmRender.includes('request-change-email')) {
    throw new Error('SSR change email roots leaked');
  }
  if (emailChangeCalls !== 0) throw new Error(`SSR started ${emailChangeCalls} email change request(s)`);

  const { createInitialChangePasswordState, createInitialDeleteAccountState } = await server.ssrLoadModule('@composable-svelte/auth/flows');
  let passDeleteCalls = 0;
  const countedPassDelete = name => (...args) => { passDeleteCalls++; return mock[name](...args); };
  const spyingPassDelete = {
    ...spyingEmailChange,
    changePassword: countedPassDelete('changePassword'),
    deleteAccount: countedPassDelete('deleteAccount')
  };
  const changePassRender = render(App, {
    props: {
      dependencies: spyingPassDelete,
      initialState: {
        left: { ...auth.initialState(), changePassword: createInitialChangePasswordState() },
        right: null,
        outcomes: ['request-change-pass']
      }
    }
  }).body;
  const deleteAccountRender = render(App, {
    props: {
      dependencies: spyingPassDelete,
      initialState: {
        left: null,
        right: { ...auth.initialState(), deleteAccount: createInitialDeleteAccountState() },
        outcomes: ['request-del-acct']
      }
    }
  }).body;
  if (!changePassRender.includes('Change your password') || !changePassRender.includes('name="password"')) {
    throw new Error('SSR change password did not render form');
  }
  if (!deleteAccountRender.includes('Delete your account') || !deleteAccountRender.includes('Delete my account')) {
    throw new Error('SSR delete account did not render panel');
  }
  if (changePassRender.includes('request-del-acct') || deleteAccountRender.includes('request-change-pass')) {
    throw new Error('SSR change password / delete account roots leaked');
  }
  if (passDeleteCalls !== 0) throw new Error(`SSR started ${passDeleteCalls} change password / delete account request(s)`);

  const { createInitialSessionRefreshState } = await server.ssrLoadModule('@composable-svelte/auth/flows');
  let refreshCalls = 0;
  const countedRefresh = name => (...args) => { refreshCalls++; return mock[name](...args); };
  const spyingRefresh = {
    ...spyingPassDelete,
    refreshSession: countedRefresh('refreshSession')
  };
  const sessionRefreshRender = render(App, {
    props: {
      dependencies: spyingRefresh,
      initialState: {
        left: {
          ...auth.initialState(),
          session: {
            status: 'authenticated',
            subject: { kind: 'authenticated', id: 'ssr-user', attributes: {} },
            expiresAt: '2026-10-01T00:00:00.000Z'
          },
          sessionRefresh: createInitialSessionRefreshState('2026-10-01T00:00:00.000Z')
        },
        right: null,
        outcomes: ['request-refresh']
      }
    }
  }).body;
  if (!sessionRefreshRender.includes('request-refresh') || sessionRefreshRender.includes('request-del-acct')) {
    throw new Error('SSR session refresh roots leaked');
  }
  if (refreshCalls !== 0) throw new Error(`SSR started ${refreshCalls} session refresh request(s)`);

  // Isolated SSR gates qualification:
  const gatesMemberRender = render(App, {
    props: {
      initialState: {
        left: {
          ...auth.initialState(),
          session: {
            status: 'authenticated',
            subject: { kind: 'authenticated', id: 'member-user', attributes: { roles: ['member'] } },
            expiresAt: '2026-10-01T00:00:00.000Z'
          }
        },
        right: null,
        outcomes: ['request-gates-member']
      }
    }
  }).body;

  const gatesAdminRender = render(App, {
    props: {
      initialState: {
        left: {
          ...auth.initialState(),
          session: {
            status: 'authenticated',
            subject: { kind: 'authenticated', id: 'admin-user', attributes: { roles: ['admin'] } },
            expiresAt: '2026-10-01T00:00:00.000Z'
          }
        },
        right: null,
        outcomes: ['request-gates-admin']
      }
    }
  }).body;

  const gatesAnonRender = render(App, {
    props: {
      initialState: {
        left: {
          ...auth.initialState(),
          session: {
            status: 'anonymous',
            subject: { kind: 'anonymous' },
            expiresAt: null
          }
        },
        right: null,
        outcomes: ['request-gates-anon']
      }
    }
  }).body;

  if (!gatesMemberRender.includes('Member access granted') || gatesMemberRender.includes('Admin access granted')) {
    throw new Error('SSR member render must show member access and deny admin access');
  }
  if (!gatesAdminRender.includes('Admin access granted')) {
    throw new Error('SSR admin render must show admin access');
  }
  if (!gatesAnonRender.includes('Anonymous') || gatesAnonRender.includes('Member access granted') || gatesAnonRender.includes('Admin access granted')) {
    throw new Error('SSR anonymous render must show anonymous fallback and hide role children');
  }
  if (gatesMemberRender.includes('request-gates-admin') || gatesAdminRender.includes('request-gates-anon') || gatesAnonRender.includes('request-gates-member')) {
    throw new Error('SSR gates requests leaked across renders');
  }
  if (!gatesMemberRender.includes('guidance-password-input') || !gatesMemberRender.includes('guidance-password-criteria')) {
    throw new Error('SSR did not render password guidance section');
  }

  console.log('Installed SSR render proof passed for two isolated roots');
} finally { await server.close(); }
