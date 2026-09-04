<script lang="ts">
  import { Textarea } from '@composable-svelte/core/components/ui';
  import { Label } from '@composable-svelte/core/components/ui';

  let message = $state('');
  let bio = $state('');
</script>

<div class="space-y-12">
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-2">Interactive Demo</h2>
      <p class="text-muted-foreground text-sm">Multi-line text input for longer content</p>
    </div>

    <div class="flex flex-col items-center justify-center gap-6 p-12 rounded-lg border-2 bg-card">
      <div class="w-full max-w-md space-y-2">
        <Label for="demo-textarea">Your message</Label>
        <Textarea
          id="demo-textarea"
          bind:value={message}
          placeholder="Write your message here..."
          rows={5}
        />
      </div>
      <p class="text-sm text-muted-foreground">
        Character count: {message.length}
      </p>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-2">Variants</h2>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h3 class="font-semibold">Default</h3>
        <div class="space-y-2">
          <Label for="default-textarea">Description</Label>
          <Textarea id="default-textarea" placeholder="Enter description..." />
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h3 class="font-semibold">Disabled</h3>
        <div class="space-y-2">
          <Label for="disabled-textarea">Readonly content</Label>
          <Textarea id="disabled-textarea" value="This content is disabled" disabled />
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h3 class="font-semibold">With row limit</h3>
        <div class="space-y-2">
          <Label for="rows-textarea">Short message (3 rows)</Label>
          <Textarea id="rows-textarea" rows={3} placeholder="Compact textarea..." />
        </div>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-4">
        <h3 class="font-semibold">Large textarea</h3>
        <div class="space-y-2">
          <Label for="large-textarea">Long-form content (10 rows)</Label>
          <Textarea id="large-textarea" rows={10} placeholder="Write a long message..." />
        </div>
      </div>
    </div>
  </section>
</div>
