# @composable-svelte/auth

## [Unreleased]

### Changed

- **BREAKING: `AuthDependencies` gains `beginOAuth` and `completeOAuth`.** A
  hand-written adapter must add both. They are required rather than optional,
  because all eleven existing members are, and making them optional would push a
  null check into the flows. Consumers on `@composable-svelte/auth/flows` are
  unaffected: each flow's dependency interface names only the calls it makes, so
  an app that does not use OAuth never constructs the members.

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

- **`createHttpAuthDeps` and `authErrorFromResponse` on the root barrel**, beside
  `createHttpSessionDeps`, which was already there. They were reachable only
  through `./http`, which made the package's own documentation wrong about its
  API — every other subpath was already re-exported. `flat-barrel.test.ts` holds
  the rule now: for this package a subpath is a convenience, never the only way
  in.

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

- **`@composable-svelte/auth/flows` gains signup** — `signupReducer`,
  `createSignupStore`, `signupSchema`, `passwordCriteria`, and `SignupForm` /
  `PasswordCriteria` beside them.

  **Two terminal states, and both are successes.** A backend that requires email
  confirmation cannot return a session, and one that does not should not be
  forced into a second round trip — so `deps.signup` answers with a union,
  `{ kind: 'session' }` or `{ kind: 'verificationRequired' }`, rather than a
  nullable session. There is no field to forget to check. `awaitingVerification`
  leaves `error` null and replaces the form with a terminal panel; dispatching
  `sessionEstablished` there would sign in an account that cannot be used yet.

  **The password policy is length and nothing else**, following NIST 800-63B.
  Composition rules push people toward `Passw0rd!` — predictable substitutions
  on a short base — while a longer passphrase is stronger and easier to
  remember. `PasswordCriteria` is derived from the same constants the schema
  validates against, so the checklist cannot say "done" while the form
  disagrees; a test asserts they agree on every sample, and another fails if a
  character-class rule is ever added.

  `signupFormConfig` uses `mode: 'onBlur'` where sign-in uses `onSubmit`,
  because the confirm field is the one place a submit-only rule means retyping a
  password the user believed they had already entered twice. That is only
  possible since cross-field validation was fixed in core.

### Changed

- **`AuthError` gained `email_taken`** (8 arms → 9), and `409` maps to it.
  Signup's characteristic failure previously arrived as `unknown`, and the
  useful response to it is not a red banner but an offer — sign in instead, or
  reset the password. A surface cannot make that offer by reading prose.

  It leaks that an address is registered, which is the caller's call: a backend
  treating account existence as private should answer signup for a known address
  exactly as for an unknown one, and then this arm never arrives.

  `KNOWN_CODES` in the HTTP adapter is now keyed off `Record<AuthErrorCode, true>`
  rather than an array with `satisfies AuthErrorCode[]` — that form checks the
  values are assignable but not that they are exhaustive, so a new arm could
  have joined the union and simply never been accepted from a backend.

- **Email verification** — `emailVerificationReducer`,
  `createEmailVerificationStore`, `tokenFromUrl`, and `EmailVerification`.
  Signup's `awaitingVerification` terminal now has something that consumes the
  link it points at.

  **No form.** The input arrived in a URL, so the work starts on mount and the
  only thing a user can type is nothing. That removes the form slice and the
  schema — a token is opaque, and validating its shape here would reject links a
  future backend issues.

  **The token is single-use, so the request is guarded twice.**
  `verificationRequested` is refused unless the status is `idle`, and the
  component separately tracks which token it has already asked about. Both are
  wanted: one stops the dispatch, the other stops whatever gets past it. A
  Svelte effect re-runs for reasons unrelated to its subject, and a second
  exchange spends a working link and then reports the failure as the user's
  fault. Removing the component guard does not merely double-exchange — it
  hangs.

  **Confirming and resending are tracked separately**, because a failed
  confirmation with a resend in flight is the ordinary state of this page. A
  successful resend deliberately leaves the confirmation error alone: that link
  is still dead, and clearing it would be a lie the user acts on.

  `verifyEmail` resolving with `null` is a success — the address is confirmed
  and the user still has to sign in. Only a non-null session reaches the session
  store.

