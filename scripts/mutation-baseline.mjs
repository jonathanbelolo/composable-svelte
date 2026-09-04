#!/usr/bin/env node
/**
 * The audit's mutation set, re-run.
 *
 * Seven source mutations survived the suite on 3 September 2026
 * (plans/hardening/AUDIT-2026-09-03-FINDINGS.md, MUTATION RESULTS). Each is
 * applied as an exact literal replacement, the named suite is run, the file
 * is restored from a per-file backup and checked byte-for-byte, and the
 * verdict is printed. A mutation that does not change the file is an error,
 * not a verdict (guides/VERIFICATION-PROTOCOL.md rules 1 and 3).
 *
 * Restoring a source file bumps its mtime, which trips dist-freshness on the
 * next node-config run, so the script ends by rebuilding core.
 *
 *   node scripts/mutation-baseline.mjs            # report
 *   node scripts/mutation-baseline.mjs --strict   # exit 1 if any survives (R5.4)
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const core = join(repoRoot, 'packages', 'core');
const strict = process.argv.includes('--strict');

/** @type {Array<{id: string, file: string, find: string, replace: string, config: 'browser' | 'node', suite: string, guards: string}>} */
const MUTATIONS = [
	{
		id: 'M1',
		file: 'src/lib/test/test-store.ts',
		find: "if (this.exhaustivity === 'on' && this.receivedActions.length > 0)",
		replace: 'if (false && this.receivedActions.length > 0)',
		config: 'browser',
		suite: 'tests/test-store.test.ts',
		guards: 'TestStore exhaustivity'
	},
	{
		id: 'M2',
		file: 'src/lib/store.svelte.ts',
		find: 'inFlightEffects.forEach(controller => controller.abort());',
		replace: '/* mutated: abort loop removed */',
		config: 'browser',
		suite: 'tests/store.test.ts',
		guards: 'destroy() aborts in-flight cancellables'
	},
	{
		id: 'M4',
		file: 'src/lib/navigation/matchers.ts',
		find: "      if (presentationAction.type !== 'presented') {\n        return null;\n      }",
		replace: '      /* mutated: presented check removed */',
		config: 'browser',
		suite: 'tests/navigation/operators.test.ts',
		guards: 'matchPresentationAction requires the presented wrapper'
	},
	{
		id: 'M5',
		file: 'src/lib/composition/scope.ts',
		find: 'const parentEffect = Effect.map(childEffect, fromChildAction);',
		replace: 'const parentEffect = childEffect;',
		config: 'browser',
		suite: 'tests/composition.test.ts',
		guards: 'scope() lifts child effects to parent actions'
	},
	{
		id: 'M6',
		file: 'src/lib/websocket/heartbeat.ts',
		find: "      if (!pongReceived) {\n        console.warn('[WebSocket] Heartbeat timeout - no pong received');\n        client.disconnect(1001, 'Heartbeat timeout').catch(console.error);\n        stop();\n        return;\n      }",
		replace: '      /* mutated: no-pong branch removed */',
		config: 'browser',
		suite: 'tests/websocket/heartbeat.test.ts',
		guards: "the heartbeat's missed-pong branch"
	},
	{
		id: 'M7',
		file: 'src/lib/i18n/icu.ts',
		find: '        return message; // Fallback to original message',
		replace: "        return 'MUTATED';",
		config: 'browser',
		suite: 'tests/i18n/icu.test.ts',
		guards: 'the ICU formatting-error fallback'
	},
	{
		id: 'M9',
		file: 'src/lib/routing/query-params.ts',
		find: '\t\t// Return original if decode fails (malformed encoding)\n\t\treturn str;',
		replace: "\t\treturn '';",
		config: 'browser',
		suite: 'tests/routing/query-params.test.ts',
		guards: 'the query-param decode fallback'
	}
];

const rows = [];
for (const m of MUTATIONS) {
	const path = join(core, m.file);
	const original = readFileSync(path, 'utf8');
	const occurrences = original.split(m.find).length - 1;
	if (occurrences !== 1) {
		rows.push({ ...m, verdict: 'ERROR', detail: `anchor matched ${occurrences} times — the source moved; update the mutation` });
		continue;
	}
	const mutated = original.replace(m.find, m.replace);
	if (mutated === original) {
		rows.push({ ...m, verdict: 'ERROR', detail: 'mutation did not change the file' });
		continue;
	}
	const backup = `${path}.mutation-backup`;
	copyFileSync(path, backup);
	writeFileSync(path, mutated);
	let killed;
	try {
		const cfg = m.config === 'node' ? '--config vitest.node.config.ts ' : '';
		execSync(`npx vitest run ${cfg}${m.suite}`, { cwd: core, stdio: 'ignore' });
		killed = false;
	} catch {
		killed = true;
	} finally {
		copyFileSync(backup, path);
		unlinkSync(backup);
	}
	if (readFileSync(path, 'utf8') !== original) {
		rows.push({ ...m, verdict: 'ERROR', detail: 'restore did not reproduce the original — check the file' });
		continue;
	}
	rows.push({ ...m, verdict: killed ? 'KILLED' : 'SURVIVED', detail: '' });
}

console.log('| id | mutation | suite | verdict |');
console.log('|---|---|---|---|');
for (const r of rows) console.log(`| ${r.id} | ${r.guards} | ${r.suite} | **${r.verdict}**${r.detail ? ` — ${r.detail}` : ''} |`);

console.log('\nRebuilding core so dist-freshness does not read the restored mtimes as stale…');
execSync('pnpm --filter @composable-svelte/core build', { cwd: repoRoot, stdio: 'ignore' });

const survivors = rows.filter((r) => r.verdict !== 'KILLED');
if (strict && survivors.length > 0) {
	console.error(`\n${survivors.length} mutation(s) not killed.`);
	process.exit(1);
}
