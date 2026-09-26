# Independent Opus review 3 and implementer disposition: immutable B proof

- Reviewer: fresh Claude Code Opus 5.5 session `7f56b674-8bef-40bf-8c18-774050b62192`, no subagents.
- Exact source: detached `/private/tmp/auth-b-review-e9bbb3c6`, HEAD `e9bbb3c6466ab60f83203f940122e59d037991d3`. The reviewer inspected and tested that checkout, not the later sibling worktree. It was clean at conclusion.
- Verdict on that commit: existence proof valid, login source fix correct; no blocker or high findings. One medium fixture route gap, five low observations.

## New medium finding and later implementer disposition

`PresentationView.dismiss()` removed a login or MFA slot but left `route` pointing at `signIn` or `mfa`. The existing `signInCancelled` route tests did not cover this lifted `dismiss` action. The reviewer reproduced both cases in a scratch copy. The implementer subsequently changed the fixture to derive route from surviving flows and session on view dismissal, and from accepted session feedback. The first follow-up passed the full auth suite; a separate narrow Opus delta review of that follow-up found additional missing regression cases. Those cases and their later disposition are recorded in `OPUS-REVIEW-4.md`. This paragraph reports work after the original review, not a claim by that reviewer.

## Other observations

1. The pre-follow-up fixture did not route authenticated `resolveSession` to `home`; resolved with the same route derivation and tests.
2. Seven sibling form reducers still had the stale-completion trigger at `e9bbb3c6`; corrected in separate commit `0d068f1f` and independently reviewed in `OPUS-REVIEW-SIBLINGS.md`. The auth skill's flow recipe and status-polling wording remain stale and are outside this lane patch.
3. A post-destroy action-recorder assertion has no recorder positive control from the destroyed store; the abort-signal assertion and live second-store control carry that test's claim.
4. A reset-flow test names a result stale while using the current submission ID; it still discriminates the in-flight guard, as the reviewer confirmed by mutation.
5. Logout retires flows even while already anonymous; this is now stated explicitly as the fixture's exit-hatch policy.

## Independent checks at `e9bbb3c6`

- Locked install and core build; 109/109 focused browser, 3/3 focused Node proof, 654/654 full auth browser, 37/37 full auth SSR.
- `tsc --noEmit -p tsconfig.test.json`, auth `typecheck`, and Svelte `check` passed with 0 errors and warnings.
- Ten scratch mutations killed, including removal of core owner stamping (11 composition failures). Mutation restores were byte checked; the reviewer left the checkout clean.

The review does not prove installed component props, real SSR request/cookie/render/hydration isolation, or managed acceptance beyond session/login/MFA. Those remain ADR and migration gates.
