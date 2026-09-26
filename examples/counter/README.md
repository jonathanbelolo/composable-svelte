# Composable Svelte Counter Example

An interactive counter application demonstrating core Composable Svelte architecture:
- **Pure Reducer**: Synchronous state transitions and declarative side effects.
- **Injected Dependencies**: Decoupled asynchronous fact loading.
- **Effect Cancellation**: Automatic cancellation of in-flight work via `Effect.cancellable` and `Effect.cancel`.
- **Managed Execution**: Opt-in runtime mode (`execution: { mode: 'managed' }`) coordinating lifecycle and cancellation.

## Fact Service Dependencies

By default, the demo uses an offline, deterministic local fact service (`defaultFactService` in `src/facts.ts`) to avoid third-party network failures, latency, and HTTPS mixed-content blocking. Every local fact is explicitly labeled with `[Demo Local Fact]`.

An optional HTTP factory (`createHttpFactService`) requires an explicit `baseUrl` for a secure HTTPS or same-origin endpoint; no external service is assumed available. It requests `${baseUrl}/${count}/trivia`:
- Verifies `response.ok` (treating non-2xx statuses as errors).
- Threads `AbortSignal` for request abortion when cancelled or superseded.

## Effect Cancellation Behavior

- **Reset**: Dispatching `resetTapped` resets state and immediately cancels any in-flight fact requests via `Effect.cancel`.
- **Overlap**: Dispatching `loadFactTapped` while a request is in flight cancels the superseded request using framework `Effect.cancellable`.
- **Count Changes**: Dispatching `incrementTapped` or `decrementTapped` cancels in-flight fact requests and clears the displayed fact so facts always correspond to the current count.

Run `pnpm test`, `pnpm check`, and `pnpm build` from this example. Tests use the public `@composable-svelte/core/test` TestStore and exhaust pending effects with `finish()`.
