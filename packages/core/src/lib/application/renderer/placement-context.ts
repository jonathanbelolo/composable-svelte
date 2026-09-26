import {getContext,setContext} from 'svelte';import type {PlacementScope} from './placement.svelte.js';
const placement=Symbol('FeatureViews placement');
export function providePlacement(scope:PlacementScope){setContext(placement,scope);}
export function usePlacement():PlacementScope{const scope=getContext<PlacementScope|undefined>(placement);if(!scope)throw new Error('FeatureOutlet requires its declared FeatureViews layout');return scope;}
