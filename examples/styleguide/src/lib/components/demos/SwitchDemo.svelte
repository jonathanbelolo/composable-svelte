<script lang="ts">
  import { Switch } from '@composable-svelte/core/components/ui/switch/index.js';
  import { Label } from '@composable-svelte/core/components/ui/label/index.js';

  let notifications = $state(true);
  let marketing = $state(false);
  let analytics = $state(true);
  let bluetooth = $state(false);
</script>

<div class="space-y-12">
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
      <p class="text-muted-foreground text-sm">Toggle between on/off states</p>
    </div>

    <div class="flex flex-col items-center justify-center gap-6 p-12 rounded-lg border-2 bg-card">
      <div class="flex items-center space-x-2">
        <Switch id="demo-switch" bind:checked={notifications} />
        <Label for="demo-switch">Enable notifications</Label>
      </div>
      <p class="text-sm text-muted-foreground">
        Notifications are {notifications ? 'enabled' : 'disabled'}
      </p>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Switch States</h3>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">On (checked)</h4>
        <div class="flex items-center space-x-2">
          <Switch id="on-switch" checked />
          <Label for="on-switch">Enabled switch</Label>
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Off (unchecked)</h4>
        <div class="flex items-center space-x-2">
          <Switch id="off-switch" />
          <Label for="off-switch">Disabled switch</Label>
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Disabled on</h4>
        <div class="flex items-center space-x-2">
          <Switch id="disabled-on" checked disabled />
          <Label for="disabled-on">Cannot be changed</Label>
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Disabled off</h4>
        <div class="flex items-center space-x-2">
          <Switch id="disabled-off" disabled />
          <Label for="disabled-off">Cannot be changed</Label>
        </div>
      </div>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Settings Example</h3>
      <p class="text-muted-foreground text-sm">Common use case in settings panels</p>
    </div>

    <div class="rounded-lg border bg-card p-6 space-y-6">
      <div class="flex items-center justify-between">
        <div class="space-y-0.5">
          <Label for="marketing-switch">Marketing emails</Label>
          <p class="text-sm text-muted-foreground">Receive emails about new products</p>
        </div>
        <Switch id="marketing-switch" bind:checked={marketing} />
      </div>

      <div class="flex items-center justify-between">
        <div class="space-y-0.5">
          <Label for="analytics-switch">Analytics</Label>
          <p class="text-sm text-muted-foreground">Help us improve by sharing usage data</p>
        </div>
        <Switch id="analytics-switch" bind:checked={analytics} />
      </div>

      <div class="flex items-center justify-between">
        <div class="space-y-0.5">
          <Label for="bluetooth-switch">Bluetooth</Label>
          <p class="text-sm text-muted-foreground">Connect to nearby devices</p>
        </div>
        <Switch id="bluetooth-switch" bind:checked={bluetooth} />
      </div>
    </div>
  </section>
</div>
