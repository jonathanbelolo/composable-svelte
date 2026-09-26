# Form submission timestamps

The framework samples completion time inside the submission effect and carries it in `submissionSucceeded.submittedAt`. The reducer copies that value into `state.lastSubmitted`, so replaying the same action does not depend on the current clock.

`FormConfig.now?: () => Date` provides a deterministic clock for tests or application configuration. It defaults to `() => new Date()` and is called once after `onSubmit` resolves, provided the request has not been cancelled. Construction and reduction never call it. Rejected or cancelled requests do not acquire a successful completion timestamp.

Ordinary framework submissions still populate `lastSubmitted` with a `Date`. Manually dispatched completion actions can provide `submittedAt`; if they omit it, `lastSubmitted` is now `null`, meaning the completion time is unknown. This is a deliberate change from inventing a wall-clock timestamp during reduction. Tests that compare exact nested completion payloads should inject a fixed clock and include the timestamp, or receive the completion by its supported top-level action type and assert the resulting state.

Stale tagged completions leave the prior state and timestamp unchanged. Untagged manual completions retain the existing legacy acceptance rules; adding a timestamp does not grant them ownership of a current request.
