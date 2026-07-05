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

// Components — thin store consumers (zero async)
export { AuthGuard, RoleGate } from './components/index.js';
