/**
 * Static contract tests for the theming layer.
 *
 * These exist because the bug they guard against — component surfaces rendering
 * transparent — cannot be caught by the rest of the suite: jsdom has no Tailwind
 * pipeline, so no unit test can assert "the popover is opaque". What *is*
 * testable is the contract that produces the CSS, which is where the defect
 * actually lived: a token referenced by the Tailwind config but never declared
 * by any shipped stylesheet compiles to `hsl(var(--undefined))`, which is
 * invalid at computed-value time and paints nothing.
 *
 * Needs `node:fs`, so it is excluded from the package's browser-mode runner and
 * runs under the root jsdom config instead.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import preset, { contentGlob } from '../../src/lib/tailwind-preset.js';

const read = (relative: string): string =>
	readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

/**
 * Strip CSS comments. The stylesheets document their own setup in comments —
 * including sample `@import 'tailwindcss'` lines — so assertions about what a
 * file does *not* contain have to look at real declarations only.
 */
const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

const tokensCss = read('../../src/lib/styles/tokens.css');
const tailwindCss = read('../../src/lib/styles/tailwind.css');
const themeCss = read('../../src/lib/styles/theme.css');
const globalsCss = read('../../src/lib/styles/globals.css');

/** Extract the custom properties declared inside a given selector's block. */
function declaredIn(css: string, selector: string): Set<string> {
	const start = css.indexOf(`${selector} {`);
	if (start === -1) throw new Error(`selector not found: ${selector}`);
	// Match to the first closing brace regardless of indentation — keying off
	// '\n\t}' made this silently swallow the rest of the file (and the parity
	// assertion below vacuous) the moment the file was reformatted with spaces.
	const end = css.indexOf('}', start);
	if (end === -1) throw new Error(`unterminated block: ${selector}`);
	// A capture group is `string | undefined` to the compiler even when the
	// pattern makes it mandatory, as this one does.
	const names = [...css.slice(start, end).matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]!);
	if (names.length === 0) throw new Error(`no tokens found in ${selector}`);
	return new Set(names);
}

/** Every `--name: value;` pair declared inside a selector's block. */
function valuesIn(css: string, selector: string): Record<string, string> {
	const start = css.indexOf(`${selector} {`);
	const body = css.slice(start, css.indexOf('}', start));
	return Object.fromEntries(
		[...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]!.trim()])
	);
}

/** Every colour string the preset contributes, flattened across nested groups. */
function presetColors(): Record<string, string> {
	const flat: Record<string, string> = {};
	const colors = preset.theme.extend.colors as Record<string, unknown>;
	for (const [name, value] of Object.entries(colors)) {
		if (typeof value === 'string') flat[name] = value;
		else
			for (const [sub, subValue] of Object.entries(value as Record<string, string>))
				flat[`${name}-${sub}`] = subValue;
	}
	return flat;
}

const rootTokens = declaredIn(tokensCss, ':root');
const darkTokens = declaredIn(tokensCss, '.dark');

