import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {
  ArchiveExtractionSecurityError,
  ArchiveFileCountMismatchError,
  ArchiveHashMismatchError,
  ArchiveIntegrityMismatchError,
  ArchiveNameMismatchError,
  ArchiveVersionMismatchError,
  InstalledFileMismatchError,
  ManifestValidationError,
  freezeCandidateArchives,
  inspectTarEntries,
  readTarFile,
  resolveSveltePin,
  safeExtractTar,
  sha256File,
  sha256Hex,
  validateManifest,
  verifyAllInstalledCandidatePackages,
  verifyArchivesPreInstall,
  verifyInstalledFiles,
  verifyInstalledSvelteVersion,
  writeReceipts
} from './verify-release-archives.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./verify-release-archives.mjs', import.meta.url));
const REPO_ROOT = resolve(dirname(SCRIPT_PATH), '..');

function createTarball(dir, tarballPath) {
  spawnSync('tar', ['-czf', tarballPath, '-C', dir, 'package']);
  assert.ok(existsSync(tarballPath), `Failed to create tarball at ${tarballPath}`);
  return {
    path: tarballPath,
    sha256: sha256File(tarballPath)
  };
}

function createDummyPackage(scratch, name, version, files = {}) {
  const pkgDir = join(scratch, 'create-pkg-' + Math.random().toString(36).slice(2), 'package');
  mkdirSync(pkgDir, {recursive: true});

  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({
    name,
    version,
    type: 'module',
    main: 'index.js'
  }, null, 2));

  writeFileSync(join(pkgDir, 'index.js'), 'export const hello = "world";\n');

  for (const [relPath, content] of Object.entries(files)) {
    const filePath = join(pkgDir, relPath);
    mkdirSync(dirname(filePath), {recursive: true});
    writeFileSync(filePath, content);
  }

  const tarballPath = join(scratch, `${name.replace(/[@/]/g, '-')}-${version}.tgz`);
  const tb = createTarball(dirname(pkgDir), tarballPath);
  return {
    name,
    version,
    path: tb.path,
    sha256: tb.sha256
  };
}

// ---------------------------------------------------------------------------
// 1. Manifest Validation Tests
// ---------------------------------------------------------------------------

test('validateManifest: accepts valid manifest with packages array', () => {
  const raw = {
    schema: 'composable-svelte/release-archives-manifest/v1',
    packages: [
      {
        name: '@composable-svelte/core',
        version: '0.13.0',
        path: '/absolute/path/core.tgz',
        sha256: 'a'.repeat(64)
      }
    ],
    sveltePins: {
      starter: '5.57.0',
      newerCompanions: '5.55.3'
    },
    evidenceDir: '/absolute/evidence'
  };

  const validated = validateManifest(raw);
  assert.equal(validated.packages.length, 1);
  assert.equal(validated.packages[0].name, '@composable-svelte/core');
  assert.equal(validated.packages[0].version, '0.13.0');
  assert.equal(validated.packages[0].sha256, 'a'.repeat(64));
  assert.equal(validated.sveltePins.starter, '5.57.0');
  assert.equal(validated.evidenceDir, '/absolute/evidence');
});

test('validateManifest: accepts archives alias for packages', () => {
  const raw = {
    archives: [
      {
        name: '@composable-svelte/auth',
        version: '0.2.1',
        path: '/absolute/path/auth.tgz',
        sha256: 'b'.repeat(64)
      }
    ]
  };

  const validated = validateManifest(raw);
  assert.equal(validated.packages.length, 1);
  assert.equal(validated.packages[0].name, '@composable-svelte/auth');
});

test('validateManifest: rejects invalid manifests with ManifestValidationError', () => {
  assert.throws(() => validateManifest(null), ManifestValidationError);
  assert.throws(() => validateManifest([]), ManifestValidationError);
  assert.throws(() => validateManifest({}), ManifestValidationError);
  assert.throws(() => validateManifest({packages: []}), ManifestValidationError);

  // Invalid package name
  assert.throws(() => validateManifest({
    packages: [{name: 'INVALID_NAME', version: '1.0.0', path: '/a/b.tgz', sha256: 'a'.repeat(64)}]
  }), ManifestValidationError);

  // Relative path
  assert.throws(() => validateManifest({
    packages: [{name: '@composable-svelte/core', version: '1.0.0', path: 'relative/b.tgz', sha256: 'a'.repeat(64)}]
  }), ManifestValidationError);

  // Invalid SemVer
  assert.throws(() => validateManifest({
    packages: [{name: '@composable-svelte/core', version: '1.0', path: '/a/b.tgz', sha256: 'a'.repeat(64)}]
  }), ManifestValidationError);

  // Invalid SHA256 (short)
  assert.throws(() => validateManifest({
    packages: [{name: '@composable-svelte/core', version: '1.0.0', path: '/a/b.tgz', sha256: 'abc'}]
  }), ManifestValidationError);

  // Duplicate package entries
  assert.throws(() => validateManifest({
    packages: [
      {name: '@composable-svelte/core', version: '1.0.0', path: '/a/b.tgz', sha256: 'a'.repeat(64)},
      {name: '@composable-svelte/core', version: '1.0.1', path: '/a/c.tgz', sha256: 'b'.repeat(64)}
    ]
  }), ManifestValidationError);
});

