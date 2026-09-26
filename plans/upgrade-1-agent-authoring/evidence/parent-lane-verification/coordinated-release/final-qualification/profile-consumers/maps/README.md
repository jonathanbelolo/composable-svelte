# Installed maps managed recipe

This directory is a standalone `defineViews` / `FeatureViews` / `FeatureOutlet` application. It uses public package exports only and exercises a typed `mapClicked` action. It ships in the maps npm archive so the recipe can be copied outside the repository.

Copy the directory outside the repository, then install the published versions named by its manifest (core `^0.13.1`, maps `^0.3.0`, Svelte `^5.20.0`) and run the checks:

```sh
npm install
npx playwright install chromium
npm run check
npm run build
npm run ssr
npm run test:browser
```

Maintainer qualification only: before publication, maintainers replay the same checks against local release archives. The repository's `verify.mjs` automates that replay, but the recipe does not require it.

The native browser check uses a local style and does not require `mapbox-gl` or provider credentials. Earlier release-candidate evidence: Svelte 5.20.0 and 5.55.3 passed isolated checks of a pre-release candidate; that evidence predates the published archives. The browser test checks a real native map canvas and tile control; the server script checks rendered managed content. See [Managed integration](../../MANAGED.md) for the ownership and operation contract.
