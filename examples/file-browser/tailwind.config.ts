import type { Config } from 'tailwindcss';
import composableSvelte, { contentGlob } from '@composable-svelte/core/tailwind-preset';

export default {
  presets: [composableSvelte as unknown as Config],
  content: ['./index.html', './src/**/*.{js,ts,svelte}', contentGlob],
  plugins: [require('tailwindcss-animate')]
} satisfies Config;
