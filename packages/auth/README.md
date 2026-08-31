# @composable-svelte/auth

Client half of the identity substrate for Composable Svelte apps backed by
generated Composable Rust backends: a session store, subject helpers, and
thin guard components.

> **This is not a general-purpose auth library.** It speaks to one backend
> shape and offers seeded-user, passwordless login — there is no password
> login, no OAuth, no signup and no token refresh, and none is planned here.
> The package name is broader than the package. If you are looking for
> general authentication for a Svelte app, this is not it.



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
- **Sessions expire server-side with no client signal.** Sessions carry a
  server-side TTL; the client receives no expiry event, so an
  `authenticated` store can be stale. The consumer's hook is a 401 from any
  domain API call — dispatch `resolveSession` to re-sync.
