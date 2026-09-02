import { defineConfig } from 'vitest/config';

/**
 * Node, not browser mode — unlike every other suite in this repo.
 *
 * These tests drive a real Fastify server over real HTTP to check the wire
 * contract: bodies, statuses, and the twelve `AuthError` arms. None of that
 * needs a browser, and a browser would need either a Vite proxy or a CORS
 * relaxation to stay same-origin — two mechanisms this repo has never used.
 *
 * The properties that *do* need a browser — that it stores an HttpOnly cookie,
 * re-sends it same-origin, and carries it across a full-page OAuth redirect —
 * are covered by the Playwright suite, which runs a real browser against this
 * same server. See `tests/cookie-jar.ts`.
 */
export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts']
	}
});
