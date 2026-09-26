import type { Store, StoreExecutionConfig } from '../types.js';
import { bindManagedRootRoute } from '../routing/managed-binding.js';
import { browserHistoryPort, type HistoryDiagnostic } from '../routing/managed-history.js';
import type { RendererRouteAttachment } from './renderer/owner.js';

export interface ApplicationRouteRequest<A> {
  readonly action: A;
  /** Canonical root-relative URL expected if the reducer accepts this request. */
  readonly expectedURL: string;
}
/** Pure browser SPA routing decisions. The framework owns connection and cleanup. */
export interface ApplicationRouting<S, A> {
  readonly fragment: 'native' | 'route';
  readonly serialize: (state: S) => string;
  readonly request: (url: string) => ApplicationRouteRequest<A> | undefined;
  readonly writePolicy?: ((previous: S, next: S) => 'push' | 'replace') | undefined;
}
export function captureApplicationRouting<S, A>(value: ApplicationRouting<S, A>): ApplicationRouting<S, A> {
  if (!value || typeof value !== 'object' || (value.fragment !== 'native' && value.fragment !== 'route'))
    throw new TypeError('Application routing requires a native or route fragment policy');
  if (typeof value.serialize !== 'function' || typeof value.request !== 'function')
    throw new TypeError('Application routing requires serialize and request decisions');
  if (value.writePolicy !== undefined && typeof value.writePolicy !== 'function')
    throw new TypeError('Application routing writePolicy must be a pure decision');
  return Object.freeze({fragment:value.fragment,serialize:value.serialize,request:value.request,writePolicy:value.writePolicy});
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
export function applicationRouteAttachment<S, A, D>(store: Store<S, A>, execution: StoreExecutionConfig<S, A, D>, routing: ApplicationRouting<S, A>, initialURL: string): RendererRouteAttachment {
  let firstAttachment = true;
  const serialize = (state: S) => normalizeApplicationURL(routing.serialize(state));
  const project = (url: string) => routing.fragment === 'native' ? url.split('#')[0]! : url;
  return {
    start(ready, failed) {
      // Called by the actual Host only after mounting; no browser access during SSR.
      const port = browserHistoryPort(window);
      const currentURL = port.read().url;
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
        id: () => Array.from(window.crypto.getRandomValues(new Uint32Array(4)), part => part.toString(16).padStart(8,'0')).join(''),
        report: reportHistory,
        _attachment: {ready,failed}
      });
    }
  };
}
