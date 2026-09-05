/**
 * Fastify's plugin marker.
 *
 * `app.register(plugin)` runs the plugin on an encapsulated child instance, so
 * a hook it adds never reaches the routes of the instance that registered it.
 * The documented `app.register(fastifySecurityHeaders)` installed no headers
 * on any root route, and `ready()` said nothing
 * (AUDIT-2026-09-03-FINDINGS SS3, G5, DA-C5).
 *
 * `fastify-plugin` exists to set this one property. Core sets it itself
 * rather than depend on the package: Fastify reads
 * `fn[Symbol.for('skip-override')]` (`lib/plugin-utils.js`) and, when set,
 * hands the plugin the registering instance.
 */
const SKIP_OVERRIDE = Symbol.for('skip-override');

/**
 * Mark a plugin so `app.register()` installs it on the registering instance.
 * Calling the plugin directly with an instance is unaffected.
 *
 * Writable and configurable, because `fastify-plugin` assigns this same
 * property in strict mode (`fn[Symbol.for('skip-override')] = …`): a
 * non-writable definition made `fp(fastifySecurityHeaders)` throw
 * (R1-REVIEW 1.3). A consumer that wraps a plugin with
 * `fp(plugin, { encapsulate: true })` therefore gets the encapsulation it
 * asked for.
 *
 * The plugins are plain functions that validate and install synchronously
 * and return a resolved promise (Fastify's promise form). A bad config throws
 * synchronously when the plugin is called directly and rejects the promise
 * when it is registered — Fastify calls a plugin with a third `done`
 * argument, which is how the two are told apart — so `ready()` reports it;
 * a synchronous throw inside a registered plugin would escape avvio as an
 * uncaught exception instead.
 */
export function installsOnParent<F extends (...args: never[]) => unknown>(plugin: F): F {
  Object.defineProperty(plugin, SKIP_OVERRIDE, { value: true, writable: true, configurable: true });
  return plugin;
}

/**
 * The failure of a plugin's config, delivered the way its caller can see it:
 * rejected when registered (`registered` is whether Fastify passed `done`),
 * thrown when called directly — the direct-call form must never fail open
 * (R1-REVIEW 1.4).
 */
export function failPlugin(error: unknown, registered: boolean): Promise<never> {
  if (registered) return Promise.reject(error);
  throw error;
}
