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

/**
 * Strict bounds for scrypt parameters to prevent attacker-controlled resource exhaustion.
 *
 * - N must be a power of 2: 2 <= N <= 2**15 (32,768)
 * - r: 1 <= r <= 16
 * - p: 1 <= p <= 4
 * - Main buffer ceiling: 128 * N * r <= 16 MiB; Node maxmem hard limit 32 MiB
 * - Work ceiling: N * r * p <= 262,144
 */
const SCRYPT_LIMITS = {
	minN: 2,
	maxN: 32_768,
	minR: 1,
	maxR: 16,
	minP: 1,
	maxP: 4,
	maxMemoryBytes: 16 * 1024 * 1024,
	maxWork: 262_144
} as const;

interface ScryptParams {
	N: number;
	r: number;
	p: number;
}

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4})$/;
const DECIMAL_INT_PATTERN = /^[1-9]\d*$/;

function isCanonicalBase64(s: string): boolean {
	if (s.length === 0 || s.length % 4 !== 0) return false;
	return BASE64_PATTERN.test(s);
}

function derive(
	password: string,
	salt: Buffer,
	params: ScryptParams = { N, r: R, p: P },
	keyLength = KEY_LENGTH
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(password, salt, keyLength, { N: params.N, r: params.r, p: params.p, maxmem: SCRYPT_LIMITS.maxMemoryBytes * 2 }, (error, key) => {
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
 * Validates scrypt parameters against strict bounded memory/work ceilings,
 * rejects malformed encodings before derivation, and performs constant-time comparison.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	// Bound decoding work before processing persisted input.
	if (stored.length > 180) return false;
	const parts = stored.split('$');
	if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

	const [, nStr, rStr, pStr, saltPart, hashPart] = parts;
	if (!nStr || !rStr || !pStr || !saltPart || !hashPart) return false;

	if (
		!DECIMAL_INT_PATTERN.test(nStr) ||
		!DECIMAL_INT_PATTERN.test(rStr) ||
		!DECIMAL_INT_PATTERN.test(pStr)
	) {
		return false;
	}

	const costN = Number(nStr);
	const costR = Number(rStr);
	const costP = Number(pStr);

	if (
		!Number.isSafeInteger(costN) ||
		!Number.isSafeInteger(costR) ||
		!Number.isSafeInteger(costP)
	) {
		return false;
	}

	if (costN < SCRYPT_LIMITS.minN || costN > SCRYPT_LIMITS.maxN || (costN & (costN - 1)) !== 0) {
		return false;
	}
	if (costR < SCRYPT_LIMITS.minR || costR > SCRYPT_LIMITS.maxR) return false;
	if (costP < SCRYPT_LIMITS.minP || costP > SCRYPT_LIMITS.maxP) return false;
	if (128 * costN * costR > SCRYPT_LIMITS.maxMemoryBytes) return false;
	if (costN * costR * costP > SCRYPT_LIMITS.maxWork) return false;

	if (saltPart.length > 88 || hashPart.length !== 44) return false;
	if (!isCanonicalBase64(saltPart) || !isCanonicalBase64(hashPart)) return false;

	const salt = Buffer.from(saltPart, 'base64');
	const expected = Buffer.from(hashPart, 'base64');
	if (salt.length < 16 || salt.length > 64) return false;
	if (salt.toString('base64') !== saltPart || expected.toString('base64') !== hashPart) return false;
	if (expected.length !== KEY_LENGTH) return false;

	let actual: Buffer;
	try {
		actual = await derive(password, salt, { N: costN, r: costR, p: costP }, expected.length);
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
