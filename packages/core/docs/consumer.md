# Consuming Composable Svelte

Start with `npm install @composable-svelte/core svelte`. Choose additional packages
from the [package catalog](../README.md#packages); each README describes its
components, adapters and limitations. All guides in this directory and the
[starter](../consumer/README.md) ship in the npm tarball.

## Tested application setup

Use the starter for a working baseline: Node 20.19+ or 22.12+, Svelte 5.57,
TypeScript 5.9, Vite 7.3, Svelte Vite plugin 6.2, Vitest 4.0 and Tailwind 4.
Core itself supports Node >=20. The application's build tools impose the stricter
Node minimum. Motion is a direct dependency; do not install an old Motion peer.
The starter pins the toolchain, and its checks run against release tarballs.

Use TypeScript `moduleResolution: "bundler"`, `strict: true`, and
`skipLibCheck: true`. Some upstream animation/flow declarations require newer
DOM/library types; strict checking of all third-party declaration files is not
part of this supported baseline. Your application code remains strictly checked.
Run `svelte-check` as well as tests: `tsc` alone does not check Svelte components.

## State, dependencies and lifecycle

Define state and a discriminated action union. Annotate reducers with
`Reducer<State, Action, Dependencies>` to preserve tuple and action inference.
Reducers return a new state and an `Effect`; inject clocks, HTTP functions and
other external work through dependencies. Handle failures by dispatching an
explicit action. Use `createTestStore` from `@composable-svelte/core/test`,
assert every emitted action with `receive`, and finish each test with `finish()`.
See [testing](./core-concepts/testing.md) and [effects](./core-concepts/effects.md).

Create stores per component or request and destroy them when their owner ends.
A module-level singleton (as in the short browser-only README demonstration)
must never hold per-user state in SSR. Read `store.state` reactively in Svelte;
copying it to an ordinary local variable captures a snapshot. Scope child stores
and lift child actions rather than duplicating parent state.

## Styling

The [README styling recipes](../README.md#styling--theming) support Tailwind 3
and 4. The starter includes the Tailwind 4 Vite plugin and stylesheet imports.
For Tailwind 3 use Vite with PostCSS and `tailwindcss` + `autoprefixer`, the
published preset/contentGlob, and the globals stylesheet. Run CSS through Vite's
resolver; the standalone Tailwind CLI does not resolve package-export CSS
imports by itself. Toggle `.dark` on the document root for dark mode.

## Server and integration boundaries

Keep browser engines (maps, WebGL, editor and media devices) on the client.
Use per-request stores and the [SSR guide](./ssr/server-rendering.md) for hydration.
The starter checks basic server rendering and browser interaction; it is not a
full SvelteKit template. The HTTP, WebSocket and storage adapters are optional.
Your application supplies authorization policies, persistence, credentials,
transcription and backend routes. Auth's published `docs/http-contract.md`
describes the default adapter; use custom dependencies for a different protocol.
Compatibility with a particular backend must be verified against that contract.

## Instructions for an application-building agent

Give the agent the npm package name and the task. Ask it to read the installed
README, `docs/consumer.md`, `docs/components.md`, the relevant satellite README
and exported `.d.ts` declarations. Copy `consumer/` to start a new application.
Use public export paths only, and run check, test and build before considering
an integration complete. No library checkout, private skills or contributor
instructions are needed. Don't assume every upstream engine feature has a
Composable Svelte wrapper: consult the package's documented limits.
