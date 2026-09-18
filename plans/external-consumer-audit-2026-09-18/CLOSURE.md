# External consumer gaps — closure, 18 September 2026

## Result

A subsequent [review pass](./REVIEW.md) found and corrected four additional issues
and expanded the consumer gate. Its validation counts supersede those below.

The concrete onboarding and packaging findings in [the original audit](./REPORT.md)
are closed in the prepared release artifacts. The original npm audit and its
failure evidence remain unchanged. No package was published during this work;
GitHub main and npm still need the release updates.

Prepared versions: core **0.12.2**; auth, charts, graphics and maps **0.2.1**;
chat, code and media **0.4.1**. Existing compatible peer ranges are unchanged.

## Finding-to-fix record

| Finding | Closure |
|---|---|
| Wrong repository, homepage and issue tracker | All eight manifests use the public `jonathanbelolo/composable-svelte` repository; package homepages open their own README. Documentation links use the correct owner. |
| Guides missing from core's npm artifact | Core ships all usage guides plus consumer and import catalogs; storage/security guides now have canonical locations in the shipped docs. All packed Markdown is checked for missing relative targets. |
| Other packages undiscoverable from core | Core README lists all eight packages with npm links, responsibilities and limits; the public import catalog lists the entry points. |
| Broken core/maps/code quickstarts | Correct store exports, supported map configuration, editor `value`, record-shaped nodes/edges, explicit action types and action lifting. Custom map tiles use the supported configuration action. |
| Broken code/media TestStore examples | Correct emitted action and HTML assertion; playlist loading uses track `url` and the `next` action. Both tests run from their README text. |
| Missing application transcription implementation | Voice example supplies a complete fetch dependency and identifies the application-provided transcription endpoint. |
| Incomplete streaming demonstration | Chat's quickstart reads UTF-8 chunks, flushes the decoder, handles HTTP failures and honors cancellation; a browser test supplies a controlled streaming response and verifies displayed output. |
| Stale install and toolchain instructions | Published npm install, current Svelte peer, Node/Vite requirements, direct Motion dependency, supported compiler settings and both Tailwind recipes are documented. |
| Auth backend contract outside artifact | Auth ships the full default HTTP adapter contract: 27 routes, JSON fields, success statuses, error mapping, cookie and server responsibilities. |
| No reproducible external baseline | Core ships a runnable application with a pinned direct toolchain, dependency-injected reducer tests, lifecycle cleanup, SSR smoke and production browser tests. |
| Documentation regressions tolerated | Fixed public README/guide entries were removed from the typecheck exemption register. Private, unshipped skill entries are outside this consumer audit. |
| No external consumer release gate | `pnpm verify:consumer` packs and installs all eight packages outside the workspace, extracts marked README blocks verbatim, checks public types and runs the application. CI invokes it. Eight deliberate regressions must be rejected. |

## Measured validation

- All workspaces built and passed TypeScript and Svelte checks, including the
  added starter and updated graphics test fixture.
- **5,078 repository tests passed**: 2,493 core browser, 624 core Node and 1,961
  other package/example tests. Core's initial Node pass caught three tooling
  integration issues; they were corrected and its complete Node suite rerun.
  The initial log is retained as diagnostic evidence, not labelled a clean run.
- **6 auth browser integration tests passed**, using the repository's fixture
  backend (cookie persistence, HttpOnly, logout and OAuth flows).
- **53 public entry points** resolved from installed tarballs; three forbidden
  deep imports were rejected. The optional Mapbox runtime still requires its peer.
- **49 typed entry points** passed Bundler and NodeNext resolution with the
  documented `skipLibCheck` baseline.
- **49 packaged Markdown documents and 180 relative links** were checked.
- **21 files extracted verbatim from README examples**, including twelve Svelte
  components, passed strict Svelte Check with zero errors or warnings.
- The standalone starter passed with core alone: typechecking, **2 reducer
  tests**, SSR and **1 production browser test**, before installing satellites.
- **7 additional external reducer tests**, the combined SSR smoke and **4 production browser tests**
  passed. Browser coverage includes state/effects, editor input, chat transport,
  mounted satellite examples and light/dark styling in Tailwind 4 and Tailwind 3.
- **8 regression controls** were rejected: missing store export, obsolete editor
  option, obsolete map provider, wrong emitted action, array-shaped node state,
  missing node action lifting, obsolete audio factory option and missing guide.
- `git diff --check` passed.

Evidence and the resolved external dependency lockfile are in
[closure-evidence](./closure-evidence/summary.json). The consumer's temporary
application directory is recorded there; rerun the gate for a fresh reproduction.

## Release handoff

Commit and publish the repository documentation alongside the package release so
public homepage links expose these changes too. Publish from each package's
directory with pnpm after the normal gates, starting with core and publishing
code/media before chat. Do not use `pnpm publish <tarball>` with pnpm 9.
After publication, verify registry `latest` versions and repeat the external
handoff against those registry versions; tarball acceptance does not prove a
future registry upload completed.

Application-agent instruction:

> Use `@composable-svelte/core` and discover the satellite packages from its
> README. Read the installed `docs/consumer.md` and `docs/components.md`, and
> the relevant satellite README and declarations. Copy core's `consumer/`
> starter if beginning a new app. Use public exports only. For auth, implement
> the shipped HTTP contract or inject a custom adapter. Run check, test and
> build. No library source checkout or private skills are required.

## Scope of the result

This closes the concrete consumer audit findings and establishes a tested
starting point. It does not implement the deferred engine features listed in
the package catalog or certify an arbitrary generated application. The new
composable-runtime backend still needs its own contract/integration acceptance;
passing the auth fixture does not establish that compatibility. The consumer
smoke does not qualify SvelteKit hydration, real microphone/transcription,
provider credentials, remote media, GPU/map services or full accessibility and
performance. Build output retains upstream annotation/chunk-size warnings; no
consumer page exceptions occurred in the tested flows.
