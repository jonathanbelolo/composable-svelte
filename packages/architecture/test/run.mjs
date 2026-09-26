import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(packageRoot, 'src');

function discover(directory) {
  const files = [];
  for (const entry of readdirSync(directory, {withFileTypes: true})) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...discover(path));
    else if (entry.isFile() && entry.name.endsWith('.test.mjs')) files.push(path);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

const tests = discover(sourceRoot);
const sentinel = join(sourceRoot, 'qualification.test.mjs');
if (!tests.includes(sentinel)) {
  process.stderr.write('Architecture test discovery refused: src/qualification.test.mjs is missing.\n');
  process.exitCode = 1;
} else {
  process.stderr.write(`Architecture test discovery: ${tests.length} files (sentinel ${relative(packageRoot, sentinel)}).\n`);
  const result = spawnSync(process.execPath, ['--test', ...tests], {
    cwd: packageRoot,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
