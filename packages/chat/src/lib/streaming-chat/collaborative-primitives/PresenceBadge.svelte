<script lang="ts">
	/**
	 * Presence Badge
	 *
	 * Small presence indicator showing user's current status.
	 * Can be used standalone or overlaid on avatars.
	 */

	import type { UserPresence } from '../collaborative-types.js';

	interface Props {
		/** User presence status */
		presence: UserPresence;
		/** Size of the badge */
		size?: 'sm' | 'md' | 'lg';
		/** Show status text */
		showText?: boolean;
		/** Custom class */
		class?: string;
	}

	let { presence, size = 'md', showText = false, class: className = '' }: Props = $props();

	const presenceColors = {
		active: '#22c55e',  // green
		idle: '#f59e0b',    // amber
		away: '#64748b',    // slate
		offline: '#94a3b8'  // light slate
	};

	const presenceLabels = {
		active: 'Active',
		idle: 'Idle',
		away: 'Away',
		offline: 'Offline'
	};

	const sizeClasses = {
		sm: 'w-2 h-2',
		md: 'w-3 h-3',
		lg: 'w-4 h-4'
	};
</script>

<div class="presence-badge {className}">
	<span
		class="presence-dot {sizeClasses[size]}"
		style="background-color: {presenceColors[presence]};"
		aria-label="{presenceLabels[presence]}"
	></span>
	{#if showText}
		<span class="presence-text">{presenceLabels[presence]}</span>
	{/if}
</div>

<style>
	.presence-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.presence-dot {
		border-radius: 50%;
		border: 2px solid white;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
		flex-shrink: 0;
	}

	.presence-text {
		font-size: 12px;
		font-weight: 500;
		color: #64748b;
	}

	@media (prefers-color-scheme: dark) {
		.presence-dot {
			border-color: #1e293b;
		}

		.presence-text {
			color: #94a3b8;
		}
	}
</style>
