---
name: composable-svelte-auth
description: Sessions, sign-in flows and auth guards for Composable Svelte. Use when implementing login, signup, password reset, email verification, MFA, OAuth, role gating, or any session-aware UI. Covers the session store, the AuthError union, headless flow reducers, LoginForm/PasswordInput/AuthGuard/RoleGate, the backend-agnostic dependency surface and its HTTP adapter, from the @composable-svelte/auth package.
---

# Composable Svelte Auth

Client half of the identity substrate: one session store, one flow store per
sign-in attempt, a structured failure union, and thin components over both.

---

## PACKAGE OVERVIEW

**What exists today.** Session resolution, seeded-user passwordless login,
password sign-in end to end (headless flow, HTTP adapter, styled form), the
`AuthError` union, `AuthGuard` / `RoleGate` / `LoginForm` / `PasswordInput`, a
mock dependency set, SSR coverage.

**What does not exist yet.** Signup, password reset, email verification, MFA,
OAuth, token refresh. The `AuthError` union already *names* the failures those
flows produce (`mfa_required`, `email_unverified`, `token_expired`) because the
wire contract needs them — **a code appearing in the union is not a promise that
the flow behind it ships.** Check `src/lib/flows/` before telling a user a flow
exists.

**Entry points.** `.`, `./subject`, `./errors`, `./session`, `./flows`,
`./components`, `./http`, `./testing`. Everything on the root barrel too.

> ⚠️ **`AuthGuard` and `RoleGate` are UX gating only.** Hiding children
> client-side is a courtesy, not a security boundary. Enforcement is the
> backend's authorization gates, which re-check every request. Never present
> them as security in documentation or in conversation with a user.

---

## THE TWO STORES

**The single most important thing in this package.** The session store owns
"who am I". A flow store owns *one attempt* to become someone.

They are separate on purpose. `SessionStatus` has seven values, and both
`AuthGuard` and `RoleGate` switch on it exhaustively — so folding
`mfaRequired` / `pendingVerification` / `passwordResetSent` into it would change
every guard branch in every consumer app each time a flow was added. Instead each
flow is its own reducer that ends by handing a `SessionSnapshot` across.

```typescript
import { createSessionStore, createLoginStore } from '@composable-svelte/auth';
import { createHttpAuthDeps } from '@composable-svelte/auth/http';

// One dependency object drives both: the session calls and the flow calls.
const deps = createHttpAuthDeps();

const session = createSessionStore(deps); // who am I
const login = createLoginStore(deps); // one sign-in attempt
```

The handoff is `sessionEstablished`, and `LoginForm` performs it. Doing it by
hand looks like this:

```typescript
import { createLoginStore, createMockAuthDeps } from '@composable-svelte/auth';

const flow = createLoginStore(createMockAuthDeps());

// After the flow reaches `succeeded`, hand its snapshot to the session store.
const snapshot = flow.state.session;
if (snapshot) {
	// session.dispatch({ type: 'sessionEstablished', session: snapshot });
}
```

---

## SESSION STORE

### Status

```typescript
import type { SessionStatus } from '@composable-svelte/auth';

const all: SessionStatus[] = [
	'unresolved', // nothing asked yet
	'resolving', // a resolve is in flight
	'authenticated',
	'anonymous',
	'loggingIn',
	'loginFailed',
	'loggingOut'
];
```

### The lifecycle

```typescript
import { createSessionStore, createHttpSessionDeps } from '@composable-svelte/auth';

const session = createSessionStore(createHttpSessionDeps());

// At app startup, and on window focus if you want revalidation.
session.dispatch({ type: 'resolveSession' });

// Seeded-user login (passwordless picker semantics).
session.dispatch({ type: 'login', seededUserId: 'seeded-agent' });

// Server-side session invalidation.
session.dispatch({ type: 'logout' });
```

### Rules the reducer enforces — do not re-implement these

- **Epoch-guarded feedback.** Every initiator stamps an epoch; late feedback
  from a superseded request is discarded. Do not add your own request-id
  bookkeeping on top.
- **Fail-closed.** A resolve that errors goes to `anonymous`, not to a retry
  loop. A logout whose server call failed still goes anonymous, recording the
  error.
