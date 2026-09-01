/**
 * The documents a newcomer reads first must know what this repository contains.
 *
 * `@composable-svelte/auth` prompted this. It shipped eleven flow directories
 * and sixteen components, became the second-largest test surface after `core`,
 * and took a feature in each of five consecutive sessions — while appearing
 * **once** in the root `README.md` (a table row) and **zero times** in
 * `guides/README.md`, whose `## Packages` section documents the other seven
 * under a sentence beginning "All packages follow…". Not one doc-side commit
 * landed alongside any of those seven flows.
 *
 * Four arms, cheapest and least brittle first.
 *
 * **Arm 4 is the one that needs justifying**, because a denial regex narrow
 * enough to avoid false positives is usually narrow enough to match nothing —
 * at which point the guard passes because it is inert, not because the
 * documents are right. Both risks were measured on the day this landed, not
 * assumed:
 *
 *   - The false positive is real. A naive `/no MFA/i` matches the root README's
 *     "no MFA **management**", which is *true*: MFA ships, managing it does
 *     not. So every entry carries the qualifiers that make a denial legitimate.
 *   - The inertness is real. Four of the five registered denials matched
 *     nothing in the live documents at that moment, because the same session
 *     had just corrected them all. A green run therefore proves nothing on its
 *     own — an emptied register and a clean tree are indistinguishable, which
 *     is precisely the failure `guides/VERIFICATION-PROTOCOL.md` rule 1 names.
 *
 * So arm 4 ships with a positive control: a deliberately-wrong document run
 * through the same matcher, asserting it still fires *and* still tolerates a
 * qualified denial. Without that this arm would be decoration.
 *
 * `plans/**` and every `CHANGELOG.md` are out of scope, reusing
 * `doc-typecheck.ts`'s `documents()` and the concept it names there: a record
 * of the past is not an instruction. A changelog entry saying OAuth does not
 * exist yet is correct history, and `plans/` records designs that were
 * considered and often not built.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';

import { listDirs } from './walk.js';
import { documents } from './doc-typecheck.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * Packages allowed to be absent from the front door. Empty, and meant to stay
 * that way — all eight are published today. A private or experimental package
 * would go here with the reason, and the staleness arm below deletes an entry
 * once its package is documented after all.
 */
const UNDOCUMENTED: string[] = [];

/**
 * Links that were already dead when this guard landed.
 *
 * Measured, and meant to come down — the same treatment `optional-props` gives
 * its bare-optional count. They were not swept in the change that added this
 * guard because they are spread across `packages/core/docs/`, which is a
 * documentation tree of its own and a separate piece of work; sweeping it here
 * would have buried a findability fix inside an unrelated 19-file edit.
 * Most point at files that were never written — there is no root `LICENSE` or
 * `CONTRIBUTING.md`, and no `docs/testing/unit-testing.md`.
 *
 * The two that *were* fixed are absent from this list on purpose: they sat in
 * the root README's own further-reading section, which is exactly the surface
 * this guard exists to protect.
 *
 * The arm below deletes an entry the moment its link resolves again, so this
 * cannot quietly become a list of links that are fine.
 */
const DEAD_LINKS: string[] = [
	'examples/file-browser/README.md -> ../../packages/core/src/components/ui/tree-view/README.md',
	'examples/multi-step-form/README.md -> ../../docs/forms-guide.md',
	'examples/ssr-server/README.md -> ../../packages/core/src/lib/ssr/README.md',
	'packages/code/src/lib/node-canvas/README.md -> ./EXAMPLE.md',
	'packages/core/docs/README.md -> ../../../CONTRIBUTING.md',
	'packages/core/docs/README.md -> ../../../LICENSE',
	'packages/core/docs/backend/api-client.md -> ../testing/unit-testing.md',
	'packages/core/docs/backend/dependencies.md -> ../testing/unit-testing.md',
	'packages/core/docs/backend/websocket.md -> ../testing/unit-testing.md',
	'packages/core/docs/i18n/internationalization.md -> ../../../examples/ssr-server/',
	'packages/core/docs/migration.md -> /packages/core/examples',
	'packages/core/docs/navigation/components.md -> ./animation.md',
	'packages/core/docs/navigation/tree-based.md -> ../api/navigation.md',
	'packages/core/docs/navigation/tree-based.md -> ./animation.md',
	'packages/core/docs/routing/url-sync.md -> /packages/core/docs/backend/testing.md',
	'packages/core/docs/ssr/server-rendering.md -> ../../../examples/ssr-server/',
	'packages/core/docs/ssr/server-rendering.md -> ../../../examples/ssr-server/src/build/ssg.ts',
	'packages/core/docs/troubleshooting.md -> /packages/core/examples',
	'packages/core/src/lib/dependencies/README.md -> ../../../examples',
];

