/**
 * The session cookie, and the freshness window that sits on top of it.
 *
 * The cookie is the whole reason this server exists. The client never reads it,
 * cannot verify it, and signs out fail-closed *because* of that — none of which
 * any `fetch` stub can exercise.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

import { id } from './crypto.js';
import type { Account, Session, Store } from './store.js';

export const COOKIE = 'cs_session';

/**
 * The attributes.
 *
 * - **`Secure` is off by default, and a real deployment must turn it on.** The
 *   first version of this comment claimed a browser on `http://localhost`
 *   discards a `Secure` cookie; a mutation test disproved it — browsers treat
 *   `localhost` as a secure context and accept it. The reason to leave it off
 *   is narrower and still real: this fixture is served over plain http, and on
 *   *any host that is not localhost* a `Secure` cookie is silently dropped and
 *   every request comes back anonymous. `secureCookie: true` is the switch.
 * - **Never `Domain`.** `Domain=localhost` is a domain cookie for a dotless
 *   host, which several browsers reject outright.
 * - **`SameSite=Lax`, not `Strict`.** Lax is what lets the session ride the
 *   identity provider's top-level 302 back to the app. `Strict` breaks the
 *   OAuth flows for reasons that have nothing to do with the client.
 */
function attributes(secure: boolean) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		...(secure && { secure: true })
	} as const;
}

/** What a new session needs to know about time. */
export interface SessionWindows {
	/** Now, from the injected clock. */
	at: number;
	/**
	 * When a credential *of this account* was proven, or `0` for never.
	 *
	 * `0` is what makes `reauthentication_required` reachable with no test-only
	 * switch: magic-link and OAuth sign-ins mint sessions that way on purpose.
	 */
	authenticatedAt: number;
	idleMs: number;
	absoluteMs: number;
}

/**
 * Build the windows for a new session.
 *
 * `at` and `authenticatedAt` come from one clock read, so a proven session
 * cannot have them a millisecond apart — which would be invisible in every test
 * and confusing in exactly one.
 *
 * `proven: false` leaves `authenticatedAt` at `0`, which is how magic-link and
 * OAuth sign-ins make `reauthentication_required` reachable without a
 * test-only switch.
 */
export function sessionWindows(
	clock: { now: () => number; idleMs: number; absoluteMs: number },
	proven: boolean
): SessionWindows {
	const at = clock.now();
	return { at, authenticatedAt: proven ? at : 0, idleMs: clock.idleMs, absoluteMs: clock.absoluteMs };
}

/**
 * Start a session.
 *
 * The tail is an options object rather than more positional arguments so that
 * adding the windows was a compile error at all eight call sites instead of a
 * boolean quietly landing in the wrong slot.
 *
 * **No `maxAge` on the cookie.** Lifetime lives in the `Session` record, which
 * the server can shorten or revoke; a cookie expiry only tells the browser when
 * to stop sending it and can be edited by anyone holding it.
 */
export function establish(
	reply: FastifyReply,
	store: Store,
	accountId: string,
	windows: SessionWindows,
	secure = false
): Session {
	const session: Session = {
		id: id(24),
		accountId,
		authenticatedAt: windows.authenticatedAt,
		startedAt: windows.at,
		idleExpiresAt: windows.at + windows.idleMs,
		absoluteExpiresAt: windows.at + windows.absoluteMs
	};
	// The idle window can never start beyond the cap — a one-day idle window on
	// a one-hour cap is a one-hour session.
	session.idleExpiresAt = Math.min(session.idleExpiresAt, session.absoluteExpiresAt);
	store.sessions.set(session.id, session);
	void reply.setCookie(COOKIE, session.id, attributes(secure));
	return session;
}

/**
 * Restart the idle clock on a live session.
 *
 * **This must never touch `authenticatedAt`.** That field is the sudo-mode
 * window — see `proveCredential` below. A sliding session that also slid the
 * freshness window would hold sudo mode open forever and six sensitive
 * endpoints would stop demanding re-authentication. That is privilege
 * escalation, not a UX regression, and `tests/session-lifetime.test.ts` pins it.
 *
 * Never past the absolute cap: an idle window that could push the cap is not a
 * cap.
 */
export function extendIdleWindow(session: Session, idleMs: number, now: number): void {
	session.idleExpiresAt = Math.min(now + idleMs, session.absoluteExpiresAt);
}

export function clear(
	reply: FastifyReply,
	store: Store,
	session: Session | null,
	secure = false
): void {
	if (session !== null) store.sessions.delete(session.id);
	void reply.clearCookie(COOKIE, attributes(secure));
}

/** The clock and windows every read needs, straight off `ServerContext`. */
export interface SessionClock {
	now: () => number;
	idleMs: number;
}

