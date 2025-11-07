<script lang="ts">
	/**
	 * Audio Visualizer Component
	 *
	 * Displays real-time audio level visualization with animated bars.
	 */
	interface Props {
		audioLevel: number; // 0-100
		variant?: 'bars' | 'waveform' | 'pulse';
		color?: string;
	}

	const { audioLevel, variant = 'bars', color = '#007AFF' }: Props = $props();

	// Number of bars to display
	const barCount = 20;

	// Generate bar heights based on audio level with some randomness for visual effect
	const barHeights = $derived(
		Array.from({ length: barCount }, (_, i) => {
			// Create a wave pattern across bars
			const position = i / barCount;
			const wave = Math.sin(position * Math.PI);
			const randomness = Math.random() * 0.3 + 0.7;
			return audioLevel * wave * randomness;
		})
	);
</script>

{#if variant === 'bars'}
	<div class="audio-visualizer audio-visualizer--bars">
		{#each barHeights as height, i}
			<div
				class="visualizer-bar"
				style="--height: {height}%; --color: {color}; --delay: {i * 0.02}s"
			></div>
		{/each}
	</div>
{:else if variant === 'pulse'}
	<div class="audio-visualizer audio-visualizer--pulse">
		<div class="pulse-circle" style="--scale: {1 + audioLevel / 100}; --color: {color}"></div>
	</div>
{:else}
	<!-- waveform variant -->
	<div class="audio-visualizer audio-visualizer--waveform">
		<svg viewBox="0 0 100 40" preserveAspectRatio="none">
			{#each barHeights as height, i}
				<rect
					x={i * 5}
					y={20 - height / 2}
					width="4"
					height={Math.max(height, 2)}
					fill={color}
					opacity={0.8}
				/>
			{/each}
		</svg>
	</div>
{/if}

<style>
	.audio-visualizer {
		width: 100%;
		height: 60px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	/* Bars Variant */
	.audio-visualizer--bars {
		gap: 3px;
		padding: 0 8px;
	}

	.visualizer-bar {
		flex: 1;
		min-width: 2px;
		max-width: 6px;
		background: var(--color, #007aff);
		border-radius: 2px;
		height: var(--height, 10%);
		transition:
			height 0.1s ease-out,
			opacity 0.2s ease;
		animation: barPulse 1s ease-in-out infinite;
		animation-delay: var(--delay, 0s);
	}

	@keyframes barPulse {
		0%,
		100% {
			opacity: 0.7;
		}
		50% {
			opacity: 1;
		}
	}

	/* Pulse Variant */
	.audio-visualizer--pulse {
		position: relative;
	}

	.pulse-circle {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--color, #007aff);
		opacity: 0.6;
		transform: scale(var(--scale, 1));
		transition: transform 0.1s ease-out;
	}

	/* Waveform Variant */
	.audio-visualizer--waveform {
		width: 100%;
		height: 100%;
	}

	.audio-visualizer--waveform svg {
		width: 100%;
		height: 100%;
	}

	@media (prefers-reduced-motion: reduce) {
		.visualizer-bar {
			animation: none;
		}

		.pulse-circle {
			transition: none;
		}
	}
</style>