/**
 * A capability, the directory that proves it ships, and the phrasing that would
 * deny it.
 *
 * `qualifiers` are the words that make a denial legitimate. "No MFA" is false;
 * "no MFA management" is true, and both begin identically.
 */
interface Capability {
	name: string;
	/**
	 * The flow directories that make this true.
	 *
	 * A list rather than one path, because the register is checked in **both**
	 * directions. Register-to-disk alone would let flow twelve ship, go
	 * unregistered, and leave the guard green — which is the direction the rot
	 * actually travels, and the same shape `flat-barrel` exists to catch.
	 */
	dirs: string[];
	denials: RegExp[];
	qualifiers: string[];
}

const CAPABILITIES: Capability[] = [
	{
		name: 'password login',
		dirs: ['login'],
		denials: [/\bno password (login|sign-?in)\b/gi],
		qualifiers: []
	},
	{
		name: 'signup',
		dirs: ['signup'],
		denials: [/\bno signup\b/gi],
		qualifiers: []
	},
	{
		name: 'MFA',
		dirs: ['mfa-challenge', 'mfa-enrolment'],
		denials: [/\bno MFA\b/gi],
		// MFA ships; disabling it and regenerating recovery codes do not.
		qualifiers: ['management', 'enrolment management']
	},
	{
		name: 'OAuth',
		dirs: ['oauth-start', 'oauth-callback'],
		denials: [/\bno OAuth\b/gi],
		// The provider flow ships; linking an identity to an existing account
		// does not.
		qualifiers: ['account linking', 'linking', 'unlinking']
	},
	{
		name: 'email verification',
		dirs: ['email-verification'],
		denials: [/\bno email verification\b/gi],
		qualifiers: []
	},
	{
		name: 'password recovery',
		dirs: ['forgot-password', 'reset-password'],
		denials: [/\bno password recovery\b/gi],
		qualifiers: []
	},
	{
		name: 'magic links',
		dirs: ['magic-link-request', 'magic-link-signin'],
		denials: [/\bno magic links?\b/gi],
		qualifiers: []
	}
];

/**
 * The capabilities a piece of prose denies without a qualifier that would make
 * the denial true.
 *
 * Exported so the positive control can drive the real matcher rather than a
 * paraphrase of it.
 */
export function deniedCapabilities(text: string, capabilities = CAPABILITIES): string[] {
	const denied: string[] = [];

	for (const capability of capabilities) {
		for (const pattern of capability.denials) {
			for (const match of text.matchAll(pattern)) {
				// The words immediately after the denial decide whether it is a
				// claim about the whole capability or about a part of it.
				const tail = text.slice(match.index + match[0].length, match.index + match[0].length + 40);
				const qualified = capability.qualifiers.some((q) =>
					new RegExp(`^\\s+${q}\\b`, 'i').test(tail)
				);
				if (!qualified && !denied.includes(capability.name)) denied.push(capability.name);
			}
		}
	}

	return denied;
}

/** Relative link targets in a markdown document, minus URLs and bare anchors. */
export function relativeLinks(source: string): string[] {
	return [...source.matchAll(/\]\(([^)\s]+)\)/g)]
		.map((match) => match[1]!)
		.filter((target) => !/^(https?|mailto|tel):/i.test(target))
		.map((target) => target.split('#')[0]!)
		.filter((target) => target.length > 0);
}

const packages = listDirs(join(repoRoot, 'packages')).filter((name) =>
	existsSync(join(repoRoot, 'packages', name, 'package.json'))
);

const flowsDir = join(repoRoot, 'packages/auth/src/lib/flows');

const rootReadme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
const guidesReadme = readFileSync(join(repoRoot, 'guides/README.md'), 'utf8');

