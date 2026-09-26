# B-PROOF-INPUT: Headless Auth, MFA-to-Session Handoff & Composition Analysis

Proof input for Batch B lane B3 (auth): the headless login / MFA-to-session handoff, the existing-core parent composition it can use, the decisive cases, and the least-authority mismatch in `LoginForm`. Section 5 records what was actually proved and where.

**Status.** A proof on existing core, plus one auth source fix it exposed. No core, checker, manifest or lockfile changed. One auth source file changed: `loginReducer` now starts its request only on a `submissionSucceeded` that completes a submission in flight (section 1, obstacle 1.2a), recorded under `[Unreleased]` in `packages/auth/CHANGELOG.md`. The composition itself is test-only. `LoginForm` and the package's public API are unchanged. This is **not** the C3 auth migration and not a broad managed migration of auth: no composition fragment ships, no component accepts a managed view, no reference documentation changed, and of the inventory's capability rows only password sign-in, the MFA challenge and the session are exercised here.

**Revision (2026-09-24, after independent review).** Three measured findings are addressed below. (1) `signInOpened` over an occupied login slot rewrote the state but left the old owner and its request alive; opens are now refused over a live flow. (2) `loginReducer` started a request on a `submissionSucceeded` the form had refused, with the current (for example reset) fields; fixed in source. (3) A flow result landing *after* `loggedOut` re-authenticated, because `sessionReducer` refuses `sessionEstablished` only while `loggingOut`; the parent now retires flows on `logout`. The earlier section 3 case 2 and section 5 row that said "ownership does not protect here" described the old fixture and are replaced.

**Revision 2 (2026-09-24, after the second independent review, `OPUS-REVIEW-2.md`).** Fixture, test and wording changes only; no further source behaviour change (the `loginReducer` edit in this revision is its comment). (1) The MFA slot's `replaceOn` matched every `login` action while both slots were occupied, so a keystroke in the sign-in form retired a live challenge and aborted its verification; it now fires only when a `login` action changed `mfa`, which only the parent's MFA branch does. (2) A managed regression for two overlapping requests in one live login owner. (3) Same-test positive controls for the two logout cases that had none. (4) Wording: an *unstamped* `submissionSucceeded` while nothing is submitting is **accepted** by core's form reducer and refused by the login flow, not "refused by the form"; and login's guard is MFA's two checks, not all of MFA's guard. (5) The parent reads handoff acceptance from the session transition, not from `authenticated`; hands over only a snapshot the flow just accepted, so a stale action into a hydrated `succeeded` MFA flow no longer re-establishes its stored session; and cancelling sign-in routes by the session (`home` when an account is still signed in). The open finding on the seven sibling form flows is **not** addressed in this revision (see open items).

**Revision 3 (2026-09-24, after exact-commit Opus review of `e9bbb3c6`).** The reviewer found that view `dismiss()` retired a login or MFA slot but left its route at the dismissed screen; a separate `signInCancelled` route test had not covered the view action. The parent now derives the visible route after either view dismissal. Accepted session feedback also derives the resting route when no flow is showing, so an authenticated `resolveSession` reaches `home`. A live flow keeps its own route. `logout` is explicitly the exit hatch even from an anonymous session: it retires live login and MFA attempts and routes to sign-in. These are fixture policies for the proposed fragment, with direct regressions. The seven sibling form guards were committed separately as `0d068f1f` and independently approved; see `A-INVENTORY.md` and `OPUS-REVIEW-SIBLINGS.md`.

**Revision 4 (2026-09-24, after narrow independent review of `c40ebc30`).** The reviewer verified the fixture behavior but found that the first follow-up's tests did not discriminate all of its stated routing rules. Four further focused regressions now cover background revalidation and stale session feedback from `home`, immediate logout from `home`, and dismissal while the other flow survives (both directions). `OPUS-REVIEW-4.md` separates the reviewer's verdict from the implementer's later disposition.

**Citations.** Paths are relative to this file. Line numbers are plain text. `flows/login/reducer.ts` and the fixture lines are at this revision; everything else is pinned to commit `7861fbe8`. All will drift; the symbol named beside each one is the stable anchor.

---

## 1. Current Headless Login / MFA-to-Session Obstacles

Sources: [`LoginForm.svelte`](../../../../packages/auth/src/lib/components/LoginForm.svelte), [`flows/login/reducer.ts`](../../../../packages/auth/src/lib/flows/login/reducer.ts), [`flows/mfa-challenge/reducer.ts`](../../../../packages/auth/src/lib/flows/mfa-challenge/reducer.ts), [`session/reducer.ts`](../../../../packages/auth/src/lib/session/reducer.ts), [`managed-integration.ts`](../../../../packages/core/src/lib/navigation/managed-integration.ts).

The reducers are already composable; the auth skill documents composing `loginReducer` into a parent and doing the `sessionEstablished` handoff there. The obstacle is narrower than "impossible headlessly". The package's only **shipped** handoff and MFA branch live in component effects and callbacks, and no parent composition that does them is shipped or demonstrated.

### Obstacle 1.1: The shipped session handoff is a component `$effect`
- **Location**: `LoginForm.svelte` lines 252-262 (the second `$effect`); the dedupe flag `handedOver` is at line 199.
- **Code**:
  ```svelte
  $effect(() => {
  	const { status, session } = flowStore.state;
  	if (status !== 'succeeded') {
  		handedOver = false;
  		return;
  	}
  	if (session === null || handedOver) return;
  	handedOver = true;
  	sessionStore.dispatch({ type: 'sessionEstablished', session });
  	onSuccess?.();
  });
  ```
