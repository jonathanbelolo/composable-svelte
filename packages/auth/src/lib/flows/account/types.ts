/**
 * The account behind the current session.
 *
 * A read model, not a form. It exists because `SessionSnapshot` deliberately
 * carries identity and nothing else, and every settings panel needs to know
 * something the session does not say — whether there is a password to change,
 * whether MFA is on, which providers are linked.
 *
 * Loads on entry, like `mfa-enrolment`, and carries that flow's two guards for
 * the same reason: an effect re-fires for reasons unrelated to its subject, and
 * a second load is a wasted round trip against an endpoint every settings page
 * hits on arrival.
 */

import type { AuthError } from '../../errors/types.js';
import type { AccountSnapshot, AuthDependencies } from '../../deps.js';

export type AccountStatus =
	/** Nothing asked for yet, or a failure to correct. */
	| 'idle'
	/** Reading. */
	| 'loading'
	/** `account` is populated. */
	| 'loaded';

export interface AccountState {
	status: AccountStatus;
	account: AccountSnapshot | null;
	error: AuthError | null;
}

export type AccountAction =
	/** Read the account. Dispatched on mount, once, by the surface. */
	| { type: 'accountRequested' }
	/**
	 * Read it again, whatever the status.
	 *
	 * Separate from `accountRequested` on purpose: that one is guarded so a
	 * re-firing mount effect cannot spend a second request, and this one is the
	 * deliberate refresh a panel asks for after changing something. Without it a
	 * successful password change would leave `hasPassword: false` on screen.
	 */
	| { type: 'reloadRequested' }
	| { type: 'accountLoaded'; account: AccountSnapshot }
	| { type: 'accountFailed'; error: AuthError }
	| { type: 'errorDismissed' };

export interface AccountDependencies {
	fetchAccount: AuthDependencies['fetchAccount'];
}
