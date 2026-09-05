#!/usr/bin/env node
/**
 * The audit's mutation set, re-run.
 *
 * Seven source mutations survived the suite on 3 September 2026
 * (plans/hardening/AUDIT-2026-09-03-FINDINGS.md, MUTATION RESULTS), and the
 * hardening steps add one for each fix a later change could silently undo
 * (R1.1: the destination effect mapping). Each is applied as an exact
 * literal replacement, the named suite is run, the file is restored from a
 * backup and checked byte-for-byte, and the verdict is printed. A mutation that does not change the file is an error, not a
 * verdict (guides/VERIFICATION-PROTOCOL.md rules 1 and 3).
 *
 * A verdict is KILLED only when the test named in `expect` is among the
 * failures. The first version read any non-zero exit as a kill, so a flake,
 * a console-guard trip or a suite already red for another reason counted as
 * one (found by the R0 review). Two further consequences of that:
 *
 * - The seven suites are run once *unmutated* first. A red baseline makes
 *   every later verdict meaningless, so the script stops there.
 * - A suite that fails without the expected test failing is SUSPECT, listed
 *   with what did fail, and counts as not killed under --strict.
 *
 * Backups live in a temp directory, not beside the source; SIGINT and a
 * timed-out suite restore them too. Restoring a source file bumps its mtime,
 * which trips dist-freshness on the next node-config run, so the script ends
 * by rebuilding core.
 *
 *   node scripts/mutation-baseline.mjs            # report
 *   node scripts/mutation-baseline.mjs --strict   # exit 1 unless all KILLED (R5.4)
 */

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const core = join(repoRoot, 'packages', 'core');
const strict = process.argv.includes('--strict');
const SUITE_TIMEOUT_MS = 10 * 60_000;

/**
 * @typedef {object} Mutation
 * @property {string} id
 * @property {string} file
 * @property {string} find
 * @property {string} replace
 * @property {'browser' | 'node'} config
 * @property {string} suite
 * @property {string} expect  the test that must fail, as a substring of its full name
 * @property {string} guards
 */

