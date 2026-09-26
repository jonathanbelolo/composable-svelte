# Localized SSR and static-site demo

This generic, read-only blog demonstrates Composable Svelte with Fastify SSR, hydration, localized routes, and static generation. It is demo content, not a publishing service or a persistence implementation.

```sh
pnpm build
pnpm start                  # http://localhost:3000
pnpm build:ssg              # regenerates static/ from source and bundled data
pnpm test:contracts         # run after build:ssg
pnpm test:e2e --project=chromium
pnpm check
pnpm typecheck
pnpm check:tests
```

The E2E runner builds and owns its server on `127.0.0.1:3198`; set `SSR_TEST_PORT` to use another test port. It never reuses an unrelated server. Install Playwright browsers before running their projects. `pnpm dev` builds and starts the compiled server. It does not watch source files or provide hot reload: stop it, edit, and rerun to rebuild/restart. Direct tsx cannot compile imported Svelte components. Production and E2E qualification use the same compiled server and client bundles.

## Routes and locale policy

English uses `/`, `/posts/:id`, and `/posts/:id/comments`. French and Spanish use `/fr/…` and `/es/…`; explicit `/en/…` is accepted. Route parsing removes search and fragment before matching and validates the entire positive integer ID. Unknown paths and missing posts render a not-found page with HTTP 404. Static generation emits an actual `404.html`.

An explicit supported path locale wins. Otherwise core's SSR locale detector checks `?lang=`, then `Accept-Language`, then English. Canonical URLs always use the locale's normal path form and omit query parameters. Language switches use ordinary document links. Other navigation uses core's browser-history integration and URL effect. The hydrated session retains its query during ordinary route changes and Back/Forward; unrelated data actions do not write history. Link hrefs are localized and work without JavaScript.

## State and data ownership

Reducers own route choices, comment partitions and metadata. Views render content and dispatch intent. Core owns history listeners and URL effects; the client entry releases its history connection and owned store during HMR disposal.

Every SSR/SSG state contains the complete bundled posts/comments snapshot. Client loaders return that snapshot rather than empty substitutes. A `commentsLoaded` result carries its requested post ID and replaces only that post's partition, including an intentionally empty result; later results cannot erase a different post's comments. These records are not user edits and are not persisted. Refreshing the document reloads the bundled server/build snapshot. A real product must supply a persistence/data service and its own business policy instead of treating this demo as one.

## Document metadata ownership

`App.svelte` owns the title and canonical link. Render options set `title: null` so the document wrapper does not add another title, and set the escaped `lang` attribute. SSG resolves render options from each page's merged state, including the 404 state. The example intentionally omits generator `baseURL`, since that option would add a generator-owned canonical link. Choose exactly one title/canonical owner; do not configure both.

Shared metadata decisions strip markup from the bundled HTML content before truncating descriptions. Svelte escapes attribute values. `static/` is generated output: change source and run `build:ssg`, never edit the generated HTML or asset bundles manually. The contract test inspects every generated page for language and single metadata ownership.

## Qualification scope

Tests cover actual server status/routing, no-JavaScript navigation, hydration without document replacement, query/locale retention, Back/Forward, comment partition behavior, and all generated pages. This example remains on the existing public store/routing integration; it is not a claim that the newer application assembly migration is complete.
