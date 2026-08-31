/**
 * What went wrong, in a form a flow can branch on.
 *
 * The session store used to carry `error: string | null`, built from
 * `error.message` — and `createHttpSessionDeps` discarded the response body on
 * every non-2xx, so the string was always something like `"Login failed (401)"`.
 * That is enough to show a user and useless for everything else: "your password
 * is wrong", "confirm your email first", "this account is locked", "you are
 * being rate limited" and "now enter your second factor" were indistinguishable,
 * and the last of those is not an error at all — it is the next step.
 *
 * So failures are a discriminated union. `code` is what a reducer branches on,
 * `message` is what a human reads, and the arms that carry more carry it in
 * typed fields rather than in prose a caller would have to parse back out.
 *
 * **`retryable` is deliberately absent.** Whether to offer a retry is a
 * judgement about the flow and the user, not a property of the failure — a
 * locked account is permanently unretryable, a rate limit is retryable after a
 * stated delay, and a network blip is retryable now. Each arm carries what is
 * needed to make that call at the call site.
 */

/** The wrong username or password. Deliberately does not say which. */
export interface InvalidCredentialsError {
	code: 'invalid_credentials';
	message: string;
}

/**
 * The credentials were right; a second factor is required.
 *
 * Not a failure in the user's terms — it is the login flow branching. The
 * `challengeId` is what the MFA step submits its code against, and it is the
 * reason this union exists at all: there was nowhere to put it before.
 */
export interface MfaRequiredError {
	code: 'mfa_required';
	message: string;
	challengeId: string;
	/** Which factors this account can satisfy the challenge with. */
	methods: readonly ('totp' | 'recovery_code')[];
}

/** The account exists but its email address has never been confirmed. */
export interface EmailUnverifiedError {
	code: 'email_unverified';
	message: string;
	/** Present when the backend says who to resend a verification mail to. */
	email?: string | undefined;
}

/** Locked by the backend — too many attempts, or an administrator. */
export interface AccountLockedError {
	code: 'account_locked';
	message: string;
	/** When the lock lifts, if the backend says. Absent means indefinite. */
	until?: Date | undefined;
}

/** Too many requests. `retryAfterSeconds` comes from `Retry-After` when sent. */
export interface RateLimitedError {
	code: 'rate_limited';
	message: string;
	retryAfterSeconds?: number | undefined;
}

/** A reset or verification link that has expired or been used already. */
export interface TokenExpiredError {
	code: 'token_expired';
	message: string;
}

/** The request never reached a verdict — offline, DNS, TLS, timeout, abort. */
export interface NetworkError {
	code: 'network';
	message: string;
}

/**
 * A failure that did not map to anything above.
 *
 * Carries `status` when there was an HTTP response, because "unknown" plus a
 * status code is a far better bug report than "unknown". Never fail *open* on
 * this: an unrecognised failure is still a failure.
 */
export interface UnknownAuthError {
	code: 'unknown';
	message: string;
	status?: number | undefined;
}

export type AuthError =
	| InvalidCredentialsError
	| MfaRequiredError
	| EmailUnverifiedError
	| AccountLockedError
	| RateLimitedError
	| TokenExpiredError
	| NetworkError
	| UnknownAuthError;

/** Every `code` the union carries, for exhaustive handling at a call site. */
export type AuthErrorCode = AuthError['code'];
