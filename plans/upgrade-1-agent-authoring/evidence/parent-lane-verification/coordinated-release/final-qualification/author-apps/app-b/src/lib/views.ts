import { defineViews } from '@composable-svelte/core/application';
import { auth, composition } from './model.js';
import LoginView from './components/LoginView.svelte';
import MfaView from './components/MfaView.svelte';
import ChangePasswordView from './components/ChangePasswordView.svelte';
import AuthFeatureView from './components/AuthFeatureView.svelte';
import ChartView from './components/ChartView.svelte';

export const authViews = defineViews(auth.composition, {
  login: { render: LoginView },
  mfa: { render: MfaView },
  changePassword: { render: ChangePasswordView },
  signup: { headless: true },
  forgotPassword: { headless: true },
  resetPassword: { headless: true },
  emailVerification: { headless: true },
  mfaEnrolment: { headless: true },
  mfaManagement: { headless: true },
  oauthStart: { headless: true },
  oauthCallback: { headless: true },
  magicLinkRequest: { headless: true },
  magicLinkSignIn: { headless: true },
  account: { headless: true },
  connectedAccounts: { headless: true },
  changeEmail: { headless: true },
  changeEmailConfirm: { headless: true },
  deleteAccount: { headless: true },
  sessionRefresh: { headless: true }
});

export const appViews = defineViews(composition, {
  auth: { render: AuthFeatureView, children: authViews },
  chart: { render: ChartView }
});
