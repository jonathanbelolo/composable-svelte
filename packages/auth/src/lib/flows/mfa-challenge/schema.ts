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
 * The `.trim()` here decides only that all-whitespace is rejected. It does
 * **not** clean what gets sent: Zod transforms run during parsing, and core's
 * form reducer stores the raw value from `fieldChanged` without writing the
 * parsed result back. The reducers trim what they send, and a test pins it —
 * a code pasted from a mail client arrives with whitespace more often than not,
 * and "that code is not right" for a trailing space is a miserable thing to
 * debug.
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
