<script lang="ts">
 import { untrack } from 'svelte';
 import AlertDialog from '../../src/lib/navigation-components/alert-dialog/AlertDialog.svelte';
 import AlertTitleContent from './AlertTitleContent.svelte';
 let { onTitleInit = () => {}, titleKind = 'snippet', descriptionKind = 'string', initialTitle = true, initialDescription = true, two = false }: {
  onTitleInit?: () => void;
  titleKind?: 'snippet' | 'string' | 'empty';
  descriptionKind?: 'snippet' | 'string' | 'empty';
  initialTitle?: boolean;
  initialDescription?: boolean;
  two?: boolean;
 } = $props();
 let titleEnabled = $state(untrack(() => initialTitle)); let descriptionEnabled = $state(untrack(() => initialDescription));
 let count = $state(0);
 export function setParts(title: boolean, description: boolean) { titleEnabled = title; descriptionEnabled = description; }
</script>
{#snippet customDescription()}<em data-description-content>Custom details</em>{/snippet}
{#snippet customTitle()}<AlertTitleContent onInit={onTitleInit} />{/snippet}
<AlertDialog store={undefined} presentation={{ status: 'presented', content: {} }} ariaLabel="Fallback"
 title={titleEnabled ? (titleKind === 'snippet' ? customTitle : titleKind === 'empty' ? '' : 'String title') : undefined}
 description={descriptionEnabled ? (descriptionKind === 'snippet' ? customDescription : descriptionKind === 'empty' ? '' : 'Operation details') : undefined}>
 {#snippet children()}
  <button type="button" data-footer onclick={() => count += 1}>Count {count}</button>
 {/snippet}
</AlertDialog>
{#if two}
 <AlertDialog store={undefined} presentation={{ status: 'presented', content: {} }} title="Second title" description="Second description">
  {#snippet children()}<button type="button">Continue</button>{/snippet}
 </AlertDialog>
{/if}
