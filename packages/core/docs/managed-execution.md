# Managed execution: current foundation and migration contract

For direct `createStore` and `createTestStore` calls, managed execution is opt-in with `execution: { mode: 'managed' }`; their default remains legacy execution. Managed application assembly through `defineApplication` and `ApplicationRoot` selects managed execution automatically. A scheduler, ownership descriptor, or internal reduction adapter requires explicit managed mode; these options are never silently ignored. Internal ownership and reduction seams are provisional framework infrastructure, not an application authoring API. Follow the [application authoring contract](./application-contract.md); managed composition owns child lifetime wiring.

## Execution lifetime

A managed `Run`, `Cancellable`, delayed, debounced, or throttled executor owns its dispatch capability until its returned promise settles. A synchronous executor returning `void` completes at the next promise checkpoint. Dispatch during the executor is supported; callbacks invoked after completion are dropped and diagnosed. Keep asynchronous work in the returned promise. Callback-based sources with an independent lifetime belong in `Subscription`, whose synchronous setup returns cleanup. Framework integrations should wrap callback transports once; application features should not repeat transport lifecycle plumbing.

This is an explicit difference from legacy execution, which can accept callbacks after an executor returned. Managed execution does not retain completed resource records indefinitely to preserve that behavior. Cancellation retires capability before abort listeners or cleanup run; cancellation does not wait for uncooperative external promises. An AbortError caused by aborting that execution is expected, while unrelated AbortErrors and genuine late failures remain observable. Subscription setup must be synchronous; invalid promise-returning setup is rejected, and any eventual cleanup is still observed and run exactly once.

## Ownership and cancellation

IDs and group names are local to the original owner token. A root `cancelGroup('load')` does not cancel a child's independently owned `load` group. Removing or replacing that child invalidates its owner and cancels its resources. Captured dispatch never changes authority to a later occupant of the same slot. Parent integrations must use supported lifecycle composition rather than guess qualified names. Invalidation ordering is a deterministic implementation detail (descendants before ancestors) rather than an application contract; store destruction differs by releasing resources in registration order, so dependent cleanup must compose a single disposer.

Rescheduling debounce/throttle timers does not abort already-started work. Explicit cancellation by ID cancels both the scheduled timer and associated running work and resets that throttle identity. Group cancellation cancels work and timers but preserves an already-observed throttle cooldown, matching legacy rate semantics. Owner invalidation and store destruction clear all metadata for that lifetime.

**Root throttle capacity:** root throttle history is finite. `execution.rootThrottleCapacity` bounds the retained unowned/root throttle channels of one managed runtime, identically in `createStore` and `TestStore`; its default is 1024 and an override must be a finite positive safe integer. At capacity a new root channel reports `RootThrottleCapacityError` and does not execute; no history is evicted, and existing IDs remain usable, including with variable durations. Explicit `Effect.cancel(id)` resets that channel and releases its admission. Group cancellation preserves the observed cooldown and its admission. Store destruction clears all history. Legacy execution is unchanged and rejects the option. The bound is an entry count only: it does not cover identifier bytes or all feature-owned histories, which are reclaimed with their owner lifetime. See [Managed root throttle history](./managed-throttle-capacity.md).

## Turns, observation, and tests

Managed dispatch drains FIFO. Reentrant dispatch queues another turn; it does not recursively reduce. Reducers must be pure and immutable. A reducer/reconciliation failure does not commit that turn; unrelated queued turns still drain. External dispatch then throws the original error or an aggregate. Errors from effect-initiated drains are reported through runtime diagnostics rather than escaping into host callbacks. These reports cover the whole drain, including turns queued reentrantly; they do not identify which particular turn failed or committed. An internal typed turn observer identifies the original envelope and its committed snapshot, rejection, or drop; observer failures cannot change acceptance or teardown. No rollback of in-place reducer mutation is promised.

State access and `select` retain Svelte tracking. Plain stores still require an owning lifecycle to call `destroy`; managed applications use [ApplicationRoot ownership](./application-ownership.md) and managed child composition instead. Dispatch after destruction warns once; stale internal callbacks are expected drops. SSR defers effects by default; explicitly enabled server effects belong to the request store and must be destroyed with it.

Managed history defaults to 100 accepted actions; `maxHistorySize` remains supported. Runtime diagnostic history holds at most 100 lifecycle projections and 100 incidents. Projections contain no controllers, promises, action payloads, or original error objects; strings and group counts are capped. Live diagnostic observers receive original events, including cleanup failures after destruction, until explicitly unsubscribed. Owners of such observers must release them when they no longer need teardown observation.

Pending work includes installed subscriptions, scheduled timers, executing effects, and pending cleanup. A long-lived subscription must be cancelled before exhaustive completion is asserted. Test clocks must be advanced explicitly; assertions do not advance business time. Managed scheduler delays reject nonfinite or overflowing values rather than depend on host-specific clamping. A pre-aborted resource registration is cancelled immediately and does not replace an existing live registration under the same ID.

## Managed TestStore

`createTestStore({ initialState, reducer, execution: { mode: 'managed' } })` uses the production turn queue and effect runtime. `send` and `receive` assert each action's committed snapshot, even when the shared FIFO drain has already advanced to later state. Async assertion callbacks do not pause production effects. An omitted scheduler selects the deterministic scheduler; `advanceTime` advances its timer phase explicitly, and frame work requires that scheduler's separate frame step. Neither `receive` nor `finish` advances time. An injected scheduler can be shared, but one store's exhaustive finish accounts only for its own resources.

`finish` requires no unasserted received actions and no remaining owned execution, timer, subscription, or cleanup. Cancel long-lived subscriptions before finishing. `destroyAndSettle` retires capabilities synchronously and then waits for cleanup with a real-time deadline; timeout does not stop observation or prevent a later settlement check. Genuine late execution/cleanup failures fail assertions; ordinary cancellation drops do not. Legacy TestStore execution remains the default and retains its existing behavior.

## Application result acceptance

Cancellation retires future callback authority; it does not retroactively remove
an ordinary result already queued under a still-live owner. Owner invalidation
and resource cancellation are different boundaries. Keep request-acceptance gates
where queued or external results can outlive their request. See the executable
paired counterexample and minimal request pattern in [agent patterns](./agent-patterns.md).
