# Review of the consumer-foundation patch — 18 September 2026

## Verdict

Four actionable findings were identified and corrected. No remaining blocking
finding was identified in the reviewed patch. This review covered package
metadata and release setup, shipped docs, starter configuration/lifecycle,
consumer verification and CI, and the auth adapter's documented contract.
No library runtime implementation or public API changed during this review.
No packages were published.

## Findings and resolutions

### P2 — Child dismissal was wrapped into the child action stream twice

Location: [navigation test guide](../../packages/core/docs/core-concepts/testing.md#testing-optional-destinations).

The new `dismiss: () => Effect.run(...)` dispatched a parent action from an
effect that `ifLet` treats as a child effect. `Effect.map` wrapped it again.
The example expected `destination.dismiss` but actually received
`destination.presented.destination.dismiss`, so the destination stayed open.
This was reproduced by executing the guide against the previously packed
packages: three tests passed and the child-dismissal test failed with the exact
unexpected action. See [before-fix evidence](./review-evidence/navigation-before.log).

The guide now constructs `createDismissDependency` with a captured parent
TestStore dispatch, injects it into the parent/child reducers and finishes all
four tests. The consumer gate extracts and executes the actual guide block.
A mutation restoring the incorrect effect must fail with the double-wrapped
action diagnostic.

### P2 — Animation tests contradicted the reducer they demonstrated

Location: [animation guide](../../packages/core/docs/animation/animated-navigation.md#teststore-support).

The replacement lifecycle reducer closed even while idle, but the next section
asserted an idle close was ignored. The timeout section expected an event absent
from both the action union and the reducer's effects. The snippets also reused
one store without consistently consuming pending completions. Executing the
original sequence failed with `expected 'dismissing' to be 'idle'`.
See [before-fix evidence](./review-evidence/animation-before.log).

The three examples now form executable tests with fresh stores, real guard
branches and an injected choice between normal completion and timeout fallback.
All pending events are consumed and `finish()` checks each test. They remain a
small lifecycle demonstration, explicitly distinguished from full production
navigation. Mutations removing the guard or timeout fallback are rejected.

### P2 — Storage guidance conflicted with the auth session model

Locations: [storage](../../packages/core/docs/backend/storage.md),
[security](../../packages/core/docs/backend/storage-security.md), and
[dependencies](../../packages/core/docs/backend/dependencies.md).

The relocated guides retained examples labelled good/secure that wrote JWT
session cookies through the browser storage adapter. They also described local
cookie deletion as logout and universally prescribed SameSite=Strict, while
the auth contract uses server-issued HttpOnly cookies and a Lax reference flow.
The cookie adapter uses `document.cookie`; Secure does not make those values
HttpOnly. This distinction was checked against the implementation and
[MDN's Set-Cookie reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

Cookie-storage examples now use non-sensitive preferences. Authentication and
logout go through the server. The guidance distinguishes transport security,
JavaScript access, SameSite and cookie Path, and the cross-tab example uses a
non-secret logout notification. This is documentation alignment; it does not
change the auth protocol or add a new security mechanism.

### P2 — Four advertised guides were placeholder links accepted by the gate

Locations: [docs index](../../packages/core/docs/README.md#deployment),
[SSR guide](../../packages/core/docs/ssr/server-rendering.md), and
[consumer verifier](../../scripts/verify-consumer.mjs).

Build configuration, bundle optimization, production checklist and deployment
links used `(#)`. The verifier skipped every fragment link, so these advertised
resources passed despite having no destination. They now link to the actual
starter, SSR guide and integration-boundary documentation. The verifier rejects
bare `#` placeholders, and a deliberate placeholder insertion proves the guard
fails. The consumer guide's starter link was also made package-relative.

## Validation after corrections

- **93 affected repository guard tests passed**: documentation types, compiled
  examples, public entry references and front-door documentation.
- Frozen pnpm lockfile validation passed in a clean temporary manifest workspace
  without changing the development installation.
- All **27 method/path pairs** in the auth adapter match the shipped HTTP route
  table; GET and DELETE `/auth/account` are counted separately.
- Fresh packed consumer verification passed: **49 Markdown documents**, **187
  relative file links**, **23 extracted README/guide files**, **49 typed exports**
  under both Bundler and NodeNext, zero Svelte errors/warnings.
- **16 consumer unit tests passed** (two standalone starter and fourteen combined
  README/guide tests), with SSR checks for both applications.
- **5 production browser tests passed**: one standalone core test, then two each
  under Tailwind 4 and Tailwind 3, including editor input and chat transport.
- **12 deliberate regression controls were rejected**, including the three new
  runtime regressions and the documentation placeholder.
- `git diff --check` passed.

The earlier 5,078-test repository run and six auth browser tests remain recorded
in [the closure report](./CLOSURE.md). This review reran the affected guards and
expanded external consumer gate; it did not claim a second full repository run.
The prior closure's consumer counts are superseded by this review's counts.

## Remaining release boundaries

Repository publication and npm publication are still pending. The tests run
against local tarballs installed outside the workspace, not an unpublished
registry version. General fragment-anchor existence and remote link availability
are not comprehensively checked by the file-link guard. Backend compatibility
with the new composable runtime, provider credentials, live media/GPU services,
full accessibility/performance qualification and SvelteKit hydration remain
application acceptance work, as already stated in the closure report.

Evidence is retained in [review-evidence](./review-evidence/consumer-final.log).
