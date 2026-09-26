# Auth integration decision

Status: the contract was accepted by focused independent Opus review with the adjustment recorded below, and the package-owned composition is implemented. The Auth lane is completing the remaining capability inventory; this is not a request to repeat the initial contract proof. Final cumulative integration and release qualification remain tracked in `COMPANION-RELEASE-READINESS.json`. This decision does not settle editor command delivery or native rendering APIs.

The headless session/login/MFA business composition uses existing core managed composition. No core change is required for this auth concern. The verified B work is proof of that architecture, not completion of all auth capabilities.

Approve a package-owned `createAuthFeature` composition and typed slot catalog, with a persistent session, temporary login/MFA flows and initial-state construction. Consumers must not reproduce the test-only shell reducer. Opening an occupied flow is idempotent; explicit restart replaces its owner. Logout retires old temporary flows. Application routes remain application policy.

Approve an explicit discriminated accepted/refused handoff result derived from one internal session-establishment decision shared by the existing session reducer and the composition. Do not infer acceptance from status or object identity. A monotonic handoff sequence is acceptable for once-only parent consumption, with these requirements:

- The sequence is scoped to an auth-feature lifetime. The shipped nested-app example must handle whole-feature replacement, persisted/restored parent state and new results after replacement. Comparing a new sequence against an unrelated predecessor's last-seen value is invalid.
- Keep the consumption bookkeeping minimal and explicit; show the actual parent reducer. No unexported repository helpers, effect-based observer or success callback may be required.
- Generation metadata is not request freshness proof. Retain existing in-owner request cancellation/correlation and validate abort-ignoring transport behavior. Do not expand this migration into defending against arbitrary authoritative root action forgery; document that boundary.

Approve discriminated managed/standalone props on existing LoginForm and MfaChallengeForm, preserving standalone call sites. The managed branch accepts genuine presentation views, has no session dispatch or business-result callbacks, renders safely through terminal undefined and keys field subscriptions to captured view identity. Other advertised components need equivalent least-authority retirement-safe contracts according to the acceptance matrix. Do not add full Store facades or use casts to bypass type checks.

Implement a first vertical slice through the actual package export, existing components and a runnable installed application. Demonstrate the auth feature embedded in a larger parent, not only used as the entire root. Resolve exact slot/catalog/nested view types by compiling rather than treating the proposal's pseudocode as API evidence. No URL manipulation outside the supported application navigation mechanism.

The first slice must pass installed ComponentProps and managed render examples, standalone controls, replacement/dismissal/logout/retry behavior, explicit accepted/refused outcome handling and whole-feature replacement. Package documentation and executable references are part of the change. Continue remaining auth capability rows and SSR/browser isolation afterward; a login/MFA slice is not full auth completion.

The lane is authorized to implement after focused Opus review accepts this contract or resolves nonmaterial details. Any material conflict in nested composition, handoff correctness or type compatibility returns to the coordinating lead. Core/checker/root release changes remain lead-owned. No publication is authorized by this decision.

## Opus contract adjustment accepted

Focused Opus review d7a1b5bd-ace7-4861-9782-a6e89b6ae5f2 permits implementation with adjustments. Replace latched sequence/parent-lastSeen bookkeeping with an explicit accepted/refused handoff pulse cleared at each auth child reduction and consumed synchronously by the parent for that routed reduction. It is not a reactive event source. Verify no replay through unrelated/rejected actions, restored stale state, feature replacement or sibling features. This supersedes the earlier permission to use a sequence; the once-only parent result requirement remains.

Use actual nested managed composition, preserving child slot catalogs; ordinary reducer scoping alone cannot carry managed grandchildren. The outer auth lifetime/dismissal policy belongs to the host, which must still support deliberate full-feature retirement/replacement. Compile the real nested application before claiming this contract achieved.

No new runtime brand-assertion core export is required solely to reject arbitrary forged casts. Public nominal types and tests using genuine production views remain mandatory. Migration is authorized under these adjustments.
