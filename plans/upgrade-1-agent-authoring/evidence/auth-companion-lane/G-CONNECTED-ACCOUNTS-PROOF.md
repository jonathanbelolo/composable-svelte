# Managed account summary and connected accounts candidate proof

Status: **CLEAR TO LAND** after three independent Opus review passes, the full package test suite (Chromium and SSR), check/typecheck/build, and physical minimum (`Svelte 5.20.0`) and current (`Svelte 5.55.3`) consumers. This implements the *Account summary + connected-accounts* row of `A-INVENTORY.md`.

## Behavior and ownership

`createAuthFeature()` adds optional owned `account` (`accountSlot`) and `connectedAccounts` (`connectedAccountsSlot`) settings slots. Both slots belong to the signed-in account: opening either requires an authenticated subject in the session slot and no active temporary flow (`openAccount` and `openConnectedAccounts` are refused without an authenticated subject or while a temporary flow is live). Once open, they may coexist with each other and survive a temporary flow opened after them. Sibling features maintain independent state. Any change of the authenticated subject (logout, switching to a different account, or session expiration) retires both with their active operations and drops late feedback.

- **Account read model (`accountSlot`)**:
  - The slot itself has no automatic mount effect; `ConnectedAccountsPanel` initiates `accountRequested` once per owned mounted view on client when passed `accountStore`.
  - **Never runs during SSR**: `fetchAccount` dependency sees 0 calls during SSR.
  - Deliberate reload is supported via `reloadRequested`.
  - When account data is not yet loaded, `account` is `null` (or `undefined`), ensuring consumers and panels consume truthful status rather than fabricating an empty list.

- **Connected accounts panel (`connectedAccountsSlot`)**:
  - `ConnectedAccountsPanel` supports genuine `PresentationView` ports (`store`, optional `accountStore`, optional `oauthStore`) and standalone props/callbacks (`providers`, `hasPassword`, `onUnlinked`, `onReauthenticationRequired`).
  - **Truthful consumption**: Before account data is read, `providers` is `undefined` and the panel displays `"Reading your account…"` without rendering false empty states or disconnect buttons. When a passed `accountStore` has retired, it displays `"Account details are unavailable."`.
  - **Pruning unlinked knowledge**: Once an account re-read lands, `providersObserved` updates and prunes local unlinked tracking so detached providers can be re-connected. Deduplication tracks observed provider length and unlinked length without reactive loops or stranding entries.
  - **Provider linking**: Feature provides `startOAuthLink` action with `intent: 'link'`, resetting temporary flows and routing authorization through the genuine `oauthStart` slot owner so in-flight requests are properly bound and cancelled on retirement. Reuses `oauthStart` (`authorizationRequested` with `intent: 'link'`), avoiding a duplicate link reducer. The supported managed panel link action / port `onLink` enables opening or restarting `oauthStart` without violating genuine-view typing or leaving button dead ends. Unavailable or retired OAuth start views safely disable the connect button.
  - **Unlink safety authority**: The backend remains the sole authority for unlink safety. No front-end rule denies unlink based only on password or provider count (`isLastWayIn` is strictly advisory and never disables the button).
- **Outcome pulse**: Reports `AuthFeatureState.connectedAccountsOutcome` (a one-reduction pulse cleared by every routed reduction and pulsed when `flow.settled === 'unlink'` on `unlinkSucceeded` or `unlinkFailed` with reauthentication):
  - `{ kind: 'unlinked', provider }` — provider detached. The parent decides whether to trigger an account reload via `reloadRequested` on `accountSlot`.
  - `{ kind: 'reauthenticationRequired', provider, methods }` — backend requires re-authentication. The demand message stays visible in the panel, with buttons remaining enabled.
- **Keyed markup**: Entire component markup is keyed by view owner (`{#each [owner] as key (key)}`), preventing preflush event mismatch and stale clicks from reaching retired owners.
- Repeated failure guard: The reducer accepts a failure only while that provider's unlink request is pending; the full test suite includes a replay assertion.

## Exact local candidate and measured checks

