<script lang="ts">
 import AlertDialog from '../../src/lib/navigation-components/alert-dialog/AlertDialog.svelte';
 import AlertDialogTitle from '../../src/lib/navigation-components/alert-dialog/AlertDialogTitle.svelte';
 import AlertDialogDescription from '../../src/lib/navigation-components/alert-dialog/AlertDialogDescription.svelte';
 let title = $state(true); let description = $state(true);
 export function setParts(nextTitle: boolean, nextDescription: boolean) { title = nextTitle; description = nextDescription; }
</script>
<AlertDialog store={undefined} presentation={{ status: 'presented', content: {} }} ariaLabel="Fallback">
 {#snippet children()}
  {#if title}<AlertDialogTitle>Confirm operation</AlertDialogTitle>{/if}
  {#if description}<AlertDialogDescription>Operation details</AlertDialogDescription>{/if}
  <button type="button">Continue</button>
 {/snippet}
</AlertDialog>
