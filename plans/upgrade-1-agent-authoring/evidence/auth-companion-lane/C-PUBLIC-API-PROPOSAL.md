# Candidate managed auth API for the shared ADR

**Status:** proposal only. No public export, component prop change, installed recipe, or C acceptance is claimed. The B fixture establishes runtime feasibility for session/login/MFA on existing core; it is not the API consumers should copy.

## Package-owned fragment

Export one package-owned feature factory and its typed slots from `@composable-svelte/auth/application` after the ADR. Its implementation absorbs the B fixture's handoff, owner retirement, and flow-opening rules. There is no route field in the feature.

```ts
interface AuthFeatureState {
  session: SessionState;               // persistent for the feature lifetime
  login: LoginState | null;             // optional managed presentation
  mfa: MfaChallengeState | null;        // optional managed presentation
  handoff: AuthHandoff | null;          // one-reduction output to the parent
}

type AuthHandoff =
  | { kind: 'accepted'; source: 'login' | 'mfa'; session: SessionSnapshot }
  | { kind: 'refused'; source: 'login' | 'mfa'; reason: 'loggingOut' };

type AuthFeatureAction =
  | { type: 'session'; action: SessionAction }
  | { type: 'login'; action: PresentationAction<LoginAction> }
  | { type: 'mfa'; action: PresentationAction<MfaChallengeAction> }
  | { type: 'openLogin' }
  | { type: 'restartLogin' }
  | { type: 'cancelSignIn' };

type AuthFeatureDependencies =
  SessionDependencies & LoginDependencies & MfaChallengeDependencies;
type AuthFeatureCatalog =
  Record<'login', SlotSchema<LoginState, LoginAction, {}, true>> &
  Record<'mfa', SlotSchema<MfaChallengeState, MfaChallengeAction, {}, true>>;

declare function createAuthFeature(): {
  composition: ManagedComposition<AuthFeatureState, AuthFeatureAction,
    AuthFeatureDependencies, AuthFeatureCatalog>;
  loginSlot: PresentationSlotHandle<AuthFeatureState, AuthFeatureAction, LoginState, LoginAction>;
  mfaSlot: PresentationSlotHandle<AuthFeatureState, AuthFeatureAction, MfaChallengeState, MfaChallengeAction>;
  initialState(): AuthFeatureState;
};
```

The package reducer opens login idempotently, uses a distinct restart action to replace an occupied login, opens MFA from `mfa_required`, and retires both temporary owners at logout. Both view `dismiss()` and `cancelSignIn` remove a flow; **the containing app** chooses the destination based on the surviving slot and session. A direct `logout` is an exit hatch even when already anonymous. No app copies the fixture reducer or a callback-based business handoff.

### Exact acceptance signal

`sessionReducer` currently accepts `sessionEstablished` in every state except `loggingOut`, returning the prior state on refusal. The B fixture infers acceptance from `next.session !== before.session`, which is only valid for that implementation. Before exporting the fragment, extract the session-established decision to one internal pure function returning a discriminated `{ kind: 'accepted'; state } | { kind: 'refused'; state; reason }`. Make the existing `sessionReducer` arm and the fragment call the same decision function. The fragment calls that decision **once**, writes its resulting session state and sets the `handoff` output from its discriminant, never from `session.status` or object identity. This is an auth package refactor, not a core API change.

`handoff` is a **one-reduction pulse**. The auth core first clears the previous pulse on every action routed to auth, then sets a new one only for a just-completed login or MFA handoff. Core runs the auth child before its parent, so the parent sees the pulse synchronously on that same auth-routed action and never consumes it on a parent-only action. It routes home on `accepted` and chooses its failure destination on `refused`. No parent `lastSeen` counter is needed: replacing the entire auth feature starts with `handoff: null`, and restoring an old state cannot replay its pulse on a later auth action because the child clears it first. A still-authenticated prior account cannot turn a refused switch into a false success. An `mfa_required` result opens the challenge slot; the app can route to its MFA screen from that visible state. Request/owner correlation stays separate: owner-stamped feedback and the existing fixed login effect ID protect in-flight operations. Core qualifies fixed IDs by owner before executing them, so distinct managed auth siblings do not cancel one another; `managed-auth-sibling-ownership.test.ts` measures that. A manually root-dispatched `loginSucceeded` remains root authority under today's reducer; this design does not claim to reject authoritative forgery.

