<script lang="ts">
	/**
	 * Typing Indicator
	 *
	 * Animated dots showing someone is typing.
	 * Shows formatted text like "Alice is typing..." or "3 people are typing...".
	 */

	interface Props {
		/** Array of user names currently typing */
		users: Array<{ id: string; name: string; color: string }>;
		/** Custom class */
		class?: string;
	}

	let { users, class: className = '' }: Props = $props();

	// Format typing text
	const typingText = $derived(() => {
		if (users.length === 0) {
			return '';
		}

		if (users.length === 1) {
			return `${users[0].name} is typing`;
		}

		if (users.length === 2) {
			return `${users[0].name} and ${users[1].name} are typing`;
		}

		return `${users.length} people are typing`;
	});
</script>

{#if users.length > 0}
	<div class="typing-indicator {className}">
		<div class="typing-dots">
			<span class="dot"></span>
			<span class="dot"></span>
			<span class="dot"></span>
		</div>
		<span class="typing-text">{typingText()}</span>
	</div>
{/if}

<style>
	.typing-indicator {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		border-radius: 16px;
		background-color: #f1f5f9;
		font-size: 13px;
		color: #64748b;
	}

	.typing-dots {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background-color: #64748b;
		animation: typing-pulse 1.4s ease-in-out infinite;
	}

	.dot:nth-child(1) {
		animation-delay: 0s;
	}

	.dot:nth-child(2) {
		animation-delay: 0.2s;
	}

	.dot:nth-child(3) {
		animation-delay: 0.4s;
	}

	@keyframes typing-pulse {
		0%,
		60%,
		100% {
			opacity: 0.3;
			transform: scale(0.8);
		}
		30% {
			opacity: 1;
			transform: scale(1);
		}
	}

	.typing-text {
		user-select: none;
	}

	@media (prefers-color-scheme: dark) {
		.typing-indicator {
			background-color: #1e293b;
			color: #94a3b8;
		}

		.dot {
			background-color: #94a3b8;
		}
	}
</style>
