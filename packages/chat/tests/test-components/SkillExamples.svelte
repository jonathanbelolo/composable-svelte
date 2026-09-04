<script lang="ts">
	/**
	 * The component examples from `.claude/skills/composable-svelte-chat/SKILL.md`,
	 * verbatim.
	 *
	 * `doc-typecheck` compiles the `<script>` body of a svelte fence and says so —
	 * markup expressions are out of its scope. This file is the markup half, and
	 * it is typechecked because `svelte-check` reads every `.svelte` under
	 * `tests`. `packages/core/tests/repo/skill-examples.test.ts` compares the two,
	 * so a fence the skill changes without this file changing goes red.
	 *
	 * Nothing renders this. The stores arrive as props, typed with the package's
	 * real state and action unions, so the fixture asserts the component prop
	 * contracts without inventing a transport.
	 */
	import {
		CursorMarker,
		CursorOverlay,
		FullStreamingChat,
		PresenceAvatarStack,
		PresenceBadge,
		PresenceList,
		StandardStreamingChat,
		TypingIndicator,
		TypingUsersList,
		getActiveUsers,
		getCursorPositions,
		getTypingUsers,
		useTypingEmitter
	} from '../../src/lib/index.js';
	import type { Store } from '@composable-svelte/core';
	import type {
		CollaborativeAction,
		CollaborativeStreamingChatState,
		CollaborativeUser
	} from '../../src/lib/streaming-chat/collaborative-types.js';
	import type {
		StreamingChatAction,
		StreamingChatState
	} from '../../src/lib/streaming-chat/types.js';

	let {
		store,
		chatStore,
		collabStore,
		user,
		x,
		y
	}: {
		store: Store<StreamingChatState, StreamingChatAction>;
		chatStore: Store<StreamingChatState, StreamingChatAction>;
		collabStore: Store<CollaborativeStreamingChatState, CollaborativeAction>;
		user: CollaborativeUser;
		x: number;
		y: number;
	} = $props();

	const currentUserId = 'user-123';

	// Typing indicators for the local user. Throttled, auto-stops after 3s idle.
	const typing = useTypingEmitter(collabStore, 'message');

	let draft = $state('');
	let inputElement = $state<HTMLInputElement | undefined>(undefined);

	// Derived state
	const activeUsers = $derived(getActiveUsers($collabStore.users, currentUserId));
	const typingUsers = $derived(getTypingUsers($collabStore.users, currentUserId, 'message'));
	const cursors = $derived(getCursorPositions($collabStore.users, currentUserId));
</script>

<!-- STREAMING CHAT: Quick Start -->
<StandardStreamingChat {store} />

<!-- STREAMING CHAT: Complete Example -->
<div class="chat-container">
  <FullStreamingChat {store} maxFileSizeMB={25} acceptedFileTypes={['image/*', '.pdf']} />
</div>

<!-- Presence Components: PresenceBadge -->
<PresenceBadge presence="active" showText={true} />

<!-- Presence Components: PresenceAvatarStack -->
<PresenceAvatarStack users={activeUsers} maxVisible={5} />

<!-- Presence Components: PresenceList -->
<PresenceList users={activeUsers} groupByPresence={true} />

<!-- Typing Indicators: TypingIndicator -->
<TypingIndicator users={typingUsers} />

<!-- Typing Indicators: TypingUsersList -->
<TypingUsersList users={typingUsers} />

<!-- Cursor Tracking: CursorMarker -->
<CursorMarker name={user.name} color={user.color} left={x} top={y} />

<!-- Cursor Tracking: CursorOverlay -->
<div style="position: relative;">
  <input bind:this={inputElement} bind:value={draft} />
  {#if inputElement}
    <CursorOverlay {inputElement} {cursors} text={draft} />
  {/if}
</div>

<!-- Complete Collaborative Example -->
<div class="collaborative-chat">
  <!-- Presence indicators -->
  <div class="chat-header">
    <h2>Team Chat</h2>
    <PresenceAvatarStack users={activeUsers} maxVisible={5} />
  </div>

  <!-- Chat interface (its own store) -->
  <StandardStreamingChat store={chatStore} />

  <!-- Shared draft line with live cursors -->
  <div style="position: relative;">
    <input
      bind:this={inputElement}
      bind:value={draft}
      oninput={() => typing.start()}
      onblur={() => typing.stop()}
    />
    {#if inputElement}
      <CursorOverlay {inputElement} {cursors} text={draft} />
    {/if}
  </div>

  <!-- Typing indicator (renders nothing when nobody is typing) -->
  <TypingIndicator users={typingUsers} />

  <!-- Connection status -->
  <div class="connection-status">
    {$collabStore.connection.status}
  </div>
</div>
