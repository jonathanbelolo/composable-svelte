# Installed charts managed recipe

This standalone application uses only public core and charts exports. It checks row-typed `Chart` and `ChartPrimitive` props, a real `defineViews` / `FeatureViews` / `FeatureOutlet` route, SSR, and native wheel and brush gestures in Chromium. The brush checks both the lifted parent selection and the typed `onSelectionChange` payload. The recipe ships in the charts npm archive.

Copy the directory outside the repository, then install the published versions named by its manifest (core `^0.13.1`, charts `^0.3.0`, Svelte `^5.20.0`) and run the checks:

```sh
npm install
npx playwright install chromium
npm run check
npm run typecheck:nodenext
npm run build
npm run ssr
npm run test:browser
```

Maintainer qualification only: before publication, maintainers replay the same checks against local release archives. The repository's `verify.mjs` automates that replay and is not required to use the recipe. It accepts `CHARTS_CORE_TARBALL`, `CHARTS_SVELTE_VERSION` or `CHARTS_SVELTE_TARBALL`, `CHARTS_INSTALL_OFFLINE=1`, and `CHARTS_INSTALL_BROWSER=1`.

Earlier release-candidate evidence: Svelte 5.20.0 and 5.55.3 passed isolated checks of a pre-release candidate. That evidence predates the published archives. See [Managed integration](../../MANAGED.md) for ownership and operation policy.
