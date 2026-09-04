/**
 * A changelog has to be readable by something other than a person.
 *
 * `published-files.test.ts` already asserts that a changelog a package
 * *maintains* actually ships — "a changelog nobody receives is not a
 * changelog". It is deliberately narrow and says so: it never opens the file.
 *
 * So nothing read the contents, and it showed. A single change inserted a
 * second `## [Unreleased]` above the existing one in **three** packages by
 * anchoring on the first `## ` without checking, and that survived a full green
 * gate — 4,452 tests, 287 guards, `svelte-check` clean. Two headings mean two
 * answers to "what is unreleased", and whichever a release tool reads, the other
 * half is silently dropped.
 *
 * Three packages also had no changelog at all while shipping breaking changes,
 * which the narrow guard permits by construction: it only fires once the file
 * exists.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { listDirs } from './walk.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const packagesDir = join(repoRoot, 'packages');

/**
 * Headings that name a span rather than a release.
 *
 * Registered by hand, with the file they live in, so a *new* malformed heading
 * fails while these keep passing. Both are honest summaries of history written
 * before the changelog was kept properly — the alternative is inventing dates
 * for releases nobody recorded.
 */
const ROLLUPS: ReadonlyArray<{ pkg: string; heading: string; why: string }> = [
	{
		pkg: 'media',
		heading: '## [0.1.4] and earlier',
		why: 'one entry covering everything before the changelog was kept'
	},
	{
		pkg: 'core',
		heading: '## [0.5.0] – [0.5.2]',
		why: 'three patch releases with one shared note'
	},
	// These three had no changelog at all until it was written retroactively.
	// Inventing dates for releases nobody recorded would be worse than saying so.
	{ pkg: 'charts', heading: '## [0.1.1] and earlier', why: 'predates the changelog' },
	{ pkg: 'graphics', heading: '## [0.1.0] and earlier', why: 'predates the changelog' },
	{ pkg: 'maps', heading: '## [0.1.1] and earlier', why: 'predates the changelog' }
];

const DATED = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/;
const UNRELEASED = '## [Unreleased]';

interface Pkg {
	name: string;
	version: string;
	changelog: string | null;
}

function packages(): Pkg[] {
	return listDirs(packagesDir)
		.filter((name) => existsSync(join(packagesDir, name, 'package.json')))
		.map((name) => {
			const manifest = JSON.parse(
				readFileSync(join(packagesDir, name, 'package.json'), 'utf8')
			) as { version: string; private?: boolean };
			const path = join(packagesDir, name, 'CHANGELOG.md');
			return {
				name,
				version: manifest.version,
				changelog: existsSync(path) ? readFileSync(path, 'utf8') : null
			};
		});
}

/**
 * The `### ` headings under each `## ` section, keyed by that section.
 *
 * This guard was written because two `## [Unreleased]` headings mean two
 * answers to "what is unreleased". It then let the identical defect through one
 * level down: five appends to one release section produced three `### Added`
 * and three `### Fixed` under a single `[Unreleased]`, so a reader met the same
 * heading three times and a tool reading "what was added" found three disjoint
 * lists. Same failure, same file, missed because the check stopped at `##`.
 */
export function duplicateSubsections(text: string): string[] {
	const found: string[] = [];
	let section: string | null = null;
	const seen = new Map<string, Set<string>>();

	for (const line of text.split('\n')) {
		if (line.startsWith('## ')) {
			section = line;
			seen.set(section, new Set());
		} else if (line.startsWith('### ') && section !== null) {
			const within = seen.get(section)!;
			if (within.has(line)) found.push(`${section} :: ${line}`);
			else within.add(line);
		}
	}

	return found;
}

/** Every `## ` heading, in file order. */
function headings(text: string): string[] {
	return text.split('\n').filter((line) => line.startsWith('## '));
}

/**
 * The malformed headings in one changelog.
 *
 * Exported so the positive control drives the real matcher rather than a
 * paraphrase of it — the failure `front-door` records, where four of five
 * denials matched nothing and a green result proved only that the check ran.
 */
export function malformed(pkg: string, text: string): string[] {
	const registered = new Set(ROLLUPS.filter((r) => r.pkg === pkg).map((r) => r.heading));

	return headings(text).filter(
		(heading) => heading !== UNRELEASED && !DATED.test(heading) && !registered.has(heading)
	);
}

/** The newest released version a changelog names, or `null` if it names none. */
export function newestRelease(text: string): string | null {
	for (const heading of headings(text)) {
		const match = DATED.exec(heading);
		if (match) return match[1] ?? null;
	}
	return null;
}

