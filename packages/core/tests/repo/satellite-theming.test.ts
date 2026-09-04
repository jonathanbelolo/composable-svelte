/**
 * Satellite components must follow the theme.
 *
 * The defect this closes: **438 hardcoded colour declarations against zero
 * references to any of core's tokens** — the register's count, which was itself
 * low; the real figure was 653 across 38 files. A consumer overriding
 * `--primary` restyled every `core` component and not one satellite.
 *
 * `chat` was worse than absent. It hooked `:global(.dark)` — core's own
 * dark-mode class — and then hardcoded its own palette, so it *looked*
 * theme-aware and was not: changing `--background` left it on `#1a1a1a`. Those
 * 68 rules contained nothing but colours and are gone; core redefines every
 * token under `.dark`, so the light rules using tokens now handle dark mode by
 * themselves.
 *
 * The shape of the fix is `hsl(var(--token, <the colour it used to be>))`, the
 * pattern the auth components already use. The fallback means an app that never
 * imports core's stylesheet looks exactly as it did.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { walkFiles } from './walk.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

const SATELLITES = ['chat', 'media', 'code', 'maps', 'charts'] as const;

/**
 * Hex, functional notation, **and the bare keywords**.
 *
 * The keywords were the category the first sweep missed entirely, and a
 * rendered contrast check is what found them: `background: white` on a chat
 * button stayed white in dark mode while the inherited text turned near-white,
 * so the control vanished. Nothing in a stylesheet-shaped regex for `#`
 * would ever have seen it.
 */
const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|(?<![-\w])(?:white|black)(?![-\w])/gi;
/** A literal inside `var(--token, …)` is the pattern, not a violation. */
const FALLBACK = /var\(\s*--[a-z-]+\s*,\s*[^)]*\)/g;

/**
 * Rules that paint a *code* theme rather than the app theme.
 *
 * Prism and CodeMirror token colours, and the `pre`/`code` blocks inside chat
 * messages, are a palette in their own right: a keyword is not `--primary`, and
 * pointing it at one would make syntax highlighting change colour when somebody
 * restyles their buttons.
 */
const PALETTE_RULE = /\.(token|cm-|hljs|prism)|\bpre\b|\bcode\b/i;

/** Pure black or white with alpha — a scrim or a shadow, not a theme colour. */
const SCRIM = /^rgba?\(\s*(?:0|255)\s*,\s*(?:0|255)\s*,\s*(?:0|255)\s*,\s*[\d.]+\s*\)$/;

/**
 * Colours with no token to point at, and why.
 *
 * Kept as an explicit list rather than a count so that adding a *new* hardcoded
 * `#3b82f6` fails while these keep passing. Every entry is a category core's 39
 * tokens do not cover.
 */
const NO_TOKEN_EXISTS: Record<string, string> = {
	// Success and recording states. Core has no `--success`.
	'#4ade80': 'success green',
	'#22c55e': 'success green',
	'rgba(34, 197, 94, 0.2)': 'success green',
	'rgba(34, 197, 94, 0.7)': 'success green',
	'rgba(34, 197, 94, 0)': 'success green',
	// Informational, likewise absent from the token set.
	'#3498db': 'info blue',
	'#e7f3ff': 'info blue tint',
	// A decorative gradient pair — brand ornament, not a semantic colour.
	'#667eea': 'gradient ornament',
	'#764ba2': 'gradient ornament',
	// Error *tints*. These are the one case the fallback pattern cannot express:
	// a tint wants `hsl(var(--destructive) / 0.1)`, whose fallback would render
	// at 10% alpha rather than as the original solid colour. Substituting at full
	// strength would paint a pale error panel bright red.
	'#fee': 'destructive tint',
	'#fcc': 'destructive tint',
	'#f66': 'destructive tint',
	'#644': 'destructive tint',
	'#3a1a1a': 'destructive tint',
	'#f8d7da': 'destructive tint',
	'#fca5a5': 'destructive tint',
	'rgb(0 0 0 / 0.1)': 'scrim in space-separated form'
};

interface Finding {
	file: string;
	value: string;
}

/** Every colour literal a satellite paints that is not a token, scrim or palette. */
export function hardcodedColours(files: { path: string; text: string }[]): Finding[] {
	const found: Finding[] = [];

	for (const { path, text } of files) {
		for (const style of text.matchAll(/<style[^>]*>(.*?)<\/style>/gs)) {
			const body = style[1] ?? '';
			for (const rule of body.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
				const selector = rule[1] ?? '';
				if (PALETTE_RULE.test(selector)) continue;

				const declarations = (rule[2] ?? '')
					.replace(FALLBACK, '')
					// Only properties that paint. `white-space: nowrap` is not a colour,
					// and `border-style` naming a keyword is not either.
					.split(';')
					.filter((d) => /(?:^|[\s-])(?:color|background|border|fill|stroke|outline|shadow)/.test(d.split(':')[0] ?? ''))
					.join(';');
				for (const match of declarations.matchAll(COLOUR)) {
					const value = match[0].toLowerCase();
					if (SCRIM.test(value)) continue;
					if (value in NO_TOKEN_EXISTS) continue;
					found.push({ file: path, value });
				}
			}
		}
	}

	return found;
}

function satelliteComponents(): { path: string; text: string }[] {
	return SATELLITES.flatMap((pkg) => {
		const root = join(repoRoot, 'packages', pkg, 'src');
		return walkFiles(root, { keep: (name) => name.endsWith('.svelte') }).files.map((file) => ({
			path: `${pkg}/${file.slice(root.length + 1)}`,
			text: readFileSync(file, 'utf8')
		}));
	});
}

describe('satellite components follow the theme', () => {
	it('paints nothing the theme should own', () => {
		const found = hardcodedColours(satelliteComponents());

		expect(
			found.map((f) => `${f.file}: ${f.value}`),
			'these paint a colour the theme should decide. Use ' +
				'`hsl(var(--token, <the colour it is now>))` — the fallback keeps the ' +
				'current appearance for an app that does not import core\'s stylesheet. ' +
				'If genuinely no token fits, add it to NO_TOKEN_EXISTS with the reason'
		).toEqual([]);
	});

	it('actually references the tokens', () => {
		// The floor, not just the ceiling. A file with no colours at all would
		// satisfy the arm above while being no more theme-aware than before, and
		// this whole sweep started from a package that had zero token references.
		const references = satelliteComponents().reduce(
			(total, { text }) => total + [...text.matchAll(/var\(--[a-z-]+/g)].length,
			0
		);

		expect(references, 'the satellites stopped using core tokens').toBeGreaterThan(250);
	});

	it('still detects a violation', () => {
		// The positive control. Four of five denials in `front-door` once matched
		// nothing, so a green result there proved only that the matcher ran.
		const planted = [
			{
				path: 'chat/Planted.svelte',
				text: '<style>.a { color: #3b82f6; }</style>'
			},
			{
				path: 'chat/Fine.svelte',
				text:
					'<style>.b { color: hsl(var(--primary, 217.2 91.2% 59.8%)); }' +
					'.c { background: rgba(0, 0, 0, 0.1); }' +
					'.token.comment { color: #6a9955; }</style>'
			}
		];

		expect(hardcodedColours(planted)).toEqual([
			{ file: 'chat/Planted.svelte', value: '#3b82f6' }
		]);
	});
});
