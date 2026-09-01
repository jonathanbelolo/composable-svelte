/**
 * Satisfying a second factor.
 *
 * The step `mfa_required` has been pointing at since the `AuthError` union was
 * created. Until this flow existed, `challengeId` was validated on arrival,
 * carried through the login reducer, and then rendered as a sentence in a red
 * banner — the one field the union was built to carry, consumed by nothing.
 *
 * Shaped like `reset-password`: a form, plus an opaque id that came from
 * somewhere else. The id is not a form field — the user did not type it and
 * cannot correct it — so it lives on state.
 */

import type { FormAction, FormState } from '@composable-svelte/core/components/form';

import type { AuthError } from '../../errors/types.js';
import type { AuthDependencies, MfaMethod } from '../../deps.js';
import type { SessionSnapshot } from '../../subject/types.js';
import type { MfaCodeFields } from './schema.js';

export type MfaChallengeStatus = 'idle' | 'submitting' | 'succeeded';

export interface MfaChallengeState {
	form: FormState<MfaCodeFields>;
	status: MfaChallengeStatus;
	/**
	 * The challenge this is answering, from `mfa_required`.
	 *
	 * `null` means the surface was reached without one — directly, or after a
	 * reload that lost it. A state to render, not an error to report: the only
	 * useful offer is to sign in again.
	 */
	challengeId: string | null;
	/** Which factors this account can satisfy the challenge with. */
	methods: readonly MfaMethod[];
	/**
	 * The factor being used right now.
	 *
	 * Separate from `methods` because it changes: someone without their phone
	 * switches to a recovery code, and that is a different request, not a
	 * different-looking field.
	 */
	method: MfaMethod;
	error: AuthError | null;
	session: SessionSnapshot | null;
}

export type MfaChallengeAction =
	| { type: 'form'; action: FormAction<MfaCodeFields> }
	/** Hand the flow a challenge — from `LoginForm`'s `onMfaRequired`. */
	| { type: 'challengeProvided'; challengeId: string; methods: readonly MfaMethod[] }
	/** Switch factor. Clears the code, because it is not the same code. */
	| { type: 'methodChosen'; method: MfaMethod }
	| { type: 'challengeSucceeded'; session: SessionSnapshot }
	| { type: 'challengeFailed'; error: AuthError }
	| { type: 'errorDismissed' };

export interface MfaChallengeDependencies {
	verifyMfaChallenge: AuthDependencies['verifyMfaChallenge'];
}