- **`sessionEstablished` is refused in exactly one status, `loggingOut`.** A
  slow sign-in landing after the user hit sign-out must not put them back in a
  session they left. Every other status yields to it.
- **`loginStarted` is presentation only** — it moves the status to `loggingIn`
  so `AuthGuard` shows its pending branch. See the warning under `LoginForm`
  before dispatching it.

### The client never touches cookies

The session cookie is HttpOnly and server-owned. The store learns who the caller
is by resolving the session endpoint with `credentials: 'include'`. Never write
code that reads or sets an auth cookie in the browser.

---

## STRUCTURED ERRORS

`SessionState.error` and every flow's `error` are `AuthError | null` — a
discriminated union, not a string. This is the enabling design of the package:
"wrong password", "confirm your email", "this account is locked" and "now enter
your second factor" are different outcomes, and the last is not a failure at all.

Eight arms: `invalid_credentials`, `mfa_required`, `email_unverified`,
`account_locked`, `rate_limited`, `token_expired`, `network`, `unknown`.

```typescript
import { retryDelaySeconds, type AuthError } from '@composable-svelte/auth';

function whatToOffer(error: AuthError): string {
	switch (error.code) {
		case 'mfa_required':
			// The only place `challengeId` can live. A string error loses it.
			return `second factor: ${error.methods.join(', ')} (${error.challengeId})`;
		case 'email_unverified':
			// Resend to the address in the error, not the one in the field.
			return error.email ? `resend to ${error.email}` : 'resend verification';
		case 'account_locked':
			return error.until ? `locked until ${error.until}` : 'locked';
		case 'rate_limited':
			// `null` when the backend stated no delay — never invent one.
			return `wait ${retryDelaySeconds(error) ?? 'a while'}s`;
		default:
			return error.message;
	}
}
```

### Invariants

- **Every field is a JSON primitive.** `account_locked.until` is an ISO 8601
  **string**, not a `Date`. Core hydrates SSR state with `JSON.stringify`, which
  turns a `Date` into a string while the type still claims `Date` — so
  `until.toISOString()` would typecheck and throw after hydration. Do not add a
  `Date`, `Map`, `Set` or class instance to this union.
- **They are plain objects, and `isAuthError` is structural.** They survive
  `structuredClone` and an SSR boundary; `instanceof` would survive neither.
- **`retryDelaySeconds` returns `null`** for failures waiting does not fix, and
  refuses to invent a delay the backend did not state.

```typescript
import { isAuthError, isMfaRequired, toAuthError } from '@composable-svelte/auth';

// `toAuthError` passes an `AuthError` straight through, so a dependency that
// classified its own failure keeps that work.
const error = toAuthError(new Error('the backend fell over')); // -> code: 'unknown'
const structural: boolean = isAuthError(error);
const branch: boolean = isMfaRequired(error);
```

---

## THE SIGN-IN FLOW

### The flow owns the submission, not the form

**This is forced, not stylistic, and the single most likely thing to get wrong
when adding a flow.** Core's `createFormReducer` catches whatever
`config.onSubmit` throws and stores `error.message` — a string. Route the auth
call through it and the union above is flattened on arrival: `mfa_required`
loses its `challengeId`, `rate_limited` loses its delay.

So `onSubmit` is a **no-op**, the form's job ends at "these fields are valid",
and the flow reducer observes `submissionSucceeded` and makes the request.

```typescript
import { loginFormConfig, loginSchema, emptyLoginFields } from '@composable-svelte/auth';

// `onSubmit` is deliberately empty; `mode: 'onSubmit'` because red-flagging a
// password while someone types it is hostile — they know it is incomplete.
const config = loginFormConfig;
const fields = emptyLoginFields; // { email: '', password: '', rememberMe: false }
const schema = loginSchema;
```

### What the flow adds that the form reducer does not

- **A second submit supersedes the first.** A fixed cancellation id
  (`Effect.cancellable` with a constant), so two sign-ins cannot be resolved in
  whichever order the network picks.
- **Editing any field clears the last failure.** Core never clears its own
  `submitError` on `fieldChanged`, which otherwise leaves "Invalid credentials"
  sitting above the password being retyped.
- **`loginFailed` returns to `idle`, not to a `failed` status.** The form is
  usable again and the error is what says something went wrong; a second status
  would be a second source of truth for the same fact.

