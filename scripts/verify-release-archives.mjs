#!/usr/bin/env node
/**
 * @file verify-release-archives.mjs
 * Final immutable release archive qualification harness.
 *
 * Verifies frozen, pre-built candidate archives against an explicit JSON manifest:
 * 1. Preflight archive verification (byte/hash/name/version/fileCount) BEFORE installs.
 * 2. Exact installed file verification against archive contents byte-for-byte.
 * 3. Honest candidate tarball transport metadata (no fabricated registry provenance).
 * 4. Registry-shaped public identity installs preserving checker provenance rules.
 * 5. Shipped managed recipe execution across core, auth, charts, graphics, maps, chat, code, media.
 * 6. Optional peer absence verification (e.g. Chat without Code/Media/Prism/PDF).
 * 7. Exact Svelte version pin compliance (starter: 5.57.0, companions newer: 5.55.3, minima: 5.20.0, code minimum: 5.30.0).
 * 8. External policy qualification with exact SHA-256 pin & core pairing verification.
 * 9. Negative controls (wrong archive hash, wrong policy pin, wrong core pin, incomplete analysis).
 * 10. Comprehensive evidence generation with command receipts, exit codes, and output logs.
 */

import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
  cpSync
} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname, isAbsolute, join, normalize, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

import {isQualificationPass, EXIT, LIMITS, QUALIFICATION_SCOPE} from '../packages/architecture/src/check.mjs';
import {validatePolicy} from '../packages/architecture/src/policy.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');

const SHA256_REGEX = /^[0-9a-f]{64}$/;
const PACKAGE_NAME_REGEX = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export const DEFAULT_SVELTE_PINS = Object.freeze({
  starter: '5.57.0',
  newerCompanions: '5.55.3',
  minimumCode: '5.30.0',
  minimumGeneral: '5.20.0'
});

export const ALL_RECIPE_NAMES = Object.freeze([
  'core-starter',
  'auth-consumer',
  'charts-fixture',
  'graphics-fixture',
  'maps-fixture',
  'chat-managed',
  'code-managed',
  'media-managed',
  'chat-code-media'
]);

// Custom error classes for deterministic error classification
export class ManifestValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'ManifestValidationError';
    this.errors = errors;
  }
}

export class ArchiveHashMismatchError extends Error {
  constructor(pkgName, expected, actual, archivePath) {
    super(`Archive sha256 mismatch for ${pkgName} at ${archivePath}: expected ${expected}, got ${actual}`);
    this.name = 'ArchiveHashMismatchError';
    this.packageName = pkgName;
    this.expectedSha256 = expected;
    this.actualSha256 = actual;
    this.archivePath = archivePath;
  }
}

export class ArchiveNameMismatchError extends Error {
  constructor(expected, actual, archivePath) {
    super(`Archive inner package.json name mismatch in ${archivePath}: expected ${expected}, got ${actual}`);
    this.name = 'ArchiveNameMismatchError';
    this.expectedName = expected;
    this.actualName = actual;
  }
}

export class ArchiveVersionMismatchError extends Error {
  constructor(pkgName, expected, actual, archivePath) {
    super(`Archive inner package.json version mismatch for ${pkgName} in ${archivePath}: expected ${expected}, got ${actual}`);
    this.name = 'ArchiveVersionMismatchError';
    this.packageName = pkgName;
    this.expectedVersion = expected;
    this.actualVersion = actual;
  }
}

export class ArchiveFileCountMismatchError extends Error {
  constructor(pkgName, expected, actual, archivePath) {
    super(`Archive file count mismatch for ${pkgName} in ${archivePath}: expected ${expected}, got ${actual}`);
    this.name = 'ArchiveFileCountMismatchError';
  }
}

export class ArchiveIntegrityMismatchError extends Error {
  constructor(pkgName, expected, actual, archivePath) {
    super(`Archive integrity mismatch for ${pkgName} at ${archivePath}: expected ${expected}, got ${actual}`);
    this.name = 'ArchiveIntegrityMismatchError';
    this.packageName = pkgName;
    this.expectedIntegrity = expected;
    this.actualIntegrity = actual;
    this.archivePath = archivePath;
  }
}

export class ArchiveExtractionSecurityError extends Error {
  constructor(reason, entryPath, archivePath) {
    super(`Archive extraction security error: ${reason} (entry: ${entryPath}, archive: ${archivePath})`);
    this.name = 'ArchiveExtractionSecurityError';
  }
}

export class InstalledFileMismatchError extends Error {
  constructor(pkgName, fileRelPath, detail) {
    super(`Installed file mismatch for ${pkgName} at ${fileRelPath}: ${detail}`);
    this.name = 'InstalledFileMismatchError';
    this.packageName = pkgName;
    this.file = fileRelPath;
  }
}

export class PolicyValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'PolicyValidationError';
    this.errors = errors;
  }
}

export class NegativeControlFailedError extends Error {
  constructor(controlName, reason) {
    super(`Negative control '${controlName}' failed to reject invalid input: ${reason}`);
    this.name = 'NegativeControlFailedError';
    this.controlName = controlName;
  }
}

export class RecipeExecutionError extends Error {
  constructor(recipeName, command, exitCode, stderr, stdout) {
    super(`Recipe '${recipeName}' failed at command '${command}' with exit code ${exitCode}:\n${stderr || stdout}`);
    this.name = 'RecipeExecutionError';
    this.recipeName = recipeName;
    this.command = command;
    this.exitCode = exitCode;
    this.stderr = stderr;
    this.stdout = stdout;
  }
}

// ---------------------------------------------------------------------------
// Hash & Tar Utilities
// ---------------------------------------------------------------------------

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toLowerCase();
}

export function sha256File(filePath) {
  const bytes = readFileSync(filePath);
  return sha256Hex(bytes);
}

export function inspectTarEntries(archivePath) {
  assert.ok(existsSync(archivePath), `Tar archive does not exist: ${archivePath}`);
  const output = execFileSync('tar', ['-tzf', archivePath], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  });
  const lines = output.trim().split('\n').filter(Boolean);
  // An npm archive holds only regular files and directories under package/. A symlink, hardlink or
  // device entry could redirect a later write outside the target, so every entry type is checked too.
  const types = execFileSync('tar', ['-tvzf', archivePath], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024})
    .trim().split('\n').filter(Boolean).map(line => line[0]);
  if (types.length !== lines.length) {
    throw new ArchiveExtractionSecurityError('Entry listing and verbose listing disagree', `${lines.length}/${types.length}`, archivePath);
  }
  const entries = [];
  for (const [index, line] of lines.entries()) {
    const rawPath = line.trim();
    // Path traversal security check
    if (rawPath.startsWith('/') || rawPath.includes('../') || rawPath === '..' || rawPath.includes('/..')) {
      throw new ArchiveExtractionSecurityError('Path traversal detected', rawPath, archivePath);
    }
    if (rawPath !== 'package/' && !rawPath.startsWith('package/')) {
      throw new ArchiveExtractionSecurityError('Entry outside package/', rawPath, archivePath);
    }
    if (types[index] !== '-' && types[index] !== 'd') {
      throw new ArchiveExtractionSecurityError(`Non-regular entry type '${types[index]}'`, rawPath, archivePath);
    }
    const isDir = rawPath.endsWith('/');
    entries.push({
      path: rawPath,
      isDirectory: isDir,
      isFile: !isDir
    });
  }
  return entries;
}

export function readTarFile(archivePath, entryPath) {
  assert.ok(existsSync(archivePath), `Archive does not exist: ${archivePath}`);
  return execFileSync('tar', ['-xOf', archivePath, entryPath], {
    maxBuffer: 32 * 1024 * 1024
  });
}

export function safeExtractTar(archivePath, targetDir, {stripComponents = 1} = {}) {
  // Validate all entries before extracting
  const entries = inspectTarEntries(archivePath);
  mkdirSync(targetDir, {recursive: true});

  const args = ['-xzf', archivePath];
  if (stripComponents > 0) {
    args.push(`--strip-components=${stripComponents}`);
  }
  args.push('-C', targetDir);

  execFileSync('tar', args);
  return entries;
}

// ---------------------------------------------------------------------------
// Manifest Validation & Preflight
// ---------------------------------------------------------------------------

