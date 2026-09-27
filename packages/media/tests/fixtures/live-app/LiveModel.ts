// A real public-API staged application (the shape of core's slice fixture) with the media provider.
import { Effect, createDestination, type Reducer } from '@composable-svelte/core';
import type { PresentationAction } from '@composable-svelte/core/navigation';
import { defineApplication, defineViews, destinationSlot, ManagedIntegrationBuilder, type StagedRouteRequester } from '@composable-svelte/core/application';
import { defineChoreography, fluidMotion } from '@composable-svelte/core/application/motion';
import { mediaVisualProvider } from '../../../src/lib/video-embed/live-media.js';
import type { VideoEmbed } from '../../../src/lib/video-embed/types.js';
import HomePage from './HomePage.svelte';
import DetailPage from './DetailPage.svelte';
import AboutPage from './AboutPage.svelte';

/** This application's adoption scope: the provider instance it configures. */
export const media = mediaVisualProvider();
/**
 * Whether pages pass `mediaScope` explicitly (default), or rely on core's read-only
 * `useRepresentationProvider('media')` lookup (the S3 witness sets this to false).
 */
export const scoping = { explicit: true };
export const liveVideo: VideoEmbed = {
	url: `${location.origin}/tests/fixtures/live-player.html?hostplayer`,
	platform: 'vimeo',
	videoId: 'hostplayer',
	embedUrl: `${location.origin}/tests/fixtures/live-player.html?hostplayer`,
	aspectRatio: '16:9',
	title: 'Host fixture'
} as VideoEmbed;

interface Page { readonly title: string }
const page: Reducer<Page, { type: 'noop' }, LiveDeps> = (state) => [state, Effect.none()];
const pages = createDestination({ home: page, detail: page, about: page });
export interface LiveState { url: string; page: typeof pages._types.State | null }
export type LiveAction = { type: 'go'; url: string } | { type: 'page'; action: PresentationAction<typeof pages._types.Action> };
export interface LiveDeps { readonly trace: string[] }
export type Intent = { readonly to: '/' | '/detail' | '/about' };
const caseFor = (url: string) => (url === '/detail' ? 'detail' : url === '/about' ? 'about' : 'home');
const stateFor = (url: string): LiveState => ({ url, page: pages.initial(caseFor(url), { title: url }) });
const root: Reducer<LiveState, LiveAction, LiveDeps> = (state, action, deps) => {
	if (action.type !== 'go') return [state, Effect.none()];
	deps.trace.push(`go:${action.url}`);
	return [stateFor(action.url), Effect.none()];
};
const pageSlot = destinationSlot<LiveState, LiveAction>()('page', pages);
const composition = new ManagedIntegrationBuilder(root).with(pageSlot, { replaceOn: (action) => action.type === 'go' }).build();
export const plan = defineViews(composition, { page: { cases: { home: { render: HomePage }, detail: { render: DetailPage }, about: { render: AboutPage } } } });
export const definition = defineApplication(composition, {
	initialState: (url: string) => stateFor(url),
	visual: fluidMotion({ providers: [media] }),
	routing: {
		fragment: 'native',
		serialize: (state) => state.url,
		request: (url) => ({ action: { type: 'go', url }, expectedURL: url }),
		staging: {
			policy: () => true,
			commit: (intent: Intent) => ({ action: { type: 'go', url: intent.to }, expectedURL: intent.to }),
			routeSlot: pageSlot
		}
	}
});
/** Home → detail: the player is shared; the destination adopts it. */
export const toDetail = defineChoreography({ cueMs: 200, durationMs: 500, tracks: [
	{ participant: 'player', side: 'shared', startMs: 0, durationMs: 500, easing: 'ease-in-out' }
] });
/** Home → about: the player only leaves (held, then fades after the cue). */
export const toAbout = defineChoreography({ cueMs: 200, durationMs: 700, tracks: [
	{ participant: 'player', side: 'outgoing', startMs: 400, durationMs: 300, opacity: { from: 1, to: 0 } }
] });
export const requesters: { readonly where: string; readonly requester: StagedRouteRequester<Intent> }[] = [];
