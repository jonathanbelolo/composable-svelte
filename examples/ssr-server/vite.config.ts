import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig(({ command, mode, isSsrBuild }) => {
  const coreLibPath = resolve(__dirname, '../../packages/core/src/lib');

  if (isSsrBuild) {
    // Server build configuration
    return {
      plugins: [svelte()],
      build: {
        ssr: true,
        outDir: 'dist/server',
        rollupOptions: {
          input: {
            index: 'src/server/index.ts',
            ssg: 'src/build/ssg.ts'
          },
          output: {
            format: 'esm',
            entryFileNames: '[name].js'
          }
        },
        target: 'node18',
        minify: false
      },
      resolve: {
        alias: {
          '@composable-svelte/core': coreLibPath,
          '$lib': coreLibPath
        }
      },
      ssr: {
        noExternal: ['@composable-svelte/core']
      }
    };
  }

  // Client build configuration
  return {
    plugins: [svelte()],
    build: {
      outDir: 'dist/client',
      rollupOptions: {
        input: 'src/client/index.ts',
        output: {
          format: 'esm',
          entryFileNames: '[name].js',
          assetFileNames: '[name].[ext]'
        },
        // External Node.js modules that shouldn't be bundled for browser
        external: ['fs/promises', 'path', 'url', 'fs', 'node:fs/promises', 'node:path', 'node:url']
      },
      target: 'es2022',
      minify: true
    },
    resolve: {
      alias: {
        '@composable-svelte/core': coreLibPath,
        '$lib': coreLibPath
      }
    }
  };
});
