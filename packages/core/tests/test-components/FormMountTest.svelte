<script lang="ts">
	import { z } from 'zod';
	import Form from '../../src/lib/components/form/Form.svelte';

	const config = {
		schema: z.object({ name: z.string() }),
		initialValues: { name: '' },
		onSubmit: async () => {}
	};
</script>

<Form {config}>
	{#snippet children()}
		<span>field</span>
	{/snippet}
</Form>
