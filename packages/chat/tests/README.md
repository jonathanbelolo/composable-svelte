# Test Suite Notes

## Two configs, and `pnpm test` runs both

```
vitest run                                   # browser mode: playwright/chromium
vitest run --config vitest.ssr.config.ts     # node, compiled with generate: 'server'
```

`test:watch` runs **only** the browser config, so anything under `tests/ssr/` is
invisible in watch mode. Run the full `test` script before committing — a
regression that emptied server HTML of video embeds shipped, and was then cleared
as harmless, because nobody ran the second half.

The SSR config compiles `.svelte` directly rather than through
`@sveltejs/vite-plugin-svelte`, which under Vite 6 fails every node-environment
run in `vite:import-analysis` with `filename.replace is not a function`.
`packages/core/vitest.node.config.ts` documents the same problem and solves it
the same way.

## Cross-package imports resolve to `dist`, not `src`

`@composable-svelte/core/animation` goes through core's exports map to its built
output, so a test here that exercises a core helper is exercising the build.
Measured both ways: editing core's source leaves these tests green, editing its
`dist` turns them red. `packages/core/tests/repo/dist-freshness.test.ts` fails
when a `dist` is older than its `src`, so a stale build cannot quietly produce a
green suite — but run `pnpm -r build` first if you have changed core.

## pdfjs-dist

`pdfjs-dist` has dual Node and browser builds, and Vitest's browser-mode static
analysis finds the Node paths (`fs/promises`). `vitest.config.ts` aliases it to
`tests/__mocks__/pdfjs-dist.ts` and marks it external, which is why the suite
runs in browser mode despite it. `PDFViewer` uses a dynamic `import()` and gets
the real browser build at runtime.

## Fixtures worth knowing about

- `tests/__mocks__/tiny-video.ts` is WebM/VP8, not MP4. Headless Chromium ships
  without H.264, so a perfectly valid MP4 fires `error` exactly like a corrupt
  one — and `VideoPlayer` renders its controls behind `{#if !error}`, so every
  control test would silently have nothing to assert against.
- `tests/props-box.svelte.ts` gives a plain `.ts` test a reactive props object,
  for the several defects here that only appear when a prop *changes*.
