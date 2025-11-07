<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import type { Message, StreamingChatState, StreamingChatAction } from '../types.js';

	/**
	 * Context menu primitive for message actions.
	 *
	 * Shows a dropdown menu with available actions based on message role.
	 */
	interface Props {
		message: Message;
		store: Store<StreamingChatState, StreamingChatAction>;
	}

	const { message, store }: Props = $props();

	let isOpen = $state(false);
	let menuElement: HTMLDivElement | undefined = $state();

	// Close menu when clicking outside
	function handleClickOutside(event: MouseEvent) {
		if (menuElement && !menuElement.contains(event.target as Node)) {
			isOpen = false;
		}
	}

	// Handle actions
	function handleCopy() {
		store.dispatch({ type: 'copyMessage', messageId: message.id });
		isOpen = false;
	}

	function handleEdit() {
		store.dispatch({ type: 'startEditingMessage', messageId: message.id });
		isOpen = false;
	}

	function handleRegenerate() {
		store.dispatch({ type: 'regenerateMessage', messageId: message.id });
		isOpen = false;
	}

	function handleDelete() {
		if (confirm('Delete this message and all following messages?')) {
			store.dispatch({ type: 'deleteMessage', messageId: message.id });
		}
		isOpen = false;
	}

	// Add/remove click listener when menu opens/closes
	$effect(() => {
		if (isOpen) {
			setTimeout(() => document.addEventListener('click', handleClickOutside), 0);
		} else {
			document.removeEventListener('click', handleClickOutside);
		}

		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

<div class="context-menu" bind:this={menuElement}>
	<button
		class="context-menu__trigger"
		onclick={(e) => {
			e.stopPropagation();
			isOpen = !isOpen;
		}}
		aria-label="Message actions"
		title="More actions"
	>
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
			<circle cx="8" cy="3" r="1.5" fill="currentColor"/>
			<circle cx="8" cy="8" r="1.5" fill="currentColor"/>
			<circle cx="8" cy="13" r="1.5" fill="currentColor"/>
		</svg>
	</button>

	{#if isOpen}
		<div class="context-menu__dropdown">
			<button class="context-menu__item" onclick={handleCopy}>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M11 1H3C2.4 1 2 1.4 2 2V11C2 11.6 2.4 12 3 12H11C11.6 12 12 11.6 12 11V2C12 1.4 11.6 1 11 1Z" stroke="currentColor" stroke-width="1.5"/>
					<path d="M14 5V14C14 14.6 13.6 15 13 15H5" stroke="currentColor" stroke-width="1.5"/>
				</svg>
				<span>Copy</span>
			</button>

			{#if message.role === 'user'}
				<button class="context-menu__item" onclick={handleEdit}>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M11.3333 2C11.5084 1.82491 11.716 1.68602 11.9447 1.59126C12.1735 1.49651 12.4191 1.44787 12.6667 1.44787C12.9142 1.44787 13.1598 1.49651 13.3886 1.59126C13.6174 1.68602 13.8249 1.82491 14 2C14.1751 2.17511 14.314 2.38264 14.4088 2.61142C14.5035 2.8402 14.5522 3.08578 14.5522 3.33334C14.5522 3.58091 14.5035 3.82649 14.4088 4.05527C14.314 4.28405 14.1751 4.49158 14 4.66668L5 13.6667L1 14.6667L2 10.6667L11.3333 2Z" stroke="currentColor" stroke-width="1.5"/>
					</svg>
					<span>Edit</span>
				</button>
			{:else}
				<button
					class="context-menu__item"
					onclick={handleRegenerate}
					disabled={$store.isWaitingForResponse}
				>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M1 4V1M1 1H4M1 1L4.5 4.5C5.66667 5.66667 7.33333 6.66667 9.5 6.66667C12.5 6.66667 14.3333 5 15 4M15 12V15M15 15H12M15 15L11.5 11.5C10.3333 10.3333 8.66667 9.33333 6.5 9.33333C3.5 9.33333 1.66667 11 1 12" stroke="currentColor" stroke-width="1.5"/>
					</svg>
					<span>Regenerate</span>
				</button>
			{/if}

			<div class="context-menu__divider"></div>

			<button class="context-menu__item context-menu__item--danger" onclick={handleDelete}>
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M2 4H14M12.6667 4V13.3333C12.6667 14 12 14.6667 11.3333 14.6667H4.66667C4 14.6667 3.33333 14 3.33333 13.3333V4M5.33333 4V2.66667C5.33333 2 6 1.33333 6.66667 1.33333H9.33333C10 1.33333 10.6667 2 10.6667 2.66667V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
				<span>Delete</span>
			</button>
		</div>
	{/if}
</div>

<style>
	.context-menu {
		position: relative;
		display: flex;
		align-items: center;
		margin-left: auto;
	}

	.context-menu__trigger {
		background: rgba(0, 0, 0, 0.1);
		border: none;
		border-radius: 4px;
		padding: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		color: currentColor;
		transition: background 0.2s ease, transform 0.1s ease;
		width: 24px;
		height: 24px;
	}

	.context-menu__trigger:hover {
		background: rgba(0, 0, 0, 0.2);
	}

	.context-menu__trigger:active {
		transform: scale(0.95);
	}

	.context-menu__dropdown {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 4px;
		background: white;
		border: 1px solid #e0e0e0;
		border-radius: 6px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		min-width: 160px;
		z-index: 1000;
		padding: 4px 0;
	}

	.context-menu__item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border: none;
		background: none;
		cursor: pointer;
		font-size: 14px;
		color: #1a1a1a;
		text-align: left;
		transition: background 0.15s ease;
	}

	.context-menu__item:hover:not(:disabled) {
		background: #f5f5f5;
	}

	.context-menu__item:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.context-menu__item--danger {
		color: #dc2626;
	}

	.context-menu__item--danger:hover:not(:disabled) {
		background: #fee;
	}

	.context-menu__divider {
		height: 1px;
		background: #e0e0e0;
		margin: 4px 0;
	}

	/* User message styling */
	:global(.chat-message[data-role='user']) .context-menu__trigger {
		background: rgba(255, 255, 255, 0.2);
	}

	:global(.chat-message[data-role='user']) .context-menu__trigger:hover {
		background: rgba(255, 255, 255, 0.3);
	}

	/* Dark mode support */
	:global(.dark) .context-menu__dropdown {
		background: #2a2a2a;
		border-color: #444;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	:global(.dark) .context-menu__item {
		color: #e0e0e0;
	}

	:global(.dark) .context-menu__item:hover:not(:disabled) {
		background: #333;
	}

	:global(.dark) .context-menu__item--danger:hover:not(:disabled) {
		background: rgba(220, 38, 38, 0.2);
	}

	:global(.dark) .context-menu__divider {
		background: #444;
	}

	:global(.dark .chat-message[data-role='assistant']) .context-menu__trigger {
		background: rgba(255, 255, 255, 0.1);
	}

	:global(.dark .chat-message[data-role='assistant']) .context-menu__trigger:hover {
		background: rgba(255, 255, 255, 0.2);
	}
</style>
