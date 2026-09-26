import { mergeConfig } from 'vite';
import production from './vite.config';

// Inherit the application's actual compiler, CSS, aliases and resolution.
export default mergeConfig(production, {
  cacheDir: 'node_modules/.vite-lifetime',
  build: {
    outDir: 'dist-lifetime',
    emptyOutDir: true,
    rollupOptions: { input: 'browser/lifetime/index.html' }
  }
});
