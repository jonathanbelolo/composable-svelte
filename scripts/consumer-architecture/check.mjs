#!/usr/bin/env node
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {runCheck} from '../../packages/architecture/src/check.mjs';
export * from '../../packages/architecture/src/check.mjs';
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const outcome = runCheck(process.argv.slice(2));
  if (outcome.stdout) process.stdout.write(outcome.stdout);
  process.stderr.write(`${outcome.stderr}\n`);
  process.exitCode = outcome.exitCode;
}
