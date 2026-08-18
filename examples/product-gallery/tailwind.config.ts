import type { Config } from 'tailwindcss';
import composableSvelte, { contentGlob } from '@composable-svelte/core/tailwind-preset';

/**
 * The colour map, dark-mode strategy, `.dark` safelist and the glob covering
 * the library's own components all come from the preset — the same one
 * consumers get. Hand-copying it here is what let this app's tokens drift out
 * of sync with the library and render component surfaces transparent.
 */
export default {
  presets: [composableSvelte as unknown as Config],
  content: ['./index.html', './src/**/*.{js,ts,svelte}', contentGlob],
  plugins: [require('tailwindcss-animate')]
} satisfies Config;
