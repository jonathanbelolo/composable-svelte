<script lang="ts">
	/**
	 * Typing Users List
	 *
	 * List of users currently typing with their avatars.
	 * More detailed than the simple typing indicator.
	 */

	interface User {
		id: string;
		name: string;
		color: string;
		avatar?: string;
	}

	interface Props {
		/** Array of users currently typing */
		users: User[];
		/** Show avatars */
		showAvatars?: boolean;
		/** Compact mode (smaller) */
		compact?: boolean;
		/** Custom class */
		class?: string;
	}

	let { users, showAvatars = true, compact = false, class: className = '' }: Props = $props();

	// Generate initials from name
	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((part) => part[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
	}
</script>

{#if users.length > 0}
	<div class="typing-users-list {className}" class:compact>
		{#each users as user (user.id)}
			<div class="typing-user">
				{#if showAvatars}
					<div class="user-avatar" style="background-color: {user.color};">
						{#if user.avatar}
							<img src={user.avatar} alt={user.name} class="avatar-image" />
						{:else}
							<span class="avatar-initials">{getInitials(user.name)}</span>
						{/if}
					</div>
				{:else}
					<div class="color-badge" style="background-color: {user.color};"></div>
				{/if}
				<span class="user-name">{user.name}</span>
				<div class="typing-dots">
					<span class="dot"></span>
					<span class="dot"></span>
					<span class="dot"></span>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.typing-users-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px 0;
	}

	.typing-users-list.compact {
		gap: 4px;
	}

	.typing-user {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		border-radius: 8px;
		background-color: #f1f5f9;
	}

	.user-avatar {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: 600;
		font-size: 11px;
		flex-shrink: 0;
		overflow: hidden;
	}

	.compact .user-avatar {
		width: 20px;
		height: 20px;
		font-size: 10px;
	}

	.avatar-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-initials {
		user-select: none;
	}

	.color-badge {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.user-name {
		font-size: 13px;
		font-weight: 500;
		color: #475569;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.compact .user-name {
		font-size: 12px;
	}

	.typing-dots {
		display: flex;
		align-items: center;
		gap: 3px;
		flex-shrink: 0;
	}

	.dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background-color: #94a3b8;
		animation: typing-pulse 1.4s ease-in-out infinite;
	}

	.compact .dot {
		width: 4px;
		height: 4px;
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

	@media (prefers-color-scheme: dark) {
		.typing-user {
			background-color: #1e293b;
		}

		.user-name {
			color: #cbd5e1;
		}

		.dot {
			background-color: #64748b;
		}
	}
</style>
