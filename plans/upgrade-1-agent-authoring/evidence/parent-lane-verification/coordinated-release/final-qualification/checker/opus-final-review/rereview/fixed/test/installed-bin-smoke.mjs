import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync, realpathSync} from 'node:fs';
import {join, resolve} from 'node:path';

assert.ok(process.argv[2], 'Provide a physically installed external starter directory.');
// Canonicalize the caller's path first (macOS /var -> /private/var) so only links inside the project are rejected.
const project = realpathSync(resolve(process.argv[2]));
for (const name of ['@composable-svelte/core', '@composable-svelte/architecture']) {
  const root = join(project, 'node_modules', name);
  assert.equal(realpathSync(root), root, `${name} package root must not be a workspace link`);
}
const architecture = JSON.parse(readFileSync(join(project, 'node_modules/@composable-svelte/architecture/package.json'), 'utf8'));
const core = JSON.parse(readFileSync(join(project, 'node_modules/@composable-svelte/core/package.json'), 'utf8'));
assert.equal(architecture.version, '0.13.1');
assert.equal(core.version, architecture.version);
const bin = join(project, 'node_modules/.bin/composable-svelte-architecture');
const args = mode => ['--mode', mode, '--project', project, '--policy', 'bundled:starter', '--expected-core-version', core.version];
const analysis = spawnSync(bin, args('analysis-only'), {encoding: 'utf8'});
assert.ifError(analysis.error);
assert.equal(analysis.status, 0, analysis.stderr);
const result = JSON.parse(analysis.stdout);
assert.equal(result.qualification, 'not-evaluated');
assert.equal(result.violationsComplete, true);
assert.equal(result.rules.enforcedCount, 5);
assert.equal(result.checker.version, architecture.version);
assert.equal(result.manualReviewRequired, true);
assert.deepEqual(result.analysisErrors, []);
assert.deepEqual(result.violations, []);
const refused = spawnSync(bin, args('qualification'), {encoding: 'utf8'});
assert.ifError(refused.error);
assert.equal(refused.status, 22, refused.stderr);
assert.equal(refused.stdout, '');
console.log(JSON.stringify({project, status: 'installed-bin-smoke-passed', analysis: result, bundledQualificationExit: refused.status}, null, 2));
