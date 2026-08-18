import type { Config } from 'tailwindcss';
import composableSvelte, { contentGlob } from '@composable-svelte/core/tailwind-preset';

/**
 * `contentGlob` must be listed explicitly — Tailwind v3 does not merge a
 * preset's own `content` into the resolved config, so without it every
 * component class is purged and the library renders unstyled.
 */
export default {
  presets: [composableSvelte as unknown as Config],
  content: ['./index.html', './src/**/*.{js,ts,svelte}', contentGlob]
} satisfies Config;
