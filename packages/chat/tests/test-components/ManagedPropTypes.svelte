<script lang="ts">
	/**
	 * Every store-taking public surface, fed a managed view, typed against the
	 * package's **built** declarations (the names resolve to `dist`).
	 *
	 * Nothing renders this; `svelte-check` is the test. The `@ts-expect-error`
	 * lines pin that the action union is still enforced: a view of some other
	 * feature must not pass as a chat store.
	 */
	import type { ComponentProps } from 'svelte';
	import type { ChildView } from '@composable-svelte/core/application';
	import {
		MinimalStreamingChat,
		StandardStreamingChat,
		FullStreamingChat,
		usePresenceTracking,
		useTypingEmitter,
		useCursorTracking,
		useHeartbeat,
		type StreamingChatState,
		type StreamingChatAction,
		type CollaborativeStreamingChatState,
		type CollaborativeAction,
		type Message
	} from '@composable-svelte/chat';
	import { ActionButtons, ChatMessageWithActions } from '@composable-svelte/chat/streaming-chat';

	let {
		chat,
		collab,
		other,
		message,
		input
	}: {
		chat: ChildView<StreamingChatState, StreamingChatAction>;
		collab: ChildView<CollaborativeStreamingChatState, CollaborativeAction>;
		other: ChildView<StreamingChatState, { type: 'somethingElse' }>;
		message: Message;
		input: HTMLInputElement;
	} = $props();

	const stops: Array<() => void> = [
		usePresenceTracking(collab),
		useHeartbeat(collab),
		useCursorTracking(collab, input),
		useTypingEmitter(collab, 'message').cleanup
	];
	// @ts-expect-error a chat view is not a collaborative store
	useHeartbeat(chat);

	type ChatStoreProp = ComponentProps<typeof FullStreamingChat>['store'];
	// @ts-expect-error another feature's actions
	const foreign: ChatStoreProp = other;
	void stops;
	void foreign;
</script>

<MinimalStreamingChat store={chat} />
<StandardStreamingChat store={chat} />
<FullStreamingChat store={chat} />
<ActionButtons {message} store={chat} />
<ChatMessageWithActions {message} store={chat} />
