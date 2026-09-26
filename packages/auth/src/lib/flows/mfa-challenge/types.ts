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
	/** @internal Form lifetime; only challenge/factor replacement retires it. */
	formGeneration?: number | undefined;
	form: FormState<MfaCodeFields>;
	status: MfaChallengeStatus;
	/**
	 * The challenge this is answering, from `mfa_required`.
	 *
	 * `null` (also normalized from an empty string) means the surface was reached without one — directly, or after a
	 * reload that lost it. A state to render, not an error to report: the only
	 * useful offer is to sign in again.
	 */
	challengeId: string | null;
	/** Which factors this account can satisfy the challenge with. Empty input lists
	 * normalize to the HTTP adapter's TOTP fallback. */
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
	/** @internal Opaque lifetime/request correlation token, not a retry count.
	 * Surfaces must not interpret or set it. Omitted legacy state starts at zero. */
	attempt?: number | undefined;
}

type MfaCorrelation = {
	/** @internal Preserve when forwarding framework-produced actions; do not author this token. */
	attempt?: number | undefined;
};

export type MfaChallengeAction =
	| ({ type: 'form'; action: FormAction<MfaCodeFields>;
		/** @internal Preserve the original child-form lifetime when forwarding. */
		generation?: number | undefined;
		/** @deprecated Legacy alias for generation, never verification request identity. */
		attempt?: number | undefined;
	})
	/** Explicitly replace the flow, even when the same challenge ID is supplied.
	 * Requests verification cancellation and resets code, local result/session, status and errors.
	 * Stale results are rejected. Legacy synchronous subscriber reentrancy can
	 * schedule an old request after cancellation; managed FIFO execution owns that ordering.
	 * Prop synchronization should deduplicate unchanged IDs (as MfaChallengeForm does).
	 * This does not revoke a session held by an application's session store. */
	| { type: 'challengeProvided'; challengeId: string; methods: readonly MfaMethod[] }
	/** Switch factor and begin a fresh local attempt, clearing code, result/session
	 * and errors and requesting verification cancellation (see challengeProvided). Selecting the current or an unadvertised factor is a no-op.
	 * A previous successful local result is cleared; external session state is untouched. */
	| { type: 'methodChosen'; method: MfaMethod }
	| ({ type: 'challengeSucceeded'; session: SessionSnapshot } & MfaCorrelation)
	| ({ type: 'challengeFailed'; error: AuthError } & MfaCorrelation)
	| { type: 'errorDismissed' }
	/** The user asked to begin the sign-in again. Input, not a result: the flow
	 * does not change. `createAuthFeature` retires the challenge and presents a
	 * fresh sign-in; a standalone surface calls its own `onStartOver` instead. */
	| { type: 'startOverRequested' };

export interface MfaChallengeDependencies {
	verifyMfaChallenge: AuthDependencies['verifyMfaChallenge'];
}
