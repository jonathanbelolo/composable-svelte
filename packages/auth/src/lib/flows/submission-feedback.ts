/**
 * Whether a form action is the result of a submission the flow should act on.
 *
 * Every form-backed flow here starts its request on `submissionSucceeded`,
 * because core's `onSubmit` would flatten an `AuthError` to a string. That
 * makes the action the flow's trigger, and it must be one that completes a
 * submission actually in flight. Core refuses a stale stamped result — a
 * superseded `submissionId`, or one arriving when nothing is submitting, as
 * after a `formReset` or once the submission has already completed — by
 * returning its form state unchanged. An unstamped one core accepts in any
 * state, so this also requires that the form was submitting before it.
 *
 * Without both checks a flow sends whatever its fields hold now. It is the
 * check `loginReducer` and `mfaChallengeReducer` make inline; each flow adds
 * its own status or phase rules on top.
 *
 * Internal: not exported from the package.
 */

import type { FormAction, FormState } from '@composable-svelte/core/components/form';

export function completesSubmissionInFlight<T extends Record<string, unknown>>(
	before: FormState<T>,
	after: FormState<T>,
	action: FormAction<T>
): boolean {
	return action.type === 'submissionSucceeded' && after !== before && before.isSubmitting;
}
