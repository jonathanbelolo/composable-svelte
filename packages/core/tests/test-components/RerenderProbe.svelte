<script lang="ts" module>
	/**
	 * Module-scope so the test can inspect what the component captured at setup.
	 * `export const` on an object rather than `export let` — runes mode rejects
	 * reassigning an exported module binding.
	 */
	export const probe: {
		setups: number;
		frozen: { cb: () => string } | null;
		live: { cb: () => string } | null;
	} = { setups: 0, frozen: null, live: null };

	export function resetProbe() {
		probe.setups = 0;
		probe.frozen = null;
		probe.live = null;
	}
</script>

<script lang="ts">
	let { cb, marker }: { cb: () => string; marker: string } = $props();

	probe.setups += 1;
	// The bug shape: reads the prop once, at setup.
	probe.frozen = { cb };
	// The fix shape: reads it on every access.
	probe.live = {
		get cb() {
			return cb;
		}
	};
</script>

<span data-testid="probe-marker">{marker}</span>
