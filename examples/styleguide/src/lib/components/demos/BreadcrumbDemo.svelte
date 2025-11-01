<script lang="ts">
  import {
    Breadcrumb,
    BreadcrumbList,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbPage,
    BreadcrumbSeparator,
    BreadcrumbEllipsis
  } from '@composable-svelte/core/components/ui/breadcrumb/index.js';

  let currentPath = $state(['home', 'products', 'electronics', 'computers', 'laptops']);

  // Function to navigate to a specific breadcrumb level
  function navigateTo(index: number) {
    currentPath = currentPath.slice(0, index + 1);
  }

  // Function to add a level (for demo purposes)
  function addLevel() {
    const newLevels = ['accessories', 'chargers', 'cables', 'adapters', 'usb-c'];
    // Use modulo with positive offset to cycle through levels
    const index = (currentPath.length - 5 + newLevels.length * 100) % newLevels.length;
    const nextLevel = newLevels[index];
    currentPath = [...currentPath, nextLevel];
  }
</script>

<div class="space-y-12">
  <!-- Live Demo Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
      <p class="text-muted-foreground text-sm">
        Click on breadcrumb items to navigate. The path will update dynamically.
      </p>
    </div>

    <div class="flex flex-col items-center justify-center gap-6 p-12 rounded-lg border-2 bg-card">
      <Breadcrumb>
        <BreadcrumbList>
          {#each currentPath as crumb, index}
            <BreadcrumbItem>
              {#if index === currentPath.length - 1}
                <BreadcrumbPage>{crumb}</BreadcrumbPage>
              {:else}
                <BreadcrumbLink
                  href="#"
                  onclick={(e) => {
                    e.preventDefault();
                    navigateTo(index);
                  }}
                >
                  {crumb}
                </BreadcrumbLink>
              {/if}
            </BreadcrumbItem>
            {#if index < currentPath.length - 1}
              <BreadcrumbSeparator />
            {/if}
          {/each}
        </BreadcrumbList>
      </Breadcrumb>

      <div class="flex gap-3">
        <button
          onclick={addLevel}
          class="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm transition-colors"
        >
          Add Level
        </button>
        <button
          onclick={() => currentPath = ['home']}
          class="px-4 py-2 rounded-md border hover:bg-accent text-sm transition-colors"
          disabled={currentPath.length === 1}
        >
          Reset
        </button>
      </div>

      <p class="text-sm text-muted-foreground">
        Current depth: {currentPath.length} level{currentPath.length !== 1 ? 's' : ''}
      </p>
    </div>
  </section>

  <!-- Basic Example -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Breadcrumb</h3>
      <p class="text-muted-foreground text-sm">
        Simple breadcrumb navigation with links
      </p>
    </div>

    <div class="rounded-lg border bg-card p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="#">Documents</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Current Page</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  </section>

  <!-- With Ellipsis -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">With Collapsed Items</h3>
      <p class="text-muted-foreground text-sm">
        Use ellipsis to collapse middle items in long paths
      </p>
    </div>

    <div class="rounded-lg border bg-card p-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="#">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbEllipsis />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="#">Products</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="#">Electronics</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Laptops</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  </section>

  <!-- Custom Separator -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Custom Separators</h3>
      <p class="text-muted-foreground text-sm">
        Use custom content as separators
      </p>
    </div>

    <div class="space-y-6">
      <!-- Slash separator -->
      <div class="rounded-lg border bg-card p-8">
        <div class="mb-3 text-sm font-medium text-muted-foreground">Slash separator</div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <span class="text-muted-foreground">/</span>
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Library</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <span class="text-muted-foreground">/</span>
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>Books</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <!-- Arrow separator -->
      <div class="rounded-lg border bg-card p-8">
        <div class="mb-3 text-sm font-medium text-muted-foreground">Arrow separator</div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <span class="text-muted-foreground">→</span>
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Settings</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <span class="text-muted-foreground">→</span>
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>Profile</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <!-- Dot separator -->
      <div class="rounded-lg border bg-card p-8">
        <div class="mb-3 text-sm font-medium text-muted-foreground">Dot separator</div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <span class="text-muted-foreground">•</span>
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Blog</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator>
              <span class="text-muted-foreground">•</span>
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>Article</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  </section>

  <!-- Different Lengths -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Different Path Lengths</h3>
      <p class="text-muted-foreground text-sm">
        Breadcrumbs adapt to different navigation depths
      </p>
    </div>

    <div class="space-y-6">
      <!-- Short path -->
      <div class="rounded-lg border bg-card p-8">
        <div class="mb-3 text-sm font-medium text-muted-foreground">Two levels</div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>About</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <!-- Medium path -->
      <div class="rounded-lg border bg-card p-8">
        <div class="mb-3 text-sm font-medium text-muted-foreground">Four levels</div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Products</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Category</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Item</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <!-- Long path -->
      <div class="rounded-lg border bg-card p-8">
        <div class="mb-3 text-sm font-medium text-muted-foreground">Six levels</div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Shop</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Electronics</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Computers</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Laptops</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Gaming Laptops</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  </section>

  <!-- Accessibility Features -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Accessibility Features</h3>
      <p class="text-muted-foreground text-sm">
        Built with semantic HTML and ARIA attributes
      </p>
    </div>

    <div class="rounded-lg border bg-card p-8 space-y-4">
      <ul class="space-y-2 text-sm">
        <li class="flex items-start gap-2">
          <span class="text-green-500 mt-0.5">✓</span>
          <span><strong>Semantic HTML:</strong> Uses <code class="px-1.5 py-0.5 rounded bg-muted text-xs">&lt;nav&gt;</code> with aria-label="breadcrumb"</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-green-500 mt-0.5">✓</span>
          <span><strong>Ordered List:</strong> Uses <code class="px-1.5 py-0.5 rounded bg-muted text-xs">&lt;ol&gt;</code> to represent hierarchy</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-green-500 mt-0.5">✓</span>
          <span><strong>Current Page:</strong> Uses aria-current="page" for the active page</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-green-500 mt-0.5">✓</span>
          <span><strong>Separators:</strong> Hidden from screen readers with aria-hidden="true"</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-green-500 mt-0.5">✓</span>
          <span><strong>Keyboard Navigation:</strong> All links are keyboard accessible</span>
        </li>
      </ul>

      <div class="pt-4 border-t">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Accessible</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">Navigation</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Example</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  </section>
</div>