## LoginForm and MfaChallengeForm props

Prefer one explicit discriminant on each existing component, preserving today's standalone call sites:

```ts
type LoginFormProps = SharedLoginPresentationProps & (
  | { mode?: 'standalone'; flowStore: StandaloneLoginStore;
      sessionStore: { dispatch(action: SessionAction): void };
      onSuccess?: (() => void) | undefined;
      onMfaRequired?: ((challenge: { challengeId: string;
        methods: readonly MfaMethod[] }) => void) | undefined }
  | { mode: 'managed'; flowStore: PresentationView<LoginState, LoginAction>;
      sessionStore?: never; onSuccess?: never; onMfaRequired?: never }
);
```

The same managed/standalone distinction applies to MFA. The managed branch performs no session handoff and emits no success/MFA callback: the fragment reducer handles those outcomes. Its "start over" button should dispatch a domain `startOverRequested` action that the fragment turns into fresh login state; this is an explicit input action, not a business-result callback. The standalone branch retains its current `sessionStore` and `onStartOver` behavior.

`PresentationView.state` is `S | undefined` after retirement. The managed component must render the form only while its captured view has state, unsubscribe on retirement, and never read `.form` from an undefined state. Its form projection may keep the last valid `FormState` only until Svelte unmounts the retired subtree; it must not dispatch a new request from that projection. The form subtree should be keyed by the captured view so replacement cannot retain an old field subscription. Verify this with `ComponentProps<typeof LoginForm>` / `ComponentProps<typeof MfaChallengeForm>` assignments from genuine `PresentationFeatureViewProps` and runtime replacement/dismissal tests, with no cast and no fabricated `Store`.

## Installed recipe shape to compile in C

This is the exact intended ownership chain, still an **uncompiled proposal** until the package export and installed tarball exist:

```ts
const auth = createAuthFeature();
const app = defineApplication(auth.composition, {
  initialState: () => auth.initialState(),
  startup: () => ({ type: 'session', action: { type: 'resolveSession' } })
});
const views = defineViews(auth.composition, {
  login: { content: loginContent },
  mfa: { content: mfaContent }
});
```

```svelte
{#snippet loginContent(view: PresentationFeatureViewProps<LoginState, LoginAction>)}
  <LoginForm mode="managed" flowStore={view.store} />
{/snippet}
{#snippet mfaContent(view: PresentationFeatureViewProps<MfaChallengeState, MfaChallengeAction>)}
  <MfaChallengeForm mode="managed" flowStore={view.store} />
{/snippet}
<FeatureViews store={appInstance.store} definition={views}>
  {#snippet children(handles)}
    <FeatureOutlet view={handles.login} />
    <FeatureOutlet view={handles.mfa} />
  {/snippet}
</FeatureViews>
```

The host app supplies `AuthFeatureDependencies` to `ApplicationRoot`, mounts `ApplicationHost`, and owns URL/navigation decisions. A parent that embeds auth in a larger composition uses `.with(authSlot, auth.composition, { dismissal: 'deferred', replaceOn: explicitReset })`, with `auth: AuthFeatureState | null`. Its core consumes `state.auth?.handoff` only on an auth-routed `presented` action; it ignores the parent auth slot's dismiss request so a nested child cannot silently remove the persistent session. Parent `defineViews` uses `auth: { content: authContent, children: authViews }`, and `authViews` comes from that same auth composition instance. A `defineViews` content snippet is necessary because the managed form also needs its `mode` prop; `render: LoginForm` alone cannot satisfy `PresentationFeatureViewProps`. C must compile this against installed tarballs, prove the standalone branch still works, exercise whole-feature replacement and restored state with no lost/replayed handoff, exercise flow replacement/dismissal in the browser, and verify Node/SSR request separation. The B proof does none of those installed checks.

## ADR choices required before implementation

1. Approve the package-owned fragment and one-reduction accepted/refused pulse. A sequence alone is unsafe across whole-feature replacement unless paired with parent-owned instance identity; the pulse avoids that bookkeeping.
2. Choose the discriminated existing-component props above versus a separate managed surface. Either choice must retain a typed standalone path and handle retired `PresentationView.state` safely.
3. Decide whether login result request correlation must reject manually root-dispatched replay. Existing owner stamping protects effect feedback, not root authority.
