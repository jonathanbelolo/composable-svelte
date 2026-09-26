/** Repo gate capabilities derive from files and public targets, never package names. */
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { kindOf, walkFiles } from './walk.js';

function strings(value: unknown): string[] {
 if (typeof value === 'string') return [value];
 if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
 return [];
}

export function packageCapabilities(directory: string) {
 const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
 const scan = walkFiles(directory, {skip: ['node_modules', 'dist', '.svelte-kit', '.git', 'worktrees', '__screenshots__'], keep: name => /\.(?:svelte|[cm]?[jt]s)$/.test(name)});
 const svelteFiles = scan.files.filter(path => path.endsWith('.svelte'));
 const testFiles = scan.files.filter(path => /\.(?:test|spec)\.[cm]?[jt]s$/.test(path));
 const publicTargets = strings([pkg.exports, pkg.main, pkg.module, pkg.types, pkg.typings, pkg.svelte]);
 const binTargets = strings(pkg.bin);
 const requiresDist = [...publicTargets, ...binTargets, ...(pkg.files ?? [])].some(path => /^(?:\.\/)?dist(?:\/|$)/.test(path));
 const sourceCli = binTargets.length > 0 && !requiresDist && publicTargets.length === 0;
 const problems = scan.unreadable.map(path => `unreadable source: ${relative(directory, path)}`);
 if (!requiresDist && !sourceCli) problems.push('package declares neither built output nor a source-only CLI');
 for (const target of binTargets) {
  const path = resolve(directory, target);
  const rel = relative(resolve(directory), path);
  if (rel.startsWith('..') || !/\.[cm]?js$/.test(target) || kindOf(path) !== 'file') {
   problems.push(`missing or unsupported executable target: ${target}`);
  } else if (!readFileSync(path, 'utf8').startsWith('#!/usr/bin/env node\n')) {
   problems.push(`Node executable lacks shebang: ${target}`);
  }
 }
 if (sourceCli) {
  if (!testFiles.length) problems.push('source CLI has no executable test files');
  const test = /^node\s+([^\s]+\.mjs)$/.exec(pkg.scripts?.test ?? '');
  if (!test || kindOf(join(directory, test[1]!)) !== 'file') problems.push('source CLI must declare an existing Node test runner');
  const typed = scan.files.filter(path => /\.[cm]?ts$/.test(path));
  if (typed.length) problems.push('source-only CLI contains TypeScript requiring an explicit compile/typecheck gate');
 }
 return {pkg, sourceFiles: scan.files, svelteFiles, testFiles, publicTargets, binTargets, requiresDist, sourceCli, problems};
}
