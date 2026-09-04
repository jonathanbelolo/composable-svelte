/**
 * Every exported subpath, imported by a plain Node process.
 *
 * Nothing in the repository loaded the built output outside Vite. The suites
 * import `src/`, the examples are bundled, and `scripts/verify-package.mjs`
 * only resolves entry points and imports them without calling anything — so
 * an ICU message formatter that threw on construction under Node's own module
 * loader, and fell back to returning its raw source, shipped in every release
 * (`plans/hardening/AUDIT-2026-09-03-FINDINGS.md`, I1, STRUCTURAL).
 *
 * A child `node` process, not a Vitest import: Vitest would transform `dist`
 * through Vite and prove nothing about Node. The child resolves
 * `@composable-svelte/core/<sub>` by self-reference through the real `exports`
 * map, imports each subpath, makes one representative call per Node-safe
 * module, and prints JSON. Nine subpaths reach a `.svelte` file and fail under
 * Node by design; that set is asserted exactly, so a `.svelte` leaking into a
 * Node-safe entry is caught too.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const coreDir = fileURLToPath(new URL('../../', import.meta.url));

const pkg = JSON.parse(readFileSync(join(coreDir, 'package.json'), 'utf8')) as {
	exports: Record<string, unknown>;
};

/** Subpaths a consumer can import, minus CSS and the manifest. */
const subpaths = Object.keys(pkg.exports).filter((k) => k !== './package.json' && !k.endsWith('.css'));

/** The entries whose module graph reaches a `.svelte` file. Node cannot load these, and that is by design. */
const REACHES_SVELTE = [
	'.',
	'./components',
	'./components/command',
	'./components/data-table',
	'./components/form',
	'./components/image-gallery',
	'./components/toast',
	'./components/ui',
	'./navigation-components'
];

const RAW_ICU = '{n, plural, one {# item} other {# items}}';

/** The script the child runs. Always exits 0 with JSON on stdout; errors are data. */
function childScript(subs: string[]): string {
	return `
const specifier = (sub) => sub === '.' ? '@composable-svelte/core' : '@composable-svelte/core/' + sub.slice(2);
const imports = {};
for (const sub of ${JSON.stringify(subs)}) {
  try { const m = await import(specifier(sub)); imports[sub] = { ok: true, exports: Object.keys(m).length }; }
  catch (e) { imports[sub] = { ok: false, code: e && e.code ? e.code : String(e && e.name), message: String(e && e.message).slice(0, 200) }; }
}
const calls = {};
const call = async (name, fn) => { try { calls[name] = await fn(); } catch (e) { calls[name] = 'THREW ' + String(e && e.message).slice(0, 200); } };
await call('icu', async () => (await import('@composable-svelte/core/i18n')).compileICU(${JSON.stringify(RAW_ICU)}, 'en')({ n: 1 }));
await call('query', async () => (await import('@composable-svelte/core/routing')).parseQueryParams('a=1'));
await call('serialize', async () => (await import('@composable-svelte/core/ssr')).serializeState({ a: 1 }));
await call('clock', async () => typeof (await import('@composable-svelte/core/dependencies')).createMockClock().now());
await call('stackDepth', async () => (await import('@composable-svelte/core/navigation')).stackDepth([]));
await call('scope', async () => typeof (await import('@composable-svelte/core/composition')).scope);
await call('TestStore', async () => typeof (await import('@composable-svelte/core/test')).TestStore);
await call('api', async () => { const m = await import('@composable-svelte/core/api'); return typeof m.createAPIClient + ':' + typeof m.Request.get('/x'); });
await call('websocket', async () => typeof (await import('@composable-svelte/core/websocket')).createLiveWebSocket);
await call('ssg', async () => typeof (await import('@composable-svelte/core/ssr/ssg')).generateStaticSite);
await call('middleware', async () => typeof (await import('@composable-svelte/core/ssr/middleware')).fastifySecurityHeaders);
await call('sanitize', async () => Object.keys(await import('@composable-svelte/core/ssr/sanitize')).length);
await call('animation', async () => typeof (await import('@composable-svelte/core/animation')).animateFadeIn);
await call('actions', async () => typeof (await import('@composable-svelte/core/actions')).clickOutside);
await call('utils', async () => Object.keys(await import('@composable-svelte/core/utils')).length);
await call('styles', async () => Object.keys(await import('@composable-svelte/core/styles')).length);
await call('preset', async () => typeof (await import('@composable-svelte/core/tailwind-preset')).default);
process.stdout.write(JSON.stringify({ imports, calls }));
`;
}

