/**
 * The record that survives the redirect.
 *
 * OAuth is the only flow in this package split across two page loads. The
 * browser leaves for the provider and comes back to a fresh document with a
 * fresh store, so the nonce minted at the start has to be parked somewhere the
 * navigation cannot destroy. That is the whole of what this module is.
 *
 * It sits at the `flows/` level rather than inside either half, for the reason
 * `password-policy.ts` does: it is minted by `oauth-start`, consumed by
 * `oauth-callback`, and owned by neither.
 *
 * **`sessionStorage`, not `localStorage`**, and the strongest argument is
 * correctness rather than security. `localStorage` is shared between tabs, so a
 * second tab starting a sign-in would clobber the first tab's record and the
 * first tab's *legitimate* callback would then fail verification. `sessionStorage`
 * is per-tab, so two tabs are simply independent. Core's `SECURITY.md` nominates
 * it for "sensitive temporary data" besides.
 */

import {
	createNoopStorage,
	createSessionStorage,
	isBrowser,
	EnvironmentNotSupportedError,
	type Storage
} from '@composable-svelte/core/dependencies';

/**
 * The provider's name, as the backend spells it.
 *
 * Deliberately `string` and not a union, unlike `MfaMethod`. The MFA protocol
 * closes its list; providers are open, and a union here would make this
 * package's release cadence a blocker for anyone adding a provider.
 */
export type OAuthProvider = string;

export interface PendingOAuth {
	provider: OAuthProvider;
	/** The nonce the backend minted, compared against `?state=` on return. */
	state: string;
	/**
	 * Where to land afterwards — a same-origin path, or `null`.
	 *
	 * Normalised by {@link normaliseReturnTo} before it is ever stored, so this
	 * can never hold an absolute URL.
	 */
	returnTo: string | null;
}

export interface PendingOAuthStorage {
	/**
	 * Store the record, replacing any previous one.
	 *
	 * **Throws when the record did not survive the write** — a full quota, a
	 * browser with storage disabled, a private-mode quirk. The caller must not
	 * redirect after a throw: a dropped record turns up on the callback page as
	 * `oauth_state_mismatch`, which is a security-shaped verdict on what is
	 * really a storage fault, delivered on a page with no way to diagnose it.
	 */
	put(pending: PendingOAuth): void;
	/**
	 * Read the record and clear it. Never throws; an unreadable store answers
	 * `null`.
	 *
	 * Destructive because the nonce is single-use, exactly like a verification
	 * token — and **nothing is lost by that**, which is the argument against
	 * "fixing" this into a `peek()` plus a separate `clear()`. If the exchange
	 * fails after the record is gone, the authorization code is spent too, so a
	 * second attempt could never have succeeded with a perfect store either.
	 * Both halves die together; the only honest recovery is starting again.
	 */
	take(): PendingOAuth | null;
}

/** One key, so a second start overwrites rather than accumulating. */
const KEY = 'pending';

/**
 * A path this app can navigate to, or `null`.
 *
 * The open-redirect gate, and it needs no XSS to matter: a consumer who reads
 * `returnTo` from their own `?returnTo=` query parameter will carry
 * `https://evil.example` through the whole flow and hand it back at the end as
 * a trustworthy-looking destination. Only a rooted, same-origin path survives.
 *
 * `//evil.example` is rejected along with the rest — it starts with a slash and
 * is a protocol-relative *absolute* URL, which is exactly the case a naive
 * `startsWith('/')` check waves through.
 */
export function normaliseReturnTo(value: string | null | undefined): string | null {
	if (typeof value !== 'string' || value === '') return null;
	if (!value.startsWith('/')) return null;
	if (value.startsWith('//')) return null;
	// A backslash after the leading slash is normalised to a forward slash by
	// some browsers, which turns `/\evil.example` into a protocol-relative URL.
	if (value.startsWith('/\\')) return null;
	return value;
}

function isPendingOAuth(value: unknown): value is PendingOAuth {
	if (typeof value !== 'object' || value === null) return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record['provider'] === 'string' &&
		typeof record['state'] === 'string' &&
		record['state'] !== '' &&
		(record['returnTo'] === null || typeof record['returnTo'] === 'string')
	);
}

function fromStorage(storage: Storage<PendingOAuth>, writable: boolean): PendingOAuthStorage {
	return {
		put(pending: PendingOAuth): void {
			if (!writable) {
				throw new EnvironmentNotSupportedError(
					'sessionStorage, which an OAuth sign-in needs to survive the redirect',
					'this browser'
				);
			}
			storage.setItem(KEY, { ...pending, returnTo: normaliseReturnTo(pending.returnTo) });

			// Read back rather than trusting the write. A quota failure throws, but
			// a browser that accepts `setItem` and stores nothing does not, and that
			// silence is what would surface later as a bogus CSRF verdict.
			if (storage.getItem(KEY) === null) {
				throw new EnvironmentNotSupportedError(
					'durable sessionStorage — the OAuth record did not survive being written',
					'this browser'
				);
			}
		},
		take(): PendingOAuth | null {
			try {
				const pending = storage.getItem(KEY);
				storage.removeItem(KEY);
				return isPendingOAuth(pending) ? pending : null;
			} catch {
				// Answering `null` lands on `oauth_state_mismatch`, whose meaning is
				// "cannot verify" — which is the honest verdict when the store cannot
				// be read, and better than the `unknown` a throw would become.
				return null;
			}
		}
	};
}

/**
 * The real thing: one record, in this tab's `sessionStorage`.
 *
 * **Construction never throws**, which is load-bearing. `createSessionStorage`
 * throws on a server, and this package's own README calls its dependency
 * factories at module scope. So a server gets the noop storage — safe, because
 * effects are deferred during server render and it is therefore never reached —
 * and a browser without usable storage gets one whose `put` throws at the moment
 * it matters, on a page that still has buttons on it.
 */
export function createPendingOAuthStorage(prefix = 'auth:oauth:'): PendingOAuthStorage {
	if (!isBrowser()) {
		return fromStorage(createNoopStorage<PendingOAuth>(), false);
	}
	try {
		return fromStorage(createSessionStorage<PendingOAuth>({ prefix }), true);
	} catch {
		return fromStorage(createNoopStorage<PendingOAuth>(), false);
	}
}

/**
 * An in-memory record, for tests and demos.
 *
 * Core has `createMockClock` and `createMockCookieStorage` but no
 * `createMockStorage`, and `createNoopStorage` discards writes — so there is
 * nothing to assert a round trip against. This is the narrow substitute.
 */
export function createMemoryPendingOAuthStorage(): PendingOAuthStorage {
	let held: PendingOAuth | null = null;
	return {
		put(pending: PendingOAuth): void {
			held = { ...pending, returnTo: normaliseReturnTo(pending.returnTo) };
		},
		take(): PendingOAuth | null {
			const taken = held;
			held = null;
			return taken;
		}
	};
}
