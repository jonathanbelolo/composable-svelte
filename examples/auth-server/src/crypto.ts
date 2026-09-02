/**
 * The primitives, all from `node:crypto`.
 *
 * No hashing dependency, for a reason that is a hard constraint rather than a
 * preference: the repository root sets
 * `"pnpm": { "onlyBuiltDependencies": ["esbuild"] }`, so anything with a native
 * postinstall — `argon2`, `bcrypt` — would silently fail to build. scrypt is
 * stdlib, memory-hard, and needs no toolchain.
 *
 * TOTP is deliberately *not* here: it comes from `otpauth`, which also builds
 * the `otpauth://` URI the client's decoder requires, so that URI is well
 * formed by construction rather than by a hand-written template.
 */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Cost, turned down on purpose.
 *
 * Production would want `N = 2**15` or more. This is a test fixture that hashes
 * on nearly every request, and at 100 ms a login a sixty-test suite spends six
 * seconds proving nothing about hashing.
 *
 * `N = 2**12, r = 8` needs `128 * N * r` ≈ 4 MiB, comfortably under Node's
 * 32 MiB `maxmem` default — which `N = 2**15` exceeds, throwing
 * `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` rather than merely being slow.
 */
const N = 2 ** 12;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;

function derive(password: string, salt: Buffer): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(password, salt, KEY_LENGTH, { N, r: R, p: P }, (error, key) => {
			if (error) reject(error);
			else resolve(key);
		});
	});
}

/** `scrypt$N$r$p$salt$hash`, both tails base64. */
export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const key = await derive(password, salt);
	return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/**
 * Constant-time verify.
 *
 * Returns `false` rather than throwing for every malformed stored value: a
 * fixture whose seed data is wrong should fail the login it is asked about, not
 * crash the request with a 500 that reads as a server bug.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split('$');
	if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

	const saltPart = parts[4];
	const hashPart = parts[5];
	if (saltPart === undefined || hashPart === undefined) return false;

	const salt = Buffer.from(saltPart, 'base64');
	const expected = Buffer.from(hashPart, 'base64');

	let actual: Buffer;
	try {
		actual = await derive(password, salt);
	} catch {
		return false;
	}

	// `timingSafeEqual` throws on a length mismatch, which would leak the same
	// fact the comparison is trying not to leak — by way of a 500.
	if (actual.length !== expected.length) return false;
	return timingSafeEqual(actual, expected);
}

/**
 * An opaque identifier.
 *
 * base64url, so the value never needs percent-encoding wherever it ends up —
 * a cookie, a query string, a header. (`session.ts` uses `@fastify/cookie`,
 * which would encode for itself; this just means it never has to.)
 */
export function id(bytes = 18): string {
	return randomBytes(bytes).toString('base64url');
}

/** A single-use token: verification links, resets, magic links, OAuth codes. */
export function token(): string {
	return randomBytes(32).toString('base64url');
}

/**
 * Ten recovery codes.
 *
 * Ten because the client's decoder refuses an empty array — a surface showing
 * none would tell the user they were finished when they were not — and because
 * a test that regenerates needs to see the set actually change.
 */
export function recoveryCodes(count = 10): string[] {
	return Array.from({ length: count }, () => {
		const raw = randomBytes(5).toString('hex');
		return `${raw.slice(0, 5)}-${raw.slice(5)}`;
	});
}
