<script lang="ts">
  import { ApplicationRoot, ApplicationHost } from '@composable-svelte/core/application';
  import { application, type WorkspaceState } from './model';
  import { createFakeWorkspaceDependencies, type WorkspaceDependencies } from './dependencies';
  import Workspace from './Workspace.svelte';

  let {
    dependencies = createFakeWorkspaceDependencies(),
    initialState
  }: {
    dependencies?: WorkspaceDependencies;
    initialState?: Partial<WorkspaceState>;
  } = $props();
</script>

<ApplicationRoot
  definition={application}
  options={{ dependencies, initial: { input: initialState } }}
>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <Workspace />
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
