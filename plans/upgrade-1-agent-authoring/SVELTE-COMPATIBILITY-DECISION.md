# Companion Svelte compatibility decision

Decision: 25 September 2026. This records the final release metadata requirement;
candidate version and peer edits are applied together at package freeze.

Each package has one implementation. Minimum-version and newer-version checks
are compatibility test points, not parallel implementations or release lines.
The selected newer qualification version is Svelte 5.55.3; that name does not
claim it is the latest registry release. Preserve the frozen test matrix rather
than changing its versions during qualification.

## Code requires Svelte 5.30

The Code lane established that its declared dependency range, `@xyflow/svelte`
`^1.4.1`, requires Svelte `^5.25.0`. Both the minimum dependency 1.4.1 and the
freshly resolved 1.7.0 carry that peer requirement. The installed Code/Media
fixture on Svelte 5.20 passed declarations, browser checks and client build but
failed SSR inside SvelteFlow with `$$render_inner is not defined`.

Svelte 5.25 is a dependency-metadata lower bound, not yet a supported runtime
minimum. Subsequent installed SSR rendering failed at 5.25 with both SvelteFlow
1.4.1 and 1.7.0, while declarations, client builds and browser checks passed.
Svelte 5.55.3 SSR passes. The proposed `^5.25.0` release floor was withdrawn.
A direct SvelteFlow-only reproduction confirmed the same failure after a
production Vite SSR build and Node render, with no Code or Media component
involved and one deduplicated Svelte/core installation. This is not the earlier
middleware transformation problem.

The complete installed Code/Media fixture now passes on **Svelte 5.30.0** with
both SvelteFlow 1.4.1 and 1.7.0: dependency-tree validation, Svelte check with
zero errors/warnings, client build, two Chromium tests, production SSR build,
and Node rendering. The newer Svelte 5.55.3 fixture also passes. The final Code
release will therefore declare **`svelte: ^5.30.0`**, a conservative verified
minimum. No claim is made about every historical patch between 5.25 and 5.30.

The previous `^5.20.0` promise is unsupported by the dependency contract. Qualification must
include functional type, browser, client-build and SSR checks with Svelte 5.30
and both the minimum and freshly resolved SvelteFlow versions, plus the selected
newer Svelte version. Successful installation with `--legacy-peer-deps` alone is
not compatibility evidence; record the resolved tree and peer validation too.

Core and Media have independently passed Svelte 5.20 checks. This Code finding
does not raise the floor for those packages or for Chat by itself. Each remaining
package retains only the floor supported by its own dependencies and evidence.
A combined app uses the intersection of all installed package peer ranges, so
the combination containing Code needs at least the qualified Svelte 5.30 floor.

## Release and reference obligations

- Apply the Code peer correction with the final coordinated versions, before
  exact checker profile pins and final artifact qualification.
- Keep the failed 5.20 Code SSR result as evidence explaining the corrected
  promise; do not classify it as a passing or supported configuration.
- Describe the minimum and selected newer versions clearly in package recipes.
- Do not raise other package minimums solely to make all manifests identical.
- Checker parser dependencies and the Svelte version approved for a consumer
  profile are separate explicit identities; qualify their actual pairing.

Evidence owner: Lane 1 — Code, media and chat integration. Final hashes and
runtime results belong in the immutable Code handoff and parent verification
receipt. The final versioned archives still need the coordinated release checks;
this decision records the completed compatibility checks on local candidates.
