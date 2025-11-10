<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import type { VoiceInputState, VoiceInputAction } from '../types.js';
	import PushToTalkPanel from './PushToTalkPanel.svelte';
	import ConversationModePanel from './ConversationModePanel.svelte';

	/**
	 * Voice Input Panel Component
	 *
	 * Modal overlay that appears during voice input.
	 * Shows different panels based on the mode.
	 */
	interface Props {
		store: Store<VoiceInputState, VoiceInputAction>;
		transcripts?: string[]; // Transcript history for conversation mode
	}

	const { store, transcripts = [] }: Props = $props();
</script>

{#if $store.mode === 'push-to-talk' && $store.status === 'recording'}
	<PushToTalkPanel {store} />
{:else if $store.mode === 'conversation'}
	<ConversationModePanel {store} {transcripts} />
{/if}

