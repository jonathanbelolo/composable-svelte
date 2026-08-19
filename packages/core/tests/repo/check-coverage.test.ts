/**
 * Every workspace must be covered by the `svelte-check` gate.
 *
 * `pnpm -r check` runs the script wherever it is defined and **skips every
 * workspace that lacks it, silently and with exit 0**. That is not a
 * hypothetical: CI ran `pnpm -r check` for months while only `core` and
 * `graphics` declared the script, so fifteen workspaces — including six
 * packages that had never had svelte-check run on them at all — were never
 * measured. The step was green and meant almost nothing.
 *
 * Adding the missing scripts fixes that today. It does not stop the twentieth
 * workspace from being added ungated tomorrow, or a script from being quietly
 * deleted the first time it turns red. This test is the part that holds.
 *
 * `tsc` cannot substitute for any of it: it never reads `.svelte`, and every
 * workspace here ships `.svelte` files.
 *
 * Modelled on `tests/ssr/entry-graph.test.ts` — same shape, same reason for
 * living in `core` (it is a repo-level invariant that needs a home, and `core`
 * is the only workspace with a node-environment suite). `files: ["dist"]` keeps
 * it out of the published tarball.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * The one true script. Byte-identical everywhere, so that a local `pnpm check`
 * and CI cannot disagree.
 *
 * `--fail-on-warnings` is the flag that gates. `--threshold error` does not —
 * it only filters which diagnostics are printed, which is why a `<button>`
 * nested in a `<button>` was reported for months while the step stayed green.
 */
const CHECK_SCRIPT = 'svelte-check --tsconfig ./tsconfig.json --fail-on-warnings';

/**
 * Workspaces not yet enrolled, with the error/warning counts measured when they
 * were added here. Every entry is a debt, not a dispensation: it exists so the
 * gap is visible in a test that fails when forgotten, rather than in a document
 * that does not.
 *
 * Shrink this map. When it is empty, delete it and the branch that reads it.
 */
const NOT_YET_GATED: Record<string, { errors: number; warnings: number }> = {
	'packages/charts': { errors: 5, warnings: 1 },
	'packages/chat': { errors: 15, warnings: 13 },
	'packages/maps': { errors: 3, warnings: 0 },
	'packages/media': { errors: 14, warnings: 5 },
	'examples/contact-form': { errors: 2, warnings: 0 },
	'examples/file-browser': { errors: 5, warnings: 0 },
	'examples/multi-step-form': { errors: 4, warnings: 0 },
	'examples/product-gallery': { errors: 11, warnings: 6 },
	'examples/registration-form': { errors: 1, warnings: 1 },
	'examples/shader-gallery': { errors: 2, warnings: 0 },
	'examples/ssr-server': { errors: 5, warnings: 0 },
	'examples/url-routing': { errors: 2, warnings: 4 }
};

interface Workspace {
	dir: string;
	pkg: {
		name?: string;
		private?: boolean;
		scripts?: Record<string, string>;
		devDependencies?: Record<string, string>;
	};
}

/**
 * Resolve `pnpm-workspace.yaml`'s globs rather than hardcoding the directory
 * list, so a workspace added under a new glob is picked up here too.
 *
 * The globs in this repo are all of the form `dir/*`; anything more exotic
 * should fail loudly rather than be silently skipped.
 */
function workspaceDirs(): string[] {
	const yaml = readFileSync(join(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
	const globs = [...yaml.matchAll(/^\s*-\s*'([^']+)'/gm)].map((m) => m[1]!);
	expect(globs.length, 'pnpm-workspace.yaml declares no package globs').toBeGreaterThan(0);

	return globs.flatMap((glob) => {
		const [parent, star] = glob.split('/');
		expect(star, `unsupported workspace glob: ${glob}`).toBe('*');
		const parentDir = join(repoRoot, parent!);
		return readdirSync(parentDir, { withFileTypes: true })
			.filter((e) => e.isDirectory() && existsSync(join(parentDir, e.name, 'package.json')))
			.map((e) => `${parent}/${e.name}`);
	});
}

const workspaces: Workspace[] = workspaceDirs().map((dir) => ({
	dir,
	pkg: JSON.parse(readFileSync(join(repoRoot, dir, 'package.json'), 'utf8'))
}));

const isGated = (w: Workspace) => w.pkg.scripts?.check !== undefined;

describe('svelte-check gate coverage', () => {
	it('found every workspace', () => {
		expect(workspaces.length).toBeGreaterThanOrEqual(19);
	});

	it.each(workspaces.map((w) => [w.dir, w] as const))(
		'%s is either gated or explicitly listed as not yet gated',
		(dir, w) => {
			const gated = isGated(w);
			const allowlisted = dir in NOT_YET_GATED;

			expect(
				gated || allowlisted,
				`${dir} has no \`check\` script and is not in NOT_YET_GATED. ` +
					`Add the script, or add an entry with its measured counts.`
			).toBe(true);

			expect(
				gated && allowlisted,
				`${dir} is gated but still listed in NOT_YET_GATED — remove the entry.`
			).toBe(false);
		}
	);

	const gatedWorkspaces = workspaces.filter(isGated);

	it.each(gatedWorkspaces.map((w) => [w.dir, w] as const))(
		'%s runs the canonical check script and declares svelte-check',
		(dir, w) => {
			// Byte-identical, so `pnpm check` locally is the same command CI runs.
			expect(w.pkg.scripts!.check, `${dir}'s check script has drifted`).toBe(CHECK_SCRIPT);

			// pnpm puts the workspace-root `.bin` on PATH, so an undeclared
			// svelte-check would still resolve — by accident. Declaring it is the
			// same correction `bbab5ca` made for vitest.
			expect(
				w.pkg.devDependencies?.['svelte-check'],
				`${dir} runs svelte-check without declaring it`
			).toBeDefined();
		}
	);

	it.each(gatedWorkspaces.filter((w) => !w.pkg.private).map((w) => [w.dir, w] as const))(
		'%s checks before it publishes',
		(dir, w) => {
			// `tsc --noEmit` cannot see `.svelte`, and components are the product.
			// Every packaging defect in the hardening register shipped through a
			// green prepublishOnly.
			//
			// Match the whole step, not the substring `check` — `typecheck`
			// contains it, so a substring assertion here passes on every package
			// that runs typecheck and can never fail. It is a guard that cannot
			// fail, which is not a guard.
			const steps = (w.pkg.scripts?.prepublishOnly ?? '').split('&&').map((s) => s.trim());
			expect(steps, `${dir} publishes without running its own check script`).toContain(
				'pnpm run check'
			);
		}
	);

	it('the allowlist has no stale entries', () => {
		// A stale entry is dead permission — it would let a workspace silently
		// leave the gate again. Same failure `b148426` removed from the SSR
		// entry allowlist.
		const known = new Set(workspaces.map((w) => w.dir));
		for (const dir of Object.keys(NOT_YET_GATED)) {
			expect(known.has(dir), `NOT_YET_GATED lists ${dir}, which is not a workspace`).toBe(true);
		}
	});
});
