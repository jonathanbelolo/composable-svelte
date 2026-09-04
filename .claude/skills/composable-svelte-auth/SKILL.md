---
name: composable-svelte-auth
description: Sessions, credentials flows and auth guards for Composable Svelte. Use when implementing login, signup, password reset, email verification, MFA, OAuth, role gating, or any session-aware UI. Covers the session store, the AuthError union, headless flow reducers, the shared password policy, LoginForm/SignupForm/EmailVerification/ForgotPasswordForm/ResetPasswordForm/PasswordInput/PasswordCriteria/AuthGuard/RoleGate, and the backend-agnostic dependency surface with its HTTP adapter, from the @composable-svelte/auth package.
---

# Composable Svelte Auth

Client half of the identity substrate: one session store, one flow store per
sign-in attempt, a structured failure union, and thin components over both.

---

## PACKAGE OVERVIEW

**What exists today.** Session resolution, seeded-user passwordless login,
password sign-in and **signup** end to end (headless flows, HTTP adapter, styled
forms), the `AuthError` union, `AuthGuard` / `RoleGate` / `LoginForm` /
`SignupForm` / `EmailVerification` / `ForgotPasswordForm` /
`ResetPasswordForm` / `MfaChallengeForm` / `MfaEnrolment` / `PasswordInput` /
`PasswordCriteria` / `OneTimeCodeInput` / `OAuthSignIn` / `OAuthCallback` /
`MagicLinkRequestForm` / `MagicLinkSignIn` / `ChangePasswordForm` /
`SignOutButton` / `MfaManagementPanel` / `ConnectedAccountsPanel` /
`RecoveryCodes` / `ChangeEmailForm` / `EmailChangeConfirmation` /
`DeleteAccountPanel` / `SessionRefresh`, a mock dependency set, SSR coverage.

**The account lifecycle ships.** Changing an address is **two** flows —
`change-email` (a form in a settings panel) and `change-email-confirm` (the
link target) — because the halves run in different page loads, the same
criterion that splits OAuth and magic links. Confirming requires a live
session, so `EmailChangeConfirmation` takes a **required** `onSignIn`: a link
opened on a signed-out device 401s, and that must be a route onward.

`delete-account` puts the confirmation **in the reducer** —
`deletionRequested` is reachable only from `confirming` — so a consumer who
renders their own dialog, or none, cannot delete an account with one dispatch.
`DeleteAccountPanel` takes a `confirm` snippet for a modal and confirms inline
without one; it does **not** import core's `AlertDialog`, because that is
Tailwind and auth components must work with none.

`session-refresh` is session **lifetime**, not bearer tokens, and none may be
introduced: a refresh token reachable by JavaScript is exfiltrable by any XSS,
which is what the HttpOnly cookie avoids.

**A code appearing in the `AuthError` union is still not a promise that a flow
behind it ships.** Check `src/lib/flows/` before telling a user one exists.

**Entry points.** `.`, `./subject`, `./errors`, `./session`, `./flows`,
`./components`, `./http`, `./testing` — and every one of them is also on the
root barrel, so a subpath is a convenience, never the only way in. Adding a
directory means adding both; the two are meant to stay in step.

> ⚠️ **`AuthGuard` and `RoleGate` are UX gating only.** Hiding children
> client-side is a courtesy, not a security boundary. Enforcement is the
> backend's authorization gates, which re-check every request. Never present
> them as security in documentation or in conversation with a user.

---

## THE TWO STORES

**The single most important thing in this package.** The session store owns
"who am I". A flow store owns *one attempt* to become someone.

They are separate on purpose. `SessionStatus` has seven values, and both guards
branch on the set — `AuthGuard` on `subject.kind` plus three status tests,
`RoleGate` on `unresolved`/`resolving` plus `subject.kind`. Folding
`mfaRequired` / `pendingVerification` / `passwordResetSent` into that set would
mean revisiting every one of those branches, and every consumer's render, each
time a flow was added. Instead each flow is its own reducer that ends by handing
a `SessionSnapshot` across.

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

A `Record`, not an array, so that adding an eighth status fails to compile here
rather than leaving this list silently short:

