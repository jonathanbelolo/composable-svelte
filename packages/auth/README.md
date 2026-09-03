# @composable-svelte/auth

Client half of the identity substrate for Composable Svelte apps backed by
generated Composable Rust backends: a session store, subject helpers, and
thin guard components.

> **Still narrower than its name.** What exists: session resolution,
> seeded-user passwordless login, **password sign-in**, **signup**, **email
> verification**, **password recovery**, **MFA** (challenge and enrolment),
> **OAuth** (redirect and callback), **magic links** (request and sign-in) and
> the **account** surface — an account read model, changing or setting a
> password, signing out, **MFA management** (turning it off, reissuing recovery
> codes) and **connected accounts** (attaching and detaching OAuth providers).
> Headless flows, HTTP adapter and styled components throughout — including
> changing an email address, deleting an account, and session-lifetime
> management over a server-owned cookie.
>
> The `AuthError` union names failures the backend contract needs, and a code
> appearing there is still not a promise that a flow behind it ships. Check
> `src/lib/flows/` before telling anyone a flow exists.
>
> The HTTP adapter speaks to one backend shape (Composable Rust). Every
> dependency is injected, so another backend supplies its own object — but only
> the one adapter is written.



## Design

- **All auth I/O lives in store effects** over injected dependencies
  (`fetchLogin` / `fetchLogout` / `fetchSession`). Components never own async.
- **The client never touches cookies.** The session cookie is HttpOnly and
  server-owned; the store learns who the caller is by resolving the session
  endpoint (`credentials: 'include'` on every request).
- **Subject mirrors the backend wire shape.** The backend's
  `Subject::Authenticated { id, attributes }` / `Subject::Anonymous` maps to
  the `Subject` TS union, with roles at `attributes["roles"]` — the same
  convention the generated authorization gates read.
- **`AuthGuard`/`RoleGate` are UX gating ONLY.** Hiding children client-side
  is a courtesy, not a security boundary — enforcement is the backend's
  authorization gates, which re-check every request against the session.

## Installation

```bash
npm install @composable-svelte/auth
# or
pnpm add @composable-svelte/auth
```

