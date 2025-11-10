<script lang="ts">
	/**
	 * Presence Avatar Stack
	 *
	 * Horizontal stack of user avatars with presence indicators.
	 * Shows first N users, with "+X more" indicator if needed.
	 */

	import PresenceBadge from './PresenceBadge.svelte';
	import type { UserPresence } from '../collaborative-types.js';

	interface User {
		id: string;
		name: string;
		avatar?: string;
		color: string;
		presence: UserPresence;
	}

	interface Props {
		/** Array of users to display */
		users: User[];
		/** Maximum number of avatars to show before "+X more" */
		maxVisible?: number;
		/** Avatar size */
		size?: 'sm' | 'md' | 'lg';
		/** Custom class */
		class?: string;
	}

	let { users, maxVisible = 5, size = 'md', class: className = '' }: Props = $props();

	const visibleUsers = $derived(users.slice(0, maxVisible));
	const hiddenCount = $derived(Math.max(0, users.length - maxVisible));

	const sizePixels = {
		sm: 32,
		md: 40,
		lg: 48
	};

	const sizeClasses = {
		sm: 'w-8 h-8 text-xs',
		md: 'w-10 h-10 text-sm',
		lg: 'w-12 h-12 text-base'
	};

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

<div class="presence-avatar-stack {className}">
	{#each visibleUsers as user, index (user.id)}
		<div class="avatar-wrapper" style="z-index: {visibleUsers.length - index};">
			<div class="avatar {sizeClasses[size]}" style="background-color: {user.color};">
				{#if user.avatar}
					<img src={user.avatar} alt={user.name} class="avatar-image" />
				{:else}
					<span class="avatar-initials">{getInitials(user.name)}</span>
				{/if}
			</div>
			<div class="presence-badge-wrapper">
				<PresenceBadge presence={user.presence} size="sm" />
			</div>
		</div>
	{/each}

	{#if hiddenCount > 0}
		<div class="avatar-more {sizeClasses[size]}" title="{hiddenCount} more users">
			+{hiddenCount}
		</div>
	{/if}
</div>

<style>
	.presence-avatar-stack {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0;
	}

	.avatar-wrapper {
		position: relative;
		margin-left: -8px;
	}

	.avatar-wrapper:first-child {
		margin-left: 0;
	}

	.avatar {
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		border: 2px solid white;
		background-color: #e2e8f0;
		color: white;
		font-weight: 600;
		overflow: hidden;
		cursor: default;
		position: relative;
	}

	.avatar-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-initials {
		user-select: none;
	}

	.presence-badge-wrapper {
		position: absolute;
		bottom: -2px;
		right: -2px;
	}

	.avatar-more {
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		border: 2px solid white;
		background-color: #64748b;
		color: white;
		font-weight: 600;
		margin-left: -8px;
		cursor: default;
	}

	@media (prefers-color-scheme: dark) {
		.avatar {
			border-color: #1e293b;
		}

		.avatar-more {
			border-color: #1e293b;
			background-color: #475569;
		}
	}
</style>