- **Details**:
  - Without a mounted `LoginForm`, nothing dispatches `sessionEstablished`. A headless consumer must write the handoff itself.
  - Svelte does not run `$effect` during server rendering, so this path never runs on the server.
  - `handedOver` is component-local. A remount while the flow is still `succeeded` starts with `handedOver = false`, so the effect dispatches `sessionEstablished` again. The session reducer tolerates that, but the dedupe is not state-owned.

### Obstacle 1.2: `loginReducer` records success and emits nothing
- **Location**: `flows/login/reducer.ts` lines 135-140 (`case 'loginSucceeded'`).
- **Details**: The reducer sets `status: 'succeeded'` and `session`, and emits `Effect.none()`. This is by design: a leaf flow does not know about the session. The handoff must happen outside, either in a component or in a parent reducer. A parent reducer composition is possible today, but the package ships none.
- **Also relevant**: `loginSucceeded` has **no status or request guard**. The reducer accepts it in any status, so a root dispatch of `loginSucceeded` into a live flow is indistinguishable from the flow's own feedback (proved in section 5). Unchanged by this revision; see the open items.

### Obstacle 1.2a (fixed): the request started on a refused `submissionSucceeded`
- **Location**: `flows/login/reducer.ts` lines 93-107 (the `form` arm's guard).
- **Defect, measured**: the arm tested only `action.action.type === 'submissionSucceeded'`. Core's form reducer (`form.reducer.ts` line 744) refuses a stale *stamped* one — a superseded `submissionId`, or a stamped one when nothing is submitting, as after `formReset` — by returning its state unchanged, but the flow still went to `submitting` and called `deps.login` with whatever the fields then held. Red run: after type → submit → `formReset` during validation → stale `submissionSucceeded`, `deps.login` was called once, with the reset (empty) fields.
- **Unstamped, corrected wording**: a `submissionSucceeded` with no `submissionId` has nothing for core to check, and core **accepts** it in any state (clears `isSubmitting`, increments `submitCount`). It is the login flow's own `state.form.isSubmitting` clause that refuses it when nothing was submitting. The earlier description "the form refused it" was wrong for this case; the test is now named for what it shows and asserts both halves (form accepted, flow refused).
- **Fix**: proceed only if the form state changed (`withForm.form !== state.form`) and a submission was in flight (`state.form.isSubmitting`). These are the same two checks `mfaChallengeReducer` makes; they are **not** all of MFA's guard. MFA additionally drops `submitTriggered` while validating, submitting or not `idle`, and ignores `submissionSucceeded` while `submitting` or `succeeded` (one code per attempt). Login deliberately lets a new submission supersede one in flight (same effect ID, section 5). Each login clause is covered by its own test and mutation (section 5).
- **Scope**: the organic single-store path is already protected by core (`formReset` cancels `validate-form` / `submit-form` and bumps the ids), so the stale action here comes from a replay, a queued dispatch or root authority. The guard makes the flow agree with the form instead of relying on that.

### Obstacle 1.3: `mfaChallengeReducer` likewise records success and emits nothing
- **Location**: `flows/mfa-challenge/reducer.ts` lines 222-232 (`case 'challengeSucceeded'`).
- **Details**: Same shape as login. The difference is that MFA feedback carries an `attempt` correlation. With `attempt` present, a result is accepted only while `submitting` and only for the current attempt. With `attempt` absent, the result is accepted unconditionally, as an assertion.

### Obstacle 1.4: The shipped MFA branch is a component `$effect` plus callback
- **Location**: `LoginForm.svelte` lines 212-223 (`reportedChallenge` and the first `$effect`). The `mfa_required` failure is dispatched by the login effect at `flows/login/reducer.ts` line 128.
- **Details**: Forwarding `challengeId` and `methods` to an MFA flow depends on `LoginForm` running this effect and calling `onMfaRequired`. Headlessly, the error stays in the flow's `error` until someone reads it. A parent reducer can read it, as section 5 proves.

### Obstacle 1.5: The session reducer is a passive sink for `sessionEstablished`
- **Location**: `session/reducer.ts` lines 321-346 (`case 'sessionEstablished'`).
- **Details**: `sessionEstablished` is refused only while `loggingOut` and accepted in every other status. Something outside the session must send it. The flows are separate reducers (usually separate stores, via `createLoginStore` / `createMfaChallengeStore`), so a coordinator must exist: today a component, or a parent reducer the application writes.

---

## 2. Existing-Core Parent Reducer Composition

[`managed-integration.ts`](../../../../packages/core/src/lib/navigation/managed-integration.ts) provides pure parent-child composition. `ManagedIntegrationBuilder`, `optionalSlot` and `nestedSlot` are exported from `@composable-svelte/core/application`. `integrate(core).managed()` returns the same builder.

### 2.1 `ManagedComposition.reduce` (lines 381-398)

```ts
reduce(state: S, action: A, deps: D, context: Context, core: Reducer<S, A, D> = this.reducer): Result<S, A> {
    let next = state;
    const effects: EffectType<A>[] = [];
    const replacements: ReplaceIntent[] = [];
    for (const child of this.children) {
        const result = child.reduce(next, action, deps, context);
        next = result.state;
        effects.push(result.effect);
        replacements.push(...result.replacements);
    }
    const [final, parentEffect] = core(next, action, deps);
    effects.push(parentEffect);
    for (const child of this.children)
        replacements.push(...child.replacements(state, final, action, context.prefix));
    return {
        state: final, effect: Effect.batch(...effects), replacements
    };
}
```

### 2.2 Ordering and invariants

1. **Children first, in registration order** (line 385). An optional-slot child reduces only when its slot is occupied and the action unwraps to it (`slot.unwrap`, line 518; a destination slot matches by `occupant`, line 680).
2. **Parent core second, over the children's result** (line 391). When the core receives `{ type: 'login', action: { type: 'presented', action: { type: 'loginSucceeded', … } } }`, `state.login.status` is already `'succeeded'`, in the same synchronous reduction.
3. **A parent handoff is therefore a pure reduction.** The core can call `sessionReducer` with `sessionEstablished` and remove the flow in the same step. See [`managed-auth-shell.ts`](../../../../packages/auth/tests/fixtures/managed-auth-shell.ts). Two corrections to the sketch previously given here:
   - Trigger on the **lifted child action** (`loginSucceeded`, `loginFailed` + `mfa_required`, `challengeSucceeded`), not on polling `state.login.status === 'succeeded'` for every action. Also require the slot to be occupied: a root dispatch addressed to a removed flow still reaches the core.
   - Read the outcome of `sessionReducer` rather than restating its `loggingOut` rule. In either case remove the flow: a refused result must not linger as `succeeded`.
   - **Every fresh write into a slot must retire or refuse.** An optional slot allocates a new owner only when it goes from empty to occupied, or when `replaceOn` names the action (`replaceOn` fires only when the slot is occupied both before and after). A core that writes `createInitial…()` over an occupied slot without `replaceOn` changes what the user sees while the old owner, and its request, stay live — its late result then lands in the "fresh" flow. The fixture now: refuses `signInOpened` while `login` or `mfa` is live; replaces on `signInRestarted`; replaces `mfa` when the MFA branch (a `login` action) writes over an occupied `mfa` slot.
   - **`replaceOn` must name the write, not the action family.** The first version of the MFA predicate was `action.type === 'login'`. Because `replaceOn` is consulted for every action while the slot is occupied before and after, that retired a live challenge on every sign-in keystroke, submit and plain failure while both slots were occupied (review 2). The predicate is now `action.type === 'login' && after.mfa !== before.mfa` (`mfaReplaced`): a `login` action never reaches the MFA child, so a changed `mfa` under one is the parent's write. The action clause is required — without it, the MFA child's own reductions change `mfa` and would retire it (mutation MA2).
   - **Acceptance is a transition.** `establish` reads `next.session !== state.session`. `authenticated` is not acceptance: a refused switch of account leaves the previous account authenticated. This relies on a refusing session reducer returning its state unchanged, as `sessionReducer` does; a refusal recorded in a new state would be misread, which is why an exact accepted-result observation remains a T2 requirement.
   - **Hand over what the flow just accepted.** The handoff requires `flow.session === child.session` (the reducer stores the accepted action's snapshot). For MFA this stops a stale `challengeSucceeded` into an already-`succeeded` flow — reachable from hydrated or hand-built state — from re-establishing the stored snapshot. For login it is always true today (`loginReducer` accepts every `loginSucceeded`), so it changes nothing and no test can discriminate it (mutation MC2 survives); it is kept so both handoffs follow one rule. Identity cannot distinguish a root replay of the very same object: that is root authority.
   - **Route after flow removal and session feedback.** `signInCancelled` and a child view's `dismiss()` derive the route from the surviving flow, or from the session if neither flow remains. Accepted session feedback chooses the resting route when no flow is visible; a live flow keeps its screen. An authenticated startup `resolveSession` therefore reaches `home`, and a dismissed account switch returns to the still-authenticated account. The first two revisions covered cancellation but omitted view dismissal and hydration; the exact-commit review caught both gaps.
   - **Logout retires flows.** The core removes `login` and `mfa` when it forwards `logout` to the session, even if that session is already anonymous. It routes to sign-in. Their results are dropped by ownership whichever side of `loggedOut` they land on. A flow opened after `logout` is new intent and stays live.
4. **This is pure and headless, but the requests are effects.** Reduction needs no component or DOM. The credential and challenge requests, and the form validation that leads to them, are effects. Core **skips all effect execution on the server by default**: `isServer()` plus `ssr.deferEffects` defaulting to `true`, in `store.svelte.ts` and `execution/runtime.ts`. A server or worker store performs no auth I/O unless it opts in with `ssr: { deferEffects: false }`. The same applies to the session store's own requests.
5. **Owner stamping.** Child effects are stamped with the child slot's owner (`stampOrigin`, lines 545 and 689) and lifted with `liftEffect(…, slot.wrap, claim)`. The runtime drops a dispatch whose origin owner is no longer live, at enqueue and again at dequeue (`execution/turn-queue.ts`). A root `store.dispatch` has no origin, so it has root authority and is never filtered this way.
6. **Replacement and cleanup.** `_reduce` (lines 360-372) keeps only replacement intents whose paths survive the reduction. Retiring an owner disposes its resources: an in-flight `Effect.cancellable` has its `AbortSignal` aborted. Section 5 shows this for replacement, parent removal, view dismissal, logout and store destroy. **No `Effect.cancel(<id>)` is emitted**: retirement, not the flow's own cancel, ends the request. `onCreate` / `startup` effects run for newly allocated owners (lines 557-561).
7. **A child effect produced by the retiring action itself does not run; a parent effect from the same action does.** Measured with a probe parent over the production reducers and builder (section 5): the child reduces the lifted `submissionSucceeded` into `submitting` and returns its request effect, the parent removes the child and issues `resolveSession` in the same reduction. `deps.login` is never invoked; `fetchSession` is invoked once and its feedback is reduced. The auth shell itself never retires a flow on an action that gives the child an effect, so this is a core-semantics check on auth reducers, not an auth policy.

---

## 3. Decisive Test Cases (as specified; see section 5 for results)

### Test Case 1: Replacement / removal
- **Setup**: an optional `login` or `mfa` slot with a request in flight.
- **Action**: replace the flow (same slot, `replaceOn`), remove it from the parent (slot set to `null`), or dismiss it through its presentation view.
- **Expected**: the slot owner retires and the request's `AbortSignal` aborts. A late result from the request is dropped before any reducer sees it, and the session is untouched. *Corrected:* removal does **not** dispatch `Effect.cancel(LOGIN_EFFECT_ID)` / `Effect.cancel(CHALLENGE_EFFECT_ID)`; owner retirement cancels the request.

### Test Case 2: Logout race
- **Reference**: `session/reducer.ts` lines 332-334 (the `loggingOut` refusal in `sessionEstablished`).
- **Setup**: an authenticated session, and a sign-in flow (or its MFA step) for another account with its request in flight.
- **Action**: dispatch `logout`; let the sign-in result land (a) during `loggingOut`, (b) after `loggedOut`.
- **Measured defect in the earlier fixture**: the flow outlived `logout`. Ordering (a) was saved only by `sessionReducer`'s `loggingOut` refusal. Ordering (b) re-authenticated: after `loggedOut` the session is `anonymous`, which accepts `sessionEstablished`; the late result signed Bob in (reproduced by mutation M5 below: `anonymous` → `authenticated` as Bob, route `home`).
- **Policy now**: the parent retires both flows on `logout`. **Expected**: in both orderings the request is aborted and the result is dropped by ownership before any reducer; the session goes `loggingOut` → `anonymous`; Bob never appears in any notified state; an MFA route falls back to `signIn`.
- **`sessionReducer`'s refusal, separately**: it still matters for a flow opened *after* `logout` (new intent, deliberately not retired) whose result lands during `loggingOut`. That flow's feedback is reduced, `sessionReducer` refuses it, and the parent removes the flow. The refusal is also pinned directly by the existing `session-established.test.ts` ("is refused while a sign-out is in flight").

### Test Case 3: Same-ID challenge replacement
- **Reference**: `flows/mfa-challenge/reducer.ts` lines 176-197 (`challengeProvided`). Component-level deduplication by ID is in `MfaChallengeForm.svelte` lines 105-112. *Corrected:* the earlier reference, `LoginForm.svelte` lines 205-212, is the `reportedChallenge` comment, not challenge replacement.
- **Action**: `challengeProvided` with the **same** `challengeId` while a verification is in flight.
- **Expected**: not a no-op. The form resets, `status` returns to `idle`, `error` and `session` clear, and `attempt` and `formGeneration` each increment. `Effect.cancel(CHALLENGE_EFFECT_ID)` aborts the in-flight verification; this runs under the same owner, so ownership plays no part. A late or replayed result stamped with the old attempt is refused.

### Test Case 4: Stale manual action
- **Reference**: `flows/mfa-challenge/reducer.ts` lines 95-104 (generation guard) and 222-227 (attempt guard).
- **Expected**: a `form` action with an old `generation`, and a `challengeSucceeded` with an old `attempt`, are both dropped. *Added:* a `challengeSucceeded` with **no** `attempt` is accepted unconditionally, and login's `loginSucceeded` has no correlation at all. The runtime cannot distinguish a manual root dispatch from real feedback; only these reducer guards can.

### Test Case 5: Headless and server isolation
- *Corrected:* the sequence does **not** run "synchronously to completion". Validation and requests are asynchronous effects. On the server, core runs no effects unless the store sets `ssr: { deferEffects: false }`.
- **Expected**: with nothing mounted, the parent handoff and the MFA branch occur in reduction. Two stores built from one composition share no state, owners or in-flight requests, and destroying one while **both** have a request in flight aborts only its own. By default a Node store performs no auth I/O, yet a result dispatched to it still hands over. Opted in, the full login → MFA → session sequence completes in two Node stores whose requests interleave in one process.
- **Narrowness of the Node evidence**: the Node tests run the fixture where `window` and `document` do not exist. They are not SSR in the product sense: no HTTP server, no per-request store factory, no cookies or request headers, no `renderToHTML`, no hydration, and no concurrency beyond promise interleaving in one process. "Request isolation" is therefore **not** shown; only "two stores do not share state". The opted-in case demonstrates that the reducers run under Node, not that a server-side sign-in path is recommended or safe.

### Test Case 6: Session operation freshness (epoch)
- **Reference**: `session/reducer.ts` lines 9-19 (header), 111-119 (`sessionResolved`), 191-198 (`loginSucceeded`), 286-291 (`loggedOut`).
- **Expected**: feedback applies only when the status matches and `action.epoch === state.epoch`. This concerns the session store's own seeded `login`, resolve and logout. It is already covered by the existing session suites (`session-reducer.test.ts`, `logout-liveness.test.ts`), and the new proof does not repeat it. Flow results reach the session through `sessionEstablished`, which carries no epoch.

---

## 4. Least-Authority Prop Mismatch

`LoginForm` declares `sessionStore: { dispatch(action: SessionAction): void }` (line 56). It uses it once, for `sessionEstablished` (line 260).

1. **Broader than needed.** The prop can dispatch any `SessionAction` (`logout`, `resolveSession`, `loginFailed`, …) to the session store it is given. It needs one action. Narrowing it is a T3 question. *Corrected:* the reach is that one store, not "the entire application".
2. **The component doubles as the integration point.** The rationale in `LoginForm.svelte` lines 5-11 holds that a required `sessionStore` prop fails loudly when omitted, whereas a parent-reducer handoff fails silently when forgotten. **That argument still holds against the managed composition as it stands:** a parent core that omits the handoff compiles, and the flow sits in `succeeded` while the session never changes. Slot schemas and catalogs type the slots; they do not require a handoff. The earlier claim that "static type safety is enforced by the slot schema" is withdrawn. So is the claim that the rationale predates managed composition, which was not verified. Making the handoff hard to forget is what a shipped, reusable auth composition fragment would provide (assessment: "Auth should provide reusable headless flow-to-session coordination"). Whether it ships, and in what shape, is a T2 decision.
3. **The managed-view target is not current.** `ManagedComposition.bind` yields `ChildView` / `PresentationView`, whose `state` may be `undefined` after retirement. The installed type probe in the companion assessment shows that today's `LoginForm` **rejects** that view. A `LoginForm` that takes only its own flow view and no `sessionStore` is the migration target, not current behaviour.

---

## 5. Proof Results

Fixture and tests (test-only, not exported), plus the one source fix:

- [`tests/fixtures/managed-auth-shell.ts`](../../../../packages/auth/tests/fixtures/managed-auth-shell.ts): `AuthShellState { session; login | null; mfa | null; route }`. `new ManagedIntegrationBuilder(authShellCore).with(loginSlot, loginReducer, { replaceOn: signInRestarted }).with(mfaSlot, mfaChallengeReducer, { replaceOn: mfaReplaced }).build()` (lines 261-274), where the slots come from `optionalSlot` and `mfaReplaced` is "a `login` action changed `mfa`". The session is a persistent `scope`d child, not a slot. `createAuthShellCore(session = sessionReducer)` (line 147) builds the parent core over a session reducer — the parameter exists only so a test can place a stricter session under the same parent; `authShellCore` is the production-reducer instance. The core consumes the lifted child actions to call the session reducer and set `route`; reads acceptance from the transition (`establish`, line 135); hands over only a snapshot the flow just accepted (lines 197, 227); refuses `signInOpened` over a live flow (line 171); routes a cancel by the session (line 182); retires both flows on `logout` (lines 153-167).
- [`tests/fixtures/managed-auth-drivers.ts`](../../../../packages/auth/tests/fixtures/managed-auth-drivers.ts): dependencies whose requests stay pending until settled and record their `AbortSignal`, plus input through `authShell.bind(...)`, the managed view a component would receive. Unchanged in revision 2.
- [`tests/managed-auth-composition.test.ts`](../../../../packages/auth/tests/managed-auth-composition.test.ts): 25 tests in the browser runner (18 + 7 in revision 2), nothing mounted.
- [`tests/ssr/managed-auth-composition.node.test.ts`](../../../../packages/auth/tests/ssr/managed-auth-composition.node.test.ts): 3 tests, Node environment, no DOM (header now states what it does not show).
- [`src/lib/flows/login/reducer.ts`](../../../../packages/auth/src/lib/flows/login/reducer.ts) (source fix) and [`tests/login-flow.test.ts`](../../../../packages/auth/tests/login-flow.test.ts) (+3 tests, `a submission result that completes no submission in flight`; renamed in revision 2 from `a submission result the form refused`, which misdescribed the unstamped case).

Every recorder-based "never reduced" assertion (`presented(...)` of length 0) in the composition suite has a positive control **in the same test** — the same action shape recorded from a live owner, or dispatched with root authority — so an empty list means dropped rather than never observable. Revision 2 added the two that were missing (result after `loggedOut`; logout during MFA). The claim is limited to those assertions: the probe's `logins` length of 0 ("the child effect … never ran") is a request count, and its control is a separate test.

| Case | Test | Measured result |
| --- | --- | --- |
| Headless login success | `establishes the session and routes home from the lifted loginSucceeded` | Session `authenticated`, flow removed, route `home`; no component, no callback |
| MFA branch + success | `branches to MFA on mfa_required and establishes the session on challengeSucceeded` | Parent opens `mfa` with the error's `challengeId` and `methods`; challenge success authenticates |
| Open over a live login (finding 1) | `open → submit → open: the second open is refused, …` | State object unchanged, signal not aborted, same view; the late success is the attempt on screen (Ada) |
| Open over live MFA; old MFA result (finding 1) | `open over a live MFA step is refused; restart retires it, …` | Open refused (route stays `mfa`); restart aborts the challenge. New flow with the **same** challenge ID submitting attempt 1, so MFA's own correlation cannot distinguish; the old result is never reduced, the new one authenticates |
| MFA branch over occupied MFA (finding 1) | `the MFA branch over an occupied MFA slot replaces the old challenge owner` | Old challenge aborted and its result dropped; new challenge authenticates. Reachable only from a hydrated/hand-built state |
| Login input with both slots live (review 2) | `login input while both slots are live leaves the MFA owner and its verification alone; only the branch replaces it` | MFA verification in flight; typing, submit, request start and an `invalid_credentials` failure in the login slot: MFA signal not aborted, same MFA view, captured view still `submitting`. The `mfa_required` branch then aborts it, retires the captured view, installs `chal-2`; the old result is never reduced and the new challenge authenticates (control) |
| 1 Replacement | `replacement retires the old owner: …` | Old signal aborted, captured view retired, late result never reduced, retired-view dispatch dropped while the live view's is reduced, replacement live |
| 1 Removal | `removal by the parent drops …`, `dismissal through the MFA presentation view …` | Signal aborted; late result never reduced; session untouched; a reopened flow / root dispatch is recorded (controls) |
| Cancel routes by session (review 2) | `cancelling a switch of account while signed in returns home, …`, `cancelling the MFA step while signed out leaves the MFA route for sign-in` | Signed in as Ada with Bob's sign-in in flight: cancel aborts it, removes the flow, route `home`, Ada still signed in. Anonymous on `mfa`: cancel → `signIn`. Before: route stayed `signIn` / `mfa` |
| Dismiss routes by surviving state (review 3) | `dismissal through a login view returns to the still authenticated account`; `dismissal through the MFA presentation view …` | Login dismiss during account switch aborts Bob's request, retains Ada and routes `home`; MFA dismiss aborts verification and routes `signIn`. Both assert the route after late results too |
| Session hydration route (review 3) | `routes an authenticated session resolution home without a mounted flow`; `keeps a live login route during resolution, then follows the session after dismissal` | Accepted `sessionResolved` authenticates Ada and routes `home` when no flow is shown; with a live login it stays `signIn` until dismissal, then routes `home` |
| Settled versus stale session feedback (review 4) | `keeps home during session revalidation and ignores stale resolution feedback` | Starting a revalidation while authenticated leaves route `home`; an old-epoch `sessionResolved` cannot change status or route; accepted current result remains `home` |
| Immediate logout from home (review 4) | `routes home to sign-in immediately when logout starts` | From authenticated `home` with no flow, `logout` enters `loggingOut` and route becomes `signIn` before the server response |
| Dismissal with both flows present (review 4) | `shows the surviving login when MFA is dismissed`; `keeps the surviving MFA route when login is dismissed` | In a hydrated two-slot state, dismissal of one child routes to the other; these cases distinguish `visibleRoute` from session-only routing |
| Overlapping requests, one live owner (review 2) | `the first request's late success …` / `… late mfa_required is dropped once the second starts; the second lands` (`it.each`) | Same view throughout; starting the second request aborts the first (`LOGIN_EFFECT_ID`). The transport ignores the abort: the first's success, or its `mfa_required`, is never reduced — no MFA slot opens, flow stays `submitting`, session untouched. The second resolves as Bob and lands (control). This is effect-ID cancellation, not ownership; a manual root `loginSucceeded` is still accepted (row "Owner-stamped vs manual"). Backend handling of two concurrent requests is not shown |
| 2 Logout, result during `loggingOut` (finding 3) | `a result landing during loggingOut is dropped: …` | Flow removed and aborted at `logout`; result never reduced; Bob in no notified state; a sign-in after `loggedOut` lands (control) |
| 2 Logout, result after `loggedOut` (finding 3) | `a result landing after loggedOut is dropped, …` | Never reduced; session stays `anonymous`. Under M5 (no retirement) it re-authenticated as Bob. Control (revision 2): a flow opened now signs Bob in, and its `loginSucceeded` is recorded |
| 2 Logout during MFA | `logout during an MFA verification retires the challenge and leaves the MFA route` | Challenge aborted, `mfa` removed, route `signIn`, late result never reduced. Control (revision 2): a challenge reached after the sign-out is live; its `challengeSucceeded` is recorded and signs Bob in |
| 2 `sessionReducer` refusal | `a flow opened during loggingOut is live, and sessionReducer refuses its result` | Reduced (owner live); refused; flow removed; then `anonymous` |
| Handoff acceptance is a transition (review 2) | `reads a refusal as a refusal although the previous account stays authenticated` | Test-local stricter session (refuses `sessionEstablished` while `authenticated`, returning its state) under `createAuthShellCore`. Signed out: Ada is accepted, `home` (control). Switch to Bob: refused; still `authenticated` as Ada; flow removed; route `signIn`. Under MB (acceptance = `authenticated`) it routed `home` |
| Stale MFA into a hydrated `succeeded` flow (review 2) | `a stale challengeSucceeded into a hydrated, already-succeeded MFA flow does not hand its stored session over again` | Hydrated `mfa` `succeeded` with Ada's snapshot, `attempt` 1; a root `challengeSucceeded` (Mallory, `attempt` 1) is recorded, refused by the challenge (state equal), and the session stays `unresolved`, route `mfa`. Control and root-authority distinction: an **unstamped** `challengeSucceeded` (Bob) is accepted by the challenge as an assertion and handed over. Under MC (handoff reads `flow.session`) Ada was re-established |
| Child effect on the retiring action | `suppresses the child's request while the parent's follow-up effect runs` + positive control | Probe parent (test-local, production reducers and builder): `deps.login` never invoked, `fetchSession` invoked once, `sessionResolved` reduced. Control: without retirement the same submission makes the request |
| 3/4 Same-ID MFA freshness | `re-providing the same challenge ID starts a fresh attempt …` | Reset, `attempt` and `formGeneration` increment, old signal aborted, late result dropped, manual stale-attempt replay reduced but refused, fresh code succeeds |
| Owner-stamped vs manual | `a manual result for a removed flow is reduced, but …`, `a manual loginSucceeded into a live flow is accepted …` | Root dispatch is always reduced; an empty slot plus the parent guard ignore it. Into a live login flow it **is** accepted: login has no result correlation (pinned as current behaviour, not endorsed) |
| 5 Two instances | `keep sessions, flows and in-flight requests isolated, including destroying one with both in flight` | A's login and B's MFA verification both in flight; destroying A aborts A's only; A reduces nothing, B's result is reduced and authenticates |
| 5 Node | `has no DOM to lean on`, `by default performs no auth I/O, …`, `opted in, completes login → MFA → session in two concurrent stores …` | Default: no request starts, while a dispatched result still hands over. With `deferEffects: false`, both stores complete independently. Not a server request lifecycle (section 3, case 5) |
| Refused `submissionSucceeded` (finding 2) | `login-flow.test.ts` › `a submission result that completes no submission in flight` (3 tests) | Reset during validation then stale stamped result (form refuses): no request, `idle`; **unstamped** result while not submitting: the form accepts it (`submitCount` + 1) and the flow stays `idle`; superseded `submissionId` while a newer submission is in flight (form refuses): `idle`. Positive controls: a genuine submission signs in; the current `submissionId` starts the request |

**Commands and results, revision 2** (2026-09-24, same worktree and outputs, `packages/auth`):

- `npx vitest run tests/managed-auth-composition.test.ts tests/login-flow.test.ts`: 36/36 passed (25 + 11).
- `npx vitest run tests/login-flow.test.ts tests/login-form.test.ts tests/managed-auth-composition.test.ts tests/session-established.test.ts`: 61/61 passed, three consecutive runs.
- `npx vitest run --config vitest.ssr.config.ts tests/ssr/managed-auth-composition.node.test.ts`: 3/3 passed (the Node file is unchanged; it runs the changed fixture).
- `pnpm test` (auth): browser 43 files / 654 tests passed; SSR 3 files / 37 tests passed. Exit 0.
- `pnpm typecheck` (auth, `src/`): exit 0. `tsc --noEmit -p tsconfig.test.json`: exit 0, with the composition, fixture and login-flow test files in the checked set (`--listFilesOnly`). `pnpm check`: 0 errors, 0 warnings.
- No red run was recorded separately for revision 2's fixture changes: each was written with its test and red-verified by reverting the fix (mutations MA1, MB, MC, MD below — MA1 is exactly the reviewed predicate).

**Commands and results, revision 1** (2026-09-24, on this worktree, `packages/auth`; dependencies installed with `pnpm install --frozen-lockfile` and `packages/core` built, both gitignored outputs):

- Red, before the source fix: `npx vitest run tests/login-flow.test.ts`: 3 failed / 8 passed; the reset case called `deps.login` once, with the reset fields.
- `npx vitest run tests/login-flow.test.ts tests/login-form.test.ts`: 27/27 passed.
- `npx vitest run tests/managed-auth-composition.test.ts`: 18/18 passed.
- `npx vitest run --config vitest.ssr.config.ts tests/ssr/managed-auth-composition.node.test.ts`: 3/3 passed.
- `pnpm test` (auth): browser 43 files / 647 tests passed; SSR 3 files / 37 tests passed. Exit 0.
- `pnpm typecheck` (auth, `src/`): exit 0. `tsc --noEmit -p tsconfig.test.json`: exit 0, with the new and changed test files in the checked set (`--listFilesOnly`). `pnpm check` (svelte-check, `--fail-on-warnings`): 0 errors, 0 warnings.

**Mutation verification** (each applied alone by a script that asserts a unique match, reruns `login-flow`, `login-form`, `managed-auth-composition` and `session-established`, and restores the file byte-for-byte from a copy; all three mutated files compared equal afterwards):

| Mutation | Failing tests |
| --- | --- |
| M1 `login/reducer.ts`: drop the `withForm.form === state.form` clause | superseded `submissionId` |
| M2 `login/reducer.ts`: drop the `!state.form.isSubmitting` clause | uncorrelated `submissionSucceeded` |
| (red run) `login/reducer.ts`: no guard at all | all three refused-submission tests |
| M3 fixture: `signInOpened` ignores an occupied slot | open → submit → open; open over live MFA |
| M4 fixture: drop the `mfa` `replaceOn` | MFA branch over occupied MFA |
| M5 fixture: `logout` does not retire flows | result during `loggingOut`; result after `loggedOut`; logout during MFA |
| M6 fixture: `logout` keeps the `mfa` route | logout during MFA |
| M7 fixture: `signInRestarted` keeps `mfa` | open over live MFA / old MFA result |
| M8 fixture: treat a refused handoff as accepted | flow opened during `loggingOut` |
| M9 `session/reducer.ts`: remove `sessionEstablished`'s `loggingOut` refusal | flow opened during `loggingOut`; `session-established.test.ts` › is refused while a sign-out is in flight |

**Revision 2 mutations** (script outside the tree, `/tmp/bmut/run.py`: each mutation asserts a unique match, is applied alone, reruns the same four files — 61 tests — and restores the file from a copy with a byte comparison; `git status --porcelain` and the MD5 of both mutated files compared equal afterwards):

| Mutation | Failing tests |
| --- | --- |
| MA1 fixture: `mfaReplaced` → `action.type === 'login'` (the reviewed predicate) | login input with both slots live (1) |
| MA2 fixture: `mfaReplaced` → `after.mfa !== before.mfa` (drop the action clause) | 8, including MFA success, MFA over MFA, logout during MFA, same-ID freshness, two instances — the child's own reductions retire it |
| MA3 fixture: no `replaceOn` on the MFA slot (M4 rerun) | MFA branch over occupied MFA; login input with both slots live |
| MB fixture: acceptance = `next.session.status === 'authenticated'` | refusal read as refusal (1) |
| MC fixture: MFA handoff on `flow.session !== null`, handing over `flow.session` | stale `challengeSucceeded` into hydrated `succeeded` MFA (1) |
| MC2 fixture: the same for login | **none — survives.** Expected: `loginReducer` accepts every `loginSucceeded`, so the identity check is always true for login (section 2.2) |
| MD fixture: `signInCancelled` keeps the route | the two cancel-route tests. The first MD run exited 1 with every managed test reported non-passed and 0 counted as failed — a runner-level failure, not an assertion result; two isolated reruns each failed exactly these 2 tests, and three unmutated runs passed 61/61 |
| ME `login/reducer.ts`: each request under a distinct effect ID (no same-ID cancellation) | both overlapping-request cases; `login-flow.test.ts` › a second submit while the first is in flight supersedes rather than races |

ME mutates production source only to show the new regression is sensitive; the behaviour it guards is pre-existing, not a revision 2 fix.

Mutations from revision 1 (M1–M9) were not rerun in revision 2 apart from M4 (as MA3); the tests they failed are unchanged or strengthened. Mutations from the previous revision (drop `replaceOn` from the login slot; parent ignores lifted `loginSucceeded` / `mfa_required`; remove `challengeProvided`'s `Effect.cancel`; remove the `challengeSucceeded` attempt guard) were not rerun in this revision; the tests they failed are unchanged or strengthened.

Not mutated: core's owner retirement, origin drop and the skipping of a retired owner's effect. Core is outside this lane. The positive controls are the live-owner paths, where the same feedback **is** reduced and the same submission **does** make its request.

**Open gates (revision 4).** B remains an existence proof. The exact `e9bbb3c6` review, separate seven-flow review and narrow `c40ebc30` delta review are complete. After the delta review, the managed suite passed 32/32. Before its four test-only additions, the route follow-up passed 695/695 full auth browser and 37/37 SSR; auth typecheck, test TypeScript and Svelte check passed with zero errors or warnings. T2 decisions listed next and installed/SSR acceptance remain open. The full repository gate (`pnpm test` at the root) was not run here.

- **Seven sibling flows, corrected in separate commit `0d068f1f`.** Signup, forgot password, reset password, change email, change password, magic-link request and MFA enrolment now start a request only on a form result that completes a submission in flight. The independent combined review approved the standalone fix after its full auth suite and mutation probes. Managed acceptance for those rows is still open.

**Open items for T2 (not settled here):**

- Whether auth ships the parent handoff and these lifetime policies (refuse-or-replace on open, retire on logout) as a reusable composition fragment, so that forgetting them is not silent, and what shape it takes. The fixture shows the policies are expressible on existing core; it does not make them hard to omit. Every rule in this revision had to be written by hand in the parent core, and the MFA-over-MFA case is guarded only because it was thought of.
- Whether `loginSucceeded` should gain request correlation like MFA's `attempt`, and whether an uncorrelated `challengeSucceeded` should keep being accepted. Owner retirement covers flows the parent removes, and the fixed effect ID covers overlapping requests in one flow; neither covers a replayed or root-dispatched result into a live flow (pinned in `a manual loginSucceeded into a live flow is accepted`, and by the unstamped `challengeSucceeded` control in the hydrated-MFA test).
- **A fragment must expose an exact accepted result.** The fixture infers acceptance from session identity and infers "this flow just accepted this snapshot" from snapshot identity. Both are inferences about another reducer's return value: a session reducer that records a refusal in a new state, or a root replay of the same snapshot object, defeats them. A shipped fragment needs the handoff's outcome as an explicit result (accepted / refused, and which request). Its routing policy must cover refusal, cancellation, view dismissal, accepted session hydration and logout, not be left to each parent.
- Whether core should detect a fresh write over an occupied optional slot without `replaceOn` (finding 1's class). Today it is silent; this lane cannot change core.
- `sessionEstablished` is accepted in `anonymous` after a completed logout. The parent policy removes the path in this fixture; the standalone `LoginForm` + session store pairing is not changed and was not re-examined here.
- Server policy: stores default to deferring effects. A server-side sign-in path needs an explicit opt-in and its own review. SSR request isolation, cookies and hydration are unproved (section 3, case 5).
- `LoginForm` / `MfaChallengeForm` accepting a managed (retirable) flow view without `sessionStore`: C3 scope. The inventory's other capability rows (signup, recovery, verification, OAuth, magic link, account, refresh) have no managed proof.
