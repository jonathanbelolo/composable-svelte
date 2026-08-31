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

// Dependencies — the injected auth I/O every flow runs over
export type { AuthDependencies, LoginCredentials, AuthErrorBody } from './deps.js';

// Components — thin store consumers (zero async)
export { AuthGuard, RoleGate, LoginForm, PasswordInput } from './components/index.js';

// Testing — a backend-shaped fake, so a demo or a test needs no server
export { createMockAuthDeps, type MockAuthOptions } from './testing/index.js';