`@composable-svelte/core` and `svelte` are peer dependencies. The components are
styled with scoped CSS over core's theme tokens, so they follow a consumer's
theme when core's stylesheet is loaded and fall back to sane defaults when it is
not — no Tailwind wiring needed for this package specifically. See the
["Styling & Theming"](../core/README.md#styling--theming) section of core's
README for the wider setup.

## Usage

```typescript
import {
  createSessionStore,
  createHttpSessionDeps
} from '@composable-svelte/auth';

// Real HTTP deps (same origin); tests inject mocks instead.
const session = createSessionStore(createHttpSessionDeps());

// At app startup: resolve the current session.
session.dispatch({ type: 'resolveSession' });

// Seeded-user login (passwordless picker semantics).
session.dispatch({ type: 'login', seededUserId: 'seeded-agent' });

// Server-side session invalidation.
session.dispatch({ type: 'logout' });
```

### Password sign-in

Two stores, not one. The session store owns "who am I"; the flow store owns one
sign-in attempt — its fields, its request, and the structured failure that comes
back. They are separate because `SessionStatus` already has seven values that
`AuthGuard` and `RoleGate` switch on exhaustively, and folding
`mfaRequired`/`pendingVerification`/`passwordResetSent` into it would mean every
consumer's guard branches change each time a flow is added.

```typescript
import { createSessionStore, createLoginStore } from '@composable-svelte/auth';
import { createHttpAuthDeps } from '@composable-svelte/auth/http';

// One dependency object drives both: the session calls and the flow calls.
const deps = createHttpAuthDeps();

const session = createSessionStore(deps);
const login = createLoginStore(deps);
```

```svelte
<script lang="ts">
  import { LoginForm } from '@composable-svelte/auth';
  import { login, session } from './stores';
</script>

<LoginForm
  flowStore={login}
  sessionStore={session}
  onSuccess={() => history.pushState({}, '', '/')}
>
  {#snippet footer()}
    <a href="/forgot">Forgot your password?</a>
  {/snippet}
</LoginForm>
```

The heading defaults to `<h2>`, because the component is meant to be embedded;
pass `headingLevel={1}` on a dedicated `/login` page, or your own `header`
snippet.

`LoginForm` takes both stores rather than one, and that is deliberate: a
completed sign-in has to cross from the flow to the session, and making that
crossing a required prop turns a forgotten wiring into a compile error. The
alternatives — composing the flow into a parent reducer, or an
`onSessionEstablished` callback — both fail silently instead: the sign-in
succeeds, the session never updates, and nothing typechecks against it.

The failure is structured, so a surface can branch on it:

```typescript
import { retryDelaySeconds, type AuthError } from '@composable-svelte/auth';

function whatToOffer(error: AuthError): string {
  switch (error.code) {
    case 'mfa_required':
      return `second factor: ${error.methods.join(', ')} (challenge ${error.challengeId})`;
    case 'email_unverified':
      return 'offer to resend the verification email';
    case 'rate_limited':
      // `null` when the backend stated no delay — the client does not invent one.
      return `wait ${retryDelaySeconds(error) ?? 'a while'}s`;
    case 'account_locked':
      // Offer no retry button at all.
      return error.until ? `locked until ${error.until}` : 'locked';
    default:
      return error.message;
  }
}
```

**Headless is the supported path too.** `LoginForm` is the reference rendering,
not the only one. `@composable-svelte/auth/flows` exports `loginReducer`,
`loginSchema` and the state and action types, so a consumer with their own
design system builds their own markup over the same machine — and the reducer
tests still apply to it.

**Styling.** These components ship scoped CSS, not Tailwind classes, because the
Tailwind preset's content glob covers `@composable-svelte/core`'s `dist` only —
a utility class in this package's `dist` would be purged in your app and the
form would render unstyled. Colours are written as
`hsl(var(--card, 0 0% 100%))`, so they follow core's theme tokens and its dark
mode when core's stylesheet is loaded, and fall back to sane defaults when it is
not.

```svelte
<script lang="ts">
  import { AuthGuard, RoleGate } from '@composable-svelte/auth';
  import { session, nav } from './stores';
</script>

<AuthGuard store={session} onAnonymous={() => nav.dispatch({ type: 'navigate', to: '/login' })}>
  {#snippet pending()}<p>Loading…</p>{/snippet}
  {#snippet fallback({ error })}<p>Please sign in. {error?.message ?? ''}</p>{/snippet}

  <RoleGate store={session} roles={['admin']}>
    <AdminPanel />
    {#snippet pending()}<p>Checking…</p>{/snippet}
    {#snippet fallback()}<p>Not authorized.</p>{/snippet}
  </RoleGate>
</AuthGuard>
```

## Session lifecycle

`unresolved → resolving → authenticated | anonymous`, plus
`loggingIn → authenticated | loginFailed` and `logout → anonymous`.
Failure paths are fail-closed: a failing session endpoint or logout call
lands the client in `anonymous`. Two deliberate exceptions to "everything
falls to anonymous":

- **A failed re-login restores the prior session.** When a login fails while
  a previously-authenticated session existed, the store returns to
  `authenticated` with that subject and surfaces the error — the server only
  replaces the session cookie on a successful login, so the old session is
  still valid. `loginFailed` is reached only when there was no prior session.
- **`AuthGuard` is stale-while-revalidate.** While *any* operation is in
  flight with a retained authenticated subject — a background resolve, an
  account switch, a logout — children stay rendered (the snippet receives
  `isRevalidating: true`); the pending snippet shows only when there is no
  authenticated subject to keep showing. `AuthGuard`'s `fallback` receives
  `{ error }` — an {@link AuthError} or `null`, so a sign-in surface can branch
  on `error.code` rather than read a sentence.
- **`RoleGate` distinguishes "denied" from "not yet known".** Until the
  session resolves it renders `pending` (or nothing), never `fallback` — "not
  authorized" is a claim about a resolved session.

Feedback attribution is epoch-pinned: every initiator bumps a monotonic
`epoch` and feedback applies only when both status and epoch match, so a
superseded request's late response can never clobber newer state (e.g.
resolve → logout → resolve, or slow login A → logout → login B).

