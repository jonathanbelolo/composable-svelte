/**
 * All mutable state, behind a factory.
 *
 * `createStore()` is a factory and not a module-level `const accounts = new
 * Map()`, and that one decision is what makes test isolation free: a suite
 * builds a whole server per file, so there is nothing to reset between tests —
 * the state *is* the instance.
 *
 * **Nothing here uses `setInterval`.** Everything expiring expires lazily, when
 * it is read. A timer would keep Node's event loop alive after `app.close()`
 * and hang the test run — which is exactly the defect in core's own
 * `RateLimiter`, whose interval is never `unref()`'d and whose `destroy()` its
 * Fastify plugin never exposes.
 */

import { hashPassword, id, recoveryCodes } from './crypto.js';

export interface Account {
	id: string;
	email: string;
	emailVerified: boolean;
	/** `null` for an account that has never set one — OAuth and magic-link signups. */
	passwordHash: string | null;
	/** Base32. Present once enrolment has been confirmed at least once. */
	mfaSecret: string | null;
	mfaEnabled: boolean;
	/** Unused codes. Consumed on use, replaced wholesale on regeneration. */
	recoveryCodes: string[];
	providers: string[];
}

export interface Session {
	id: string;
	accountId: string;
	/**
	 * When a credential *of this account* was last proven.
	 *
	 * `0` means never — see `session.ts`. Magic-link and OAuth sign-ins mint
	 * sessions this way on purpose, which is what makes
	 * `reauthentication_required` reachable without any test-only switch.
	 */
	authenticatedAt: number;
}

export type TokenKind = 'verify-email' | 'reset-password' | 'magic-link';

export interface TokenRecord {
	accountId: string;
	kind: TokenKind;
	expiresAt: number;
}

export interface Challenge {
	accountId: string;
	expiresAt: number;
}

export interface Enrolment {
	accountId: string;
	/** Base32, not yet attached to the account — confirmation does that. */
	secret: string;
	expiresAt: number;
}

export interface OAuthStateRecord {
	provider: string;
	expiresAt: number;
}

export interface OAuthCodeRecord {
	/** The state the identity provider was handed, stamped into the code. */
	state: string;
	provider: string;
	email: string;
	/**
	 * Whether the *provider* claims the address is verified.
	 *
	 * Deliberately separate from `Account.emailVerified`: a provider asserting an
	 * address is not this server verifying it, and the gap between those two is
	 * what makes `hopper` — and the unlink refusal — a real case rather than a
	 * contrived one. See `canUnlink` in `routes/oauth.ts`.
	 */
	providerVerifiedEmail: boolean;
	expiresAt: number;
}

/** A map whose entries disappear when read after their expiry. */
interface Expiring<T extends { expiresAt: number }> {
	put(key: string, value: T): void;
	/** Reads without consuming. Returns `null` once expired, and drops the entry. */
	peek(key: string): T | null;
	/** Reads and removes — for anything single-use. */
	take(key: string): T | null;
	delete(key: string): void;
	clear(): void;
}

function expiring<T extends { expiresAt: number }>(): Expiring<T> {
	const held = new Map<string, T>();
	const live = (key: string): T | null => {
		const value = held.get(key);
		if (value === undefined) return null;
		if (value.expiresAt <= Date.now()) {
			held.delete(key);
			return null;
		}
		return value;
	};
	return {
		put: (key, value) => void held.set(key, value),
		peek: live,
		take: (key) => {
			const value = live(key);
			if (value !== null) held.delete(key);
			return value;
		},
		delete: (key) => void held.delete(key),
		clear: () => held.clear()
	};
}

/**
 * The seeded accounts.
 *
 * Fixed ids so `POST /auth/login` — the seeded dev sign-in, which takes a
 * `user_id` — has something to name, and so tests can assert on `subject_id`.
 *
 * The three unlink verdicts are all live here, and that is the point. See the
 * numbered rule above `canUnlink`.
 */
export const SEED = {
	/** Password, verified, two providers. Unlinking either is allowed. */
	ada: {
		id: '11111111-1111-4111-8111-111111111111',
		email: 'ada@example.com'
	},
	/**
	 * No password, one provider, **verified** address.
	 *
	 * Unlinking is **allowed**: a magic link reaches her. This is the case the
	 * client structurally cannot decide — the obvious client-side rule
	 * (`hasPassword || providers.length > 1`) would refuse it, wrongly.
	 */
	grace: {
		id: '22222222-2222-4222-8222-222222222222',
		email: 'grace@example.com'
	},
	/**
	 * No password, one provider, address **never verified** — it came from the
	 * provider's profile. Unlinking is **refused**; it would strand him.
	 */
	hopper: {
		id: '33333333-3333-4333-8333-333333333333',
		email: 'hopper@example.com'
	},
	/** Password plus an authenticator, so `mfa_required` is reachable at login. */
	turing: {
		id: '44444444-4444-4444-8444-444444444444',
		email: 'turing@example.com',
		/** The RFC 4648 base32 of `12345678901234567890` — the RFC 6238 test key. */
		mfaSecret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
	}
} as const;

export const SEED_PASSWORD = 'correct-horse-battery-staple';

