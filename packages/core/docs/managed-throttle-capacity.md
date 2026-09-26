# Managed root throttle history

Managed stores retain the last execution time of each throttle channel. This is
rate-limit history, even after its callback has completed. The next invocation's
interval controls whether it can execute, so an older, shorter interval is not a
safe expiry time.

`execution.rootThrottleCapacity` sets the maximum retained **unowned/root**
throttle channels in one managed runtime. Its default is **1024**, an explicit
safety policy rather than a measured performance ceiling. Supply a finite positive
safe integer to override it. This option requires `execution.mode: 'managed'` and
works identically in `createStore` and `TestStore`. Legacy mode remains unchanged.

```ts
createStore({
  initialState,
  reducer,
  execution: { mode: 'managed', rootThrottleCapacity: 2048 }
});
```

At capacity, existing channels continue working. A new root channel reports an
exported `RootThrottleCapacityError` through the runtime's execution failure and
error mechanisms and does not execute or evict another channel. The reducer turn
has already committed; unrelated batch effects continue. `TestStore.finish()`
surfaces this failure with the typed error as its cause. This is an intentional
managed-mode admission policy, not transparent legacy behavior.

`Effect.cancel(id)` resets that channel and releases its slot. Group cancellation
cancels work while retaining cooldown history and its slot. Runtime destruction
clears history. Completed cooldown history does not make `TestStore.finish()`
wait; a live trailing timer does.

Feature-owned channels are excluded from this root cap and are reclaimed with
their existing owner lifetime. Use managed feature ownership for dynamic item
channels, rather than generating indefinitely many root IDs. The root limit
bounds entry count only: it does not bound all live owned histories or the bytes
in arbitrary identifier strings. No timestamp eviction or consumer cleanup timer
is added.