## Backend endpoints

The three session calls are below. The other nineteen — everything
`createHttpAuthDeps` adds — are specified, and implemented, in
[`examples/auth-server`](../../examples/auth-server): a Fastify reference
backend this package's integration suite runs against. Its README is the
endpoint table for the full surface, including which statuses mean what and the
four traps that fail silently.

| Call           | Endpoint            | Notes                                          |
| -------------- | ------------------- | ---------------------------------------------- |
| `fetchLogin`   | `POST /auth/login`  | `{ "user_id": ... }` → session JSON + cookie   |
| `fetchLogout`  | `POST /auth/logout` | server-side invalidation + cookie clear        |
| `fetchSession` | `GET /auth/session` | session JSON, or 401/204 when anonymous        |

Session JSON (`SessionSnapshot`, verbatim wire shape):
`{ "subject_id": "<uuid>", "display_name": "...", "roles": ["..."] }`.
A 2xx body is runtime-validated (`subject_id` string; `roles` an array when
present, and it may be absent) — a malformed payload throws
`MalformedSessionError` and is treated as a failure, never fail-open
authenticated. That includes a 2xx whose body is not JSON at all, which is
what an HTML proxy error page or an SPA index fallback looks like.

### Deployment notes

- **Same-site only.** The backend issues the session cookie with
  `SameSite=Lax`, so a `createHttpSessionDeps(baseUrl)` pointing at a
  different site will never carry the cookie — use the same origin (default)
  or a same-site host (e.g. an API subdomain of the app's registrable
  domain).
- **`POST /auth/login` is dev/preview only.** The seeded-login endpoint is
  compiled out of production backend builds; production sign-in goes through
  the backend's real identity flows.
- **A session can end without the client being told.** A backend *may*
  advertise when it lapses, in `expires_at`; when it does, that reaches
  `SessionState.expiresAt` and the `session-refresh` flow extends the session
  before the user hits a wall.

  It is advisory, and it is not the whole story: a session ends for reasons no
  expiry anticipates — an administrator revoked it, a deploy flushed the store,
  an absolute cap was reached mid-request. The backstop is a 401 from any
  domain API call, and `createUnauthorizedHandler` turns that into a
  `resolveSession` for you. It coalesces, so a page firing a dozen requests
  that all 401 dispatches one re-resolve rather than a dozen.

  **There is no bearer token and there must not be one.** The session cookie is
  HttpOnly and server-owned; a refresh token reachable by JavaScript is
  exfiltrable by any XSS, which is exactly what that design avoids. "Refresh"
  here means asking the server to extend the session it already holds.

## Examples

Every flow in this package has a working demo in the styleguide, each driving a
real reducer over `createMockAuthDeps` so no backend is needed:

```bash
cd examples/styleguide
pnpm install
pnpm dev
```

Then open **Login Form**, **Signup Form**, **Email Verification**, **Password
Recovery**, **Multi-Factor Auth**, **OAuth Sign-In**, **Magic Link** or
**Account** — all under *Form Components - Advanced*.

Those demos run on `createMockAuthDeps`. For every flow wired to a **real
backend** — a real session cookie, a real OAuth redirect — see
[`examples/auth-server`](../../examples/auth-server), whose `pnpm dev` serves a
reference client against a reference server. The **Account** demo is
the signed-in half: the read model, changing a password, MFA management and
connected accounts, each with its re-authentication branch reachable from a
scenario picker.

## Related Packages

- [`@composable-svelte/core`](../core) - Core Composable Architecture, and the
  form system these flows are built on

## Resources

- [Architecture & tutorial guide](../../guides/README.md)
- [CHANGELOG](./CHANGELOG.md)
- [Contributing](../../CLAUDE.md)