// ---------------------------------------------------------------------------
// 2. Preflight Archive Verification (Mismatches Rejected BEFORE Any Installs)
// ---------------------------------------------------------------------------

test('verifyArchivesPreInstall: rejects non-existent archive file', (t) => {
  const manifest = validateManifest({
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.0',
      path: '/non/existent/archive.tgz',
      sha256: 'a'.repeat(64)
    }]
  });

  assert.throws(() => verifyArchivesPreInstall(manifest), /Archive file not found/);
});

test('verifyArchivesPreInstall: rejects archive hash mismatch BEFORE install', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-harness-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0');

  // Deliberately declare wrong SHA-256
  const wrongSha = 'f'.repeat(64);
  const manifest = validateManifest({
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.0',
      path: pkg.path,
      sha256: wrongSha
    }]
  });

  assert.throws(
    () => verifyArchivesPreInstall(manifest),
    (err) => err instanceof ArchiveHashMismatchError && err.expectedSha256 === wrongSha
  );
});

test('verifyArchivesPreInstall: rejects archive package name mismatch BEFORE install', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-harness-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  // Create package with name 'wrong-name'
  const pkg = createDummyPackage(scratch, 'wrong-name', '0.13.0');

  // Manifest declares '@composable-svelte/core'
  const manifest = validateManifest({
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.0',
      path: pkg.path,
      sha256: pkg.sha256
    }]
  });

  assert.throws(
    () => verifyArchivesPreInstall(manifest),
    (err) => err instanceof ArchiveNameMismatchError && err.expectedName === '@composable-svelte/core'
  );
});

test('verifyArchivesPreInstall: rejects archive package version mismatch BEFORE install', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-harness-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  // Create package with version 0.12.0
  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.12.0');

  // Manifest declares 0.13.0
  const manifest = validateManifest({
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.0',
      path: pkg.path,
      sha256: pkg.sha256
    }]
  });

  assert.throws(
    () => verifyArchivesPreInstall(manifest),
    (err) => err instanceof ArchiveVersionMismatchError && err.expectedVersion === '0.13.0'
  );
});

test('verifyArchivesPreInstall: rejects archive fileCount mismatch BEFORE install', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-harness-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0');

  // Manifest declares wrong fileCount
  const manifest = validateManifest({
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.0',
      path: pkg.path,
      sha256: pkg.sha256,
      fileCount: 9999
    }]
  });

  assert.throws(
    () => verifyArchivesPreInstall(manifest),
    ArchiveFileCountMismatchError
  );
});

test('verifyArchivesPreInstall: passes when archive hash, name, version match', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-harness-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0');

  const manifest = validateManifest({
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.0',
      path: pkg.path,
      sha256: pkg.sha256
    }]
  });

  const outcome = verifyArchivesPreInstall(manifest);
  assert.equal(outcome.preflightPassed, true);
  assert.equal(outcome.archives.length, 1);
  assert.equal(outcome.archives[0].sha256, pkg.sha256);
});

// ---------------------------------------------------------------------------
// 3. Tar Inspection & Safe Extraction Tests
// ---------------------------------------------------------------------------

test('safeExtractTar: extracts archive safely into target directory', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-tar-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0', {
    'dist/index.js': 'console.log("dist");\n'
  });

  const target = join(scratch, 'extracted');
  safeExtractTar(pkg.path, target, {stripComponents: 1});

  assert.ok(existsSync(join(target, 'package.json')));
  assert.ok(existsSync(join(target, 'index.js')));
  assert.ok(existsSync(join(target, 'dist/index.js')));
});

// ---------------------------------------------------------------------------
// 4. Exact Installed File Verification Against Archive Tests
// ---------------------------------------------------------------------------

test('verifyInstalledFiles: passes when installed files match archive exactly', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-installed-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0', {
    'dist/core.js': 'export const core = 1;\n'
  });

  const installedDir = join(scratch, 'installed-core');
  safeExtractTar(pkg.path, installedDir, {stripComponents: 1});

  const result = verifyInstalledFiles(pkg.path, installedDir, '@composable-svelte/core');
  assert.equal(result.verifiedMatched, true);
  assert.equal(result.totalFiles, 3); // package.json, index.js, dist/core.js
});

