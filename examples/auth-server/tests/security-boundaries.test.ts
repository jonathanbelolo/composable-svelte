import { scrypt, randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { COOKIE, proofMethods, proveCredential } from '../src/session.js';
import { createServer, type Server } from '../src/server.js';
import { SEED } from '../src/store.js';
import { generateTotp } from '../src/totp.js';
import { hashPassword, verifyPassword } from '../src/crypto.js';

async function encodedHash(password: string, params: { N: number; r: number; p: number }): Promise<string> {
  const salt = randomBytes(16);
  const key = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 32, { ...params, maxmem: 32 * 1024 * 1024 }, (error, derived) => error ? reject(error) : resolve(derived));
  });
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

describe('B022-01: recovery code proof only when MFA enabled and codes remain', () => {
	let server: Server;
	let nowTime = Date.parse('2026-01-01T12:00:00.000Z');

	beforeEach(async () => {
		nowTime = Date.parse('2026-01-01T12:00:00.000Z');
		server = await createServer({ now: () => nowTime });
	});
	afterEach(async () => {
		await server.app.close();
	});

	it('omits recovery_code from proof methods when recoveryCodes list is exhausted', async () => {
		const ada = server.store.accounts.get(SEED.ada.id)!;
		ada.mfaEnabled = true;
		ada.recoveryCodes = [];

		expect(proofMethods(ada)).toEqual(['password', 'totp']);

		const sessionId = 'ada-stale-session-exhausted';
		server.store.sessions.set(sessionId, {
			id: sessionId,
			accountId: ada.id,
			authenticatedAt: 0,
			idleExpiresAt: nowTime + 60_000,
			absoluteExpiresAt: nowTime + 3600_000
		});

		const res = await server.app.inject({
			method: 'POST',
			url: '/auth/account/password',
			headers: { cookie: `${COOKIE}=${sessionId}` },
			payload: { password: 'new-secure-password-123' }
		});

		expect(res.statusCode).toBe(403);
		const body = res.json();
		expect(body.error.code).toBe('reauthentication_required');
		expect(body.error.methods).toContain('totp');
		expect(body.error.methods).not.toContain('recovery_code');
	});

	it('includes recovery_code when codes remain on an MFA-enabled account', async () => {
		const ada = server.store.accounts.get(SEED.ada.id)!;
		ada.mfaEnabled = true;
		ada.recoveryCodes = ['code-1111-2222'];

		expect(proofMethods(ada)).toEqual(['password', 'totp', 'recovery_code']);

		const sessionId = 'ada-stale-session-active-codes';
		server.store.sessions.set(sessionId, {
			id: sessionId,
			accountId: ada.id,
			authenticatedAt: 0,
			idleExpiresAt: nowTime + 60_000,
			absoluteExpiresAt: nowTime + 3600_000
		});

		const res = await server.app.inject({
			method: 'POST',
			url: '/auth/account/password',
			headers: { cookie: `${COOKIE}=${sessionId}` },
			payload: { password: 'new-secure-password-123' }
		});

		expect(res.statusCode).toBe(403);
		const body = res.json();
		expect(body.error.code).toBe('reauthentication_required');
		expect(body.error.methods).toContain('recovery_code');
	});
});

