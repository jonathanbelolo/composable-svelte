/**
 * What a signup form validates, and the criteria a user is shown while typing.
 *
 * **The password policy is length, and nothing else.** No "must contain a
 * number", no symbol requirement. That is NIST 800-63B's guidance and it is not
 * arbitrary: composition rules push people toward `Passw0rd!` — predictable
 * substitutions on a short base — while a longer passphrase they can remember
 * is stronger and easier. Rules the user has to satisfy are also rules the user
 * routes around.
 *
 * A maximum exists because there has to be one, and 128 is far past any real
 * passphrase while stopping a megabyte of input reaching the hashing function.
 *
 * The criteria list below is derived from the same constants the schema uses,
 * so the checklist and the error message cannot disagree — a test asserts the
 * two agree on every sample it is given.
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

export const signupSchema = z
	.object({
		email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
		password: z
			.string()
			.min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
			.max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`),
		confirmPassword: z.string().min(1, 'Confirm your password')
	})
	// `path` matters: without it the message lands in `formErrors`, which no
	// component renders, and the mismatch would be invisible.
	.refine((data) => data.password === data.confirmPassword, {
		message: 'Passwords do not match',
		path: ['confirmPassword']
	});

export type SignupFields = z.infer<typeof signupSchema>;

/** Empty form. Exported so a caller can seed it — an invited address, say. */
export const emptySignupFields: SignupFields = {
	email: '',
	password: '',
	confirmPassword: ''
};
