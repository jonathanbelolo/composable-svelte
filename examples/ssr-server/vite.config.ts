import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig(({ command, mode, isSsrBuild }) => {
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
      ssr: {
        // Core has to be inlined: this server imports `createStore` from its
        // root entry, which reaches the component barrel, and Node cannot load
        // the `.svelte` files that come with it.
        noExternal: ['@composable-svelte/core'],
        // Its Node-only dependency stays external, though. Bundling
        // isomorphic-dompurify pulls in jsdom, which is pointless on a Node
        // server (it is installed and runs natively) and whose cssstyle build
        // rollup's commonjs plugin cannot parse. Inlining a package makes its
        // un-inlined runtime dependencies yours, which is why this example
        // declares isomorphic-dompurify directly.
        external: ['isomorphic-dompurify']
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
    }
  };
});
