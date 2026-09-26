<script lang="ts">
  import { onDestroy } from 'svelte';
  import Tabs from '../../src/lib/navigation-components/Tabs.svelte';
  import { createManagedChildView } from '../helpers/managed-child-view.js';
  const managed1 = createManagedChildView({ value: 'first' });
  const managed2 = createManagedChildView({ value: 'second' });
  const store1 = managed1.view;
  const store2 = managed2.view;
  onDestroy(() => { managed1.destroy(); managed2.destroy(); });
  let active1=$state(0),active2=$state(0);
</script>
<div data-instance="first"><Tabs store={store1} tabs={['First A','First B','First C']} activeTab={active1} onTabChange={index=>active1=index}/></div>
<div data-instance="second"><Tabs store={store2} tabs={['Second A','Second B','Second C']} activeTab={active2} onTabChange={index=>active2=index}/></div>