```typescript
import type { SessionStatus } from '@composable-svelte/auth';

const meaning: Record<SessionStatus, string> = {
	unresolved: 'nothing has been asked yet',
	resolving: 'a resolve is in flight',
	authenticated: 'there is a subject',
	anonymous: 'resolved, and nobody is signed in',
	loggingIn: 'a sign-in is in flight',
	loginFailed: 'the last sign-in failed; `error` says why',
	loggingOut: 'a sign-out is in flight'
};
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

Twelve arms: `invalid_credentials`, `mfa_required`, `email_unverified`,
`email_taken`, `account_locked`, `rate_limited`, `token_expired`,
`oauth_denied`, `oauth_state_mismatch`, `reauthentication_required`, `network`,
`unknown`. Each is also
exported by name (`MfaRequiredError`, `RateLimitedError`, …) for a signature
that accepts only one, and `AuthErrorCode` is the union of the code strings.

The example below is **exhaustive on purpose**, and this file is compiled by
`doc-typecheck`. Add an arm to the union and `unhandled(error)` stops
typechecking, so the sentence above cannot quietly go stale — which is the
failure mode of every skill that lists a union in prose. It has already earned
its keep three times: `email_taken`, the two `oauth_*` arms and
`reauthentication_required` each broke this block on the day they landed.

```typescript
import { retryDelaySeconds, type AuthError } from '@composable-svelte/auth';

function unhandled(value: never): never {
	throw new Error(`unhandled auth error: ${String(value)}`);
}

