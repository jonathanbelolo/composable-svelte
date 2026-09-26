# Independent Opus 5.5 review of auth A/B proof

Review invocation: fresh Claude Code CLI session `499049f8-a97a-4f0e-be73-9aa26e2ca6e1`, canonical model `claude-opus-5-5`, high effort, full repository/file/command access. It reviewed the test-only proof written by a separate Opus CLI session against baseline `7861fbe8`. No files were changed by the reviewer.

Measured review checks: 10/10 browser proof tests and 3/3 Node proof tests passed; full auth gate 636 browser and 37 SSR tests; `tsc -p tsconfig.test.json` passed with all four new files. Three independent scratch probes were run under `/tmp` and removed. The reviewer did not repeat the implementation session's seven mutation checks.

| Priority | Finding | Disposition at review 1 |
| --- | --- | --- |
| High | `signInOpened` over a live login slot writes fresh state without replacing its owner. Old request remains un-aborted; its success authenticated the old user or its MFA error opened an old challenge. | Fix in auth proof fixture and add open/submit/open/late-result regression. B gate open. |
| Medium | `loginReducer` starts an auth request after `createFormReducer` refused a stale `submissionSucceeded`; scratch probe sent empty credentials after reset during validation. | Fix in production auth reducer with discriminating guard and regression. |
| Medium | Logout racing sign-in is only safe while session status is `loggingOut`; once logout completes, a still-live sign-in can authenticate. | Choose parent policy to retire pending flows when logout begins; test both orderings and preserve fresh post-logout sign-in. |
| Medium | No proof that an effect produced by a retiring child action is suppressed while a parent follow-up effect still runs. | Add a production managed-composition regression or record as open with parent core proof obligation. |
| Low–medium | Two-store destroy test had no B request in flight, so it did not prove B stays live. | Put both requests in flight and assert B remains un-aborted and completes. |
| Low | Node test used root-injected success and did not render/serialize/hydrate. | Qualify the claim; keep managed SSR rendering/installed recipe as open. |
| Low | Dropped-action tests used optional root recorder and negative-only assertions. | Add positive controls proving recording was active and the expected non-feedback action arrived. |
| Low | A matrix lacked port members, policy classification, owner/reviewer/status and rows for structured errors, subject helpers, password policy. | Added rows and a keyed port/policy/ownership supplement in `A-INVENTORY.md`; parent still owns frozen T1 schema. |

The reviewer confirmed the core child-first order, the distinction between owner-stamped feedback and manual root actions, genuine removal/drop checks, same-ID MFA freshness, and honest test-only scope. Its verdict was **B3 not ready to close** pending the high and production-medium fixes, updated evidence and another fresh independent review. This file records findings, not their eventual resolution.
