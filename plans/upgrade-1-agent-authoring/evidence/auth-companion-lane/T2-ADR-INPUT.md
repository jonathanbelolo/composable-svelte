# T2 ADR input: headless auth and optional chat composition

Status: proposal for the parent-owned shared ADR, not an approved public API. The test-only proof is in `packages/auth/tests/fixtures/managed-auth-shell.ts`; it uses production `ManagedIntegrationBuilder`, `optionalSlot`, `loginReducer`, `mfaChallengeReducer` and `sessionReducer`. It does not change core or the auth public contract.

The candidate type signatures, exact handoff signal, managed/standalone form prop union, and short `defineApplication`/`defineViews` assembly are in `C-PUBLIC-API-PROPOSAL.md`. They are ADR inputs, not compiled installed acceptance.

## Decision proposed

Classify the **auth headless business handoff** as **no core change**. A managed child reducer runs before its parent reducer. The parent sees a genuine lifted child action and updated child state in the same turn, can pass a `SessionSnapshot` to `sessionReducer`, and can retire a temporary flow. Owner-stamped effect feedback is dropped after removal or replacement. The parent app chooses its own route from the accepted session and flow state. This is measured by the B proof; it says nothing about the command-delivery or native attachment decisions for code/maps/media.

Ship a **package-owned auth composition fragment** after the shared ADR, rather than requiring every application to duplicate the proof fixture. A likely surface is a factory returning a typed `ManagedComposition<AuthFeatureState, AuthFeatureAction, AuthDependencies>` plus its genuine login/MFA slot tokens and initial-state helper. `AuthFeatureState` keeps the session for the lifetime of the feature and makes credential login and MFA challenge temporary child slots. Its reducer handles flow-to-session handoff and challenge branching. Opening while a flow is occupied must have an explicit no-op or replacement action; every write of fresh state over an occupied slot must declare `replaceOn`. Logout initiates retirement of both temporary flows. The application composes this auth feature into its root and owns route/destination policy by reducing the lifted auth actions after the auth child has updated; no success/MFA callback becomes a second business channel.

The fragment should expose an explicit accepted/rejected handoff outcome to the parent reducer (for example a typed result in auth state tied to the current flow identity). An app must not navigate merely because `session.status` was already `authenticated` before a new flow result. The proof fixture currently infers acceptance from session state identity (`next.session !== state.session`); that is a T2 design weakness to resolve in the public fragment.

The fragment's routing contract must also cover **view dismissal and session hydration**. The exact-commit Opus review found that a child view's `dismiss()` retires the slot before the parent runs, so a parent that handles only explicit `signInCancelled` can leave `route: 'mfa'` or `route: 'signIn'` with no flow there. Derive the destination from surviving flows and session state; when an accepted startup `sessionResolved` authenticates without a visible flow, route home. A live flow keeps its screen until dismissed. Logout is an exit hatch even while already anonymous: it retires temporary flows and routes to sign-in. The follow-up B fixture and tests demonstrate these policies; the app still owns its actual navigation choice.

Standalone `createSessionStore`, flow stores, forms and their callbacks remain supported compatibility APIs. For managed presentation, component props must accept the genuine captured `ChildView`/`PresentationView` contract with `state: S | undefined`, without a fabricated Store or a session dispatch capability passed to a leaf. Either adapt existing components with a type-checked managed/standalone prop union or ship explicit managed surfaces while retaining existing standalone components; the ADR should choose which satisfies the representative `ComponentProps<typeof LoginForm>` acceptance probe. A type cast is not evidence. Form subscriptions and field context must unsubscribe/rebind on owner replacement and avoid dereferencing a retired state.

## Proof semantics the fragment must preserve

1. **Business route:** accepted `loginSucceeded` and `challengeSucceeded` update persistent session through `sessionReducer`; `mfa_required` opens a challenge using the structured `challengeId` and methods. App navigation is derived by its own reducer from the accepted auth state, not from a component callback.
2. **Owner changes:** parent removal/replacement cancels pending child work and rejects late owner-stamped feedback. Same-ID challenge replacement also increments MFA `attempt`/`formGeneration`; owner retirement and in-flow operation correlation are separate protections.
3. **Logout:** retirement begins with logout, so an old flow cannot authenticate after `loggedOut`. A genuinely new sign-in opened later is new user intent; while logout remains in flight, `sessionReducer` refuses its handoff.
4. **Live-owner retry:** repeated login submissions use a fixed cancellable effect ID. A real stale callback from a superseded request must be tested under the production managed composition with a transport that ignores abort. The login reducer does not independently correlate a manually dispatched `loginSucceeded`; root-authority dispatch remains outside the managed effect channel.
5. **Effect ordering:** if the child returns an effect on an action that the parent retires, that child effect is suppressed; an effect returned by the parent on the same action still runs. The B probe tests this with the production managed runtime and auth reducers.
6. **SSR:** core defaults to deferring effects on the server. A Node reducer proof is not per-request HTTP/cookie isolation, HTML rendering or hydration. Those remain separate C acceptance tests.

## Composite shape shared with chat

The code/media/chat lane reports that chat already owns stream transport with `Effect.subscription` and stream/message IDs, while uploads are per-message cancellable. A chat composition should expose leaf conversation business actions to the parent reducer and keep typed chunks, native facts and presentation cleanup inside the owned feature. Optional code/media/Prism/PDF imports must remain absent from declarations and runtime when those peers are not installed. Installed absent/present configurations and the combined chat+code+media app are required after code/media contracts settle. This aligns with the auth pattern of child business actions entering one parent reducer route without callback output channels.

## Explicitly open before migration/release

- Parent/coordinating lead and independent Opus reviewer decide the fragment/API shape and record it in the shared ADR. This lane has not exported an auth fragment yet.
- Installed tarball `ComponentProps` assignment and a runnable `defineApplication`/`defineViews`/`FeatureViews` auth recipe, plus standalone positive controls.
- Browser/SSR request isolation, route replacement, sibling flow, backend and all other A-matrix capability rows. The current B fixture covers login/MFA only.
- Checker profile exact pins and active negative controls belong to the parent-owned T6 runner; opaque auth internals still require source/type/runtime review.
