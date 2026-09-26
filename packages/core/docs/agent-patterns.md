# Recommended patterns for application-building agents

Use the [executable examples](./examples/agent-patterns/README.md) as the default
starting point after reading the [application contract](./application-contract.md).
They use the public package surface. They do not add a new resource abstraction,
form framework or presentation protocol.

## Decide once, then preserve the boundary

| Concern | Default | Keep explicit | Change the default only when |
| --- | --- | --- | --- |
| Async operation | Owner-local `Effect.cancellable`, injected service, signal forwarding | Pending/result/failure actions and acceptance epoch | The business requires independent concurrent results or another documented scheduling policy |
| Late callback | Rely on managed dispatch retirement | Cooperative cancellation at the transport boundary | Work has an independent callback lifetime; use a subscription with cleanup |
| Already queued result | Reject a mismatched request epoch in the reducer | Domain identity and phase checks | You have demonstrated that the action channel cannot receive queued, replayed or external stale results |
| Draft | Separate draft from server-owned record | Dirty comparison and save/conflict rules | The product intentionally persists every keystroke |
| Save state | One `'idle' \| 'pending' \| 'failed'` status | Confirmation is an independent business state | Additional states are behaviorally meaningful |
| Close | Parent authorizes, captured view requests | Save veto, discard confirmation, explicit replacement | Animated exit is requested; use the full presentation guide |
| Routing | Shared pure route decision and serializer | Unsupported/malformed route policy | A supported router adapter owns the boundary |
| Collection | IDs for identity, separate order and search membership | Freshness/conflict policy and accepted query | The domain is not a collection or order has different meaning |

### Cancellation is not data freshness

Three distinct cases must not be conflated:

1. A superseded executor attempts a callback after cancellation: managed execution
   drops it, even when the service ignores abort. Repeating `if (!signal?.aborted)`
   around that callback does not add acceptance protection.
2. A result was already enqueued while the owner remains live: cancellation of the
   resource does not retroactively delete that ordinary queued action. The request
   epoch in the reducer rejects it. The executable negative control shows the wrong
   state when this gate is removed, under the same production FIFO schedule.
3. Two valid operations return different versions of an entity: both may be live
   and neither callback is stale by ownership. The application must specify which
   data wins. Resource cancellation cannot answer that business question.

Keep cancellation keys local to the owning feature. Identical keys in sibling
editors must not collide. Do not add application-owned lifetime IDs to compensate
for an incorrectly scoped view; obtain the genuine managed view instead.

The cancellation guarantee is client-side authority, not a rollback of a server
write. Pass the signal where supported and use server revision/conflict checks for
writes. These examples catch operation failures and convert them to actions; apps
needing telemetry must specify how failures are also reported.

### Parent authority under child-first reduction

Under child-first reduction, child reducers execute before core or parent reducers.
The child `saved` action is a no-op in the child reducer because the parent alone
decides commit and slot removal. For explicit left/right registrations, share one
parent presentation handler rather than duplicating slot teardown and commit logic.

### Rejected opens and idle completions

Resolve the target using an own-property lookup before changing the slot. An
unknown target is a no-op; other rejection policies, such as a pending-save veto,
are explicit application choices. For this editor, `replaceOn` must require
both the opening action kind and an actual slot change
(`action.type === 'edit' && before.editor !== after.editor`).
Reference identity change alone is not a universal replacement rule: ordinary draft edits
produce a new editor object without replacing the lifetime. A rejected edit leaves
the captured view and its pending save live.

Save validity uses pending status, a matching original ID, and a
higher-than-original revision. Reuse a named valid-save predicate (such as
`isValidSave`) where transport validation and public-action acceptance both need
it, preserving both checks. Do not claim these guards authenticate arbitrary
`saved` actions while pending: managed owner gating protects real callbacks.
Separate save validity from merge versus latest cache: in a collection
application whose declared save policy is close-and-refresh, a valid save closes
the editor and starts refresh even if the cache is already equal or newer.

See `a rejected open preserves the pending owner` and `an idle saved is not a completion` in [editor.test.ts](./examples/agent-patterns/tests/editor.test.ts).

## State and data authority

Use unions when values are mutually exclusive. Do not replace genuinely independent
flags with one large enum: selection, request status, filtering and confirmation
may evolve independently. Derive dirty/locked/status messages instead of storing
copies of the same fact. Prefer separate small selectors to a generic selector DSL.

For loaded data, a discriminated union can tie the payload to its valid phase.
For retained stale results, keep the last accepted payload/provenance independent
of the current request phase. Do not label retained results with a newer input query.

The collection example uses these explicit service assumptions:

- IDs are stable and independent of array positions.
- Revisions increase monotonically; equal revisions represent equal data.
- Deletions have versioned tombstones. A missing search match is not deletion.
- Search owns membership; higher-revision entity data owns fields regardless of
  whether it arrived through detail, search or save.
- Drafts are separate snapshots. Background merges do not silently rewrite them.
- Save success may require a new search to determine membership. Updating fields
  alone does not establish that an entry still matches the query.

An unversioned API cannot adopt this policy by inventing client timestamps. Decide
whether a detail response is authoritative, whether refresh invalidates it, and
how save/conflict reconciliation works; test both completion orders. In particular,
never permanently freeze a selected entity merely to avoid one overwrite race.

Use one pure monotonic entity merge helper reused across search, detail, and
save responses. It must use own-property-safe ID lookups (`Object.hasOwn`) and
retain current records when incoming revisions are equal, allowing higher
revisions to update cached fields regardless of origin.

Use one named local search issuance helper (such as `startSearch`) reused for
search, refresh, and save-success, letting callers explicitly decide when to
re-query. Capture the current query and a new request epoch once at issuance; only
accepted results update query provenance and collection membership.

The notebook example demonstrates a single-note editor; request and collection recipes
are tested separately.

## Keep the code easy for an agent to modify

Keep domain state/actions, editor policy, service I/O and view rendering easy to
locate. A modest domain can share a file; split when ownership or independent
modification justifies it. Preserve names such as `save`, `navigate`, and `discard`
in traces. Avoid wrappers that merely rename existing framework APIs.

Delete unused starter modules after replacing their feature. Check actual imports
before removal. Keep component modules out of Node-only fixture imports. Do not
compress branches to improve a line-count score. For each new requirement, update
the policy, its reducer decision, and the test asserting the outcome together.

## Required evidence when changing these patterns

Run the executable example checks and relevant application tests (see [testing-owned-work.md](./testing-owned-work.md)). Preserve paired
negative controls for queued results, transport cancellation, same-ID replacement
with a pending successor, rejected opens, and sibling ownership. Verify idle
completions cannot commit. Test policy-specific data merges and interleaved
operations in both completion orders.
For SSR, compare equal inputs, distinct requests and absence of service execution.
Use the complete [presentation guide](./application-presentation.md) for animated
exit; this basic editor deliberately has no manual visual-completion bookkeeping.
