<script lang="ts">
  import { Label } from '@composable-svelte/core/components/ui/label/index.js';
  import { Input } from '@composable-svelte/core/components/ui/input/index.js';
  import { Checkbox } from '@composable-svelte/core/components/ui/checkbox/index.js';
</script>

<div class="space-y-12">
  <!-- Interactive Demo -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
      <p class="text-muted-foreground text-sm">
        Labels provide accessible names for form controls
      </p>
    </div>

    <div class="flex flex-col items-center justify-center gap-6 p-12 rounded-lg border-2 bg-card">
      <div class="w-full max-w-md space-y-4">
        <div class="space-y-2">
          <Label for="demo-email">Email address</Label>
          <Input id="demo-email" type="email" placeholder="you@example.com" />
        </div>
        <div class="flex items-center space-x-2">
          <Checkbox id="demo-terms" />
          <Label for="demo-terms">I agree to the terms and conditions</Label>
        </div>
      </div>
    </div>
  </section>

  <!-- Label Variants -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Label Examples</h3>
      <p class="text-muted-foreground text-sm">
        Different ways to use labels
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Standard Label</h4>
        <div class="space-y-2">
          <Label for="username">Username</Label>
          <Input id="username" placeholder="johndoe" />
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">With Description</h4>
        <div class="space-y-2">
          <Label for="bio">Bio</Label>
          <p class="text-sm text-muted-foreground">Tell us about yourself</p>
          <Input id="bio" placeholder="Software developer..." />
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">Required Field</h4>
        <div class="space-y-2">
          <Label for="required-email">
            Email <span class="text-destructive">*</span>
          </Label>
          <Input id="required-email" type="email" required />
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h4 class="font-semibold">With Checkbox</h4>
        <div class="flex items-center space-x-2">
          <Checkbox id="notifications" />
          <Label for="notifications">Enable notifications</Label>
        </div>
      </div>
    </div>
  </section>

  <!-- Accessibility -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Accessibility Features</h3>
      <p class="text-muted-foreground text-sm">
        Labels are essential for accessibility
      </p>
    </div>

    <div class="rounded-lg border bg-card p-8 space-y-4">
      <ul class="space-y-2 text-sm">
        <li class="flex items-start gap-2">
          <span class="text-green-500 mt-0.5">✓</span>
          <span><strong>Clickable:</strong> Clicking the label focuses/activates the associated control</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-green-500 mt-0.5">✓</span>
          <span><strong>Screen Readers:</strong> Announces the label text when the control is focused</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-green-500 mt-0.5">✓</span>
          <span><strong>Association:</strong> Uses <code class="px-1.5 py-0.5 rounded bg-muted text-xs">for</code> attribute to link to control</span>
        </li>
      </ul>
    </div>
  </section>
</div>
