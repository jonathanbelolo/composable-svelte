/**
 * @composable-svelte/auth
 *
 * Client half of the identity substrate for Composable Svelte apps backed
 * by generated Composable Rust backends: a session store (all auth I/O in
 * store effects over injected deps), subject helpers mirroring the backend
 * `Subject` wire shape, and thin guard components.
 *
 * The session cookie is HttpOnly and server-owned — this package never
 * reads or writes cookies; it resolves the session endpoint instead.
 *
 * @packageDocumentation
 */

// Subject — wire-shape mirror of the backend invocation subject + helpers
export {
	anonymousSubject,
	subjectFromSession,
	subjectRoles,
	hasRole,
	hasAnyRole,
	type Subject,
	type AuthenticatedSubject,
	type AnonymousSubject,
	type SessionSnapshot
} from './subject/index.js';

// Errors — the structured failure union every flow branches on
export {
	toAuthError,
	isAuthError,
	isMfaRequired,
	retryDelaySeconds,
	type AuthError,
	type AuthErrorCode,
	type InvalidCredentialsError,
	type MfaRequiredError,
	type EmailUnverifiedError,
	type EmailTakenError,
	type AccountLockedError,
	type RateLimitedError,
	type TokenExpiredError,
	type NetworkError,
	type UnknownAuthError
} from './errors/index.js';

// Session — reducer, store factory, HTTP deps
export {
	sessionReducer,
	createInitialSessionState,
	createSessionStore,
	createHttpSessionDeps,
	MalformedSessionError,
	type SessionState,
	type SessionStatus,
	type SessionAction,
	type SessionDependencies
} from './session/index.js';

// Flows — headless sign-in, signup and the rest: reducer, types, schema
export {
	loginReducer,
	createInitialLoginState,
	createLoginStore,
	loginFormConfig,
	loginSchema,
	emptyLoginFields,
	type LoginFields,
	type LoginState,
	type LoginAction,
	type LoginStatus,
	type LoginDependencies
} from './flows/index.js';

export {
	signupReducer,
	createInitialSignupState,
	createSignupStore,
	signupFormConfig,
	signupSchema,
	emptySignupFields,
	passwordCriteria,
	evaluatePasswordCriteria,
	meetsPasswordCriteria,
	passwordField,
	PASSWORD_MIN_LENGTH,
	PASSWORD_MAX_LENGTH,
	type SignupFields,
	type PasswordCriterion,
	type SignupState,
	type SignupAction,
	type SignupStatus,
	type SignupDependencies
} from './flows/index.js';

export {
	forgotPasswordReducer,
	createInitialForgotPasswordState,
	createForgotPasswordStore,
	forgotPasswordFormConfig,
	forgotPasswordSchema,
	emptyForgotPasswordFields,
	type ForgotPasswordFields,
	type ForgotPasswordState,
	type ForgotPasswordAction,
	type ForgotPasswordStatus,
	type ForgotPasswordDependencies,
	resetPasswordReducer,
	createInitialResetPasswordState,
	createResetPasswordStore,
	resetPasswordFormConfig,
	resetPasswordSchema,
	emptyResetPasswordFields,
	type ResetPasswordFields,
	type ResetPasswordState,
	type ResetPasswordAction,
	type ResetPasswordStatus,
	type ResetPasswordDependencies
} from './flows/index.js';

export {
	emailVerificationReducer,
	createInitialEmailVerificationState,
	createEmailVerificationStore,
	tokenFromUrl,
	type EmailVerificationState,
	type EmailVerificationAction,
	type EmailVerificationStatus,
	type EmailVerificationDependencies,
	type ResendStatus
} from './flows/index.js';

// Dependencies — the injected auth I/O every flow runs over
export type {
	AuthDependencies,
	LoginCredentials,
	SignupCredentials,
	SignupOutcome,
	AuthErrorBody
} from './deps.js';

// HTTP — the Composable Rust adapter, beside `createHttpSessionDeps` above
export { createHttpAuthDeps, authErrorFromResponse } from './http/index.js';

// Components — thin store consumers (zero async)
export {
	AuthGuard,
	RoleGate,
	LoginForm,
	SignupForm,
	EmailVerification,
	ForgotPasswordForm,
	ResetPasswordForm,
	PasswordInput,
	PasswordCriteria
} from './components/index.js';

// Testing — a backend-shaped fake, so a demo or a test needs no server
export { createMockAuthDeps, type MockAuthOptions } from './testing/index.js';
