#!/usr/bin/env node
import {runCheck} from '../src/check.mjs';

const outcome = runCheck(process.argv.slice(2));
if (outcome.stdout) process.stdout.write(outcome.stdout);
process.stderr.write(`${outcome.stderr}\n`);
process.exitCode = outcome.exitCode;
