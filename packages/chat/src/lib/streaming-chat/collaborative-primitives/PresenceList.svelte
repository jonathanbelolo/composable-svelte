<script lang="ts">
	/**
	 * Presence List
	 *
	 * Vertical list of all users with their presence status.
	 * Useful for sidebars or dropdowns.
	 */

	import PresenceBadge from './PresenceBadge.svelte';
	import { createIntlFormatters } from '@composable-svelte/core/i18n';
	import type { UserPresence } from '../collaborative-types.js';

	interface User {
		id: string;
		name: string;
		avatar?: string | undefined;
		color: string;
		presence: UserPresence;
		/**
		 * When this user was last seen, as a timestamp.
		 *
		 * Optional so existing callers keep compiling — `CollaborativeUser`
		 * declares it as required, and the reducer has always written it on
		 * `userPresenceChanged` and `heartbeatReceived`. Nothing read it until
		 * now, which is why it is being surfaced here rather than deleted.
		 */
		lastSeen?: number | undefined;
	}

	interface Props {
		/** Array of users to display */
		users: User[];
		/** Group users by presence status */
		groupByPresence?: boolean | undefined;
		/** Show empty state when no users */
		showEmptyState?: boolean | undefined;
		/** Custom class */
		class?: string | undefined;
		/** Locale for the "last seen" text. Defaults to the browser's. */
		locale?: string | undefined;
	}

	let {
		users,
		groupByPresence = false,
		showEmptyState = true,
		class: className = '',
		locale = undefined
	}: Props = $props();

	// Core's formatter rather than another hand-rolled one — it picks the unit and
	// falls back safely when `Intl.RelativeTimeFormat` is unavailable. Core is a
	// required peer, so this costs no new dependency.
	const formatters = createIntlFormatters();
	const resolvedLocale = $derived(
		locale ?? (typeof navigator !== 'undefined' ? navigator.language : 'en')
	);

	// Only for users who are not currently here. "Last seen 2 minutes ago" next to
	// an active badge is noise.
	function lastSeenLabel(user: User): string | null {
		if (user.presence === 'active' || user.lastSeen === undefined) return null;
		return formatters.formatRelativeTime(new Date(user.lastSeen), resolvedLocale);
	}

	// Group users by presence if requested
	const groupedUsers = $derived.by(() => {
		const groups: Record<UserPresence, User[]> = {
			active: [],
			idle: [],
			away: [],
			offline: []
		};

		// Only the grouped branch of the template reads this; when grouping is off
		// the template iterates `users` directly, so skip the work.
		if (!groupByPresence) return groups;

		for (const user of users) {
			// `presence` arrives over a WebSocket, so an out-of-range value is a
			// server bug away — bucket it rather than throwing on undefined.push.
			(groups[user.presence] ?? groups.offline).push(user);
		}

		return groups;
	});

	const presenceOrder: UserPresence[] = ['active', 'idle', 'away', 'offline'];

	const presenceLabels: Record<UserPresence, string> = {
		active: 'Active',
		idle: 'Idle',
		away: 'Away',
		offline: 'Offline'
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

<div class="presence-list {className}">
	{#if users.length === 0 && showEmptyState}
		<div class="empty-state">
			<p>No users online</p>
		</div>
	{:else if groupByPresence}
		{#each presenceOrder as presenceStatus}
			{@const usersInGroup = groupedUsers[presenceStatus]}
			{#if usersInGroup.length > 0}
				<div class="presence-group">
					<h3 class="group-header">
						{presenceLabels[presenceStatus]} ({usersInGroup.length})
					</h3>
					<div class="user-list">
						{#each usersInGroup as user (user.id)}
							<div class="user-item">
								<div class="user-avatar" style="background-color: {user.color};">
									{#if user.avatar}
										<img src={user.avatar} alt={user.name} class="avatar-image" />
									{:else}
										<span class="avatar-initials">{getInitials(user.name)}</span>
									{/if}
								</div>
								<div class="user-info">
									<span class="user-name">{user.name}</span>
									{#if lastSeenLabel(user)}
										<span class="user-last-seen">Last seen {lastSeenLabel(user)}</span>
									{/if}
								</div>
								<PresenceBadge presence={user.presence} size="sm" />
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/each}
	{:else}
		<div class="user-list">
			{#each users as user (user.id)}
				<div class="user-item">
					<div class="user-avatar" style="background-color: {user.color};">
						{#if user.avatar}
							<img src={user.avatar} alt={user.name} class="avatar-image" />
						{:else}
							<span class="avatar-initials">{getInitials(user.name)}</span>
						{/if}
					</div>
					<div class="user-info">
						<span class="user-name">{user.name}</span>
						{#if lastSeenLabel(user)}
							<span class="user-last-seen">Last seen {lastSeenLabel(user)}</span>
						{/if}
					</div>
					<PresenceBadge presence={user.presence} size="sm" />
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.presence-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.empty-state {
		padding: 32px;
		text-align: center;
		color: #94a3b8;
		font-size: 14px;
	}

	.presence-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.group-header {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		color: #64748b;
		margin: 0;
		padding: 0 12px;
	}

	.user-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.user-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		border-radius: 8px;
	}

	.user-item:hover {
		background-color: #f1f5f9;
	}

	.user-avatar {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-weight: 600;
		font-size: 14px;
		flex-shrink: 0;
		overflow: hidden;
	}

	.avatar-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-initials {
		user-select: none;
	}

	.user-last-seen {
		font-size: 11px;
		color: #94a3b8;
	}

	.user-info {
		flex: 1;
		min-width: 0;
	}

	.user-name {
		font-size: 14px;
		font-weight: 500;
		color: #1e293b;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@media (prefers-color-scheme: dark) {
		.empty-state {
			color: #64748b;
		}

		.group-header {
			color: #94a3b8;
		}

		.user-item:hover {
			background-color: #1e293b;
		}

		.user-name {
			color: #e2e8f0;
		}
	}
</style>
