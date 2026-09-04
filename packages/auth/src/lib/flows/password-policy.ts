/**
 * What makes a password acceptable, and how that is shown to a user.
 *
 * Its own module because **two flows enforce it** — signup and password reset —
 * and a reset flow has no business importing from signup. The coupling was
 * visible before the second consumer existed: `PasswordCriteria.svelte`, a
 * component about passwords in general, reached into `flows/signup/schema.ts`
 * to evaluate them.
 *
 * **The policy is length, and nothing else.** No "must contain a number", no
 * symbol requirement. That is NIST 800-63B's guidance and it is not arbitrary:
 * composition rules push people toward `Passw0rd!` — predictable substitutions
 * on a short base — while a longer passphrase is stronger and easier to
 * remember. Rules a user has to satisfy are also rules a user routes around.
 *
 * A maximum exists because there has to be one, and 128 is far past any real
 * passphrase while stopping a megabyte of input reaching the hashing function.
 *
 * Every schema that takes a password builds its field from {@link passwordField}
 * rather than restating the rules, and the criteria below are derived from the
 * same constants — so a checklist cannot tell a user they are done while
 * validation disagrees. A test asserts the two agree on every sample, for both
 * schemas.
 */

import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * One requirement, phrased for a user and testable against a string.
 *
 * `met` takes the raw value rather than a parse result because the checklist
 * updates on every keystroke, while validation deliberately does not.
 */
export interface PasswordCriterion {
	/** Stable identity, for keying a list and for tests. */
	id: string;
	/** Shown to the user. Phrased as the requirement, not as a failure. */
	label: string;
	met: (password: string) => boolean;
}

export const passwordCriteria: readonly PasswordCriterion[] = [
	{
		id: 'length',
		label: `At least ${PASSWORD_MIN_LENGTH} characters`,
		met: (password) => password.length >= PASSWORD_MIN_LENGTH
	},
	{
		id: 'maximum',
		// Present so the rule is visible before it is hit rather than after. It
		// starts satisfied, which is why the UI shows unmet criteria as neutral
		// rather than as errors.
		label: `No more than ${PASSWORD_MAX_LENGTH} characters`,
		met: (password) => password.length <= PASSWORD_MAX_LENGTH
	}
];

/** Every criterion, each with its current verdict. */
export function evaluatePasswordCriteria(
	password: string
): readonly { criterion: PasswordCriterion; met: boolean }[] {
	return passwordCriteria.map((criterion) => ({ criterion, met: criterion.met(password) }));
}

/** Whether the password satisfies every criterion shown to the user. */
export function meetsPasswordCriteria(password: string): boolean {
	return passwordCriteria.every((criterion) => criterion.met(password));
}

/**
 * The password field every schema in this package uses.
 *
 * Shared as a builder rather than as a single instance: Zod schemas are
 * immutable, but a shared instance would still invite `.min()` being chained on
 * at one call site and silently diverging from the criteria list.
 */
export function passwordField(): z.ZodString {
	return z
		.string()
		.min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
		.max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`);
}
