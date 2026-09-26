/**
 * Setting or changing the password on the signed-in account.
 *
 * The first flow in this package that *acts* on an authenticated subject rather
 * than establishing one. It takes no token and no current password: the session
 * cookie says who is asking, and the backend decides whether that is enough.
 *
 * It can still end in a session. Many backends rotate one on a password change,
 * to invalidate other devices — so `session` carries what came back, and the
 * component hands it over. `null` is a success too: the password changed and
 * this device kept its session.
 */

import type { FormAction, FormState } from '@composable-svelte/core/components/form';

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';
import type { SessionSnapshot } from '../../subject/types.js';
import type { ChangePasswordFields } from './schema.js';

export type ChangePasswordStatus = 'idle' | 'submitting' | 'changed';

export interface ChangePasswordState {
	form: FormState<ChangePasswordFields>;
	status: ChangePasswordStatus;
	error: AuthError | null;
	/**
	 * The rotated session, when the backend issued one.
	 *
	 * `null` with `status: 'changed'` is a success — the password is set and
	 * this device kept the session it had.
	 */
	session: SessionSnapshot | null;
	/**
	 * Which outcome the last reduction accepted, or `null`.
	 *
	 * A one-reduction output: set by the arm that accepts a change result
	 * while `submitting`, and cleared by every other action. `createAuthFeature`
	 * reports `changePasswordOutcome` from it.
	 */
	settled: 'changed' | 'failed' | null;
	/**
	 * Monotonically increasing count of successful password changes settled by
	 * this flow. Increments only when `changeSucceeded` settles an in-flight
	 * submission, enabling durable handoff tracking across component unmounts.
	 */
	completionCount: number;
}

export type ChangePasswordAction =
	| { type: 'form'; action: FormAction<ChangePasswordFields> }
	| { type: 'changeSucceeded'; session: SessionSnapshot | null }
	| { type: 'changeFailed'; error: AuthError }
	| { type: 'errorDismissed' };

export interface ChangePasswordDependencies {
	changePassword: AuthDependencies['changePassword'];
}
