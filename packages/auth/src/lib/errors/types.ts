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

/**
 * Signing up with an address that already has an account.
 *
 * Signup's characteristic failure, and the reason this arm exists rather than
 * letting a 409 land on `unknown`: the useful response is not a red banner but
 * an offer — sign in instead, or reset the password. A surface cannot make that
 * offer by reading prose.
 *
 * **It leaks that the address is registered, and that is the caller's call to
 * make.** A backend that treats account existence as private should answer a
 * signup for a known address the same way it answers an unknown one, and send
 * mail explaining which happened; then this arm never arrives. A backend that
 * does not — most consumer products, where the address is already discoverable
 * by trying to sign in — gets a better flow by saying so.
 */
export interface EmailTakenError {
	code: 'email_taken';
	message: string;
	/** The address that is taken, when the backend names it. */
	email?: string | undefined;
}

/** Locked by the backend — too many attempts, or an administrator. */
export interface AccountLockedError {
	code: 'account_locked';
	message: string;
	/**
	 * When the lock lifts, as an ISO 8601 string. Absent means indefinite.
	 *
	 * A string rather than a `Date`, because this crosses SSR hydration and core
	 * serialises state with `JSON.stringify` (`ssr/serialize.ts`). A `Date`
	 * survives `structuredClone` and does *not* survive JSON — it arrives on the
	 * client as a string while the type still says `Date`, so
	 * `error.until.toISOString()` typechecks and throws. Every field in this
	 * union is a JSON primitive for that reason.
	 */
	until?: string | undefined;
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

/**
 * The user declined at the provider.
 *
 * Not a failure in the user's terms — it is the flow branching, the way
 * `mfa_required` is. Someone who pressed Cancel at Google has not broken
 * anything, and a red `role="alert"` telling them otherwise is both wrong and
 * alarming. `OAuthCallback` renders this as a `role="status"`.
 */
export interface OAuthDeniedError {
	code: 'oauth_denied';
	message: string;
	/** Which provider, when the pending record was still there to say. */
	provider?: string | undefined;
}

/**
 * The `state` returned by the provider could not be verified.
 *
 * Three routes reach it — no pending record, a missing `state`, or one that does
 * not match — and it **carries nothing to tell them apart**, deliberately.
 * Naming which it was tells an attacker whether a sign-in was in progress, the
 * same reasoning `verifyEmail` documents for not distinguishing a stale token
 * from a malformed one.
 *
 * It carries no nonce either. This crosses SSR hydration as JSON and lands in
 * whatever logs an app keeps; a CSRF nonce has no business in either.
 *
 * The wording a surface shows is deliberately calm. The identical branch is
 * reached by pressing Back onto a spent callback URL, which is nobody's attack,
 * and a security alarm that fires mostly on benign navigation stops being read.
 */
export interface OAuthStateMismatchError {
	code: 'oauth_state_mismatch';
	message: string;
}

export type AuthError =
	| InvalidCredentialsError
	| MfaRequiredError
	| EmailUnverifiedError
	| EmailTakenError
	| AccountLockedError
	| RateLimitedError
	| TokenExpiredError
	| OAuthDeniedError
	| OAuthStateMismatchError
	| NetworkError
	| UnknownAuthError;

/** Every `code` the union carries, for exhaustive handling at a call site. */
export type AuthErrorCode = AuthError['code'];
