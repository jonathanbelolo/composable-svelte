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


</script>

<div class="presence-badge {className}">
	<span
		class="presence-dot"
		data-size={size}
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

	/*
	 * Sized here rather than by a utility class. `size` used to map to `w-2 h-2`
	 * and friends, and this package has no Tailwind — no dependency, no config,
	 * and core's `contentGlob` covers core's own dist only. So the dot had no
	 * width or height at all: a 0x0 box with a 2px opaque border, identical for
	 * every size, with the status colour painting underneath the border where
	 * `background-clip: border-box` hides it.
	 *
	 * `data-size` rather than an inline style, so a consumer can still override
	 * it and the values live in the stylesheet like everything else here.
	 */
	.presence-dot {
		border-radius: 50%;
		border: 2px solid white;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
		flex-shrink: 0;
		background-clip: content-box;
	}

	.presence-dot[data-size='sm'] {
		width: 8px;
		height: 8px;
	}

	.presence-dot[data-size='md'] {
		width: 12px;
		height: 12px;
	}

	.presence-dot[data-size='lg'] {
		width: 16px;
		height: 16px;
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
