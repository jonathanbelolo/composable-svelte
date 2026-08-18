import type { Config } from 'tailwindcss';
import preset from './src/lib/tailwind-preset.js';

/**
 * Tailwind config for developing this package and its examples.
 *
 * The design tokens live in `src/lib/tailwind-preset.ts`, which is also the
 * preset published to consumers — keeping them in one place is what stops the
 * library's own styling from drifting away from what consumers get.
 */
export default {
  presets: [preset as unknown as Config],
  content: [
    './src/**/*.{html,js,svelte,ts}',
    './examples/**/*.{html,js,svelte,ts}'
  ],
  safelist: ['dark'], // Prevent purging dark mode class
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    }
  },
  plugins: []
} satisfies Config;
