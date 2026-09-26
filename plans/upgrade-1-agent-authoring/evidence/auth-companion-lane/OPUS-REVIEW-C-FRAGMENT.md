# Independent Opus review: first public auth fragment

- Fresh reviewer: Claude Code Opus 5.5 session `bbb6bfd4-19f3-4133-b187-7dd61b26ce6d`.
- Exact reviewed commit: `86ed7fd9d339a33919b39bda8fe82b0f4657f6e5` against `cea69a22`. Checkout was clean; reviewer made no repository source edits.
- Verdict: no blocker or high findings; runtime handoff and owner policy held in focused probes. This is a headless production fragment, not C or installed-app acceptance.

The reviewer independently confirmed that `sessionReducer` and `createAuthFeature` use the same pure `decideSessionEstablished`, and the feature reads its accepted/refused discriminant once. Core reduces managed children before the feature core and the containing parent, so a parent can consume `handoff` synchronously on the matching auth-routed presented action. The `restartLogin` and MFA `replaceOn` policies retire the intended owners. Seven scratch probes covered pending whole-feature replacement and a fresh result, restored stale handoff, refused handoff, two sibling features, nested dismissal, abort-ignoring live-owner retry and nested catalog types. Focused browser suites passed 25/25 and 56/56; typecheck and Svelte check passed with zero errors. The reviewer did not rerun the full auth suite.

## Findings and later implementer disposition

1. **Medium: parent test after replacement used a retired view**, so its unchanged result assertion proved little. The test now asserts the retired view cannot reopen the feature, obtains a newly bound view, observes another accepted handoff, then replaces a pending feature and proves its late response is dropped while a newer feature can sign in. A separate parent test consumes a refused result once during pending logout. The focused auth-feature suite passes 25/25 and test TypeScript passes after these additions. This disposition was made after the independent review.
2. **Medium: no README or runnable installed reference yet.** These belong to the next component/installed slice and remain open. No public C acceptance is claimed.
3. **Low: `cancelSignIn` notified on an already empty flow**; now returns unchanged state when no flow is live, while still clearing a stale handoff when needed. `restartLogin` intentionally creates a new flow.
4. **Low: source comments overstated flow-result freshness.** They now distinguish stored-snapshot identity from request correlation and explicitly acknowledge authoritative root dispatch.
5. **Low: the public refusal reason was not nameable.** `AuthHandoffRefusalReason` is now exported from the application entry and root barrel without exposing the internal decision module.
6. **Low: `.composition.reducer` alone omits managed children.** The factory JSDoc now explicitly requires `.execution` for a direct store; the installed recipe will use `defineApplication` with the full composition.

The reviewer did not inspect these later edits. Their follow-up receipt and the next independent gate must be stated separately from the original verdict.
