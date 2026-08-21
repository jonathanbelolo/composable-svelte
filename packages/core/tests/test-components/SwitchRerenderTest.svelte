<script lang="ts">
	/**
	 * A Switch whose *unrelated* prop can be changed mid-animation, to show what
	 * the reactive inline `style="transform: translateX(...)"` does when Svelte
	 * re-commits it while Motion One is still driving the same property.
	 */
	import Switch from '../../src/lib/components/ui/switch/Switch.svelte';

	let extraClass = $state('');
</script>

<button data-testid="nudge" onclick={() => (extraClass = extraClass ? '' : 'ring-1')}>
	Re-render
</button>

<Switch class={extraClass} />
