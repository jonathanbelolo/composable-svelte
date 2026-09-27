import { getContext, setContext } from 'svelte';
import type { TargetRegistry,TargetOwner } from './target-registry.js';
const targetOwnerContext=Symbol('Logical motion target owner');
export function provideTargetOwner(owner:TargetOwner):void{setContext(targetOwnerContext,owner);}
export function useTargetOwner():TargetOwner{const owner=getContext<TargetOwner|undefined>(targetOwnerContext);if(!owner)throw new Error('Managed motion requires a logical target owner');return owner;}
const context = Symbol('ApplicationHost target registry');
export function provideRegistry(registry: TargetRegistry): void { setContext(context, registry);provideTargetOwner(registry.rootOwner); }
export function useRegistry(): TargetRegistry {
  const registry = getContext<TargetRegistry | undefined>(context);
  if (!registry) throw new Error('A managed target requires ApplicationHost');
  return registry;
}

const featureSourceContext=Symbol('Rendered feature request source');
/** The captured feature store rendered by the nearest RenderedFeature; request authority defaults to it. */
export function provideFeatureSource(store:object):void{setContext(featureSourceContext,store);}
export function optionalFeatureSource():object|undefined{return getContext<object|undefined>(featureSourceContext);}
export function optionalRegistry():TargetRegistry|undefined{return getContext<TargetRegistry|undefined>(context);}
