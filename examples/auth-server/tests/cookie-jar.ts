/**
 * A cookie jar for Node's `fetch`, which does not have one.
 *
 * **This proves nothing about cookie semantics, and must not be read as if it
 * did.** It does not enforce `HttpOnly` — Node can read any `Set-Cookie`
 * regardless — it does not enforce `SameSite`, and it does not know what a
 * browser would actually send. It is plumbing, so that multi-step journeys
 * (sign in, then read the account) work at all in a Node suite.
 *
 * The properties it cannot check are checked by the Playwright suite, which
 * runs a real browser against this same server. The one thing asserted here is
 * the literal `Set-Cookie` header, in `session.test.ts` — that a string is
 * emitted with the right attributes, and without `Secure` or `Domain`.
 */

export interface CookieJar {
	/** A `fetch` that carries the jar. Pass to `createHttpAuthDeps` indirectly via `globalThis`. */
	fetch: typeof fetch;
	/** The `Cookie` header this jar would send, or `''`. */
	header(): string;
	/** Every raw `Set-Cookie` string seen, newest last. */
	seen: string[];
	clear(): void;
}

export function createCookieJar(base: typeof fetch = globalThis.fetch): CookieJar {
	const held = new Map<string, string>();
	const seen: string[] = [];

	const header = (): string =>
		[...held.entries()].map(([name, value]) => `${name}=${value}`).join('; ');

	const absorb = (response: Response): void => {
		// `getSetCookie()`, never `get('set-cookie')`. The latter joins multiple
		// headers with ", ", which shreds any `Expires=Wed, 01 Jan ...` inside one.
		for (const raw of response.headers.getSetCookie()) {
			seen.push(raw);

			const [pair, ...attributes] = raw.split(';');
			if (pair === undefined) continue;
			const eq = pair.indexOf('=');
			if (eq < 0) continue;

			const name = pair.slice(0, eq).trim();
			const value = pair.slice(eq + 1).trim();

			const lower = attributes.map((a) => a.trim().toLowerCase());
			const maxAgeZero = lower.some((a) => a === 'max-age=0' || a.startsWith('max-age=-'));
			const expired = lower.some((a) => {
				if (!a.startsWith('expires=')) return false;
				const when = Date.parse(a.slice('expires='.length));
				return Number.isFinite(when) && when <= Date.now();
			});

			if (value === '' || maxAgeZero || expired) held.delete(name);
			else held.set(name, value);
		}
	};

	// `Parameters<typeof fetch>[0]` rather than `RequestInfo | URL`: this project
	// compiles with `lib: ["ES2022"]` and Node types, where the DOM's `RequestInfo`
	// does not exist but the global `fetch` does.
	type FetchInput = Parameters<typeof fetch>[0];

	const jarFetch = (async (input: FetchInput, init?: RequestInit): Promise<Response> => {
		const cookie = header();
		const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
		if (cookie !== '') headers.set('cookie', cookie);

		const response = await base(input, { ...init, headers });
		absorb(response);
		return response;
	}) as typeof fetch;

	return {
		fetch: jarFetch,
		header,
		seen,
		clear: () => {
			held.clear();
			seen.length = 0;
		}
	};
}
