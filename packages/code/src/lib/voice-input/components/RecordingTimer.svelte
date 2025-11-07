<script lang="ts">
	/**
	 * Recording Timer Component
	 *
	 * Displays elapsed recording time with a blinking red dot indicator.
	 * Updates every 100ms for smooth display.
	 */
	interface Props {
		startTime: number;
		maxDuration?: number; // Optional max (e.g., 60 seconds)
		onMaxDurationReached?: () => void;
	}

	const { startTime, maxDuration, onMaxDurationReached }: Props = $props();

	// Live elapsed time (updated every 100ms)
	let elapsed = $state(0);

	$effect(() => {
		const interval = setInterval(() => {
			const ms = Date.now() - startTime;
			elapsed = ms;

			// Check max duration
			if (maxDuration && ms >= maxDuration * 1000) {
				clearInterval(interval);
				onMaxDurationReached?.();
			}
		}, 100);

		return () => clearInterval(interval);
	});

	// Format milliseconds to "MM:SS"
	const formattedTime = $derived(formatDuration(elapsed));

	function formatDuration(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${minutes}:${secs.toString().padStart(2, '0')}`;
	}
</script>

<div class="recording-timer">
	<span class="recording-dot"></span>
	<span class="recording-time">{formattedTime}</span>
</div>

<style>
	.recording-timer {
		display: flex;
		align-items: center;
		gap: 8px;
		font-variant-numeric: tabular-nums;
	}

	.recording-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #dc2626;
		animation: pulse 1s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.3;
		}
	}

	.recording-time {
		font-size: 14px;
		font-weight: 600;
		color: #dc2626;
		min-width: 48px;
	}

	@media (prefers-reduced-motion: reduce) {
		.recording-dot {
			animation: none;
		}
	}
</style>
