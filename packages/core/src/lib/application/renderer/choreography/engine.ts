/**
 * The optional choreography/representation engine (motion subpath). `fluidMotion()` creates a configured
 * engine for `defineApplication({ visual })`; plans created by `defineChoreography` carry the default engine.
 */
import { ChoreographyRun, liveObservers, type Adoption, type NativeAdoption, type OutgoingAdoption } from './run.js';
import { liveRepresentationHandles } from '../representation/representer.js';
import { liveMediaResources } from '../representation/builtins.js';
import { livePseudoOrderGuards } from '../representation/projection.js';
import { liveNativeSessions } from '../representation/native-snapshot.js';
import type { FluidMotionOptions, RepresentationProvider, VisualConfiguration } from '../representation/types.js';
import type { EngineHandoff, VisualEngine } from './engine-types.js';
import { ProjectionCache } from '../representation/cache.js';

export const DEFAULT_PREPARATION_BUDGET_MS = 600;
function validate(options: FluidMotionOptions): { providers: readonly RepresentationProvider[]; budget: number; native: 'off' | 'namedParticipants' } {
  const providers = options.providers ?? [];
  if (!Array.isArray(providers)) throw new TypeError('providers is a list');
  const names = new Set<string>();
  for (const provider of providers) {
    if (!provider || typeof provider.represent !== 'function' || typeof provider.name !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(provider.name)) throw new TypeError('A representation provider has a lowercase name and represent()');
    if (names.has(provider.name)) throw new TypeError(`Duplicate representation provider ${provider.name}`);
    names.add(provider.name);
  }
  const budget = options.preparationBudgetMs ?? DEFAULT_PREPARATION_BUDGET_MS;
  if (typeof budget !== 'number' || !Number.isFinite(budget) || budget < 16 || budget > 5000) throw new RangeError('preparationBudgetMs is finite, 16–5000');
  const native = options.nativeSnapshot ?? 'off';
  if (native !== 'off' && native !== 'namedParticipants') throw new TypeError("nativeSnapshot is 'off' or 'namedParticipants'");
  if (options.onDiagnostic !== undefined && typeof options.onDiagnostic !== 'function') throw new TypeError('onDiagnostic is a function');
  return { providers: Object.freeze([...providers]), budget, native };
}
/** Create a visual engine configuration for `defineApplication({ visual })`. Inert: no browser work. */
export function fluidMotion(options: FluidMotionOptions = {}): VisualConfiguration {
  const { providers, budget, native } = validate(options);
  // Warm templates never stand in for provider participation: disabled when custom providers are configured.
  const cache = new ProjectionCache(providers.length === 0);
  const engine: VisualEngine = {
    kind: 'composable-visual-engine', version: 1,
    cache,
    warm: node => cache.warm(node, () => ({ document: node.ownerDocument, signal: new AbortController().signal, reducedMotion: false, diagnose: () => {} })),
    forget: node => cache.forget(node),
    get configuration() { return configuration; },
    createRun(host, transaction, plan, source, handoff, done, localCommit, options) {
      const adopted = (handoff?.shared ?? []) as Adoption[];
      const outgoing = new Map(handoff?.outgoing as ReadonlyMap<HTMLElement, OutgoingAdoption> | undefined ?? []);
      const run = new ChoreographyRun(host, transaction, plan, source, adopted, done, outgoing, localCommit, configuration, options);
      if (handoff?.native) run.adoptNative(handoff.native as NativeAdoption);
      return run;
    },
    discard(handoff: EngineHandoff) {
      for (const item of handoff.shared as Adoption[]) { item.rep.handle?.dispose(); item.rep.wrapper.remove(); item.sourceLease?.release(); }
      // Every handed channel is released (restoring its stable value): paint and any active translate/scale.
      for (const { lease, translate, scale } of (handoff.outgoing as ReadonlyMap<HTMLElement, OutgoingAdoption>).values()) { lease.release(); translate?.lease.release(); scale?.lease.release(); }
      (handoff.native as NativeAdoption | undefined)?.session.end();
    },
    resources: () => ({ observers: liveObservers() + livePseudoOrderGuards(), handles: liveRepresentationHandles(), media: liveMediaResources() + liveNativeSessions() })
  };
  const configuration: VisualConfiguration = Object.freeze({ engine, providers, preparationBudgetMs: budget, nativeSnapshot: native, onDiagnostic: options.onDiagnostic });
  return configuration;
}
let defaults: VisualConfiguration | undefined;
/** The engine carried by plans (no application configuration). */
export function defaultVisualConfiguration(): VisualConfiguration { return defaults ??= fluidMotion(); }