export function validateManifest(rawManifest) {
  const errors = [];
  if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
    throw new ManifestValidationError('Manifest must be a JSON object');
  }

  // Support top-level `packages` or `archives`
  const pkgList = Array.isArray(rawManifest.packages)
    ? rawManifest.packages
    : Array.isArray(rawManifest.archives)
      ? rawManifest.archives
      : null;

  if (!pkgList) {
    throw new ManifestValidationError('Manifest must contain a "packages" or "archives" array', [
      {code: 'missing-packages', where: '$.packages', message: 'required packages array is missing'}
    ]);
  }

  if (pkgList.length === 0) {
    throw new ManifestValidationError('Manifest packages array must not be empty', [
      {code: 'empty-packages', where: '$.packages', message: 'at least one package entry is required'}
    ]);
  }

  const normalizedPackages = [];
  const seenNames = new Set();

  for (let i = 0; i < pkgList.length; i++) {
    const entry = pkgList[i];
    const where = `$.packages[${i}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push({code: 'invalid-entry', where, message: 'package entry must be an object'});
      continue;
    }

    // Name
    if (typeof entry.name !== 'string' || !PACKAGE_NAME_REGEX.test(entry.name)) {
      errors.push({code: 'invalid-name', where: `${where}.name`, message: `invalid npm package name: ${entry.name}`});
    } else if (seenNames.has(entry.name)) {
      errors.push({code: 'duplicate-package', where: `${where}.name`, message: `duplicate package entry: ${entry.name}`});
    } else {
      seenNames.add(entry.name);
    }

    // Version
    if (typeof entry.version !== 'string' || !SEMVER_REGEX.test(entry.version)) {
      errors.push({code: 'invalid-version', where: `${where}.version`, message: `expected SemVer version string: ${entry.version}`});
    }

    // Path
    if (typeof entry.path !== 'string' || entry.path.trim().length === 0) {
      errors.push({code: 'missing-path', where: `${where}.path`, message: 'archive path is required'});
    } else if (!isAbsolute(entry.path)) {
      errors.push({code: 'relative-path', where: `${where}.path`, message: `archive path must be absolute: ${entry.path}`});
    }

    // SHA256
    if (typeof entry.sha256 !== 'string' || !SHA256_REGEX.test(entry.sha256.toLowerCase())) {
      errors.push({code: 'invalid-sha256', where: `${where}.sha256`, message: 'sha256 must be 64 lowercase hexadecimal characters'});
    }

    // Optional fileCount
    if (entry.fileCount !== undefined && (!Number.isInteger(entry.fileCount) || entry.fileCount < 1)) {
      errors.push({code: 'invalid-file-count', where: `${where}.fileCount`, message: 'fileCount must be a positive integer'});
    }

    normalizedPackages.push({
      name: entry.name,
      version: entry.version,
      path: resolve(entry.path),
      sha256: entry.sha256 ? entry.sha256.toLowerCase() : '',
      integrity: entry.integrity || null,
      fileCount: entry.fileCount || null,
      status: entry.status || 'ready'
    });
  }

  // Checker archive (optional field or extracted from packages)
  let checkerArchive = null;
  if (rawManifest.checkerArchive) {
    const ca = rawManifest.checkerArchive;
    const where = '$.checkerArchive';
    if (typeof ca.name !== 'string' || !PACKAGE_NAME_REGEX.test(ca.name)) {
      errors.push({code: 'invalid-name', where: `${where}.name`, message: `invalid checker package name: ${ca.name}`});
    }
    if (typeof ca.version !== 'string' || !SEMVER_REGEX.test(ca.version)) {
      errors.push({code: 'invalid-version', where: `${where}.version`, message: `invalid checker version: ${ca.version}`});
    }
    if (typeof ca.path !== 'string' || !isAbsolute(ca.path)) {
      errors.push({code: 'invalid-path', where: `${where}.path`, message: 'checker path must be absolute'});
    }
    if (typeof ca.sha256 !== 'string' || !SHA256_REGEX.test(ca.sha256.toLowerCase())) {
      errors.push({code: 'invalid-sha256', where: `${where}.sha256`, message: 'checker sha256 must be 64 hex characters'});
    }
    checkerArchive = {
      name: ca.name,
      version: ca.version,
      path: resolve(ca.path),
      sha256: ca.sha256.toLowerCase()
    };
  } else {
    // Check if packages includes @composable-svelte/architecture
    const archEntry = normalizedPackages.find(p => p.name === '@composable-svelte/architecture');
    if (archEntry) {
      checkerArchive = {
        name: archEntry.name,
        version: archEntry.version,
        path: archEntry.path,
        sha256: archEntry.sha256
      };
    }
  }

  // Policy (optional)
  let policy = null;
  if (rawManifest.policy) {
    const pol = rawManifest.policy;
    const where = '$.policy';
    if (typeof pol.path !== 'string' || !isAbsolute(pol.path)) {
      errors.push({code: 'invalid-path', where: `${where}.path`, message: 'policy path must be absolute'});
    }
    if (typeof pol.sha256 !== 'string' || !SHA256_REGEX.test(pol.sha256.toLowerCase())) {
      errors.push({code: 'invalid-sha256', where: `${where}.sha256`, message: 'policy sha256 must be 64 hex characters'});
    }
    if (typeof pol.expectedCoreVersion !== 'string' || !SEMVER_REGEX.test(pol.expectedCoreVersion)) {
      errors.push({code: 'invalid-core-version', where: `${where}.expectedCoreVersion`, message: 'expectedCoreVersion must be exact SemVer'});
    }
    policy = {
      path: resolve(pol.path),
      sha256: pol.sha256.toLowerCase(),
      expectedCoreVersion: pol.expectedCoreVersion,
      recordsRoot: pol.recordsRoot ? resolve(pol.recordsRoot) : undefined
    };
  }

  // Svelte pins (optional, defaults provided)
  const sveltePins = {
    ...DEFAULT_SVELTE_PINS,
    ...(rawManifest.sveltePins || {})
  };

  // Evidence dir
  const evidenceDir = rawManifest.evidenceDir ? resolve(rawManifest.evidenceDir) : null;

  if (errors.length > 0) {
    throw new ManifestValidationError('Manifest schema validation failed', errors);
  }

  return {
    schema: rawManifest.schema || rawManifest.$schema || 'composable-svelte/release-archives-manifest/v1',
    packages: normalizedPackages,
    checkerArchive,
    policy,
    sveltePins,
    evidenceDir
  };
}

export function verifyArchivesPreInstall(validatedManifest) {
  const verifiedArchives = [];

  for (const pkg of validatedManifest.packages) {
    if (!existsSync(pkg.path)) {
      throw new Error(`Archive file not found on disk: ${pkg.path} (${pkg.name})`);
    }
    const st = statSync(pkg.path);
    if (!st.isFile()) {
      throw new Error(`Archive path is not a regular file: ${pkg.path} (${pkg.name})`);
    }
    if (st.size === 0) {
      throw new Error(`Archive file is empty (0 bytes): ${pkg.path} (${pkg.name})`);
    }

    // Verify SHA-256 byte hash BEFORE any installs or modifications
    const actualSha256 = sha256File(pkg.path);
    if (actualSha256 !== pkg.sha256) {
      throw new ArchiveHashMismatchError(pkg.name, pkg.sha256, actualSha256, pkg.path);
    }

    // Verify Subresource Integrity (e.g. sha512-...) if declared in manifest
    if (pkg.integrity) {
      const rawBytes = readFileSync(pkg.path);
      const actualIntegrity = 'sha512-' + createHash('sha512').update(rawBytes).digest('base64');
      if (actualIntegrity !== pkg.integrity) {
        throw new ArchiveIntegrityMismatchError(pkg.name, pkg.integrity, actualIntegrity, pkg.path);
      }
    }

    // Inspect archive entries and read inner package/package.json
    const entries = inspectTarEntries(pkg.path);
    const fileEntries = entries.filter(e => e.isFile);

    if (pkg.fileCount !== null && fileEntries.length !== pkg.fileCount) {
      throw new ArchiveFileCountMismatchError(pkg.name, pkg.fileCount, fileEntries.length, pkg.path);
    }

    const pkgJsonBytes = readTarFile(pkg.path, 'package/package.json');
    let innerManifest;
    try {
      innerManifest = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(pkgJsonBytes));
    } catch (err) {
      throw new Error(`Archive package/package.json could not be parsed in ${pkg.path}: ${err.message}`);
    }

    if (innerManifest.name !== pkg.name) {
      throw new ArchiveNameMismatchError(pkg.name, innerManifest.name, pkg.path);
    }
    if (innerManifest.version !== pkg.version) {
      throw new ArchiveVersionMismatchError(pkg.name, pkg.version, innerManifest.version, pkg.path);
    }

    verifiedArchives.push({
      name: pkg.name,
      version: pkg.version,
      path: pkg.path,
      sha256: actualSha256,
      integrity: pkg.integrity,
      status: pkg.status,
      sizeBytes: st.size,
      fileCount: fileEntries.length,
      innerPackage: innerManifest
    });
  }

  // Checker archive verification
  let verifiedChecker = null;
  if (validatedManifest.checkerArchive) {
    const ca = validatedManifest.checkerArchive;
    if (!existsSync(ca.path)) {
      throw new Error(`Checker archive file not found: ${ca.path}`);
    }
    const st = statSync(ca.path);
    if (!st.isFile() || st.size === 0) {
      throw new Error(`Checker archive is not a valid non-empty file: ${ca.path}`);
    }
    const actualSha256 = sha256File(ca.path);
    if (actualSha256 !== ca.sha256) {
      throw new ArchiveHashMismatchError(ca.name, ca.sha256, actualSha256, ca.path);
    }
    const entries = inspectTarEntries(ca.path);
    const pkgJsonBytes = readTarFile(ca.path, 'package/package.json');
    const innerManifest = JSON.parse(new TextDecoder('utf-8').decode(pkgJsonBytes));
    if (innerManifest.name !== ca.name) {
      throw new ArchiveNameMismatchError(ca.name, innerManifest.name, ca.path);
    }
    if (innerManifest.version !== ca.version) {
      throw new ArchiveVersionMismatchError(ca.name, ca.version, innerManifest.version, ca.path);
    }
    verifiedChecker = {
      name: ca.name,
      version: ca.version,
      path: ca.path,
      sha256: actualSha256,
      sizeBytes: st.size,
      fileCount: entries.filter(e => e.isFile).length,
      innerPackage: innerManifest
    };
  }

  // Policy verification
  let verifiedPolicy = null;
  if (validatedManifest.policy) {
    const pol = validatedManifest.policy;
    if (!existsSync(pol.path)) {
      throw new Error(`Policy file not found: ${pol.path}`);
    }
    const st = statSync(pol.path);
    if (!st.isFile()) {
      throw new Error(`Policy path is not a regular file: ${pol.path}`);
    }
    const actualSha256 = sha256File(pol.path);
    if (actualSha256 !== pol.sha256) {
      throw new Error(`Policy sha256 mismatch at ${pol.path}: expected ${pol.sha256}, got ${actualSha256}`);
    }
    const policyData = JSON.parse(readFileSync(pol.path, 'utf8'));
    const {errors} = validatePolicy(policyData);
    if (errors.length > 0) {
      throw new PolicyValidationError(`Policy at ${pol.path} has schema errors`, errors);
    }
    verifiedPolicy = {
      path: pol.path,
      sha256: actualSha256,
      expectedCoreVersion: pol.expectedCoreVersion,
      policyId: policyData.policyId,
      policyVersion: policyData.policyVersion
    };
  }

  return {
    archives: verifiedArchives,
    checker: verifiedChecker,
    policy: verifiedPolicy,
    preflightPassed: true
  };
}

// ---------------------------------------------------------------------------
// Freeze Candidate Archives (TOCTOU Race & Mutation Protection)
// ---------------------------------------------------------------------------

export function freezeCandidateArchives(archives, freezeDir, checker = null) {
  mkdirSync(freezeDir, {recursive: true});
  const frozenArchives = [];

  for (const pkg of archives) {
    const safeName = pkg.name.replace(/[@/]/g, '-');
    const frozenPath = join(freezeDir, `${safeName}-${pkg.version}.tgz`);
    cpSync(pkg.path, frozenPath);

    const frozenSha = sha256File(frozenPath);
    if (frozenSha !== pkg.sha256) {
      throw new ArchiveHashMismatchError(pkg.name, pkg.sha256, frozenSha, frozenPath);
    }
    if (pkg.integrity) {
      const rawBytes = readFileSync(frozenPath);
      const actualIntegrity = 'sha512-' + createHash('sha512').update(rawBytes).digest('base64');
      if (actualIntegrity !== pkg.integrity) {
        throw new ArchiveIntegrityMismatchError(pkg.name, pkg.integrity, actualIntegrity, frozenPath);
      }
    }

    frozenArchives.push({
      ...pkg,
      originalPath: pkg.path,
      path: frozenPath,
      frozenPath
    });
  }

  let frozenChecker = null;
  if (checker) {
    const safeName = checker.name.replace(/[@/]/g, '-');
    const frozenPath = join(freezeDir, `${safeName}-${checker.version}.tgz`);
    cpSync(checker.path, frozenPath);
    const frozenSha = sha256File(frozenPath);
    if (frozenSha !== checker.sha256) {
      throw new ArchiveHashMismatchError(checker.name, checker.sha256, frozenSha, frozenPath);
    }
    frozenChecker = {
      ...checker,
      originalPath: checker.path,
      path: frozenPath,
      frozenPath
    };
  }

  return {
    archives: frozenArchives,
    checker: frozenChecker,
    freezeDir
  };
}

// ---------------------------------------------------------------------------
// Installed Content Verification Against Archive
// ---------------------------------------------------------------------------

function collectDirectoryFiles(dir, baseDir = dir) {
  const result = [];
  const entries = readdirSync(dir, {withFileTypes: true});
  for (const entry of entries) {
    if (entry.name === '.package-lock.json' || entry.name === 'node_modules') continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectDirectoryFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      result.push(relative(baseDir, fullPath));
    }
  }
  return result;
}

export function verifyInstalledFiles(archivePath, installedDir, pkgName) {
  assert.ok(existsSync(installedDir), `Installed directory not found: ${installedDir} (${pkgName})`);

  // Read all files from the archive
  const entries = inspectTarEntries(archivePath);
  const archiveFiles = new Map();

  for (const entry of entries) {
    if (!entry.isFile) continue;
    if (!entry.path.startsWith('package/')) continue;
    const relPath = entry.path.slice('package/'.length);
    const bytes = readTarFile(archivePath, entry.path);
    archiveFiles.set(relPath, {
      path: relPath,
      sha256: sha256Hex(bytes),
      size: bytes.length
    });
  }

  // Walk the installed directory and compare
  const installedFiles = collectDirectoryFiles(installedDir);
  const installedSet = new Set(installedFiles);

  const matched = [];
  const mismatches = [];

  for (const [relPath, archiveInfo] of archiveFiles) {
    const installedFilePath = join(installedDir, relPath);
    if (!existsSync(installedFilePath)) {
      mismatches.push({file: relPath, issue: 'missing in installed directory'});
      continue;
    }
    const installedBytes = readFileSync(installedFilePath);
    const installedSha = sha256Hex(installedBytes);
    if (installedSha !== archiveInfo.sha256) {
      mismatches.push({
        file: relPath,
        issue: 'byte mismatch',
        expectedSha: archiveInfo.sha256,
        actualSha: installedSha
      });
      continue;
    }
    matched.push({file: relPath, sha256: installedSha});
  }

  // Check for unexpected extra files
  const unexpected = [];
  for (const file of installedFiles) {
    if (!archiveFiles.has(file)) {
      unexpected.push(file);
    }
  }

  if (mismatches.length > 0 || unexpected.length > 0) {
    const detail = [
      mismatches.length > 0 ? `mismatches: ${JSON.stringify(mismatches.slice(0, 5))}` : '',
      unexpected.length > 0 ? `unexpected files: ${JSON.stringify(unexpected.slice(0, 5))}` : ''
    ].filter(Boolean).join('; ');
    throw new InstalledFileMismatchError(pkgName, mismatches[0]?.file || unexpected[0], detail);
  }

  return {
    packageName: pkgName,
    archivePath,
    installedDir,
    totalFiles: matched.length,
    verifiedMatched: true,
    matchedFiles: matched.map(m => m.file)
  };
}

// ---------------------------------------------------------------------------
// Execution Helper
// ---------------------------------------------------------------------------

export function runCommand(cmd, args, {cwd, env = {}, timeout = 180000, stdio = 'pipe'} = {}) {
  const start = Date.now();
  const res = spawnSync(cmd, args, {
    cwd,
    env: {
      ...process.env,
      TZ: 'UTC',
      npm_config_loglevel: 'error',
      ...env
    },
    timeout,
    encoding: 'utf8',
    stdio
  });
  const durationMs = Date.now() - start;

  if (res.error) {
    return {
      command: `${cmd} ${args.join(' ')}`,
      exitCode: -1,
      stdout: res.stdout || '',
      stderr: String(res.error.message || res.error),
      durationMs,
      error: res.error
    };
  }

  return {
    command: `${cmd} ${args.join(' ')}`,
    exitCode: res.status ?? (res.signal ? 128 : 0),
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    durationMs,
    error: null
  };
}

// ---------------------------------------------------------------------------
// Svelte Pin & Installed Candidate Verification Helpers
// ---------------------------------------------------------------------------

export function verifyInstalledSvelteVersion(targetDir, expectedPin) {
  const sveltePkgJsonPath = join(targetDir, 'node_modules/svelte/package.json');
  assert.ok(existsSync(sveltePkgJsonPath), `svelte/package.json not found in ${targetDir}`);
  const svelteManifest = JSON.parse(readFileSync(sveltePkgJsonPath, 'utf8'));
  const actualVersion = svelteManifest.version;
  if (actualVersion !== expectedPin) {
    throw new Error(`Installed Svelte version mismatch in ${targetDir}: expected exact pin ${expectedPin}, but got ${actualVersion}`);
  }
  return {
    expected: expectedPin,
    actual: actualVersion,
    verified: true
  };
}

export function resolveSveltePin({recipeName, checkpoint = 'newer', sveltePins = DEFAULT_SVELTE_PINS}) {
  if (recipeName === 'core-starter') {
    return sveltePins.starter || DEFAULT_SVELTE_PINS.starter;
  }
  if (checkpoint === 'minimum') {
    if (recipeName === 'code-managed' || recipeName === 'chat-code-media') {
      return sveltePins.minimumCode || DEFAULT_SVELTE_PINS.minimumCode;
    }
    return sveltePins.minimumGeneral || DEFAULT_SVELTE_PINS.minimumGeneral;
  }
  return sveltePins.newerCompanions || DEFAULT_SVELTE_PINS.newerCompanions;
}

export function verifyAllInstalledCandidatePackages(targetDir, packagesToVerify) {
  const verifiedList = [];
  for (const pkg of packagesToVerify) {
    const pkgDir = join(targetDir, 'node_modules', pkg.name);
    const archivePath = pkg.frozenPath || pkg.path;
    const res = verifyInstalledFiles(archivePath, pkgDir, pkg.name);
    verifiedList.push(res);
  }
  return verifiedList;
}

/**
 * Byte checks cover only the packages a recipe names. The lockfile shows every scoped package npm
 * placed anywhere in the tree: each must be a named candidate, installed once at top level from its
 * frozen archive, so no registry or nested copy of a first-party package can enter unverified.
 */
export function verifyLockedCandidateIdentities(targetDir, candidates) {
  const lockPath = join(targetDir, 'package-lock.json');
  assert.ok(existsSync(lockPath), `package-lock.json not found in ${targetDir}`);
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const byName = new Map(candidates.map(pkg => [pkg.name, pkg]));
  const locked = [];
  for (const [key, entry] of Object.entries(lock.packages || {})) {
    const name = /(?:^|\/)node_modules\/(@composable-svelte\/[^/]+)$/.exec(key)?.[1];
    if (!name) continue;
    const pkg = byName.get(name);
    if (!pkg) throw new InstalledFileMismatchError(name, key, 'scoped package in lockfile is not a verified candidate archive');
    if (key !== `node_modules/${name}`) throw new InstalledFileMismatchError(name, key, 'nested copy of a candidate package');
    const archivePath = realpathSync(pkg.frozenPath || pkg.path);
    const spec = typeof entry.resolved === 'string' && entry.resolved.startsWith('file:') ? entry.resolved.slice(5) : null;
    const resolvedPath = spec && existsSync(resolve(targetDir, spec)) ? realpathSync(resolve(targetDir, spec)) : null;
    if (entry.version !== pkg.version || resolvedPath !== archivePath) {
      throw new InstalledFileMismatchError(name, key, `locked ${entry.version} from ${entry.resolved}, expected ${pkg.version} from ${archivePath}`);
    }
    const integrity = 'sha512-' + createHash('sha512').update(readFileSync(archivePath)).digest('base64');
    if (entry.integrity !== integrity) {
      throw new InstalledFileMismatchError(name, key, `locked integrity ${entry.integrity} does not match frozen archive ${integrity}`);
    }
    locked.push({name, version: entry.version, resolved: entry.resolved, integrity});
  }
  for (const name of byName.keys()) {
    if (!locked.some(entry => entry.name === name)) throw new InstalledFileMismatchError(name, 'package-lock.json', 'candidate missing from lockfile');
  }
  return {lockPath, locked};
}

// ---------------------------------------------------------------------------
// Materialization & Candidate Transport
// ---------------------------------------------------------------------------

/**
 * Materializes candidate packages into targetDir's node_modules with registry-shaped package.json specs.
 * Honestly records candidate transport without fabricating registry provenance.
 */
export function materializeCandidatePackages(targetDir, packagesToInstall, {unpackedRoot}) {
  const installedInfo = [];

  for (const pkg of packagesToInstall) {
    const pkgDir = join(targetDir, 'node_modules', pkg.name);
    mkdirSync(pkgDir, {recursive: true});

    const archiveToUse = pkg.frozenPath || pkg.path;

    // Unpack candidate archive directly into node_modules/<pkg.name>
    safeExtractTar(archiveToUse, pkgDir, {stripComponents: 1});

    // Verify all installed files match archive
    const ver = verifyInstalledFiles(archiveToUse, pkgDir, pkg.name);

    installedInfo.push({
      name: pkg.name,
      version: pkg.version,
      archivePath: archiveToUse,
      originalPath: pkg.originalPath || pkg.path,
      archiveSha256: pkg.sha256,
      installedPath: pkgDir,
      fileCount: ver.totalFiles,
      verifiedAgainstArchive: true,
      matchedFiles: ver.matchedFiles
    });
  }

  return {
    transportType: 'local-candidate-tarball',
    honestIdentity: 'Materialized local candidate tarballs with verified SHA-256; public package.json retains registry-shaped spec without fabricating npmjs.org retrieval',
    registryProvenanceClaimed: false,
    installedPackages: installedInfo
  };
}

// ---------------------------------------------------------------------------
// Recipe Helpers & Runners
// ---------------------------------------------------------------------------

function findRecipeDirectory(unpackedDir, relativeSubpath, pkgName) {
  // Only look inside the unpacked candidate archive (handling direct or npm 'package/' prefix)
  const directPath = join(unpackedDir, relativeSubpath);
  if (existsSync(directPath)) {
    return {dir: directPath, source: 'archived-package'};
  }
  const packagePrefixed = join(unpackedDir, 'package', relativeSubpath);
  if (existsSync(packagePrefixed)) {
    return {dir: packagePrefixed, source: 'archived-package'};
  }
  throw new Error(`Shipped recipe directory '${relativeSubpath}' not found in candidate archive ${pkgName}. Final runtime archive must ship its managed recipes; repository source fallback is strictly prohibited.`);
}

/**
 * The plan's NodeCanvas controls, run against the installed Code artifact: the Canvas example its
 * README ships must type-check as shipped and without `liftAction` (identity omission), and must be
 * rejected with an incompatible mapper. The unmodified example passing first shows the rejection is
 * caused by the mapper, not by the probe setup.
 */
function runNodeCanvasActionControls(targetDir) {
  const readme = readFileSync(join(targetDir, 'node_modules/@composable-svelte/code/README.md'), 'utf8');
  const canvas = /<!-- consumer-file: Canvas\.svelte -->\n```svelte\n([\s\S]*?)\n```/.exec(readme)?.[1];
  const identity = ' liftAction={(action) => action}';
  assert.ok(canvas?.includes(identity), 'Installed Code README no longer ships the Canvas liftAction example');
  const probeDir = join(targetDir, 'action-controls');
  mkdirSync(probeDir, {recursive: true});
  writeFileSync(join(probeDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true, lib: ['ESNext', 'DOM', 'DOM.Iterable']},
    include: ['*.svelte']
  }));
  const check = (name, source) => {
    writeFileSync(join(probeDir, 'Canvas.svelte'), source);
    const result = runCommand(join(targetDir, 'node_modules/.bin/svelte-check'), ['--workspace', probeDir, '--tsconfig', join(probeDir, 'tsconfig.json'), '--fail-on-warnings'], {cwd: targetDir});
    return {name, result, output: result.stdout + result.stderr};
  };
  const shipped = check('readme-example-as-shipped', canvas);
  assert.equal(shipped.result.exitCode, 0, `Installed Code Canvas example must type-check as shipped:\n${shipped.output}`);
  const omitted = check('identity-omission', canvas.replace(identity, ''));
  assert.equal(omitted.result.exitCode, 0, `Omitting an identity liftAction must type-check:\n${omitted.output}`);
  const mismatched = check('incompatible-mapper', canvas.replace(identity, ' liftAction={(action) => ({ wrong: true })}'));
  assert.notEqual(mismatched.result.exitCode, 0, 'Incompatible NodeCanvas action mapper must be rejected');
  assert.match(mismatched.output, /not assignable to type[\s\S]*NodeCanvasAction/, `Incompatible mapper failed for an unrelated reason:\n${mismatched.output}`);
  return [shipped, omitted, mismatched].map(({name, result}) => ({
    name,
    expected: name === 'incompatible-mapper' ? 'rejected' : 'accepted',
    exitCode: result.exitCode,
    result
  }));
}

export function runCoreStarterRecipe({scratchDir, unpackedRoot, candidateMap, sveltePins, svelteCheckpoint = 'newer', skipBrowser}) {
  const recipeName = 'core-starter';
  const commands = [];
  const starterDir = join(scratchDir, 'core-starter');

  const corePkg = candidateMap.get('@composable-svelte/core');
  assert.ok(corePkg, 'Core package is required for core-starter recipe');

  const unpackedCore = join(unpackedRoot, 'core');
  const recipeSource = findRecipeDirectory(unpackedCore, 'consumer', 'core');
  cpSync(recipeSource.dir, starterDir, {recursive: true});

  // Determine exact svelte pin for starter
  const sveltePin = resolveSveltePin({recipeName, checkpoint: svelteCheckpoint, sveltePins});

  // Prepare package.json with candidate tarballs during npm install
  const manifestPath = join(starterDir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  // The starter pins exact identities; the candidates must be those identities, not substitutes.
  const shippedPins = {core: manifest.dependencies?.['@composable-svelte/core'], checker: manifest.devDependencies?.['@composable-svelte/architecture'], svelte: manifest.dependencies?.svelte};
  assert.equal(shippedPins.core, corePkg.version, `Shipped starter pins core ${shippedPins.core}, candidate core is ${corePkg.version}`);
  assert.equal(shippedPins.svelte, sveltePin, `Shipped starter pins Svelte ${shippedPins.svelte}, starter checkpoint is ${sveltePin}`);

  manifest.dependencies = manifest.dependencies || {};
  manifest.dependencies['@composable-svelte/core'] = `file:${corePkg.frozenPath || corePkg.path}`;
  manifest.dependencies['svelte'] = sveltePin;


  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Materialize candidate core; the starter does not require the optional checker.
  const pkgsToInstall = [corePkg];
  const transport = materializeCandidatePackages(starterDir, pkgsToInstall, {unpackedRoot});

  // Run npm install for external dependencies (svelte, vite, etc.)
  const installCmd = runCommand('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], {cwd: starterDir});
  commands.push(installCmd);
  if (installCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, installCmd.command, installCmd.exitCode, installCmd.stderr, installCmd.stdout);
  }

  // Restore exact public registry-shaped SemVer in package.json
  manifest.dependencies['@composable-svelte/core'] = corePkg.version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Post-install verification of EVERY candidate package
  const postInstallVerification = verifyAllInstalledCandidatePackages(starterDir, pkgsToInstall);

  // Verify installed Svelte version matches requested exact pin
  const svelteVerification = verifyInstalledSvelteVersion(starterDir, sveltePin);

  // Run check
  const checkCmd = runCommand('npm', ['run', 'check'], {cwd: starterDir});
  commands.push(checkCmd);
  if (checkCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, checkCmd.command, checkCmd.exitCode, checkCmd.stderr, checkCmd.stdout);
  }

  // Run test
  const testCmd = runCommand('npm', ['test'], {cwd: starterDir});
  commands.push(testCmd);
  if (testCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, testCmd.command, testCmd.exitCode, testCmd.stderr, testCmd.stdout);
  }

  // Run test:ssr
  const ssrCmd = runCommand('npm', ['run', 'test:ssr'], {cwd: starterDir});
  commands.push(ssrCmd);
  if (ssrCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, ssrCmd.command, ssrCmd.exitCode, ssrCmd.stderr, ssrCmd.stdout);
  }

  // Run test:browser (if not skipped)
  if (!skipBrowser) {
    const browserCmd = runCommand('npm', ['run', 'test:browser'], {cwd: starterDir});
    commands.push(browserCmd);
    if (browserCmd.exitCode !== 0) {
      throw new RecipeExecutionError(recipeName, browserCmd.command, browserCmd.exitCode, browserCmd.stderr, browserCmd.stdout);
    }
  }

  return {
    name: recipeName,
    status: skipBrowser ? 'partial-browser-skipped' : 'passed',
    recipeSource: recipeSource.source,
    projectDir: starterDir,
    shippedPins,
    sveltePin,
    svelteCheckpoint: svelteCheckpoint || 'newer',
    svelteInstalledVersion: svelteVerification.actual,
    sveltePinVerified: true,
    transport,
    paths: {
      projectDir: starterDir,
      manifestPath,
      lockPath: existsSync(join(starterDir, 'package-lock.json')) ? join(starterDir, 'package-lock.json') : null
    },
    installedInventory: postInstallVerification.map(v => ({
      packageName: v.packageName,
      archivePath: v.archivePath,
      installedDir: v.installedDir,
      totalFiles: v.totalFiles,
      matchedFiles: v.matchedFiles,
      verifiedMatched: v.verifiedMatched
    })),
    architectureCheck: null,
    commands: commands.map(c => ({
      command: c.command,
      exitCode: c.exitCode,
      durationMs: c.durationMs,
      stdout: c.stdout || '',
      stderr: c.stderr || ''
    }))
  };
}

export function runAuthConsumerRecipe({scratchDir, unpackedRoot, candidateMap, sveltePins, svelteCheckpoint = 'newer', skipBrowser}) {
  const recipeName = 'auth-consumer';
  const commands = [];
  const targetDir = join(scratchDir, 'auth-consumer');

  const corePkg = candidateMap.get('@composable-svelte/core');
  const authPkg = candidateMap.get('@composable-svelte/auth');
  assert.ok(corePkg && authPkg, 'Core and Auth packages are required for auth-consumer recipe');

  const unpackedAuth = join(unpackedRoot, 'auth');
  const recipeSource = findRecipeDirectory(unpackedAuth, 'consumer', 'auth');
  cpSync(recipeSource.dir, targetDir, {recursive: true});

  // Determine exact svelte pin for auth consumer
  const sveltePin = resolveSveltePin({recipeName, checkpoint: svelteCheckpoint, sveltePins});

  const manifestPath = join(targetDir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  manifest.dependencies = manifest.dependencies || {};
  manifest.dependencies['@composable-svelte/core'] = `file:${corePkg.frozenPath || corePkg.path}`;
  manifest.dependencies['@composable-svelte/auth'] = `file:${authPkg.frozenPath || authPkg.path}`;
  manifest.dependencies['svelte'] = sveltePin;

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const pkgsToInstall = [corePkg, authPkg];
  const transport = materializeCandidatePackages(targetDir, pkgsToInstall, {unpackedRoot});

  const installCmd = runCommand('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], {cwd: targetDir});
  commands.push(installCmd);
  if (installCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, installCmd.command, installCmd.exitCode, installCmd.stderr, installCmd.stdout);
  }

  // Restore exact public registry-shaped SemVer in package.json
  manifest.dependencies['@composable-svelte/core'] = corePkg.version;
  manifest.dependencies['@composable-svelte/auth'] = authPkg.version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Verify EVERY installed package post-install
  const postInstallVerification = verifyAllInstalledCandidatePackages(targetDir, pkgsToInstall);

  // Verify installed Svelte version matches requested exact pin
  const svelteVerification = verifyInstalledSvelteVersion(targetDir, sveltePin);

  const checkCmd = runCommand('npm', ['run', 'check'], {cwd: targetDir});
  commands.push(checkCmd);
  if (checkCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, checkCmd.command, checkCmd.exitCode, checkCmd.stderr, checkCmd.stdout);
  }

  const buildCmd = runCommand('npm', ['run', 'build'], {cwd: targetDir});
  commands.push(buildCmd);
  if (buildCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, buildCmd.command, buildCmd.exitCode, buildCmd.stderr, buildCmd.stdout);
  }

  const ssrCmd = runCommand('npm', ['run', 'test:ssr'], {cwd: targetDir});
  commands.push(ssrCmd);
  if (ssrCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, ssrCmd.command, ssrCmd.exitCode, ssrCmd.stderr, ssrCmd.stdout);
  }

  if (!skipBrowser) {
    const browserCmd = runCommand('npm', ['run', 'test:browser'], {cwd: targetDir});
    commands.push(browserCmd);
    if (browserCmd.exitCode !== 0) {
      throw new RecipeExecutionError(recipeName, browserCmd.command, browserCmd.exitCode, browserCmd.stderr, browserCmd.stdout);
    }
  }

  return {
    name: recipeName,
    status: skipBrowser ? 'partial-browser-skipped' : 'passed',
    recipeSource: recipeSource.source,
    projectDir: targetDir,
    sveltePin,
    svelteCheckpoint: svelteCheckpoint || 'newer',
    svelteInstalledVersion: svelteVerification.actual,
    sveltePinVerified: true,
    transport,
    paths: {
      projectDir: targetDir,
      manifestPath,
      lockPath: existsSync(join(targetDir, 'package-lock.json')) ? join(targetDir, 'package-lock.json') : null
    },
    installedInventory: postInstallVerification.map(v => ({
      packageName: v.packageName,
      archivePath: v.archivePath,
      installedDir: v.installedDir,
      totalFiles: v.totalFiles,
      matchedFiles: v.matchedFiles,
      verifiedMatched: v.verifiedMatched
    })),
    commands: commands.map(c => ({
      command: c.command,
      exitCode: c.exitCode,
      durationMs: c.durationMs,
      stdout: c.stdout || '',
      stderr: c.stderr || ''
    }))
  };
}

export function runFixtureRecipe(pkgSlug, fixtureSubpath, {scratchDir, unpackedRoot, candidateMap, sveltePins, svelteCheckpoint = 'newer', skipBrowser}) {
  const recipeName = `${pkgSlug}-fixture`;
  const commands = [];
  const targetDir = join(scratchDir, `${pkgSlug}-fixture`);

  const fullName = `@composable-svelte/${pkgSlug}`;
  const corePkg = candidateMap.get('@composable-svelte/core');
  const compPkg = candidateMap.get(fullName);
  assert.ok(corePkg && compPkg, `Core and ${fullName} are required for ${recipeName}`);

  const unpackedComp = join(unpackedRoot, pkgSlug);
  const recipeSource = findRecipeDirectory(unpackedComp, fixtureSubpath, pkgSlug);
  cpSync(recipeSource.dir, targetDir, {recursive: true});

  // Determine exact svelte pin
  const sveltePin = resolveSveltePin({recipeName, checkpoint: svelteCheckpoint, sveltePins});

  const manifestPath = join(targetDir, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  manifest.dependencies = manifest.dependencies || {};
  manifest.dependencies['@composable-svelte/core'] = `file:${corePkg.frozenPath || corePkg.path}`;
  manifest.dependencies[fullName] = `file:${compPkg.frozenPath || compPkg.path}`;
  manifest.dependencies['svelte'] = sveltePin;

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const pkgsToInstall = [corePkg, compPkg];
  const transport = materializeCandidatePackages(targetDir, pkgsToInstall, {unpackedRoot});

  const installCmd = runCommand('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], {cwd: targetDir});
  commands.push(installCmd);
  if (installCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, installCmd.command, installCmd.exitCode, installCmd.stderr, installCmd.stdout);
  }

  // Restore exact public registry-shaped SemVer in package.json
  manifest.dependencies['@composable-svelte/core'] = corePkg.version;
  manifest.dependencies[fullName] = compPkg.version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  // Verify EVERY installed package post-install
  const postInstallVerification = verifyAllInstalledCandidatePackages(targetDir, pkgsToInstall);

  // Verify installed Svelte version matches requested exact pin
  const svelteVerification = verifyInstalledSvelteVersion(targetDir, sveltePin);

  const checkCmd = runCommand('npm', ['run', 'check'], {cwd: targetDir});
  commands.push(checkCmd);
  if (checkCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, checkCmd.command, checkCmd.exitCode, checkCmd.stderr, checkCmd.stdout);
  }

  if (manifest.scripts?.['typecheck:nodenext']) {
    const typecheckCmd = runCommand('npm', ['run', 'typecheck:nodenext'], {cwd: targetDir});
    commands.push(typecheckCmd);
    if (typecheckCmd.exitCode !== 0) {
      throw new RecipeExecutionError(recipeName, typecheckCmd.command, typecheckCmd.exitCode, typecheckCmd.stderr, typecheckCmd.stdout);
    }
  }

  const buildCmd = runCommand('npm', ['run', 'build'], {cwd: targetDir});
  commands.push(buildCmd);
  if (buildCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, buildCmd.command, buildCmd.exitCode, buildCmd.stderr, buildCmd.stdout);
  }

  const ssrCmd = runCommand('npm', ['run', 'ssr'], {cwd: targetDir});
  commands.push(ssrCmd);
  if (ssrCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, ssrCmd.command, ssrCmd.exitCode, ssrCmd.stderr, ssrCmd.stdout);
  }

  if (!skipBrowser && manifest.scripts?.['test:browser']) {
    const browserCmd = runCommand('npm', ['run', 'test:browser'], {cwd: targetDir});
    commands.push(browserCmd);
    if (browserCmd.exitCode !== 0) {
      throw new RecipeExecutionError(recipeName, browserCmd.command, browserCmd.exitCode, browserCmd.stderr, browserCmd.stdout);
    }
  }

  return {
    name: recipeName,
    status: skipBrowser ? 'partial-browser-skipped' : 'passed',
    recipeSource: recipeSource.source,
    projectDir: targetDir,
    sveltePin,
    svelteCheckpoint: svelteCheckpoint || 'newer',
    svelteInstalledVersion: svelteVerification.actual,
    sveltePinVerified: true,
    transport,
    paths: {
      projectDir: targetDir,
      manifestPath,
      lockPath: existsSync(join(targetDir, 'package-lock.json')) ? join(targetDir, 'package-lock.json') : null
    },
    installedInventory: postInstallVerification.map(v => ({
      packageName: v.packageName,
      archivePath: v.archivePath,
      installedDir: v.installedDir,
      totalFiles: v.totalFiles,
      matchedFiles: v.matchedFiles,
      verifiedMatched: v.verifiedMatched
    })),
    commands: commands.map(c => ({
      command: c.command,
      exitCode: c.exitCode,
      durationMs: c.durationMs,
      stdout: c.stdout || '',
      stderr: c.stderr || ''
    }))
  };
}

export function runChatRecipe({scratchDir, unpackedRoot, candidateMap, sveltePins, svelteCheckpoint = 'newer', skipBrowser}) {
  const recipeName = 'chat-managed';
  const commands = [];
  const targetDir = join(scratchDir, 'chat-recipe');
  mkdirSync(targetDir, {recursive: true});

  const corePkg = candidateMap.get('@composable-svelte/core');
  const chatPkg = candidateMap.get('@composable-svelte/chat');
  assert.ok(corePkg && chatPkg, 'Core and Chat packages are required for chat-managed recipe');

  // Determine exact svelte pin
  const sveltePin = resolveSveltePin({recipeName, checkpoint: svelteCheckpoint, sveltePins});

  const manifestPath = join(targetDir, 'package.json');
  const manifestData = {
    name: 'candidate-chat-recipe',
    private: true,
    type: 'module',
    dependencies: {
      '@composable-svelte/core': `file:${corePkg.frozenPath || corePkg.path}`,
      '@composable-svelte/chat': `file:${chatPkg.frozenPath || chatPkg.path}`,
      'svelte': sveltePin,
      'isomorphic-dompurify': '^2.16.0'
    },
    devDependencies: {
      '@sveltejs/vite-plugin-svelte': '6.2.1',
      '@vitest/browser': '4.0.7',
      '@vitest/browser-playwright': '4.0.7',
      'playwright': '1.56.1',
      'svelte-check': '4.3.3',
      'typescript': '5.9.3',
      'vite': '6.4.1',
      'vitest': '4.0.7'
    }
  };
  writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));

  const pkgsToInstall = [corePkg, chatPkg];
  const transport = materializeCandidatePackages(targetDir, pkgsToInstall, {unpackedRoot});

  const installCmd = runCommand('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], {cwd: targetDir});
  commands.push(installCmd);
  if (installCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, installCmd.command, installCmd.exitCode, installCmd.stderr, installCmd.stdout);
  }

  // Restore exact public registry-shaped SemVer in package.json
  manifestData.dependencies['@composable-svelte/core'] = corePkg.version;
  manifestData.dependencies['@composable-svelte/chat'] = chatPkg.version;
  writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));

  // Verify EVERY installed package post-install
  const postInstallVerification = verifyAllInstalledCandidatePackages(targetDir, pkgsToInstall);

  // Verify installed Svelte version matches requested exact pin
  const svelteVerification = verifyInstalledSvelteVersion(targetDir, sveltePin);

  // Copy managed recipe from archive
  const unpackedChat = join(unpackedRoot, 'chat');
  const recipeSource = findRecipeDirectory(unpackedChat, 'recipes/managed', 'chat');
  const recipesDest = join(targetDir, 'recipes/managed');
  mkdirSync(dirname(recipesDest), {recursive: true});
  cpSync(recipeSource.dir, recipesDest, {recursive: true});

  // Verify OPTIONAL ABSENCE: Code, Media, Prism, and PDF are absent
  const nm = join(targetDir, 'node_modules');
  const absentChecks = [
    {name: '@composable-svelte/code', path: join(nm, '@composable-svelte/code')},
    {name: '@composable-svelte/media', path: join(nm, '@composable-svelte/media')},
    {name: 'prismjs', path: join(nm, 'prismjs')},
    {name: 'pdfjs-dist', path: join(nm, 'pdfjs-dist')}
  ];

  const absenceVerified = [];
  for (const check of absentChecks) {
    const isPresent = existsSync(check.path);
    assert.equal(isPresent, false, `Optional peer ${check.name} unexpectedly present in chat recipe; must prove optional absence`);
    absenceVerified.push({package: check.name, status: 'absent-as-required'});
  }

  // Run recipe test with vitest if browser available or playwright installed
  let vitestRun = null;
  if (!skipBrowser) {
    vitestRun = runCommand('npx', ['--no', 'vitest', 'run', '--config', 'recipes/managed/vitest.config.ts'], {cwd: targetDir});
    commands.push(vitestRun);
    if (vitestRun.exitCode !== 0) {
      throw new RecipeExecutionError(recipeName, vitestRun.command, vitestRun.exitCode, vitestRun.stderr, vitestRun.stdout);
    }
  }

  return {
    name: recipeName,
    status: vitestRun ? 'passed' : 'partial-browser-skipped',
    recipeSource: recipeSource.source,
    projectDir: targetDir,
    sveltePin,
    svelteCheckpoint: svelteCheckpoint || 'newer',
    svelteInstalledVersion: svelteVerification.actual,
    sveltePinVerified: true,
    transport,
    paths: {
      projectDir: targetDir,
      manifestPath,
      lockPath: existsSync(join(targetDir, 'package-lock.json')) ? join(targetDir, 'package-lock.json') : null
    },
    installedInventory: postInstallVerification.map(v => ({
      packageName: v.packageName,
      archivePath: v.archivePath,
      installedDir: v.installedDir,
      totalFiles: v.totalFiles,
      matchedFiles: v.matchedFiles,
      verifiedMatched: v.verifiedMatched
    })),
    optionalAbsenceVerified: absenceVerified,
    commands: commands.map(c => ({
      command: c.command,
      exitCode: c.exitCode,
      durationMs: c.durationMs,
      stdout: c.stdout || '',
      stderr: c.stderr || ''
    }))
  };
}

export function runCodeRecipe({scratchDir, unpackedRoot, candidateMap, sveltePins, svelteCheckpoint = 'newer', skipBrowser}) {
  const recipeName = 'code-managed';
  const commands = [];
  const targetDir = join(scratchDir, 'code-recipe');
  mkdirSync(targetDir, {recursive: true});

  const corePkg = candidateMap.get('@composable-svelte/core');
  const codePkg = candidateMap.get('@composable-svelte/code');
  assert.ok(corePkg && codePkg, 'Core and Code packages are required for code-managed recipe');

  // Determine exact svelte pin (code minimum is 5.30.0)
  const sveltePin = resolveSveltePin({recipeName, checkpoint: svelteCheckpoint, sveltePins});

  const manifestPath = join(targetDir, 'package.json');
  const manifestData = {
    name: 'candidate-code-recipe',
    private: true,
    type: 'module',
    dependencies: {
      '@composable-svelte/core': `file:${corePkg.frozenPath || corePkg.path}`,
      '@composable-svelte/code': `file:${codePkg.frozenPath || codePkg.path}`,
      'svelte': sveltePin
    },
    devDependencies: {
      '@sveltejs/vite-plugin-svelte': '6.2.1',
      '@vitest/browser': '4.0.7',
      '@vitest/browser-playwright': '4.0.7',
      'playwright': '1.56.1',
      'svelte-check': '4.3.3',
      'typescript': '5.9.3',
      'vite': '6.4.1',
      'vitest': '4.0.7'
    }
  };
  writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));

  const pkgsToInstall = [corePkg, codePkg];
  const transport = materializeCandidatePackages(targetDir, pkgsToInstall, {unpackedRoot});

  const installCmd = runCommand('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], {cwd: targetDir});
  commands.push(installCmd);
  if (installCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, installCmd.command, installCmd.exitCode, installCmd.stderr, installCmd.stdout);
  }

  // Restore exact public registry-shaped SemVer in package.json
  manifestData.dependencies['@composable-svelte/core'] = corePkg.version;
  manifestData.dependencies['@composable-svelte/code'] = codePkg.version;
  writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));

  // Verify EVERY installed package post-install
  const postInstallVerification = verifyAllInstalledCandidatePackages(targetDir, pkgsToInstall);

  // Verify installed Svelte version matches requested exact pin
  const svelteVerification = verifyInstalledSvelteVersion(targetDir, sveltePin);

  // Copy managed recipe and svelte.config.js from archive
  const unpackedCode = join(unpackedRoot, 'code');
  const recipeSource = findRecipeDirectory(unpackedCode, 'recipes/managed', 'code');
  const recipesDest = join(targetDir, 'recipes/managed');
  mkdirSync(dirname(recipesDest), {recursive: true});
  cpSync(recipeSource.dir, recipesDest, {recursive: true});

  if (existsSync(join(recipesDest, 'svelte.config.js'))) {
    cpSync(join(recipesDest, 'svelte.config.js'), join(targetDir, 'svelte.config.js'));
  }

  // Identity-omission and incompatible-mapper controls against the installed Code artifact.
  const controls = runNodeCanvasActionControls(targetDir);
  commands.push(...controls.map(control => control.result));

  let vitestRun = null;
  if (!skipBrowser) {
    vitestRun = runCommand('npx', ['--no', 'vitest', 'run', '--config', 'recipes/managed/vitest.config.ts'], {cwd: targetDir});
    commands.push(vitestRun);
    if (vitestRun.exitCode !== 0) {
      throw new RecipeExecutionError(recipeName, vitestRun.command, vitestRun.exitCode, vitestRun.stderr, vitestRun.stdout);
    }
  }

  return {
    name: recipeName,
    status: vitestRun ? 'passed' : 'partial-browser-skipped',
    recipeSource: recipeSource.source,
    projectDir: targetDir,
    sveltePin,
    svelteCheckpoint: svelteCheckpoint || 'newer',
    svelteInstalledVersion: svelteVerification.actual,
    sveltePinVerified: true,
    transport,
    paths: {
      projectDir: targetDir,
      manifestPath,
      lockPath: existsSync(join(targetDir, 'package-lock.json')) ? join(targetDir, 'package-lock.json') : null
    },
    installedInventory: postInstallVerification.map(v => ({
      packageName: v.packageName,
      archivePath: v.archivePath,
      installedDir: v.installedDir,
      totalFiles: v.totalFiles,
      matchedFiles: v.matchedFiles,
      verifiedMatched: v.verifiedMatched
    })),
    actionControls: controls.map(({result, ...control}) => control),
    commands: commands.map(c => ({
      command: c.command,
      exitCode: c.exitCode,
      durationMs: c.durationMs,
      stdout: c.stdout || '',
      stderr: c.stderr || ''
    }))
  };
}

export function runMediaRecipe({scratchDir, unpackedRoot, candidateMap, sveltePins, svelteCheckpoint = 'newer', skipBrowser}) {
  const recipeName = 'media-managed';
  const commands = [];
  const targetDir = join(scratchDir, 'media-recipe');
  mkdirSync(targetDir, {recursive: true});

  const corePkg = candidateMap.get('@composable-svelte/core');
  const mediaPkg = candidateMap.get('@composable-svelte/media');
  assert.ok(corePkg && mediaPkg, 'Core and Media packages are required for media-managed recipe');

  // Determine exact svelte pin
  const sveltePin = resolveSveltePin({recipeName, checkpoint: svelteCheckpoint, sveltePins});

  const manifestPath = join(targetDir, 'package.json');
  const manifestData = {
    name: 'candidate-media-recipe',
    private: true,
    type: 'module',
    dependencies: {
      '@composable-svelte/core': `file:${corePkg.frozenPath || corePkg.path}`,
      '@composable-svelte/media': `file:${mediaPkg.frozenPath || mediaPkg.path}`,
      'svelte': sveltePin
    },
    devDependencies: {
      '@sveltejs/vite-plugin-svelte': '6.2.1',
      '@vitest/browser': '4.0.7',
      '@vitest/browser-playwright': '4.0.7',
      'playwright': '1.56.1',
      'svelte-check': '4.3.3',
      'typescript': '5.9.3',
      'vite': '6.4.1',
      'vitest': '4.0.7'
    }
  };
  writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));

  const pkgsToInstall = [corePkg, mediaPkg];
  const transport = materializeCandidatePackages(targetDir, pkgsToInstall, {unpackedRoot});

  const installCmd = runCommand('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], {cwd: targetDir});
  commands.push(installCmd);
  if (installCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, installCmd.command, installCmd.exitCode, installCmd.stderr, installCmd.stdout);
  }

  // Restore exact public registry-shaped SemVer in package.json
  manifestData.dependencies['@composable-svelte/core'] = corePkg.version;
  manifestData.dependencies['@composable-svelte/media'] = mediaPkg.version;
  writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));

  // Verify EVERY installed package post-install
  const postInstallVerification = verifyAllInstalledCandidatePackages(targetDir, pkgsToInstall);

  // Verify installed Svelte version matches requested exact pin
  const svelteVerification = verifyInstalledSvelteVersion(targetDir, sveltePin);

  const unpackedMedia = join(unpackedRoot, 'media');
  const recipeSource = findRecipeDirectory(unpackedMedia, 'recipes/managed', 'media');
  const recipesDest = join(targetDir, 'recipes/managed');
  mkdirSync(dirname(recipesDest), {recursive: true});
  cpSync(recipeSource.dir, recipesDest, {recursive: true});

  let vitestRun = null;
  if (!skipBrowser) {
    vitestRun = runCommand('npx', ['--no', 'vitest', 'run', '--config', 'recipes/managed/vitest.config.ts'], {cwd: targetDir});
    commands.push(vitestRun);
    if (vitestRun.exitCode !== 0) {
      throw new RecipeExecutionError(recipeName, vitestRun.command, vitestRun.exitCode, vitestRun.stderr, vitestRun.stdout);
    }
  }

  return {
    name: recipeName,
    status: vitestRun ? 'passed' : 'partial-browser-skipped',
    recipeSource: recipeSource.source,
    projectDir: targetDir,
    sveltePin,
    svelteCheckpoint: svelteCheckpoint || 'newer',
    svelteInstalledVersion: svelteVerification.actual,
    sveltePinVerified: true,
    transport,
    paths: {
      projectDir: targetDir,
      manifestPath,
      lockPath: existsSync(join(targetDir, 'package-lock.json')) ? join(targetDir, 'package-lock.json') : null
    },
    installedInventory: postInstallVerification.map(v => ({
      packageName: v.packageName,
      archivePath: v.archivePath,
      installedDir: v.installedDir,
      totalFiles: v.totalFiles,
      matchedFiles: v.matchedFiles,
      verifiedMatched: v.verifiedMatched
    })),
    microphoneGateNotice: 'Deterministic fake audio/voice devices verified; physical microphone gate remains open per COMPANION-RELEASE-READINESS.json',
    commands: commands.map(c => ({
      command: c.command,
      exitCode: c.exitCode,
      durationMs: c.durationMs,
      stdout: c.stdout || '',
      stderr: c.stderr || ''
    }))
  };
}

export function runCombinedChatCodeMediaRecipe({scratchDir, unpackedRoot, candidateMap, sveltePins, svelteCheckpoint = 'newer', skipBrowser}) {
  const recipeName = 'chat-code-media';
  const commands = [];
  const targetDir = join(scratchDir, 'chat-code-media-recipe');
  mkdirSync(targetDir, {recursive: true});

  const corePkg = candidateMap.get('@composable-svelte/core');
  const chatPkg = candidateMap.get('@composable-svelte/chat');
  const codePkg = candidateMap.get('@composable-svelte/code');
  const mediaPkg = candidateMap.get('@composable-svelte/media');
  assert.ok(corePkg && chatPkg && codePkg && mediaPkg, 'Core, Chat, Code, and Media packages are all required for chat-code-media combined recipe');

  // Determine exact svelte pin for combined
  const sveltePin = resolveSveltePin({recipeName, checkpoint: svelteCheckpoint, sveltePins});

  const manifestPath = join(targetDir, 'package.json');
  const manifestData = {
    name: 'candidate-chat-code-media-app',
    private: true,
    type: 'module',
    dependencies: {
      '@composable-svelte/core': `file:${corePkg.frozenPath || corePkg.path}`,
      '@composable-svelte/chat': `file:${chatPkg.frozenPath || chatPkg.path}`,
      '@composable-svelte/code': `file:${codePkg.frozenPath || codePkg.path}`,
      '@composable-svelte/media': `file:${mediaPkg.frozenPath || mediaPkg.path}`,
      'svelte': sveltePin,
      'isomorphic-dompurify': '^2.16.0'
    },
    devDependencies: {
      '@sveltejs/vite-plugin-svelte': '6.2.1',
      '@vitest/browser': '4.0.7',
      '@vitest/browser-playwright': '4.0.7',
      'playwright': '1.56.1',
      'svelte-check': '4.3.3',
      'typescript': '5.9.3',
      'vite': '6.4.1',
      'vitest': '4.0.7'
    }
  };
  writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));

  const pkgsToInstall = [corePkg, chatPkg, codePkg, mediaPkg];
  const transport = materializeCandidatePackages(targetDir, pkgsToInstall, {unpackedRoot});

  const installCmd = runCommand('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], {cwd: targetDir});
  commands.push(installCmd);
  if (installCmd.exitCode !== 0) {
    throw new RecipeExecutionError(recipeName, installCmd.command, installCmd.exitCode, installCmd.stderr, installCmd.stdout);
  }

  // Restore exact public registry-shaped SemVer in package.json
  manifestData.dependencies['@composable-svelte/core'] = corePkg.version;
  manifestData.dependencies['@composable-svelte/chat'] = chatPkg.version;
  manifestData.dependencies['@composable-svelte/code'] = codePkg.version;
  manifestData.dependencies['@composable-svelte/media'] = mediaPkg.version;
  writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));

  // Verify EVERY installed package post-install
  const postInstallVerification = verifyAllInstalledCandidatePackages(targetDir, pkgsToInstall);

  // Verify installed Svelte version matches requested exact pin
  const svelteVerification = verifyInstalledSvelteVersion(targetDir, sveltePin);

  // Run each shipped suite against the combined install, following each recipe README.
  const recipeSources = [];
  for (const slug of ['chat', 'code', 'media']) {
    const src = findRecipeDirectory(join(unpackedRoot, slug), 'recipes/managed', slug);
    recipeSources.push({package: slug, source: src.source});
    const dest = join(targetDir, 'recipes/managed');
    rmSync(dest, {recursive: true, force: true});
    mkdirSync(dirname(dest), {recursive: true});
    cpSync(src.dir, dest, {recursive: true});
    if (slug === 'code') cpSync(join(dest, 'svelte.config.js'), join(targetDir, 'svelte.config.js'));
    if (skipBrowser) continue;
    const vitestRun = runCommand('npx', ['--no', 'vitest', 'run', '--config', 'recipes/managed/vitest.config.ts'], {cwd: targetDir});
    commands.push(vitestRun);
    if (vitestRun.exitCode !== 0) {
      throw new RecipeExecutionError(`${recipeName}:${slug}`, vitestRun.command, vitestRun.exitCode, vitestRun.stderr, vitestRun.stdout);
    }
  }

  return {
    name: recipeName,
    status: skipBrowser ? 'partial-browser-skipped' : 'passed',
    recipeSources,
    projectDir: targetDir,
    sveltePin,
    svelteCheckpoint: svelteCheckpoint || 'newer',
    svelteInstalledVersion: svelteVerification.actual,
    sveltePinVerified: true,
    transport,
    paths: {
      projectDir: targetDir,
      manifestPath,
      lockPath: existsSync(join(targetDir, 'package-lock.json')) ? join(targetDir, 'package-lock.json') : null
    },
    installedInventory: postInstallVerification.map(v => ({
      packageName: v.packageName,
      archivePath: v.archivePath,
      installedDir: v.installedDir,
      totalFiles: v.totalFiles,
      matchedFiles: v.matchedFiles,
      verifiedMatched: v.verifiedMatched
    })),
    combinedPackages: ['@composable-svelte/core', '@composable-svelte/chat', '@composable-svelte/code', '@composable-svelte/media'],
    commands: commands.map(c => ({
      command: c.command,
      exitCode: c.exitCode,
      durationMs: c.durationMs,
      stdout: c.stdout || '',
      stderr: c.stderr || ''
    }))
  };
}

// ---------------------------------------------------------------------------
// Architecture Checker Qualification & Negative Controls
// ---------------------------------------------------------------------------

export function runArchitectureQualification({
  projectDir = null,
  scratchDir,
  checker,
  policy,
  corePkg,
  profile = 'starter',
  unpackedRoot = null,
  syntheticSmoke = false
}) {
  assert.ok(checker, 'Checker archive is required for architecture qualification');
  assert.ok(policy, 'External policy is required for architecture qualification');
  assert.ok(corePkg, 'Core package is required for architecture qualification');

  let appDir = projectDir;

  let postInstallVerification = null;
  let installCmd = null;
  let shippedPins = null;

  if (syntheticSmoke) {
    // Explicit synthetic smoke ONLY (for plumbing verification or negative controls)
    appDir = join(scratchDir, 'synthetic-smoke-app');
    mkdirSync(appDir, {recursive: true});

    writeFileSync(join(appDir, 'package.json'), JSON.stringify({
      name: 'synthetic-smoke-candidate',
      private: true,
      dependencies: {
        '@composable-svelte/core': `file:${corePkg.frozenPath || corePkg.path}`,
        'svelte': '5.57.0'
      },
      devDependencies: {
        '@composable-svelte/architecture': `file:${checker.frozenPath || checker.path}`
      }
    }, null, 2));

    writeFileSync(join(appDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {target: 'es2022', module: 'esnext'}
    }));

    const entryFile = join(appDir, 'src/main.ts');
    mkdirSync(dirname(entryFile), {recursive: true});
    writeFileSync(entryFile, 'import {Effect} from "@composable-svelte/core"; export const a = Effect.none();\n');

    const pkgsToInstall = [corePkg, checker];

    installCmd = runCommand('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], {cwd: appDir});
    if (installCmd.exitCode !== 0) {
      throw new RecipeExecutionError('synthetic-smoke', installCmd.command, installCmd.exitCode, installCmd.stderr, installCmd.stdout);
    }

    // Immediately restore public registry-shaped SemVer in package.json
    writeFileSync(join(appDir, 'package.json'), JSON.stringify({
      name: 'synthetic-smoke-candidate',
      private: true,
      dependencies: {
        '@composable-svelte/core': corePkg.version,
        'svelte': '5.57.0'
      },
      devDependencies: {
        '@composable-svelte/architecture': checker.version
      }
    }, null, 2));

    postInstallVerification = verifyAllInstalledCandidatePackages(appDir, pkgsToInstall);
    verifyInstalledSvelteVersion(appDir, '5.57.0');
  } else {
    // Real qualification requires an actual materialized app!
    if (!appDir) {
      // If projectDir was not directly provided, materialize the actual shipped starter
      // from candidate core archive
      appDir = join(scratchDir, 'core-starter-qualification');
      const unpackedCore = join(unpackedRoot || scratchDir, 'core');
      const recipeSource = findRecipeDirectory(unpackedCore, 'consumer', 'core');
      cpSync(recipeSource.dir, appDir, {recursive: true});

      const manifestPath = join(appDir, 'package.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      shippedPins = {core: manifest.dependencies?.['@composable-svelte/core'], checker: manifest.devDependencies?.['@composable-svelte/architecture'], svelte: manifest.dependencies?.svelte};
      assert.equal(shippedPins.core, corePkg.version, `Shipped starter pins core ${shippedPins.core}, candidate core is ${corePkg.version}`);
      manifest.dependencies = manifest.dependencies || {};
      manifest.dependencies['@composable-svelte/core'] = `file:${corePkg.frozenPath || corePkg.path}`;
      manifest.dependencies['svelte'] = '5.57.0';
      manifest.devDependencies = manifest.devDependencies || {};
      manifest.devDependencies['@composable-svelte/architecture'] = `file:${checker.frozenPath || checker.path}`;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      const pkgsToInstall = [corePkg, checker];
      installCmd = runCommand('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], {cwd: appDir});
      if (installCmd.exitCode !== 0) {
        throw new RecipeExecutionError('core-starter-qualification', installCmd.command, installCmd.exitCode, installCmd.stderr, installCmd.stdout);
      }

      // Immediately restore public registry-shaped SemVer in package.json
      manifest.dependencies['@composable-svelte/core'] = corePkg.version;
      manifest.devDependencies['@composable-svelte/architecture'] = checker.version;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      postInstallVerification = verifyAllInstalledCandidatePackages(appDir, pkgsToInstall);
      verifyInstalledSvelteVersion(appDir, '5.57.0');
    }
    assert.ok(existsSync(appDir), `Target project directory does not exist: ${appDir}`);
  }

  const checkerBin = join(appDir, 'node_modules/.bin/composable-svelte-architecture');
  const binScript = existsSync(checkerBin)
    ? checkerBin
    : join(appDir, 'node_modules/@composable-svelte/architecture/bin/composable-svelte-architecture.mjs');
  assert.ok(existsSync(binScript), `Checker CLI binary not found at ${binScript}`);

  const args = [
    '--mode', 'qualification',
    '--project', appDir,
    '--policy', policy.path,
    '--policy-sha256', policy.sha256,
    '--expected-core-version', policy.expectedCoreVersion
  ];
  if (policy.recordsRoot) {
    args.push('--records-root', policy.recordsRoot);
  }

  const checkCmd = binScript.endsWith('.mjs')
    ? runCommand('node', [binScript, ...args], {cwd: appDir})
    : runCommand(binScript, args, {cwd: appDir});

  if (checkCmd.exitCode !== EXIT.success) {
    throw new Error(`Architecture qualification exited with code ${checkCmd.exitCode} (expected 0):\n${checkCmd.stderr}\n${checkCmd.stdout}`);
  }

  let resultEnvelope;
  try {
    resultEnvelope = JSON.parse(checkCmd.stdout);
  } catch (err) {
    throw new Error(`Architecture qualification output could not be parsed as JSON: ${err.message}`);
  }

  // Validate qualification result using isQualificationPass
  const expectations = {
    policySha256: policy.sha256,
    expectedCoreVersion: policy.expectedCoreVersion,
    expectedCheckerVersion: checker.version
  };

  const passVerdict = isQualificationPass(resultEnvelope, expectations);
  if (!passVerdict) {
    throw new Error('Architecture qualification envelope failed isQualificationPass validation');
  }

  assert.equal(resultEnvelope.manualReviewRequired, true, 'manualReviewRequired must remain true');
  assert.deepEqual(resultEnvelope.limits, LIMITS, 'limits must preserve all inactive rule limitations');

  return {
    status: 'passed',
    exitCode: checkCmd.exitCode,
    qualificationTarget: syntheticSmoke ? 'synthetic-smoke-app' : 'materialized-shipped-app',
    shippedPins,
    projectDir: appDir,
    profile,
    qualification: resultEnvelope.qualification,
    qualificationScope: resultEnvelope.qualificationScope,
    manualReviewRequired: resultEnvelope.manualReviewRequired,
    enforcedRuleCount: resultEnvelope.rules?.enforcedCount,
    limits: resultEnvelope.limits,
    envelope: resultEnvelope,
    paths: {
      projectDir: appDir,
      manifestPath: join(appDir, 'package.json'),
      lockPath: existsSync(join(appDir, 'package-lock.json')) ? join(appDir, 'package-lock.json') : null
    },
    installedInventory: (postInstallVerification || []).map(v => ({
      packageName: v.packageName,
      archivePath: v.archivePath,
      installedDir: v.installedDir,
      totalFiles: v.totalFiles,
      matchedFiles: v.matchedFiles,
      verifiedMatched: v.verifiedMatched
    })),
    commands: [
      ...(installCmd ? [installCmd] : []),
      checkCmd
    ].map(c => ({
      command: c.command,
      exitCode: c.exitCode,
      durationMs: c.durationMs,
      stdout: c.stdout || '',
      stderr: c.stderr || ''
    }))
  };
}

export function runNegativeControls({scratchDir, validatedManifest, checker, policy, corePkg}) {
  const controlResults = [];

  // Negative Control 1: Wrong Archive Hash
  {
    const controlName = 'wrong-archive-hash';
    const corruptedManifest = structuredClone(validatedManifest);
    // Tamper with first package's sha256
    const firstPkg = corruptedManifest.packages[0];
    const tamperedSha = firstPkg.sha256.slice(0, -1) + (firstPkg.sha256.endsWith('0') ? '1' : '0');
    firstPkg.sha256 = tamperedSha;

    try {
      verifyArchivesPreInstall(corruptedManifest);
      throw new NegativeControlFailedError(controlName, 'Archive with corrupted sha256 was unexpectedly accepted');
    } catch (err) {
      if (err instanceof NegativeControlFailedError) throw err;
      assert.ok(err instanceof ArchiveHashMismatchError || err.message.includes('mismatch'), `Unexpected error for ${controlName}: ${err.message}`);
      controlResults.push({
        control: controlName,
        expectedOutcome: 'rejected-before-install',
        actualOutcome: 'rejected',
        errorClass: err.name,
        errorMessage: err.message,
        passed: true
      });
    }
  }

  // Negative Control 2: Wrong Archive Version
  {
    const controlName = 'wrong-archive-version';
    const corruptedManifest = structuredClone(validatedManifest);
    const firstPkg = corruptedManifest.packages[0];
    firstPkg.version = '99.99.99';

    try {
      verifyArchivesPreInstall(corruptedManifest);
      throw new NegativeControlFailedError(controlName, 'Archive with wrong version was unexpectedly accepted');
    } catch (err) {
      if (err instanceof NegativeControlFailedError) throw err;
      assert.ok(err instanceof ArchiveVersionMismatchError || err.message.includes('version mismatch'), `Unexpected error for ${controlName}: ${err.message}`);
      controlResults.push({
        control: controlName,
        expectedOutcome: 'rejected-before-install',
        actualOutcome: 'rejected',
        errorClass: err.name,
        errorMessage: err.message,
        passed: true
      });
    }
  }

  // Architecture Checker Negative Controls (if checker and policy provided)
  if (checker && policy && corePkg) {
    const smokeStaging = join(scratchDir, 'arch-negative-controls-smoke');
    // Ensure minimal synthetic smoke app exists for checker negative controls
    runArchitectureQualification({
      scratchDir: smokeStaging,
      checker,
      policy,
      corePkg,
      syntheticSmoke: true
    });
    const archProjectDir = join(smokeStaging, 'synthetic-smoke-app');
    const checkerBin = existsSync(join(archProjectDir, 'node_modules/.bin/composable-svelte-architecture'))
      ? join(archProjectDir, 'node_modules/.bin/composable-svelte-architecture')
      : join(archProjectDir, 'node_modules/@composable-svelte/architecture/bin/composable-svelte-architecture.mjs');
    const binScript = checkerBin;

    // Negative Control 3: Wrong Policy Pin
    {
      const controlName = 'wrong-policy-pin';
      const fakeSha = '0'.repeat(64);
      const args = [
        '--mode', 'qualification',
        '--project', archProjectDir,
        '--policy', policy.path,
        '--policy-sha256', fakeSha,
        '--expected-core-version', policy.expectedCoreVersion
      ];
      const res = binScript.endsWith('.mjs')
        ? runCommand('node', [binScript, ...args], {cwd: archProjectDir})
        : runCommand(binScript, args, {cwd: archProjectDir});

      assert.notEqual(res.exitCode, 0, 'Checker with wrong policy sha256 pin must not return exit code 0');
      let refused = false;
      try {
        const json = JSON.parse(res.stdout);
        refused = json.qualification === 'refused' && json.analysisErrors.some(e => e.code === 'policy-pin-mismatch');
      } catch {}
      assert.ok(refused || res.exitCode === EXIT.analysisError || res.exitCode === EXIT.usage, 'Checker must refuse wrong policy pin');

      controlResults.push({
        control: controlName,
        expectedOutcome: 'refused-with-exit-code-21-or-22',
        actualOutcome: `exit-code-${res.exitCode}`,
        command: res.command,
        stdout: res.stdout,
        stderr: res.stderr,
        passed: true
      });
    }

    // Negative Control 4: Wrong Core Pin
    {
      const controlName = 'wrong-core-pin';
      const args = [
        '--mode', 'qualification',
        '--project', archProjectDir,
        '--policy', policy.path,
        '--policy-sha256', policy.sha256,
        '--expected-core-version', '0.99.99'
      ];
      const res = binScript.endsWith('.mjs')
        ? runCommand('node', [binScript, ...args], {cwd: archProjectDir})
        : runCommand(binScript, args, {cwd: archProjectDir});

      assert.notEqual(res.exitCode, 0, 'Checker with wrong expected core version must not return exit code 0');
      let refused = false;
      try {
        const json = JSON.parse(res.stdout);
        refused = json.qualification === 'refused' && json.analysisErrors.some(e => e.code === 'core-version-mismatch');
      } catch {}
      assert.ok(refused || res.exitCode === EXIT.analysisError, 'Checker must refuse core pin mismatch');

      controlResults.push({
        control: controlName,
        expectedOutcome: 'refused-with-exit-code-21',
        actualOutcome: `exit-code-${res.exitCode}`,
        command: res.command,
        stdout: res.stdout,
        stderr: res.stderr,
        passed: true
      });
    }

    // Negative Control 5: Incomplete Analysis (Missing scan root)
    {
      const controlName = 'incomplete-analysis';
      const incompletePolicyData = JSON.parse(readFileSync(policy.path, 'utf8'));
      incompletePolicyData.project = {
        ...incompletePolicyData.project,
        roots: ['nonexistent-scan-root.ts']
      };
      const incompletePolicyFile = join(scratchDir, 'incomplete-policy.json');
      const incompletePolicyText = JSON.stringify(incompletePolicyData, null, 2);
      writeFileSync(incompletePolicyFile, incompletePolicyText);
      const incompletePolicySha = sha256Hex(Buffer.from(incompletePolicyText, 'utf8'));

      const args = [
        '--mode', 'qualification',
        '--project', archProjectDir,
        '--policy', incompletePolicyFile,
        '--policy-sha256', incompletePolicySha,
        '--expected-core-version', policy.expectedCoreVersion
      ];
      const res = binScript.endsWith('.mjs')
        ? runCommand('node', [binScript, ...args], {cwd: archProjectDir})
        : runCommand(binScript, args, {cwd: archProjectDir});

      assert.notEqual(res.exitCode, 0, 'Checker with missing scan root must not return exit code 0');
      let refused = false;
      try {
        const json = JSON.parse(res.stdout);
        refused = json.qualification === 'refused' && json.analysisErrors.some(e => e.code === 'missing-root' || e.code === 'empty-analysis');
      } catch {}
      assert.ok(refused || res.exitCode === EXIT.analysisError, 'Checker must refuse incomplete analysis');

      controlResults.push({
        control: controlName,
        expectedOutcome: 'refused-with-exit-code-21',
        actualOutcome: `exit-code-${res.exitCode}`,
        command: res.command,
        stdout: res.stdout,
        stderr: res.stderr,
        passed: true
      });
    }
  }

  // Negative Control 6: Missing Recipe Directory in Candidate Archive (No Source Fallback)
  {
    const controlName = 'missing-recipe-directory';
    const fakeEmptyArchiveDir = join(scratchDir, 'fake-empty-pkg');
    mkdirSync(fakeEmptyArchiveDir, {recursive: true});
    let errorThrown = false;
    try {
      findRecipeDirectory(fakeEmptyArchiveDir, 'recipes/managed', 'fake-pkg');
    } catch (err) {
      errorThrown = true;
      assert.ok(err.message.includes('not found in candidate archive') && err.message.includes('prohibited'));
    }
    assert.ok(errorThrown, 'findRecipeDirectory must throw error when archive lacks recipes; source fallback is prohibited');

    controlResults.push({
      control: controlName,
      expectedOutcome: 'thrown-error-source-fallback-prohibited',
      actualOutcome: 'rejected-without-fallback',
      passed: true
    });
  }

  return controlResults;
}

// ---------------------------------------------------------------------------
// Receipt Generation
// ---------------------------------------------------------------------------

export function writeReceipts(evidenceDir, receiptData) {
  mkdirSync(evidenceDir, {recursive: true});

  const receiptPath = join(evidenceDir, 'qualification-receipt.json');
  writeFileSync(receiptPath, JSON.stringify(receiptData, null, 2));

  const summaryLines = [
    '# Final Immutable Archive Qualification Receipt',
    '',
    `**Timestamp**: ${receiptData.timestamp}`,
    `**Overall Verdict**: **${receiptData.verdict}** (${receiptData.status})`,
    `**Full Qualification Claimed**: \`${receiptData.fullQualificationClaimed}\``,
    `**Svelte Checkpoint**: \`${receiptData.svelteCheckpoint || 'newer'}\``,
    ...(receiptData.incompleteReasons && receiptData.incompleteReasons.length > 0 ? [
      '',
      '> [!WARNING] **Incomplete Qualification Notice**:',
      ...receiptData.incompleteReasons.map(r => `> - ${r}`)
    ] : []),
    `**Manifest Schema**: \`${receiptData.manifest.schema}\``,
    ...(receiptData.manifest.manifestPath ? [`**Manifest Path**: \`${receiptData.manifest.manifestPath}\``] : []),
    '',
    '## 1. Candidate Archives Preflight Verification',
    '',
    '| Package | Version | SHA-256 | Files | Size (bytes) | Status |',
    '| --- | --- | --- | --- | --- | --- |',
    ...receiptData.preflight.archives.map(a =>
      `| \`${a.name}\` | \`${a.version}\` | \`${a.sha256.slice(0, 16)}...\` | ${a.fileCount} | ${a.sizeBytes} | PASSED |`
    ),
    ...(receiptData.preflight.checker ? [
      `| \`${receiptData.preflight.checker.name}\` | \`${receiptData.preflight.checker.version}\` | \`${receiptData.preflight.checker.sha256.slice(0, 16)}...\` | ${receiptData.preflight.checker.fileCount} | ${receiptData.preflight.checker.sizeBytes} | PASSED (Checker) |`
    ] : []),
    '',
    '## 2. Candidate Transport & Identity Verification',
    '',
    `- **Transport Type**: \`${receiptData.transport.type}\``,
    `- **Identity Honest Statement**: ${receiptData.transport.statement}`,
    `- **Registry Provenance Claimed**: ${receiptData.transport.registryProvenanceClaimed}`,
    `- **Archive Freezing**: ${receiptData.transport.archiveFreezing || 'Frozen before extraction/install'}`,
    `- **Installed File Verification**: ${receiptData.transport.installedFileVerification || 'Every candidate package verified post-install byte-for-byte against immutable archives'}`,
    `- **Verified Candidate Packages Inventory**: ${receiptData.installedInventory?.length || 0} candidate package installations verified byte-for-byte`,
    '',
    '## 3. Shipped Managed Recipes',
    '',
    '| Recipe | Checkpoint | Svelte Pin | Svelte Verified | Status | Commands | Candidate Packages Verified |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...receiptData.recipes.map(r =>
      `| \`${r.name}\` | \`${r.svelteCheckpoint || 'newer'}\` | \`${r.sveltePin || 'default'}\` | \`${r.svelteInstalledVersion || 'verified'}\` | **${r.status.toUpperCase()}** | ${r.commands?.length || 0} | ${r.installedInventory?.length || 0} |`
    ),
    '',
    '## 4. Architecture Qualification & Negative Controls',
    '',
    receiptData.architectureQualification ? [
      `- **Checker Qualification**: **${receiptData.architectureQualification.status.toUpperCase()}**`,
      `- **Qualification Target**: \`${receiptData.architectureQualification.qualificationTarget}\``,
      `- **Profile**: \`${receiptData.architectureQualification.profile}\``,
      `- **Qualification Scope**: \`${receiptData.architectureQualification.qualificationScope}\``,
      `- **Manual Review Required**: ${receiptData.architectureQualification.manualReviewRequired}`,
      `- **Enforced Rule Count**: ${receiptData.architectureQualification.enforcedRuleCount}`,
      `- **Inactive Rule Limitations**: Preserved (${receiptData.architectureQualification.limits?.length || 0} limits)`,
      `- **Candidate Packages Verified Post-Install**: ${receiptData.architectureQualification.installedInventory?.length || 0}`
    ].join('\n') : '- *Architecture qualification: not run (checker archive or policy omitted)*',
    '',
    '### Negative Controls',
    '',
    '| Negative Control | Expected Rejection | Actual Outcome | Status |',
    '| --- | --- | --- | --- |',
    ...receiptData.negativeControls.map(nc =>
      `| \`${nc.control}\` | \`${nc.expectedOutcome}\` | \`${nc.actualOutcome}\` | **${nc.passed ? 'PASSED (Properly Rejected)' : 'FAILED'}** |`
    ),
    '',
    '## 5. Review Obligations & Limits',
    '',
    '> [!IMPORTANT]',
    '> Passing automated qualification proves bounded conformance to active detector families.',
    '> Manual architectural review remains mandatory (`manualReviewRequired: true`).',
    '> Fabrication of registry provenance is strictly prohibited; candidate transport is accurately recorded.'
  ];

  const summaryPath = join(evidenceDir, 'SUMMARY.md');
  writeFileSync(summaryPath, summaryLines.join('\n') + '\n');

  return {receiptPath, summaryPath};
}

