/**
 * Asking for a sign-in link.
 *
 * Structurally `forgot-password`, and deliberately so: both take one address,
 * both must resolve the same way whether or not an account exists, and both end
 * in a terminal "check your email" that names the address it went to.
 *
 * The other half is `magic-link-signin`, which runs in a different page load.
 */

import type { FormAction, FormState } from '@composable-svelte/core/components/form';

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies } from '../../deps.js';
import type { MagicLinkFields } from './schema.js';

export type MagicLinkRequestStatus = 'idle' | 'submitting' | 'sent';

export interface MagicLinkRequestState {
	form: FormState<MagicLinkFields>;
	status: MagicLinkRequestStatus;
	error: AuthError | null;
	/**
	 * The address the last accepted request went to.
	 *
	 * Cleared at the start of every attempt, so a confirmation can never name an
	 * address from a previous one — the stale claim that sends someone to check
	 * the wrong inbox.
	 */
	requestedFor: string | null;
}

export type MagicLinkRequestAction =
	| { type: 'form'; action: FormAction<MagicLinkFields> }
	| { type: 'requestSent'; email: string }
	| { type: 'requestFailed'; error: AuthError }
	| { type: 'errorDismissed' };

export interface MagicLinkRequestDependencies {
	requestMagicLink: AuthDependencies['requestMagicLink'];
}
