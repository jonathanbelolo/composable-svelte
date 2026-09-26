<script lang="ts">import App from './PlacementApp.svelte';import type {ComponentProps} from 'svelte';let props:ComponentProps<typeof App>=$props();</script>
<svelte:boundary><App {...props}/>{#snippet failed(error)}<p data-error>{String(error)}</p>{/snippet}</svelte:boundary>