// ---------------------------------------------------------------------------
// Main Verification Workflow
// ---------------------------------------------------------------------------

const MODES = ['all', 'preflight', 'recipes', 'qualification', 'negative-controls'];
const RECIPE_PACKAGES = {
  'core-starter': ['core'],
  'auth-consumer': ['core', 'auth'],
  'charts-fixture': ['core', 'charts'],
  'graphics-fixture': ['core', 'graphics'],
  'maps-fixture': ['core', 'maps'],
  'chat-managed': ['core', 'chat'],
  'code-managed': ['core', 'code'],
  'media-managed': ['core', 'media'],
  'chat-code-media': ['core', 'chat', 'code', 'media']
};

/**
 * Runs the requested phase and always leaves a receipt for it: a failure after the evidence
 * directory is known overwrites any earlier receipt with a FAILED one carrying the error and the
 * failing command's output, so a stale PASSED receipt cannot outlive a failing rerun.
 */
export async function runVerification(rawManifest, options = {}) {
  const progress = {startTime: new Date().toISOString(), evidenceDir: options.evidenceDir ? resolve(options.evidenceDir) : null, recipes: [], architectureQualification: null, negativeControls: [], preflight: null};
  try {
    return await _runVerification(rawManifest, options, progress);
  } catch (error) {
    if (progress.evidenceDir) _writeFailureReceipt(progress, options, error);
    throw error;
  }
}

