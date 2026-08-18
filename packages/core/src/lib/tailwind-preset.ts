/**
 * Tailwind CSS v3 preset for `@composable-svelte/core`.
 *
 * Consumers on Tailwind v3 should spread this into their config rather than
 * hand-copying the colour map — hand-copied maps are what let this package's
 * two token vocabularies drift apart and render component surfaces transparent.
 *
 * @example
 * ```ts
 * // tailwind.config.ts
 * import preset, { contentGlob } from '@composable-svelte/core/tailwind-preset';
 *
 * export default {
 *   presets: [preset],
 *   content: ['./src/**\/*.{html,js,svelte,ts}', contentGlob]
 * };
 * ```
 *
 * You must add `contentGlob` to `content` yourself. Tailwind v3 does not merge
 * a preset's `content` into the resolved config — verified against 3.4.18 — so a
 * preset cannot register its own source files no matter how it declares them.
 * Without it every component class is purged and the library renders unstyled.
 *
 * Pair the preset with `import '@composable-svelte/core/styles/globals.css'`
 * for the token values.
 *
 * Tailwind v4 users want `@composable-svelte/core/styles/tailwind.css` instead —
 * v4 is configured in CSS and does not use presets.
 *
 * @packageDocumentation
 */

import { fileURLToPath } from 'node:url';

/**
 * Structural subset of Tailwind's `Config` we actually populate.
 *
 * Declared locally rather than imported from `tailwindcss` so that consumers
 * who have not installed Tailwind (it is an optional peer dependency) do not
 * get a broken type reference from this package's `.d.ts`.
 */
export interface ComposableSveltePreset {
	readonly darkMode: readonly ['class'];
	readonly safelist: readonly string[];
	readonly theme: {
		readonly extend: Record<string, unknown>;
	};
}

/**
 * Absolute glob for this package's shipped components. Add it to your Tailwind
 * `content` array — see the note above about presets not contributing `content`.
 *
 * Derived from this module's own location rather than written as
 * `./node_modules/@composable-svelte/core/dist/...`, so consumers never have to
 * hardcode an install path. That path is not stable: it moves with hoisting,
 * workspace linking and custom install locations, and does not exist at all
 * under Yarn PnP.
 *
 * To be precise about what this does NOT fix: the hand-written relative glob
 * does work under pnpm's default symlinked layout — Tailwind v3 follows
 * symlinks (verified against 3.4.18, both for a symlink inside the project and
 * one pointing outside it). Use this export for convenience and portability,
 * not because the relative form is broken.
 */
export const contentGlob: string = resolveContentGlob();

function resolveContentGlob(): string {
	try {
		return `${fileURLToPath(new URL('.', import.meta.url))}**/*.{js,svelte}`;
	} catch {
		// `import.meta.url` is not always a file: URL — bundlers and some test
		// runners rewrite it. Fall back to the conventional install path rather
		// than throwing while a Tailwind config is being loaded.
		return './node_modules/@composable-svelte/core/dist/**/*.{js,svelte}';
	}
}

/**
 * Build an `hsl()` colour that resolves a token through both vocabularies this
 * package has shipped, and still accepts Tailwind's opacity modifier.
 *
 * The chain is evaluated at the element, which is what makes it work:
 *
 *   var(--popover)              shadcn vocabulary — `styles/globals.css`
 *     → var(--color-popover)    legacy vocabulary — `styles/theme.css` (v0.5.x)
 *       → literal               never transparent, even with no stylesheet
 *
 * Bridging in the colour value rather than via a `--color-x: var(--x)` CSS alias
 * is deliberate. A custom property is substituted where it is declared and then
 * inherits its *computed* value, so an alias declared on `:root` would freeze
 * the light-mode value and `.dark` overrides would never propagate.
 *
 * The `<alpha-value>` placeholder is mandatory here. Tailwind v3's colour parser
 * cannot parse `hsl(var(--x, fallback))`, so without the placeholder every
 * opacity-modified utility — `bg-background/80` on the Modal/Sheet/Drawer/Alert
 * backdrops, `bg-primary/90`, `bg-destructive/10` — is dropped from the output
 * entirely rather than merely losing its opacity.
 */
