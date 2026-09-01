/**
 * The auth I/O every flow runs over.
 *
 * `SessionDependencies` covers what the session machine itself needs — resolve,
 * seeded login, logout. The flows need more, and this is where it goes: each
 * member is injected, so a backend of any shape can satisfy it and a test can
 * replace it with `vi.fn()`.
 *
 * **Every member reports failure by rejecting with an {@link AuthError}.** That
 * is the contract that makes the union worth having: a dependency that throws a
 * bare `Error` still works — `toAuthError` wraps it as `unknown` — but nothing
 * downstream can then tell "wrong password" from "confirm your email first",
 * and an MFA challenge has nowhere to put its id. `createHttpAuthDeps` does the
 * classification for the Composable Rust shape; a hand-written adapter should
 * do the same.
 */

import type { AuthError } from './errors/types.js';
import type { SessionDependencies } from './session/types.js';
import type { SessionSnapshot } from './subject/types.js';

/** What a password sign-in submits. */
export interface LoginCredentials {
	email: string;
	password: string;
	/**
	 * Ask the backend for a longer-lived session.
	 *
	 * Advisory: session lifetime is the server's decision and this is a request,
	 * not an instruction. The client never sees the cookie and cannot verify the
	 * outcome.
	 */
	rememberMe?: boolean | undefined;
}

/** What a signup submits. */
export interface SignupCredentials {
	email: string;
	password: string;
}

/** Which factor a challenge is being satisfied with. */
export type MfaMethod = 'totp' | 'recovery_code';

/** What starting an enrolment produces. */
export interface MfaEnrolmentStart {
	enrolmentId: string;
	/** Base32, for someone typing it into an app by hand. */
	secret: string;
	/** `otpauth://totp/...`, for an authenticator to scan or open. */
	otpauthUri: string;
}

/**
 * What starting an OAuth sign-in produces.
 *
 * **`state` is minted by the backend, not here.** Every id in this package is —
 * `challengeId`, `enrolmentId`, both link tokens — and the party that holds the
 * client secret is the party that has to verify the nonce anyway. Minting it in
 * the browser would duplicate a mandatory server-side check and make this the
 * codebase's first use of Web Crypto for nothing.
 *
 * **Nothing secret may be added to this type.** A `codeVerifier` here would be a
 * secret living in `sessionStorage`, and the package's claim that the browser
 * never holds OAuth secrets would become false. PKCE belongs entirely to the
 * backend, which builds the authorize URL.
 */
export interface OAuthStart {
	/** Where to send the browser. The adapter refuses anything not `http(s):`. */
	authorizeUrl: string;
	/** The nonce to store now and compare against `?state=` on return. */
	state: string;
}

/** What finishing an enrolment produces. */
export interface MfaEnrolmentResult {
	/**
	 * Shown once, and never retrievable again.
	 *
	 * `readonly` because a surface has no business editing them, and the array
	 * is the whole of what the user must save before leaving the page.
	 */
	recoveryCodes: readonly string[];
}

/**
 * What a completed signup produced — and there are two answers, not one.
 *
 * A backend that requires email confirmation cannot return a session, and one
 * that does not should not force a second round trip. Modelling that as a union
 * rather than `SessionSnapshot | null` means a caller cannot read the happy
 * path and forget the other: there is no field to leave unchecked.
 */
export type SignupOutcome =
	| { kind: 'session'; session: SessionSnapshot }
	| { kind: 'verificationRequired'; email: string };

