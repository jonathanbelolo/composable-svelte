/**
 * The two checks every authenticated route starts with.
 *
 * Split out because getting either wrong is silent: a missing session answered
 * with the wrong status reads to the client as a different failure entirely,
 * and a re-authentication demand sent as a bare 403 is read as `unknown`.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

import { fail } from './errors.js';
import { currentAccount, demandReauthentication } from './session.js';
import type { Account, Session, Store } from './store.js';

export interface Authenticated {
	session: Session;
	account: Account;
}

/**
 * Require a session, or answer 401.
 *
 * 401 maps to `invalid_credentials` with no body needed, but the body is sent
 * anyway: every failure from this server names its code, so that none of them
 * depends on the status map staying as it is.
 */
export function requireAccount(
	request: FastifyRequest,
	reply: FastifyReply,
	store: Store
): Authenticated | null {
	const current = currentAccount(request, store);
	if (current === null) {
		void fail(reply, 401, 'invalid_credentials', 'You are not signed in.');
		return null;
	}
	return current;
}

/**
 * Require the session to be freshly proven, or demand re-authentication.
 *
 * **403 with an explicit body code.** `reauthentication_required` is one of the
 * six arms unreachable from any status — a bare 403 is read as `unknown`, which
 * would turn a routine step-up prompt into "something went wrong".
 */
export function requireFresh(
	reply: FastifyReply,
	current: Authenticated,
	freshnessMs: number
): boolean {
	const methods = demandReauthentication(current.session, current.account, freshnessMs);
	if (methods === null) return true;

	void fail(
		reply,
		403,
		'reauthentication_required',
		'Confirm it is still you before changing this.',
		{ methods }
	);
	return false;
}
