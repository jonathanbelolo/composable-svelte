import type { Config } from 'tailwindcss';
import composableSvelte, { contentGlob } from '@composable-svelte/core/tailwind-preset';

/**
 * This config previously had no glob covering the library at all, so every
 * component class was purged and the core components rendered unstyled. The
 * preset supplies that glob along with the colour map and dark-mode wiring.
 */
export default {
  presets: [composableSvelte as unknown as Config],
  content: ['./index.html', './src/**/*.{js,ts,svelte}', contentGlob],
  plugins: [require('tailwindcss-animate')]
} satisfies Config;
