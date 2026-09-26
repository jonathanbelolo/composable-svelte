<script lang="ts">
  import { ApplicationRoot, ApplicationHost } from '@composable-svelte/core/application';
  import { application, type State } from './application';
  import type { EditorDependencies } from './editor';
  import Workspace from './Workspace.svelte';
  let { url = '/notes', snapshot, dependencies }: { url?: string; snapshot?: State; dependencies: EditorDependencies } = $props();
</script>
<ApplicationRoot definition={application} options={{ dependencies, initial: snapshot ? { state: snapshot, url } : { input: url, url } }}>
  {#snippet children(app)}<ApplicationHost {app}><Workspace /></ApplicationHost>{/snippet}
</ApplicationRoot>
