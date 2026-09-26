# Independent Opus 5.5 follow-up review of auth B proof

Fresh Claude Code CLI session `bb0bab85-6ebf-4533-8b64-8e561a616f72`, canonical model `claude-opus-5-5`, high effort, full repository/file/command access. Reviewer changed no files and removed scratch probes under `/tmp/authprobe`. Focused browser suites passed 102/102, Node proof 3/3, and `tsc --noEmit -p tsconfig.test.json` passed. It did not repeat the full auth gate or mutations M1–M9.

Review-1 dispositions: occupied open, production login stale-submit, logout both orderings, retiring-child versus parent effect, two-store destroy, and Node scope were verified fixed. Positive controls were mostly fixed. A matrix supplements were present but the parent still owns a frozen T1 schema.

## New findings and disposition

| Priority | Finding | Disposition |
| --- | --- | --- |
| Medium | Seven sibling form flows still initiate requests for `submissionSucceeded` when the form reducer refused it: signup, forgot/reset password, change email/password, magic-link request, MFA enrolment. Reviewer reproduced an idle stamped action for each; login and MFA challenge reject it. | Recorded as open A/C package defects. Add flow-specific guards and non-vacuous tests within auth lane; no shared core change inferred. |
| Low–medium | Test-only shell MFA `replaceOn` matched every login action while both slots existed. Typing in login could retire the MFA owner and abort in-flight verification before the MFA branch. | Narrow predicate to actual MFA replacement, test signal remains live through login typing and retires at branch. |
| Low | Two negative-action tests lacked same-test recorder positive controls despite the word “every” in proof claims. | Add controls or narrow the claim to exactly the tested cases. |
| Low | An unstamped idle `submissionSucceeded` is accepted by the core form reducer but ignored by the login flow guard; calling it “form refused” is inaccurate. Login guard is similar to MFA but not identical because repeated submits remain allowed. | Correct test/evidence wording. No form-core edit in this lane. |
| Low | Fixture `establish()` inferred acceptance from authenticated status; a future refusal while a prior account stays authenticated would be misread. A pre-succeeded/hydrated MFA slot can re-establish its stored session after a stale action. Cancelling sign-in while signed in leaves route `signIn`. | Compare actual session transition/accepted result in fixture, prevent stale-result re-handoff where feasible, and record public fragment outcome requirement. |
| Low evidence gap | Managed proof lacks overlapping login requests within the same live owner. Scratch probe showed old success and `mfa_required` are dropped after the second request starts despite ignored transport abort, by fixed effect-ID cancellation; manual root success is accepted. | Add managed regression for real feedback and preserve manual-root distinction. Backend request ordering remains unproved. |

Review verdict: **B remains an existence proof, not a closed reusable contract**. T2 must decide and ship the fragment and exact accepted-result observation; T3 still needs retirement-safe component props, installed recipes and SSR rendering/hydration. This file captures review findings; subsequent fixes require a new disposition update and independent re-review.
