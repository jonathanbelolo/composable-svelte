<script lang="ts">
	/**
	 * `Radio` requires a `RadioGroup` above it — it reads the group's name and
	 * selection from context, which is what makes a set of radios exclusive.
	 * Mounting one alone throws, correctly, so this is how a consumer uses them
	 * and how the tests exercise them.
	 */
	import RadioGroup from '../../src/lib/components/ui/radio/RadioGroup.svelte';
	import Radio from '../../src/lib/components/ui/radio/Radio.svelte';

	let {
		value = 'yes',
		name = 'harness-choice',
		disabled = false
	}: { value?: string; name?: string; disabled?: boolean } = $props();
</script>

<RadioGroup {value} {name}>
	<Radio value="yes" {disabled} />
	<Radio value="no" />
</RadioGroup>
