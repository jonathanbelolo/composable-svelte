import type { Store, StoreExecutionConfig } from '../../types.js';
import { managedRootAccess } from '../../execution/store-access.js';
import type { InitializationClaim } from '../../execution/turn-queue.js';
import type { ResourceRecord } from '../../execution/resources.js';
import { TargetRegistry } from './target-registry.js';
import { createMotionClock } from './motion-run.js';

export interface HostClaim {
  readonly registry: TargetRegistry;
  readonly live: boolean;
  attach(): void;
  release(): void;
}
/** Private application assembly, never a consumer lifecycle extension point. */
export interface RendererRouteAttachment {
  start(ready: () => void, failed: (error: unknown) => void): {dispose(): void} | undefined;
}
interface RendererAttachmentOptions {
  readonly route?: RendererRouteAttachment | undefined;
  readonly onFailure?: ((error: unknown) => void) | undefined;
}
const claims = new WeakMap<object, HostClaim>();
/** Internal root identity; creating a renderer owner never creates a second store. */
export function rendererOwner<S, A>(store: Store<S, A>, execution: StoreExecutionConfig<S, A>, options: RendererAttachmentOptions = {}) {
  const access = managedRootAccess(store, execution);
  return {
    claim(): HostClaim {
      if (!access.isLive()) throw new Error('Cannot host a destroyed root store');
      if (claims.get(store)?.live) throw new Error('A root owner already has a live ApplicationHost');
      const clock = createMotionClock(access.scheduler);
      const record: ResourceRecord = access.registerResource({kind:'subscription',description:'ApplicationHost'});
      const registry = new TargetRegistry(store, () => record.live && access.isLive(), error => fail(error), {clock,register:options=>access.registerResource(options),observeCleanup:cleanup=>{access.registerResource({cleanup,description:'Root motion cleanup'}).dispose();}}, clock);
      let attached = false;
      let route: {dispose(): void} | undefined;
      let failed = false;
      let failure: unknown;
      const fail = (error: unknown) => {
        if (failed || !claim.live) return;
        failed = true;
        failure = error;
        record.dispose();
        options.onFailure?.(error);
      };
      const claim: HostClaim & InitializationClaim = {
        registry,
        get live() { return record.live && access.isLive(); },
        onFailure: fail,
        attach() {
          if (!claim.live) throw new Error('Cannot attach a retired ApplicationHost');
          if (attached) return;
          attached = true;
          try {
            registry.attach();
            if (options.route) {
              const connection = options.route.start(() => {
                if (claim.live) access.activateInitialization(claim);
              }, fail);
              // Readiness may synchronously destroy this claim before start returns.
              if (claim.live) route = connection;
              else connection?.dispose();
              if (failed) throw failure;
            } else access.activateInitialization(claim);
          } catch (error) {
            fail(error);
            throw error;
          }
        },
        release() { record.dispose(); }
      };
      claims.set(store, claim);
      record.addCleanup(() => {
        if (claims.get(store) === claim) claims.delete(store);
        access.releaseInitialization(claim);
        const connection = route;
        route = undefined;
        try { connection?.dispose(); } finally { registry.dispose(); }
      });
      return claim;
    }
  };
}
export type RendererOwner = ReturnType<typeof rendererOwner>;