test('verifyInstalledFiles: rejects tampered byte content in installed files', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-installed-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0', {
    'dist/core.js': 'export const core = 1;\n'
  });

  const installedDir = join(scratch, 'installed-core');
  safeExtractTar(pkg.path, installedDir, {stripComponents: 1});

  // Tamper with installed file
  writeFileSync(join(installedDir, 'dist/core.js'), 'export const tampered = 2;\n');

  assert.throws(
    () => verifyInstalledFiles(pkg.path, installedDir, '@composable-svelte/core'),
    InstalledFileMismatchError
  );
});

test('verifyInstalledFiles: rejects missing file in installed directory', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-installed-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0', {
    'dist/core.js': 'export const core = 1;\n'
  });

  const installedDir = join(scratch, 'installed-core');
  safeExtractTar(pkg.path, installedDir, {stripComponents: 1});

  // Delete installed file
  rmSync(join(installedDir, 'dist/core.js'));

  assert.throws(
    () => verifyInstalledFiles(pkg.path, installedDir, '@composable-svelte/core'),
    InstalledFileMismatchError
  );
});

test('verifyInstalledFiles: rejects unexpected extraneous file in installed directory', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-installed-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0');

  const installedDir = join(scratch, 'installed-core');
  safeExtractTar(pkg.path, installedDir, {stripComponents: 1});

  // Inject unexpected file
  writeFileSync(join(installedDir, 'rogue-script.js'), 'malicious();\n');

  assert.throws(
    () => verifyInstalledFiles(pkg.path, installedDir, '@composable-svelte/core'),
    InstalledFileMismatchError
  );
});

// ---------------------------------------------------------------------------
// 5. Receipts Generation & Content Tests
// ---------------------------------------------------------------------------

test('writeReceipts: outputs structured JSON and markdown summary', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-receipts-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const evidenceDir = join(scratch, 'evidence');
  const dummyReceipt = {
    timestamp: new Date().toISOString(),
    verdict: 'PASSED',
    manifest: {schema: 'composable-svelte/release-archives-manifest/v1'},
    preflight: {
      archives: [{name: '@composable-svelte/core', version: '0.13.0', sha256: 'a'.repeat(64), fileCount: 10, sizeBytes: 1024}],
      checker: null,
      policy: null
    },
    transport: {
      type: 'local-candidate-tarball',
      statement: 'Local candidate transport; not fetched from npmjs.org',
      registryProvenanceClaimed: false
    },
    recipes: [{name: 'core-starter', sveltePin: '5.57.0', status: 'passed', recipeSource: 'shipped', commands: []}],
    architectureQualification: null,
    negativeControls: [{control: 'wrong-archive-hash', expectedOutcome: 'rejected', actualOutcome: 'rejected', passed: true}]
  };

  const {receiptPath, summaryPath} = writeReceipts(evidenceDir, dummyReceipt);

  assert.ok(existsSync(receiptPath));
  assert.ok(existsSync(summaryPath));

  const jsonContent = JSON.parse(readFileSync(receiptPath, 'utf8'));
  assert.equal(jsonContent.verdict, 'PASSED');
  assert.equal(jsonContent.transport.registryProvenanceClaimed, false);

  const mdContent = readFileSync(summaryPath, 'utf8');
  assert.ok(mdContent.includes('# Final Immutable Archive Qualification Receipt'));
  assert.ok(mdContent.includes('PASSED'));
  assert.ok(mdContent.includes('@composable-svelte/core'));
  assert.ok(mdContent.includes('local-candidate-tarball'));
});

// ---------------------------------------------------------------------------
// 6. CLI Invocation & Preflight Mode Integration Tests
// ---------------------------------------------------------------------------

test('CLI: --mode preflight validates manifest and archives via child process', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-cli-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0');
  const manifestPath = join(scratch, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({
    schema: 'composable-svelte/release-archives-manifest/v1',
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.0',
      path: pkg.path,
      sha256: pkg.sha256
    }]
  }, null, 2));

  const res = spawnSync(process.execPath, [SCRIPT_PATH, '--manifest', manifestPath, '--mode', 'preflight'], {
    encoding: 'utf8'
  });

  assert.equal(res.status, 0, res.stderr);
  assert.ok(res.stdout.includes('Preflight archive verification'));
  assert.ok(res.stdout.includes('Verified 1 package archives'));
});