/**
 * A link this server would have emailed.
 *
 * Modelled as an outbox rather than returned in the response, because returning
 * it would turn every request into an account-existence oracle — the exact
 * property `requestPasswordReset` and `requestMagicLink` are shaped to avoid. A
 * test reads this the way a real integration suite reads a mail catcher.
 */
export interface Sent {
	to: string;
	kind: TokenKind;
	token: string;
}

export interface Store {
	accounts: Map<string, Account>;
	/** Newest last. Nothing is sent for an address with no account. */
	outbox: Sent[];
	sessions: Map<string, Session>;
	tokens: Expiring<TokenRecord>;
	challenges: Expiring<Challenge>;
	enrolments: Expiring<Enrolment>;
	oauthStates: Expiring<OAuthStateRecord>;
	oauthCodes: Expiring<OAuthCodeRecord>;
	byEmail(email: string): Account | null;
	/**
	 * Count a hit against `key`. Returns the seconds to wait, or `null` to allow.
	 *
	 * Deterministic by *key*, not by a clock: a test uses a unique address, so the
	 * first call always passes and the second always fails. No sleeping, no fake
	 * timers, and no interference between tests.
	 */
	rateLimit(key: string, limit: number, windowMs: number): number | null;
	/**
	 * Whether `key` is already over its limit, **without counting a hit**.
	 *
	 * Separate from `rateLimit` because a lockout has to be checked *before* the
	 * password is verified: checking afterwards means a locked account that
	 * supplies the right password sails through, which makes it not a lockout but
	 * a hint about which password was right.
	 */
	rateStatus(key: string, limit: number): number | null;
	/** Forget a key's count — what a successful sign-in does to a lockout. */
	clearRate(key: string): void;
	/** Wipe and re-seed. Also what `POST /__test__/reset` calls. */
	seed(): Promise<void>;
}

export function createStore(): Store {
	const accounts = new Map<string, Account>();
	const outbox: Sent[] = [];
	const sessions = new Map<string, Session>();
	const tokens = expiring<TokenRecord>();
	const challenges = expiring<Challenge>();
	const enrolments = expiring<Enrolment>();
	const oauthStates = expiring<OAuthStateRecord>();
	const oauthCodes = expiring<OAuthCodeRecord>();
	const counters = new Map<string, { count: number; resetAt: number }>();

	return {
		accounts,
		outbox,
		sessions,
		tokens,
		challenges,
		enrolments,
		oauthStates,
		oauthCodes,

		byEmail(email: string): Account | null {
			const wanted = email.trim().toLowerCase();
			for (const account of accounts.values()) {
				if (account.email === wanted) return account;
			}
			return null;
		},

		rateLimit(key: string, limit: number, windowMs: number): number | null {
			const now = Date.now();
			const existing = counters.get(key);
			if (existing === undefined || existing.resetAt <= now) {
				counters.set(key, { count: 1, resetAt: now + windowMs });
				return null;
			}
			existing.count += 1;
			if (existing.count <= limit) return null;
			return Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
		},

		rateStatus(key: string, limit: number): number | null {
			const now = Date.now();
			const existing = counters.get(key);
			if (existing === undefined || existing.resetAt <= now) return null;
			if (existing.count <= limit) return null;
			return Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
		},

		clearRate(key: string): void {
			counters.delete(key);
		},

		async seed(): Promise<void> {
			accounts.clear();
			outbox.length = 0;
			sessions.clear();
			tokens.clear();
			challenges.clear();
			enrolments.clear();
			oauthStates.clear();
			oauthCodes.clear();
			counters.clear();

			const hash = await hashPassword(SEED_PASSWORD);

			accounts.set(SEED.ada.id, {
				id: SEED.ada.id,
				email: SEED.ada.email,
				emailVerified: true,
				passwordHash: hash,
				mfaSecret: null,
				mfaEnabled: false,
				recoveryCodes: [],
				providers: ['github', 'google']
			});

			accounts.set(SEED.grace.id, {
				id: SEED.grace.id,
				email: SEED.grace.email,
				emailVerified: true,
				passwordHash: null,
				mfaSecret: null,
				mfaEnabled: false,
				recoveryCodes: [],
				providers: ['google']
			});

			accounts.set(SEED.hopper.id, {
				id: SEED.hopper.id,
				email: SEED.hopper.email,
				emailVerified: false,
				passwordHash: null,
				mfaSecret: null,
				mfaEnabled: false,
				recoveryCodes: [],
				providers: ['google']
			});

			accounts.set(SEED.turing.id, {
				id: SEED.turing.id,
				email: SEED.turing.email,
				emailVerified: true,
				passwordHash: hash,
				mfaSecret: SEED.turing.mfaSecret,
				mfaEnabled: true,
				recoveryCodes: recoveryCodes(),
				providers: []
			});
		}
	};
}

/** A new account, unverified and credential-less until something sets one. */
export function createAccount(email: string): Account {
	return {
		id: id(),
		email: email.trim().toLowerCase(),
		emailVerified: false,
		passwordHash: null,
		mfaSecret: null,
		mfaEnabled: false,
		recoveryCodes: [],
		providers: []
	};
}