### State shape

```typescript
import type { LoginState, LoginStatus, LoginAction } from '@composable-svelte/auth';

const statuses: LoginStatus[] = ['idle', 'submitting', 'succeeded'];

function readFlow(state: LoginState) {
	return {
		status: state.status,
		error: state.error, // AuthError | null — structured
		session: state.session, // SessionSnapshot | null, once one exists
		email: state.form.data.email // core's FormState, scoped
	};
}

const actions: LoginAction[] = [
	{ type: 'errorDismissed' } // dismiss the banner without touching the fields
];
```

---

## COMPONENTS

### LoginForm

```svelte
<script lang="ts">
  import { LoginForm } from '@composable-svelte/auth';
  import { login, session } from './stores';
</script>

<LoginForm
  flowStore={login}
  sessionStore={session}
  headingLevel={1}
  onSuccess={() => history.pushState({}, '', '/')}
>
  {#snippet footer()}
    <a href="/forgot">Forgot your password?</a>
  {/snippet}
</LoginForm>
```

**It takes both stores, deliberately.** A completed sign-in has to cross from
the flow to the session, and a required prop makes a forgotten wiring a compile
error. The alternatives — composing the flow into a parent reducer, or an
`onSessionEstablished` callback — both fail *silently*: the sign-in succeeds and
the session never updates, with nothing to typecheck against.

Behaviours that are load-bearing and have tests pinning them:

- The handoff fires **once per sign-in**, not once per dispatch, and not once
  per lifetime — a form that survives a sign-out signs in again correctly.
- The submit button is genuinely `disabled` while in flight, which also
  suppresses implicit submission, so Enter cannot get around it.
- The **fields stay live** during the request. Disabling them buys nothing and
  drops focus to `<body>` when the user submitted with Enter.
- `headingLevel` defaults to **2**, because the component is embeddable. Pass
  `1` on a dedicated `/login` page.
- Ids come from `$props.id()`, so two forms on one page do not collide.

### PasswordInput

```svelte
<script lang="ts">
  import { PasswordInput } from '@composable-svelte/auth';
  let value = $state('');
</script>

<label for="new-password">New password</label>
<PasswordInput
  id="new-password"
  name="password"
  {value}
  autocomplete="new-password"
  invalid={value.length > 0 && value.length < 8}
  errorId="new-password-error"
  oninput={(event) => (value = event.currentTarget.value)}
/>
```

`value` is one-way — **there is no `bind:value`**. The store is the source of
truth and `oninput` round-trips each keystroke through it, which is what keeps a
flow reducer able to validate, clear an error, or reject a change.

The show/hide toggle is a real `<button type="button">`, **tabbable**, with
`aria-pressed` and a label that changes between "Show password" and "Hide
password". It is deliberately *not* `tabindex="-1"` like `Combobox`'s chevron:
that one duplicates keyboard access the input already offers, and this one has
no keyboard equivalent at all.

A standalone password field (change-password screens) needs a hidden username
input with `autocomplete="username"` beside it, or password managers have
nothing to file the credential against.

