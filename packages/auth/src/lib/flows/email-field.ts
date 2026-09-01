/**
 * The email field every schema in this package uses.
 *
 * Shared as a builder rather than as a single instance, for the reason
 * `passwordField()` gives: Zod schemas are immutable, but a shared instance
 * would still invite a check being chained on at one call site and silently
 * diverging from the others.
 *
 * **`.trim()` is defence, not the main event, and it is worth being accurate
 * about which.** Every component in this package renders its email field as
 * `<input type="email">`, and the HTML value-sanitization algorithm already
 * strips leading and trailing whitespace there — measured in a real browser, not
 * assumed. So a user pasting `"  ada@example.com  "` into `LoginForm` never had
 * a problem.
 *
 * What the trim covers is everything else: a consumer — or a generated flow —
 * rendering `type="text"`, a value arriving from a URL or a prefill rather than
 * a keystroke, and the headless reducers, which are a supported entry point and
 * have no input element in front of them at all. It also makes the schema say
 * what the field is, instead of relying on a browser behaviour that is true of
 * exactly one input type.
 *
 * Because core's form reducer writes the schema's output back into `state.data`
 * at submit-time validation, the trimmed value is what the backend receives;
 * nothing downstream has to remember to trim again.
 *
 * Ordering makes an all-whitespace entry produce *both* issues — required, and
 * not an address — and which one is shown depends on the path: per-field
 * validation takes the first, whole-form validation takes the last. That
 * inconsistency is core's, is older than this, and is recorded in the hardening
 * backlog rather than papered over here. Either message refuses the value,
 * which is what matters.
 *
 * **Passwords deliberately have no equivalent.** Leading and trailing whitespace
 * is legitimate password content, and trimming would silently change what gets
 * hashed. Trimming `password` but not `confirmPassword` — or either alone —
 * would also produce a spurious "Passwords do not match" from the cross-field
 * refinement. If a later sweep adds `.trim()` to strings in bulk, these are the
 * ones it must skip.
 */

import { z } from 'zod';

export function emailField(): z.ZodString {
	return z.string().trim().min(1, 'Email is required').email('Enter a valid email address');
}
