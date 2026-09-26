# Independent Opus review: managed auth forms and correction

## Review of immutable `2905b8b7`

Fresh Opus 5.5 session `a0246bc8-bdb5-4242-b857-98da8dec2191` reviewed the managed `LoginForm` and `MfaChallengeForm` change against `a2ea84c5`, before the installed recipe. Its medium finding was a real ownership defect: the keyed `<Form>` subtree held one component-lifetime `formStore`, and that store's `dispatch` read the current `binding.flowStore`. When a live view A was swapped for a live view B, blur from A's focused email input during teardown touched B's email field. The reviewer reproduced this in Chromium. It found no other high or blocking defect. It also recommended a root stale-MFA start-over test, a spread-injected managed prop negative, and clearer compatibility/documentation text.

## Disposition

`LoginForm` and `MfaChallengeForm` now derive a form store for each managed view. Its `state`, `dispatch`, and `subscribe` close over that captured `PresentationView`; the keyed `<Form>` receives that store. Standalone mode retains its one stable fan-out store across a `flowStore` prop swap. The first implementation put `{@const}` directly under `{#key}`; the clean Svelte 5.20.0 installed build rejected that syntax. The final implementation computes `activeFormStore` in script-level `$derived`, retaining the keyed capture and compiling at 5.20.0.

The Chromium regression focuses A's email input and swaps the component to a still-live view B. It now observes that A becomes touched and B remains untouched. Replacing the final `<Form store={activeFormStore}>` with the old shared store makes the test fail at B's touched assertion (`true` instead of `false`); the replacement was restored byte-for-byte after that check. The root stale `mfa.startOverRequested` test keeps a live login request alive when no MFA child exists; the spread-prop fixture verifies TypeScript rejects a hidden `sessionStore` in managed mode. The changelog says exhaustive `MfaChallengeAction` switches need the new arm, and the README says managed mode requires the feature or equivalent parent handling.

## Fresh delta review

Fresh read-only Opus 5.5 CLI session `4f96ea09-2341-4fba-8628-81984a7f3dd9` reviewed this correction and installed consumer, with a roughly one-minute turnaround. Verdict: **accept code; no correctness, contract, or compatibility defect.** It traced `Form` context capture, the view-specific closure, and the retained standalone fan-out. It confirmed the spread type negative and stale root start-over regression. It recommended observing A's touched state directly and dropping a manual blur on an already detached node; both changes were made and the 8-test managed browser file passed again. The review noted that MFA has no matching removal-blur test. `MfaChallengeForm`'s code input has no blur handler; its shared-store hazard is closed by the same captured-view store, and existing live-view swap tests cover subscription isolation. A future MFA event with teardown behavior would need its own focused regression.

The exact review stream is `/private/tmp/auth-delta-review-stream.jsonl`. No source edits were made by the reviewer.
