/**
 * What a second-factor form validates: that something was typed.
 *
 * **Deliberately lax**, for the same reason sign-in does not enforce password
 * complexity. TOTP codes are usually six digits and sometimes eight; recovery
 * codes are a different shape entirely, and a backend may format them with
 * dashes, letters, or neither. A schema that insisted on `/^\d{6}$/` would
 * reject valid backends and would have to be relaxed the first time one
 * appeared.
 *
 * Length belongs in the input as a hint — `inputmode`, `maxlength`,
 * `autocomplete="one-time-code"` — not in a rule that refuses to send.
 *
 * The `.trim()` here both rejects all-whitespace and cleans what gets sent:
 * core's form reducer writes the schema's output back into `state.data` at
 * submit-time validation, so the reducers read an already-trimmed code. A code
 * pasted from a mail client arrives with whitespace more often than not, and
 * "that code is not right" for a trailing space is a miserable thing to debug.
 */

import { z } from 'zod';

export const mfaCodeSchema = z.object({
	code: z
		.string()
		.trim()
		.min(1, 'Enter the code')
});

export type MfaCodeFields = z.infer<typeof mfaCodeSchema>;

export const emptyMfaCodeFields: MfaCodeFields = { code: '' };
