/**
 * The one decision behind `sessionEstablished`.
 *
 * Internal: not exported from `./index.ts` or the package barrel. It exists so
 * that `sessionReducer`'s `sessionEstablished` arm and the managed auth feature
 * (`../application/feature.ts`) share a single rule and the feature can read
 * the outcome as an explicit result, instead of inferring it from the session
 * status or from whether the returned state is a new object.
 */

import { subjectFromSession } from '../subject/helpers.js';
import type { SessionSnapshot } from '../subject/types.js';
import type { SessionState } from './types.js';

/** Why a handed-over session was refused. Today there is exactly one reason. */
export type SessionEstablishedRefusal = 'loggingOut';

/** The outcome of handing a flow's snapshot to the session, with the state that results. */
export type SessionEstablishedDecision =
	| { readonly kind: 'accepted'; readonly state: SessionState }
	| {
			readonly kind: 'refused';
			readonly state: SessionState;
			readonly reason: SessionEstablishedRefusal;
	  };

/**
 * Decide whether a flow's completed sign-in becomes the session.
 *
 * The handover from a flow that owns its own async: credentials login, an MFA
 * challenge, an OAuth callback, a magic link. No epoch guard, because this is
 * not effect feedback from the session — the flow is asserting a result it
 * already has.
 *
 * One status is refused. A sign-in resolving after the user has hit sign-out
 * would otherwise re-authenticate them, and `loggingOut` is the only window
 * where that is possible. Everything else yields, on the principle the
 * session's `login` arm already states: explicit user intent supersedes a
 * background resolve. A refusal returns `state` itself, unchanged.
 */
export function decideSessionEstablished(
	state: SessionState,
	session: SessionSnapshot
): SessionEstablishedDecision {
	if (state.status === 'loggingOut') {
		return { kind: 'refused', state, reason: 'loggingOut' };
	}
	return {
		kind: 'accepted',
		state: {
			status: 'authenticated',
			subject: subjectFromSession(session),
			error: null,
			epoch: state.epoch,
			// Advisory: absent means the backend states none.
			expiresAt: session.expires_at ?? null
		}
	};
}
