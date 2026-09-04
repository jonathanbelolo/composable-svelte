/**
 * What asking for a sign-in link validates: an address, and nothing else.
 *
 * Its own schema rather than `forgot-password`'s, even though the rule is
 * identical. `mfa-enrolment` reuses `mfa-challenge`'s because `MfaCodeFields`
 * names the *shape* and reads correctly in both; `ForgotPasswordFields` names a
 * different flow, and a magic-link reducer whose form slice is typed
 * `FormState<ForgotPasswordFields>` reads as a copy-paste mistake at every call
 * site. Ten lines of Zod is the cheaper of the two costs.
 */

import { z } from 'zod';

import { emailField } from '../email-field.js';

export const magicLinkSchema = z.object({
	email: emailField()
});

export type MagicLinkFields = z.infer<typeof magicLinkSchema>;

export const emptyMagicLinkFields: MagicLinkFields = { email: '' };
