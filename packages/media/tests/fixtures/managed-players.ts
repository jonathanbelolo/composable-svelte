/**
 * A managed composition of keyed audio players, for mounting the real player
 * components against genuine `ChildView`s (`composition.bind`).
 */
import { Effect, createStore, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, keyedSlot } from '@composable-svelte/core/application';
import { audioPlayerReducer } from '../../src/lib/audio-player/reducer.js';
import {
	createInitialAudioPlayerState,
	type AudioPlayerAction,
	type AudioPlayerDependencies,
	type AudioPlayerState,
	type AudioTrack
} from '../../src/lib/audio-player/types.js';

export interface Library {
	players: Array<{ id: string; state: AudioPlayerState }>;
}
export type LibraryAction =
	| { type: 'players'; id: string; action: AudioPlayerAction }
	| { type: 'remove'; id: string }
	| { type: 'replace'; id: string; track: AudioTrack };

export const track = (id: string): AudioTrack => ({ id, title: id.toUpperCase(), url: `/${id}.mp3`, duration: 120 });
export const loaded = (t: AudioTrack): AudioPlayerState => ({
	...createInitialAudioPlayerState(),
	playlist: [t],
	currentTrack: t,
	currentTrackIndex: 0,
	duration: 120
});

export const players = keyedSlot<Library, LibraryAction>()('players');

const library: Reducer<Library, LibraryAction, AudioPlayerDependencies> = (state, action) => {
	switch (action.type) {
		case 'remove':
			return [{ players: state.players.filter((row) => row.id !== action.id) }, Effect.none()];
		case 'replace':
			return [
				{ players: state.players.map((row) => (row.id === action.id ? { id: row.id, state: loaded(action.track) } : row)) },
				Effect.none()
			];
		default:
			return [state, Effect.none()];
	}
};

export const composition = new ManagedIntegrationBuilder<Library, LibraryAction, AudioPlayerDependencies>(library)
	.forEach(players, audioPlayerReducer, {
		replaceOn: (action, id) => action.type === 'replace' && action.id === id
	})
	.build();

export function createLibrary(ids: string[]) {
	const store = createStore({
		initialState: { players: ids.map((id) => ({ id, state: loaded(track(id)) })) } satisfies Library,
		dependencies: {} satisfies AudioPlayerDependencies,
		...composition
	});
	const bind = (id: string) => {
		const view = composition.bind(store, players.at(id));
		if (!view) throw new Error(`no live player ${id}`);
		return view;
	};
	return { store, bind };
}
