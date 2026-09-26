# Executable patterns for application-building agents

These are small, tested examples using public package exports, not new framework APIs.
Start with the file relevant to the task. Keep the decisions described below explicit.

| Need | Read/copy | Framework guarantee | Application decision | Executable evidence |
| --- | --- | --- | --- | --- |
| Async request | `src/request.ts` | Managed cancellation retires callback dispatch | Request epoch for queued/public results; accepted query provenance | `tests/request.test.ts` |
| Editor | `src/editor.ts`, `src/application.ts`, `src/Editor.svelte` | Genuine child ownership, scoped effects, retired-view rejection | Save policy, dirty confirmation, commit, removal, explicit replacement | `tests/editor.test.ts`, `tests/view.test.ts` |
| Routing | `src/application.ts`, `src/App.svelte`, `src/Workspace.svelte` | Root/Host lifetime and browser history reconciliation | One parse/serialize decision shared with initial state | route cases, view test, `tests/ssr.mjs` |
| Collection identity | `src/collection.ts` | No implied cache or merge guarantee | Stable IDs/order, search membership, server revision precedence | `tests/collection.test.ts` |

## Run

Copy this directory into a separate project, install its dependencies (`npm install`),
then run `npm run check`, `npm test`, `npm run build`, and `npm run test:ssr`. Browser tests need Chromium
(`npx playwright install chromium`). The example pins core `0.13.1` so its code and guidance match the installed API.
`npm run dev` opens the small notebook demo. Its save service is in-memory and does
not provide persistence or conflict detection. Request and collection modules are
independent recipes tested alongside the runnable editor; they are not a hidden
backend for the demo. Appearance is deliberately minimal, not a design template.

Repository maintainers run `node packages/core/docs/examples/agent-patterns/verify-packaged.mjs`
from the repository. It builds and packs core, extracts the exact archive into a
temporary consumer, checks types, builds client and SSR output, and runs browser
and SSR tests against public exports. It reuses installed dependency/tool versions;
it is not a clean-registry-install certification. Its result records the archive
hash and command logs. There are no source aliases into the framework.

## Choices that must survive copying

- Keep `Effect.cancellable` and pass its signal into the injected service. A service
  may ignore abort; managed dispatch still retires. This example maps operation
  failures to domain actions. Do not silently swallow failures for operations
  whose reporting policy requires diagnostics or telemetry.
- Keep the request epoch in the general request example. The paired queued-result
  test demonstrates why removing it changes behavior. Callback-local abort checks
  are omitted: cancellation already gates that dispatch capability. There is no
  claim that cancellation prevents an already-sent server write.
- Keep `accepted.query` separate from the input query: retained results may be stale.
- The editor uses deferred dismissal for a business veto, with immediate removal
  once authorized. It deliberately does not animate exit. For animated exit use
  the complete [presentation guide](../../application-presentation.md); do not add
  timeout-based removal or use motion playback as a save/close authority.
- `replaceOn` names a new lifetime. An ordinary immutable draft update preserves
  the owner. Do not replace that policy with general reference-inequality detection.
- The collection requires monotonic server revisions, including tombstones. Equal
  revisions mean equal content by service contract; the existing record wins ties.
  This is an example policy, not a universal rule for unversioned APIs. If your
  server supplies no revision, specify a different freshness policy explicitly.
- Search membership belongs to the last accepted search response; merging a save
  response updates fields but does not infer new search membership. Requery when
  saved fields may change query matches. A newer response can update fields without
  overwriting an editor's independent draft. Missing search results are not deletion.

Avoid wrapping these patterns in an application-specific DSL. Extend the named
state/actions and keep tests that express the new business rule.
