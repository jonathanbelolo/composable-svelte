<script lang="ts">
  import { RadioGroup, Radio } from '@composable-svelte/core/components/ui';
  import { Label } from '@composable-svelte/core/components/ui';

  let selectedPlan = $state('free');
  let notificationPreference = $state('all');
  let theme = $state('light');
</script>

<div class="space-y-12">
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-2">Interactive Demo</h2>
      <p class="text-muted-foreground text-sm">Single selection from multiple options</p>
    </div>

    <div class="flex flex-col items-center justify-center gap-6 p-12 rounded-lg border-2 bg-card">
      <div class="w-full max-w-md space-y-4">
        <Label>Choose a plan</Label>
        <RadioGroup bind:value={selectedPlan}>
          <Radio value="free">Free - $0/month</Radio>
          <Radio value="pro">Pro - $9/month</Radio>
          <Radio value="enterprise">Enterprise - $29/month</Radio>
        </RadioGroup>
      </div>
      <p class="text-sm text-muted-foreground">
        Selected: {selectedPlan}
      </p>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-2">Radio Group Examples</h2>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h3 class="font-semibold">Notification preferences</h3>
        <RadioGroup bind:value={notificationPreference}>
          <Radio value="all">All notifications</Radio>
          <Radio value="important">Important only</Radio>
          <Radio value="none">None</Radio>
        </RadioGroup>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h3 class="font-semibold">Theme selection</h3>
        <RadioGroup bind:value={theme}>
          <Radio value="light">Light mode</Radio>
          <Radio value="dark">Dark mode</Radio>
          <Radio value="system">System default</Radio>
        </RadioGroup>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h3 class="font-semibold">With disabled option</h3>
        <RadioGroup value="option1">
          <Radio value="option1">Available option</Radio>
          <Radio value="option2" disabled>Disabled option</Radio>
          <Radio value="option3">Another option</Radio>
        </RadioGroup>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h3 class="font-semibold">Horizontal layout</h3>
        <RadioGroup value="small" class="flex gap-4">
          <Radio value="small">Small</Radio>
          <Radio value="medium">Medium</Radio>
          <Radio value="large">Large</Radio>
        </RadioGroup>
      </div>
    </div>
  </section>
</div>
