/**
 * Candidate public participant declaration. Registration performs no measurement; the Host
 * measures in its own batched frame phases. Participants are scoped by route instance or shell.
 */
import type { Action } from 'svelte/action';
import { optionalPresence, optionalRouteHost, optionalRouteInstance } from './route-host.js';
import type { RepresentationProvider } from '../representation/types.js';

export interface ParticipantOptions {
  /** Explicit visual identity within its route instance (or shell) scope. */
  readonly key: string;
  /**
   * `control`: an interactive participant (control box). Its paint follows hold-then-fade before commit,
   * keeps a visible usable real control, and is never suppressed as a destination. Default `surface`.
   */
  readonly role?: 'surface' | 'control' | undefined;
}
/**
 * Call during component initialization; returns an action bound to the nearest Host and route instance.
 * Participants may be HTML or SVG elements (an inline `<svg>` root or an SVG group inside one).
 */
export function useParticipant(): Action<HTMLElement | SVGElement, ParticipantOptions> {
  const host = optionalRouteHost();
  const owner = optionalRouteInstance();
  const presence = optionalPresence();
  return (element, options) => {
    // The visual runtime uses only APIs HTML and SVG elements share (style, geometry, matching, containment).
    const node = element as HTMLElement;
    if (!host) return {};
    if (!options || typeof options.key !== 'string' || options.key.length === 0) throw new TypeError('A participant declares a nonempty key');
    let release = host.register(node, options.key, owner, options.role ?? 'surface');
    presence?.add(node);
    return {
      update(next: ParticipantOptions) { release(); release = host.register(node, next.key, owner, next.role ?? 'surface'); },
      destroy() { presence?.delete(node); release(); }
    };
  };
}

/**
 * Candidate public within-page choreography. Call during component initialization. `transition(plan,
 * commit)` captures the scope's participants, runs `commit` (your explicit business action, e.g. a
 * dispatch) immediately, and visually bridges the old and new layouts with the plan's overlapping tracks
 * (shared geometry/intermediate poses/radius/clip/content policy, outgoing and incoming paint). Without a
 * visual Host (SSR, reduced motion, non-staged Host) it simply commits. No business, history or focus
 * authority is taken; route commits keep using staged route requests.
 */
export interface LayoutChoreography { transition(plan: import('./plan.js').ChoreographyPlan, commit: () => void): void }
export function useLayoutChoreography(): LayoutChoreography {
  const host = optionalRouteHost();
  const scope = optionalRouteInstance();
  return Object.freeze({ transition: (plan: import('./plan.js').ChoreographyPlan, commit: () => void) => { if (host) host.local(plan, scope, commit); else commit(); } });
}

/**
 * S3: read-only lookup of a representation provider **the application configured** (`fluidMotion({ providers })`)
 * for the nearest ApplicationHost, by name. Call during component initialization. `undefined` outside a Host, in
 * SSR, without a visual configuration, or when no provider of that name is configured. Nothing is created or
 * registered; configuration, engine and runs are not exposed. Components accepting an explicit provider/scope
 * prefer it over this lookup.
 */
export function useRepresentationProvider<P extends RepresentationProvider = RepresentationProvider>(name: string): P | undefined {
  const host = optionalRouteHost();
  return host?.visual?.providers.find(provider => provider.name === name) as P | undefined;
}