test('CLI: --mode preflight fails with exit code 1 on corrupted archive hash', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-cli-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0');
  const manifestPath = join(scratch, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({
    schema: 'composable-svelte/release-archives-manifest/v1',
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.0',
      path: pkg.path,
      sha256: '0'.repeat(64) // Wrong hash
    }]
  }, null, 2));

  const res = spawnSync(process.execPath, [SCRIPT_PATH, '--manifest', manifestPath, '--mode', 'preflight'], {
    encoding: 'utf8'
  });

  assert.equal(res.status, 1);
  assert.ok(res.stderr.includes('Archive sha256 mismatch') || res.stderr.includes('ArchiveHashMismatchError'));
});

// ---------------------------------------------------------------------------
// 7. Negative Controls & Architecture Qualification Tests
// ---------------------------------------------------------------------------

test('runNegativeControls: verifies wrong-archive-hash and wrong-archive-version controls', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-neg-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0');
  const manifest = validateManifest({
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.0',
      path: pkg.path,
      sha256: pkg.sha256
    }]
  });

  const {runNegativeControls} = await import('./verify-release-archives.mjs');
  const results = runNegativeControls({
    scratchDir: scratch,
    validatedManifest: manifest,
    checker: null,
    policy: null,
    corePkg: manifest.packages[0]
  });

  assert.equal(results.length, 3);
  assert.equal(results[0].control, 'wrong-archive-hash');
  assert.equal(results[0].passed, true);
  assert.equal(results[1].control, 'wrong-archive-version');
  assert.equal(results[1].passed, true);
  assert.equal(results[2].control, 'missing-recipe-directory');
  assert.equal(results[2].passed, true);
});

test('runNegativeControls: verifies checker controls when checker and policy available', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-checker-neg-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  // Create real dummy packages for core and architecture
  const corePkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0', {
    'index.js': 'export const Effect = {none: () => ({type: "none"})};\n'
  });

  // Pack the checker as it ships: npm pack applies its `files` list and leaves out the installed
  // dependency tree, whose workspace symlinks the archive guard rightly rejects.
  const archDir = join(REPO_ROOT, 'packages/architecture');
  const archVersion = JSON.parse(readFileSync(join(archDir, 'package.json'), 'utf8')).version;
  const packed = spawnSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', scratch, '--loglevel', 'error'], {cwd: archDir, encoding: 'utf8'});
  assert.equal(packed.status, 0, packed.stderr);
  const archTarballPath = join(scratch, JSON.parse(packed.stdout)[0].filename);

  // Create a minimal external policy
  const policyFile = join(scratch, 'external-policy.json');
  const policyData = {
    schema: 'composable-svelte/consumer-architecture-policy',
    schemaVersion: 2,
    catalogVersion: 2,
    policyId: 'test-policy',
    policyVersion: '1.0.0',
    supportedCore: {min: '0.13.0', maxExclusive: '0.14.0-0'},
    project: {tsconfig: 'tsconfig.json', roots: ['src/main.ts']},
    rules: {
      active: [
        {id: 'routing/no-manual-browser-authority', severity: 'error'},
        {id: 'presentation/no-subscription-orchestration', severity: 'error'},
        {id: 'reducers/pure-decisions', severity: 'error'},
        {id: 'resources/no-unowned-infrastructure', severity: 'error'},
        {id: 'motion/no-competing-playback', severity: 'error'}
      ],
      inactive: [
        {id: 'presentation/no-fabricated-view', reason: 'supported-replacement-pending', detail: 'staged'},
        {id: 'adapters/least-authority', reason: 'supported-replacement-pending', detail: 'staged'}
      ]
    },
    capabilityGrants: [],
    qualificationRecords: [],
    exceptions: [],
    opaquePackages: [
      {name: '@composable-svelte/core', version: '0.13.0', provenance: 'registry'},
      {name: 'svelte', version: '5.57.0', provenance: 'registry'}
    ]
  };
  const policyText = JSON.stringify(policyData, null, 2);
  writeFileSync(policyFile, policyText);
  const policySha = sha256Hex(Buffer.from(policyText, 'utf8'));

  const manifest = validateManifest({
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.0',
      path: corePkg.path,
      sha256: corePkg.sha256
    }],
    checkerArchive: {
      name: '@composable-svelte/architecture',
      version: archVersion,
      path: archTarballPath,
      sha256: sha256File(archTarballPath)
    },
    policy: {
      path: policyFile,
      sha256: policySha,
      expectedCoreVersion: '0.13.0'
    }
  });

  const preflight = verifyArchivesPreInstall(manifest);

  const {runArchitectureQualification, runNegativeControls} = await import('./verify-release-archives.mjs');

  // Verify architecture qualification pass in explicit synthetic smoke mode
  const qualResult = runArchitectureQualification({
    scratchDir: scratch,
    checker: preflight.checker,
    policy: preflight.policy,
    corePkg: preflight.archives[0],
    syntheticSmoke: true
  });

  assert.equal(qualResult.status, 'passed');
  assert.equal(qualResult.qualification, 'passed');
  assert.equal(qualResult.manualReviewRequired, true);

  // Verify all 6 negative controls
  const negResults = runNegativeControls({
    scratchDir: scratch,
    validatedManifest: manifest,
    checker: preflight.checker,
    policy: preflight.policy,
    corePkg: preflight.archives[0]
  });

  assert.equal(negResults.length, 6);
  for (const nr of negResults) {
    assert.equal(nr.passed, true, `Control ${nr.control} should have passed rejection verification`);
  }
});

