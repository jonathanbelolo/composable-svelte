import type { Store, StoreExecutionConfig } from '../types.js';
import { bindManagedRootRoute } from '../routing/managed-binding.js';
import { browserHistoryPort, defaultHistoryMetadataCodec, type HistoryDiagnostic } from '../routing/managed-history.js';
import { createScrollOwnership, validateScrollContainers, type RouteScrollEvent, type RouteScrollSeam, type ScrollCause, type ScrollOwnership, type ScrollPolicy } from '../routing/scroll-restoration.js';
import type { RendererRouteAttachment } from './renderer/owner.js';
import type { ApplicationStaging, RequestHandle, StagedRequestOptions, StagedRouteCoordinator, StagedStatusProjection, TransactionId } from '../routing/staged/types.js';
import { getContext, tick } from 'svelte';
import { applicationContextKey, type ApplicationContext } from './context.js';
import { getApplicationInternal, type ApplicationOwner } from './instance.svelte.js';
import { capturedView, isCapturedView } from '../execution/store-access.js';
import { optionalFeatureSource } from './renderer/context.js';
import type { OwnerToken } from '../execution/identity.js';
import type { ApplicationDefinition } from './definition.js';

export interface ApplicationRouteRequest<A> {
  readonly action: A;
  /** Canonical root-relative URL expected if the reducer accepts this request. */
  readonly expectedURL: string;
}
/** Pure browser SPA routing decisions. The framework owns connection and cleanup. */
export interface ApplicationRouting<S, A, Intent = never> {
  readonly fragment: 'native' | 'route';
  readonly serialize: (state: S) => string;
  readonly request: (url: string) => ApplicationRouteRequest<A> | undefined;
  readonly writePolicy?: ((previous: S, next: S) => 'push' | 'replace') | undefined;
  /** Prospective staged navigation declaration; applications that never stage keep immediate routing. */
  readonly staging?: ApplicationStaging<S, A, Intent> | undefined;
  /** Opt-in binding-owned scroll restoration. Without it, browser restoration behaves as before. */
  readonly scroll?: ApplicationScrollOwnership<S> | undefined;
}
export type { ApplicationStaging, ScrollPolicy };
/** Prospective scroll ownership declaration (internal until qualification). */
export interface ApplicationScrollOwnership<S> {
  /** Semantic policy per route commit. Defaults: push → 'top', replace → 'preserve', traversal → 'entry-restore'. */
  readonly policy?: ((input: { readonly previous: S; readonly next: S; readonly cause: ScrollCause }) => ScrollPolicy | undefined) | undefined;
  /** Keys of containers marked `data-composable-scroll="<key>"`, at most 8. */
  readonly containers?: readonly string[] | undefined;
}
const defaultScrollPolicy: Readonly<Record<ScrollCause, ScrollPolicy>> = Object.freeze({ push: 'top', replace: 'preserve', traversal: 'entry-restore' });
const scrollPolicies: ReadonlySet<unknown> = new Set<ScrollPolicy>(['top', 'preserve', 'entry-restore', 'fragment']);
function captureScroll<S>(value: ApplicationScrollOwnership<S>): ApplicationScrollOwnership<S> {
  if (!value || typeof value !== 'object') throw new TypeError('Route scroll ownership must be a declaration record');
  if (value.policy !== undefined && typeof value.policy !== 'function') throw new TypeError('Route scroll policy must be a pure decision');
  return Object.freeze({ policy: value.policy, containers: validateScrollContainers(value.containers) });
}
/**
 * Stable per-application scroll seam for the Host. It delegates to the currently attached ownership, and is a no-op
 * while detached. Subscriptions survive reattachment.
 */
