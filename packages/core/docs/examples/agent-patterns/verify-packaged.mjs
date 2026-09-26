// Repository maintainer check: build first, then exercise only packed public exports.
import { mkdtempSync, mkdirSync, cpSync, symlinkSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const example = dirname(fileURLToPath(import.meta.url));
const core = resolve(example, '../../..');
const work = mkdtempSync(join(tmpdir(), 'composable-agent-patterns-'));
const records = [];
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const log = `${records.length}-${command.replaceAll('/', '_')}.log`;
  writeFileSync(join(work, log), (result.stdout ?? '') + (result.stderr ?? ''));
  records.push({ command, args, cwd, status: result.status, log });
  writeFileSync(join(work, 'RESULT.json'), JSON.stringify({ work, records }, null, 2));
  if (result.status !== 0) throw new Error(`${command} failed: ${join(work, log)}\n${result.stderr ?? ''}`);
  return result.stdout;
}
console.log(`Evidence: ${work}`);
run('pnpm', ['build'], core);
const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--cache', join(work, 'npm-cache'), '--pack-destination', work], core));
const archive = join(work, packed[0].filename);
run('tar', ['-xzf', archive, '-C', work], work);
const consumer = join(work, 'consumer'); cpSync(example, consumer, { recursive: true, filter: path => !path.includes('/node_modules') && !path.includes('/dist') });
const nm = join(consumer, 'node_modules'); mkdirSync(nm);
// Reuse installed tooling; the tested core is the archive, never workspace source.
for (const name of readdirSync(join(core, 'node_modules'))) {
  if (name === '.bin' || name === '@composable-svelte') continue;
  symlinkSync(join(core, 'node_modules', name), join(nm, name));
}
mkdirSync(join(nm, '@composable-svelte')); symlinkSync(join(work, 'package'), join(nm, '@composable-svelte/core'));
symlinkSync(nm, join(work, 'package/node_modules'));
const bin = name => join(core, 'node_modules/.bin', name);
run(bin('svelte-check'), ['--tsconfig', 'tsconfig.json', '--fail-on-warnings'], consumer);
run(bin('vite'), ['build'], consumer);
run(bin('vitest'), ['run'], consumer);
run(bin('vite'), ['build', '--ssr', 'tests/ssr-entry.ts', '--outDir', 'ssr'], consumer);
run('node', ['tests/ssr.mjs'], consumer);
writeFileSync(join(work, 'RESULT.json'), JSON.stringify({ status: 'passed', archive, archiveSha256: createHash('sha256').update(readFileSync(archive)).digest('hex'), publicExportsOnly: true, dependencyMaterialization: 'existing installed tools/dependencies; exact packed core extracted', records }, null, 2));
console.log(`Passed: ${join(work, 'RESULT.json')}`);
