# @composable-svelte/auth

Client half of the identity substrate for Composable Svelte apps backed by
generated Composable Rust backends: a session store, subject helpers, and
thin guard components.

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
  {#snippet fallback()}<p>Please sign in.</p>{/snippet}

  <RoleGate store={session} roles={['admin']}>
    <AdminPanel />
    {#snippet fallback()}<p>Not authorized.</p>{/snippet}
  </RoleGate>
</AuthGuard>
```

## Session lifecycle

`unresolved → resolving → authenticated | anonymous`, plus
`loggingIn → authenticated | loginFailed` and `logout → anonymous`.
Failure paths are fail-closed: a failing session endpoint or logout call
lands the client in `anonymous`.

## Backend endpoints

| Call           | Endpoint            | Notes                                          |
| -------------- | ------------------- | ---------------------------------------------- |
| `fetchLogin`   | `POST /auth/login`  | `{ "user_id": ... }` → session JSON + cookie   |
| `fetchLogout`  | `POST /auth/logout` | server-side invalidation + cookie clear        |
| `fetchSession` | `GET /auth/session` | session JSON, or 401/204 when anonymous        |

Session JSON (`SessionSnapshot`, verbatim wire shape):
`{ "subject_id": "<uuid>", "display_name": "...", "roles": ["..."] }`.
