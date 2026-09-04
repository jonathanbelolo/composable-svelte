/**
 * TOTP, from `otpauth`.
 *
 * A dependency rather than thirty lines of HMAC, for two reasons. The obvious
 * one is that this is security-adjacent code with a fiddly base32 step. The
 * better one is that `otpauth` also *builds* the `otpauth://` URI, so the
 * `otpauth_uri` the client decodes is well formed by construction rather than
 * by a hand-written template that nothing checks.
 *
 * The vector test in `tests/totp.test.ts` is what stops the enrolment tests
 * being a tautology: a test that generates a code with the same library the
 * server verifies with proves only that the library agrees with itself, so the
 * published RFC 6238 vectors are checked independently.
 */

import { Secret, TOTP } from 'otpauth';

const ISSUER = 'Composable Svelte';

function build(secretBase32: string, label: string): TOTP {
	return new TOTP({
		issuer: ISSUER,
		label,
		algorithm: 'SHA1',
		digits: 6,
		period: 30,
		secret: Secret.fromBase32(secretBase32)
	});
}

/** A fresh base32 secret for a new enrolment. */
export function newSecret(): string {
	return new Secret({ size: 20 }).base32;
}

/** What a QR code encodes, and what the client's decoder requires to be a string. */
export function otpauthUri(secretBase32: string, label: string): string {
	return build(secretBase32, label).toString();
}

/**
 * Whether `code` is currently valid for `secretBase32`.
 *
 * `window: 1` accepts the neighbouring steps, which is what every authenticator
 * does — without it a test that computes a code milliseconds before a period
 * boundary fails roughly one run in a thousand.
 */
export function verifyTotp(secretBase32: string, code: string, label = 'user'): boolean {
	return build(secretBase32, label).validate({ token: code, window: 1 }) !== null;
}

/**
 * Generate a code. `at` is a millisecond timestamp, defaulting to now.
 *
 * The parameter exists so `tests/totp.test.ts` can drive the published RFC 6238
 * vectors through this exact configuration — the same `SHA1`/6/30 the server
 * verifies with. Checking the library in the abstract would prove less.
 */
export function generateTotp(secretBase32: string, label = 'user', at?: number): string {
	const totp = build(secretBase32, label);
	return at === undefined ? totp.generate() : totp.generate({ timestamp: at });
}
