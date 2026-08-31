# @composable-svelte/auth

## [Unreleased]

### Changed

- **BREAKING: `SessionState.error` is `AuthError | null`, not `string | null`.**
  `sessionResolveFailed`, `loginFailed` and `loggedOut` carry the same, and
  `AuthGuard`'s `fallback` snippet now receives the structured error.

  A sentence could not be branched on. Every failure arrived as
  `"Login failed (401)"`, because the HTTP layer discards the response body on
  non-2xx — so "wrong password", "confirm your email first", "this account is
  locked" and "now enter your second factor" were indistinguishable. The last of
  those is not a failure at all; it is the login flow branching, and there was
  nowhere to put the challenge id it needs.

  `AuthError` is a discriminated union of eight arms — `invalid_credentials`,
  `mfa_required`, `email_unverified`, `account_locked`, `rate_limited`,
  `token_expired`, `network`, `unknown` — each carrying its payload in typed
  fields rather than in prose a caller would have to parse back out.

  **Migration:** read `error.message` where you read `error`. A `fallback`
  snippet rendering `{error}` now renders `[object Object]`; use
  `{error?.message}`. Branch on `error.code` where you were matching strings.

  Every field in the union is a JSON primitive — `account_locked.until` is an
  ISO 8601 string, not a `Date`. Core hydrates SSR state with `JSON.stringify`,
  which turns a `Date` into a string while the type still claims `Date`, so
  `until.toISOString()` would typecheck and throw after hydration.

### Added

- **`sessionEstablished`** — a flow outside this store completing a sign-in.
  The session store owns "who am I"; it does not own every way of becoming
  someone. A credentials login, an MFA challenge, an OAuth callback and a magic
  link each need their own multi-step reducer, and all of them end with a
  `SessionSnapshot`. This is the handover.

  Refused in exactly one status, `loggingOut`: a slow sign-in resolving after
  the user has signed out would otherwise put them back in a session they left.
  Every other status yields to it, on the principle the `login` arm already
  states — explicit intent supersedes a background resolve.

- **`loginStarted`** — optional, and only about presentation: it moves the status
  to `loggingIn` so `AuthGuard` shows its pending branch while a flow works.

- **`@composable-svelte/auth/errors`** — the union, plus `toAuthError`,
  `isAuthError`, `isMfaRequired` and `retryDelaySeconds`. Errors are plain
  objects and `isAuthError` is structural, so they survive `structuredClone` and
  an SSR boundary; `instanceof` would survive neither.

  `retryDelaySeconds` returns `null` for failures that waiting does not fix, and
  refuses to invent a delay the backend did not state — guessing an interval is
  how a client turns one rate limit into several.

### Note on scope

The README's opening still says this package offers no password login, OAuth or
signup. That remains true *today*: this release is the foundation those flows
need, not the flows. The disclaimer comes off when they land, not before.
