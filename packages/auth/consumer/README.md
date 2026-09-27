# Installed managed auth consumer

This is a complete Svelte application using only public package exports. It
embeds one `createAuthFeature()` composition twice in a larger parent, declares
nested login, MFA, signup, password-recovery, email-verification, MFA
enrolment, MFA management, OAuth start, OAuth callback, magic-link request,
and magic-link sign-in views, and renders the existing forms in managed mode.
The parent reads each feature's accepted or refused one-reduction handoff, and
routes signup verification, a sent recovery link, a reset without a session, a
verified address without a session and a resend from the corresponding routed
action and feature state. It also routes each feature's `mfaOutcome` pulse:
`enrolmentAcknowledged` closes the enrolment and records the account as enrolled,
`disabled` and `recoveryCodesRegenerated` update the parent's account read, and
`reauthenticationRequired` records the operation for a "Confirm it's you and retry"
prompt that re-dispatches it to the same view. The parent's account read reaches
each nested `MfaManagementPanel` through `AccountScope` context, since a nested
view snippet sees only its own view. For OAuth, the parent routes `oauthOutcome`:
`signedIn` with session handoff and destination, `linkCompleted` without
establishing a session, and `failed` (denied or state mismatch) returning to
sign-in via `startOverRequested`. (The `mfaRequired` branch is routed by the
headless feature into the MFA challenge slot and tested in the package suite).
For magic links, the parent reads `magicLinkOutcome`: `requestSent` keeps the
sent confirmation on screen with a back-to-sign-in route. For `mfaRequired`,
the auth feature presents the MFA challenge and the parent records the outcome.
Sign-in session handoff is accepted via `handoff`
with source `'magicLinkSignIn'`. Missing or expired tokens offer a new link via
`requestNewLinkRequested`. For connected accounts, the parent routes `connectedAccountsOutcome`:
`unlinked` triggers a deliberate reload of the account read model, and
`reauthenticationRequired` records the demand for user re-authentication while keeping the
demand message visible. Provider linking reuses `oauthStart` via `startOAuthLink` (`intent: 'link'`)
wired to the supported `onLink` port. For change email, the parent routes `changeEmailOutcome`:
`requested` with pending address, `resent` confirmation, and `reauthenticationRequired` with backend-demanded methods.
For change email confirmation, the parent routes `changeEmailConfirmOutcome`: `confirmed` with address update and session preservation,
and `failed` with expired or unauthorized (401) error, routing 401 via `signInRequested` to a fresh sign-in flow.
For change password, the parent routes `changePasswordOutcome`: `changed` with rotated or retained session, and `reauthenticationRequired` with backend-demanded methods.
For delete account, the parent routes `deleteAccountOutcome`: `deleted` with parent session transition to anonymous, and `reauthenticationRequired` with backend-demanded methods, preserving the confirmation gate.
For session refresh, the parent embeds the managed `sessionRefresh` slot, routes `sessionRefreshOutcome`: `refreshed` with truthful new expiry propagation, `ended` on session invalidation preserving ended UI, and `failed` on transient error, while verifying owner attachment lifetime, restart, and close observables.
For cross-cutting primitives, the consumer exercises `AuthGuard` and `RoleGate` driven by persistent parent session state after child retirement, `PasswordInput` and `PasswordCriteria` accessibility and live evaluation, password policy enforcement (signup negative case installed; reset and short-existing sign-in are source-suite evidence), and installed `@composable-svelte/auth/http` transport with AbortSignal forwarding, `credentials: 'include'`, and structured error classification.
It can replace, remove, and restore the left auth owner while the right remains live.

Run this consumer against **installed packages**, not workspace aliases. Its
manifest pins core `0.14.0`, auth `0.4.0`, and the minimum Svelte
`5.20.0`. Copy it to a fresh directory outside the repository and run
`npm install`; to check the current Svelte pin, install `svelte@5.55.3` instead.
Do not bypass peer checks with `--force` or `--legacy-peer-deps`. Confirm that
`npm ls svelte @composable-svelte/core @composable-svelte/auth` reports one
deduplicated Svelte/core identity. Then run:

```sh
npm run check
npm run build
npm run test:browser
npm run test:ssr
```

