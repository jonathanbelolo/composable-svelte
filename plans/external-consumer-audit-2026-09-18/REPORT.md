# External-consumer audit — 18 September 2026

## Verdict

The published packages install and support a working Svelte application. The published onboarding and documentation are **not yet sufficient for a reliable, unattended external-agent handoff**. Several advertised guides are inaccessible through the published links, and multiple copyable README examples contradict the installed API.

This audit used npm registry metadata, downloaded npm tarballs, the installed declarations and shipped files, and unauthenticated public GitHub documentation. It did **not** inspect the local library implementation, local skills, or internal test suite. This report and its evidence were written into the repository only to preserve the results. No library code was changed or republished during the audit.

## Versions and scope

- core 0.12.1
- auth, charts, graphics, maps 0.2.0
- chat, code, media 0.4.0

Independent consumer directory: `/tmp/composable-external-audit`. All eight packages came from npm, without workspace links. The resolved consumer used Svelte 5.57.0, TypeScript 5.9.3, Svelte Check 4.3.3, Svelte Vite plugin 6.2.1, and Vitest 4.0.7. Browser build initially used Vite 6.4.1; the test harness needed Vite 7.3.6. Tailwind 4 and a separate Tailwind 3.4.17 build were exercised. Node was 24.10.0.

## Findings

### P1 — The advertised repository and homepage are broken

All eight published manifests point at `https://github.com/jbelolo/composable-svelte`. An unauthenticated request to that repository and its GitHub API endpoint returned 404. This also affects the advertised issue tracker.

`https://github.com/jonathanbelolo/composable-svelte` is public: its API and raw README returned 200. Discovering that different owner required information beyond the advertised npm entry point. Update repository, homepage, bugs URLs and README links across all packages.

### P1 — Core's comprehensive documentation is absent from its artifact

The core tarball contains `dist`, README, CHANGELOG, LICENSE and package.json. It does not contain the `docs/` directory that its README calls comprehensive documentation, or the linked examples and contributor guide. Sixteen relative link occurrences in the core README target files absent from the installed core package, including getting started, core concepts, navigation, DSL, animations, backend, routing, API reference, troubleshooting and migration.

The package README only names `@composable-svelte/core`; it contains no catalog of the other seven packages. Therefore the proposed handoff of “start at core and discover the ecosystem” currently lacks a dependable path.

Publish a versioned documentation site or ship the referenced guides. Include an explicit ecosystem catalog, component catalog, and a consumer-facing agent guide. Contributor skills should not be required to use a public package.

### P1 — Copyable examples disagree with published types

Twelve README Svelte examples were assembled in a strict consumer (`exactOptionalPropertyTypes`, bundler resolution, `skipLibCheck: true`). Initial Svelte Check found eight errors in five files. One is an application-supplied transcription placeholder, distinguished below; the other failures are reproducible documentation defects:

| Package/example | Published example | Installed API |
|---|---|---|
| core counter | Declares `const store`, then imports `{ store }` from that module | The store must be exported |
| maps quickstart | `createInitialMapState({ provider: 'maplibre', ... })` | Factory has no `provider` option |
| code editor | `createInitialCodeEditorState({ code: ... })` | Factory accepts `value` |
| code node canvas | Arrays for `nodes` and `edges`; `<NodeCanvas {store} />` | Records keyed by ID; required `liftAction`; the example also needed explicit action typing |

The voice-input example references `sendToSpeechToText` without defining it. Supplying a transcription backend is an expected application responsibility, not evidence of a library bug; the quickstart should identify the placeholder and its contract explicitly.

After correcting only the consumer fixtures using the shipped declarations, all twelve examples passed Svelte Check with zero errors and warnings. This supports correcting the documentation rather than redesigning those APIs. See `evidence/readme-check.log` and `evidence/corrected-readme-check.log`.

### P1 — Two published TestStore examples fail

The chat README's complete send/receive test passed with the installed packages.

The code README awaits `highlightCompleted`; the reducer emits `highlighted` with an `html` payload. Both TypeScript and TestStore reject the example.

The media README supplies `tracks` to a factory that only accepts preferences, uses track field `src` instead of `url`, then sends `nextTrack` instead of `next`. At runtime the first play assertion fails because the factory never loads a playlist. The same README's earlier component example already demonstrates the correct `loadPlaylist` pattern, so its own sections disagree.

See `evidence/readme-test-types.log` and `evidence/readme-tests-vite7.log`. The code/media excerpts were given Vitest imports so missing `expect` setup would not mask their actual API errors. They fail while executing the excerpt, before any test registration issue becomes relevant.

### P2 — Public getting-started guidance is stale even after repairing the URL

The public `packages/core/docs/getting-started.md` retrieved from the correct repository says the package is not yet published and tells the reader to clone the repository. It lists Node 18+ and a Motion 11 peer. The installed core requires Node >=20 and carries Motion 12 as a direct dependency.

