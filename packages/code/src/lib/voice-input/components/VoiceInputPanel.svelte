<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import type { VoiceInputState, VoiceInputAction } from '../types.js';
	import PushToTalkPanel from './PushToTalkPanel.svelte';

	/**
	 * Voice Input Panel Component
	 *
	 * Modal overlay that appears during voice input.
	 * Shows different panels based on the mode.
	 */
	interface Props {
		store: Store<VoiceInputState, VoiceInputAction>;
	}

	const { store }: Props = $props();
</script>

{#if $store.mode === 'push-to-talk' && $store.status === 'recording'}
	<PushToTalkPanel {store} />
{:else if $store.mode === 'conversation'}
	<!-- TODO: ConversationModePanel will be implemented in Phase 2 -->
	<div class="conversation-placeholder">
		<p>Conversation mode coming in Phase 2</p>
	</div>
{/if}

<style>
	.conversation-placeholder {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.4);
		color: white;
		font-size: 18px;
	}
</style>
