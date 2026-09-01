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

import type {
	AuthDependencies,
	LoginCredentials,
	MfaEnrolmentResult,
	MfaEnrolmentStart,
	MfaMethod,
	OAuthStart,
	SignupCredentials,
	SignupOutcome
} from '../deps.js';
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
	/**
	 * What a successful signup produces.
	 *
	 * `'session'` for a backend that signs the new account straight in,
	 * `'verificationRequired'` for one that sends a confirmation mail first.
	 * The latter is the default because it is the commoner and the more
	 * demanding branch — a demo that only ever shows the auto-login path never
	 * exercises the terminal panel.
	 */
	signupOutcome?: 'session' | 'verificationRequired' | undefined;
	/**
	 * Addresses that already have an account, rejected as `email_taken`.
	 *
	 * Signup's characteristic failure, and the one a demo most needs to reach.
	 */
	takenEmails?: readonly string[] | undefined;
	/**
	 * What confirming a link produces.
	 *
	 * `'none'` for a backend that verifies the address and still makes the user
	 * sign in, `'session'` for one that signs them in as part of confirming.
	 * `'none'` by default, because it is the branch a surface has more to do
	 * about.
	 */
	verifyOutcome?: 'none' | 'session' | undefined;
	/**
	 * Tokens that are stale or malformed, rejected as `token_expired`.
	 *
	 * The failure an email-verification surface exists to handle — a link opened
	 * a week late is the ordinary case, not the exceptional one.
	 */
	expiredTokens?: readonly string[] | undefined;
	/**
	 * What completing a password reset produces.
	 *
	 * `'none'` by default: most backends make the user sign in with the new
	 * password, and it is the branch a surface has more to do about.
	 */
	resetOutcome?: 'none' | 'session' | undefined;
	/**
	 * Reset tokens that are stale or already used, rejected as `token_expired`.
	 *
	 * Separate from {@link MockAuthOptions.expiredTokens} so a demo can have a
	 * live verification link and a dead reset link at once.
	 */
	expiredResetTokens?: readonly string[] | undefined;
	/**
	 * Codes the fake accepts for a challenge or an enrolment.
	 *
	 * `['123456']` by default, so a demo has something to type. Anything else is
	 * rejected as `invalid_credentials` — which is what lets a demo show the
	 * wrong-code branch without a toggle.
	 */
	validCodes?: readonly string[] | undefined;
	/** Challenge ids the fake treats as expired or already spent. */
	expiredChallengeIds?: readonly string[] | undefined;
	/** What `confirmMfaEnrolment` hands back. Shown once, so a demo needs some. */
	recoveryCodes?: readonly string[] | undefined;
	/** Providers the fake offers. Anything else is rejected as `unknown`. */
	oauthProviders?: readonly string[] | undefined;
	/**
	 * Where `beginOAuth` says to send the browser.
	 *
	 * A real `https:` URL by default, because the adapter refuses anything that
	 * is not `http(s):` and a fake that returns something the real decoder would
	 * reject teaches a demo nothing.
	 */
	oauthAuthorizeUrl?: string | undefined;
	/** The nonce `beginOAuth` mints. Fixed, so a test can assert the round trip. */
	oauthState?: string | undefined;
	/** Codes `completeOAuth` accepts. Anything else is `token_expired`. */
	oauthCodes?: readonly string[] | undefined;
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
	const {
		session = defaultSession,
		failWith,
		latencyMs = 0,
		accepts,
		signupOutcome = 'verificationRequired',
		takenEmails = [],
		verifyOutcome = 'none',
		expiredTokens = [],
		resetOutcome = 'none',
		expiredResetTokens = [],
		validCodes = ['123456'],
		expiredChallengeIds = [],
		recoveryCodes = [
			'8fj2-kd91-0aab',
			'ptr4-99xz-1mn2',
			'qq07-4wse-vv31',
			'z1k8-3ldp-77ac',
			'mn5b-6yth-0092'
		],
		oauthProviders = ['google', 'github'],
		oauthAuthorizeUrl = 'https://provider.example/authorize?client_id=demo&response_type=code',
		oauthState = 'st_demo',
		oauthCodes = ['code_demo']
	} = options;

	const rejectWrongCode = (): never => {
		throw {
			code: 'invalid_credentials',
			message: 'That code is not right. Check your authenticator app and try again.'
		} satisfies AuthError;
	};

	const aborted = () => new DOMException('Aborted', 'AbortError');

	const wait = (signal?: AbortSignal) =>
		new Promise<void>((resolve, reject) => {
			// Checked before the latency branch, not inside it. Honouring the signal
			// only when `latencyMs > 0` left cancellation untestable at the default
			// setting: a fake that ignores an already-aborted signal reports a
			// cancelled request as a successful one, which is the inverse of the bug
			// it exists to catch.
			if (signal?.aborted) {
				reject(aborted());
				return;
			}
			if (latencyMs === 0) {
				resolve();
				return;
			}
			const onAbort = () => {
				clearTimeout(timer);
				reject(aborted());
			};
			const timer = setTimeout(() => {
				signal?.removeEventListener('abort', onAbort);
				resolve();
			}, latencyMs);
			// The flow cancels by re-registering its effect id; without this a
			// superseded sign-in goes on pretending to work.
			signal?.addEventListener('abort', onAbort, { once: true });
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

		async signup(credentials: SignupCredentials, signal?: AbortSignal): Promise<SignupOutcome> {
			await wait(signal);

			if (failWith) throw failWith;

			if (takenEmails.includes(credentials.email)) {
				throw {
					code: 'email_taken',
					message: 'An account already exists for that address.',
					email: credentials.email
				} satisfies AuthError;
			}

			return signupOutcome === 'session'
				? { kind: 'session', session }
				: { kind: 'verificationRequired', email: credentials.email };
		},

		async verifyEmail(token: string, signal?: AbortSignal): Promise<SessionSnapshot | null> {
			await wait(signal);

			if (failWith) throw failWith;

			if (expiredTokens.includes(token)) {
				throw {
					code: 'token_expired',
					message: 'That link is no longer valid.'
				} satisfies AuthError;
			}

			return verifyOutcome === 'session' ? session : null;
		},

		async verifyMfaChallenge(
			challengeId: string,
			code: string,
			_method: MfaMethod,
			signal?: AbortSignal
		): Promise<SessionSnapshot> {
			await wait(signal);

			if (failWith) throw failWith;

			if (expiredChallengeIds.includes(challengeId)) {
				throw {
					code: 'token_expired',
					message: 'That sign-in attempt has expired. Start again.'
				} satisfies AuthError;
			}
			if (!validCodes.includes(code)) rejectWrongCode();

			return session;
		},

		async beginMfaEnrolment(signal?: AbortSignal): Promise<MfaEnrolmentStart> {
			await wait(signal);
			if (failWith) throw failWith;

			return {
				enrolmentId: 'enr_demo',
				secret: 'JBSWY3DPEHPK3PXP',
				// A real `otpauth://` URI, so a scanned QR in a demo actually works.
				otpauthUri:
					'otpauth://totp/Example:ada@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example&algorithm=SHA1&digits=6&period=30'
			};
		},

		async beginOAuth(provider: string, signal?: AbortSignal): Promise<OAuthStart> {
			await wait(signal);

			if (failWith) throw failWith;

			if (!oauthProviders.includes(provider)) {
				throw {
					code: 'unknown',
					message: `No sign-in is configured for ${provider}.`
				} satisfies AuthError;
			}

			// The provider is carried in the URL so a demo can see which button it
			// pressed, and so a test asserting the round trip has something to
			// distinguish two starts by.
			return {
				authorizeUrl: `${oauthAuthorizeUrl}&provider=${encodeURIComponent(provider)}&state=${encodeURIComponent(oauthState)}`,
				state: oauthState
			};
		},

		async completeOAuth(
			provider: string,
			code: string,
			state: string,
			signal?: AbortSignal
		): Promise<SessionSnapshot> {
			await wait(signal);

			if (failWith) throw failWith;

			if (!oauthProviders.includes(provider)) {
				throw {
					code: 'unknown',
					message: `No sign-in is configured for ${provider}.`
				} satisfies AuthError;
			}
			// The backend's own check, which is the one that counts. The client
			// compares too, but a fake that skipped this would let a test that
			// broke the client-side gate still pass.
			if (state !== oauthState) {
				throw {
					code: 'oauth_state_mismatch',
					message: 'That sign-in could not be verified. Start again.'
				} satisfies AuthError;
			}
			if (!oauthCodes.includes(code)) {
				throw {
					code: 'token_expired',
					message: 'That sign-in has expired or been used already.'
				} satisfies AuthError;
			}

			return session;
		},

		async confirmMfaEnrolment(
			_enrolmentId: string,
			code: string,
			signal?: AbortSignal
		): Promise<MfaEnrolmentResult> {
			await wait(signal);

			if (failWith) throw failWith;
			if (!validCodes.includes(code)) rejectWrongCode();

			return { recoveryCodes };
		},

		async requestPasswordReset(_email: string, signal?: AbortSignal): Promise<void> {
			await wait(signal);
			if (failWith) throw failWith;
			// Resolves for every address, known or not. A fake that rejected for
			// unknown ones would let a surface be built on an oracle and pass its
			// tests.
		},

		async resetPassword(
			token: string,
			_password: string,
			signal?: AbortSignal
		): Promise<SessionSnapshot | null> {
			await wait(signal);

			if (failWith) throw failWith;

			if (expiredResetTokens.includes(token)) {
				throw {
					code: 'token_expired',
					message: 'That reset link is no longer valid.'
				} satisfies AuthError;
			}

			return resetOutcome === 'session' ? session : null;
		},

		async resendVerification(_email: string, signal?: AbortSignal): Promise<void> {
			await wait(signal);
			if (failWith) throw failWith;
			// Resolves regardless of whether the address has an account: answering
			// differently would be an account-existence oracle.
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
