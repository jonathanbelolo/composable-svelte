import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const fixture = dirname(fileURLToPath(import.meta.url));
const root = join(fixture, '../../../..');
const workspace = mkdtempSync(join(tmpdir(), 'charts-installed-consumer-'));
const run = (command, args, cwd = root) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
};
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
cpSync(join(fixture, 'src'), join(workspace, 'src'), { recursive: true });
for (const file of ['tsconfig.json', 'tsconfig.nodenext.json', 'index.html', 'vite.config.mjs', 'ssr.mjs', 'browser.config.mjs']) {
  cpSync(join(fixture, file), join(workspace, file));
}
writeFileSync(join(workspace, 'package.json'), JSON.stringify({ private: true, type: 'module' }, null, 2));
let coreTarball = process.env.CHARTS_CORE_TARBALL;
if (!coreTarball) {
  run('pnpm', ['--dir', 'packages/core', 'pack', '--pack-destination', workspace]);
  const core = JSON.parse(readFileSync(join(root, 'packages/core/package.json'), 'utf8'));
  coreTarball = join(workspace, `${core.name.replace(/^@/, '').replace('/', '-')}-${core.version}.tgz`);
}
run('pnpm', ['--dir', 'packages/charts', 'pack', '--pack-destination', workspace]);
const charts = JSON.parse(readFileSync(join(root, 'packages/charts/package.json'), 'utf8'));
const chartsTarball = join(workspace, `${charts.name.replace(/^@/, '').replace('/', '-')}-${charts.version}.tgz`);
if (!existsSync(coreTarball) || !existsSync(chartsTarball)) throw new Error('Package tarball missing');
const npmArgs = ['install', '--ignore-scripts'];
if (process.env.CHARTS_INSTALL_OFFLINE === '1') npmArgs.push('--offline');
npmArgs.push(coreTarball, chartsTarball,
  process.env.CHARTS_SVELTE_TARBALL ?? `svelte@${process.env.CHARTS_SVELTE_VERSION ?? '5.55.3'}`,
  'typescript@5.9.3', 'svelte-check@4.3.3', 'vite@6.4.1',
  '@sveltejs/vite-plugin-svelte@6.2.1', 'vitest@4.0.7',
  '@vitest/browser@4.0.7', '@vitest/browser-playwright@4.0.7', 'playwright@1.56.1');
run('npm', npmArgs, workspace);
run(join(workspace, 'node_modules/.bin/svelte-check'), ['--tsconfig', 'tsconfig.json', '--fail-on-warnings'], workspace);
run(join(workspace, 'node_modules/.bin/tsc'), ['--project', 'tsconfig.nodenext.json'], workspace);
run(join(workspace, 'node_modules/.bin/vite'), ['build'], workspace);
run('node', ['ssr.mjs'], workspace);
if (process.env.CHARTS_INSTALL_BROWSER === '1') {
  run(join(workspace, 'node_modules/.bin/vitest'), ['run', '--config', 'browser.config.mjs'], workspace);
}
for (const path of [coreTarball, chartsTarball, join(workspace, 'package-lock.json')]) {
  console.log(`${hash(path)}  ${basename(path)}`);
}
console.log(`Installed consumer: ${workspace}`);
