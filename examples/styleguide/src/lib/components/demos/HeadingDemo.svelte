<script lang="ts">
  import { Heading } from '@composable-svelte/core/components/ui/heading/index.js';
</script>

<div class="space-y-12">
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Heading Levels</h3>
      <p class="text-muted-foreground text-sm">
        Semantic headings H1-H6 with consistent styling
      </p>
    </div>

    <div class="space-y-6">
      <div>
        <p class="text-xs text-muted-foreground mb-2">Level 1 (H1)</p>
        <Heading level={1}>The quick brown fox jumps over the lazy dog</Heading>
      </div>

      <div>
        <p class="text-xs text-muted-foreground mb-2">Level 2 (H2)</p>
        <Heading level={2}>The quick brown fox jumps over the lazy dog</Heading>
      </div>

      <div>
        <p class="text-xs text-muted-foreground mb-2">Level 3 (H3)</p>
        <Heading level={3}>The quick brown fox jumps over the lazy dog</Heading>
      </div>

      <div>
        <p class="text-xs text-muted-foreground mb-2">Level 4 (H4)</p>
        <Heading level={4}>The quick brown fox jumps over the lazy dog</Heading>
      </div>

      <div>
        <p class="text-xs text-muted-foreground mb-2">Level 5 (H5)</p>
        <Heading level={5}>The quick brown fox jumps over the lazy dog</Heading>
      </div>

      <div>
        <p class="text-xs text-muted-foreground mb-2">Level 6 (H6)</p>
        <Heading level={6}>The quick brown fox jumps over the lazy dog</Heading>
      </div>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Page Structure Example</h3>
      <p class="text-muted-foreground text-sm">
        Proper heading hierarchy in a document
      </p>
    </div>

    <div class="border rounded-lg p-6 space-y-4">
      <Heading level={1}>Article Title</Heading>
      <p class="text-muted-foreground">Published on January 15, 2025</p>

      <div class="space-y-3">
        <Heading level={2}>Introduction</Heading>
        <p class="text-muted-foreground">Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>

        <Heading level={3}>Background</Heading>
        <p class="text-muted-foreground">Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>

        <Heading level={2}>Main Content</Heading>
        <p class="text-muted-foreground">Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.</p>

        <Heading level={3}>Subsection One</Heading>
        <p class="text-muted-foreground">Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.</p>

        <Heading level={3}>Subsection Two</Heading>
        <p class="text-muted-foreground">Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.</p>
      </div>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Custom Styling</h3>
      <p class="text-muted-foreground text-sm">
        Apply custom classes to override default styles
      </p>
    </div>

    <div class="space-y-4">
      <Heading level={2} class="text-primary">Colored Heading</Heading>
      <Heading level={2} class="text-center">Centered Heading</Heading>
      <Heading level={2} class="uppercase">Uppercase Heading</Heading>
      <Heading level={2} class="italic">Italic Heading</Heading>
    </div>
  </section>
</div>