- **Password recovery** — `forgotPasswordReducer` / `ForgotPasswordForm` and
  `resetPasswordReducer` / `ResetPasswordForm`, completing the credentials
  family. The `<a href="/forgot">` this package has shown in its own README
  example since sign-in landed now points at something.

  **Asking for a link tells you nothing, on purpose.** `requestPasswordReset`
  resolves whether or not the address has an account, and the surface says "if
  there is an account for…" rather than confirming one. Distinguishing the two
  would make the form an account checker; a test asserts the two outcomes render
  *identical text*, because that is where the leak would actually appear.

  **Success is not terminal here**, unlike signup's. The message is conditional,
  so a user who mistyped their address needs the form still in front of them —
  it sits beside the form rather than replacing it, and each acceptance is
  reported so a second attempt is not swallowed.

  **Reset deliberately does not copy verification's token guards.** That flow
  exchanges on mount, so an effect that re-fires spends a single-use link;
  this one exchanges on submit, where there is no mount effect to re-fire. The
  fixed cancellation id every form flow has is the whole of it, and a comment
  says so, because copying the guards is the obvious mistake.

  A dead or missing link does not leave a form up that cannot succeed: both end
  in the same offer of a new link. `resetPassword` resolving with `null` is a
  success — the password changed, and the user signs in with it.

### Changed

- **The password policy moved to `flows/password-policy.ts`**, shared by signup
  and reset so a user cannot be told one thing creating an account and another
  recovering it. Every schema builds its password field from `passwordField()`
  rather than restating the rules. **No exported name moved** — the barrels
  re-export exactly as before. The coupling this fixes was already visible:
  `PasswordCriteria`, a component about passwords in general, was reaching into
  `flows/signup/schema.ts`.

- **OAuth** — `oauthStartReducer` / `OAuthSignIn`, `oauthCallbackReducer` /
  `OAuthCallback`, and the pending-record storage they share.

  **`sessionEstablished` finally has its fourth caller.** Its doc comment has
  named "an OAuth callback" since the action was created, its reducer case
  repeats the list, and `tests/session-established.test.ts` has an arm labelled
  *"The OAuth-callback shape"* — a handover designed for, commented, and tested
  against, with nothing on the other end of it. The same dangling-promise
  species as `challengeId`, which the MFA round closed.

  **Two flows, not one, because the two halves run in different page loads.** A
  full-page redirect destroys the store, so `oauth-start` and `oauth-callback`
  can never share one. A merged reducer would have been two state machines with
  no action connecting them.

  **The backend mints `state` and builds the authorize URL**, mirroring
  `beginMfaEnrolment`. Every id in this package is server-minted, and the party
  holding the client secret has to verify the nonce anyway — so there is **no
  PKCE crypto in the browser**. No `getRandomValues`, no `crypto.subtle`, no
  base64url encoder; writing them would have been the codebase's first Web
  Crypto use, to duplicate a mandatory server-side check. `OAuthStart` carries
  `authorizeUrl` and `state` and must never carry a `codeVerifier`: that would
  be a secret in `sessionStorage`, and this package's claim that the browser
  never holds OAuth secrets would stop being true.

  **The client-side `state` check is defence in depth, never the defence.** The
  backend binds `state` to the exchange. But the client gate does gate — a
  mismatch never reaches `completeOAuth` — rather than reporting after the fact.

  **`pendingOAuth` and `redirect` are deliberately not on `AuthDependencies`.**
  That interface is documented as the auth I/O whose every member reports
  failure by rejecting with an `AuthError`; storage and browser navigation are
  neither, and widening it to fit them would weaken a promise eleven other
  members keep. They live on `OAuthStartDependencies`.

  **The redirect is the only full-page navigation in the repository.** Nothing
  else anywhere calls `location.assign`, `location.href =` or `window.open`, and
  core's routing is `history.pushState`, which cannot cross an origin at all.
  It is injected so a `TestStore` can assert where the user was sent and a demo
  can show the URL instead of following it.

  **Two new `AuthError` arms**, `oauth_denied` and `oauth_state_mismatch`. The
  MFA round argued against widening the union because the recoveries were
  identical; here they differ. `oauth_denied` is the user pressing Cancel — a
  branch rendered as `role="status"`, never a red alert, the `mfa_required`
  lesson applied. `oauth_state_mismatch` carries **nothing but a message**: no
  nonce, and no hint of which of its three routes produced it, because naming
  that tells an attacker whether a sign-in was in progress. Reusing
  `token_expired` was considered and rejected — it is a backend verdict about a
  link, and surfaces branch on it to offer "send another".

  Security decisions worth naming, because each is invisible once it works:
  `returnTo` never crosses the wire and is normalised to a same-origin path, so
  a consumer reading it from their own query string cannot carry an open
  redirect through the flow; `?error=` is echoed only if it matches
  `/^[a-z_]{1,64}$/` and `error_description` is never rendered, because a banner
  in the app's own chrome showing attacker prose is a phishing surface;
  `authorize_url` is refused unless it is `http(s):`, in both the adapter and
  the redirect, because that value is handed to `location.assign`; and the
  provider used in the exchange comes from the stored record, never from the
  URL.

  `sessionStorage` rather than `localStorage`, and the strongest argument is
  correctness rather than secrecy: `localStorage` is shared between tabs, so a
  second tab starting a sign-in would clobber the first tab's nonce and the
  first tab's *legitimate* callback would then fail. Popups and `target=_blank`
  are unsupported for the mirror-image reason, which is why `OAuthSignIn`
  renders `<button>` and never `<a href>`.

  **No provider logos ship.** The `qr` precedent, plus a second reason specific
  to this: Google, GitHub, Apple and Microsoft each publish brand guidelines
  governing the mark, its clear space and the button wording, and vendoring them
  into an MIT package would make every consumer's trademark compliance this
  library's problem. An `icon` snippet takes whatever they already have.

