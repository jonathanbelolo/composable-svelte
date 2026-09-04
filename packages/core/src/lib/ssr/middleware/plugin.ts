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
 */
export function installsOnParent<F extends (...args: never[]) => unknown>(plugin: F): F {
  Object.defineProperty(plugin, SKIP_OVERRIDE, { value: true });
  return plugin;
}
