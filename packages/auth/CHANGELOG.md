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

- **`@composable-svelte/auth/flows`** — the headless sign-in flow:
  `loginReducer`, `createLoginStore`, `createInitialLoginState`, `loginSchema`
  and the state and action types. Markup-free, so a consumer with their own
  design system builds over the same machine.

  **The flow owns the submission, not the form**, and that is forced rather than
  stylistic. Core's `createFormReducer` catches whatever `config.onSubmit`
  throws and stores `error.message` — a string. Route the auth call through it
  and the union above is flattened on arrival: `mfa_required` loses its
  `challengeId`, `rate_limited` loses its delay, and the whole of this release
  buys nothing. So `onSubmit` is a no-op, the form's job ends at "these fields
  are valid", and the flow observes `submissionSucceeded` and makes the request.

  Two behaviours the form reducer does not provide. A second submit while the
  first is in flight **supersedes** it rather than racing — a fixed cancellation
  id, so two sign-ins cannot be resolved in whichever order the network picks.
  And editing any field clears the last failure, because core never clears its
  own `submitError` on `fieldChanged`, which otherwise leaves "Invalid
  credentials" sitting above the password being retyped.

- **`@composable-svelte/auth/http`** — `createHttpAuthDeps`, the Composable Rust
  adapter, which **reads the response body on failure**. Two layers, so another
  backend still gets something useful: status codes map as a baseline (401 →
  `invalid_credentials`, 423 → `account_locked`, 429 → `rate_limited` with the
  `Retry-After` header, 410 → `token_expired`), and an optional
  `{ error: { code, … } }` body overrides and enriches that — which is the only
  way `mfa_required` can carry a challenge id.

- **`LoginForm` and `PasswordInput`** — the styled layer, on the `components`
  subpath and the root barrel.

  `LoginForm` takes **both** stores. A completed sign-in has to cross from the
  flow to the session, and a required prop makes a forgotten wiring a compile
  error; composing into a parent reducer or injecting an `onSessionEstablished`
  callback both fail silently instead. The handoff fires once per successful
  sign-in, not once per dispatch.

  `PasswordInput`'s toggle is a real `<button type="button">`, tabbable, with
  `aria-pressed` and a label that changes between "Show password" and "Hide
  password". It is *not* `tabindex="-1"` like `Combobox`'s chevron: that one
  duplicates keyboard access the input already offers, and this one has no
  keyboard equivalent at all.

  Both ship **scoped CSS, not Tailwind classes**. The preset's content glob
  covers core's `dist` only, so a utility class in this package's `dist` is
  purged in every consuming app — the "renders transparent" defect the root
  CLAUDE.md opens with. Colours are `hsl(var(--token, fallback))`, so they
  follow core's theme and dark mode when its stylesheet is present and fall back
  when it is not.

- **`@composable-svelte/auth/testing`** — `createMockAuthDeps`, a backend-shaped
  fake. Every auth failure is server-side, so a demo or test that can only show
  the happy path shows almost nothing; this rejects with real `AuthError`
  shapes, including `mfa_required`, and honours the `AbortSignal` so a
  superseded sign-in stops pretending to work.

- **`createLoginStore`**, mirroring `createSessionStore`.

### Fixed in review

- **`LoginForm` detached silently when `flowStore` was replaced.** `Form`
  captures its store into context at init and `FormField` reads
  `$store.data[name]`, so both hold whatever object the component handed them on
  its first render. Delegating `subscribe` straight through pinned the
  subscription to the *first* store: the field went on showing the old data
  while dispatches went to the new one, and typing left the input uncontrolled —
  DOM holding one value, store another, nothing thrown. Recreating the store to
  reset a form is how a consumer meets that.

- **`createMockAuthDeps` ignored an already-aborted signal** unless `latencyMs`
  was above zero — and zero is the default. At the setting every test uses, a
  cancelled request resolved *successfully*, so a flow that had stopped
  cancelling would still have looked correct.

- **The default heading was `<h1>`.** This component is embeddable; an `<h1>`
  inside a page that already has one is a document-structure defect that renders
  identically to a correct one. It is `<h2>` now, with `headingLevel` for a
  dedicated `/login` page.

- **The in-flight state was announced to nobody.** Assistive technology skips a
  disabled control, so the button's label changing to "Signing in…" was silent.
  A `role="status"` region carries it.

- **The fields were disabled during the request** along with the button. That
  buys nothing — the credentials were captured at dispatch — and costs focus:
  submitting with Enter leaves focus in the password field, and disabling the
  focused element drops focus to `<body>`. Only the submit button is disabled,
  which the HTML spec says also suppresses implicit submission.

- Inputs carry `name` as well as `autocomplete`, which password-manager
  heuristics fall back to; the form's own styles no longer reach out of the
  component through a bare `:global` class.

### Still missing

Signup, password reset, email verification, MFA, OAuth and token refresh. The
`AuthError` union names the failures those flows produce because the wire
contract needs them — a code appearing there is not a promise that the flow
behind it ships today.