The public root README still says npm is at core 0.5.2 and consumers should clone until a release is cut. Local documentation edits made during publication were not part of public main at audit time. Publishing npm packages does not update GitHub documentation.

Public sources checked:
- https://github.com/jonathanbelolo/composable-svelte
- https://github.com/jonathanbelolo/composable-svelte/blob/main/packages/core/docs/getting-started.md

### P2 — Auth's full backend contract is outside the published documentation path

Auth's README documents three session endpoints, then delegates nineteen additional endpoints to `../../examples/auth-server`, which is not shipped and is unreachable through the advertised repository URL. Rendering LoginForm works, but an external integrator lacks a reliable documented route to the complete HTTP contract.

Package the contract or link to a stable, public, version-matched reference. This audit did not claim compatibility with the new composable-runtime authentication surface.

### P2 — Supported consumer tooling needs a tested setup recipe

All 48 non-CSS declaration entry points checked (excluding the deliberately optional Mapbox adapter) resolved with `skipLibCheck: true`. With dependency declaration checking enabled and ES2022, upstream declarations produced two errors: `PromiseWithResolvers` in SvelteFlow and `HTMLWebViewElement` in Framer Motion. These are dependency/toolchain constraints, not established defects in the library's own declarations.

The initial Vite 6.4.1/Vitest 4.0.7/Svelte plugin 6.2.1 Node test harness failed in Vite import analysis before tests ran. Upgrading the consumer to Vite 7.3.6 allowed the chat test to pass and exposed the concrete code/media failures above. Do not present the initial harness failure as a reducer defect. Provide a pinned, tested consumer configuration and document compiler/lib assumptions.

## What worked

| Check | Result |
|---|---|
| npm registry README versus tarball README, all eight packages | Identical |
| Fresh installation of all eight packages from npm | Passed |
| README examples after the documented fixture corrections | Twelve components, zero Svelte Check errors/warnings |
| Public declaration entry points | 48 resolved with normal dependency-lib skipping; optional Mapbox excluded |
| Production Vite application | Built successfully |
| Browser reducer-driven increment | Count changed to 1 |
| Browser injected async effect | Count changed to 42 |
| Tailwind 4 light/dark theme | Button background/foreground switched correctly |
| Chart, auth form, code highlighting, editor, chat, audio UI | Mounted in the production build; no page JavaScript exceptions |
| Editor interaction | Accepted `const externalConsumer = true;` |
| Tailwind 3 via Vite and the published preset | Built; primary/popover classes and dark/light tokens present |
| Chat README TestStore send/receive example | Passed |
| Basic Vite SSR build and Node execution | Rendered expected state in HTML |

The Tailwind 3 standalone CLI did not resolve the package CSS export in `@import`; the Vite CSS pipeline did. Its successful Vite build is the qualified path here.

The combined smoke app emits a large-chunk warning (about 1.2 MB for the largest uncompressed JavaScript chunk). This is a multi-feature fixture, not a core-only bundle-size measurement or a performance verdict.

## Qualification limits

This is an onboarding/package-consumption audit, not proof that every possible application requirement is covered. It did not exercise real auth servers, microphone permissions/transcription, remote media playback, third-party map services, GPU rendering, all navigation/animation paths, SSR hydration, or a full accessibility audit. The screenshot's audio error comes from the README's placeholder audio URL; no real recording was provided. The basic SSR check does not establish SvelteKit integration or per-user state isolation.

No conclusion that the new composable-runtime API automatically matches the published auth adapter is justified by these tests. Likewise, local agent skills and private conventions cannot fill gaps in a consumer-only contract.

## Recommended closure

1. Repair all public repository/support URLs and add an ecosystem index to the core README.
2. Make versioned usage guides, component examples, testing setup and the complete auth HTTP contract publicly reachable or shipped.
3. Correct the concrete README examples above and remove stale installation requirements/publication claims.
4. Validate documentation from **installed npm tarballs in a clean consumer project**, including typechecking and executing examples. Keep the original snippets as fixtures; don't silently repair them in the verification path.
5. Publish the documentation corrections, then repeat the no-local-source handoff exercise. Keep a separate acceptance suite for runtime/frontend integration.

## Reproduction and evidence

The scratch directory contains downloaded original READMEs and tarballs, the consumer lockfile, extracted snippets, corrected fixtures and build artifacts. Persistent evidence is in this report's `evidence/` directory. The original failure logs were retained before fixture corrections.

Representative commands in the scratch project:

```sh
npx svelte-check --tsconfig ./tsconfig.json
npx vitest run
npx vite build
npx vite build --config vite3.config.mjs
npx vite build --ssr src/server.ts --outDir dist-server
node dist-server/server.js
node browser-check.mjs
```

`vitest run` intentionally still fails for the uncorrected code/media README tests. `svelte-check` now passes because the consumer component fixtures were corrected; consult the preserved original log for the initial result.
