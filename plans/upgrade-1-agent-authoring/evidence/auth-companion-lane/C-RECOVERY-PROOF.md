# Managed password recovery candidate proof

Status: reviewed local candidate. This extends the accepted login/MFA/signup slice; remaining auth inventory rows and publication are open.

## Headless behavior

`createAuthFeature()` now owns optional forgot-password and reset-password flows. Each open action is idempotent while any temporary auth flow is live; each restart action replaces the previous owner. `openResetPassword` and `restartResetPassword` explicitly seed the link token, including a missing `null` token. Cancel, logout and parent removal retire pending requests, and owner-stamped late feedback is dropped. A nested two-sibling test uses concurrent reset requests with the same fixed cancellation ID, removes one sibling, and confirms the other completes its accepted handoff independently.

The forgot-password flow keeps its form after a request is accepted, with the conditional `requestedFor` message. The parent reads that output only after the matching routed `requestSent` action; a later auth action cannot replay it, while a second accepted request for the same address is observable. It creates no session. A reset with a session enters the shared accepted/refused handoff with `source: 'resetPassword'`, updates the persistent session and retires the flow. A reset without a session keeps its terminal state and creates no handoff. The parent reads that result after a matching routed `resetSucceeded` action. An expired token keeps its structured error and offers a new-link transition; a missing token renders the same route without submitting a request. The feature has no app route of its own.

## Managed components and compatibility

`ForgotPasswordForm` and `ResetPasswordForm` accept genuine `PresentationView` ports in `mode="managed"`. Managed props exclude standalone output callbacks and session dispatch; reset also excludes a token prop because the feature's open action seeds it. Both forms render nothing after view retirement and key their `Form` subtree and captured form store to the view. Standalone props, token reconciliation and component effects remain available. Compile-only `ComponentProps` checks reject illegal managed callbacks, a spread-injected session store, a managed token, a plain store substituted for a view, and a retired view substituted for a standalone store.

The managed forgot-password form renders a theme-styled "Back to sign in" action with configurable `signInLabel` when no custom footer is supplied. A custom `footer` replaces that default action. A rendered test mounts both branches, checks there is no duplicate action, and verifies each route transition. Explicit sign-in and new-link actions can be sent while a request is pending; a headless test verifies that each retires its request owner, aborts it, and drops an abort-ignoring late result. A sent forgot-password flow remains live, so other open actions are refused until an explicit restart or in-form transition.

## Test receipt

- `pnpm --filter @composable-svelte/auth typecheck`: pass.
- `pnpm --filter @composable-svelte/auth check`: 0 errors, 0 warnings.
- Full Chromium suite: 47 files, 761 tests passed.
- Full SSR suite: 4 files, 38 tests passed, including real HTTP request-cookie isolation.
- Installed consumer at Svelte 5.20.0 and 5.55.3: `npm run check` (0/0), `npm run build`, `npm run test:browser`, `npm run test:ssr` all passed. The browser proves repeated same-address link requests, no replay on an unrelated action, navigation to sign-in, reset without a session, expired-link navigation and accepted reset session handoff. SSR renders two separate request roots and recovery flows with missing and expired tokens. It does not dispatch a request during render.

The physically installed fixtures are `/private/tmp/auth-recovery-min` and `/private/tmp/auth-recovery-current`. The core input remains local candidate SHA256 `230233b99c4f04117f302d3bb6a408ba3d13a347ee9694919c318a4a0a354355`. The final recovery auth 0.2.1 candidate archive is `/private/tmp/auth-recovery-candidate/composable-svelte-auth-0.2.1.tgz`, SHA256 `55deb3ec9bf9a511ab0a82c88ca8856fedcca134b6f34548269f72faeb0777f1`. Both fixtures installed that exact archive as a physical package. Each lockfile's SHA512 integrity matched both local tarballs, and `npm ls` showed one deduplicated core and Svelte identity (5.20.0 and 5.55.3). The archive's `consumer/` tree matched the repository source byte for byte. The final archive passed installed check/build/browser/SSR on both pins. Version labels identify local candidate bytes, not published packages.

The parent task ran the directly authorized independent Opus review. It found no blocking correctness defects and requested the footer/label/style and intent-policy clarifications above. A narrow follow-up Opus review accepted those corrections with no new correctness defect. It noted two non-blocking test gaps; both were closed without changing packed source: a reset `signInRequested` while its request is pending, and standalone forgot-password without a footer showing no managed sign-in button. Focused `auth-feature` and `managed-forms` Chromium tests then passed 62/62, and svelte-check remained 0/0. The broad suites above were not rerun for this narrow UI/docs/test delta. Repacking after the test-only additions produced the same auth SHA256.
