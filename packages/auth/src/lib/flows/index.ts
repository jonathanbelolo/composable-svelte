/**
 * Headless auth flows.
 *
 * Each flow is a reducer, its state and action types, and the Zod schema its
 * form validates against — no markup. The styled components in
 * `@composable-svelte/auth/components` are built on these, and a consumer who
 * wants their own markup can use these directly.
 */

export {
	loginReducer,
	createInitialLoginState,
	createLoginStore,
	loginFormConfig,
	loginSchema,
	emptyLoginFields
} from './login/index.js';

export type {
	LoginFields,
	LoginState,
	LoginAction,
	LoginStatus,
	LoginDependencies
} from './login/index.js';

// The password policy — shared by every flow that takes a password, which is
// why it is not inside any one of them.
export {
	passwordCriteria,
	evaluatePasswordCriteria,
	meetsPasswordCriteria,
	passwordField,
	PASSWORD_MIN_LENGTH,
	PASSWORD_MAX_LENGTH
} from './password-policy.js';

export type { PasswordCriterion } from './password-policy.js';

export {
	signupReducer,
	createInitialSignupState,
	createSignupStore,
	signupFormConfig,
	signupSchema,
	emptySignupFields
} from './signup/index.js';

export type {
	SignupFields,
	SignupState,
	SignupAction,
	SignupStatus,
	SignupDependencies
} from './signup/index.js';

export {
	emailVerificationReducer,
	createInitialEmailVerificationState,
	createEmailVerificationStore,
	tokenFromUrl
} from './email-verification/index.js';

export type {
	EmailVerificationState,
	EmailVerificationAction,
	EmailVerificationStatus,
	EmailVerificationDependencies,
	ResendStatus
} from './email-verification/index.js';

export {
	forgotPasswordReducer,
	createInitialForgotPasswordState,
	createForgotPasswordStore,
	forgotPasswordFormConfig,
	forgotPasswordSchema,
	emptyForgotPasswordFields
} from './forgot-password/index.js';

export type {
	ForgotPasswordFields,
	ForgotPasswordState,
	ForgotPasswordAction,
	ForgotPasswordStatus,
	ForgotPasswordDependencies
} from './forgot-password/index.js';

export {
	resetPasswordReducer,
	createInitialResetPasswordState,
	createResetPasswordStore,
	resetPasswordFormConfig,
	resetPasswordSchema,
	emptyResetPasswordFields
} from './reset-password/index.js';

export type {
	ResetPasswordFields,
	ResetPasswordState,
	ResetPasswordAction,
	ResetPasswordStatus,
	ResetPasswordDependencies
} from './reset-password/index.js';

export {
	mfaChallengeReducer,
	createInitialMfaChallengeState,
	createMfaChallengeStore,
	mfaChallengeFormConfig,
	mfaCodeSchema,
	emptyMfaCodeFields
} from './mfa-challenge/index.js';

export type {
	MfaCodeFields,
	MfaChallengeState,
	MfaChallengeAction,
	MfaChallengeStatus,
	MfaChallengeDependencies
} from './mfa-challenge/index.js';

export {
	mfaEnrolmentReducer,
	createInitialMfaEnrolmentState,
	createMfaEnrolmentStore,
	mfaEnrolmentFormConfig
} from './mfa-enrolment/index.js';

export type {
	MfaEnrolmentState,
	MfaEnrolmentAction,
	MfaEnrolmentStatus,
	MfaEnrolmentDependencies
} from './mfa-enrolment/index.js';

export {
	createPendingOAuthStorage,
	createMemoryPendingOAuthStorage,
	normaliseReturnTo
} from './oauth-pending.js';

export type { OAuthProvider, PendingOAuth, PendingOAuthStorage } from './oauth-pending.js';

export {
	oauthStartReducer,
	createInitialOAuthStartState,
	createOAuthStartStore,
	createBrowserRedirect
} from './oauth-start/index.js';

export type {
	Redirect,
	OAuthStartState,
	OAuthStartAction,
	OAuthStartStatus,
	OAuthStartDependencies
} from './oauth-start/index.js';

export {
	oauthCallbackReducer,
	createInitialOAuthCallbackState,
	createOAuthCallbackStore,
	oauthParamsFromUrl
} from './oauth-callback/index.js';

export type {
	OAuthCallbackState,
	OAuthCallbackAction,
	OAuthCallbackStatus,
	OAuthCallbackParams,
	OAuthCallbackDependencies
} from './oauth-callback/index.js';
