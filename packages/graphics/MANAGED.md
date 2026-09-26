# Managed graphics integration

## Start here

The [installed consumer recipe](./fixtures/installed-consumer/README.md) is a complete `defineViews` / `FeatureViews` / `FeatureOutlet` application using public exports. Copy it outside this package and run `npm install`; its manifest names the published core `^0.13.1`, graphics `^0.3.0`, and Svelte `^5.20.0` ranges. Then run `npm run check`, `npm run typecheck:nodenext`, `npm run build`, `npm run ssr`, and `npm run test:browser` with Playwright Chromium installed.

## Ownership contract

The application root owns `GraphicsState` and `GraphicsAction`; a managed `ChildView` is passed as `GraphicsStore` to `Scene`, `Camera`, `Mesh`, and `Light`. `Scene` creates a fresh adapter per mounted attachment through `createAdapter` or the default Babylon adapter. It owns and disposes that adapter. Terminal `undefined` stops new renderer work immediately. If initialization is still pending, Scene waits for it to settle and then disposes the adapter exactly once. Replacement views get fresh adapters. `WebGLOverlay` accepts an `owner` and releases its WebGL resources on terminal `undefined`, before outgoing markup unmounts.

## Operation policy

Use reducer actions for persistent scene, camera, mesh, light, animation, and renderer state. Keep native Babylon objects inside adapters rather than in application state. Start an animation through an action; reducer timing begins with the first `tick`, so replayed ticks yield deterministic progress. The public `createAdapter` factory must return a new adapter whose `initialize(canvas)` reports real capabilities and whose `dispose()` releases native resources.

## Troubleshooting and limits

- A jsdom canvas does not execute WebGL. Use `test:browser` or the installed recipe for native engine, context restore, and shader checks.
- WebGPU is not implemented. The accepted `engine: 'webgpu'` option still runs WebGL and reports the actual renderer as `webgl`.
- A retired view does not keep a live canvas through an exit transition. Animate surrounding static layout if needed.
- `AnimationState.startTime` may be `null` until the first tick. Code inspecting it must handle that pending state.
- Provide a new adapter from `createAdapter` on every attachment. Do not reuse a disposed native engine.
- A synchronous throw from `createAdapter()` escapes mount; validate factory inputs before rendering. A failure in the first state sync after initialization reports `rendererError` and releases the adapter. Later subscription sync errors follow the store's existing error reporting policy.
- The browser texture retirement check covers Babylon's own texture disposal; it does not establish a package-level late texture callback contract.
- Reusing `sceneId` can collide for scenes composed under one effect owner because their frame effects share a cancellation map. Distinct managed owners have separate maps; the global duplicate warning cannot tell which case applies.

See [README.md](./README.md) for component props and standalone examples.