// ---------------------------------------------------------------------------
// 8. Candidate Transport & Optional Absence Verification Tests
// ---------------------------------------------------------------------------

test('candidate transport honestly identifies local tarball transport and denies registry provenance', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-transport-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0');
  const targetDir = join(scratch, 'consumer');
  mkdirSync(targetDir, {recursive: true});

  const {materializeCandidatePackages} = await import('./verify-release-archives.mjs');
  const transport = materializeCandidatePackages(targetDir, [{
    name: '@composable-svelte/core',
    version: '0.13.0',
    path: pkg.path,
    sha256: pkg.sha256
  }], {unpackedRoot: scratch});

  assert.equal(transport.transportType, 'local-candidate-tarball');
  assert.equal(transport.registryProvenanceClaimed, false);
  assert.ok(transport.honestIdentity.includes('no registry provenance fabricated') || transport.honestIdentity.includes('without fabricating'));
  assert.equal(transport.installedPackages[0].verifiedAgainstArchive, true);
});

test('CLI: --mode negative-controls runs and writes evidence receipts', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-cli-neg-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0');
  const evidenceDir = join(scratch, 'evidence');
  const manifestPath = join(scratch, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({
    schema: 'composable-svelte/release-archives-manifest/v1',
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.0',
      path: pkg.path,
      sha256: pkg.sha256
    }],
    evidenceDir
  }, null, 2));

  const res = spawnSync(process.execPath, [
    SCRIPT_PATH,
    '--manifest', manifestPath,
    '--mode', 'negative-controls'
  ], {encoding: 'utf8'});

  // Without a checker and policy the checker controls cannot run: partial, and exit 2 rather than 0.
  assert.equal(res.status, 2, res.stderr);
  assert.ok(res.stdout.includes('Qualification VERDICT: PARTIAL_NEGATIVE_CONTROLS_CHECKER_PENDING'));
  assert.ok(existsSync(join(evidenceDir, 'qualification-receipt.json')));
  assert.ok(existsSync(join(evidenceDir, 'SUMMARY.md')));

  const receipt = JSON.parse(readFileSync(join(evidenceDir, 'qualification-receipt.json'), 'utf8'));
  assert.equal(receipt.verdict, 'PARTIAL_NEGATIVE_CONTROLS_CHECKER_PENDING');
  assert.equal(receipt.status, 'PARTIAL');
  assert.equal(receipt.fullQualificationClaimed, false);
  assert.equal(receipt.negativeControls.length, 3);
  assert.equal(receipt.negativeControls[0].passed, true);
});

test('verifyArchivesPreInstall: rejects archive integrity mismatch BEFORE install', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-integrity-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0');

  const manifest = validateManifest({
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.0',
      path: pkg.path,
      sha256: pkg.sha256,
      integrity: 'sha512-wrongintegritysha512string=='
    }]
  });

  assert.throws(
    () => verifyArchivesPreInstall(manifest),
    ArchiveIntegrityMismatchError
  );
});

test('runVerification: mode qualification rejects when checker, policy, or core are missing', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-mode-qual-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0');
  const {runVerification} = await import('./verify-release-archives.mjs');

  // Missing checkerArchive and policy in qualification mode
  await assert.rejects(
    async () => {
      await runVerification({
        packages: [{
          name: '@composable-svelte/core',
          version: '0.13.0',
          path: pkg.path,
          sha256: pkg.sha256
        }]
      }, {mode: 'qualification'});
    },
    (err) => err instanceof ManifestValidationError && err.message.includes('checkerArchive')
  );
});

