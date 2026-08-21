<script lang="ts">
	/**
	 * Two fields, so a focus move can be observed as one field losing focus and
	 * another gaining it — a single field cannot distinguish "focus tracked" from
	 * "attribute always on".
	 */
	import { z } from 'zod';
	import Form from '../../src/lib/components/form/Form.svelte';
	import FormField from '../../src/lib/components/form/FormField.svelte';
	import FormControl from '../../src/lib/components/form/FormControl.svelte';

	const config = {
		schema: z.object({ name: z.string().min(2, 'too short'), email: z.string().email() }),
		initialData: { name: '', email: '' },
		onSubmit: async () => {}
	};
</script>

<Form {config}>
	{#snippet children()}
		<FormField name="name">
			{#snippet children()}
				<FormControl>
					{#snippet children({ props })}
						<input data-testid="name" {...props} />
					{/snippet}
				</FormControl>
			{/snippet}
		</FormField>

		<FormField name="email">
			{#snippet children()}
				<FormControl>
					{#snippet children({ props })}
						<input data-testid="email" {...props} />
					{/snippet}
				</FormControl>
			{/snippet}
		</FormField>
	{/snippet}
</Form>
