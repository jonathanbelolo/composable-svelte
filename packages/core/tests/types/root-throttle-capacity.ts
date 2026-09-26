// Public root entry: capacity is configurable and the execution error is exported.
import { createStore, Effect, RootThrottleCapacityError, type StoreConfig } from '../../src/lib/index.js';
const configuration: StoreConfig<number, string> = { initialState: 0, reducer: (s, _a) => [s, Effect.none()], execution: { mode: 'managed', rootThrottleCapacity: 2048 } };
const store = createStore(configuration);
const error: Error = new RootThrottleCapacityError(2048);
if (error instanceof RootThrottleCapacityError) {
    const limit: number = error.capacity;
    void limit;
}
store.destroy();
// @ts-expect-error Capacity is numeric, not a text configuration value.
const invalid: StoreConfig<number, string> = { ...configuration, execution: { mode: 'managed', rootThrottleCapacity: '1024' } };
void invalid;
