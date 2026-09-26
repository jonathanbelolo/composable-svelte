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

Read the shipped [HTTP contract](./docs/http-contract.md) for all 27 routes, request and response shapes, error mapping and backend responsibilities.

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
["Styling & Theming"](https://github.com/jonathanbelolo/composable-svelte/blob/main/packages/core/README.md#styling--theming) section of core's
README for the wider setup.

## Usage

### Managed sign-in, signup, recovery, email verification, MFA settings, OAuth, magic links, connected accounts, change-email, change-password, delete-account, and session-refresh

`createAuthFeature()` from `@composable-svelte/auth/application` composes a
persistent session with temporary login, MFA, signup, forgot-password,
reset-password, email-verification, OAuth start, OAuth callback,
magic-link request, magic-link sign-in, change-email request and change-email
confirmation views, plus MFA enrolment, MFA management, account read model,
connected accounts, change-password, delete-account, and session-refresh settings views. Put its composition in a `ManagedIntegrationBuilder` slot in your
application. Declare its nested views with `defineViews`, then render
`LoginForm`, `MfaChallengeForm`, `SignupForm`, `ForgotPasswordForm`,
`ResetPasswordForm`, `EmailVerification`, `MfaEnrolment`,
`MfaManagementPanel`, `OAuthSignIn`, `OAuthCallback`, `MagicLinkRequestForm`,
`MagicLinkSignIn`, `ConnectedAccountsPanel`, `ChangeEmailForm`,
`EmailChangeConfirmation`, `ChangePasswordForm`, `DeleteAccountPanel`, and `SessionRefresh` with `mode="managed"` and the `store` supplied to each
content snippet. The runnable [installed consumer](./consumer/README.md) shows
`ApplicationRoot`, `ApplicationHost`, the nested views, two auth siblings, parent
handoff, MFA, OAuth, magic-link, connected-accounts, change-email, change-password, delete-account, and session-refresh outcome handling, replacement, and SSR
request isolation.

Managed mode requires `createAuthFeature()` or a parent composition that handles
the same accepted/refused session handoff, MFA branch, start-over and
"Sign in instead" outcomes.
A presentation view from an unrelated composition does not supply those business
rules. Managed forms take no `sessionStore` or result callbacks; the feature
handles the result once, whether or not the form remains mounted. The parent
reads `AuthFeatureState.handoff` after an auth-routed action as a one-reduction
output, then chooses its application route. A refused handoff carries a reason;
the current reason is `loggingOut`.

Your application's dependency type can extend `AuthFeatureDependencies` with its
own services. The composition nests under that parent unchanged, and the one
dependency object you inject must still supply every service Auth requires.

**After sign-out.** `session` → `logout` removes every flow, sign-in attempts and
settings alike, in that reduction and retires their owners, so late results are
dropped. A handoff refused because a sign-out is in flight
(`handoff.kind === 'refused'`, `reason: 'loggingOut'`) also removes the finished
flow while the session keeps signing out. The feature has no route and never
reopens a flow: if your layout still shows sign-in, dispatch `openLogin`. That
flow is new intent and stays live. `openLogin` is refused only while another
temporary flow is live, so dispatching it again is safe. Other subject changes,
such as an expiry to anonymous, retire the settings flows only (an ended
session-refresh view stays, as described below) and leave a live sign-in flow in
place.

```ts
import { Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, optionalSlot } from '@composable-svelte/core/application';
import {
  createAuthFeature,
  type AuthFeatureAction,
  type AuthFeatureDependencies,
  type AuthFeatureState
} from '@composable-svelte/auth/application';

interface AppDependencies extends AuthFeatureDependencies {
  fetchActivity(signal?: AbortSignal): Promise<readonly number[]>;
}
interface State {
  auth: AuthFeatureState | null;
  route: 'signIn' | 'home';
}
type Action = { type: 'auth'; action: PresentationAction<AuthFeatureAction> };

const openLogin = (): Effect<Action> =>
  Effect.run<Action>(async (dispatch) => {
    dispatch({ type: 'auth', action: { type: 'presented', action: { type: 'openLogin' } } });
  });

// Runs after the auth child in the same reduction, so `handoff` is this reduction's output.
const reducer: Reducer<State, Action, AppDependencies> = (state, action) => {
  if (action.action.type !== 'presented' || state.auth === null) return [state, Effect.none()];
  const routed = action.action.action;
  const handoff = state.auth.handoff;
  if (handoff?.kind === 'accepted') return [{ ...state, route: 'home' }, Effect.none()];
  const loggedOut = routed.type === 'session' && routed.action.type === 'logout';
  if (loggedOut || handoff?.kind === 'refused') return [{ ...state, route: 'signIn' }, openLogin()];
  return [state, Effect.none()];
};

const auth = createAuthFeature();
export const composition = new ManagedIntegrationBuilder(reducer)
  .with(optionalSlot<State, Action>()('auth'), auth.composition)
  .build();
```

`openLogin`, `openSignup`, `openForgotPassword`, `openResetPassword` and
`openEmailVerification` do nothing
while another auth flow is live; their `restart…` counterparts replace whatever
is live. `openResetPassword` and `restartResetPassword` take the link token as
an action field, including `null` for a missing token. A signup that
ends in a session is handed over like a login (`handoff.source === 'signup'`).
One that needs its address confirmed hands nothing over: the signup flow stays
presented with `status: 'awaitingVerification'` and `pendingEmail`, and the
form shows its "Check your email" panel. Route from that state after the
auth-routed action. On `email_taken` the managed form's "Sign in instead"
dispatches `signInRequested`, and the feature replaces the signup with a fresh
sign-in.

A forgot-password request keeps its form and conditional sent message; it
establishes no session. The parent routes from a matching routed `requestSent`
action after the child stores `requestedFor`, so later actions do not replay
the result and a second accepted request for the same address is observable.
While that sent flow remains live, another `open…` action is refused; use an
explicit `restart…` or the managed form's sign-in action to change flows. A
custom `footer` replaces the managed form's default "Back to sign in" action;
without a custom footer, `signInLabel` changes that button's text. Recovery
navigation actions are explicit intents even during pending requests: switching
flows retires the request owner and drops late results.

`openEmailVerification` and `restartEmailVerification` seed the optional resend
address. `EmailVerification` receives the link token as a prop and dispatches a
single verification request on mount; SSR renders without starting work. The
same owned view can also dispatch `verificationRequested` headlessly. Verify
and resend run as independent operations. A verification session uses the
shared handoff with source `emailVerification`; a verified result without a
session stays visible for the parent to route from the matching routed
`verificationSucceeded` action. The parent can also observe each matching
`resendSucceeded` action. Managed "Sign in" dispatches `signInRequested` and
retires the verification owner.
A reset may issue a session, which reaches the same handoff with source
`resetPassword` and retires the flow. A successful reset without a session
keeps its terminal state; the parent routes from the matching `resetSucceeded`
action and `status: 'reset'`. The managed form's sign-in and new-link controls
dispatch `signInRequested` and `requestNewLinkRequested` into the feature.

#### MFA settings: enrolment and management

The feature also carries two optional account-settings slots, `mfaEnrolment`
and `mfaManagement`, with `mfaEnrolmentSlot` and `mfaManagementSlot` handles and
the enrolment and management dependencies. They belong to the signed-in
account: opening either is refused unless the session has an authenticated
subject, which becomes their owner. Unlike the sign-in flows they may
coexist, and a temporary flow opened after them — a re-authentication prompt —
does not retire them; neither do `cancelSignIn` or a handoff that keeps the same
signed-in subject. Any change of the authenticated subject (a sign-in as a
different account, a session restored or resolved for someone else, an expiry
to anonymous) retires both with their secret, codes and pending requests. The
standalone stores and components have no such rule, and the backend still
enforces who may do what. Each has an explicit
lifetime: `openMfaEnrolment` / `openMfaManagement` (refused without a signed-in
subject, or while that flow or a temporary auth flow is live),
`restartMfaEnrolment` / `restartMfaManagement`
(a fresh owner) and `closeMfaEnrolment` / `closeMfaManagement`. Closing,
restarting, a view's `dismiss()`, `logout` or removing the feature aborts that
owner's pending begin, confirm, disable or regenerate request and drops its
late result. Sibling features keep their operations apart.

Render `MfaEnrolment mode="managed" flowStore={view.store}` and
`MfaManagementPanel mode="managed" store={view.store} mfaEnabled={account.mfaEnabled}`.
The enrolment view requests a secret once per owner on the client, never during
SSR; "Try again" after a failed start does not issue a second request. Neither
view takes `onDone`, `onChanged` or `onReauthenticationRequired`. Instead, the
feature reports `AuthFeatureState.mfaOutcome`, a one-reduction pulse like
`handoff`:

- `{ kind: 'enrolmentAcknowledged' }` — the user acknowledged the recovery codes
  of an `enrolled` owner. Reported once per owner: the feature sets the flow's
  `acknowledged`, the view stops offering "I have saved them", and a repeat or
  replay reports nothing. Confirmation alone reports nothing, and nothing is
  closed for you — the codes stay on screen until you close or restart the
  enrolment on this outcome.
- `{ kind: 'disabled' }` and `{ kind: 'recoveryCodesRegenerated' }` — re-read the
  account on each one.
- `{ kind: 'reauthenticationRequired', operation, methods }` — show your prompt,
  then dispatch that operation (`disableRequested` or `regenerateRequested`)
  again to the same view. The managed panel cannot tell whether a parent reads
  `mfaOutcome`, so it keeps the demand visible — the backend's message with
  "Nothing was turned off." or "Your existing codes still work." — and leaves
  both buttons enabled. A parent that shows a prompt shows it beside that
  message. (Standalone, passing `onReauthenticationRequired` still hides it.)

An outcome is reported only for a transition admitted in that reduction. For
management that is the flow's `settled` field, set only by the reducer arm that
accepted a disable or regenerate result, so a result for an operation that is
not in flight — or the same result action replayed — reports nothing. Pass `mfaEnabled` from the account; while it is
`undefined` the panel says it is reading the account and offers neither
button. The backend still decides whether each operation is allowed.

#### Managed OAuth start and callback

The feature carries managed `oauthStart` and `oauthCallback` slots with handles `oauthStartSlot` and `oauthCallbackSlot`. `AuthFeatureDependencies` requires `beginOAuth` and `completeOAuth`, while `linkOAuthProvider`, `pendingOAuth`, and `redirect` are optional (defaulting to this tab's `sessionStorage` and `createBrowserRedirect()`).

OAuth start is a browser redirect operation that stores a provider-specific pending record (`provider`, `intent: 'signIn' | 'link'`, `state`, `returnTo`) in `pendingOAuth` storage (defaults to `sessionStorage` with key `auth:oauth:pending`) and navigates to the authorization URL via `redirect`. Because `sessionStorage` is scoped per-browser-tab, concurrent sibling auth instances within the same tab share this default key; whichever callback view opens first on return consumes the pending record. Supply custom `pendingOAuth` instances if distinct in-tab storage keys are required. It emits no parent outcome: success is the browser leaving, and a failure remains in the flow beside its buttons. Managed `OAuthSignIn` is strictly for sign-in (`intent: 'signIn'`); no managed `ConnectedAccountsPanel` is claimed in this slice. The supported sequence for starting a managed provider link is to open the feature's `oauthStart` slot (via `{ type: 'openOAuthStart' }` or `{ type: 'restartOAuthStart' }`) and dispatch `{ type: 'authorizationRequested', provider, intent: 'link', returnTo }` directly to that `oauthStartSlot` view.

OAuth callback runs on the return page with its own fresh owner and one-use callback query parameters. It reads and consumes the single-use pending record from storage, exchanges the authorization code with the provider via `completeOAuth` (for `intent: 'signIn'`) or `linkOAuthProvider` (for `intent: 'link'`), and lifts accepted outcomes to the parent via `AuthFeatureState.oauthOutcome`:

- `{ kind: 'signedIn', returnTo }` — sign-in completed; session handed over to parent with `source: 'oauthCallback'` and `oauthCallback` slot retired. `returnTo` is normalised to a same-origin path or `null`.
- `{ kind: 'linkCompleted', returnTo }` — account linking completed; **never establishes a new session** (existing session is preserved untouched) and `oauthCallback` slot retired. `returnTo` is normalised to a same-origin path or `null`.
- `{ kind: 'mfaRequired', challengeId, methods }` — backend requires a second factor on sign-in; transitions to the managed `mfa` challenge slot and presents its challenge form. A provider link that returns `mfa_required` reports `{ kind: 'failed', intent: 'link' }`, keeping the flow visibly failed without presenting an MFA challenge or establishing a session.
- `{ kind: 'failed', intent, error }` — terminal callback failure (state mismatch, provider denial, or bad code). Kept in terminal state so the failure notice and retry controls stay visible. Attacker-supplied `errorDescription` is never exposed or rendered.

Both views take `mode="managed"`. `OAuthSignIn` takes genuine `flowStore` and `providers`. `OAuthCallback` takes genuine `flowStore` and `params`; it rejects `sessionStore`, `onSuccess`, `onStartOver`, and `onMfaRequired` in managed mode. Its start guard runs once per owner rather than across component lifetime. Start over or retry dispatches `startOverRequested` to return to sign-in. When a callback fails (including a failed provider link), the failure panel offers "Start again", which dispatches `startOverRequested` returning to fresh sign-in; no dedicated managed link retry route is provided.

#### Managed magic-link request and sign-in

The feature carries managed `magicLinkRequest` and `magicLinkSignIn` slots with handles `magicLinkRequestSlot` and `magicLinkSignInSlot`. `AuthFeatureDependencies` requires `requestMagicLink` and `signInWithMagicLink`.

Magic-link request submits an email address and keeps the editable flow and its sent confirmation on screen; it establishes no session. The parent routes from the one-reduction pulse `AuthFeatureState.magicLinkOutcome`:
- `{ kind: 'requestSent', email }` — link dispatched. The form displays its confirmation message alongside a "Back to sign in" button that dispatches `signInRequested` to return to sign-in.

Magic-link sign-in runs on a separate page load holding the query token. Crucially, the token **is never spent on mount, GET, or SSR render**; only explicit user interaction dispatches the sign-in exchange:
- On valid token exchange, the established session is handed to the parent via `handoff` with `source: 'magicLinkSignIn'`, pulses `magicLinkOutcome: { kind: 'signedIn' }`, and the slot is retired.
- If the backend requires a second factor (`mfa_required`), the feature branches immediately: it reports `magicLinkOutcome: { kind: 'mfaRequired', challengeId, methods }`, retires `magicLinkSignIn`, and presents the managed `mfa` challenge slot.
- If the token is missing (`token === null`) or expired (`error.code === 'token_expired'`), `MagicLinkSignIn` displays a notice with "Send me a new link", dispatching `requestNewLinkRequested` to open `magicLinkRequest`. Other failures (such as `network`) keep the "Sign in" button enabled to retry the token. "Sign in another way" dispatches `startOverRequested` to return to login. Navigation buttons are disabled and navigation actions are refused while an exchange is in flight. A new token prop arriving while submitting safely cancels the in-flight request, resets to idle, and correlates effect results by attempt so stale old results cannot establish a session. A direct `tokenProvided` action with the same token is a no-op and retains the current error.

Both views take `mode="managed"` and `flowStore`. In managed mode, standalone callbacks (`onSent`, `onSuccess`, `onMfaRequired`, `onRequestNewLink`, `sessionStore`) are rejected. When retired (`undefined` state), both render nothing. Both key their DOM subtrees to view owners.

#### Managed account summary and connected accounts (provider unlinking)

The feature carries managed `account` and `connectedAccounts` settings slots with handles `accountSlot` and `connectedAccountsSlot`. `AuthFeatureDependencies` requires `fetchAccount` and `unlinkOAuthProvider`.

Both slots belong to the signed-in account: opening either requires an authenticated subject in the session slot (`openAccount` and `openConnectedAccounts` are refused without one). Unlike temporary flows, they may coexist with each other and can survive temporary sign-in flows opened after them (though opening a settings slot is refused while a temporary sign-in flow is actively live). Sibling features maintain independent state. Any change of the authenticated subject (logout, switching to a different account, or session expiration) retires both with their active operations and drops late feedback.

- **Account read model (`accountSlot`)**: The slot carries the account read state and handles `accountRequested` and `reloadRequested`. When `ConnectedAccountsPanel` is given `accountStore`, its client-side mount effect dispatches `accountRequested` once per mounted view on client and **never runs during SSR** (`fetchAccount` is never called during SSR). Deliberate reload is supported via `reloadRequested`.
- **Connected accounts panel (`connectedAccountsSlot`)**: Renders provider status, disconnect buttons, and link actions.
  - **Truthful consumption**: Before account data is read, `providers` is `undefined` and the panel displays `"Reading your account…"` without rendering false empty states or disconnect buttons. When a passed `accountStore` has retired, it displays `"Account details are unavailable."`.
  - **Pruning unlinked knowledge**: Once an account re-read lands, `providersObserved` updates and prunes local unlinked tracking so detached providers can be connected again.
  - **Provider linking**: Reuses `oauthStart` (`authorizationRequested` with `intent: 'link'`), avoiding a duplicate link reducer. The feature provides `startOAuthLink` (`{ type: 'startOAuthLink', provider, returnTo? }`) to initiate provider linking with `intent: 'link'`, resetting temporary flows and routing authorization through the genuine `oauthStart` slot owner so in-flight requests are properly bound and cancelled on retirement. In `ConnectedAccountsPanel`, the supported `onLink` port or `oauthStore` enables initiating linking without leaving button dead ends.
  - **Unlink safety authority**: The backend remains the sole authority for unlink safety. No front-end rule denies unlink based only on password or provider count (`isLastWayIn` is strictly advisory and never disables the button).
  - **Outcome pulse**: Reports `AuthFeatureState.connectedAccountsOutcome` (a one-reduction pulse cleared by every routed reduction and pulsed only when `flow.settled === 'unlink'`):
    - `{ kind: 'unlinked', provider }` — provider detached. The parent decides whether to trigger an account reload via `reloadRequested` on `accountSlot`.
    - `{ kind: 'reauthenticationRequired', provider, methods }` — backend requires re-authentication. The demand message stays visible in the panel, with buttons remaining enabled.

`ConnectedAccountsPanel` takes `mode="managed"` and genuine `store` (`PresentationView<ConnectedAccountsState, ConnectedAccountsAction>`). It can also receive `accountStore` (`PresentationView<AccountState, AccountAction>`) and `oauthStore` (`PresentationView<OAuthStartState, OAuthStartAction>`), or consume `providers`, `hasPassword`, and `onLink` via props/context. Keyed DOM rendering prevents preflush event mismatch and stale clicks from reaching retired owners. Standalone props and behavior remain 100% supported.

#### Managed change-email request and confirmation

The feature carries managed `changeEmail` and `changeEmailConfirm` slots with handles `changeEmailSlot` and `changeEmailConfirmSlot`. `AuthFeatureDependencies` requires `requestEmailChange`, `resendEmailChange`, and `confirmEmailChange`.

Request and confirmation occur on distinct page loads:
- **Change-email request (`changeEmailSlot`)**: Belongs to the signed-in account. Opening is refused unless the session has an authenticated subject (`openChangeEmail` is refused without one or while a temporary auth flow is live). Like other account settings, it may coexist with other settings slots. It renders `ChangeEmailForm mode="managed" flowStore={view.store}`.
  - Submitting a new address sends a confirmation link and keeps the pending confirmation section visible with "Send it again" resend capability.
  - An address that already has an account (`email_taken`) is safely rendered as an informational offer rather than a red failure banner.
  - Re-authentication demands (`reauthentication_required`) render in the alert banner (`role="alert"`) with the backend message while keeping the form visible for re-authentication, and pulse the `reauthenticationRequired` outcome on both initial request failure and resend failure.
  - Reports `AuthFeatureState.changeEmailOutcome`:
    - `{ kind: 'requested', email }` — link dispatched.
    - `{ kind: 'resent' }` — confirmation resent.
    - `{ kind: 'reauthenticationRequired', methods }` — backend requires re-authentication.
  - Replay suppression: `settled` flag ensures only fresh transitions pulse an outcome.
- **Change-email confirmation (`changeEmailConfirmSlot`)**: Runs on the confirmation page load (`openChangeEmailConfirm`, `restartChangeEmailConfirm`, `closeChangeEmailConfirm`), seeded with the confirmation token.
  - **Zero work during SSR**: Renders instructions without starting verification; `confirmEmailChange` is never called during SSR.
  - **Mount effect**: On client mount, `EmailChangeConfirmation mode="managed" flowStore={view.store}` automatically consumes the seeded token from state (or can take an explicit `token` prop) and dispatches confirmation. Changing the token cancels the in-flight request; an attempt counter provides an additional stale-result check.
  - **Signed-in confirmation**: Uses the accepted current session; existing session subject is preserved.
  - **Signed-out confirmation & 401 sign-in route**: When confirmation fails with `invalid_credentials` (401), the component truthfully explains that the user must sign in to the account that requested the change, offering a "Sign in" button that dispatches `signInRequested` to route to login.
  - Reports `AuthFeatureState.changeEmailConfirmOutcome`:
    - `{ kind: 'confirmed', email }` — address successfully confirmed.
    - `{ kind: 'failed', error }` — confirmation failed (expired token, 401, etc.).
  - Retiring or closing the slot aborts in-flight requests and drops late results.

Both views take `mode="managed"` and `flowStore`. In managed mode, standalone callbacks (`onChanged`, `onReauthenticationRequired`, `onConfirmed`, `onSignIn`) are rejected at compile time (`never`). Both render nothing when their view is retired (`undefined` state) and key their DOM subtrees to view owners.

#### Managed change-password and delete-account

The feature carries managed `changePassword` and `deleteAccount` settings slots with handles `changePasswordSlot` and `deleteAccountSlot`. `AuthFeatureDependencies` requires `changePassword` and `deleteAccount`.

Both slots belong to the signed-in account: opening either requires an authenticated subject in the session slot (`openChangePassword` and `openDeleteAccount` are refused without one or while a temporary auth flow is live). Like other account settings, they may coexist with sibling settings slots. Any change of the authenticated subject (logout, switching to a different account, or session expiration) retires both with their active operations and drops late feedback.

- **Change-password (`changePasswordSlot`)**: Renders `ChangePasswordForm mode="managed" flowStore={view.store}`.
  - Submits new password and confirmation (enforcing the repository's `PASSWORD_MIN_LENGTH` 12-character minimum). The form and backend dependency require no current-password field (`changePassword: (newPassword: string, signal?: AbortSignal) => Promise<SessionSnapshot | null>`); backends that require authentication proof demand re-authentication explicitly.
  - On success, the sensitive password fields (`password`, `confirmPassword`) are immediately scrubbed from form state (`createInitialFormState`), avoiding retention of secret values in long-lived state.
  - When the backend demands re-authentication (`reauthentication_required`), the error alert displays the backend message while entered values are preserved so the user can re-authenticate without retyping.
  - Reports `AuthFeatureState.changePasswordOutcome` (a one-reduction pulse cleared by every routed reduction and pulsed only when `flow.settled !== null`):
    - `{ kind: 'changed', session: SessionSnapshot | null }` — password changed. If the backend returns a same-subject rotated session, the feature establishes it via the shared handoff with source `'changePassword'`; if `null`, the existing session is retained.
    - `{ kind: 'rejected', reason: 'subjectMismatch', session: SessionSnapshot, error: AuthError }` — if the backend returns a rotated session for a different subject, it is explicitly rejected, retaining the authenticated session and attaching the error to the flow.
    - `{ kind: 'reauthenticationRequired', methods }` — backend requires re-authentication.
  - While password change is submitting (`status === 'submitting'`), closing the slot (`closeChangePassword`), restarting (`restartChangePassword`), and presentation dismissal are refused (no-op), preserving the in-flight server mutation and session.
  - In managed mode, standalone callbacks (`sessionStore`, `onChanged`, `onReauthenticationRequired`) are rejected via `never`.
  - In standalone mode, completions are tracked via a durable reducer-owned `completionCount` on `ChangePasswordState` (incremented on each settled `changeSucceeded`) and a module-level `WeakMap<object, number>`, so that an unhandled completion is handed over on remount while the flow remains `changed`, while re-renders, field edits, and remounts with no new completion never duplicate handoffs. Standalone consumers must handle a completed result before starting another operation and discard the flow store on logout or account switch; the standalone component does not validate the current account before handing over a retained session.

- **Delete-account (`deleteAccountSlot`)**: Renders `DeleteAccountPanel mode="managed" store={view.store}`.
  - **Load-bearing confirmation gate**: The reducer enforces a strict two-step confirmation gate. A direct `deletionRequested` while idle is refused and never calls the backend; an explicit `confirmationRequested` action must precede deletion.
  - Dismissing confirmation (`confirmationDismissed`) returns status to `idle`.
  - **Irreversible operation & parent reduction**: Account deletion is irreversible at runtime. When deletion succeeds, the feature transitions the session to `anonymous`, clears all flows, and emits `deleteAccountOutcome: { kind: 'deleted' }`.
  - **Re-authentication handling**: If the backend requires re-authentication, the demand is rendered in the panel and reports `deleteAccountOutcome: { kind: 'reauthenticationRequired', methods }`. The panel allows re-confirming and retrying after re-authentication.
  - **Refusal while deleting**: While `status === 'deleting'`, closing the slot (`closeDeleteAccount`), restarting (`restartDeleteAccount`), and presentation dismissal are refused (no-op), ensuring the client does not abort or dismiss an active server deletion. A subject switch or `logout` safely retires the owner and aborts the request.
  - **Remount deduplication**: In standalone mode, a module-level `WeakSet<object>` tracking handed-over store instances ensures that remounting an already-completed standalone panel never duplicates `sessionStore.dispatch({ type: 'logout' })` or `onDeleted`. Deletion is terminal.
  - The optional `confirm` snippet prop is supported in both standalone and managed modes. In managed mode, standalone callbacks and authority props (`sessionStore`, `onDeleted`, `onReauthenticationRequired`) are rejected via `never`.

Both views take `mode="managed"`. When retired (`undefined` state), both render nothing and key their DOM subtrees to view owners. Standalone props and behavior remain 100% supported.

#### Managed session refresh and watcher (`sessionRefresh`)

The feature carries an optional managed `sessionRefresh` slot with handle `sessionRefreshSlot`. `AuthFeatureDependencies` requires `refreshSession` (and accepts optional `clock?: Clock`, `leadMs?: number`, and `tickMs?: number` for deterministic time decisions).

The slot belongs to the signed-in account:
- **Lifetime and guards**: Opening is refused unless the session has an authenticated subject (`openSessionRefresh` is refused without one or while a temporary auth flow is live). Like other account companions, it may coexist with sibling settings slots. Any change of the authenticated subject (logout, switching to a different account, or session expiration) retires the owner, aborting in-flight refresh requests and dropping late feedback. When status reaches `'ended'`, the view is preserved on the anonymous transition so that the user sees the ended notification/snippet.
- **Client attachment & watcher lifetime**:
  - **Zero SSR work**: No timers or network calls run during SSR (`$effect` does not execute on server).
  - **Client-only watcher start/stop**: On the client, mounting `SessionRefresh mode="managed" store={view.store}` (or `flowStore={view.store}`) dispatches `watchStarted` once for the presentation view owner.
  - **Multiple attachments**: Active attachments are reference-counted per view owner using a module-level `WeakMap`. The background watcher is shared without duplicate timers and stops only when the last attachment unmounts. An old-owner cleanup never stops a replacement owner.
- **Truthful expiry updates & session resolution**:
  - On successful refresh, the parent feature updates the authenticated session snapshot's `expires_at` truthfully, emitting `sessionRefreshOutcome: { kind: 'refreshed', expiresAt }`. It never re-authenticates a logged-out or different account.
  - If the backend returns `invalid_credentials` (401), the feature immediately transitions the slot to `ended`, emits `sessionRefreshOutcome: { kind: 'ended', error }` in that reduction, and initiates session resolution following existing `resolveSession` semantics (not unconditional logout). While resolution is in flight (`session.status === 'resolving'`), unrelated session actions leave the `ended` slot alone (refusing duplicate refresh requests). If the backend confirms the session is gone, the feature transitions to anonymous while preserving the ended view. If the backend or parent confirms the same authenticated user via an accepted transition into authenticated (such as `sessionResolved` matching status and epoch, `sessionEstablished`, or seeded `loginSucceeded`), the watcher recovers from `ended` to `idle` with the resolved expiry (including when the expiry is `null` or unchanged).
  - Transient or network failures do not destroy a valid session; the feature retains the session, restores status to `idle`, and emits `sessionRefreshOutcome: { kind: 'failed', error }`.
- **Distinct operation IDs**: The background watch subscription (`auth/flows/session-refresh/watch`) and the active refresh request (`auth/flows/session-refresh/refresh`) use distinct effect IDs.
- **One-reduction outcome pulse**: Reports `AuthFeatureState.sessionRefreshOutcome` (a one-reduction pulse cleared on every routed reduction and pulsed only when an in-flight refresh request settles):
  - `{ kind: 'refreshed', expiresAt: string | null }`
  - `{ kind: 'ended', error: AuthError }`
  - `{ kind: 'failed', error: AuthError }`
- **Security & tokens**: No bearer tokens or client cookie access; relies strictly on server-owned HttpOnly cookies and `credentials: 'include'`.
- Standalone props (`sessionStore`) are rejected via `never` in managed mode. Standalone mode preserves existing standalone watch/expiry forwarding and ending behavior.

For a standalone flow, omit `mode` and keep passing `sessionStore` as shown
below. `MfaChallengeForm` also requires `onStartOver` in standalone mode;
standalone `SignupForm` keeps its `onSuccess`, `onVerificationRequired` and
`onSignIn` callbacks. Standalone recovery forms keep their callback and token
props. Standalone OAuth components keep their `sessionStore`, `onSuccess`,
`onStartOver`, and optional `onMfaRequired` callbacks. Standalone magic-link
components keep their `onSent`, `onSuccess`, `onMfaRequired`, and `onRequestNewLink`
callbacks. Standalone `ConnectedAccountsPanel` keeps its `providers`, `hasPassword`,
`onUnlinked`, and `onReauthenticationRequired` callbacks. Standalone `ChangeEmailForm`
keeps its `onChanged` and `onReauthenticationRequired` callbacks; standalone
`EmailChangeConfirmation` keeps its `token`, `onConfirmed`, and `onSignIn` callbacks.
Standalone `ChangePasswordForm` keeps its `sessionStore`, `onChanged`, and
`onReauthenticationRequired` callbacks. Standalone `DeleteAccountPanel` keeps its
`sessionStore`, `onDeleted`, `onReauthenticationRequired`, and `confirm` props.

### Standalone stores

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

These two snippets assume a client-only application. For SSR, create session
and flow stores per request and pass them through props or context; do not share
these module-level stores between users.

<!-- consumer-file: stores.ts -->
```typescript
import { createSessionStore, createLoginStore } from '@composable-svelte/auth';
import { createHttpAuthDeps } from '@composable-svelte/auth/http';

// One dependency object drives both: the session calls and the flow calls.
const deps = createHttpAuthDeps();

export const session = createSessionStore(deps);
export const login = createLoginStore(deps);
```

Both HTTP dependency factories accept a second options argument, `{ fetch: clientFetch }`,
for a request-scoped transport or an isolated test client. When omitted, requests use
the current global `fetch`. Injecting a transport avoids swapping global browser or
server state. The adapter forwards each request's `AbortSignal`; custom cancellation
reasons retain their identity, while the effect runner's reporting policy is unchanged.

<!-- consumer-file: Auth.svelte -->
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
[`examples/auth-server`](https://github.com/jonathanbelolo/composable-svelte/tree/main/examples/auth-server): a Fastify reference
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
[`examples/auth-server`](https://github.com/jonathanbelolo/composable-svelte/tree/main/examples/auth-server), whose `pnpm dev` serves a
reference client against a reference server. The **Account** demo is
the signed-in half: the read model, changing a password, MFA management and
connected accounts, each with its re-authentication branch reachable from a
scenario picker.

## Related Packages

- [`@composable-svelte/core`](https://www.npmjs.com/package/@composable-svelte/core) - Core Composable Architecture, and the
  form system these flows are built on

## Resources

- [Architecture & tutorial guide](https://github.com/jonathanbelolo/composable-svelte/blob/main/guides/README.md)
- [CHANGELOG](./CHANGELOG.md)
- [Contributing](https://github.com/jonathanbelolo/composable-svelte/blob/main/CLAUDE.md)
