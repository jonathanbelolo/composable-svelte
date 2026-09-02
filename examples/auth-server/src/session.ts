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

/** Start a session. `authenticatedAt: 0` means "no credential of this account was proven". */
export function establish(
	reply: FastifyReply,
	store: Store,
	accountId: string,
	authenticatedAt: number,
	secure = false
): Session {
	const session: Session = { id: id(24), accountId, authenticatedAt };
	store.sessions.set(session.id, session);
	void reply.setCookie(COOKIE, session.id, attributes(secure));
	return session;
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

export function currentSession(request: FastifyRequest, store: Store): Session | null {
	const sid = request.cookies[COOKIE];
	if (sid === undefined) return null;
	return store.sessions.get(sid) ?? null;
}

export function currentAccount(
	request: FastifyRequest,
	store: Store
): { session: Session; account: Account } | null {
	const session = currentSession(request, store);
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
	freshnessMs: number
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
		Date.now() - session.authenticatedAt <= freshnessMs;
	return fresh ? null : methods;
}

/**
 * Mark the live session as freshly proven.
 *
 * This is how the client's recovery loop closes without a twenty-third
 * endpoint: prompt, sign in again with a password or a second factor, retry.
 * `password-login` and `mfa/verify` call it when the credential belongs to the
 * account already signed in, refreshing that session rather than minting a
 * second one.
 */
export function refresh(session: Session): void {
	session.authenticatedAt = Date.now();
}

/** The wire shape the client's `decodeSessionSnapshot` requires. */
export function snapshot(account: Account): {
	subject_id: string;
	display_name: string;
	roles: string[];
} {
	const name = account.email.split('@')[0] ?? account.email;
	return {
		subject_id: account.id,
		display_name: name.charAt(0).toUpperCase() + name.slice(1),
		roles: ['member']
	};
}
