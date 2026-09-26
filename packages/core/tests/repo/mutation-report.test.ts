import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Execute the actual reader without starting the mutation campaign.
const source = readFileSync(new URL('../../../../scripts/mutation-baseline.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function runSuite(suite, config) {');
const end = source.indexOf('\n// ---------------------------------------------------------------------------', start);
function read(input: string, exit = 0, exists = true) {
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const fn = runInNewContext(source.slice(start, end) + '\nrunSuite', {
    join: (...parts: string[]) => parts.join('/'), backupDir: '/reports', core: '/core',
    SUITE_TIMEOUT_MS: 1, rmSync() {}, existsSync: () => exists, readFileSync: () => input,
    execSync() { if (exit) throw { status: exit }; }
  });
  return JSON.parse(JSON.stringify(fn('fixture.test.ts', 'node')));
}

describe('mutation report classification', () => {
  it.each(['{truncated', 'null', '{}', '{"testResults":{}}', '{"testResults":[null]}', '{"testResults":[{"assertionResults":{}}]}', '{"testResults":[{"assertionResults":[null]}]}', '{"testResults":[{"assertionResults":[{"status":1}]}]}', '{"testResults":[{"assertionResults":[{"status":"failed"}]}]}', '{"testResults":[{"assertionResults":[{"status":"failed","title":"real"}]},null]}'])('treats invalid report %s as inconclusive', input => {
    for (const exit of [0, 1]) expect(read(input, exit)).toEqual({ exit, failed: null });
  });
  it('preserves process status without a report', () => {
    expect(read('', -1, false)).toEqual({ exit: -1, failed: null });
  });
  it('reports actual failed assertions and valid empty results', () => {
    expect(read(JSON.stringify({ testResults: [{ assertionResults: [{ status: 'failed', fullName: 'expected failure' }, { status: 'passed', title: 'control' }] }] }), 1)).toEqual({ exit: 1, failed: ['expected failure'] });
    expect(read('{"testResults":[]}')).toEqual({ exit: 0, failed: [] });
  });
});

const decisionsSource = readFileSync(new URL('../../../../scripts/mutation-verdict.mjs', import.meta.url), 'utf8');
const decisions = runInNewContext(decisionsSource.replaceAll('export function ', 'function ') + '\n({ isRedBaseline, mutationVerdict, strictExitCode })');
describe('mutation runner decisions', () => {
  it('rejects missing or malformed reports even when the process exits successfully', () => {
    for (const exit of [0, 1, -1]) {
      const result = { exit, failed: null };
      expect(decisions.isRedBaseline(result)).toBe(true);
      const row = decisions.mutationVerdict(result, 'guard');
      expect(row.verdict).toBe('ERROR');
      expect(decisions.strictExitCode([row], true)).toBe(1);
    }
  });
  it('distinguishes targeted kills, unrelated failures and survivors', () => {
    for (const [result, verdict] of [
      [{ exit: 1, failed: ['specific guard'] }, 'KILLED'],
      [{ exit: 1, failed: ['unrelated'] }, 'SUSPECT'],
      [{ exit: 1, failed: [] }, 'SUSPECT'],
      [{ exit: 0, failed: ['unrelated'] }, 'SUSPECT'],
      [{ exit: 0, failed: [] }, 'SURVIVED']
    ]) {
      const row = decisions.mutationVerdict(result, 'guard');
      expect(row.verdict).toBe(verdict);
      expect(decisions.strictExitCode([row], true)).toBe(verdict === 'KILLED' ? 0 : 1);
      expect(decisions.strictExitCode([row], false)).toBe(0);
      expect(decisions.isRedBaseline(result)).toBe(verdict !== 'SURVIVED');
    }
  });
});
