# Published release — 18 September 2026

All eight packages were published and verified under npm's `latest` tag:

- `@composable-svelte/core@0.12.2`
- `@composable-svelte/auth@0.2.1`
- `@composable-svelte/charts@0.2.1`
- `@composable-svelte/graphics@0.2.1`
- `@composable-svelte/maps@0.2.1`
- `@composable-svelte/chat@0.4.1`
- `@composable-svelte/code@0.4.1`
- `@composable-svelte/media@0.4.1`

Release implementation: `9a4b567`; reviewed evidence: `5142d37`.
Both commits were pushed to `main`, making the public homepage guides available.
Earlier audit/review documents describe their respective pre-publication states.

## Release verification

- Workspace build, TypeScript and Svelte checks passed.
- Packaged set installed outside the workspace: 53 public entry points resolved;
  three forbidden deep imports were rejected.
- A clean install downloaded all eight exact versions from registry.npmjs.org.
  [Artifact URLs and integrity hashes](./published-artifacts.json) record that installation.
- All 1,689 installed runtime, documentation, README, changelog and starter files
  matched the reviewed release byte-for-byte. Versions and homepages matched;
  published manifests contained no `workspace:` protocols.
- The core-only starter was extracted from the npm tarball and installed separately:
  zero Svelte errors/warnings, two unit tests, SSR and one production browser test passed.
- The combined consumer passed Svelte checks, all 49 typed exports under Bundler and
  NodeNext resolution, 14 unit tests, SSR and two production browser tests, including
  editor input and chat transport.
- These registry checks supplement the full pre-release suite and Tailwind 3/4
  verification recorded in [the review](./REVIEW.md).