describe('the front door', () => {
	it('ran against a repository with packages in it', () => {
		// Without this, a resolution failure and a clean tree look the same for
		// every arm below.
		expect(packages.length).toBeGreaterThan(1);
	});

	it('has no dead relative links', () => {
		const dead = documents()
			.flatMap((file) =>
				relativeLinks(readFileSync(file, 'utf8'))
					// A leading slash means repository-root-relative, not
					// filesystem-absolute. Resolving those against the file's own
					// directory reported them as links to `/packages/...` on the
					// machine that ran the test.
					.filter(
						(target) =>
							!existsSync(
								target.startsWith('/')
									? join(repoRoot, target)
									: resolve(dirname(file), target)
							)
					)
					.map((target) => `${file.slice(repoRoot.length)} -> ${target}`)
			)
			.filter((entry) => !DEAD_LINKS.includes(entry));

		expect(
			dead.sort(),
			'these links resolve to nothing. The two this guard was written with both ' +
				"pointed at packages/core/src/dependencies/, which has lived under src/lib/ " +
				'for a long time — in the one section of the root README that lists further reading'
		).toEqual([]);
	});

	it('names every package in the root README', () => {
		const missing = packages
			.filter((name) => !UNDOCUMENTED.includes(name))
			.filter((name) => !new RegExp(`^\\|\\s*\\*\\*${name}\\*\\*\\s*\\|`, 'm').test(rootReadme));

		expect(
			missing,
			'the root README table is the only inventory of what this repository ships. ' +
				'A package missing from it is a package nobody installs'
		).toEqual([]);
	});

	it('gives every package a section in the architecture guide', () => {
		const missing = packages
			.filter((name) => !UNDOCUMENTED.includes(name))
			.filter((name) => !guidesReadme.includes(`### \`@composable-svelte/${name}\``));

		expect(
			missing,
			"guides/README.md's Packages section opens with \"All packages follow the " +
				'Composable Architecture pattern". A package with no section there makes ' +
				'that sentence false, which is how `auth` went undocumented through seven flows'
		).toEqual([]);
	});

	it('registers no link that resolves after all', () => {
		const revived = DEAD_LINKS.filter((entry) => {
			const [relative, target] = entry.split(' -> ');
			const file = join(repoRoot, relative!);
			return existsSync(
				target!.startsWith('/') ? join(repoRoot, target!) : resolve(dirname(file), target!)
			);
		});

		expect(revived, 'these links work now — drop them from DEAD_LINKS').toEqual([]);
	});

	it('registers no package that is documented after all', () => {
		const stale = UNDOCUMENTED.filter(
			(name) =>
				guidesReadme.includes(`### \`@composable-svelte/${name}\``) &&
				new RegExp(`^\\|\\s*\\*\\*${name}\\*\\*\\s*\\|`, 'm').test(rootReadme)
		);

		expect(stale, 'these are documented now — drop them from UNDOCUMENTED').toEqual([]);
	});

	it('denies no capability that ships', () => {
		const denials = documents().flatMap((file) => {
				const shipped = CAPABILITIES.filter((c) =>
				c.dirs.some((dir) => existsSync(join(flowsDir, dir)))
			);
			return deniedCapabilities(readFileSync(file, 'utf8'), shipped).map(
				(name) => `${file.slice(repoRoot.length)}: says this repository has no ${name}`
			);
		});

		expect(
			denials.sort(),
			'a live document denies something that exists. Either the capability was ' +
				'removed — in which case delete its CAPABILITIES entry — or the document ' +
				'is stale. This is the failure COMPLETENESS-AUDIT G5 shipped twice'
		).toEqual([]);
	});

	it('still detects a denial, and still tolerates a qualified one', () => {
		// The positive control, and the reason the arm above is a guard rather
		// than decoration. Four of five denials matched nothing on the day this
		// landed, so a green result there proves only that the matcher ran.
		expect(deniedCapabilities('the package has no OAuth and no signup')).toEqual([
			'signup',
			'OAuth'
		]);
		expect(
			deniedCapabilities('no MFA management, and no OAuth account linking'),
			'a qualified denial was reported as a false claim'
		).toEqual([]);
		expect(deniedCapabilities('no MFA at all'), 'an unqualified denial slipped through').toEqual([
			'MFA'
		]);
	});

	it('proves every registered capability still ships', () => {
		const vanished = CAPABILITIES.flatMap((c) =>
			c.dirs.filter((dir) => !existsSync(join(flowsDir, dir))).map((dir) => `${c.name}: ${dir}`)
		);

		expect(
			vanished,
			'these flow directories are gone, so the entries above guard nothing. Either ' +
				'the flow moved — update the path — or it was removed, and the denial is now true'
		).toEqual([]);
	});

	it('registers every flow that ships', () => {
		// Disk to register, the direction the rot travels. Without this, flow
		// twelve ships, nobody adds an entry, and the arm above keeps passing
		// because it only ever asks whether the *registered* flows still exist.
		const registered = new Set(CAPABILITIES.flatMap((c) => c.dirs));
		const unregistered = listDirs(flowsDir).filter((dir) => !registered.has(dir));

		expect(
			unregistered,
			'these flow directories are in no CAPABILITIES entry, so no document is ' +
				'checked for denying them. Add them to a capability'
		).toEqual([]);
	});

	it('reads the first table cell, not the whole row', () => {
		// A positive control for the package arms, pinning the hazard a
		// "simplification" would reintroduce: "regenerating recovery codes" sits
		// inside the auth row, so a substring test over the row would report the
		// `code` package as documented with its row deleted.
		const authRow = '| **auth** | usable | ... regenerating recovery codes ... |';
		const rowFor = (name: string) => new RegExp(`^\\|\\s*\\*\\*${name}\\*\\*\\s*\\|`, 'm');
		expect(rowFor('code').test(authRow), 'a row-wide match would pass here').toBe(false);
		expect(rowFor('auth').test(authRow)).toBe(true);
	});
});
