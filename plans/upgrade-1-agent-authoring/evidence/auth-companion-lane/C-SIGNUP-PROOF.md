# Managed signup candidate proof

Status: local candidate with independent Opus review and final archive receipt. This extends the first accepted login/MFA slice; it does not qualify the remaining auth capability rows or claim a published package.

## Behavior and ownership

`createAuthFeature()` now owns an optional signup slot. Its reducer accepts a signup session through the same one-reduction accepted/refused handoff as login and MFA, retires the flow, and updates the persistent session. A verification-required result keeps the terminal signup state and pending email, without creating a session or handoff. The containing app routes only from the matching routed `verificationRequired` action after its auth child has reduced; later actions do not replay the route, and a new attempt for the same address is reported again. `email_taken`'s managed "Sign in instead" dispatches `signInRequested` through the genuine view and opens a fresh login.

The managed `SignupForm` accepts `PresentationView<SignupState, SignupAction>`, excludes the standalone session and callback props, renders nothing after retirement, and keys its `Form` subtree and form store by the captured view. Standalone props and callback handoff remain available. Component type proofs include `ComponentProps` and spread-injected illegal managed props.

Headless tests cover idempotent open, replacement, cancellation, logout, late results that ignore abort, verification with no session, accepted and refused handoff, parent routing, and exact slot types. A separate test nests the same auth composition in two parent slots, starts concurrent signup requests, settles different sessions, then retires one sibling while the other completes verification; the removed request is aborted and its late result is dropped.

## Source suite

- `pnpm --filter @composable-svelte/auth typecheck`: pass.
- `pnpm --filter @composable-svelte/auth check`: 0 errors, 0 warnings.
- `pnpm --filter @composable-svelte/auth exec vitest run`: 47 browser files, 754 tests passed.
- `pnpm --filter @composable-svelte/auth exec vitest run --config vitest.ssr.config.ts`: 4 files, 38 tests passed, including the real HTTP request-cookie isolation test.

## Physically installed consumer

The frozen core input was 0.13.0 local candidate SHA256 `230233b99c4f04117f302d3bb6a408ba3d13a347ee9694919c318a4a0a354355`. The final auth 0.2.1 local candidate is SHA256 `705962c52b665faaeea2092b379654fe96283004195b0001eb15672dddf345a8`. The runtime browser and SSR tests ran on the immediately preceding auth archive SHA256 `915db497c3e3f54b1b85b0186f55f4590c9e955cd2801f23460a2cfcbf350744`. An archive comparison showed exactly three changed files in the final archive: `CHANGELOG.md`, `dist/application/index.js` and `dist/application/index.d.ts`. The latter two contain only the module documentation comment correction. Final archive installation, lock integrity, type checks and builds were repeated on both pins.

In `/private/tmp/auth-only-min` and `/private/tmp/auth-only-current`, npm installed the auth and core tarballs as physical packages. Both lockfile SHA512 integrity entries match their tarballs. `npm ls` shows one deduplicated core and Svelte identity, pinned to 5.20.0 and 5.55.3 respectively. The installed auth package's `consumer/` tree matches the repository consumer byte for byte. For both pins, installed source passed `npm run check` (0 errors/warnings), `npm run build` (817 and 849 modules respectively), `npm run test:browser`, and `npm run test:ssr`.

The browser proof includes nested sibling login/MFA/signup forms, signup verification with no session, `email_taken` navigation to login, accepted signup handoff, and two verification attempts for the same email without replay on an unrelated action. The SSR consumer renders separate request roots. The Node HTTP test separately starts a real server and verifies that interleaved requests with different cookies receive only their own subject and do not render cookie values.

The first external Opus call from this task was rejected by automatic approval review because source disclosure authorization was not visible as a trusted direct user message here; a second call with a quote relayed from the parent was also rejected. The parent task, which has the original direct user authorization, ran the bounded independent Opus 5.5 review. It found no correctness defects and noted two documentation nits, both corrected in the final archive. The review report is in the parent lane at `plans/upgrade-1-agent-authoring/evidence/parent-lane-verification/auth-signup/OPUS-REVIEW.md`. It also asked whether the consumer browser script's later right-side "Sign in" precondition was supplied: the script opens right login near its start, asserts its form remains live after left login completes, and does not retire the right owner until that later step. Both installed browser runs passed that path.
