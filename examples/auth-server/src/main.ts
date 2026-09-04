/**
 * The process entry, for `pnpm start` and Playwright's `webServer`.
 *
 * Separate from `server.ts` on purpose: that module exports a factory and never
 * listens, which is what lets a test build a server per file on an ephemeral
 * port. `examples/ssr-server` calls `start()` at import time and exports
 * nothing, so it cannot be booted by a test at all.
 */

import { createServer } from './server.js';

const port = Number(process.env['PORT'] ?? 4100);
const host = process.env['HOST'] ?? '127.0.0.1';
const testing = process.env['AUTH_FIXTURE_TESTING'] === '1';

// Two lines, and the difference between "an artifact that should not be
// deployed" and "an artifact that cannot be misconfigured quietly".
if (testing && process.env['NODE_ENV'] === 'production') {
	throw new Error('AUTH_FIXTURE_TESTING must not be set in production');
}

const freshnessRaw = process.env['AUTH_FIXTURE_FRESHNESS_MS'];

const { app } = await createServer({
	testing,
	logger: process.env['AUTH_FIXTURE_QUIET'] !== '1',
	...(freshnessRaw !== undefined && { freshnessMs: Number(freshnessRaw) })
});

await app.listen({ port, host });