describe('B022-02: MFA re-enrolment and confirmation freshness', () => {
	let server: Server;
	let nowTime = Date.parse('2026-01-01T12:00:00.000Z');

	beforeEach(async () => {
		nowTime = Date.parse('2026-01-01T12:00:00.000Z');
		server = await createServer({ now: () => nowTime, freshnessMs: 300_000 });
	});
	afterEach(async () => {
		await server.app.close();
	});

	it('allows initial enrollment and confirmation on a stale session', async () => {
		const ada = server.store.accounts.get(SEED.ada.id)!;
		expect(ada.mfaEnabled).toBe(false);

		const sid = 'ada-initial-enrol-stale';
		server.store.sessions.set(sid, {
			id: sid,
			accountId: ada.id,
			authenticatedAt: 0,
			idleExpiresAt: nowTime + 60_000,
			absoluteExpiresAt: nowTime + 3600_000
		});

		const enrolRes = await server.app.inject({
			method: 'POST',
			url: '/auth/mfa/enrol',
			headers: { cookie: `${COOKIE}=${sid}` }
		});
		expect(enrolRes.statusCode).toBe(200);
		const { enrolment_id, secret } = enrolRes.json();

		const confirmRes = await server.app.inject({
			method: 'POST',
			url: '/auth/mfa/enrol/confirm',
			headers: { cookie: `${COOKIE}=${sid}` },
			payload: { enrolment_id, code: generateTotp(secret, ada.email) }
		});
		expect(confirmRes.statusCode).toBe(200);
		expect(ada.mfaEnabled).toBe(true);
	});

	it('requires freshness for reenrol and confirm when MFA is already enabled without burning setup', async () => {
		const turing = server.store.accounts.get(SEED.turing.id)!;
		expect(turing.mfaEnabled).toBe(true);

		const sid = 'turing-stale-session';
		const session = {
			id: sid,
			accountId: turing.id,
			authenticatedAt: 0,
			idleExpiresAt: nowTime + 60_000,
			absoluteExpiresAt: nowTime + 3600_000
		};
		server.store.sessions.set(sid, session);

		const staleEnrolRes = await server.app.inject({
			method: 'POST',
			url: '/auth/mfa/enrol',
			headers: { cookie: `${COOKIE}=${sid}` }
		});
		expect(staleEnrolRes.statusCode).toBe(403);
		expect(staleEnrolRes.json().error.code).toBe('reauthentication_required');

		proveCredential(session, nowTime);
		const freshEnrolRes = await server.app.inject({
			method: 'POST',
			url: '/auth/mfa/enrol',
			headers: { cookie: `${COOKIE}=${sid}` }
		});
		expect(freshEnrolRes.statusCode).toBe(200);
		const { enrolment_id, secret } = freshEnrolRes.json();

		session.authenticatedAt = nowTime - 400_000;
		const staleConfirmRes = await server.app.inject({
			method: 'POST',
			url: '/auth/mfa/enrol/confirm',
			headers: { cookie: `${COOKIE}=${sid}` },
			payload: { enrolment_id, code: generateTotp(secret, turing.email) }
		});
		expect(staleConfirmRes.statusCode).toBe(403);
		expect(staleConfirmRes.json().error.code).toBe('reauthentication_required');

		expect(server.store.enrolments.peek(enrolment_id)).not.toBeNull();

		proveCredential(session, nowTime);
		const freshConfirmRes = await server.app.inject({
			method: 'POST',
			url: '/auth/mfa/enrol/confirm',
			headers: { cookie: `${COOKIE}=${sid}` },
			payload: { enrolment_id, code: generateTotp(secret, turing.email) }
		});
		expect(freshConfirmRes.statusCode).toBe(200);
		expect(server.store.enrolments.peek(enrolment_id)).toBeNull();
	});

	it('enforces freshness when an enrollment created pre-enabled is confirmed after MFA enabled', async () => {
		const ada = server.store.accounts.get(SEED.ada.id)!;
		ada.mfaEnabled = false;

		const sid = 'ada-pre-enabled-enrol-session';
		const session = {
			id: sid,
			accountId: ada.id,
			authenticatedAt: 0,
			idleExpiresAt: nowTime + 60_000,
			absoluteExpiresAt: nowTime + 3600_000
		};
		server.store.sessions.set(sid, session);

		const enrolRes = await server.app.inject({
			method: 'POST',
			url: '/auth/mfa/enrol',
			headers: { cookie: `${COOKIE}=${sid}` }
		});
		const { enrolment_id, secret } = enrolRes.json();

		ada.mfaEnabled = true;
		ada.mfaSecret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

		const staleConfirmRes = await server.app.inject({
			method: 'POST',
			url: '/auth/mfa/enrol/confirm',
			headers: { cookie: `${COOKIE}=${sid}` },
			payload: { enrolment_id, code: generateTotp(secret, ada.email) }
		});
		expect(staleConfirmRes.statusCode).toBe(403);
		expect(server.store.enrolments.peek(enrolment_id)).not.toBeNull();

		proveCredential(session, nowTime);
		const freshConfirmRes = await server.app.inject({
			method: 'POST',
			url: '/auth/mfa/enrol/confirm',
			headers: { cookie: `${COOKIE}=${sid}` },
			payload: { enrolment_id, code: generateTotp(secret, ada.email) }
		});
		expect(freshConfirmRes.statusCode).toBe(200);
		expect(ada.mfaSecret).toBe(secret);
	});
});

describe('B022-03: logout revokes session even if account removed', () => {
	let server: Server;

	beforeEach(async () => {
		server = await createServer();
	});
	afterEach(async () => {
		await server.app.close();
	});

	it('removes the session from store on logout when account record is missing', async () => {
		const sid = 'orphaned-session-id';
		server.store.sessions.set(sid, {
			id: sid,
			accountId: 'non-existent-account-uuid',
			authenticatedAt: 0,
			idleExpiresAt: Date.now() + 60_000,
			absoluteExpiresAt: Date.now() + 3600_000
		});

		expect(server.store.accounts.has('non-existent-account-uuid')).toBe(false);
		expect(server.store.sessions.has(sid)).toBe(true);

		const res = await server.app.inject({
			method: 'POST',
			url: '/auth/logout',
			headers: { cookie: `${COOKIE}=${sid}` }
		});

		expect(res.statusCode).toBe(204);
		expect(server.store.sessions.has(sid)).toBe(false);
	});
});