const token = (name: string, fallback: string): string =>
	`hsl(var(--${name}, var(--color-${name}, ${fallback})) / <alpha-value>)`;

const preset = {
	darkMode: ['class'],
	/**
	 * Tailwind v3 tree-shakes rules inside `@layer base` whose selectors never
	 * appear in `content`. The `.dark` class is applied at runtime by JS, so
	 * without this safelist the entire dark-mode token block is purged and dark
	 * mode silently does nothing.
	 */
	safelist: ['dark'],
	theme: {
		extend: {
			colors: {
				background: token('background', '0 0% 100%'),
				foreground: token('foreground', '222.2 84% 4.9%'),
				border: token('border', '214.3 31.8% 91.4%'),
				input: token('input', '214.3 31.8% 91.4%'),
				ring: token('ring', '222.2 84% 4.9%'),
				card: {
					DEFAULT: token('card', '0 0% 100%'),
					foreground: token('card-foreground', '222.2 84% 4.9%')
				},
				popover: {
					DEFAULT: token('popover', '0 0% 100%'),
					foreground: token('popover-foreground', '222.2 84% 4.9%')
				},
				primary: {
					DEFAULT: token('primary', '222.2 47.4% 11.2%'),
					foreground: token('primary-foreground', '210 40% 98%')
				},
				secondary: {
					DEFAULT: token('secondary', '210 40% 96.1%'),
					foreground: token('secondary-foreground', '222.2 47.4% 11.2%')
				},
				muted: {
					DEFAULT: token('muted', '210 40% 96.1%'),
					foreground: token('muted-foreground', '215.4 16.3% 46.9%')
				},
				accent: {
					DEFAULT: token('accent', '210 40% 96.1%'),
					foreground: token('accent-foreground', '222.2 47.4% 11.2%')
				},
				destructive: {
					DEFAULT: token('destructive', '0 84.2% 60.2%'),
					foreground: token('destructive-foreground', '210 40% 98%')
				},
				chart: {
					'1': token('chart-1', '12 76% 61%'),
					'2': token('chart-2', '173 58% 39%'),
					'3': token('chart-3', '197 37% 24%'),
					'4': token('chart-4', '43 74% 66%'),
					'5': token('chart-5', '27 87% 67%')
				}
			},
			/**
			 * Honour the `--radius-*` scale that legacy `theme.css` declares, and
			 * otherwise fall back to Tailwind's own stock values.
			 *
			 * The fallbacks deliberately match Tailwind's defaults exactly rather
			 * than deriving from shadcn's `--radius`. Deriving changed `rounded-sm`
			 * from 2px to 4px for every element in the consuming app — a preset
			 * should theme this library, not silently restyle its host.
			 *
			 * For the same reason this preset deliberately does NOT set
			 * `boxShadow`, `borderColor.DEFAULT`, `transitionDuration` or
			 * `transitionTimingFunction`:
			 *
			 * - `theme.css`'s `--shadow-*` values are byte-identical to Tailwind's
			 *   own, so overriding them bought nothing — and it actively broke
			 *   coloured shadows: Tailwind splits a box-shadow value on top-level
			 *   commas without honouring `var()` fallback parens, so
			 *   `var(--shadow-lg, A, B)` silently dropped the second layer from
			 *   `shadow-lg shadow-red-500`.
			 * - `borderColor.DEFAULT` rewrites preflight, so it applies to every
			 *   element in the host app. If the consumer's `--border` held a
			 *   complete colour rather than an HSL triplet, `hsl(#c00 / 1)` is
			 *   invalid and every border in their app would collapse to
			 *   `currentColor`. `globals.css` already supplies the same styling via
			 *   `* { @apply border-border }` for consumers who opt into it.
			 */
			borderRadius: {
				sm: 'var(--radius-sm, 0.125rem)',
				md: 'var(--radius-md, 0.375rem)',
				lg: 'var(--radius-lg, 0.5rem)',
				xl: 'var(--radius-xl, 0.75rem)',
				'2xl': 'var(--radius-2xl, 1rem)',
				full: 'var(--radius-full, 9999px)'
			}
		}
	}
} satisfies ComposableSveltePreset;

export default preset;