- Committed base: `7b360d1ac908459a79e76f4151c914a06a7bafd0` (managed magic-link).
- Package `typecheck`: pass (0 errors).
- Package `check`: 0 errors, 0 warnings.
- Package `build`: pass (emitted 25 NodeNext Svelte declaration bridges).
- Full package Chromium test suite: 52 files, 865 passed (including 23 tests in `tests/managed-connected-accounts.test.ts`).
- Full package SSR test suite: 8 files, 51 passed (including 3 tests in `tests/ssr/managed-connected-accounts-ssr.test.ts`).
- Exact local candidate archive: `/private/tmp/auth-account-candidate/composable-svelte-auth-0.2.1.tgz`, SHA256 `15e0774acc6a3d292c682c66d36b3616e9930db73562a0e2472c3d7a8d085dc5`.
- Physical consumers (regular installed package directories with lockfile SHA512 matching this archive; consumer source matches the worktree):
  - `/private/tmp/auth-oauth-min` (Svelte 5.20.0):
    - `npm run check`: 0 errors, 0 warnings.
    - `npm run build`: pass.
    - `npm run test:ssr`: pass ("Installed SSR render proof passed for two isolated roots").
    - `npm run test:browser`: pass ("Installed nested browser proof passed").
  - `/private/tmp/auth-oauth-current` (Svelte 5.55.3):
    - `npm run check`: 0 errors, 0 warnings.
    - `npm run build`: pass.
    - `npm run test:ssr`: pass ("Installed SSR render proof passed for two isolated roots").
    - `npm run test:browser`: pass ("Installed nested browser proof passed").
- Standalone compatibility: existing standalone props and behavior of `ConnectedAccountsPanel` and reducer remain 100% functional, and compile-time props checks in `consumer/src/Props.svelte` and test suite verify both managed and standalone variants.

## Review gate and blocker resolution

Independent Opus review and follow-up review identified the following blockers:

1. **Link path intent and ownership**:
   - Initial blocker: The consumer's "Connect" button previously initiated a sign-in (`openOAuthStart`) without intent rather than a provider link.
   - Follow-up blocker: `startOAuthLink` called `oauthStartReducer` inside core and returned its effect directly, bypassing slot owner stamping (`stampOrigin`). This meant retiring `oauthStart` (`closeOAuthStart`, `restartOAuthStart`, `logout`) did not abort the in-flight request, and stale link results could arrive at a replacement sign-in flow.
   - *Resolution*: Implemented `startOAuthLink` feature action in `createAuthFeature` which initializes `oauthStart: createInitialOAuthStartState()` in core and routes `authorizationRequested` (`intent: 'link'`) through the genuine `oauthStartSlot` presented action via an effect. The slot reducer produces `beginOAuth` and core stamps the slot owner onto it. Retiring `oauthStart` properly aborts the request (`signal.aborted === true`) and late results are dropped. Wired `onLink` in consumer to `startOAuthLink`.
   - *Added Tests*:
     - Retiring `oauthStart` during in-flight `beginOAuth` aborts request and drops late results.
     - Restart followed by sign-in with same provider drops stale link start and stores `intent: 'signIn'`.
     - Logout during `startOAuthLink` aborts in-flight request and drops late results.
     - Verified stored pending OAuth record has `intent: 'link'`.
     - Tested genuine managed `oauthStore` link path with presentation view.

2. **Installed consumer account read**:
   - The consumer previously hardcoded the provider list in the parent and never passed `accountStore` to `ConnectedAccountsPanel`, leaving mount read unexercised.
   - *Resolution*: Wired genuine `accountStore` port into `ConnectedAccountsPanel` via `AccountScope`. The browser test now asserts initial `fetchAccountCalls === 0`, mount read asserting "Reading your account…" with `fetchAccountCalls === 1`, deliberate account reload upon unlinking with `fetchAccountCalls === 2`, and independent right sibling isolation (`fetchAccountCalls === 3`) using `.connected-accounts__name` selector.

3. **Documentation accuracy and unavailable state**:
   - Corrected claims in `README.md`, `CHANGELOG.md`, `consumer/README.md`, and this evidence doc.
   - Accurately documented that `"Account details are unavailable."` appears specifically when a passed `accountStore` has retired.

4. **View port replacement safety**:
   - `AccountViewPort.onDestroy` and `OAuthStartViewPort.onDestroy` now guard clearing the port with `if (port?.getAccountView() === view)` (or `port?.getOAuthStartView() === view`), preventing replacement views from being prematurely cleared on restart.

5. **Deduplication and edge cases**:
   - Updated `providersObserved` deduplication logic with `lastObservedUnlinkedLength` to prevent stranding detached providers when account data is re-read. A passed `accountStore` that has retired renders `"Account details are unavailable."`; an unread account still renders `"Reading your account…"`.

Final Opus review independently ran the focused connected-account browser tests (23/23) and SSR tests (3/3), confirmed the OAuth effect now receives the slot owner stamp, and reported no remaining blockers. It did not rerun the full suite or installed consumers; those measurements above are the coordinator's.
