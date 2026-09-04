/**
 * Runs before every test file in both vitest configs (`setupFiles`).
 *
 * Installs the console guard: a test that produces `console.error` or
 * `console.warn` output it did not declare with `expectConsole` fails, with
 * the captured messages in the failure. Rationale and mechanism in
 * `./helpers/console.ts`.
 *
 * Hooks are imported from `vitest` rather than assumed global because the
 * browser config sets no `globals`. This file must not reference `document`:
 * the node config loads it too.
 *
 * Ordering: these hooks land on each file's root suite before the file's own
 * hooks are collected, and `afterEach` hooks run child-first, so the check
 * here runs after every `afterEach` the test file declares.
 */

import { afterEach, beforeEach } from 'vitest';
import { install, reset, restore, slot, violations } from './helpers/console.js';

beforeEach(() => {
	reset();
	install();
});

afterEach(() => {
	const problems = violations(slot);
	restore();
	reset();
	if (problems.length > 0) {
		throw new Error(
			'Unexpected console output. Declare it with expectConsole(level) from ' +
				"'tests/helpers/console.js' if it is the behaviour under test, or fix the cause.\n" +
				problems.join('\n')
		);
	}
});