test('runVerification: mode all with skipBrowser produces PARTIAL receipt and does not claim full pass', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-partial-receipt-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.0');
  const evidenceDir = join(scratch, 'evidence');
  const {runVerification} = await import('./verify-release-archives.mjs');

  const result = await runVerification({
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.0',
      path: pkg.path,
      sha256: pkg.sha256
    }],
    evidenceDir
  }, {mode: 'all', skipBrowser: true, recipes: 'none'});

  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.fullQualificationClaimed, false);
  assert.ok(result.verdict.startsWith('PARTIAL_'));
  assert.ok(result.incompleteReasons.length > 0);

  const receipt = JSON.parse(readFileSync(join(evidenceDir, 'qualification-receipt.json'), 'utf8'));
  assert.equal(receipt.status, 'PARTIAL');
  assert.equal(receipt.fullQualificationClaimed, false);
  assert.ok(receipt.incompleteReasons.some(r => r.includes('Browser tests were skipped')));
});

// ---------------------------------------------------------------------------
// 9. Freeze Archives & Svelte Pin Unit Tests
// ---------------------------------------------------------------------------

test('freezeCandidateArchives: copies candidate archives to isolated cache and verifies integrity', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-freeze-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.1', {
    'index.js': 'export const v = 1;\n'
  });
  const freezeDir = join(scratch, 'frozen-cache');

  const frozen = freezeCandidateArchives([pkg], freezeDir);
  assert.equal(frozen.archives.length, 1);
  assert.equal(existsSync(frozen.archives[0].frozenPath), true);
  assert.equal(frozen.archives[0].originalPath, pkg.path);
  assert.equal(frozen.archives[0].sha256, pkg.sha256);

  // Modifying the original file after freeze does not affect the frozen archive
  writeFileSync(pkg.path, 'corrupted original content');
  const frozenSha = sha256File(frozen.archives[0].frozenPath);
  assert.equal(frozenSha, pkg.sha256, 'Frozen archive must be protected from mutations to the original source');
});

test('freezeCandidateArchives: rejects if candidate archive hash fails verification in freeze cache', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-freeze-err-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.1');
  const freezeDir = join(scratch, 'frozen-cache');

  // Alter expected sha256 to simulate corruption detection
  const tamperedPkg = {
    ...pkg,
    sha256: '0000000000000000000000000000000000000000000000000000000000000000'
  };

  assert.throws(
    () => freezeCandidateArchives([tamperedPkg], freezeDir),
    ArchiveHashMismatchError
  );
});

test('verifyInstalledSvelteVersion: passes when installed Svelte version matches exact pin and throws on mismatch', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-svelte-pin-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const svelteDir = join(scratch, 'node_modules/svelte');
  mkdirSync(svelteDir, {recursive: true});
  writeFileSync(join(svelteDir, 'package.json'), JSON.stringify({name: 'svelte', version: '5.57.0'}));

  const res = verifyInstalledSvelteVersion(scratch, '5.57.0');
  assert.equal(res.verified, true);
  assert.equal(res.expected, '5.57.0');
  assert.equal(res.actual, '5.57.0');

  // Mismatch must throw descriptive Error
  assert.throws(
    () => verifyInstalledSvelteVersion(scratch, '5.55.3'),
    /Installed Svelte version mismatch in .*: expected exact pin 5.55.3, but got 5.57.0/
  );

  // Missing svelte directory must throw
  const emptyScratch = join(scratch, 'empty-app');
  mkdirSync(emptyScratch);
  assert.throws(
    () => verifyInstalledSvelteVersion(emptyScratch, '5.57.0'),
    /svelte\/package\.json not found/
  );
});

test('resolveSveltePin: correctly resolves starter, newer, and minimum checkpoints', () => {
  const pins = {
    starter: '5.57.0',
    newerCompanions: '5.55.3',
    minimumCode: '5.30.0',
    minimumGeneral: '5.20.0'
  };

  // Starter always gets starter pin
  assert.equal(resolveSveltePin({recipeName: 'core-starter', checkpoint: 'newer', sveltePins: pins}), '5.57.0');
  assert.equal(resolveSveltePin({recipeName: 'core-starter', checkpoint: 'minimum', sveltePins: pins}), '5.57.0');

  // Newer checkpoint resolves newerCompanions (5.55.3)
  assert.equal(resolveSveltePin({recipeName: 'auth-consumer', checkpoint: 'newer', sveltePins: pins}), '5.55.3');
  assert.equal(resolveSveltePin({recipeName: 'code-managed', checkpoint: 'newer', sveltePins: pins}), '5.55.3');
  assert.equal(resolveSveltePin({recipeName: 'chat-managed', checkpoint: 'newer', sveltePins: pins}), '5.55.3');

  // Minimum checkpoint resolves minimumGeneral (5.20.0) except for code/combined (5.30.0)
  assert.equal(resolveSveltePin({recipeName: 'auth-consumer', checkpoint: 'minimum', sveltePins: pins}), '5.20.0');
  assert.equal(resolveSveltePin({recipeName: 'maps-fixture', checkpoint: 'minimum', sveltePins: pins}), '5.20.0');
  assert.equal(resolveSveltePin({recipeName: 'code-managed', checkpoint: 'minimum', sveltePins: pins}), '5.30.0');
  assert.equal(resolveSveltePin({recipeName: 'chat-code-media', checkpoint: 'minimum', sveltePins: pins}), '5.30.0');
});