export function createRouteScrollSeam(): RouteScrollSeam & { attach(ownership: ScrollOwnership): () => void } {
  let current: ScrollOwnership | undefined;
  const listeners = new Set<(event: RouteScrollEvent) => void>();
  const forward = (event: RouteScrollEvent) => { for (const listener of [...listeners]) listener(event); };
  return {
    checkpoint() { current?.checkpoint(); },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    attach(ownership) {
      current = ownership;
      const stop = ownership.subscribe(forward);
      return () => { stop(); if (current === ownership) current = undefined; };
    }
  };
}
function captureStaging<S, A, Intent>(value: ApplicationStaging<S, A, Intent>): ApplicationStaging<S, A, Intent> {
  if (!value || typeof value !== 'object') throw new TypeError('Route staging must be a declaration record');
  if (typeof value.policy !== 'function' || typeof value.commit !== 'function') throw new TypeError('Route staging requires pure policy and commit decisions');
  if (value.routeKey !== undefined && typeof value.routeKey !== 'function') throw new TypeError('Route staging routeKey must be a pure decision');
  if (!value.routeSlot || typeof value.routeSlot !== 'object') throw new TypeError('Route staging requires its route slot');
  if (value.onUnavailable !== undefined && value.onUnavailable !== 'immediate' && value.onUnavailable !== 'drop') throw new TypeError('Route staging onUnavailable must be immediate or drop');
  const budgets = value.budgets === undefined ? undefined : Object.freeze({ preparationMs: value.budgets.preparationMs, cueSlackMs: value.budgets.cueSlackMs });
  for (const budget of [budgets?.preparationMs, budgets?.cueSlackMs]) if (budget !== undefined && (!Number.isFinite(budget) || budget < 0)) throw new RangeError('Route staging budgets must be finite nonnegative milliseconds');
  return Object.freeze({ policy: value.policy, commit: value.commit, routeKey: value.routeKey, routeSlot: value.routeSlot, onUnavailable: value.onUnavailable, budgets });
}
export function captureApplicationRouting<S, A, Intent = never>(value: ApplicationRouting<S, A, Intent>): ApplicationRouting<S, A, Intent> {
  if (!value || typeof value !== 'object' || (value.fragment !== 'native' && value.fragment !== 'route'))
    throw new TypeError('Application routing requires a native or route fragment policy');
  if (typeof value.serialize !== 'function' || typeof value.request !== 'function')
    throw new TypeError('Application routing requires serialize and request decisions');
  if (value.writePolicy !== undefined && typeof value.writePolicy !== 'function')
    throw new TypeError('Application routing writePolicy must be a pure decision');
  const staging = value.staging === undefined ? undefined : captureStaging(value.staging);
  const scroll = value.scroll === undefined ? undefined : captureScroll(value.scroll);
  return Object.freeze({fragment:value.fragment,serialize:value.serialize,request:value.request,writePolicy:value.writePolicy,staging,scroll});
}
/** Pure normalization, shared by server handoff and browser comparisons. */
export function normalizeApplicationURL(value: string, allowAbsolute = false): string {
  if (typeof value !== 'string') throw new TypeError('Application routing requires an initial URL string');
  const relative = value.startsWith('/') && !value.startsWith('//');
  if (!relative && !allowAbsolute) throw new TypeError('Route URLs must be root-relative paths');
  let url: URL;
  try { url = new URL(value, relative ? 'https://composable.invalid' : undefined); }
  catch { throw new TypeError('Expected an absolute HTTP(S) URL or a root-relative URL'); }
  if (relative && url.origin !== 'https://composable.invalid') throw new TypeError('Route URLs must not change the origin');
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new TypeError('Application URLs must use HTTP(S)');
  return url.pathname + url.search + url.hash;
}
const reportHistory = (event: HistoryDiagnostic): void => {
  if (event.type === 'historyFailure') console.error('[Composable Svelte routing]', event);
  else console.warn('[Composable Svelte routing]', event);
};
/** Internal assembly. No port or attachment callback is exposed to application authors. */
/** Pure canonical projections shared by the binding and the staged coordinator. */
export function applicationRouteURLs<S, A, Intent>(routing: ApplicationRouting<S, A, Intent>) {
  const project = (url: string) => routing.fragment === 'native' ? url.split('#')[0]! : url;
  return {
    project,
    serialize: (state: S) => project(normalizeApplicationURL(routing.serialize(state))),
    destination: (url: string) => project(normalizeApplicationURL(url))
  };
}
export function applicationRouteAttachment<S, A, D, Intent = never>(store: Store<S, A>, execution: StoreExecutionConfig<S, A, D>, routing: ApplicationRouting<S, A, Intent>, initialURL: string, staged?: StagedRouteCoordinator<Intent>, scrollSeam?: ReturnType<typeof createRouteScrollSeam>): RendererRouteAttachment {
  let firstAttachment = true;
  const serialize = (state: S) => normalizeApplicationURL(routing.serialize(state));
  const project = (url: string) => routing.fragment === 'native' ? url.split('#')[0]! : url;
  return {
    start(ready, failed) {
      // Called by the actual Host only after mounting; no browser access during SSR.
      const port = browserHistoryPort(window);
      const currentURL = port.read().url;
      const scroll = routing.scroll ? routeScroll(routing.scroll, port, scrollSeam) : undefined;
      const snapshotURL = firstAttachment ? initialURL : serialize(store.state);
      firstAttachment = false;
      return bindManagedRootRoute({
        store, execution, port,
        initial: project(currentURL) === project(snapshotURL) ? 'accepted-state' : 'request-url',
        fragment: routing.fragment,
        serialize,
        request: url => {
          const decision = routing.request(url);
          if (decision === undefined) return undefined;
          if (!decision || typeof decision !== 'object' || !('action' in decision)) throw new TypeError('Route request must return an action with expectedURL, or undefined');
          return {action:decision.action,expectedURL:project(normalizeApplicationURL(decision.expectedURL))};
        },
        ...(routing.writePolicy ? {writePolicy:(previous:S,next:S) => {
          const policy = routing.writePolicy!(previous,next);
          if (policy !== 'push' && policy !== 'replace') throw new TypeError('Route writePolicy must choose push or replace');
          return policy;
        }} : {}),
        ...(staged ? { staging: eligibility => staged.setEligibility(eligibility) } : {}),
        ...(scroll ? { scroll } : {}),
        id: () => Array.from(window.crypto.getRandomValues(new Uint32Array(4)), part => part.toString(16).padStart(8,'0')).join(''),
        report: reportHistory,
        _attachment: {ready,failed}
      });
    }
  };
}

