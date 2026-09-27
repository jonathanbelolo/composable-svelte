# Installed graphics managed recipe

This standalone application uses public `@composable-svelte/core` and `@composable-svelte/graphics` exports. It includes a real `defineViews` / `FeatureViews` / `FeatureOutlet` route and checks all five public graphics component prop types. It ships in the graphics npm archive.

Copy the directory outside the repository, then install the published versions named by its manifest (core `^0.14.0`, graphics `^0.4.0`, Svelte `^5.20.0`) and run the checks:

```sh
npm install
npx playwright install chromium
npm run check
npm run typecheck:nodenext
npm run build
npm run ssr
npm run test:browser
```

Maintainer qualification only: before publication, maintainers replay the same checks against local release archives. The repository's `verify.mjs` automates that replay and is not needed to use the recipe.

The browser test waits for a real Babylon WebGL initialization, then retires the managed view. The SSR script asserts scene markup. See [Managed integration](../../MANAGED.md) for ownership and operation policy. Browser WebGL support is required; jsdom alone cannot qualify native rendering.