function whatToOffer(error: AuthError): string {
	switch (error.code) {
		case 'mfa_required':
			// The only place `challengeId` can live. A string error loses it.
			return `second factor: ${error.methods.join(', ')} (${error.challengeId})`;
		case 'email_unverified':
			// Resend to the address in the error, not the one in the field.
			return error.email ? `resend to ${error.email}` : 'resend verification';
		case 'email_taken':
			// Signup's characteristic failure, and an offer rather than a scolding.
			return 'offer to sign in, or to reset the password';
		case 'account_locked':
			return error.until ? `locked until ${error.until}` : 'locked';
		case 'rate_limited':
			// `null` when the backend stated no delay — never invent one.
			return `wait ${retryDelaySeconds(error) ?? 'a while'}s`;
		case 'reauthentication_required':
			// The session is valid; this action wants proof it is still them. A
			// branch, like `mfa_required` — never a red banner. `methods` says
			// what the backend will accept, because the client cannot know: an
			// account made through OAuth or a magic link has no password.
			return `confirm with: ${error.methods.join(', ')}`;
		case 'oauth_denied':
			// Not a failure: the user pressed Cancel at the provider. Offer the
			// way back, never a red banner.
			return error.provider ? `cancelled at ${error.provider}` : 'cancelled';
		case 'oauth_state_mismatch':
			// Carries nothing but a message, deliberately — see the OAuth section.
			// The only recovery is starting the sign-in again.
			return 'start the sign-in again';
		case 'invalid_credentials':
		case 'token_expired':
		case 'network':
		case 'unknown':
			return error.message;
		default:
			return unhandled(error);
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

## SUBJECT AND ROLES

`RoleGate` covers declarative gating. For anything else — a role badge in a
menu, a branch inside a reducer — read the subject directly. **Do not reach into
`attributes` by hand:** roles arrive at `attributes["roles"]` as a JSON string
array, which is the backend's convention, and `subjectRoles` is what knows that.

```typescript
import { hasAnyRole, subjectRoles, subjectFromSession } from '@composable-svelte/auth';
import type { SessionSnapshot, Subject } from '@composable-svelte/auth';

function badge(subject: Subject): string {
	if (subject.kind !== 'authenticated') return 'Signed out';
	const roles = subjectRoles(subject);
	return roles.length > 0 ? roles.join(', ') : 'Member';
}

function canPublish(subject: Subject): boolean {
	return hasAnyRole(subject, ['admin', 'editor']);
}

// The same mapping the session reducer applies to a resolved session.
function toSubject(session: SessionSnapshot): Subject {
	return subjectFromSession(session);
}
```

`hasRole` is the single-role form. `anonymousSubject` is the frozen constant the
store starts from — compare against `subject.kind`, never against that object's
identity.

---

## COMPOSING THE REDUCERS

`createSessionStore` and `createLoginStore` exist for the common case where
nothing but the component observes the flow. When a surrounding feature *does*
need to observe it — a wizard, a modal that closes on success, an app store that
records the attempt — compose the reducer instead. It is an ordinary TCA child.

```typescript
import { scope, type Reducer } from '@composable-svelte/core';
import {
	loginReducer,
	createInitialLoginState,
	type LoginAction,
	type LoginDependencies,
	type LoginState
} from '@composable-svelte/auth';

interface AppState {
	login: LoginState;
}

type AppAction = { type: 'login'; action: LoginAction };

const appReducer: Reducer<AppState, AppAction, LoginDependencies> = scope(
	(state: AppState) => state.login,
	(state: AppState, login: LoginState) => ({ ...state, login }),
	(action: AppAction) => (action.type === 'login' ? action.action : null),
	(action: LoginAction): AppAction => ({ type: 'login', action }),
	loginReducer
);

const initial: AppState = { login: createInitialLoginState() };
```

`sessionReducer` / `createInitialSessionState` compose the same way, over
`SessionState` / `SessionAction` / `SessionDependencies`. A parent that composes
the login flow watches for `status === 'succeeded'` and does the
`sessionEstablished` handoff itself — that is precisely what `LoginForm` does,
and why it takes both stores.

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

## THE SIGNUP FLOW

Same shape as sign-in — the form validates, the reducer submits — with one
structural difference: **two terminal states, both successes.**

```typescript
import type { SignupStatus } from '@composable-svelte/auth';

const meaning: Record<SignupStatus, string> = {
	idle: 'editing, or a failure to correct',
	submitting: 'the request is in flight',
	succeeded: 'the backend issued a session; hand it to the session store',
	awaitingVerification: 'the account exists and needs its address confirmed'
};
```

A backend requiring email confirmation cannot return a session, and one that
does not should not be forced into a second round trip, so `deps.signup`
answers with a union rather than a nullable session — there is no field to
forget to check:

```typescript
import type { SignupOutcome } from '@composable-svelte/auth';

function describe(outcome: SignupOutcome): string {
	return outcome.kind === 'session'
		? `signed in as ${outcome.session.subject_id}`
		: `confirmation sent to ${outcome.email}`;
}
```

`awaitingVerification` is **not** a failure: `error` stays null, and
`SignupForm` replaces itself with a terminal panel rather than showing a banner.
Treating it as an error — or dispatching `sessionEstablished` anyway — signs in
an account that cannot be used.

### The password policy is length, and nothing else

`passwordCriteria` is derived from the same constants the schema validates
against, so a checklist cannot tell a user they are done while the form
disagrees — a test asserts the two agree on every sample.

```typescript
import {
	meetsPasswordCriteria,
	evaluatePasswordCriteria,
	PASSWORD_MIN_LENGTH
} from '@composable-svelte/auth';

const ok: boolean = meetsPasswordCriteria('correct-horse-battery');
const shown = evaluatePasswordCriteria('short'); // [{ criterion, met }, …]
void PASSWORD_MIN_LENGTH;
```

No character-class rules, following NIST 800-63B: composition rules push people
toward `Passw0rd!` — predictable substitutions on a short base — while a longer
passphrase is stronger and easier to remember. **If you add one, the "asks for
length and nothing else" test fails**, so the decision gets made deliberately
rather than by drift.

`signupFormConfig` uses `mode: 'onBlur'`, not `onSubmit` as sign-in does. The
confirm field is why: a mismatch discovered only at submit means retyping a
password the user believed they had entered twice. Not `onChange`, which would
red-flag a password mid-word — `PasswordCriteria` carries the live feedback, and
it is phrased as a requirement rather than a failure.

> ⚠️ Cross-field rules ran **only at submit** in core until `870c0ca`. If you
> are looking at an older core, `mode: 'onBlur'` will not surface a `.refine()`.

---

## THE EMAIL-VERIFICATION FLOW

Structurally unlike the other two: **no form**. The input arrived in a link, so
the work starts on mount and the only thing a user can type is nothing.

```typescript
import type { EmailVerificationStatus, ResendStatus } from '@composable-svelte/auth';

const confirming: Record<EmailVerificationStatus, string> = {
	idle: 'nothing attempted, or an attempt that failed — `error` says which',
	verifying: 'the exchange is in flight',
	verified: 'the address is confirmed; `session` may or may not be set'
};

// Tracked apart from `status`, because both can be true at once.
const resending: Record<ResendStatus, string> = {
	idle: 'not asked, or a failed ask that can be retried',
	sending: 'in flight',
	sent: 'another mail is on its way'
};
```

A failed confirmation with a resend in flight is the **ordinary** state of this
page, not an edge case — which is why the two are separate fields rather than
one status. A successful resend also does not clear the confirmation error: that
link is still dead, and saying otherwise would be a lie the user acts on.

### The token is single-use, so the request is guarded twice

```typescript
import { tokenFromUrl } from '@composable-svelte/auth';

const token: string | null = tokenFromUrl('https://app.example.com/verify?token=abc');
```

`verificationRequested` is refused unless `status === 'idle'`, and
`EmailVerification` separately tracks which token it has already asked about.
Both are wanted: the component guard stops the dispatch, the reducer guard stops
anything that gets past it. A Svelte effect re-runs for reasons unrelated to its
subject, and a second exchange spends a working link — then reports the failure
as the user's problem.

> ⚠️ **Never call `verifyEmail` during SSR.** Effects do not run on the server,
> which is what makes the component safe there; a render that exchanged the
> token would spend it before the page reached the browser, and a *cached*
> render would spend one per request. There is an SSR test asserting the server
> markup does not show a confirmed state.

`null` from `verifyEmail` is a success — the address is confirmed and the user
still has to sign in. Only a non-null session is handed to the session store.

---

## PASSWORD RECOVERY

Two flows, because two surfaces: `forgot-password` asks for a link,
`reset-password` consumes one.

### Asking tells the user nothing, deliberately

`requestPasswordReset` resolves whether or not the address has an account, and
the surface must say the same thing either way — "if there is an account for
…", never "we sent you a link". Distinguishing them turns the form into an
account checker, and it is a one-line change to make by accident. There is a
test asserting the two outcomes render **identical text**, because that is where
the leak appears rather than in the state.

For the same reason a `404` from the backend is **not** quietly treated as
success by the adapter: a backend answering 404 for an unknown address *is* the
oracle, and hiding it behind a working-looking UI means nobody fixes it.

```typescript
import type { ForgotPasswordStatus } from '@composable-svelte/auth';

const meaning: Record<ForgotPasswordStatus, string> = {
	idle: 'editing, or a failure to correct',
	submitting: 'the request is in flight',
	sent: 'the backend accepted it — which says nothing about whether an account exists'
};
```

**`sent` does not replace the form**, unlike signup's terminal panel. The
message is conditional, so a user who mistyped needs the form still there;
`onSent` fires per acceptance rather than once, so a second attempt is not
swallowed.

### Reset does *not* copy verification's token guards

This is the mistake to avoid. `EmailVerification` exchanges its token **on
mount**, so an effect that re-fires spends a single-use link — hence a guard in
its reducer and another in the component. `ResetPasswordForm` exchanges **on
submit**, because the user has to type a password first. There is no mount
effect to re-fire, so the equivalent guards would be answering a question nobody
asked. The fixed cancellation id every form flow has is the whole of it.

```typescript
import type { ResetPasswordStatus } from '@composable-svelte/auth';

const outcome: Record<ResetPasswordStatus, string> = {
	idle: 'editing, or a failure to correct',
	submitting: 'the reset is in flight',
	reset: 'the password is changed; `session` may or may not be set'
};
```

A dead or missing link does not leave a form up that cannot succeed — both end
in the same offer of a new one. `resetPassword` resolving with `null` is a
success: the password changed, and the user signs in with it.

### The password policy is shared, not copied

`flows/password-policy.ts` owns the rules, and **both** `signupSchema` and
`resetPasswordSchema` build their password field from `passwordField()`. A user
cannot be told one thing creating an account and another recovering it, and the
"agrees with the schema on every sample" test runs against both.

---

## MFA

Two flows. `mfa-challenge` is the step reached from sign-in; `mfa-enrolment`
turns an authenticator on.

### The challenge is what `mfa_required` was always for

`AuthError`'s `mfa_required` arm has carried a `challengeId` since the union was
created, and until these flows landed **nothing read it** — it was validated on
arrival, carried through the login reducer, and rendered as a sentence.

`LoginForm` now takes `onMfaRequired`, which is the first production caller of
`isMfaRequired`:

```svelte
<script lang="ts">
  import { LoginForm } from '@composable-svelte/auth';
  import { login, session, challenge } from './stores';
</script>

<LoginForm
  flowStore={login}
  sessionStore={session}
  onMfaRequired={(c) => challenge.dispatch({ type: 'challengeProvided', ...c })}
/>
```

**Supplying it suppresses the error banner**, because `mfa_required` is the flow
branching rather than a failure and a red alert on the way to a code prompt is
alarming and wrong. It is optional — MFA is off for most backends — so without
it the banner still renders, which is the older behaviour and no worse.

### Two failures, two different recoveries

No new union arm was added. A wrong code is `invalid_credentials` and the form
stays up; an expired or spent challenge is `token_expired`, the form is
withdrawn, and `onStartOver` is the way back. Those two branches are the entire
reason the distinction matters, and both codes already existed.

```typescript
import type { MfaChallengeStatus, MfaEnrolmentStatus } from '@composable-svelte/auth';

const challenging: Record<MfaChallengeStatus, string> = {
	idle: 'entering a code, or a failure to correct',
	submitting: 'the code is being checked',
	succeeded: 'signed in; `session` is set'
};

const enrolling: Record<MfaEnrolmentStatus, string> = {
	idle: 'nothing started, or a start that failed',
	starting: 'fetching the secret',
	confirming: 'the secret is on screen, waiting for a code',
	submitting: 'checking that code',
	enrolled: 'done; `recoveryCodes` is set and will never be again'
};
```

### Recovery codes are a different method, not a different field

Switching clears the code and sends `method: 'recovery_code'` — it is a
different request. The switch is offered only when `methods` says the account
has them.

### Enrolment *does* need the guards reset-password does not

It fetches on entry, so an effect that re-fires starts a second enrolment and
silently invalidates the secret the user is at that moment typing into their
phone. Both the reducer and `MfaEnrolment` refuse a repeat, exactly as
`EmailVerification` does. `ResetPasswordForm` deliberately has neither, because
it exchanges on submit — read those two comments together before copying either.

### No QR code is drawn, deliberately

Nothing in this repository can produce one, and adding an encoder would make it
the package's second runtime dependency for something that is not its defining
concern. `MfaEnrolment` renders the secret for manual entry — which every
authenticator supports, and the only route available when setting up on the same
device — and takes a `qr` snippet receiving `{ otpauthUri, secret }` so a
consumer plugs in their own renderer or a backend-rendered image.

> ⚠️ **Recovery codes are shown once.** `confirmMfaEnrolment` is the only place
> they ever appear, and `onDone` fires when the *user* acknowledges them, not
> when enrolment completes. Do not add a transition that leaves that panel on
> the user's behalf.

### One field, not six

`OneTimeCodeInput` is a single input with `inputmode="numeric"` and
`autocomplete="one-time-code"`. That is a deliberate choice against the
six-boxes look: one field autofills from the OS, pastes with no handler, and has
one label and one error, where split boxes must re-implement paste and
backspace and announce as six unlabelled inputs. `maxlength` is a hint and unset
by default — a recovery code is not six digits.

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

<AuthGuard store={session} onAnonymous={() => history.pushState({}, '', '/login')}>
  {#snippet pending()}<p>Loading…</p>{/snippet}
  {#snippet fallback({ error })}<p>Please sign in. {error?.message ?? ''}</p>{/snippet}

  <RoleGate store={session} roles={['admin']}>
    <p>Admin panel</p>
    {#snippet fallback()}<p>Not authorized.</p>{/snippet}
  </RoleGate>
</AuthGuard>
```

`onAnonymous` above uses `history.pushState` so the example is one a compiler
can check. In an app with a navigation store, dispatch a redirect into it
instead — that is the intended shape, and the reason the callback exists rather
than the component routing on its own.

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

## OAUTH

Two flows, because the two halves run in **different page loads**: a full-page
redirect destroys the store, so they can never share one. `oauth-start` runs on
the page with the buttons; `oauth-callback` runs on the page the provider
returns to.

```
click "Continue with GitHub"
  -> beginOAuth('github')  ->  { authorizeUrl, state }
  -> pendingOAuth.put({ provider, state, returnTo })
  -> redirect(authorizeUrl)              <- the only navigation in the repo

     ...provider...

/auth/callback?code=..&state=..
  -> OAuthCallback, on mount
     pendingOAuth.take(), compare state  <- the CSRF gate
     completeOAuth(provider, code, state) -> SessionSnapshot
     -> sessionEstablished
```

**The backend mints `state` and builds the authorize URL.** Every id in this
package is server-minted, and the party holding the client secret is the party
that has to verify the nonce anyway. So there is **no PKCE crypto in the
browser** — no `getRandomValues`, no `crypto.subtle`, no base64url. Do not add
a `codeVerifier` to `OAuthStart`: it would be a secret in `sessionStorage`, and
the package's claim that the browser never holds OAuth secrets would become
false.

**The client-side `state` check is defence in depth, never the defence.** The
backend must bind `state` to the exchange in `completeOAuth`. Whoever controls
the callback URL controls the client's copy of both values.

Two dependencies are **not** on `AuthDependencies` — `pendingOAuth` and
`redirect`. That interface is the auth I/O whose every member rejects with an
`AuthError`; storage and navigation are neither. They live on
`OAuthStartDependencies`.

```svelte
<script lang="ts">
	import {
		OAuthSignIn,
		OAuthCallback,
		createOAuthStartStore,
		createOAuthCallbackStore,
		createPendingOAuthStorage,
		createBrowserRedirect,
		createHttpAuthDeps,
		oauthParamsFromUrl,
		createSessionStore,
		createHttpSessionDeps
	} from '@composable-svelte/auth';

	const api = createHttpAuthDeps('/api');
	const pendingOAuth = createPendingOAuthStorage();
	const sessionStore = createSessionStore(createHttpSessionDeps('/api'));

	const startStore = createOAuthStartStore({
		beginOAuth: api.beginOAuth,
		pendingOAuth,
		redirect: createBrowserRedirect()
	});
	const callbackStore = createOAuthCallbackStore({
		completeOAuth: api.completeOAuth,
		pendingOAuth
	});
</script>

<OAuthSignIn
	flowStore={startStore}
	providers={[{ id: 'github', label: 'GitHub' }]}
	returnTo="/dashboard"
/>

<OAuthCallback
	flowStore={callbackStore}
	{sessionStore}
	params={oauthParamsFromUrl(window.location.href)}
	onSuccess={({ returnTo }) => history.pushState({}, '', returnTo ?? '/')}
	onStartOver={() => history.pushState({}, '', '/sign-in')}
/>
```

### Rules

- **No provider logos ship.** Pass an `icon` snippet. Google, GitHub, Apple and
  Microsoft each publish brand guidelines governing the mark, its clear space
  and the button wording; vendoring them would make every consumer's trademark
  compliance this library's problem. Label-only is a supported configuration.
- **`returnTo` is normalised to a same-origin path** and never crosses the wire.
  A consumer reading it from their own `?returnTo=` is the ordinary case, and
  that is exactly the route an open redirect takes. `https://evil.example` and
  `//evil.example` both become `null`.
- **`?error=` and `error_description` are attacker-supplied.** Anyone can link
  someone to `/auth/callback?error=…`. The code is echoed only if it matches
  `/^[a-z_]{1,64}$/`; the description is never rendered at all.
- **`take()` is destructive, and the only recovery is starting over.** Nothing
  is lost by that: if the exchange fails the authorization code is spent too, so
  a second attempt could not have succeeded with a perfect store either. Do not
  "fix" it into a `peek()` plus a `clear()`.
- **`sessionStorage`, not `localStorage`** — per-tab, so two tabs signing in
  concurrently cannot clobber each other's nonce.
- **Popups and `target="_blank"` are unsupported.** A new tab's `sessionStorage`
  is a copy taken at open time, so the record lands in the wrong tab. That is
  why `OAuthSignIn` renders `<button>` and never `<a href>`.
- **`OAuthCallback.onSuccess` and `onStartOver` are both required.** A callback
  URL is a page with no content of its own; either omission strands the user.

`oauth_denied` is a **branch, not a failure** — the user pressed Cancel, so it
renders as `role="status"` with a way back, never a red alert. Same lesson as
`mfa_required`.

---

## MAGIC LINKS

Two flows in two page loads, like OAuth. `magic-link-request` is
`forgot-password` with a different verb; `magic-link-signin` is where the
interesting decision lives.

**The token is spent on a press, never on mount.** This is the one place the
package deliberately does *not* copy `EmailVerification`, and the reason is mail
scanners: corporate security products and link prefetchers follow links before a
person does. For a verification link that costs little — the address gets
verified, which is what the link was for. For a *sign-in* link it means the token
is spent before its owner sees the page, their link is dead on arrival, and the
replacement they request is eaten the same way. A scanner issues a GET; it does
not press buttons.

```svelte
<MagicLinkSignIn
	flowStore={signInStore}
	{sessionStore}
	email="ada@example.com"
	onSuccess={() => history.pushState({}, '', '/')}
	onRequestNewLink={() => history.pushState({}, '', '/signin')}
/>
```

The pleasant consequence: nothing dispatches from an effect here, so there is no
mount guard, no "has this token been handed over" flag, and none of the
short-circuit-ordering subtleties those have cost this package. The guard that
remains is against a *double press*, which would spend a single-use token twice
and tell someone a link that just worked is no longer valid.

### Rules

- **`onRequestNewLink` is required**, like `ResetPasswordForm`'s. An expired or
  spent link cannot be retried from that page, and a branch with nothing to click
  is a dead end.
- **Failure returns to `idle`, unlike the OAuth callback**, which is terminal. An
  OAuth code is spent at the provider before the app hears about it; a `network`
  failure here may mean the request never arrived, so the token is untouched and
  pressing again is a real recovery. Only `token_expired` withdraws the button.
- **`email` is display-only and the consumer owns its provenance.** The token is
  opaque, so the component cannot learn the address from it. Do not pass a value
  read straight out of the URL — that is attacker-controlled text rendered in the
  app's own chrome.
- **The request half says "if that address has an account"** and must keep saying
  it. `requestMagicLink` resolves for any address, the same rule
  `requestPasswordReset` follows, and a surface that confirmed an account exists
  would turn the flow into an account checker.
- **No new `AuthError` arms.** A spent or malformed link is `token_expired`, not
  distinguished for the reason `verifyEmail` documents; a hammered request
  endpoint is `rate_limited`; and `mfa_required` reaches here too, because
  proving control of a mailbox is not proving possession of a device.
- **Wire `onMfaRequired` if your backend can answer with it.** `mfa_required`
  means the exchange got far enough to consume the token, so pressing again
  cannot work. Unhandled, the component stops offering the press and says the
  link is used up rather than inviting a retry that will fail — but the user is
  then stuck with no way to finish, which is a configuration gap, not a state
  worth designing for.
- **`token` is a prop, and dispatching it is how it reaches the flow.** The
  store can be seeded through `createMagicLinkSignInStore(deps, token)` instead;
  the prop exists for a token that arrives *after* mount, which is what a router
  resolving its parameters does.

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
	async signup(credentials, signal) {
		void credentials;
		void signal;
		// Two outcomes, deliberately: a backend requiring confirmation cannot
		// return a session, and one that does not should not force a second trip.
		return { kind: 'verificationRequired', email: 'ada@example.com' };
	},
	async fetchAccount(signal) {
		void signal;
		// The settings read model. Separate from `fetchSession` on purpose: the
		// session answers "who am I", this answers "what is my account like".
		return {
			email: 'ada@example.com',
			emailVerified: true,
			hasPassword: true,
			mfaEnabled: false,
			providers: []
		};
	},
	async changePassword(newPassword, signal) {
		void newPassword;
		void signal;
		// No current password: the client cannot know whether the account has
		// one. Reject with `reauthentication_required` if you want proof.
		return null;
	},
	async requestMagicLink(email, signal) {
		void email;
		void signal;
		// Resolves for any address — answering differently would be an
		// account-existence oracle.
	},
	async signInWithMagicLink(token, signal) {
		void token;
		void signal;
		return { subject_id: 'u1', display_name: 'Ada', roles: ['member'] } satisfies SessionSnapshot;
	},
	async beginOAuth(provider, signal) {
		void signal;
		// The backend mints `state` and builds the authorize URL, because it is
		// the party holding the client secret. Nothing is generated in the browser.
		return {
			authorizeUrl: `https://provider.example/authorize?provider=${provider}`,
			state: 'st_1'
		};
	},
	async completeOAuth(provider, code, state, signal) {
		void provider;
		void code;
		void state;
		void signal;
		return { subject_id: 'u1', display_name: 'Ada', roles: ['member'] } satisfies SessionSnapshot;
	},
	async verifyEmail(token, signal) {
		void token;
		void signal;
		// `null` means verified-but-not-signed-in, which is a success.
		return null;
	},
	async resendVerification(email, signal) {
		void email;
		void signal;
		// Resolves whether or not the address has an account: answering
		// differently is an account-existence oracle.
	},
	async requestPasswordReset(email, signal) {
		void email;
		void signal;
		// Resolves for every address. Rejecting for unknown ones would make the
		// form an account-existence oracle.
	},
	async resetPassword(token, password, signal) {
		void token;
		void password;
		void signal;
		// `null` means "changed, now sign in", which is a success.
		return null;
	},
	async verifyMfaChallenge(challengeId, code, method, signal) {
		void challengeId;
		void code;
		void method;
		void signal;
		// A session, always — satisfying the second factor completes the sign-in.
		return { subject_id: 'u1', display_name: 'Ada', roles: ['member'] };
	},
	async beginMfaEnrolment(signal) {
		void signal;
		return { enrolmentId: 'e1', secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/x' };
	},
	async confirmMfaEnrolment(enrolmentId, code, signal) {
		void enrolmentId;
		void code;
		void signal;
		// Shown once, and never retrievable again.
		return { recoveryCodes: ['aaa-111', 'bbb-222'] };
	},
	async disableMfa(signal) {
		void signal;
		// Sensitive, and takes no password: reject with
		// `reauthentication_required` if you want proof.
	},
	async regenerateRecoveryCodes(signal) {
		void signal;
		// The same shape `confirmMfaEnrolment` returns, and the same rule — these
		// replace the previous set, which stops working.
		return { recoveryCodes: ['ccc-333', 'ddd-444'] };
	},
	async linkOAuthProvider(provider, code, state, signal) {
		void provider;
		void code;
		void state;
		void signal;
		// **Returns nothing, deliberately.** Linking attaches a provider to the
		// session the user already has; returning a session here would be a
		// second sign-in nobody asked for.
	},
	async unlinkOAuthProvider(provider, signal) {
		void provider;
		void signal;
		// Refuse — with your own message — if this is the last way into the
		// account. The client cannot make that judgement: it does not know
		// whether you offer magic links.
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

`authErrorFromResponse` is exported too, so a **custom** adapter can reuse the
mapping rather than reimplement it:

```typescript
import { authErrorFromResponse } from '@composable-svelte/auth';

async function login(response: Response): Promise<never> {
	// Reads status *and* body, and returns a plain `AuthError` to throw.
	throw await authErrorFromResponse(response, 'Sign-in failed.');
}
```

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
   The login flow shipped unexported once — its tests reached it through a
   relative path, so nothing went red. `flat-barrel.test.ts` now catches that:
   every subpath export of this package must also be on the root barrel, and it
   fails naming the symbols that are not.
5. **The dependency** on `AuthDependencies`, the wire mapping in `http/`, and
   the arms in `http/errors.ts` if it introduces a new status code.
6. **Tests at both layers** on the day it lands. Every new `.svelte` must be
   imported by a test (`component-coverage.test.ts` follows imports) and added
   to `tests/test-components/AuthPropForwarding.svelte`.
7. **CHANGELOG**, and the README's summary of what ships — plus
   `front-door.test.ts`'s `CAPABILITIES`, which fails if a document denies
   something a flow directory now provides.

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

**A 2xx response still fails, with `MalformedSessionError`.** The session
endpoint returned success but a body that is not a `SessionSnapshot`. The
adapter refuses to guess — a subject with no id is worse than no subject.

**Cancellation does not work in production but tests pass.** The dependency is
dropping the `AbortSignal` instead of forwarding it to `fetch`.

**A superseded sign-in overwrites a newer one.** The effect id is not constant.
It must be a fixed string, not per-dispatch.
