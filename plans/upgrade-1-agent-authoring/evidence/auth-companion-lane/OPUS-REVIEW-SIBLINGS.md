# Independent Opus review: seven sibling flow guards

- Reviewer: fresh Claude Code Opus 5.5 session `bce24cdc-cade-4e89-ad72-707ce51c318b`, no subagents.
- Exact source: HEAD `0d068f1f704d64088e81a29adcd8f1b2a99eba0c`, diff against `e9bbb3c6`; checkout clean at conclusion, no reviewer source edits.
- Verdict: approve the standalone fix; no blocker, high, or medium findings.

The reviewer checked core's form reducer and all seven patched flow reducers. `completesSubmissionInFlight` requires a `submissionSucceeded` action, a changed form state, and an in-flight submission beforehand. That rejects superseded stamped results and accepted but idle unstamped results while keeping valid submissions and second attempts. The reset-password token check remains after the guard; MFA enrolment also requires `confirming` or `submitting`, preserving a second code while preventing a result after enrolment from moving the flow off its recovery codes.

## Independent checks

- Nine focused files: 194/194 passed. Full auth: 692/692 browser and 37/37 SSR passed.
- Svelte check: 0 errors/warnings. Test TypeScript check passed. Ten of twelve core repo guard files passed; two require built unrelated packages absent in this worktree, so no full repository gate is claimed.
- Scratch mutations: reverting all seven reducers failed 31/38 focused new tests; deleting the helper's identity check failed 7, deleting its `isSubmitting` check failed 7; MFA phase rule variants failed 2 each; single-flow change-password and reset-password reverts failed 4 and 5; moving the reset token check before the helper failed 1. Restores were byte checked.

## Low findings and scope

1. Change-email and change-password rebuild their form after success, resetting `submissionId`. A replay from the prior form lifetime could share the next ID; the reviewer reproduced acceptance in a scratch mirror, but found no in-store path that emits such a replay. Carrying the counter through rebuild remains open in `A-INVENTORY.md`.
2. The original measured logs are gitignored; this review independently reproduced 31-of-38 and mutation claims, but not the original exact 239-test focused set. This record gives independently rerun commands and counts.
3. Login and MFA challenge keep inline copies of the helper's check. They are currently equivalent; consolidation is a later maintenance choice.

Managed acceptance, installed `ComponentProps`, SSR request isolation, and the shared ADR decision remain open. This review preceded the route follow-up and is not a review of that later diff.
