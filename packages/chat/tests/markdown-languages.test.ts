/**
 * Every alias must name a language that can actually be loaded.
 *
 * `LANGUAGE_MAP` maps a fence's alias to a Prism language name, and the preload
 * list decides which Prism languages exist. The two were maintained separately,
 * so `rb → ruby` and `yml → yaml` both pointed at languages nothing loaded and
 * rendered as plain text — indistinguishable from having no entry at all.
 *
 * `ruby` is not even in `@composable-svelte/code`'s `SupportedLanguage` union,
 * so adding it to the preload list only produced a console warning. That is what
 * this pins: not "the map has entries", but "every entry can work".
 */

import { describe, it, expect } from 'vitest';
import { LANGUAGE_MAP, PRELOADED_LANGUAGES } from '../src/lib/streaming-chat/markdown.js';

/**
 * `@composable-svelte/code`'s `SupportedLanguage`, restated.
 *
 * Deliberately a copy rather than an import: `code` is an *optional* peer, and a
 * type-only import of one lands in the emitted `.d.ts` and breaks a consumer
 * without it — the same trap `media-type-conformance.test.ts` documents. Tests
 * are not shipped, so the drift risk is one this file catches rather than causes.
 */
const SUPPORTED = [
	'typescript',
	'javascript',
	'svelte',
	'html',
	'css',
	'json',
	'markdown',
	'bash',
	'sql',
	'python',
	'rust',
	'yaml'
];

describe('markdown language aliases', () => {
	it('every alias resolves to a preloaded language', () => {
		const unreachable = Object.entries(LANGUAGE_MAP).filter(
			([, target]) => !PRELOADED_LANGUAGES.includes(target)
		);

		expect(
			unreachable.map(([alias, target]) => `${alias} -> ${target}`),
			'these aliases resolve to languages nothing loads, so they render as plain text'
		).toEqual([]);
	});

	it('every preloaded language is one the highlighter supports', () => {
		const unsupported = PRELOADED_LANGUAGES.filter((language) => !SUPPORTED.includes(language));

		expect(
			unsupported,
			'@composable-svelte/code logs "Unsupported language" for these and loads nothing'
		).toEqual([]);
	});

	it('has aliases to check', () => {
		// Both assertions above pass vacuously against an empty map.
		expect(Object.keys(LANGUAGE_MAP).length).toBeGreaterThan(0);
		expect(PRELOADED_LANGUAGES.length).toBeGreaterThan(0);
	});
});
