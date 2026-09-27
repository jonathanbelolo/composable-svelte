#!/bin/sh
# Recreate the (gitignored) package-name links: @composable-svelte/core -> packages/core (built dist, through
# its package.json exports), tools from core's install.
set -e
cd "$(dirname "$0")"
mkdir -p node_modules/@composable-svelte node_modules/@sveltejs node_modules/@vitest
ln -sfn ../../../../../../packages/core node_modules/@composable-svelte/core
for p in svelte svelte-check typescript vitest vite playwright @sveltejs/vite-plugin-svelte @vitest/browser @vitest/browser-playwright; do ln -sfn "$(cd ../../../../packages/core/node_modules/$p && pwd -P)" "node_modules/$p"; done
