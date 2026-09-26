<script lang="ts">
	import type { ViewStore } from '../../internal/view-store.js';
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
		/** A standalone store or a managed feature view; its state is `undefined` once retired. */
		store: ViewStore<VoiceInputState, VoiceInputAction>;
		transcripts?: string[] | undefined; // Transcript history for conversation mode
	}

	const { store, transcripts = [] }: Props = $props();
</script>

{#if $store?.mode === 'push-to-talk' && $store?.status === 'recording'}
	<PushToTalkPanel {store} />
{:else if $store?.mode === 'conversation'}
	<ConversationModePanel {store} {transcripts} />
{/if}

