// Public-assembly witness app for ordinary <video> continuity (representation/video.ts).
import { defineApplication } from '../../../src/lib/application/index.js';
import { fluidMotion, type RepresentationProvider, type ChoreographyPlan } from '../../../src/lib/application/motion-public.js';
import { Effect } from '../../../src/lib/effect.js';
import type { Reducer } from '../../../src/lib/types.js';
export interface VideoState { readonly show: boolean }
export type VideoAction = { readonly type: 'hide' };
const reducer: Reducer<VideoState, VideoAction, {}> = (state, action) => [action.type === 'hide' ? { show: false } : state, Effect.none()];
export const diagnostics: string[] = [];
export function videoDefinition(providers: readonly RepresentationProvider[]) {
  return defineApplication(reducer, { initialState: () => ({ show: true }), visual: fluidMotion({ providers, onDiagnostic: event => { diagnostics.push(JSON.stringify(event)); } }) });
}
/** Test access: the transition, the card's element, and its component handlers' invocations. */
export const hooks: { transition?: (plan: ChoreographyPlan, action: VideoAction) => void; video?: HTMLVideoElement; handler: { play: number; pause: number } } = { handler: { play: 0, pause: 0 } };