describe('B022-04: password verification bounds, alternate costs, and malformed input', () => {
	it('verifies standard generated hashes and rejects wrong passwords', async () => {
		const hash = await hashPassword('correct-passphrase');
		await expect(verifyPassword('correct-passphrase', hash)).resolves.toBe(true);
		await expect(verifyPassword('wrong-passphrase', hash)).resolves.toBe(false);
	});

	it('honors supported alternate bounded cost parameters', async () => {
		const altHash8192 = await encodedHash('alternate-secret', { N: 8192, r: 8, p: 1 });
		expect(altHash8192.startsWith('scrypt$8192$8$1$')).toBe(true);
		await expect(verifyPassword('alternate-secret', altHash8192)).resolves.toBe(true);
		await expect(verifyPassword('wrong-secret', altHash8192)).resolves.toBe(false);

		const altHash2048 = await encodedHash('alternate-secret-2', { N: 2048, r: 4, p: 2 });
		expect(altHash2048.startsWith('scrypt$2048$4$2$')).toBe(true);
		await expect(verifyPassword('alternate-secret-2', altHash2048)).resolves.toBe(true);
	});

  it('rejects tampered cost fields even when the old fixed-cost key would match', async () => {
    const hash = await hashPassword('matching-key');
    for (const [index, value] of [[1, '4095'], [1, '04096'], [1, '65536'], [2, '0'], [2, '32'], [3, '16'], [3, '1e0']] as const) {
      const parts = hash.split('$'); parts[index] = value;
      await expect(verifyPassword('matching-key', parts.join('$')), `${index}=${value}`).resolves.toBe(false);
    }
  });

  it('rejects noncanonical base64 aliases of an otherwise matching stored key', async () => {
    const hash = await hashPassword('matching-key');
    const parts = hash.split('$');
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const salt = parts[4]!;
    // Sixteen-byte salt ends in ==; the final character has four unused pad bits.
    const last = alphabet.indexOf(salt[salt.length - 3]!);
    parts[4] = salt.slice(0, -3) + alphabet[last + 1] + '==';
    expect(Buffer.from(parts[4]!, 'base64')).toEqual(Buffer.from(salt, 'base64'));
    await expect(verifyPassword('matching-key', parts.join('$'))).resolves.toBe(false);
  });

	it('rejects malformed numbers, non-power-of-2, and invalid base64 before derive', async () => {
		await expect(verifyPassword('p', 'bcrypt$4096$8$1$salt$hash')).resolves.toBe(false);
		await expect(verifyPassword('p', 'scrypt$4096$8$1$salt')).resolves.toBe(false);
		await expect(verifyPassword('p', 'scrypt$0$8$1$c2FsdA==$aGFzaA==')).resolves.toBe(false);
		await expect(verifyPassword('p', 'scrypt$-4096$8$1$c2FsdA==$aGFzaA==')).resolves.toBe(false);
		await expect(verifyPassword('p', 'scrypt$4096.5$8$1$c2FsdA==$aGFzaA==')).resolves.toBe(false);
		await expect(verifyPassword('p', 'scrypt$4095$8$1$c2FsdA==$aGFzaA==')).resolves.toBe(false);
		await expect(verifyPassword('p', 'scrypt$4096$0$1$c2FsdA==$aGFzaA==')).resolves.toBe(false);
		await expect(verifyPassword('p', 'scrypt$4096$8$1$not-base64!$aGFzaA==')).resolves.toBe(false);
		await expect(verifyPassword('p', 'scrypt$4096$8$1$c2FsdA==$badpadding')).resolves.toBe(false);
	});

	it('rejects parameters exceeding strict memory or work ceilings', async () => {
		const validSalt = Buffer.alloc(16, 1).toString('base64');
		const validKey = Buffer.alloc(32, 2).toString('base64');

		const highN = `scrypt$65536$8$1$${validSalt}$${validKey}`;
		await expect(verifyPassword('p', highN)).resolves.toBe(false);

		const highMem = `scrypt$32768$16$1$${validSalt}$${validKey}`;
		await expect(verifyPassword('p', highMem)).resolves.toBe(false);

		const highWork = `scrypt$32768$8$2$${validSalt}$${validKey}`;
		await expect(verifyPassword('p', highWork)).resolves.toBe(false);
	});
});
