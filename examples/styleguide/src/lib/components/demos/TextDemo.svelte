<script lang="ts">
  import { Text } from '@composable-svelte/core/components/ui/text/index.js';
</script>

<div class="space-y-12">
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Text Sizes</h3>
      <p class="text-muted-foreground text-sm">
        Extra small to extra large text sizes
      </p>
    </div>

    <div class="space-y-4">
      <div>
        <p class="text-xs text-muted-foreground mb-2">Extra Small (xs)</p>
        <Text size="xs">The quick brown fox jumps over the lazy dog.</Text>
      </div>

      <div>
        <p class="text-xs text-muted-foreground mb-2">Small (sm)</p>
        <Text size="sm">The quick brown fox jumps over the lazy dog.</Text>
      </div>

      <div>
        <p class="text-xs text-muted-foreground mb-2">Base (default)</p>
        <Text size="base">The quick brown fox jumps over the lazy dog.</Text>
      </div>

      <div>
        <p class="text-xs text-muted-foreground mb-2">Large (lg)</p>
        <Text size="lg">The quick brown fox jumps over the lazy dog.</Text>
      </div>

      <div>
        <p class="text-xs text-muted-foreground mb-2">Extra Large (xl)</p>
        <Text size="xl">The quick brown fox jumps over the lazy dog.</Text>
      </div>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Text Variants</h3>
      <p class="text-muted-foreground text-sm">
        Different color and style variants
      </p>
    </div>

    <div class="space-y-4">
      <Text variant="default">Default text color (foreground)</Text>
      <Text variant="muted">Muted text for less important content</Text>
      <Text variant="accent">Accent text for highlights</Text>
      <Text variant="destructive">Destructive text for errors and warnings</Text>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Different Elements</h3>
      <p class="text-muted-foreground text-sm">
        Render as different HTML elements
      </p>
    </div>

    <div class="space-y-4">
      <Text as="p">Paragraph element (default)</Text>
      <Text as="span">Span element for inline text</Text>
      <Text as="div">Div element for block-level text</Text>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Inline Usage</h3>
      <p class="text-muted-foreground text-sm">
        Mix text variants inline
      </p>
    </div>

    <div class="space-y-3">
      <Text>
        This is <Text as="span" variant="accent">highlighted</Text> text within a paragraph.
      </Text>

      <Text>
        Important: <Text as="span" variant="destructive">This action cannot be undone.</Text>
      </Text>

      <Text size="lg">
        Welcome! <Text as="span" size="lg" variant="muted">Please read the instructions below.</Text>
      </Text>
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Custom Styling</h3>
      <p class="text-muted-foreground text-sm">
        Apply additional Tailwind classes
      </p>
    </div>

    <div class="space-y-4">
      <Text class="font-bold">Bold text</Text>
      <Text class="italic">Italic text</Text>
      <Text class="underline">Underlined text</Text>
      <Text class="text-center">Centered text</Text>
      <Text class="line-through">Strikethrough text</Text>
    </div>
  </section>
</div>