describe('tokens.css', () => {
	it('declares the same token names in :root and .dark', () => {
		// A token present in one block but not the other is a colour that silently
		// keeps its light value in dark mode.
		expect([...darkTokens].sort()).toEqual([...rootTokens].filter((t) => t !== '--radius').sort());
	});

	it('is free of Tailwind directives so either major version can import it', () => {
		const css = stripComments(tokensCss);
		expect(css).not.toMatch(/@tailwind\b/);
		expect(css).not.toMatch(/@import\s+['"]tailwindcss['"]/);
	});

	it('does not declare variables that are theme namespaces in Tailwind v4', () => {
		// `--radius-*` and `--shadow-*` back v4's `rounded-*` / `shadow-*` scales.
		// Declaring them at :root would reskin the consuming app, not just this
		// library, so they stay confined to the legacy theme.css.
		for (const token of rootTokens) {
			expect(token).not.toMatch(/^--(radius|shadow|transition)-/);
		}
		expect(rootTokens.has('--radius')).toBe(true);
	});
});

describe('token values', () => {
	it('are bare HSL triplets, never complete colours', () => {
		// The whole system wraps these in hsl() at the point of use. A complete
		// colour here — `oklch(1 0 0)` from a shadcn-v4 palette, say — produces
		// `hsl(oklch(...))`, which is invalid and paints nothing. This is the
		// exact failure the package shipped in v0.5.x.
		const triplet = /^[\d.]+ [\d.]+% [\d.]+%$/;
		for (const css of [tokensCss, globalsCss]) {
			for (const selector of [':root', '.dark']) {
				for (const [name, value] of Object.entries(valuesIn(css, selector))) {
					if (name === '--radius') continue; // a length, not a colour
					expect(value, `${selector} ${name}`).toMatch(triplet);
				}
			}
		}
	});
});

describe('tailwind-preset', () => {
	const colors = presetColors();

	it('resolves every colour through both vocabularies down to a literal', () => {
		// Shape: hsl(var(--x, var(--color-x, <literal>)) / <alpha-value>)
		for (const [name, value] of Object.entries(colors)) {
			expect(value, name).toMatch(
				/^hsl\(var\(--[\w-]+, var\(--color-[\w-]+, [^)]+\)\) \/ <alpha-value>\)$/
			);
		}
	});

	it('carries the <alpha-value> placeholder on every colour', () => {
		// Without it Tailwind v3 cannot parse `hsl(var(--x, fallback))` and drops
		// opacity-modified utilities entirely — including `bg-background/80`, the
		// Modal/Sheet/Drawer/Alert backdrop.
		for (const [name, value] of Object.entries(colors)) {
			expect(value.endsWith('/ <alpha-value>)'), name).toBe(true);
		}
	});

	it('references only tokens that tokens.css actually declares', () => {
		for (const [name, value] of Object.entries(colors)) {
			const token = value.match(/var\((--[\w-]+),/)?.[1];
			expect(rootTokens.has(token!), `${name} → ${token}`).toBe(true);
		}
	});

	it('chains each colour to its own legacy --color-* name', () => {
		// A mismatched legacy link (popover → --color-card) would render a legacy
		// consumer's popover in the wrong colour, silently.
		for (const [name, value] of Object.entries(colors)) {
			const [, primary, legacy] = value.match(/var\((--[\w-]+), var\(--color-([\w-]+),/)!;
			expect(`--${legacy}`, name).toBe(primary);
		}
	});

	it('safelists .dark so Tailwind v3 does not purge the dark token block', () => {
		// v3 tree-shakes @layer base selectors absent from `content`. The class is
		// applied at runtime by themeManager, so without this dark mode is silently
		// a no-op — which is exactly what the example apps suffered.
		expect(preset.safelist).toContain('dark');
		expect(preset.darkMode).toEqual(['class']);
	});

	it('exports a content glob pointing at the shipped components', () => {
		// Deliberately NOT part of the preset object: Tailwind v3 does not merge a
		// preset's `content` into the resolved config (verified against 3.4.18), so
		// consumers must spread this into their own `content` array.
		expect(preset).not.toHaveProperty('content');
		expect(contentGlob).toMatch(/\{js,svelte\}$/);
		expect(contentGlob).toMatch(/(^\/|@composable-svelte\/core)/);
	});
});

describe('tailwind.css (v4 entry)', () => {
	it('uses @theme inline, which is what makes dark mode propagate', () => {
		// Plain @theme freezes the substituted value onto :root, so `.dark`
		// overrides of the underlying token would never reach the utilities.
		expect(tailwindCss).toMatch(/@theme\s+inline\s*\{/);
	});

	it('registers the library as a content source', () => {
		expect(tailwindCss).toMatch(/^@source\s+"\.\.\/\*\*/m);
	});

	it('defines the class-based dark variant', () => {
		expect(tailwindCss).toMatch(/@custom-variant\s+dark/);
	});

	it('does not import Tailwind itself', () => {
		// Tailwind v4 does not de-duplicate `@import "tailwindcss"`, so importing
		// it here as well as in the app CSS emits preflight twice.
		expect(stripComments(tailwindCss)).not.toMatch(/@import\s+['"]tailwindcss['"]/);
	});

	it('maps every --color-* onto a token tokens.css declares', () => {
		const themeBlock = tailwindCss.slice(tailwindCss.indexOf('@theme inline'));
		for (const [, name, token] of themeBlock.matchAll(
			/(--color-[\w-]+):\s*hsl\(var\((--[\w-]+),/g
		)) {
			expect(rootTokens.has(token!), `${name} → ${token}`).toBe(true);
		}
	});

	it('imports the tokens it maps', () => {
		// Without this the v4 build still emits utilities, light mode looks fine,
		// and dark mode is completely dead — a silent failure.
		expect(stripComments(tailwindCss)).toMatch(/@import\s+['"]\.\/tokens\.css['"]/);
	});

	it('wraps every mapped token in hsl()', () => {
		// The tokens are triplets; any other colour function yields an invalid
		// value and a transparent surface.
		const themeBlock = tailwindCss.slice(tailwindCss.indexOf('@theme inline'));
		const mappings = [...themeBlock.matchAll(/(--color-[\w-]+):\s*([^;]+);/g)];
		expect(mappings.length).toBeGreaterThan(10);
		for (const [, name, value] of mappings) {
			expect(value, name).toMatch(/^hsl\(var\(/);
		}
	});

	it('never self-references a --color-* inside its own definition', () => {
		// @theme inline still emits the variable, so chaining --color-x within the
		// definition of --color-x is a custom-property cycle → invalid → transparent.
		expect(tailwindCss).not.toMatch(/(--color-[\w-]+):[^;]*var\(\1/);
	});
});

describe('back-compatibility', () => {
	it('theme.css still declares the --color-* vocabulary shipped through v0.5.x', () => {
		for (const name of ['popover', 'background', 'card', 'border', 'primary', 'muted']) {
			expect(themeCss).toContain(`--color-${name}:`);
		}
	});

	it('theme.css stays vocabulary-pure so it cannot shadow a consumer override', () => {
		// Importing tokens.css here would define --popover at our defaults, and the
		// resolution chain tries the unprefixed name first — silently overriding a
		// legacy consumer's own --color-popover.
		expect(stripComments(themeCss)).not.toMatch(/@import\s+['"]\.\/tokens\.css['"]/);
	});

	it('globals.css declares its tokens inline, not via @import', () => {
		// An @import is only inlined by pipelines running postcss-import. Vite and
		// the Tailwind CLI do; a bare PostCSS setup does not, and there the tokens
		// would simply never be declared — the transparent-component bug again.
		expect(stripComments(globalsCss)).not.toMatch(/@import/);
	});

	it('globals.css and tokens.css declare identical tokens', () => {
		// They are duplicated on purpose (see above), so pin them together.
		const pairs = (css: string, selector: string) => {
			const start = css.indexOf(`${selector} {`);
			const body = css.slice(start, css.indexOf('}', start));
			return [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)]
				.map((m) => `${m[1]}:${m[2]!.trim()}`)
				.sort();
		};
		expect(pairs(globalsCss, ':root')).toEqual(pairs(tokensCss, ':root'));
		expect(pairs(globalsCss, '.dark')).toEqual(pairs(tokensCss, '.dark'));
	});
});
