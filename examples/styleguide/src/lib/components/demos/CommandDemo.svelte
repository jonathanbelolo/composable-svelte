<script lang="ts">
  import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@composable-svelte/core/components/ui';
  import { Button } from '@composable-svelte/core/components/ui';
  import {
    Command,
    CommandInput,
    CommandList
  } from '@composable-svelte/core/components/command';
  // Aliased: the barrel's `CommandItem`/`CommandGroup` names are the
  // COMPONENTS; the data types are reachable under these names.
  import type {
    CommandItemData,
    CommandGroupData
  } from '@composable-svelte/core/components/command';

  /**
   * Exercises the COMPOSED form — `<CommandInput />` and `<CommandList />` with
   * no `store` prop, reading the palette's own store from context.
   *
   * There was no Command demo at all, which is part of why the split-brain
   * shipped: the children each required a `store`, so any consumer had to build
   * a second one, and everything `<Command>` was configured with fed the
   * internal store that nothing rendered.
   */
  let open = $state(false);
  let lastExecuted = $state<string | null>(null);

  const groups: CommandGroupData[] = [
    { id: 'file', label: 'File' },
    { id: 'edit', label: 'Edit' }
  ];

  const commands: CommandItemData[] = [
    { id: 'help', label: 'Show help' },
    { id: 'new', label: 'New file', group: 'file', keywords: ['create'] },
    { id: 'open', label: 'Open file', group: 'file' },
    { id: 'save', label: 'Save file', group: 'file' },
    { id: 'copy', label: 'Copy', group: 'edit' },
    { id: 'paste', label: 'Paste', group: 'edit' }
  ];
</script>

<div class="space-y-12">
  <Card>
    <CardHeader>
      <CardTitle>Command Palette</CardTitle>
      <CardDescription>
        Composed children read the palette store from context — no <code>store</code> prop needed.
        Grouping, <code>maxResults</code> and filtering all come from the store.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <Button onclick={() => (open = true)}>Open palette</Button>

      {#if lastExecuted}
        <p class="text-muted-foreground">Last executed: <strong>{lastExecuted}</strong></p>
      {/if}

      <Command
        bind:open
        {commands}
        {groups}
        maxResults={5}
        onCommandExecute={(command) => {
          lastExecuted = command.label;
          open = false;
        }}
      >
        {#snippet children()}
          <CommandInput placeholder="Type a command…" />
          <CommandList />
        {/snippet}
      </Command>
    </CardContent>
  </Card>
</div>