- **MFA** — `mfaChallengeReducer` / `MfaChallengeForm`, `mfaEnrolmentReducer` /
  `MfaEnrolment`, and `OneTimeCodeInput`.

  **`challengeId` is finally read by something.** It has been on
  `mfa_required` since the union was created — its doc comment calls it "the
  reason this union exists at all" — and until now it was validated on arrival,
  carried through the login reducer, and rendered as a sentence in a red banner
  offering nowhere to type a code. `isMfaRequired` was exported with zero
  production callers.

  `LoginForm` gains `onMfaRequired`, which is that first caller. Supplying it
  also **suppresses the error banner**: being asked for a second factor is this
  flow branching, not a failure, and a red alert on the way to a code prompt is
  alarming and wrong. It reports once per *challenge*, not once per distinct
  challenge id — plenty of backends hand back the same pending challenge for a
  repeated sign-in, and keying on the id meant the second attempt did nothing
  visible at all: no callback, and no banner either, because it is suppressed. Optional, unlike `ResetPasswordForm`'s `onRequestNewLink`
  — MFA is off for most backends, so requiring it would break every consumer for
  a branch they never reach.

  **No new `AuthError` arm.** A wrong code is `invalid_credentials` and the form
  stays up; an expired challenge is `token_expired`, the form is withdrawn, and
  `onStartOver` is the way back. Those are the two recoveries that differ, and
  both codes already existed.

  **A recovery code is a different method, not a different field.** Switching
  clears the code and sends `method: 'recovery_code'` — and the switch is only
  offered when `methods` says the account has them.

  **Enrolment needs the guards reset-password deliberately does not.** It
  fetches on entry, so a re-firing effect starts a second enrolment and silently
  invalidates the secret the user is at that moment typing into their phone;
  both the reducer and the component refuse a repeat, and retrying is a button
  rather than anything the effect re-derives. Recovery codes are shown once,
  `onDone` fires when the *user* acknowledges them rather than when enrolment
  completes, and the two copy buttons track what was copied rather than sharing
  one flag — the panel must never tell someone the codes are saved when what
  they copied was the setup key.

  **`OneTimeCodeInput` is one field, not six** — reversing what the previous
  round said MFA would need. A single input with `inputmode="numeric"` and
  `autocomplete="one-time-code"` autofills from the OS, pastes with no handler,
  and has one label and one error; split boxes must re-implement paste and
  backspace and announce as six unlabelled inputs. `name` is required, as on
  every other input this package renders.

  **No QR encoder was added.** Nothing in the repository can produce one and
  there is no precedent for a satellite package computing SVG, so an encoder
  would be this package's second runtime dependency for something that is not
  its concern. `MfaEnrolment` renders the secret for manual entry and takes a
  `qr` snippet receiving `{ otpauthUri, secret }`.

### Still missing

Token refresh, account linking, and MFA *management* — disabling it or
regenerating recovery codes, which belong on an account-settings surface this package does
not have. The
`AuthError` union names the failures those flows produce because the wire
contract needs them — a code appearing there is not a promise that the flow
behind it ships today.