function _writeFailureReceipt(progress, options, error) {
  mkdirSync(progress.evidenceDir, {recursive: true});
  const receipt = {
    schema: 'composable-svelte/qualification-receipt/v1',
    timestamp: progress.startTime,
    verdict: 'FAILED',
    status: 'FAILED',
    fullQualificationClaimed: false,
    mode: options.mode || 'all',
    manifestPath: options.manifest ? resolve(options.manifest) : null,
    error: {
      name: error.name,
      message: error.message,
      recipeName: error.recipeName,
      command: error.command,
      exitCode: error.exitCode,
      stdout: error.stdout,
      stderr: error.stderr,
      details: error.errors
    },
    preflight: progress.preflight,
    completedRecipes: progress.recipes,
    architectureQualification: progress.architectureQualification,
    negativeControls: progress.negativeControls
  };
  writeFileSync(join(progress.evidenceDir, 'qualification-receipt.json'), JSON.stringify(receipt, null, 2));
  writeFileSync(join(progress.evidenceDir, 'SUMMARY.md'), `# Final Immutable Archive Qualification Receipt\n\n**Overall Verdict**: **FAILED** (FAILED)\n**Full Qualification Claimed**: \`false\`\n\n\`${error.name}\`: ${error.message}\n`);
}

async function _runVerification(rawManifest, options, progress) {
  const startTime = progress.startTime;
  const mode = options.mode || 'all';
  const skipBrowser = Boolean(options.skipBrowser);
  const selectedRecipes = options.recipes ? options.recipes.split(',').map(s => s.trim()) : null;
  const svelteCheckpoint = options.svelteCheckpoint || rawManifest.svelteCheckpoint || 'newer';

  // One run executes exactly one checkpoint; dual compatibility evidence is two separate receipts.
  if (!['newer', 'minimum'].includes(svelteCheckpoint)) {
    throw new ManifestValidationError(`Invalid svelteCheckpoint '${svelteCheckpoint}': must be 'newer' or 'minimum' (run each checkpoint separately)`);
  }
  if (!MODES.includes(mode)) {
    throw new ManifestValidationError(`Invalid mode '${mode}': must be one of ${MODES.join(', ')}`);
  }
  for (const name of selectedRecipes || []) {
    if (name !== 'all' && name !== 'none' && !ALL_RECIPE_NAMES.includes(name)) {
      throw new ManifestValidationError(`Unknown recipe '${name}': must be one of ${ALL_RECIPE_NAMES.join(', ')}, all, none`);
    }
  }

  console.log(`[qualification-harness] Starting release archives verification in mode '${mode}' (Svelte checkpoint: ${svelteCheckpoint})...`);

  // Step 1: Validate Manifest
  const manifest = validateManifest(rawManifest);
  const evidenceDir = options.evidenceDir ? resolve(options.evidenceDir) : (manifest.evidenceDir || resolve(REPO_ROOT, `evidence/qualification-${Date.now()}`));
  progress.evidenceDir = evidenceDir;

  // Step 2: Preflight Archive Verification BEFORE installs
  console.log('[qualification-harness] Step 1/5: Preflight archive verification...');
  const preflight = verifyArchivesPreInstall(manifest);
  progress.preflight = preflight;
  console.log(`[qualification-harness] Verified ${preflight.archives.length} package archives and preflight integrity checks passed.`);

  if (mode === 'preflight') {
    return {
      status: 'PASSED',
      mode,
      preflight
    };
  }

  // Create staging scratch directory and freeze archives immediately
  const scratchDir = mkdtempSync(join(tmpdir(), 'composable-archive-qual-'));
  const freezeDir = join(scratchDir, 'frozen-archives');
  const frozen = freezeCandidateArchives(preflight.archives, freezeDir, preflight.checker);
  const frozenArchives = frozen.archives;
  const frozenChecker = frozen.checker;

  const unpackedRoot = join(scratchDir, 'unpacked');
  mkdirSync(unpackedRoot, {recursive: true});

  try {
    // Step 3: Safe Extraction of frozen archives for recipe inspection
    console.log('[qualification-harness] Step 2/5: Safe unpacking of frozen candidate archives (TOCTOU protected)...');
    const candidateMap = new Map();
    for (const pkg of frozenArchives) {
      const slug = pkg.name.replace(/^@composable-svelte\//, '');
      const dest = join(unpackedRoot, slug);
      safeExtractTar(pkg.path, dest, {stripComponents: 0});
      candidateMap.set(pkg.name, pkg);
    }

    if (frozenChecker) {
      const dest = join(unpackedRoot, 'architecture');
      safeExtractTar(frozenChecker.path, dest, {stripComponents: 0});
    }

    // Explicit validation for narrow mode: qualification requires checker, policy, and core
    if (mode === 'qualification') {
      if (!frozenChecker) {
        throw new ManifestValidationError('Architecture qualification mode requested, but no checkerArchive provided in manifest');
      }
      if (!manifest.policy) {
        throw new ManifestValidationError('Architecture qualification mode requested, but no policy provided in manifest');
      }
      if (!candidateMap.has('@composable-svelte/core')) {
        throw new ManifestValidationError('Architecture qualification mode requested, but @composable-svelte/core is not in candidate manifest');
      }
    }

    // An explicitly selected recipe must run; it cannot be skipped because a package is missing.
    for (const name of selectedRecipes || []) {
      const missing = (RECIPE_PACKAGES[name] || []).filter(slug => !candidateMap.has(`@composable-svelte/${slug}`));
      if (missing.length > 0) {
        throw new ManifestValidationError(`Recipe '${name}' was requested but the manifest lacks: ${missing.join(', ')}`);
      }
    }

    // Step 4: Run Shipped Managed Recipes
    const recipeResults = progress.recipes;
    let coreStarterResult = null;
    const shouldRun = (name) => {
      if (mode !== 'all' && mode !== 'recipes') return false;
      if (!selectedRecipes || selectedRecipes.includes('all')) return true;
      return selectedRecipes.includes(name);
    };

    console.log('[qualification-harness] Step 3/5: Running shipped managed recipes...');

    // Core starter
    if (shouldRun('core-starter') && candidateMap.has('@composable-svelte/core')) {
      console.log('  -> Running core-starter recipe...');
      coreStarterResult = runCoreStarterRecipe({
        scratchDir,
        unpackedRoot,
        candidateMap,
        sveltePins: manifest.sveltePins,
        svelteCheckpoint,
        skipBrowser,
        checker: frozenChecker
      });
      recipeResults.push(coreStarterResult);
      console.log('     ✓ core-starter passed');
    }

    // Auth consumer
    if (shouldRun('auth-consumer') && candidateMap.has('@composable-svelte/core') && candidateMap.has('@composable-svelte/auth')) {
      console.log('  -> Running auth-consumer recipe...');
      const r = runAuthConsumerRecipe({
        scratchDir,
        unpackedRoot,
        candidateMap,
        sveltePins: manifest.sveltePins,
        svelteCheckpoint,
        skipBrowser
      });
      recipeResults.push(r);
      console.log('     ✓ auth-consumer passed');
    }

    // Charts fixture
    if (shouldRun('charts-fixture') && candidateMap.has('@composable-svelte/core') && candidateMap.has('@composable-svelte/charts')) {
      console.log('  -> Running charts-fixture recipe...');
      const r = runFixtureRecipe('charts', 'fixtures/installed-consumer', {
        scratchDir,
        unpackedRoot,
        candidateMap,
        sveltePins: manifest.sveltePins,
        svelteCheckpoint,
        skipBrowser
      });
      recipeResults.push(r);
      console.log('     ✓ charts-fixture passed');
    }

    // Graphics fixture
    if (shouldRun('graphics-fixture') && candidateMap.has('@composable-svelte/core') && candidateMap.has('@composable-svelte/graphics')) {
      console.log('  -> Running graphics-fixture recipe...');
      const r = runFixtureRecipe('graphics', 'fixtures/installed-consumer', {
        scratchDir,
        unpackedRoot,
        candidateMap,
        sveltePins: manifest.sveltePins,
        svelteCheckpoint,
        skipBrowser
      });
      recipeResults.push(r);
      console.log('     ✓ graphics-fixture passed');
    }

    // Maps fixture
    if (shouldRun('maps-fixture') && candidateMap.has('@composable-svelte/core') && candidateMap.has('@composable-svelte/maps')) {
      console.log('  -> Running maps-fixture recipe...');
      const r = runFixtureRecipe('maps', 'fixtures/installed-consumer', {
        scratchDir,
        unpackedRoot,
        candidateMap,
        sveltePins: manifest.sveltePins,
        svelteCheckpoint,
        skipBrowser
      });
      recipeResults.push(r);
      console.log('     ✓ maps-fixture passed');
    }

    // Chat managed
    if (shouldRun('chat-managed') && candidateMap.has('@composable-svelte/core') && candidateMap.has('@composable-svelte/chat')) {
      console.log('  -> Running chat-managed recipe (verifying optional peer absence)...');
      const r = runChatRecipe({
        scratchDir,
        unpackedRoot,
        candidateMap,
        sveltePins: manifest.sveltePins,
        svelteCheckpoint,
        skipBrowser
      });
      recipeResults.push(r);
      console.log('     ✓ chat-managed passed (optional absence confirmed)');
    }

    // Code managed
    if (shouldRun('code-managed') && candidateMap.has('@composable-svelte/core') && candidateMap.has('@composable-svelte/code')) {
      console.log('  -> Running code-managed recipe (verifying action controls)...');
      const r = runCodeRecipe({
        scratchDir,
        unpackedRoot,
        candidateMap,
        sveltePins: manifest.sveltePins,
        svelteCheckpoint,
        skipBrowser
      });
      recipeResults.push(r);
      console.log('     ✓ code-managed passed (action lifting omission & incompatible mapper check confirmed)');
    }

    // Media managed
    if (shouldRun('media-managed') && candidateMap.has('@composable-svelte/core') && candidateMap.has('@composable-svelte/media')) {
      console.log('  -> Running media-managed recipe...');
      const r = runMediaRecipe({
        scratchDir,
        unpackedRoot,
        candidateMap,
        sveltePins: manifest.sveltePins,
        svelteCheckpoint,
        skipBrowser
      });
      recipeResults.push(r);
      console.log('     ✓ media-managed passed');
    }

    // Combined chat-code-media
    if (shouldRun('chat-code-media') && candidateMap.has('@composable-svelte/core') && candidateMap.has('@composable-svelte/chat') && candidateMap.has('@composable-svelte/code') && candidateMap.has('@composable-svelte/media')) {
      console.log('  -> Running combined chat-code-media recipe...');
      const r = runCombinedChatCodeMediaRecipe({
        scratchDir,
        unpackedRoot,
        candidateMap,
        sveltePins: manifest.sveltePins,
        svelteCheckpoint,
        skipBrowser
      });
      recipeResults.push(r);
      console.log('     ✓ combined chat-code-media passed');
    }

    // Re-verify every candidate's installed bytes and locked identity after the recipe's commands
    // ran, so no later npm operation can have replaced an archive the receipt vouches for.
    const recheck = (projectDir, names) => {
      const pkgs = names.map(name => candidateMap.get(name) || (frozenChecker?.name === name ? frozenChecker : null));
      assert.ok(pkgs.every(Boolean), `Unknown candidate among ${names.join(', ')}`);
      return {
        installed: verifyAllInstalledCandidatePackages(projectDir, pkgs).map(v => ({packageName: v.packageName, totalFiles: v.totalFiles})),
        lockfile: verifyLockedCandidateIdentities(projectDir, pkgs)
      };
    };
    for (const r of recipeResults) {
      r.postRunVerification = recheck(r.projectDir, r.installedInventory.map(v => v.packageName));
    }
    if (mode === 'recipes' && recipeResults.length === 0) {
      throw new ManifestValidationError('No recipe was executed; a recipes run must execute at least one recipe');
    }
    const recipesNotRun = ALL_RECIPE_NAMES.filter(name => !recipeResults.some(r => r.name === name));

    // Step 5: Architecture Checker Qualification
    let archQualification = null;
    if (mode === 'qualification' && frozenChecker && manifest.policy && candidateMap.has('@composable-svelte/core')) {
      console.log('[qualification-harness] Step 4/5: Running architecture checker qualification on actual materialized app...');
      const targetProjectDir = null; // Explicit opt-in analysis gets its own checker installation.
      archQualification = runArchitectureQualification({
        projectDir: targetProjectDir,
        scratchDir,
        unpackedRoot,
        checker: frozenChecker,
        policy: manifest.policy,
        corePkg: candidateMap.get('@composable-svelte/core'),
        profile: manifest.policy.profile || 'starter'
      });
      archQualification.postRunVerification = recheck(archQualification.projectDir, ['@composable-svelte/core', frozenChecker.name]);
      progress.architectureQualification = archQualification;
      console.log('     ✓ architecture qualification passed on actual materialized app (isQualificationPass: true)');
    }

    // Step 6: Negative Controls
    let negativeControls = [];
    if (mode === 'all' || mode === 'negative-controls') {
      console.log('[qualification-harness] Step 5/5: Executing negative controls...');
      negativeControls = runNegativeControls({
        scratchDir,
        validatedManifest: manifest,
        checker: mode === 'negative-controls' ? frozenChecker : null,
        policy: mode === 'negative-controls' ? manifest.policy : null,
        corePkg: candidateMap.get('@composable-svelte/core')
      });
      progress.negativeControls = negativeControls;
      console.log(`     ✓ all ${negativeControls.length} negative controls properly failed as expected`);
    }

    // Calculate final verdict, status, and incomplete reasons
    let verdict;
    let status;
    let fullQualificationClaimed = false;
    const incompleteReasons = [];

    if (mode === 'preflight') {
      verdict = 'PREFLIGHT_PASSED';
      status = 'PASSED';
    } else if (mode === 'recipes') {
      incompleteReasons.push('Narrow phase: architecture qualification and negative controls were not executed');
      if (skipBrowser) {
        verdict = 'PARTIAL_BROWSER_SKIPPED';
        status = 'PARTIAL';
        incompleteReasons.push('Browser tests were skipped (--skip-browser); full recipe qualification requires browser execution');
      } else {
        verdict = 'RECIPES_PASSED';
        status = 'PASSED';
      }
    } else if (mode === 'qualification') {
      // Checker qualification of one materialized app: a narrow phase, not release qualification.
      verdict = 'ARCHITECTURE_QUALIFICATION_PASSED';
      status = 'PASSED';
      incompleteReasons.push('Narrow phase: shipped recipes and negative controls were not executed');
    } else if (mode === 'negative-controls') {
      if (negativeControls.some(nc => nc.control === 'incomplete-analysis')) {
        verdict = 'NEGATIVE_CONTROLS_PASSED';
        status = 'PASSED';
      } else {
        verdict = 'PARTIAL_NEGATIVE_CONTROLS_CHECKER_PENDING';
        status = 'PARTIAL';
        incompleteReasons.push('Checker, external policy or core omitted: policy-pin, core-pin and incomplete-analysis controls were not executed');
      }
    } else if (mode === 'all') {
      const allRecipesRan = recipesNotRun.length === 0;

      if (skipBrowser) {
        incompleteReasons.push('Browser tests were skipped (--skip-browser); full qualification requires browser verification');
      }
      if (!allRecipesRan) {
        incompleteReasons.push(`Recipes not executed: ${recipesNotRun.join(', ')}`);
      }
      if (recipeResults.some(r => r.status !== 'passed')) {
        incompleteReasons.push('At least one recipe did not execute all of its steps');
      }

      if (incompleteReasons.length === 0) {
        verdict = 'PASSED';
        status = 'PASSED';
        // Runtime recipes and archive controls are not a complete release authority.
        fullQualificationClaimed = false;
      } else {
        status = 'PARTIAL';
        fullQualificationClaimed = false;
        if (skipBrowser) {
          verdict = 'PARTIAL_BROWSER_SKIPPED';

        } else {
          verdict = 'PARTIAL_RECIPES_SUBSET';
        }
      }
    }

    // Aggregate installed inventory across all recipes and qualification
    const aggregatedInstalledInventory = [];
    for (const r of recipeResults) {
      if (Array.isArray(r.installedInventory)) {
        aggregatedInstalledInventory.push(...r.installedInventory);
      }
    }
    if (Array.isArray(archQualification?.installedInventory)) {
      aggregatedInstalledInventory.push(...archQualification.installedInventory);
    }

    // Generate Receipts
    const receiptData = {
      schema: 'composable-svelte/qualification-receipt/v1',
      timestamp: startTime,
      verdict,
      status,
      fullQualificationClaimed,
      incompleteReasons,
      mode,
      svelteCheckpoint,
      recipesNotRun,
      manifest: {
        schema: manifest.schema,
        manifestPath: options.manifest ? resolve(options.manifest) : null,
        releaseFinal: rawManifest.releaseFinal ?? null,
        releaseCandidate: rawManifest.releaseCandidate ?? null,
        evidenceDir,
        sveltePins: manifest.sveltePins,
        svelteCheckpoint
      },
      preflight: {
        archives: frozenArchives.map(a => ({
          name: a.name,
          version: a.version,
          path: a.path,
          originalPath: a.originalPath || a.path,
          sha256: a.sha256,
          integrity: a.integrity,
          manifestStatus: a.status,
          fileCount: a.fileCount,
          sizeBytes: a.sizeBytes
        })),
        checker: frozenChecker ? {
          name: frozenChecker.name,
          version: frozenChecker.version,
          path: frozenChecker.path,
          originalPath: frozenChecker.originalPath || frozenChecker.path,
          sha256: frozenChecker.sha256
        } : null,
        policy: preflight.policy
      },
      transport: {
        type: 'local-candidate-tarball',
        statement: 'Materialized candidate packages directly from immutable archives with exact SHA-256 validation; public package.json dependencies use registry-shaped identities; no registry provenance fabricated.',
        registryProvenanceClaimed: false,
        archiveFreezing: 'Candidate archives copied to isolated staging cache before extraction/install to eliminate TOCTOU races',
        installedFileVerification: 'Every candidate package verified post-install byte-for-byte against immutable archives'
      },
      installedInventory: aggregatedInstalledInventory,
      recipes: recipeResults,
      architectureQualification: archQualification,
      negativeControls
    };

    const {receiptPath, summaryPath} = writeReceipts(evidenceDir, receiptData);
    console.log(`[qualification-harness] Evidence written to:\n  - ${receiptPath}\n  - ${summaryPath}`);
    console.log(`[qualification-harness] Qualification VERDICT: ${verdict} (${status})`);

    return {
      status,
      verdict,
      fullQualificationClaimed,
      incompleteReasons,
      receiptPath,
      summaryPath,
      receiptData
    };
  } finally {
    if (!options.keepScratch) {
      rmSync(scratchDir, {recursive: true, force: true});
    }
  }
}

// ---------------------------------------------------------------------------
// CLI Execution
// ---------------------------------------------------------------------------

function printUsage() {
  console.log(`
Usage: node scripts/verify-release-archives.mjs --manifest <path> [options]

Immutable archive and runtime recipe verification for Composable Svelte.
Checker analysis is optional, discouraged, and never release authority; it runs only in explicit qualification mode.

Options:
  -m, --manifest <path>       Path to JSON manifest file (required)
  -e, --evidence-dir <dir>    Output directory for qualification receipts (default: from manifest or ./evidence)
  --mode <mode>               Verification mode: 'all' (default), 'preflight', 'recipes', 'qualification', 'negative-controls'
  --recipe <recipes>          Comma-separated list of recipes to run (default: all available)
  --svelte-checkpoint <ckpt>  Svelte compatibility pin checkpoint: 'newer' (default, 5.55.3) or 'minimum' (5.20.0 / code 5.30.0);
                              one checkpoint per run, so dual compatibility needs two receipts
  --skip-browser              Skip browser-based tests (useful when display/Chromium is unavailable; reports PARTIAL, exit 2)
  --keep-scratch              Retain temporary scratch directories for debugging
  -v, --verbose               Verbose logging
  -h, --help                  Print this usage guide

Manifest Schema:
{
  "$schema": "composable-svelte/release-archives-manifest/v1",
  "packages": [
    {
      "name": "@composable-svelte/core",
      "version": "0.13.0",
      "path": "/absolute/path/to/composable-svelte-core-0.13.0.tgz",
      "sha256": "64_lowercase_hex_chars",
      "integrity": "sha512-...",
      "fileCount": 1258,
      "status": "ready"
    }
  ],
  "checkerArchive": {
    "name": "@composable-svelte/architecture",
    "version": "0.13.0",
    "path": "/absolute/path/to/composable-svelte-architecture-0.13.0.tgz",
    "sha256": "64_lowercase_hex_chars"
  },
  "policy": {
    "path": "/absolute/path/to/policy.json",
    "sha256": "64_lowercase_hex_chars",
    "expectedCoreVersion": "0.13.0",
    "recordsRoot": "/absolute/path/to/records",
    "profile": "starter"
  },
  "sveltePins": {
    "starter": "5.57.0",
    "newerCompanions": "5.55.3",
    "minimumCode": "5.30.0",
    "minimumGeneral": "5.20.0"
  },
  "evidenceDir": "/absolute/path/to/evidence"
}
`);
}

function parseCliArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--manifest' || arg === '-m') {
      options.manifest = argv[++i];
    } else if (arg === '--evidence-dir' || arg === '-e') {
      options.evidenceDir = argv[++i];
    } else if (arg === '--mode') {
      options.mode = argv[++i];
    } else if (arg === '--recipe') {
      options.recipes = argv[++i];
    } else if (arg === '--svelte-checkpoint') {
      options.svelteCheckpoint = argv[++i];
    } else if (arg === '--skip-browser') {
      options.skipBrowser = true;
    } else if (arg === '--keep-scratch') {
      options.keepScratch = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

export async function main() {
  const argv = process.argv.slice(2);
  const options = parseCliArgs(argv);

  if (options.help) {
    printUsage();
    return;
  }

  if (!options.manifest) {
    printUsage();
    console.error('\nError: --manifest <path> is required\n');
    process.exitCode = 1;
    return;
  }

  const manifestPath = resolve(options.manifest);
  if (!existsSync(manifestPath)) {
    console.error(`\nError: Manifest file does not exist: ${manifestPath}\n`);
    process.exitCode = 1;
    return;
  }

  let rawManifest;
  try {
    rawManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    console.error(`\nError: Manifest is not valid JSON: ${err.message}\n`);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await runVerification(rawManifest, options);
    // Only a complete phase exits 0; a partial receipt must not read as success to CI.
    if (result.status !== 'PASSED') {
      process.exitCode = result.status === 'PARTIAL' ? 2 : 1;
    }
  } catch (err) {
    console.error(`\n[qualification-harness] FATAL ERROR: ${err.message}`);
    if (err.errors) {
      console.error('Validation errors:', JSON.stringify(err.errors, null, 2));
    }
    process.exitCode = 1;
  }
}

// Direct execution guard
function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  void main();
}