### AuthGuard and RoleGate

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
    {#snippet fallback()}<p>Not authorized.</p>{/snippet}
  </RoleGate>
</AuthGuard>
```

`AuthGuard` is **stale-while-revalidate**: it keeps rendering children whenever
there is an authenticated subject, including during `resolving`, `loggingIn` and
`loggingOut`. A background re-resolve or an account switch does not blank an
already-authenticated UI. `pending` is for when there is no subject to keep
showing.

> ⚠️ **Do not dispatch `loginStarted` from a sign-in surface rendered inside
> `AuthGuard`'s `fallback`.** It moves the session to `loggingIn`, which the
> guard renders as `pending` — the form would unmount itself mid-submit. That is
> why `LoginForm` does not dispatch it. An app whose sign-in surface sits
> *outside* the guard can opt in with an effect on the flow's status.

---

## DEPENDENCIES AND THE HTTP ADAPTER

Every call is injected. The package is backend-agnostic; the Composable Rust
adapter is one implementation.

```typescript
import type { AuthDependencies, LoginCredentials } from '@composable-svelte/auth';
import type { SessionSnapshot } from '@composable-svelte/auth';

// A backend of another shape supplies its own object.
const custom: AuthDependencies = {
	async login(credentials: LoginCredentials, signal?: AbortSignal) {
		void credentials;
		void signal;
		return { subject_id: 'u1', display_name: 'Ada', roles: ['member'] } satisfies SessionSnapshot;
	},
	async fetchLogin(seededUserId: string) {
		void seededUserId;
		return { subject_id: 'u1' } satisfies SessionSnapshot;
	},
	async fetchLogout() {},
	async fetchSession() {
		return null;
	}
};
```

**Always accept and forward the `AbortSignal`.** Cancellation is how a
superseded request stops mattering; a dependency that ignores the signal makes
the flow's supersession a fiction while its tests still pass.

`createHttpAuthDeps` **reads the response body on failure**, which is what makes
the union reachable rather than merely representable. Two layers: status codes
map as a baseline (401 → `invalid_credentials`, 423 → `account_locked`, 429 →
`rate_limited` with `Retry-After`, 410 → `token_expired`), and an optional
`{ error: { code, … } }` body overrides and enriches that.

⚠️ Same-site only. The backend issues its session cookie `SameSite=Lax`, so a
`baseUrl` on a different site never carries it and every resolve comes back
anonymous.

---

## STYLING

**These components ship scoped `<style>`, not Tailwind classes, and that is not
a preference.** The Tailwind preset's `contentGlob` resolves to
`@composable-svelte/core`'s `dist` **only**, so any utility class in
`auth/dist` is purged in every consumer app — the "renders transparent" defect
the root CLAUDE.md opens with.

Colours are written as `hsl(var(--token, fallback))`, so they follow core's
theme tokens and dark mode when core's stylesheet is loaded, and fall back to
sane defaults when it is not. This is measured, not asserted: adding `.dark` to
`<html>` inverts every colour with no dark-mode CSS in the components.

**When adding a component here, copy that.** Do not hardcode hex — the other
satellite packages do and cannot be restyled at all.

Core's `Form` and `FormField` *are* used: they render `<form novalidate>` and
`<div data-field>` and carry no styling. `FormItem` / `FormLabel` /
`FormMessage` are Tailwind and are not; their accessibility contract is written
out by hand instead (`aria-invalid`, `aria-describedby` pointing at a real
element, `role="alert"` + `aria-live="polite"`) and asserted in tests.

**Do not use `FormControl`** — its props bag wires `onchange`, so a text input
would not update until blur.

---

## TESTING PATTERNS

### The fake

```typescript
import { createMockAuthDeps } from '@composable-svelte/auth/testing';

// Succeeds for one account, so a demo shows both outcomes without a toggle.
const deps = createMockAuthDeps({
	accepts: { email: 'ada@example.com', password: 'correct-horse' },
	latencyMs: 600
});

// Always reaches the second-factor branch.
const mfa = createMockAuthDeps({
	failWith: {
		code: 'mfa_required',
		message: 'Enter your code.',
		challengeId: 'c1',
		methods: ['totp']
	}
});
```

It rejects with **real `AuthError` shapes** and honours the `AbortSignal` at any
latency. A fake that rejects with a bare `Error` produces `code: 'unknown'` —
the exact flattening the union exists to prevent — and makes every branch
unreachable in the tests built on it.

### Reducers

`createTestStore` send/receive, `assertNoPendingActions()`, deps as `vi.fn()`,
and a `deferred<T>()` helper to hold effects in flight so races are arranged
rather than hoped for. `tests/session-reducer.test.ts` is the template,
including epoch-attribution races.

### Components

Browser mode, `mount` / `flushSync` / `unmount` in `try/finally`. Assert
accessibility rather than assuming it, **with a non-vacuity arm for each** —
"no `aria-invalid`" is also what a broken selector produces.

Two traps this package has already hit:

- `event.currentTarget` is only meaningful **during** dispatch. Reading it from
  a retained `vi.fn` mock call gives `null`. Capture the value inside the
  handler.
- `userEvent.click` on a *disabled* element waits for it to become enabled and
  times out after thirty seconds, reporting a passing property as a failure. Use
  a native `.click()`, which the browser suppresses — that suppression is the
  assertion.

### SSR

`vitest.ssr.config.ts` compiles components with `generate: 'server'` **and**
rune modules (`*.svelte.ts`) with `compileModule` — `createStore` lives in one,
and without it the component dies on the first `$state` it reaches, which reads
like a component defect and is not.

Assert the things that can only differ between builds: a dynamic
`<svelte:element>` tag, ids from `$props.id()` with no effect having run, seeded
values reaching the markup, and — the one that matters — that the server emits
`type="password"` and never `type="text"`.

---

## ADDING A NEW FLOW

The shape to copy, in order. `flows/login/` is the worked example.

1. **`schema.ts`** — a Zod schema and an `empty…Fields` constant. Be lax where
   strictness is hostile: sign-in checks only that a password was typed, because
   telling someone their *existing* password "must contain a number" while they
   try to get in is both wrong and infuriating. Signup enforces strength.
2. **`types.ts`** — `State` with `{ form, status, error: AuthError | null }`,
   an `Action` union whose first arm is `{ type: 'form'; action: FormAction<…> }`,
   and a `Dependencies` interface naming only the calls this flow makes.
3. **`reducer.ts`** — a `const …_EFFECT_ID` (fixed, so a second submit
   supersedes), `createFormReducer` scoped in with `scope()`, an empty
   `onSubmit`, the `submissionSucceeded` observation that calls the dependency,
   and the `fieldChanged` clause that clears `error`. Export a
   `create…Store` mirroring `createLoginStore`.
4. **`index.ts`**, and add it to `flows/index.ts` **and** the package barrel.
   Nothing catches "built a feature, forgot to export it" — the login flow
   shipped unexported once and only the tests' relative paths hid it.
5. **The dependency** on `AuthDependencies`, the wire mapping in `http/`, and
   the arms in `http/errors.ts` if it introduces a new status code.
6. **Tests at both layers** on the day it lands. Every new `.svelte` must be
   imported by a test (`component-coverage.test.ts` follows imports) and added
   to `tests/test-components/AuthPropForwarding.svelte`.
7. **CHANGELOG**, and the README's "what does not exist yet" list.

### Constraints that will fail the build

- **`exactOptionalPropertyTypes`**: every optional prop needs `| undefined`, and
  function types must be parenthesised — `(() => void) | undefined`.
  `optional-props.test.ts` is a hard ratchet.
- **Pattern A: auth forms animate nothing.** No transition on hover, focus,
  press or value. `animation-policy.test.ts` scans `packages/*/src`.
- **Every documented example is compiled**, including the ones in this file —
  `doc-typecheck.test.ts` reads `.claude` and `packages` against the built
  `dist`. Run `pnpm -r build` before the guards.
- **Components must not hardcode a heading level.** Take a `headingLevel` prop.

---

## CROSS-REFERENCES

- `composable-svelte-forms` — `createFormReducer`, `FormState`, validation modes
- `composable-svelte-core` — `Effect.cancellable`, `scope()`, `createTestStore`
- `composable-svelte-navigation` — routing a post-login redirect
- `composable-svelte-ssr` — hydration and per-request stores
- `packages/auth/README.md` — user-facing docs
- `guides/VERIFICATION-PROTOCOL.md` — how a fix is checked before it is believed
- `plans/hardening/README.md` — the open defect backlog

---

## TROUBLESHOOTING

**The form shows stale data and typing does nothing to the store.** The
`flowStore` prop was replaced with a different store object. `Form` captures its
store into context at init, so `LoginForm` re-points its subscription with an
effect — but a component doing this by hand will detach silently. Key the
component, or reset the flow by dispatching rather than by recreating the store.

**`mfa_required` arrives as `code: 'unknown'`.** The auth call was routed
through `config.onSubmit`, which flattens the throw to `error.message`. Move it
to the reducer's `submissionSucceeded` arm.

**The session never updates after a successful sign-in.** `sessionStore` was not
passed, or a custom surface never dispatched `sessionEstablished`.

**Everything renders unstyled in a consumer app.** Tailwind is not wired to
core, or someone added utility classes to this package. See "Styling".

**Cancellation does not work in production but tests pass.** The dependency is
dropping the `AbortSignal` instead of forwarding it to `fetch`.

**A superseded sign-in overwrites a newer one.** The effect id is not constant.
It must be a fixed string, not per-dispatch.
