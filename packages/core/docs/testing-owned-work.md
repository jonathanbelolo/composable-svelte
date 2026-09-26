# Diagnose waits in managed tests

`TestStore.receive()` waits for an action, while `finish()` waits for live work
and rejects unasserted actions. A timeout is evidence about that wait, not proof
that a particular service or cancellation policy is wrong.

| Observation | Next check |
| --- | --- |
| `receive()` names an action from cancelled work | Resolve the actual controlled service promise and assert the surviving state. Managed dispatch drops callbacks from retired work, including services that ignore abort. Do not require that callback to arrive. |
| `finish()` lists a live operation | Resolve its service promise, or dispatch the feature's cancellation action. Cancellation keys are local to the owner; cancelling the same key in a sibling does not cancel this operation. |
| Pending timer or frame work | Advance the injected scheduler explicitly. Increasing a real-time timeout does not advance a deterministic clock. |
| Pending cleanup after owner removal | Resolve the cleanup promise. `destroyAndSettle()` waits for cleanup under its explicit timeout; teardown cannot make an uncooperative cleanup promise settle. |
| A result was already queued before cancellation | Keep the reducer's request epoch/domain acceptance check. Resource retirement does not retroactively remove an ordinary queued action from a live owner's queue. |
| Injected service never called in a Node test | Pass `ssr: { deferEffects: false }` to `createStore`, and assert that the service was invoked before asserting cancellation or completion. See [editor.test.ts](./examples/agent-patterns/tests/editor.test.ts). |
| Result rejected by the reducer in a test | Seed actual valid initial state, or await an accepted load before opening/binding the editor; do not seed through a result rejected by the reducer's phase or epoch checks. |

Use the [managed execution contract](./managed-execution.md),
[ownership contract](./application-ownership.md), and
[cancellation versus freshness explanation](./agent-patterns.md#cancellation-is-not-data-freshness)
to choose the relevant invariant. Transport abort is not server-write rollback,
and neither abort nor owner retirement decides which of two live entity versions wins.

## Preserve both the invariant and a negative control

The [executable request examples](./examples/agent-patterns/tests/request.test.ts)
pair the actual FIFO queued-result schedule with removal of the acceptance gate.
Keep that schedule unchanged: manually inventing a stale action does not establish
that a service callback crossed the queue boundary.

For owned operations, use a deferred service that deliberately ignores abort.
Start work, cancel or replace its genuine owner, then resolve that same promise.
Assert successor fields and cleanup, and require the corresponding negative
control (without cancellation or replacement) to observe the completion. For
sibling owners, start both with the same local key and cancel only one; require
the other to finish. Use genuine captured views for replacement tests, including
replacement with the same domain ID.

These are behavioral tests, not lint rules. Request counters, injected service
captures, and independent cancellation keys can be necessary application policy.
