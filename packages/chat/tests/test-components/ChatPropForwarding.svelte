<script lang="ts">
	import StandardStreamingChat from '../../src/lib/streaming-chat/variants/StandardStreamingChat.svelte';
	import ChatMessage from '../../src/lib/streaming-chat/primitives/ChatMessage.svelte';
	import type { Store } from '@composable-svelte/core';
	import type {
		StreamingChatState,
		StreamingChatAction
	} from '../../src/lib/streaming-chat/types.js';
	import type { Message } from '../../src/lib/streaming-chat/types.js';

	/**
	 * A consumer forwarding its own `$props()` straight through.
	 *
	 * Nothing renders this — it exists to be **typechecked**. Under
	 * `exactOptionalPropertyTypes` an optional prop read from `$props()` is
	 * `T | undefined`, which cannot land on a bare `T?`, so every optional prop
	 * these components declare has to say `| undefined` or they cannot be
	 * wrapped.
	 *
	 * **This file's own props are deliberately bare.** That is the mechanism:
	 * they simulate the naïve consumer whose `$props()` yields `T | undefined`.
	 * A sweep that "fixed" them here would neutralise the fixture and nothing
	 * would go red — which is why every `tests` directory is out of its scope.
	 *
	 * `onReactionClick` is the shape that matters most: a naive
	 * `() => void | undefined` is a function *returning* `void | undefined`,
	 * which typechecks and fixes nothing. Only `(() => void) | undefined` lets
	 * this forward.
	 */
	let {
		store,
		placeholder,
		showClearButton,
		class: className,
		userLabel,
		message,
		onReactionClick,
		onAddReaction
	}: {
		store: Store<StreamingChatState, StreamingChatAction>;
		placeholder?: string;
		showClearButton?: boolean;
		class?: string;
		userLabel?: string;
		message: Message;
		onReactionClick?: (emoji: string) => void;
		onAddReaction?: () => void;
	} = $props();
</script>

<StandardStreamingChat {store} {placeholder} {showClearButton} class={className} {userLabel} />
<ChatMessage {message} {onReactionClick} {onAddReaction} />