interface Report {
	imports: Record<string, { ok: true; exports: number } | { ok: false; code: string; message: string }>;
	calls: Record<string, unknown>;
}

function runChild(subs: string[]): Report {
	// process.execPath, not 'node': CI runs Node 20 and a developer machine may
	// run 24 under a version manager, and PATH is not inherited. Vitest sets no
	// NODE_OPTIONS, so the child gets no loader. stderr is piped and dropped
	// because compileICU logs its compilation error there.
	const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', childScript(subs)], {
		cwd: coreDir,
		env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
		stdio: ['ignore', 'pipe', 'pipe'],
		encoding: 'utf8',
		maxBuffer: 16 * 1024 * 1024
	});
	return JSON.parse(stdout) as Report;
}

describe('dist under plain Node', { timeout: 120_000 }, () => {
	const report = runChild(subpaths);

	it('enumerated the exports map', () => {
		expect(subpaths.length).toBeGreaterThan(20);
		for (const sub of REACHES_SVELTE) expect(subpaths, `${sub} is no longer exported`).toContain(sub);
	});

	it('exactly the component entries fail, because they reach a .svelte file', () => {
		const failed = subpaths.filter((sub) => !report.imports[sub]!.ok).sort();
		expect(failed).toEqual([...REACHES_SVELTE].sort());
		for (const sub of failed) {
			const r = report.imports[sub] as { ok: false; code: string };
			expect(r.code, `${sub} failed for a reason other than the .svelte loader`).toBe('ERR_UNKNOWN_FILE_EXTENSION');
		}
	});

	it('every other subpath imports with exports', () => {
		for (const sub of subpaths.filter((s) => !REACHES_SVELTE.includes(s))) {
			const r = report.imports[sub]!;
			expect(r.ok, `${sub}: ${!r.ok ? r.message : ''}`).toBe(true);
			if (r.ok) expect(r.exports, `${sub} exports nothing`).toBeGreaterThan(0);
		}
	});

	it('one representative call per Node-safe module works', () => {
		expect(report.calls['query']).toEqual({ a: '1' });
		expect(report.calls['serialize']).toBe(JSON.stringify({ a: 1 }));
		expect(report.calls['clock']).toBe('number');
		expect(report.calls['stackDepth']).toBe(0);
		expect(report.calls['scope']).toBe('function');
		expect(report.calls['TestStore']).toBe('function');
		expect(report.calls['api']).toBe('function:object');
		expect(report.calls['websocket']).toBe('function');
		expect(report.calls['ssg']).toBe('function');
		expect(report.calls['middleware']).toBe('function');
		expect(report.calls['sanitize']).toBeGreaterThan(0);
		expect(report.calls['animation']).toBe('function');
		expect(report.calls['actions']).toBe('function');
		expect(report.calls['utils']).toBeGreaterThan(0);
		expect(report.calls['styles']).toBeGreaterThan(0);
		expect(report.calls['preset']).toBe('object');
	});

	it('I1 (pinned defect): ICU returns the raw message under plain Node', () => {
		// Pinned, not fixed: icu.ts default-imports intl-messageformat, whose
		// CommonJS entry has no default export, so the constructor is the
		// exports object, construction throws, and the catch returns the raw
		// message. Fails the moment R1.5 switches to the named import; remove
		// it in that commit. AUDIT-2026-09-03-FINDINGS I1.
		expect(report.calls['icu']).toBe(RAW_ICU);
	});

	it('reports a subpath that does not exist, so the probe is not vacuous', () => {
		const probe = runChild(['./does-not-exist']);
		const r = probe.imports['./does-not-exist']!;
		expect(r.ok).toBe(false);
		expect((r as { code: string }).code).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED');
	});
});
