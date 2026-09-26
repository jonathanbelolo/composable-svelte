/**
 * Collaborative chat under managed composition.
 *
 * The socket is a store-owned subscription, so retiring the owner closes it.
 * The hooks install window listeners and timers the store cannot see; under a
 * managed view they release themselves when the owner retires, with no
 * consumer disposer. A standalone store never retires, so there the returned
 * teardown remains the only release, as before.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Effect, createStore, type PresentationAction, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, optionalSlot } from '@composable-svelte/core/application';
import { collaborativeReducer } from '../src/lib/streaming-chat/collaborative-reducer.js';
import {
	createInitialCollaborativeState,
	type CollaborativeAction,
	type CollaborativeDependencies,
	type CollaborativeStreamingChatState
} from '../src/lib/streaming-chat/collaborative-types.js';
import {
	useCursorTracking,
	useHeartbeat,
	usePresenceTracking,
	useTypingEmitter
} from '../src/lib/streaming-chat/collaborative-hooks.js';

interface Room {
	collab: CollaborativeStreamingChatState | null;
}
type RoomAction =
	| { type: 'collab'; action: PresentationAction<CollaborativeAction> }
	| { type: 'leave' };

const room: Reducer<Room, RoomAction, CollaborativeDependencies> = (state, action) =>
	action.type === 'leave' ? [{ ...state, collab: null }, Effect.none()] : [state, Effect.none()];
const collabSlot = optionalSlot<Room, RoomAction>()('collab');
const composition = new ManagedIntegrationBuilder(room).with(collabSlot, collaborativeReducer).build();

const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0).reverse()) cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

function transport() {
	const sockets: Array<{ onMessage: (message: unknown) => void; close: ReturnType<typeof vi.fn> }> = [];
	const sent: unknown[] = [];
	const dependencies: CollaborativeDependencies = {
		connectWebSocket: (_conversation, _user, onMessage, onConnectionChange) => {
			const close = vi.fn();
			sockets.push({ onMessage, close });
			onConnectionChange({ status: 'connected', connectedAt: 0 });
			return close;
		},
		sendWebSocketMessage: async (message) => {
			sent.push(message);
		},
		getTimestamp: () => 0
	};
	return { dependencies, sockets, sent };
}

function managedRoom() {
	const wire = transport();
	const store = createStore({
		initialState: { collab: createInitialCollaborativeState() } satisfies Room,
		dependencies: wire.dependencies,
		...composition
	});
	cleanups.push(() => store.destroy());
	const view = composition.bind(store, collabSlot);
	if (!view) throw new Error('no live collaborative owner');
	view.dispatch({ type: 'connectToConversation', conversationId: 'room-1', userId: 'me' });
	return { ...wire, store, view };
}

function standaloneRoom() {
	const wire = transport();
	const store = createStore({
		initialState: createInitialCollaborativeState(),
		reducer: collaborativeReducer,
		dependencies: wire.dependencies
	});
	cleanups.push(() => store.destroy());
	store.dispatch({ type: 'connectToConversation', conversationId: 'room-1', userId: 'me' });
	return { ...wire, store };
}

const activityEvents = ['mousemove', 'keydown', 'click', 'scroll'];

describe('managed collaborative owner', () => {
	it('retiring the owner closes its socket and drops frames from it', () => {
		const { store, view, sockets } = managedRoom();
		expect(view.state?.connection.status).toBe('connected');

		store.dispatch({ type: 'leave' });
		expect(sockets[0]!.close).toHaveBeenCalledTimes(1);
		expect(view.state).toBeUndefined();

		const log: RoomAction[] = [];
		const stop = store.subscribeToActions!((action) => log.push(action));
		sockets[0]!.onMessage({ type: 'user_left', userId: 'someone' });
		stop();
		expect(log).toEqual([]);
	});

	it('hooks release their listeners and timers when the owner retires, with no disposer', () => {
		vi.useFakeTimers();
		const warn = vi.spyOn(console, 'warn');
		const removeWindow = vi.spyOn(window, 'removeEventListener');
		const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
		const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
		const { store, view, sent } = managedRoom();

		const input = document.createElement('textarea');
		document.body.append(input);
		cleanups.push(() => input.remove());
		const removeInput = vi.spyOn(input, 'removeEventListener');

		const stopPresence = usePresenceTracking(view);
		const stopHeartbeat = useHeartbeat(view, 1000);
		const typing = useTypingEmitter(view, 'message');
		const stopCursor = useCursorTracking(view, input);
		typing.start();

		vi.advanceTimersByTime(1000);
		const beforeRetirement = sent.length;
		expect(sent.some((frame) => (frame as { type: string }).type === 'heartbeat')).toBe(true);

		store.dispatch({ type: 'leave' });

		expect(activityEvents.every((type) => removeWindow.mock.calls.some(([t]) => t === type))).toBe(true);
		expect(clearIntervalSpy).toHaveBeenCalled();
		expect(clearTimeoutSpy).toHaveBeenCalled();
		expect(['selectionchange', 'click', 'keyup', 'blur', 'focus'].every((type) =>
			removeInput.mock.calls.some(([t]) => t === type)
		)).toBe(true);

		vi.advanceTimersByTime(60_000);
		expect(sent).toHaveLength(beforeRetirement);
		expect(vi.getTimerCount()).toBe(0);

		// A consumer that still calls its teardown afterwards changes nothing.
		stopPresence();
		stopHeartbeat();
		typing.cleanup();
		stopCursor();
		expect(warn).not.toHaveBeenCalled();
	});

	it('a typing emitter retired under its consumer stays inert and quiet', () => {
		vi.useFakeTimers();
		const warn = vi.spyOn(console, 'warn');
		const { store, view, sent } = managedRoom();
		const typing = useTypingEmitter(view, 'message');
		const log: RoomAction[] = [];
		cleanups.push(store.subscribeToActions!((action) => log.push(action)));

		store.dispatch({ type: 'leave' });
		const afterRetirement = { sent: sent.length, actions: log.length };
		expect(vi.getTimerCount()).toBe(0);

		// A component kept mounted over a retired view keeps typing.
		vi.advanceTimersByTime(1000);
		typing.start();
		typing.update();
		vi.advanceTimersByTime(1000);
		typing.start();
		typing.update();
		typing.stop();

		expect(vi.getTimerCount()).toBe(0);
		vi.advanceTimersByTime(10_000);
		expect(sent).toHaveLength(afterRetirement.sent);
		expect(log).toHaveLength(afterRetirement.actions);
		expect(warn).not.toHaveBeenCalled();
		typing.cleanup();
		expect(warn).not.toHaveBeenCalled();
	});

	it('a hook given an already-retired view installs nothing that outlives the call', () => {
		vi.useFakeTimers();
		const warn = vi.spyOn(console, 'warn');
		const { store, view } = managedRoom();
		store.dispatch({ type: 'leave' });

		const stop = useHeartbeat(view, 1000);
		expect(vi.getTimerCount()).toBe(0);
		stop();
		expect(warn).not.toHaveBeenCalled();
	});
});

describe('standalone collaborative store', () => {
	it('hooks keep running until their teardown, as before', () => {
		vi.useFakeTimers();
		const { store, sent } = standaloneRoom();
		const stopHeartbeat = useHeartbeat(store, 1000);

		vi.advanceTimersByTime(3000);
		const heartbeats = () => sent.filter((frame) => (frame as { type: string }).type === 'heartbeat').length;
		expect(heartbeats()).toBe(3);

		stopHeartbeat();
		vi.advanceTimersByTime(3000);
		expect(heartbeats()).toBe(3);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('a `{ dispatch }` stand-in still drives a hook', () => {
		vi.useFakeTimers();
		const dispatch = vi.fn();
		const stand = { dispatch } as unknown as Parameters<typeof useHeartbeat>[0];
		const stop = useHeartbeat(stand, 1000);
		vi.advanceTimersByTime(1000);
		expect(dispatch).toHaveBeenCalledWith({ type: 'sendHeartbeat' });
		stop();
	});
});
