#!/usr/bin/env node
/**
 * Verify the packages the way a consumer receives them, without publishing.
 *
 * `guides/VERIFICATION-PROTOCOL.md` §2 states the rule this automates:
 * *"Reading the manifest is not the same as resolving it."* Every other gate in
 * this repository runs inside the workspace, where pnpm links `src/` and the
 * exports map is never consulted. This one packs real tarballs, installs them
 * outside the workspace, and asks Node to resolve each declared entry point.
 *
 * It found nothing broken the first time it ran — 53 entry points, 0 failures —
 * but it is the only check that *could* have, and it also measures what one
 * import costs, which `side-effects.test.ts` calls its own missing experiment:
 * "the cheap structural stand-in" for a real bundler run that had been done once
 * by hand and never automated.
 *
 *   node scripts/verify-package.mjs
 *
 * Requires `pnpm -r build` first. Nothing here contacts a registry.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const PKGS = ['core', 'auth', 'chat', 'charts', 'code', 'graphics', 'maps', 'media'];

/** Peers a package declares optional. Their absence is correct, not a failure. */
const OPTIONAL_PEERS = ['mapbox-gl', 'prismjs', 'pdfjs-dist', 'isomorphic-dompurify'];

/** Deep paths that must stay closed, or the exports map is decorative. */
const MUST_REFUSE = [
	'@composable-svelte/core/dist/index.js',
	'@composable-svelte/core/src/lib/store.svelte.ts',
	'@composable-svelte/auth/dist/flows/login/reducer.js'
];

const run = (cmd, args, cwd) =>
	execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const scratch = mkdtempSync(join(tmpdir(), 'cs-verify-'));
const packDir = join(scratch, 'pack');
const consumer = join(scratch, 'consumer');
mkdirSync(packDir);
mkdirSync(consumer);

let failed = false;
const fail = (msg) => {
	failed = true;
	console.error(`  ✗ ${msg}`);
};

try {
	console.log('packing…');
	const deps = { svelte: '^5.0.0' };
	for (const name of PKGS) {
		const dir = join(repoRoot, 'packages', name);
		const version = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
		// `--ignore-scripts`: `prepack` rebuilds, and the caller has already built.
		run('npm', ['pack', '--pack-destination', packDir, '--ignore-scripts'], dir);
		deps[`@composable-svelte/${name}`] =
			`file:${join(packDir, `composable-svelte-${name}-${version}.tgz`)}`;
	}

	writeFileSync(
		join(consumer, 'package.json'),
		JSON.stringify({ name: 'consumer-probe', private: true, type: 'module', dependencies: deps }, null, 2)
	);

	// Installed **together**. Installing one alone makes npm resolve its peers
	// from the registry, where the current versions do not exist — which is the
	// state that makes the published `chat` uninstallable today. The set has to
	// be coherent with itself.
	console.log('installing the set outside the workspace…');
	run('npm', ['install', '--no-audit', '--no-fund'], consumer);

	const require = createRequire(join(consumer, 'noop.js'));
	let resolved = 0;
	let needsSvelte = 0;
	let needsOptionalPeer = 0;

	console.log('resolving every declared entry point…');
	for (const name of PKGS) {
		const spec = `@composable-svelte/${name}`;
		const manifest = JSON.parse(readFileSync(require.resolve(`${spec}/package.json`), 'utf8'));

		for (const sub of Object.keys(manifest.exports ?? {})) {
			if (sub === './package.json') continue;
			const target = sub === '.' ? spec : `${spec}/${sub.slice(2)}`;

			let file;
			try {
				file = require.resolve(target);
				resolved += 1;
			} catch (error) {
				fail(`${target} does not resolve: ${error.code}`);
				continue;
			}

			if (sub.endsWith('.css')) continue;

			try {
				// By resolved file URL, not by bare specifier: a bare `import()` here
				// would resolve against *this script's* location rather than the
				// consumer's `node_modules`, and report every package as missing.
				// The module's own bare imports still resolve from where it sits.
				await import(pathToFileURL(file).href);
			} catch (error) {
				const message = String(error.message);
				if (message.includes('Unknown file extension ".svelte"')) {
					// Node has no Svelte loader. Resolution is the check that matters.
					needsSvelte += 1;
				} else if (OPTIONAL_PEERS.some((p) => message.includes(`'${p}'`))) {
					needsOptionalPeer += 1;
				} else {
					fail(`${target} — ${error.code ?? 'threw'}: ${message.split('\n')[0].slice(0, 120)}`);
				}
			}
		}
	}

	for (const deep of MUST_REFUSE) {
		try {
			require.resolve(deep);
			fail(`${deep} resolves — the exports map is not closing it`);
		} catch (error) {
			if (error.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
				fail(`${deep} — expected ERR_PACKAGE_PATH_NOT_EXPORTED, got ${error.code}`);
			}
		}
	}

	console.log(
		`\n  ${resolved} entry points resolved · ${needsSvelte} need a Svelte loader · ` +
			`${needsOptionalPeer} need an optional peer · ${MUST_REFUSE.length} deep paths refused`
	);
} finally {
	rmSync(scratch, { recursive: true, force: true });
}

if (failed) {
	console.error('\nFAILED — the packages are not installable as published.');
	process.exit(1);
}
console.log('\nOK — the packaged set installs and resolves outside the workspace.');