/**
 * The live session, or `null`.
 *
 * **Expiry and sliding both live here**, deliberately: a read and a slide that
 * lived apart would drift, and every authenticated route already funnels
 * through this one function — so all of them inherit correct expiry and answer
 * 401 `invalid_credentials` through `requireAccount` without knowing anything
 * about it. That is also the only failure the client's `refreshSession`
 * contract treats as "stop asking".
 *
 * The dead session is **deleted**, not merely refused, which is this fixture's
 * lazy-expiry rule: nothing here uses `setInterval`, so things expire when they
 * are read.
 */
export function currentSession(
	request: FastifyRequest,
	store: Store,
	clock: SessionClock
): Session | null {
	const sid = request.cookies[COOKIE];
	if (sid === undefined) return null;

	const session = store.sessions.get(sid);
	if (session === undefined) return null;

	const at = clock.now();
	if (at >= session.idleExpiresAt || at >= session.absoluteExpiresAt) {
		store.sessions.delete(session.id);
		return null;
	}

	// Any authenticated request is activity. `authenticatedAt` is untouched.
	extendIdleWindow(session, clock.idleMs, at);
	return session;
}

export function currentAccount(
	request: FastifyRequest,
	store: Store,
	clock: SessionClock
): { session: Session; account: Account } | null {
	const session = currentSession(request, store, clock);
	if (session === null) return null;
	const account = store.accounts.get(session.accountId);
	if (account === undefined) return null;
	return { session, account };
}

/**
 * What the backend will accept as proof, for this account.
 *
 * Computed rather than fixed, which is the point of the client carrying it: a
 * surface prompting for a password on an account that has none would be a dead
 * end, and the client cannot know which it is.
 */
export function proofMethods(account: Account): string[] {
	return [
		...(account.passwordHash !== null ? ['password'] : []),
		...(account.mfaEnabled ? ['totp', 'recovery_code'] : [])
	];
}

/**
 * Whether a sensitive operation needs the user to prove it is still them.
 *
 * Returns the methods to demand, or `null` to allow.
 *
 * **An account with nothing to prove with is allowed through.** Demanding proof
 * an account cannot give strands the user on a prompt with nothing to answer,
 * which is precisely what the client's `ReauthenticationRequiredError` warns
 * about. An OAuth-only account with no password and no authenticator is that
 * case.
 */
export function demandReauthentication(
	session: Session,
	account: Account,
	freshnessMs: number,
	now: number
): string[] | null {
	const methods = proofMethods(account);
	if (methods.length === 0) return null;

	// `freshnessMs > 0` first, so **zero means "never fresh"** rather than "fresh
	// for exactly this millisecond". Without it, `elapsed <= 0` is satisfiable
	// whenever a sign-in and the next call land in the same millisecond, and the
	// test that configures a zero window passes or fails on machine speed. It did
	// exactly that — green alone, red under a full-suite run.
	const fresh =
		freshnessMs > 0 &&
		session.authenticatedAt > 0 &&
		now - session.authenticatedAt <= freshnessMs;
	return fresh ? null : methods;
}

/**
 * Mark the live session as freshly proven — the sudo-mode window.
 *
 * This is how the client's recovery loop closes without a twenty-third
 * endpoint: prompt, sign in again with a password or a second factor, retry.
 * `password-login` and `mfa/verify` call it when the credential belongs to the
 * account already signed in, reusing that session rather than minting a second.
 *
 * **It was called `refresh`, and that name was a trap.** A session *refresh*
 * endpoint — extending how long a session lives — is a different thing entirely,
 * and it now exists one file away. Confusing the two is not a naming quibble: a
 * lifetime extension that also set `authenticatedAt` would hold sudo mode open
 * forever, and every operation behind `requireFresh` would stop demanding
 * proof. `extendIdleWindow` is the other one, and it must never touch this
 * field.
 */
export function proveCredential(session: Session, now: number): void {
	session.authenticatedAt = now;
}

/**
 * The wire shape the client's `decodeSessionSnapshot` requires.
 *
 * `expires_at` is **advisory**: a client that receives it can refresh before
 * the user hits a wall, and one that does not falls back to reacting to a 401.
 * An ISO 8601 **string**, never a number and never a `Date` —
 * `session/http.ts` refuses anything else, and a `Date` would survive
 * `JSON.stringify` as a string while the type went on claiming `Date`.
 *
 * It reports the **idle** window, which is the one that actually ends most
 * sessions. A client refreshing against it is extended up to the absolute cap
 * and no further.
 */
export function snapshot(
	account: Account,
	session: Session
): {
	subject_id: string;
	display_name: string;
	roles: string[];
	expires_at: string;
} {
	const name = account.email.split('@')[0] ?? account.email;
	return {
		subject_id: account.id,
		display_name: name.charAt(0).toUpperCase() + name.slice(1),
		roles: ['member'],
		expires_at: new Date(session.idleExpiresAt).toISOString()
	};
}
