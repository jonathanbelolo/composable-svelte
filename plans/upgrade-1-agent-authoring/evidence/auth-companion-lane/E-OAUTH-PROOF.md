# Managed OAuth start and callback candidate proof

Status: locally qualified candidate; independent Opus 5.5 source review **clear to land**. This is the OAuth row of `A-INVENTORY.md`. Other auth inventory rows, parent integration, and publication remain open.

## Behavior and ownership

`createAuthFeature()` adds optional owned `oauthStart` and `oauthCallback` slots. Start parks provider, intent, nonce and safe return path in pending storage, then redirects. Callback consumes that record once, checks the returned state, and exchanges the code. Managed `OAuthSignIn` starts sign-in. Managed account linking is started by opening `oauthStart` and dispatching `authorizationRequested` with `intent: 'link'` through its genuine presentation view; this slice does not add a managed `ConnectedAccountsPanel`.

Sign-in uses the shared accepted/refused session handoff. Linking reports `linkCompleted` without establishing or replacing a session. Only a sign-in callback may route `mfa_required` to a live MFA challenge. A link callback with that error stays visibly failed and leaves the session untouched. A one-reduction `oauthOutcome` reports accepted sign-in, completed link, MFA requirement, or terminal failure. Replayed, premature, retired, or late exchange results cannot report a second outcome. A failed callback's “Start again” opens fresh sign-in, including after a link failure; there is no managed link retry route in this slice.

Pending storage defaults to one `sessionStorage` record per browser tab, shared among sibling auth instances in that tab. Callers needing distinct in-tab records must inject distinct pending stores. `returnTo` is normalised at default-storage read, callback exchange and state, and feature outcome boundaries, including when a custom store returns an unsafe URL. The provider's untrusted `errorDescription` is never rendered. SSR construction and rendering perform no OAuth redirect or exchange.

Tests cover genuine managed view binding, owned replacement and retirement, late results, replay pulses, sign-in and link separation, link `mfa_required` state and DOM, custom-store unsafe return paths, sibling composition, and SSR request isolation. The installed consumer exercises two nested auth instances, same-lifecycle session acceptance and identity checks across link callback, plus SSR.

## Exact local candidate and measured checks

- Committed base: `7443f09c38feedcb2bad9957b0899218842473d5`.
- Auth 0.2.1 qualified local archive: `/private/tmp/auth-oauth-qualified/composable-svelte-auth-0.2.1.tgz`, SHA256 `67db87ca9b802279c072bb11a575c8bff18c86c3b1d8036ffc6a5e1c5fb0cb7a`.
- Package `typecheck`: pass; package `check`: 0 errors, 0 warnings; package build: pass.
- Full package Chromium suite after runtime corrections: 50 files, 813 tests passed. Full SSR suite: 6 files, 44 tests passed. After the final docs and type-only test polish, focused managed OAuth Chromium tests passed 14/14, package check/typecheck passed, and `pnpm pack` rebuilt the package.
- Physical consumers: `/private/tmp/auth-oauth-min` (Svelte 5.20.0) and `/private/tmp/auth-oauth-current` (Svelte 5.55.3). Both installed the exact final archive offline. Their auth lockfile SHA512 entries match that archive, installed auth is not a symlink, and their consumer source trees match the package consumer source byte for byte. Both passed `npm run check` (0 errors, 0 warnings), `npm run build`, `npm run test:browser`, and `npm run test:ssr` on this final archive. Each has one deduplicated core and Svelte identity.

These are local candidate bytes, not registry publication.

## Independent source review

Initial independent Opus review found a link callback `mfa_required` route that entered sign-in MFA, and an installed browser link proof that could pass with a pre-reload count. Both were corrected and explicitly verified in the next review. That review found a documentation blocker claiming a managed link path through `ConnectedAccountsPanel`; the docs were corrected to describe the actual `oauthStartSlot` dispatch path. The follow-up Opus review in `/private/tmp/auth-oauth-release-independent-review.jsonl` returned **CLEAR TO LAND** after inspecting the source, tests, docs and physically packed candidate. It confirmed callback/session ownership, single-reduction outcomes, retirement, SSR no-work, safe return paths, the managed link failure panel, and the installed consumer proof.

The reviewer noted an incorrect type signature in the changelog, incomplete wording about the standalone callback reducer guard, and `any` casts in new tests. Those three documentation and test-only findings were corrected afterward. Their focused test, typecheck, check, and final installed archive gates passed as recorded above. The reviewer also noted that link failure currently returns to sign-in; that choice is documented and remains a possible future UX improvement.

Parent integration is pending.
