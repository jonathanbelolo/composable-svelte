/**
 * Fakes for demos and tests.
 *
 * `@composable-svelte/chat` ships `createMockStreamingChat`, which is why its
 * styleguide demo is three lines instead of forty. This is the equivalent: a
 * dependency object that behaves like a backend without one.
 *
 * The interesting part is the failures. Every auth failure is server-side, so a
 * demo or test that can only show the happy path shows almost nothing — and a
 * fake that rejects with a bare `Error` produces `code: 'unknown'`, which is
 * exactly the flattening the structured union exists to prevent. These reject
 * with real {@link AuthError} shapes.
 */

import type { AuthDependencies, LoginCredentials } from '../deps.js';
import type { AuthError } from '../errors/types.js';
import type { SessionSnapshot } from '../subject/types.js';

export interface MockAuthOptions {
	/** The session a successful sign-in returns. */
	session?: SessionSnapshot | undefined;
	/**
	 * Reject every sign-in with this instead of succeeding.
	 *
	 * Pass one of the `AuthError` shapes to exercise a branch:
	 * `{ code: 'invalid_credentials', message: '…' }` for the common case,
	 * `{ code: 'mfa_required', message: '…', challengeId: 'c1', methods: ['totp'] }`
	 * to reach the second-factor step.
	 */
	failWith?: AuthError | undefined;
	/**
	 * Milliseconds before resolving or rejecting.
	 *
	 * Zero by default so tests stay fast. A demo wants ~600 to make the pending
	 * state visible — an instant sign-in shows nothing of the loading behaviour.
	 */
	latencyMs?: number | undefined;
	/**
	 * Credentials that succeed, when `failWith` is not set.
	 *
	 * Given these, anything else is rejected as `invalid_credentials` — which is
	 * what lets a demo show both outcomes without a toggle.
	 */
	accepts?: { email: string; password: string } | undefined;
}

const defaultSession: SessionSnapshot = {
	subject_id: '00000000-0000-4000-8000-000000000001',
	display_name: 'Ada Lovelace',
	roles: ['member']
};

/**
 * Build auth dependencies backed by nothing.
 *
 * @example
 * ```ts
 * // Always succeeds.
 * const deps = createMockAuthDeps();
 *
 * // Succeeds only for one account, so a demo can show both outcomes.
 * const deps = createMockAuthDeps({
 *   accepts: { email: 'ada@example.com', password: 'correct-horse' },
 *   latencyMs: 600
 * });
 *
 * // Always reaches the second-factor branch.
 * const deps = createMockAuthDeps({
 *   failWith: { code: 'mfa_required', message: 'Enter your code.', challengeId: 'c1', methods: ['totp'] }
 * });
 * ```
 */
export function createMockAuthDeps(options: MockAuthOptions = {}): AuthDependencies {
	const { session = defaultSession, failWith, latencyMs = 0, accepts } = options;

	const wait = (signal?: AbortSignal) =>
		new Promise<void>((resolve, reject) => {
			if (latencyMs === 0) {
				resolve();
				return;
			}
			const timer = setTimeout(resolve, latencyMs);
			// Honouring the signal is what makes a superseded sign-in stop
			// pretending to work — the flow cancels by re-registering its effect id.
			signal?.addEventListener('abort', () => {
				clearTimeout(timer);
				reject(new DOMException('Aborted', 'AbortError'));
			});
		});

	return {
		async login(credentials: LoginCredentials, signal?: AbortSignal): Promise<SessionSnapshot> {
			await wait(signal);

			if (failWith) throw failWith;

			if (
				accepts &&
				(credentials.email !== accepts.email || credentials.password !== accepts.password)
			) {
				throw {
					code: 'invalid_credentials',
					message: 'That email and password do not match an account.'
				} satisfies AuthError;
			}

			return session;
		},

		async fetchLogin(_seededUserId: string, signal?: AbortSignal): Promise<SessionSnapshot> {
			await wait(signal);
			if (failWith) throw failWith;
			return session;
		},

		async fetchLogout(signal?: AbortSignal): Promise<void> {
			await wait(signal);
		},

		async fetchSession(signal?: AbortSignal): Promise<SessionSnapshot | null> {
			await wait(signal);
			// Anonymous by default: a demo or test that wants an authenticated
			// start dispatches `sessionEstablished` rather than having the resolve
			// silently sign someone in.
			return null;
		}
	};
}