test('CLI: --svelte-checkpoint flag is accepted and recorded in evidence receipts', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-cli-ckpt-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.1');
  const manifestPath = join(scratch, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.1',
      path: pkg.path,
      sha256: pkg.sha256
    }]
  }));

  const evidenceDir = join(scratch, 'evidence');
  const res = spawnSync('node', [
    SCRIPT_PATH,
    '--manifest', manifestPath,
    '--evidence-dir', evidenceDir,
    '--mode', 'negative-controls',
    '--svelte-checkpoint', 'minimum'
  ], {encoding: 'utf8'});

  assert.equal(res.status, 2, `CLI failed with stderr: ${res.stderr}`);
  const receipt = JSON.parse(readFileSync(join(evidenceDir, 'qualification-receipt.json'), 'utf8'));
  assert.equal(receipt.svelteCheckpoint, 'minimum');
});

test('CLI: invalid --svelte-checkpoint flag is rejected with exit code 1', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-cli-ckpt-err-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.1');
  const manifestPath = join(scratch, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.1',
      path: pkg.path,
      sha256: pkg.sha256
    }]
  }));

  const res = spawnSync('node', [
    SCRIPT_PATH,
    '--manifest', manifestPath,
    '--svelte-checkpoint', 'invalid-version-checkpoint'
  ], {encoding: 'utf8'});

  assert.equal(res.status, 1);
  assert.ok(res.stderr.includes("Invalid svelteCheckpoint 'invalid-version-checkpoint'"));
});

test('Receipts: retain command stdout/stderr logs, lockfile paths, and installedInventory', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-receipt-detail-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.1', {
    'index.js': 'export const v = 1;\n'
  });
  const evidenceDir = join(scratch, 'evidence');
  const {runVerification} = await import('./verify-release-archives.mjs');

  const result = await runVerification({
    packages: [{
      name: '@composable-svelte/core',
      version: '0.13.1',
      path: pkg.path,
      sha256: pkg.sha256
    }],
    evidenceDir
  }, {mode: 'negative-controls', svelteCheckpoint: 'newer'});

  assert.equal(result.status, 'PARTIAL');
  const receipt = JSON.parse(readFileSync(join(evidenceDir, 'qualification-receipt.json'), 'utf8'));

  assert.equal(receipt.svelteCheckpoint, 'newer');
  assert.ok(receipt.transport.archiveFreezing.includes('TOCTOU'));
  assert.ok(receipt.transport.installedFileVerification.includes('immutable archives'));
  assert.equal(receipt.preflight.archives[0].name, '@composable-svelte/core');
  assert.equal(receipt.preflight.archives[0].sha256, pkg.sha256);
});




// ---------------------------------------------------------------------------
// 10. Review corrections: false-pass resistance
// ---------------------------------------------------------------------------

function writeManifest(scratch, pkg, extra = {}) {
  const manifestPath = join(scratch, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify({
    packages: [{name: pkg.name, version: pkg.version, path: pkg.path, sha256: pkg.sha256}],
    ...extra
  }));
  return manifestPath;
}

test('inspectTarEntries: rejects symlink entries and entries outside package/', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-tar-types-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));

  const linked = join(scratch, 'linked');
  mkdirSync(join(linked, 'package'), {recursive: true});
  writeFileSync(join(linked, 'package/package.json'), '{}');
  spawnSync('ln', ['-s', '/etc', join(linked, 'package/escape')]);
  const linkedTar = join(scratch, 'linked.tgz');
  spawnSync('tar', ['-czf', linkedTar, '-C', linked, 'package']);
  assert.throws(() => inspectTarEntries(linkedTar), /Non-regular entry type 'l'/);

  const outside = join(scratch, 'outside');
  mkdirSync(join(outside, 'package'), {recursive: true});
  mkdirSync(join(outside, 'other'), {recursive: true});
  writeFileSync(join(outside, 'package/package.json'), '{}');
  writeFileSync(join(outside, 'other/x.js'), '');
  const outsideTar = join(scratch, 'outside.tgz');
  spawnSync('tar', ['-czf', outsideTar, '-C', outside, 'package', 'other']);
  assert.throws(() => inspectTarEntries(outsideTar), ArchiveExtractionSecurityError);
});