The compile-only `src/Props.svelte` checks `ComponentProps` from the installed
Svelte components, including a spread-injected illegal session store. The
browser proof opens both nested forms, accepts a login handoff, refuses a login
handoff while logout is pending, and exercises left owner
replacement/removal/restoration while the right form stays live. For signup it
reaches the verification panel with no session, follows `email_taken`'s "Sign
in instead" to a login form, and accepts a signup session handoff. Recovery
proof keeps the form after a link request, accepts a repeated address, routes
sign-in, handles reset with and without a session, and offers a new link after
an expired reset. Verification proof covers a no-session route, a session
handoff, an expired link and a resend. MFA proof starts from a fresh load:
settings are refused before sign-in, so both sections sign in first. It waits
for the left account read before offering "Turn off", regenerates codes and
acknowledges them, and gets a re-authentication demand (still visible in the
panel) on the first disable. Logging out then retires the panel, and the
parent's account read and retry prompt go with it: after signing in again the
panel is unread with no stale prompt. A second demand is routed to a retry
that disables, then it enrols: the recovery codes stay on screen until "I have
saved them", and only that routes `enrolmentAcknowledged`, once. The right
section's MFA settings stay unread and untouched throughout. The parent scopes
each account read to its management panel, clearing it when the panel closes,
restarts, is retired by logout or an account switch, or its section is reset
or removed. OAuth proof starts provider authorization with captured redirect
and safe returnTo, handles empty callback parameters cleanly, verifies
callback sign-in session handoff, verifies provider link without session
mutation (authenticating in the same page lifecycle to prove zero new accepted
handoffs and unchanged subject), and exercises callback rejection (access denied
and state mismatch) routing start-over without rendering unverified error
strings. Magic-link proof verifies email submission showing confirmation
without session creation, non-vacuous outcome counts, back-button navigation returning to sign in,
magic-link sign-in requiring explicit user click before token exchange (asserting zero dependency
calls after opening and before click in that same page lifecycle, exactly one dependency call and one
accepted outcome after click, session handoff with source `'magicLinkSignIn'`), right sibling
completely unaffected, and missing token state rendering with request-new-link navigation. (The
MFA required branch is tested unit-level in the package suite). Connected-accounts proof verifies
truthful mount wait asserting "Reading your account…" with initial `fetchAccountCalls === 0` and mount call count reaching 1,
sibling isolation (right instance unaffected, and subsequently opened independently with its own read reaching 3 calls and verifying its own Google row and connect GitHub action),
Google re-authentication requirement on first attempt (demand staying visible in panel),
GitHub unlink succeeding immediately with outcome pulse, deliberate account reload (verified by fetch count reaching 2)
making GitHub available to connect, and connect GitHub reusing `onLink` to start provider OAuth linking (`intent: 'link'`)
with captured redirect to provider authorization and stored pending record (`intent: 'link'`). Sibling instances remain completely isolated.
Change-email proof verifies safe `email_taken` presentation without failure banner, re-authentication demand outcome,
request submission with pending email display and call counter verification, resend confirmation with `resent` outcome,
replay pulse prevention on unrelated feature actions, confirmation with live session preserving current session subject,
restart with expired token confirmation displaying error banner and `token_expired` outcome, signed-out confirmation
yielding 401 `invalid_credentials` and offering a "Sign in" route that transitions to login, missing token confirmation
truthfully requesting the link without making network calls, and right sibling remaining completely unaffected throughout.
Change-password proof verifies re-authentication demand outcome, valid password change with `retained` outcome and field clearing, rotated session subject mismatch rejection with `rejected:subjectMismatch` outcome and preserved session subject, same-subject rotated password change with `rotated` outcome, unchanged subject UUID and updated display name, and call counter verification.
Delete-account proof verifies the load-bearing confirmation gate with cancel dismissal making zero delete requests,
re-authentication demand on first attempt returning status to idle for truthful reconfirmation, successful deletion
on second attempt with `deleted` outcome and anonymous session transition, panel retirement, and right sibling remaining completely unaffected throughout.
The SSR proof renders separate request roots, recovery states and
missing-token verification, including missing and expired reset tokens, idle MFA
enrolment and management beside a second root holding recovery codes, OAuth
start and callback views, magic-link request and sign-in views across
isolated roots, connected accounts idle ("Reading your account…") vs loaded
(attached providers and disconnect buttons) across isolated roots, change-email request form
vs change-email confirmation instructions across isolated roots, and change-password request form
vs delete-account panel across isolated roots, and session-refresh across isolated roots, with counted MFA, OAuth, magic-link,
account, change-email, change-password, delete-account, and session-refresh dependencies that must see no call during SSR. It also verifies isolated `AuthGuard` and `RoleGate` rendering (authenticated member vs admin vs anonymous) and password guidance rendering without cross-request leaks. Browser and
SSR tests use `createMockAuthDeps`; this is a consumer proof, not a live
backend test.

`src/Props.svelte` also checks the managed and standalone `MfaEnrolment`,
`MfaManagementPanel`, `OAuthSignIn`, `OAuthCallback`, `MagicLinkRequestForm`,
`MagicLinkSignIn`, `ConnectedAccountsPanel`, `ChangeEmailForm`, `EmailChangeConfirmation`,
`ChangePasswordForm`, `DeleteAccountPanel`, and `SessionRefresh` props, rejecting `onDone`, `onChanged` and
`onReauthenticationRequired` on MFA views, rejecting `sessionStore`, `onSuccess`,
`onStartOver`, and `onMfaRequired` on managed OAuth views, rejecting
`sessionStore`, `onSent`, `onSuccess`, `onMfaRequired`, and `onRequestNewLink` on
managed magic link views, rejecting `onUnlinked` and `onReauthenticationRequired` on
managed connected accounts views, rejecting `onChanged`, `onReauthenticationRequired`,
`onConfirmed`, and `onSignIn` on managed change-email views, rejecting `sessionStore`,
`onChanged`, `onDeleted`, and `onReauthenticationRequired` on managed password/delete views,
and rejecting `sessionStore` on managed session-refresh views, while verifying `AuthGuard`, `RoleGate`,
`PasswordInput`, `PasswordCriteria`, and `OneTimeCodeInput` component props, genuine `PresentationView` ports, and `owner` keying.

Maintainer qualification only: before publication, maintainers replace the
core/auth pins with `file:` paths to the local release archives, install without
bypassing peer checks, confirm that both package-lock integrity entries match
those archives, and run the same four commands at both Svelte pins.

Earlier release-candidate evidence, not a record for the published versions: the
first MFA candidate of this recipe passed all four commands from physically
installed tarballs at both Svelte pins. On September 25, clean installed
verification fixtures built from later pre-release candidates (core 0.13.0,
auth 0.2.1 labels) also passed all four commands; the current-pin browser needed
one retry after Vite's first dependency reoptimization timed out before the
initial app button appeared. This document does not record a run against the
published core 0.13.1 and auth 0.3.0, nor against the current pins (core 0.14.0,
auth 0.4.0).
