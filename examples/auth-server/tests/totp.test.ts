/**
 * The RFC 6238 vectors — the positive control for every MFA test that follows.
 *
 * Those tests generate a code with the same library the server verifies with,
 * which on its own proves only that the library agrees with itself. This is
 * what makes them mean something: the published vectors are independent of
 * both, so if the configuration drifts — a different algorithm, digit count or
 * period — this file goes red and the tautology is broken.
 *
 * Driven through `generateTotp`, not through `otpauth` directly, so it checks
 * the configuration the server actually uses.
 */

import { describe, expect, it } from 'vitest';

import { generateTotp, newSecret, verifyTotp } from '../src/totp.js';

/** RFC 6238 Appendix B: the ASCII key `12345678901234567890`, base32-encoded. */
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

/** `[unix seconds, the six-digit SHA-1 code]`, from the RFC's own table. */
const VECTORS: ReadonlyArray<readonly [number, string]> = [
	[59, '287082'],
	[1111111109, '081804'],
	[1111111111, '050471'],
	[1234567890, '005924'],
	[2000000000, '279037'],
	[20000000000, '353130']
];

describe('TOTP', () => {
	it('matches the published RFC 6238 vectors', () => {
		for (const [seconds, expected] of VECTORS) {
			expect(generateTotp(RFC_SECRET, 'user', seconds * 1000), `at t=${seconds}`).toBe(expected);
		}
	});

	it('is sensitive to the secret', () => {
		// The negative half. Without it, a `generateTotp` that ignored its secret
		// and returned a constant would pass the vectors for one input and look
		// fine.
		const other = generateTotp(newSecret(), 'user', 59 * 1000);
		expect(other).not.toBe('287082');
	});

	it('accepts a code it just generated, and rejects a wrong one', () => {
		const secret = newSecret();
		expect(verifyTotp(secret, generateTotp(secret))).toBe(true);
		expect(verifyTotp(secret, '000000')).toBe(false);
	});
});