test('CLI: rejects a dual checkpoint, an unknown mode and an unknown recipe instead of running less', (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-cli-inputs-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));
  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.1');
  const manifestPath = writeManifest(scratch, pkg);
  for (const [flags, message] of [
    [['--svelte-checkpoint', 'both'], "Invalid svelteCheckpoint 'both'"],
    [['--mode', 'qualifcation'], "Invalid mode 'qualifcation'"],
    [['--mode', 'recipes', '--recipe', 'core-startr'], "Unknown recipe 'core-startr'"]
  ]) {
    const res = spawnSync(process.execPath, [SCRIPT_PATH, '--manifest', manifestPath, ...flags], {encoding: 'utf8'});
    assert.equal(res.status, 1, flags.join(' '));
    assert.ok(res.stderr.includes(message), res.stderr);
  }
});

test('runVerification: a requested recipe whose package is absent fails instead of being skipped', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-missing-recipe-pkg-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));
  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.1');
  const {runVerification} = await import('./verify-release-archives.mjs');
  await assert.rejects(
    runVerification({packages: [pkg], evidenceDir: join(scratch, 'evidence')}, {mode: 'recipes', recipes: 'chat-managed'}),
    /Recipe 'chat-managed' was requested but the manifest lacks: chat/
  );
});

test('runVerification: a failing rerun replaces a stale PASSED receipt with a FAILED one', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-failure-receipt-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));
  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.1');
  const evidenceDir = join(scratch, 'evidence');
  mkdirSync(evidenceDir);
  writeFileSync(join(evidenceDir, 'qualification-receipt.json'), JSON.stringify({verdict: 'PASSED', status: 'PASSED'}));
  const {runVerification} = await import('./verify-release-archives.mjs');
  await assert.rejects(
    runVerification({packages: [{...pkg, sha256: '0'.repeat(64)}], evidenceDir}, {mode: 'negative-controls'}),
    ArchiveHashMismatchError
  );
  const receipt = JSON.parse(readFileSync(join(evidenceDir, 'qualification-receipt.json'), 'utf8'));
  assert.equal(receipt.status, 'FAILED');
  assert.equal(receipt.fullQualificationClaimed, false);
  assert.equal(receipt.error.name, 'ArchiveHashMismatchError');
  assert.match(readFileSync(join(evidenceDir, 'SUMMARY.md'), 'utf8'), /FAILED/);
});

test('verifyLockedCandidateIdentities: accepts only top-level frozen candidates and rejects registry, nested or altered copies', async (t) => {
  const scratch = mkdtempSync(join(tmpdir(), 'test-lock-identity-'));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));
  const {verifyLockedCandidateIdentities} = await import('./verify-release-archives.mjs');
  const pkg = createDummyPackage(scratch, '@composable-svelte/core', '0.13.1');
  const integrity = 'sha512-' + createHash('sha512').update(readFileSync(pkg.path)).digest('base64');
  const app = join(scratch, 'app');
  mkdirSync(app);
  const good = {name: 'app', lockfileVersion: 3, packages: {
    '': {name: 'app'},
    'node_modules/@composable-svelte/core': {version: '0.13.1', resolved: `file:../${pkg.path.split('/').pop()}`, integrity},
    'node_modules/svelte': {version: '5.57.0', resolved: 'https://registry.npmjs.org/svelte/-/svelte-5.57.0.tgz'}
  }};
  const check = (lock) => {
    writeFileSync(join(app, 'package-lock.json'), JSON.stringify(lock));
    return verifyLockedCandidateIdentities(app, [pkg]);
  };
  assert.equal(check(good).locked.length, 1);
  const variant = (mutate) => { const lock = structuredClone(good); mutate(lock.packages); return lock; };
  assert.throws(() => check(variant(p => { p['node_modules/@composable-svelte/architecture'] = {version: '0.13.0', resolved: 'https://registry.npmjs.org/@composable-svelte/architecture/-/architecture-0.13.0.tgz'}; })), /not a verified candidate/);
  assert.throws(() => check(variant(p => { p['node_modules/x/node_modules/@composable-svelte/core'] = p['node_modules/@composable-svelte/core']; })), /nested copy/);
  assert.throws(() => check(variant(p => { p['node_modules/@composable-svelte/core'].resolved = 'https://registry.npmjs.org/@composable-svelte/core/-/core-0.13.1.tgz'; })), /locked 0.13.1 from https/);
  assert.throws(() => check(variant(p => { p['node_modules/@composable-svelte/core'].integrity = 'sha512-AAAA'; })), /locked integrity/);
  assert.throws(() => check(variant(p => { delete p['node_modules/@composable-svelte/core']; })), /missing from lockfile/);
});
