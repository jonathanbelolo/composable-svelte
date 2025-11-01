<script lang="ts">
  import { Box } from '@composable-svelte/core/components/ui/box/index.js';
</script>

<div class="space-y-12">
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Padding Sizes</h3>
      <p class="text-muted-foreground text-sm">
        Different padding options for spacing control
      </p>
    </div>

    <div class="space-y-4">
      {#each ['xs', 'sm', 'md', 'lg', 'xl'] as size}
        <div>
          <p class="text-xs text-muted-foreground mb-2">Padding: {size}</p>
          <Box p={size} class="border bg-muted/50">
            <div class="bg-primary/10 border border-primary/20">
              Content with {size} padding
            </div>
          </Box>
        </div>
      {/each}
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Margin Sizes</h3>
      <p class="text-muted-foreground text-sm">
        Different margin options for spacing
      </p>
    </div>

    <div class="border rounded-lg p-4 bg-muted/50">
      {#each ['xs', 'sm', 'md', 'lg'] as size}
        <Box m={size} class="bg-primary/10 border border-primary/20 p-2">
          Content with {size} margin
        </Box>
      {/each}
    </div>
  </section>

  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Combined Padding and Margin</h3>
      <p class="text-muted-foreground text-sm">
        Use both padding and margin together
      </p>
    </div>

    <div class="border rounded-lg p-4 bg-muted/50">
      <Box p="lg" m="md" class="bg-card border">
        <p class="text-sm">Box with large padding and medium margin</p>
      </Box>
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
      <Box as="article" p="md" class="border bg-card">
        <h4 class="font-semibold mb-2">Article Element</h4>
        <p class="text-sm text-muted-foreground">Box rendered as an article tag</p>
      </Box>

      <Box as="section" p="md" class="border bg-card">
        <h4 class="font-semibold mb-2">Section Element</h4>
        <p class="text-sm text-muted-foreground">Box rendered as a section tag</p>
      </Box>
    </div>
  </section>
</div>
