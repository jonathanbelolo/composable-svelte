/**
 * Managing an authenticator that is already on.
 *
 * Two operations over one flow — turn it off, and issue a fresh set of recovery
 * codes. Turning it *on* is `mfa-enrolment`, deliberately: enrolment collects a
 * code to prove the secret works, and neither of these does. There is nothing
 * to type here, so there is no form.
 *
 * Both are sensitive, and neither takes a password. The session cookie says who
 * is asking and the backend decides whether that is enough — the same contract
 * `change-password` established, and this is the second customer of the
 * `reauthentication_required` arm that came with it.
 */

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';

/** Which of the two. Carried so a refusal can be retried against the right one. */
export type MfaOperation = 'disable' | 'regenerate';

export type MfaManagementStatus =
	/** Nothing in flight. Also where a completed regeneration lands — see below. */
	| 'idle'
	| 'disabling'
	| 'regenerating'
	/**
	 * The authenticator is off.
	 *
	 * Terminal *for this flow's own operations* — turning it back on is
	 * `mfa-enrolment`, which needs a fresh secret and a fresh confirmation. But
	 * not terminal for the store: `mfaObserved` returns it to `idle` when the
	 * account reports an authenticator again.
	 *
	 * Without that it was a dead end a surface could reach and never leave. A
	 * panel that keeps one store across an enrolment — as the reference client
	 * does — went on saying "two-factor is off" for an account that had just
	 * turned it on, with two buttons whose dispatches the guards silently ate.
	 */
	| 'disabled';

/**
 * There is no `regenerated` status, and that is deliberate.
 *
 * It would say exactly what `recoveryCodes !== null` already says, and two
 * copies of one fact are what drift apart — the defect shape this package has
 * now found in a shared copy flag, a duplicated animation list and a claim
 * restated across five documents. After a regeneration the flow really is idle:
 * the codes are on screen, and either operation can be run again.
 */
export interface MfaManagementState {
	status: MfaManagementStatus;
	/**
	 * The freshly issued codes, shown once.
	 *
	 * `null` except immediately after a regeneration. **Cleared when another
	 * operation starts**, because a regeneration invalidates the set on screen
	 * and a disable invalidates every set there has ever been — leaving either
	 * on screen invites the user to save codes that will not work.
	 */
	recoveryCodes: readonly string[] | null;
	error: AuthError | null;
	/**
	 * Which operation `error` came from. `null` exactly when `error` is `null`.
	 *
	 * Every arm below sets or clears the two together, so the correspondence is
	 * maintained in one place rather than asserted here. It exists because a
	 * consumer routing to a re-authentication prompt has to know what to retry
	 * afterwards, and "whichever button they pressed" is not something a prompt
	 * on another screen can recover.
	 */
	operation: MfaOperation | null;
}

export type MfaManagementAction =
	| { type: 'disableRequested' }
	| { type: 'disableSucceeded' }
	| { type: 'disableFailed'; error: AuthError }
	| { type: 'regenerateRequested' }
	| { type: 'regenerateSucceeded'; recoveryCodes: readonly string[] }
	| { type: 'regenerateFailed'; error: AuthError }
	/**
	 * Stop showing the codes.
	 *
	 * Separate from `errorDismissed` because it is not a dismissal of anything
	 * wrong: it is the user saying they have saved them. A surface that offers it
	 * should say so, since the codes do not come back.
	 */
	| { type: 'recoveryCodesAcknowledged' }
	/**
	 * What the account currently reports. Dispatched by the surface whenever the
	 * read changes, so `disabled` cannot outlive the fact it recorded.
	 */
	| { type: 'mfaObserved'; enabled: boolean }
	| { type: 'errorDismissed' };

export interface MfaManagementDependencies {
	disableMfa: AuthDependencies['disableMfa'];
	regenerateRecoveryCodes: AuthDependencies['regenerateRecoveryCodes'];
}
