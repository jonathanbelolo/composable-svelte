import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, readdirSync, realpathSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {BUNDLED_POLICY_REGISTRY, isPolicyPathContained} from '../src/bundled-policy.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function sourceFiles(directory, root) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const path = join(directory, entry.name);
    assert.ok(!entry.isSymbolicLink(), `Unexpected source symlink: ${path}`);
    return entry.isDirectory() ? sourceFiles(path, root)
      : entry.name.endsWith('.mjs') && !entry.name.endsWith('.test.mjs') ? [relative(root, path)] : [];
  });
}

export function inspectArchive(archivePath, {root = defaultRoot, registry = BUNDLED_POLICY_REGISTRY} = {}) {
  const archive = resolve(archivePath);
  assert.ok(existsSync(archive), `Archive not found: ${archive}`);

  const policiesDir = resolve(root, 'policies');
  const registeredPolicyPaths = [];

  for (const [name, entry] of Object.entries(registry)) {
    assert.ok(entry && typeof entry === 'object', `Invalid registry entry for ${name}`);
    const entryPath = resolve(entry.path);
    // Containment: every production registered policy must resolve strictly within shipped policies directory
    assert.ok(
      isPolicyPathContained(entryPath, policiesDir),
      `Production registered policy must resolve within shipped policies directory: ${name} (${entry.path})`
    );
    assert.ok(existsSync(entryPath), `Registered policy file does not exist on disk: ${entryPath}`);
    const relToRoot = relative(root, entryPath);
    registeredPolicyPaths.push(relToRoot);
  }

  const shippedPolicies = readdirSync(policiesDir)
    .filter(name => name.endsWith('.json'))
    .map(name => `policies/${name}`);
  assert.deepEqual(
    [...registeredPolicyPaths].sort(),
    [...shippedPolicies].sort(),
    'Shipped policies directory must match production registered policies exactly'
  );

  const expected = new Set([
    'package.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'bin/composable-svelte-architecture.mjs',
    ...registeredPolicyPaths, ...sourceFiles(join(root, 'src'), root)
  ]);

  const entries = execFileSync('tar', ['-tzf', archive], {encoding: 'utf8'})
    .trim().split('\n').filter(Boolean);
  assert.equal(new Set(entries).size, entries.length, 'Duplicate archive entries');
  assert.deepEqual([...entries].sort(), [...expected].map(path => `package/${path}`).sort());

  const files = [];
  for (const path of expected) {
    const bytes = execFileSync('tar', ['-xOf', archive, `package/${path}`]);
    assert.deepEqual(bytes, readFileSync(join(root, path)), `Archive differs from reviewed file: ${path}`);
    files.push({path, sha256: hash(bytes), bytes: bytes.length});
  }

  // Directly hash every archived registered policy against its embedded pin, in addition to source byte equality.
  for (const [name, entry] of Object.entries(registry)) {
    const relPath = relative(root, resolve(entry.path));
    const archivePathInTar = `package/${relPath}`;
    const archivedBytes = execFileSync('tar', ['-xOf', archive, archivePathInTar]);
    const actualHash = hash(archivedBytes);
    assert.equal(
      actualHash,
      entry.sha256,
      `Archived registered policy ${name} hash mismatch with embedded pin: expected ${entry.sha256}, got ${actualHash}`
    );
  }

  const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.deepEqual(metadata.dependencies, {typescript: '5.9.3', svelte: '5.57.0'});
  assert.deepEqual(metadata.exports, {});
  assert.equal(metadata.bin['composable-svelte-architecture'], 'bin/composable-svelte-architecture.mjs');

  return {archive, sha256: hash(readFileSync(archive)), files, status: 'archive-matches-source'};
}

function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  assert.ok(process.argv[2], 'Provide the npm-generated architecture archive path.');
  const outcome = inspectArchive(process.argv[2]);
  console.log(JSON.stringify(outcome, null, 2));
}
