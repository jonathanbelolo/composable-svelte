// Within-page (S2) witness app: public assembly, `Presence` owning the conditional that removes a VideoEmbed.
import { Effect, type Reducer } from '@composable-svelte/core';
import { defineApplication } from '@composable-svelte/core/application';
import { defineChoreography, fluidMotion, type ChoreographyPlan } from '@composable-svelte/core/application/motion';
import { mediaVisualProvider } from '../../../src/lib/video-embed/live-media.js';
import type { VideoEmbed } from '../../../src/lib/video-embed/types.js';

export const media = mediaVisualProvider();
export const panelVideo = {
	url: `${location.origin}/tests/fixtures/live-player.html?presenceplayer`,
	embedUrl: `${location.origin}/tests/fixtures/live-player.html?presenceplayer`,
	platform: 'vimeo', videoId: 'presenceplayer', aspectRatio: '16:9', title: 'Presence fixture'
} as VideoEmbed;
export interface PanelState { readonly show: boolean }
export type PanelAction = { readonly type: 'hide' } | { readonly type: 'noop' } | { readonly type: 'boom' };
const reducer: Reducer<PanelState, PanelAction, {}> = (state, action) => {
	if (action.type === 'boom') throw new Error('commit failed');
	return [action.type === 'hide' ? { show: false } : state, Effect.none()];
};
export const definition = defineApplication(reducer, { initialState: () => ({ show: true }), visual: fluidMotion({ providers: [media] }) });
export const leave = (): ChoreographyPlan => defineChoreography({ cueMs: 0, durationMs: 700, tracks: [
	{ participant: 'player', side: 'outgoing', startMs: 400, durationMs: 250, opacity: { from: 1, to: 0 } }
] });
export const hooks: { transition?: (plan: ChoreographyPlan, action: PanelAction) => void } = {};
