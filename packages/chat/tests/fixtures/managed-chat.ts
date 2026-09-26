/**
 * Chat under managed composition, with a transport and uploader the test drives.
 *
 * Two sibling chat slots, `left` and `right`, share one root store, one reducer
 * and the same effect ids (`streaming-chat/stream`, `streaming-chat/upload/…`),
 * so any leak between owners shows up as the wrong side moving.
 *
 * The parent reducer does the business handoff the README recommends: it sees
 * every action a chat child reduces, after the child, and keeps what the
 * application cares about (sent prompts, archived replies, copy results,
 * reactions to sync) in its own state.
 */
import { vi } from 'vitest';
import { Effect, createStore, type PresentationAction, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, optionalSlot } from '@composable-svelte/core/application';
import { streamingChatReducer } from '../../src/lib/streaming-chat/reducer.js';
import {
	createInitialStreamingChatState,
	type MessageAttachment,
	type StreamingChatAction,
	type StreamingChatDependencies,
	type StreamingChatState
} from '../../src/lib/streaming-chat/types.js';

export function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((ok, fail) => {
		resolve = ok;
		reject = fail;
	});
	return { promise, resolve, reject };
}

/** One `streamMessage` call: its callbacks, and the controller the store may abort. */
export interface StreamCall {
	message: string;
	attachments: MessageAttachment[] | undefined;
	chunk: (text: string) => void;
	complete: () => void;
	fail: (error: string) => void;
	controller: AbortController;
	abort: ReturnType<typeof vi.fn>;
}

export function fakeTransport() {
	const streams: StreamCall[] = [];
	const uploads: Array<{ file: File; pending: ReturnType<typeof deferred<string>> }> = [];
	let id = 0;
	const dependencies: StreamingChatDependencies = {
		streamMessage: (message, onChunk, onComplete, onError, attachments) => {
			const controller = new AbortController();
			const abort = vi.fn();
			controller.signal.addEventListener('abort', abort);
			streams.push({ message, attachments, chunk: onChunk, complete: onComplete, fail: onError, controller, abort });
			return controller;
		},
		generateId: () => `m${++id}`,
		getTimestamp: () => 1000,
		uploadFile: (file) => {
			const pending = deferred<string>();
			uploads.push({ file, pending });
			return pending.promise;
		}
	};
	return { dependencies, streams, uploads };
}

export interface Workspace {
	left: StreamingChatState | null;
	right: StreamingChatState | null;
	/** Prompts the user sent, per side, in order. */
	sent: Array<{ side: Side; message: string }>;
	/** Completed assistant replies, per side, read from the child's reduced state. */
	archive: Array<{ side: Side; messageId: string; content: string }>;
	copies: Array<{ side: Side; outcome: 'copied' | 'failed' }>;
	/** Reaction toggles an application would send to its server. */
	reactions: Array<{ side: Side; messageId: string; emoji: string; on: boolean }>;
	superseded: Array<{ side: Side; streamId: string; messageId: string }>;
}
export type Side = 'left' | 'right';
export type WorkspaceAction =
	| { type: 'left'; action: PresentationAction<StreamingChatAction> }
	| { type: 'right'; action: PresentationAction<StreamingChatAction> }
	| { type: 'open'; side: Side }
	| { type: 'close'; side: Side }
	| { type: 'restart'; side: Side };

/** What the parent keeps from one reduced child action. `state` is post-child. */
function handoff(state: Workspace, side: Side, action: StreamingChatAction): Workspace {
	switch (action.type) {
		case 'sendMessage':
			return { ...state, sent: [...state.sent, { side, message: action.message }] };
		case 'streamComplete': {
			// Children reduce first: the finished reply is already in the child's messages.
			// The child ignores a completion with no reply in flight, but the parent
			// still receives it: archive each reply once, by its message id.
			const reply = state[side]?.messages.at(-1);
			return reply?.role === 'assistant' && !state.archive.some((r) => r.messageId === reply.id)
				? { ...state, archive: [...state.archive, { side, messageId: reply.id, content: reply.content }] }
				: state;
		}
		case 'copySuccess':
			return { ...state, copies: [...state.copies, { side, outcome: 'copied' }] };
		case 'copyError':
			return { ...state, copies: [...state.copies, { side, outcome: 'failed' }] };
		case 'addReaction':
		case 'removeReaction':
			return {
				...state,
				reactions: [
					...state.reactions,
					{ side, messageId: action.messageId, emoji: action.emoji, on: action.type === 'addReaction' }
				]
			};
		case 'streamSuperseded':
			return {
				...state,
				superseded: [...state.superseded, { side, streamId: action.streamId, messageId: action.messageId }]
			};
		default:
			return state;
	}
}

const workspace: Reducer<Workspace, WorkspaceAction, StreamingChatDependencies> = (state, action) => {
	switch (action.type) {
		case 'open':
			return [{ ...state, [action.side]: state[action.side] ?? createInitialStreamingChatState() }, Effect.none()];
		case 'close':
			return [{ ...state, [action.side]: null }, Effect.none()];
		case 'restart':
			return [{ ...state, [action.side]: createInitialStreamingChatState() }, Effect.none()];
		case 'left':
		case 'right': {
			const child = action.action;
			if (child.type !== 'presented') return [state, Effect.none()];
			return [handoff(state, action.type, child.action), Effect.none()];
		}
	}
};

export const leftSlot = optionalSlot<Workspace, WorkspaceAction>()('left');
export const rightSlot = optionalSlot<Workspace, WorkspaceAction>()('right');
export const composition = new ManagedIntegrationBuilder(workspace)
	.with(leftSlot, streamingChatReducer, {
		replaceOn: (action) => action.type === 'restart' && action.side === 'left'
	})
	.with(rightSlot, streamingChatReducer, {
		replaceOn: (action) => action.type === 'restart' && action.side === 'right'
	})
	.build();

export function emptyWorkspace(): Workspace {
	return { left: null, right: null, sent: [], archive: [], copies: [], reactions: [], superseded: [] };
}

export function createWorkspace(dependencies: StreamingChatDependencies, initial: Partial<Workspace> = {}) {
	const store = createStore({
		initialState: {
			...emptyWorkspace(),
			left: createInitialStreamingChatState(),
			right: createInitialStreamingChatState(),
			...initial
		} satisfies Workspace,
		dependencies,
		...composition
	});
	const bind = (side: Side) => {
		const view = composition.bind(store, side === 'left' ? leftSlot : rightSlot);
		if (!view) throw new Error(`no live ${side} owner`);
		return view;
	};
	return { store, bind };
}

/** A pending attachment whose blob URL is real, so upload and revocation are real too. */
export function blobAttachment(id: string, text = 'file body'): MessageAttachment {
	const file = new File([text], `${id}.txt`, { type: 'text/plain' });
	return {
		id,
		type: 'document',
		url: URL.createObjectURL(file),
		filename: file.name,
		mimeType: file.type,
		size: file.size
	};
}
