# Managed Code recipe

This folder is shipped in the npm archive. `model.ts` creates one owner for each
CodeEditor, CodeHighlight, and NodeCanvas row. `Host.svelte` renders their
`FeatureViewProps` stores through `FeatureViews` and `FeatureOutlet`.
`managed.test.ts` drives the real installed components and checks editor command
order, highlighting, viewport commands, and absence of integration warnings.

To run it in a Svelte/Vite consumer that has installed compatible versions of
`@composable-svelte/core` (`^0.14.0`), `@composable-svelte/code` (`^0.6.0`), Svelte
(`^5.30.0`; Svelte 5.30.0 and 5.55.3 were checked before this release, not every patch in between), Vitest, Playwright,
`@vitest/browser-playwright`, and `@sveltejs/vite-plugin-svelte`:

```sh
mkdir -p recipes
cp -R node_modules/@composable-svelte/code/recipes/managed recipes/managed
cp recipes/managed/svelte.config.js ./svelte.config.js
npx vitest run --config recipes/managed/vitest.config.ts
```

The copy step keeps test files out of `node_modules`, where Vitest excludes them.
The Svelte config preprocesses the TypeScript syntax in xyflow's `.svelte`
files. For a standalone Store, pass the Store directly; a managed child must be
passed unwrapped from its owner. Child reducers own editor/highlight/canvas
state. Parent business state belongs in the parent reducer. Commands for an
unmounted view are dropped; durable setup belongs in state. A managed view is
retired with its owner, and its queued commands must not be replayed into the
next owner. If commands warn or do nothing, check that the passed value is a
live `ChildView`, the installed core exports `isManagedChildView` and
`observeChildActions`, and the app has one copy of core. NodeCanvas viewport
measurements are asynchronous; fit commands use the currently rendered nodes.