/** @type {Mutation[]} */
const MUTATIONS = [
	{
		id: 'M1',
		file: 'src/lib/test/test-store.ts',
		find: "if (this.exhaustivity === 'on' && this.receivedActions.length > 0)",
		replace: 'if (false && this.receivedActions.length > 0)',
		config: 'browser',
		suite: 'tests/test-store.test.ts',
		expect: 'throws when pending actions in exhaustive mode',
		guards: 'TestStore exhaustivity'
	},
	{
		id: 'M2',
		file: 'src/lib/store.svelte.ts',
		find: 'inFlightEffects.forEach(controller => controller.abort());',
		replace: '/* mutated: abort loop removed */',
		config: 'browser',
		suite: 'tests/store.test.ts',
		expect: 'destroy() aborts the in-flight cancellable',
		guards: 'destroy() aborts in-flight cancellables'
	},
	{
		id: 'M4',
		file: 'src/lib/navigation/matchers.ts',
		find: "      if (presentationAction.type !== 'presented') {\n        return null;\n      }",
		replace: '      /* mutated: presented check removed */',
		config: 'browser',
		suite: 'tests/navigation/operators.test.ts',
		expect: 'returns null when the wrapper is not a presented action',
		guards: 'matchPresentationAction requires the presented wrapper'
	},
	{
		id: 'M5',
		file: 'src/lib/composition/scope.ts',
		find: 'const parentEffect = Effect.map(childEffect, fromChildAction);',
		replace: 'const parentEffect = childEffect;',
		config: 'browser',
		suite: 'tests/composition.test.ts',
		expect: 'lifts child effects to parent actions',
		guards: 'scope() lifts child effects to parent actions'
	},
	{
		id: 'M6',
		file: 'src/lib/websocket/heartbeat.ts',
		find: "      if (!pongReceived) {\n        console.warn('[WebSocket] Heartbeat timeout - no pong received');\n        stop();\n        client.reconnect(\n          'Heartbeat timeout',\n          new WebSocketError(`Heartbeat timeout: no pong within ${interval}ms`, WS_ERROR_CODES.HEARTBEAT_TIMEOUT, true)\n        );\n        return;\n      }",
		replace: '      /* mutated: no-pong branch removed */',
		config: 'browser',
		suite: 'tests/websocket/heartbeat.test.ts',
		expect: 'should reconnect if second ping sent without pong from first',
		guards: "the heartbeat's missed-pong branch"
	},
	{
		id: 'M7',
		file: 'src/lib/i18n/icu.ts',
		find: '        return message; // Fallback to original message',
		replace: "        return 'MUTATED';",
		config: 'browser',
		suite: 'tests/i18n/icu.test.ts',
		expect: 'should handle formatting errors gracefully',
		guards: 'the ICU formatting-error fallback'
	},
	{
		id: 'M9',
		file: 'src/lib/routing/query-params.ts',
		find: '\t\t// Return original if decode fails (malformed encoding)\n\t\treturn str;',
		replace: "\t\treturn '';",
		config: 'browser',
		suite: 'tests/routing/query-params.test.ts',
		expect: 'returns original value if decode fails',
		guards: 'the query-param decode fallback'
	},
	{
		id: 'R1-N2',
		file: 'src/lib/navigation/destination.ts',
		find: "\t\t\tnestGroups(\n\t\t\t\tEffectConstructors.map(\n\t\t\t\t\tchildEffect,\n\t\t\t\t\t(childResult) => ({ type: caseType, action: childResult }) as DestinationAction<Reducers>\n\t\t\t\t),\n\t\t\t\tString(caseType)\n\t\t\t)",
		replace: "\t\t\tnestGroups(childEffect as never, String(caseType))",
		config: 'browser',
		suite: 'tests/navigation/destination.test.ts',
		expect: 'maps the child effect back into the case',
		guards: "createDestination maps the child's effect into its case (N2)"
	},
	{
		id: 'R1C-W3',
		file: 'src/lib/websocket/live-client.ts',
		find: "        if (!openedSockets.has(ws)) {\n          // Never opened: the attempt failed.",
		replace: "        if (ws.readyState !== WebSocket.OPEN) {\n          // Never opened: the attempt failed.",
		config: 'browser',
		suite: 'tests/websocket/live-client.test.ts',
		expect: 'an error on an established socket does not suppress the reconnect its close would start',
		guards: '"never opened" is remembered per socket, not read from readyState, which browsers set to CLOSED before firing error (R1-REVIEW 1.1)'
	},
	{
		id: 'R1C-A7',
		file: 'src/lib/api/deduplication.ts',
		find: '\t\t\t\t\tif (entry.subscribers === 0 && !entry.settled) {\n\t\t\t\t\t\tentry.controller.abort();\n\t\t\t\t\t\tif (key !== null && inFlight.get(key) === entry) inFlight.delete(key);\n\t\t\t\t\t}',
		replace: '\t\t\t\t\tif (entry.subscribers === 0 && !entry.settled) entry.controller.abort();',
		config: 'browser',
		suite: 'tests/api/deduplication.test.ts',
		expect: 'the attempt leaves the registry when its last caller aborts, synchronously',
		guards: 'an aborted attempt leaves the in-flight map with its last caller (R1-REVIEW 1.2)'
	},
	{
		id: 'R1C-A8',
		file: 'src/lib/api/client.ts',
		find: '      const key = requestKey(prepared.identity);',
		replace: '      const key = requestKey(finalizeRequest(method, resolvedURL, { ...config, headers: mergeHeaders(defaultHeaders, config.headers) }, retry).identity);',
		config: 'browser',
		suite: 'tests/api/client.test.ts',
		expect: 'a header added by a request interceptor is part of the identity',
		guards: 'the request key is computed after the request interceptors (R1-REVIEW 1.7)'
	},
	{
		id: 'R1C-A6',
		file: 'src/lib/api/pipeline.ts',
		find: '\t\t(typeof FormData !== \'undefined\' && body instanceof FormData) ||',
		replace: '\t\tfalse ||',
		config: 'browser',
		suite: 'tests/api/client.test.ts',
		expect: 'a FormData body reaches fetch untouched',
		guards: 'a FormData body is passed to fetch untouched (A6)'
	},
	{
		id: 'R1C-A10',
		file: 'src/lib/api/pipeline.ts',
		find: '\t\tif (value !== undefined) folded[name.toLowerCase()] = value;',
		replace: '\t\tif (value !== undefined) folded[name] = value;',
		config: 'browser',
		suite: 'tests/api/client.test.ts',
		expect: 'header names are case-insensitive',
		guards: 'header names are folded to lower case (A10)'
	}
];

// ---------------------------------------------------------------------------
// Backups: one directory, restored on every exit path.

const backupDir = mkdtempSync(join(tmpdir(), 'mutation-baseline-'));
/** @type {Map<string, string>} absolute source path -> backup path */
const active = new Map();