/**
 * Browser scroll ownership for one attachment. The Host's checkpoint normally applies a pending policy after render
 * and before measurement; a post-update `tick()` applies it when no Host checkpoint arrives (idempotent).
 */
function routeScroll<S>(declaration: ApplicationScrollOwnership<S>, port: ReturnType<typeof browserHistoryPort>, seam: ReturnType<typeof createRouteScrollSeam> | undefined) {
  const ownership = createScrollOwnership({
    window, port, codec: defaultHistoryMetadataCodec, containers: declaration.containers,
    report: error => console.error('[Composable Svelte scroll]', error)
  });
  let release: (() => void) | undefined;
  const fallback = () => { if (ownership.pending) void tick().then(() => ownership.checkpoint()); };
  return {
    hooks: {
      attached() { ownership.attached(); release = seam?.attach(ownership); fallback(); },
      beforePush: () => ownership.beforePush(),
      request(policy: ScrollPolicy) { ownership.request(policy); fallback(); },
      physical() { ownership.physical(); fallback(); },
      entryChanged: () => ownership.entryChanged(),
      detached() { release?.(); release = undefined; ownership.detached(); }
    },
    policy: (previous: S, next: S, cause: ScrollCause): ScrollPolicy => {
      let chosen: unknown;
      try { chosen = declaration.policy?.({ previous, next, cause }); }
      catch (error) { console.error('[Composable Svelte scroll]', error); chosen = undefined; }
      if (chosen === undefined) return defaultScrollPolicy[cause];
      if (!scrollPolicies.has(chosen)) { console.error('[Composable Svelte scroll]', new TypeError(`Unknown scroll policy ${String(chosen)}`)); return defaultScrollPolicy[cause]; }
      return chosen as ScrollPolicy;
    }
  };
}

/**
 * Candidate public request surface. Source authority is bound when `useStagedRoute` is called:
 * inside a rendered feature it is that feature's captured owner; in root shell markup it is the root.
 * A retained callback therefore never acquires root lifetime by omission.
 */
export interface StagedRouteRequester<Intent> {
  request(intent: Intent, options?: StagedRequestOptions): RequestHandle;
  cancel(transaction: TransactionId): void;
  readonly status: StagedStatusProjection;
  /** `feature` when bound to a captured feature owner, `root` for shell markup. */
  readonly source: 'feature' | 'root';
}
function sourceFrom(root: object, from: object | undefined): { owner?: OwnerToken; ownerLive?: () => boolean; observeRetirement?: (retired: () => void) => () => void } {
  if (from === undefined) return {};
  if (!from || typeof from !== 'object' || !isCapturedView(from)) throw new TypeError('Staged route source must be a captured feature store');
  const capture = capturedView(from);
  if (capture.root !== root) throw new TypeError('Staged route source belongs to another application');
  return {
    owner: capture.origin,
    ownerLive: () => capture.isLive(),
    observeRetirement: (retired: () => void) => {
      let active = true;
      const record = capture.registerResource({ kind: 'subscription', description: 'Staged route request owner', cleanup: () => { if (active) retired(); } });
      return () => { active = false; record.dispose(); };
    }
  };
}
/** Read the nearest root's staged routing during component initialization; typed by the exact definition. */
export function useStagedRoute<S, A, D, I, Intent>(definition: ApplicationDefinition<S, A, D, I, true, Intent>): StagedRouteRequester<Intent> {
  const context = getContext<ApplicationContext | undefined>(applicationContextKey);
  if (!context) throw new Error('useStagedRoute requires a containing ApplicationRoot');
  if (context.definition !== definition) throw new Error('The nearest ApplicationRoot uses a different application definition');
  const staged = getApplicationInternal(context.app as ApplicationOwner).staged;
  if (!staged) throw new Error('This application definition declares no route staging');
  // Intent erasure is restored from the exact definition identity checked above.
  const coordinator = staged.coordinator as unknown as StagedRouteCoordinator<Intent>;
  const feature = optionalFeatureSource();
  const source = sourceFrom(staged.root, feature);
  return Object.freeze({
    request: (intent: Intent, options: StagedRequestOptions = {}) => coordinator.request(intent, source, options),
    cancel: (transaction: TransactionId) => coordinator.cancel(transaction, source.owner),
    status: coordinator.status,
    source: feature === undefined ? 'root' as const : 'feature' as const
  });
}
