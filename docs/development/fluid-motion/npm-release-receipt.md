# Fluid motion npm release

## Release candidate

Prepared from feature commit `68b31d38c01b6441e5d94c063570e65b3d924bb9` and
documentation commit `55852fb9225cabc9f0cb2aa0f8a35f6444e6eb7e` on
`codex/fluid-layout-motion`. Publication is explicitly authorized by the user.
Registry publication is pending; this preparation record is not a publication receipt.

| Package | Version |
|---|---|
| core | 0.14.0 |
| auth, charts, graphics, maps | 0.4.0 |
| chat, code, media | 0.6.0 |

All satellites require core `^0.14.0`; chat's optional code and media peers require
`^0.6.0`. Compatibility-only satellites also take minor versions so existing
pre-1.0 caret ranges do not select an incompatible core peer in a patch update.
The architecture checker remains 0.13.1, unchanged and unqualified for core 0.14.

## Artifact identity and checks

The [artifact manifest](npm-release-artifacts.json) records the eight exact
`pnpm pack` archives, SHA-256, npm SHA-512 integrity and file counts. Publishing
uses these archives rather than repacking mutable package directories. No archive
contains an unresolved `workspace:` dependency. pnpm normalizes workspace development
dependencies and removes the prepack/prepublishOnly lifecycle entries from packed
manifests; focused checks and builds ran before immutable-archive publication.
Public exports, documentation,
agent instructions, starter files and examples are present.

Release changes comprise versions, peer floors, starter/fixture pins, changelogs
and documentation; the only source edits are comments in two core public entry
files. Executable behavior remains the accepted feature. All eight packages build;
74 metadata/package guards and 36 release-harness tests pass. The lockfile remains
unchanged and frozen installation passes. Guide checks pass 13 node and 6 browser
tests; core documentation examples pass 21 tests, skill examples 7, documentation
typechecks 10. Svelte/TypeScript checks for these changed examples are clean.

Final archives pass a strict NodeNext consumer covering choreography, representation
providers, Presence, media adoption props and explicit WebGPU selection. The existing
installed-consumer verifier uses these exact archives via a temporary adapter that
replaces only its packing step. It verifies the standalone starter, the combined
package set, packaged links and examples, Bundler/NodeNext declarations, SSR,
production browser behavior, regression controls and Tailwind compatibility.
The final verifier exited successfully: 83 packaged documents, 312 relative links and
23 README/guide fixture files verified; standalone and combined consumer tests,
regression controls, and Tailwind 4 and 3 production browser checks all passed.

Prior runtime acceptance is retained; no full-workspace rerun was needed for this
release metadata/documentation delta. Independent GPT-6 Astra at high effort reviews
the final release delta and archive identities. Detailed execution logs remain local.

## Qualifications

The package changelogs and public guides retain browser/provider limitations,
API-confirmed mute versus measured sound, conservative protected-media settlement,
closed-root observability limits and qualified text rasterization. Large cold
preparation measured about 330–351 ms; the roughly 150–157 ms reference Scene mount
was software WebGL (SwiftShader), while measured hardware WebGL cold mount was
about 25–35 ms. No universal frame-rate claim is made. WebGPU qualification was
functional on one Apple Metal adapter; its timing was not measured.

## Publication verification

Pending. No npm package has been published by this release task yet.
