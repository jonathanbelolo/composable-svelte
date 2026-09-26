<script lang="ts">
	import Form from '../../src/lib/components/form/Form.svelte';
	import FormField from '../../src/lib/components/form/FormField.svelte';
	import Input from '../../src/lib/components/ui/input/Input.svelte';
	import type { FormConfig, FormStore } from '../../src/lib/components/form/form.types.js';

	interface Props {
		config?: FormConfig<any>;
		store?: FormStore<any>;
		fieldName?: string;
		disabled?: boolean;
	}

	let {
		config,
		store,
		fieldName = 'count',
		disabled = false
	}: Props = $props();
</script>

{#if config}
	<Form {config}>
		<FormField name={fieldName}>
			{#snippet children({ field, send })}
				<Input
					type="number"
					value={field.value}
					action={{ type: 'fieldChanged', field: fieldName }}
					dispatch={send}
					{disabled}
				/>
			{/snippet}
		</FormField>
		<button type="submit">Submit</button>
	</Form>
{:else if store}
	<Form {store}>
		<FormField name={fieldName}>
			{#snippet children({ field, send })}
				<Input
					type="number"
					value={field.value}
					action={{ type: 'fieldChanged', field: fieldName }}
					dispatch={send}
					{disabled}
				/>
			{/snippet}
		</FormField>
		<button type="submit">Submit</button>
	</Form>
{/if}
