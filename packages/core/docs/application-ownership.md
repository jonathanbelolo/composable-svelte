# Application lifetime

Create managed instances with `ApplicationRoot`. Supply an inert `defineApplication` definition, injected dependencies, and initial input or a server snapshot. Its typed `children(app)` snippet exposes the instance to content. `ApplicationHost` establishes the managed capability context and attaches browser services after mounting.

The Root owns creation and destruction; the Host owns attachment. Removing a Host temporarily preserves application state and completed startup. Removing or key-replacing the Root permanently retires that instance and its captured child handles. This also holds when unmount happens immediately, before deferred Svelte mount effects run, or initial child rendering throws. No caller onDestroy, flush, subscription, or timer is needed.

Values supplied to a Root are captured once. Changing props does not silently replace its definition, dependencies or initial state. Use Svelte's normal keyed component lifetime when a new application instance is intended.

A descendant that needs its application in script calls `useApplication(definition)`. This returns the nearest Root's existing instance. The exact definition must match: a nested Root cannot silently redirect a lookup to a different application's state. Multiple Roots using the same definition remain independent, and nested lookup selects the nearest one. A lookup without a Root fails instead of allocating an unowned instance.

The application projection exposes state, selection, subscription and dispatch; it does not expose destroy or history authority. Feature views continue to use typed owned slots and framework outlets; see [application views](./application-views.md). Dispatch before the first Host claim is rejected; initialize through the definition's factory, snapshot or startup decision. Hosted descendants can dispatch ordinary feature actions during setup, before browser attachment. Startup remains deferred until actual attachment and any route reconciliation finish.

SSR creates isolated request-owned instances, renders initial state, and retires those instances after rendering without starting browser resources or replaying startup effects. Root and Host each release the lifetime they own on immediate unmount and when rendering their content fails. Framework lifetime management adds no visual wrapper or element to your markup.

## Provisional API correction

The pre-release `useApplication(definition, options)` constructor was replaced by declarative ownership. It could retain an instance after its component was immediately unmounted before Svelte installed deferred cleanup. The corrected API rejects those constructor arguments; it does not silently ignore them. Move construction to `ApplicationRoot` and use the snippet parameter or `useApplication(definition)` in descendants. `defineApplication`, typed composition, scoped views, and borrowed `ApplicationHost` behavior remain the same.

See [the complete routed application example](./application-routing.md) for a self-contained Root/Host assembly. This ownership layer does not imply completion of presentation, motion, SvelteKit routing, links or scroll restoration.