function restoreAll() {
	for (const [path, backup] of active) {
		copyFileSync(backup, path);
		active.delete(path);
	}
}
process.on('exit', () => {
	restoreAll();
	rmSync(backupDir, { recursive: true, force: true });
});
process.on('SIGINT', () => {
	console.error('\ninterrupted — restoring sources');
	process.exit(130);
});
process.on('SIGTERM', () => process.exit(143));

// ---------------------------------------------------------------------------
// Running a suite and reading what failed.

/**
 * @param {string} suite
 * @param {'browser' | 'node'} config
 * @returns {{ exit: number, failed: string[] | null }} failed test full names; null when no JSON came back
 */
function runSuite(suite, config) {
	const out = join(backupDir, `${suite.replace(/[^\w.-]/g, '_')}.json`);
	rmSync(out, { force: true });
	const cfg = config === 'node' ? '--config vitest.node.config.ts ' : '';
	let exit = 0;
	try {
		execSync(`npx vitest run ${cfg}--reporter=json --outputFile=${out} ${suite}`, {
			cwd: core,
			stdio: 'ignore',
			timeout: SUITE_TIMEOUT_MS
		});
	} catch (error) {
		exit = typeof error?.status === 'number' ? error.status : -1;
	}
	if (!existsSync(out)) return { exit, failed: null };
	const report = JSON.parse(readFileSync(out, 'utf8'));
	const failed = [];
	for (const file of report.testResults ?? []) {
		for (const test of file.assertionResults ?? []) {
			if (test.status === 'failed') failed.push(test.fullName ?? test.title);
		}
	}
	return { exit, failed };
}

// ---------------------------------------------------------------------------
// 1. The baseline: every suite green before anything is mutated.

console.log('Baseline: running every suite unmutated…');
const suites = [...new Set(MUTATIONS.map((m) => `${m.config}:${m.suite}`))];
const redBaseline = [];
for (const entry of suites) {
	const [config, suite] = entry.split(':');
	const { exit, failed } = runSuite(suite, config);
	if (exit !== 0 || failed === null || failed.length > 0) {
		redBaseline.push(`${suite}: ${failed === null ? `no report (exit ${exit})` : failed.join('; ') || `exit ${exit}`}`);
	}
}
if (redBaseline.length > 0) {
	console.error('\nThe baseline is red; no verdict below would mean anything. Fix first:');
	for (const line of redBaseline) console.error(`  ${line}`);
	process.exit(2);
}
console.log('Baseline green.\n');

// ---------------------------------------------------------------------------
// 2. The mutations.

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

	const backup = join(backupDir, `${m.id}.bak`);
	copyFileSync(path, backup);
	active.set(path, backup);
	writeFileSync(path, mutated);
	let result;
	try {
		result = runSuite(m.suite, m.config);
	} finally {
		copyFileSync(backup, path);
		active.delete(path);
	}
	if (readFileSync(path, 'utf8') !== original) {
		rows.push({ ...m, verdict: 'ERROR', detail: 'restore did not reproduce the original — check the file' });
		continue;
	}

	const { exit, failed } = result;
	if (failed === null) {
		rows.push({ ...m, verdict: 'ERROR', detail: `the suite produced no report (exit ${exit}) — a crash or a timeout, not a verdict` });
	} else if (failed.some((name) => name.includes(m.expect))) {
		const others = failed.filter((name) => !name.includes(m.expect));
		rows.push({ ...m, verdict: 'KILLED', detail: others.length ? `also failed: ${others.join('; ')}` : '' });
	} else if (exit !== 0 || failed.length > 0) {
		rows.push({
			...m,
			verdict: 'SUSPECT',
			detail: `the suite failed but not the test that guards this line (${JSON.stringify(m.expect)}); failed: ${failed.join('; ') || `exit ${exit}, no failed test`}`
		});
	} else {
		rows.push({ ...m, verdict: 'SURVIVED', detail: '' });
	}
}

console.log('| id | mutation | suite | verdict | detail |');
console.log('|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.id} | ${r.guards} | ${r.suite} | **${r.verdict}** | ${r.detail} |`);

// ---------------------------------------------------------------------------
// 3. Rebuild, so dist-freshness does not read the restored mtimes as stale.

console.log('\nRebuilding core…');
try {
	execSync('pnpm --filter @composable-svelte/core build', { cwd: repoRoot, stdio: 'pipe' });
} catch (error) {
	console.error('core did not rebuild; dist may be stale:\n' + String(error?.stderr ?? error));
	process.exit(3);
}

const notKilled = rows.filter((r) => r.verdict !== 'KILLED');
if (strict && notKilled.length > 0) {
	console.error(`\n${notKilled.length} mutation(s) not killed.`);
	process.exit(1);
}
