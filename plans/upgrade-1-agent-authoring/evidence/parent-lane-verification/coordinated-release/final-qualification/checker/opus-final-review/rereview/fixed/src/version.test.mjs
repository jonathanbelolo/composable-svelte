import test from 'node:test';
import assert from 'node:assert/strict';
import { isVersion, compareVersions, isRegistrySpec } from './version.mjs';

test('isVersion accepts canonical SemVer with prerelease and build metadata', () => {
  const valid = [
    '0.0.0', '1.2.3', '10.20.30', '1.0.0-0', '1.0.0-alpha',
    '1.0.0-alpha.1', '1.0.0-0.3.7', '1.0.0-next.0', '1.0.0-alpha+001',
    '1.0.0+20130313144700', '1.0.0-beta+exp.sha.5114f85', '1.0.0+0'
  ];
  for (const v of valid) assert.equal(isVersion(v), true, `expected valid: ${v}`);
});

test('isVersion rejects invalid syntax, whitespace, v-prefix, leading zeroes', () => {
  const invalid = [
    null, undefined, 123, {}, '', ' 1.0.0', '1.0.0 ', '1.0. 0', 'v1.0.0',
    '01.0.0', '1.02.0', '1.0.03', '1.0', '1', '1.0.0.', '1..0',
    '1.0.0-', '1.0.0-alpha..1', '1.0.0+', '1.0.0-01', '1.0.0-alpha.01',
    '1.0.0-alpha_beta'
  ];
  for (const v of invalid) assert.equal(isVersion(v), false, `expected invalid: ${v}`);
});

test('isRegistrySpec accepts canonical SemVer with optional single ^ or ~ prefix', () => {
  const valid = ['1.2.3', '^1.2.3', '~1.2.3', '^0.0.0', '~2.1.0-alpha.1', '^1.0.0+build'];
  for (const s of valid) assert.equal(isRegistrySpec(s), true, `expected valid spec: ${s}`);
});

test('isRegistrySpec rejects invalid syntax, tags, files, git, alias, wildcards', () => {
  const invalid = [
    null, undefined, '', '^^1.0.0', '~~1.0.0', '^~1.0.0', '^v1.0.0', '~ 1.0.0',
    'latest', 'beta', 'next', 'file:../pkg', 'file:./app.tgz',
    'git+https://github.com/org/repo.git', 'git://github.com/org/repo',
    'npm:foo@^1.0.0', '*', '1.x', '>=1.0.0', '^01.0.0', '^1.0.0-01'
  ];
  for (const s of invalid) assert.equal(isRegistrySpec(s), false, `expected invalid spec: ${s}`);
});

test('compareVersions precedence: core components take precedence', () => {
  assert.equal(compareVersions('2.0.0', '1.9.9'), 1);
  assert.equal(compareVersions('1.9.9', '2.0.0'), -1);
  assert.equal(compareVersions('1.1.0', '1.0.9'), 1);
  assert.equal(compareVersions('1.0.1', '1.0.0'), 1);
  assert.equal(compareVersions('2.0.0-alpha', '1.9.9'), 1);
});

test('compareVersions precedence: exact next.0 < next.1 < next.10 < release', () => {
  const chain = ['1.0.0-next.0', '1.0.0-next.1', '1.0.0-next.10', '1.0.0'];
  for (let i = 0; i < chain.length - 1; i++) {
    assert.equal(compareVersions(chain[i], chain[i + 1]), -1);
    assert.equal(compareVersions(chain[i + 1], chain[i]), 1);
    assert.equal(compareVersions(chain[i], chain[i]), 0);
  }
});

test('compareVersions precedence: numeric vs lexical and prefix length', () => {
  assert.equal(compareVersions('1.0.0-1', '1.0.0-alpha'), -1);
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-1'), 1);
  assert.equal(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
  assert.equal(compareVersions('1.0.0-beta.2', '1.0.0-beta.11'), -1);
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-beta'), -1);
  assert.equal(compareVersions('1.0.0-beta.11', '1.0.0-rc.1'), -1);
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(compareVersions('1.0.0-alpha.1', '1.0.0-alpha'), 1);
});

test('compareVersions: build metadata ignored (buildidentitycompare0)', () => {
  assert.equal(compareVersions('1.0.0+1', '1.0.0+2'), 0);
  assert.equal(compareVersions('1.0.0-alpha+build.01', '1.0.0-alpha+build.02'), 0);
  assert.equal(compareVersions('1.0.0', '1.0.0+build'), 0);
  assert.equal(compareVersions('1.0.0+00', '1.0.0+0'), 0);
});

test('compareVersions: arbitrarily long huge identifiers without precision loss', () => {
  const hugeA = '9999999999999999999999999999999999999999.0.0';
  const hugeB = '10000000000000000000000000000000000000000.0.0';
  assert.equal(compareVersions(hugeA, hugeB), -1);
  assert.equal(compareVersions(hugeB, hugeA), 1);
  const safePlus1 = '1.0.0-alpha.9007199254740992';
  const safePlus2 = '1.0.0-alpha.9007199254740993';
  assert.equal(compareVersions(safePlus1, safePlus2), -1);
  assert.equal(compareVersions(safePlus2, safePlus1), 1);
  assert.equal(compareVersions(safePlus1, safePlus1), 0);
});

test('compareVersions: throws TypeError on invalid versions', () => {
  const invalidCases = [
    ['not-a-version', '1.0.0'],
    ['1.0.0', 'not-a-version'],
    ['v1.0.0', '1.0.0'],
    ['1.0.0-01', '1.0.0'],
    [null, '1.0.0'],
    ['1.0.0', undefined],
    ['', '1.0.0']
  ];
  for (const [l, r] of invalidCases) {
    assert.throws(() => compareVersions(l, r), TypeError);
  }
});
