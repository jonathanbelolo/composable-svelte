#!/bin/sh
# Recreate the (gitignored) package-name links: @composable-svelte/core -> packages/core,
# @composable-svelte/graphics -> packages/graphics
# (resolved through its package.json exports to the built dist), tools from core's install.
set -e
cd "$(dirname "$0")"
mkdir -p node_modules/@composable-svelte
ln -sfn ../../../../../../packages/core node_modules/@composable-svelte/core
# Type-only use in src/scene-visual.ts (the built graphics dist).
ln -sfn ../../../../../../packages/graphics node_modules/@composable-svelte/graphics
mkdir -p node_modules/@sveltejs node_modules/@vitest
for p in svelte svelte-check typescript vitest vite playwright @sveltejs/vite-plugin-svelte @vitest/browser @vitest/browser-playwright; do ln -sfn "$(cd ../../../../packages/core/node_modules/$p && pwd -P)" "node_modules/$p"; done