export interface AuthDependencies extends SessionDependencies {
	/**
	 * Sign in with an email and password.
	 *
	 * Resolves with the issued session. Rejects with an {@link AuthError} —
	 * `invalid_credentials` for a wrong password, `email_unverified` when the
	 * account exists but has never confirmed its address, `account_locked`,
	 * `rate_limited`, and `mfa_required` when the credentials were *correct* and
	 * a second factor is needed. That last one is not a failure in the user's
	 * terms; it carries the `challengeId` the MFA step submits against.
	 */
	login: (credentials: LoginCredentials, signal?: AbortSignal) => Promise<SessionSnapshot>;
	/**
	 * Create an account.
	 *
	 * Rejects with an {@link AuthError} like every other member. `email_taken` is
	 * the one this call adds — the address already has an account, and the useful
	 * response is an offer to sign in rather than a red banner.
	 */
	signup: (credentials: SignupCredentials, signal?: AbortSignal) => Promise<SignupOutcome>;
	/**
	 * Exchange a confirmation token for a verified address.
	 *
	 * Resolves with a session when the backend signs the account in as part of
	 * confirming it, and with `null` when it does not — the address is verified
	 * either way. A plain nullable rather than the union `signup` uses, because
	 * "no session" carries nothing here: there is no second thing to tell the
	 * caller, and a union would be ceremony around a null check the compiler
	 * already forces.
	 *
	 * Rejects with `token_expired` for a link that is stale *or* malformed. The
	 * two are not distinguished on purpose: the recovery is identical — send
	 * another — and naming which it was tells an attacker whether a token ever
	 * existed.
	 */
	verifyEmail: (token: string, signal?: AbortSignal) => Promise<SessionSnapshot | null>;
	/**
	 * Send another confirmation mail.
	 *
	 * Resolves whether or not the address has an unverified account, for the same
	 * reason a password reset does: answering differently is an account-existence
	 * oracle.
	 */
	resendVerification: (email: string, signal?: AbortSignal) => Promise<void>;
	/**
	 * Send a password-reset link.
	 *
	 * Resolves whether or not the address has an account — the same rule
	 * `resendVerification` follows, and the reason a surface says "if that
	 * address has an account, we sent a link" rather than confirming anything.
	 * A version that rejected for unknown addresses would be an account checker
	 * with a friendly face.
	 */
	requestPasswordReset: (email: string, signal?: AbortSignal) => Promise<void>;
	/**
	 * Satisfy a second-factor challenge.
	 *
	 * Returns a session, not a nullable one: completing the second factor *is*
	 * completing the sign-in, so there is no "verified but not signed in" case to
	 * model — unlike `verifyEmail`, where there genuinely is.
	 *
	 * Rejects with `invalid_credentials` for a wrong code and `token_expired` for
	 * a challenge that has expired or already been spent. Those are the two that
	 * differ in what a surface should do: retry, or start the sign-in again.
	 */
	verifyMfaChallenge: (
		challengeId: string,
		code: string,
		method: MfaMethod,
		signal?: AbortSignal
	) => Promise<SessionSnapshot>;
	/**
	 * Start enrolling an authenticator.
	 *
	 * `secret` is the shared secret in base32, for manual entry; `otpauthUri` is
	 * the `otpauth://totp/...` URI an authenticator app scans. This package
	 * renders neither as a QR code — see `MfaEnrolment`'s `qr` snippet.
	 *
	 * `enrolmentId` is explicit rather than session-bound so a backend that does
	 * not want to hold half-finished enrolment state on the session does not have
	 * to invent it. One that does can ignore the value it gets back.
	 */
	beginMfaEnrolment: (signal?: AbortSignal) => Promise<MfaEnrolmentStart>;
	/**
	 * Finish enrolling, by proving the authenticator works.
	 *
	 * The recovery codes come back here and **only** here: they are shown once,
	 * and a surface that loses them cannot ask for them again.
	 */
	confirmMfaEnrolment: (
		enrolmentId: string,
		code: string,
		signal?: AbortSignal
	) => Promise<MfaEnrolmentResult>;
	/**
	 * Start an OAuth sign-in, getting back somewhere to send the browser.
	 *
	 * Mirrors `beginMfaEnrolment`: the backend does the part that needs the
	 * secret, and hands back only what the browser must carry.
	 *
	 * **Takes no `returnTo`.** Where the app wants to land afterwards is
	 * client-side routing data; the `redirect_uri` is registered with the
	 * provider and the backend mints `state` without reference to it. Sending it
	 * would either do nothing or invite the backend to grow an open redirect.
	 *
	 * Rejects with an {@link AuthError} — `rate_limited` for a hammered start
	 * endpoint, `unknown` for a provider the backend does not offer.
	 */
	beginOAuth: (provider: string, signal?: AbortSignal) => Promise<OAuthStart>;
	/**
	 * Exchange an authorization code for a session.
	 *
	 * Returns a session rather than a nullable one, for `verifyMfaChallenge`'s
	 * reason: completing the callback *is* completing the sign-in.
	 *
	 * **`state` is passed so the backend can bind it to the exchange.** The
	 * client compares it too, but a client-side check is defence in depth and
	 * never the defence — an attacker who controls the callback URL controls the
	 * client's copy of both values.
	 *
	 * Rejects with `oauth_state_mismatch` when the backend's own check fails,
	 * `token_expired` for a spent or stale code, and `mfa_required` when the
	 * account needs a second factor even after the provider vouched for it.
	 */
	completeOAuth: (
		provider: string,
		code: string,
		state: string,
		signal?: AbortSignal
	) => Promise<SessionSnapshot>;
	/**
	 * Set a new password using a reset token.
	 *
	 * Resolves with a session when the backend signs the account in as part of
	 * the reset, and `null` when it does not — the password is changed either
	 * way. The same nullable as `verifyEmail`, and not `signup`'s union, because
	 * "no session" carries nothing extra here.
	 *
	 * Rejects with `token_expired` for a link that is stale, already used, or
	 * malformed. Not distinguished, for the reason `verifyEmail` documents.
	 */
	resetPassword: (
		token: string,
		password: string,
		signal?: AbortSignal
	) => Promise<SessionSnapshot | null>;
}

/**
 * The wire shape an adapter may send to say precisely what went wrong.
 *
 * Optional in both directions. A backend that sends nothing still gets sensible
 * classification from the status code alone; one that sends this gets precision
 * — and it is the only way `mfa_required` can carry its challenge, since a
 * status code cannot.
 *
 * Shaped as `{ error: { … } }` rather than a bare object so a body can carry
 * other things beside the failure without colliding.
 */
export interface AuthErrorBody {
	error?:
		| {
				code?: string | undefined;
				message?: string | undefined;
				/** For `mfa_required`. */
				challenge_id?: string | undefined;
				/** For `mfa_required`. Unknown methods are dropped, not trusted. */
				methods?: string[] | undefined;
				/** For `email_unverified`. */
				email?: string | undefined;
				/** For `account_locked`, ISO 8601. */
				locked_until?: string | undefined;
				/** For `oauth_denied`, when the backend saw which provider refused. */
				provider?: string | undefined;
				/** For `rate_limited`. The `Retry-After` header wins when both exist. */
				retry_after_seconds?: number | undefined;
		  }
		| undefined;
}

/** Re-exported so an adapter author has one import for the whole contract. */
export type { AuthError, SessionDependencies, SessionSnapshot };