describe('every published package keeps a changelog', () => {
	/** Only the arms below the first need a file to read. */
	const withChangelog = packages().filter((p) => p.changelog !== null);

	it('has one', () => {
		const missing = packages()
			.filter((p) => p.changelog === null)
			.map((p) => p.name);

		expect(
			missing,
			'these ship to npm with no changelog at all. `published-files.test.ts` ' +
				'permits that by construction — it only fires once the file exists'
		).toEqual([]);
	});

	it.each(withChangelog)(
		'$name says exactly once what is unreleased',
		({ name, changelog }) => {
			const count = headings(changelog!).filter((h) => h === UNRELEASED).length;

			expect(
				count,
				`${name} has ${count} \`${UNRELEASED}\` headings. Two mean two answers to ` +
					'"what is unreleased", and a release tool reads one of them'
			).toBeLessThanOrEqual(1);
		}
	);

	it.each(withChangelog)(
		'$name dates every release it names',
		({ name, changelog }) => {
			expect(
				malformed(name, changelog!),
				`${name} has headings that are neither \`${UNRELEASED}\` nor ` +
					'`## [x.y.z] - YYYY-MM-DD`. A heading that names a span rather than a ' +
					'release goes in ROLLUPS with its reason'
			).toEqual([]);
		}
	);

	it.each(withChangelog)(
		'$name names each kind of change once per release',
		({ name, changelog }) => {
			expect(
				duplicateSubsections(changelog!),
				`${name} repeats a \`###\` heading inside one release section. Merge them: ` +
					'three `### Added` under one version is three answers to "what was added"'
			).toEqual([]);
		}
	);

	it.each(withChangelog)(
		'$name has an entry for the version it declares',
		({ name, version, changelog }) => {
			// A manifest ahead of its changelog means a version was bumped and never
			// written up — which is the state a reader discovers only by finding
			// nothing about the version they installed.
			expect(
				newestRelease(changelog!),
				`${name}/package.json says ${version}, and its changelog's newest dated ` +
					'entry does not match. Either the release was never written up, or the ' +
					'bump has not happened yet'
			).toBe(version);
		}
	);
});

describe('the check itself', () => {
	it('sees a second Unreleased', () => {
		const two = `# Changelog\n\n## [Unreleased]\n\n### Added\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n`;
		expect(headings(two).filter((h) => h === UNRELEASED)).toHaveLength(2);
	});

	it('sees an undated release, and tolerates a registered rollup', () => {
		expect(malformed('core', '## [1.2.3]\n')).toEqual(['## [1.2.3]']);
		expect(malformed('core', '## [1.2.3] - 2026-01-01\n')).toEqual([]);

		// Registered against `core`, so it passes there and fails anywhere else —
		// a rollup is a fact about one file's history, not a blanket exemption.
		expect(malformed('core', '## [0.5.0] – [0.5.2]\n')).toEqual([]);
		expect(malformed('auth', '## [0.5.0] – [0.5.2]\n')).toEqual(['## [0.5.0] – [0.5.2]']);
	});

	it('sees a repeated subsection, and tolerates the same one across releases', () => {
		const repeated = '## [Unreleased]\n### Added\n- a\n### Fixed\n- b\n### Added\n- c\n';
		expect(duplicateSubsections(repeated)).toEqual(['## [Unreleased] :: ### Added']);

		// The same heading under *different* releases is correct, not a duplicate.
		const across = '## [Unreleased]\n### Added\n- a\n\n## [1.0.0] - 2026-01-01\n### Added\n- b\n';
		expect(duplicateSubsections(across)).toEqual([]);
	});

	it('reads the newest release past an Unreleased section', () => {
		const text = `## [Unreleased]\n\n### Fixed\n\n## [2.1.0] - 2026-02-02\n\n## [2.0.0] - 2026-01-01\n`;
		expect(newestRelease(text)).toBe('2.1.0');
		expect(newestRelease('## [Unreleased]\n')).toBeNull();
	});
});

describe('the rollup register is current', () => {
	// Every other register in this directory has a staleness arm; this one did
	// not. A rollup heading that no changelog carries any more is a permanent,
	// invisible licence for an undated release under that exact text.
	it.each(ROLLUPS)('$pkg still carries "$heading"', ({ pkg, heading }) => {
		const changelog = packages().find((p) => p.name === pkg)?.changelog ?? '';
		expect(changelog.includes(heading), `${pkg}/CHANGELOG.md no longer has this heading — drop it from ROLLUPS`).toBe(true);
	});
});
