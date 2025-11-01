<script lang="ts">
  import { Skeleton } from '@composable-svelte/core/components/ui/skeleton/index.js';
  import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@composable-svelte/core/components/ui/card/index.js';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';
  import { Avatar } from '@composable-svelte/core/components/ui/avatar/index.js';

  let showContent = $state(false);
</script>

<div class="space-y-12">
  <!-- Basic Skeletons -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Skeleton Shapes</h3>
      <p class="text-muted-foreground text-sm">
        Loading placeholders for different content types
      </p>
    </div>

    <Card>
      <CardContent class="pt-6 space-y-4">
        <!-- Text Lines -->
        <div class="space-y-2">
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-3/4" />
          <Skeleton class="h-4 w-5/6" />
        </div>

        <!-- Various Widths -->
        <div class="space-y-2 pt-4">
          <Skeleton class="h-4 w-1/4" />
          <Skeleton class="h-4 w-1/2" />
          <Skeleton class="h-4 w-3/4" />
          <Skeleton class="h-4 w-full" />
        </div>

        <!-- Different Heights -->
        <div class="flex gap-4 pt-4">
          <Skeleton class="h-8 w-24" />
          <Skeleton class="h-12 w-24" />
          <Skeleton class="h-16 w-24" />
          <Skeleton class="h-20 w-24" />
        </div>

        <!-- Circles -->
        <div class="flex gap-4 pt-4">
          <Skeleton class="h-8 w-8 rounded-full" />
          <Skeleton class="h-10 w-10 rounded-full" />
          <Skeleton class="h-12 w-12 rounded-full" />
          <Skeleton class="h-16 w-16 rounded-full" />
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Card Skeleton -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Card Loading States</h3>
      <p class="text-muted-foreground text-sm">
        Skeleton placeholders for card components
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Product Card Skeleton -->
      <Card>
        <Skeleton class="h-48 w-full rounded-t-lg" />
        <CardContent class="pt-6 space-y-3">
          <Skeleton class="h-6 w-3/4" />
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-5/6" />
          <div class="flex gap-2 pt-2">
            <Skeleton class="h-10 flex-1" />
            <Skeleton class="h-10 w-20" />
          </div>
        </CardContent>
      </Card>

      <!-- Profile Card Skeleton -->
      <Card>
        <CardContent class="pt-6 space-y-4">
          <div class="flex items-center gap-4">
            <Skeleton class="h-12 w-12 rounded-full" />
            <div class="flex-1 space-y-2">
              <Skeleton class="h-4 w-32" />
              <Skeleton class="h-3 w-24" />
            </div>
          </div>
          <div class="space-y-2">
            <Skeleton class="h-3 w-full" />
            <Skeleton class="h-3 w-full" />
            <Skeleton class="h-3 w-3/4" />
          </div>
          <div class="flex gap-2">
            <Skeleton class="h-6 w-16" />
            <Skeleton class="h-6 w-16" />
            <Skeleton class="h-6 w-16" />
          </div>
        </CardContent>
      </Card>

      <!-- Stats Card Skeleton -->
      <Card>
        <CardContent class="pt-6 space-y-4">
          <Skeleton class="h-4 w-24" />
          <Skeleton class="h-10 w-32" />
          <Skeleton class="h-3 w-40" />
          <div class="grid grid-cols-2 gap-4 pt-4 border-t">
            <div class="space-y-2">
              <Skeleton class="h-3 w-16" />
              <Skeleton class="h-6 w-12" />
            </div>
            <div class="space-y-2">
              <Skeleton class="h-3 w-16" />
              <Skeleton class="h-6 w-12" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- List Skeletons -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">List Loading States</h3>
      <p class="text-muted-foreground text-sm">
        Skeleton placeholders for list items
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Simple List -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          {#each Array(5) as _}
            <div class="flex items-center gap-3">
              <Skeleton class="h-10 w-10 rounded-full" />
              <div class="flex-1 space-y-2">
                <Skeleton class="h-4 w-3/4" />
                <Skeleton class="h-3 w-1/2" />
              </div>
            </div>
          {/each}
        </CardContent>
      </Card>

      <!-- Detailed List -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Messages</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          {#each Array(4) as _}
            <div class="flex gap-3 p-3 rounded border">
              <Skeleton class="h-12 w-12 rounded-full flex-shrink-0" />
              <div class="flex-1 space-y-2">
                <div class="flex justify-between">
                  <Skeleton class="h-4 w-32" />
                  <Skeleton class="h-3 w-16" />
                </div>
                <Skeleton class="h-3 w-full" />
                <Skeleton class="h-3 w-5/6" />
              </div>
            </div>
          {/each}
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Interactive Demo -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Loading Example</h3>
      <p class="text-muted-foreground text-sm">
        Toggle between loading and loaded states
      </p>
    </div>

    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle>User Profile</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onclick={() => showContent = !showContent}
          >
            {showContent ? 'Show Loading' : 'Show Content'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {#if showContent}
          <!-- Actual Content -->
          <div class="space-y-6">
            <div class="flex items-start gap-4">
              <Avatar fallback="JD" size="xl" />
              <div class="flex-1">
                <h3 class="text-lg font-semibold">John Doe</h3>
                <p class="text-sm text-muted-foreground">@johndoe</p>
                <p class="text-sm mt-2">
                  Full-stack developer with 5+ years of experience. Passionate about
                  building scalable web applications and learning new technologies.
                </p>
                <div class="flex gap-2 mt-3">
                  <span class="text-xs px-2 py-1 bg-primary/10 text-primary rounded">TypeScript</span>
                  <span class="text-xs px-2 py-1 bg-primary/10 text-primary rounded">React</span>
                  <span class="text-xs px-2 py-1 bg-primary/10 text-primary rounded">Node.js</span>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-4 pt-4 border-t">
              <div class="text-center">
                <p class="text-2xl font-bold">42</p>
                <p class="text-xs text-muted-foreground">Projects</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold">1.2k</p>
                <p class="text-xs text-muted-foreground">Followers</p>
              </div>
              <div class="text-center">
                <p class="text-2xl font-bold">328</p>
                <p class="text-xs text-muted-foreground">Following</p>
              </div>
            </div>
          </div>
        {:else}
          <!-- Skeleton -->
          <div class="space-y-6">
            <div class="flex items-start gap-4">
              <Skeleton class="h-16 w-16 rounded-full" />
              <div class="flex-1 space-y-3">
                <Skeleton class="h-6 w-40" />
                <Skeleton class="h-4 w-24" />
                <div class="space-y-2 mt-4">
                  <Skeleton class="h-3 w-full" />
                  <Skeleton class="h-3 w-full" />
                  <Skeleton class="h-3 w-3/4" />
                </div>
                <div class="flex gap-2 mt-3">
                  <Skeleton class="h-6 w-20" />
                  <Skeleton class="h-6 w-16" />
                  <Skeleton class="h-6 w-20" />
                </div>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-4 pt-4 border-t">
              <div class="flex flex-col items-center gap-2">
                <Skeleton class="h-8 w-12" />
                <Skeleton class="h-3 w-16" />
              </div>
              <div class="flex flex-col items-center gap-2">
                <Skeleton class="h-8 w-12" />
                <Skeleton class="h-3 w-16" />
              </div>
              <div class="flex flex-col items-center gap-2">
                <Skeleton class="h-8 w-12" />
                <Skeleton class="h-3 w-16" />
              </div>
            </div>
          </div>
        {/if}
      </CardContent>
    </Card>
  </section>

  <!-- Table Skeleton -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Table Loading State</h3>
      <p class="text-muted-foreground text-sm">
        Skeleton for tabular data
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="text-sm">Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-3">
          <!-- Table Header -->
          <div class="grid grid-cols-4 gap-4 pb-2 border-b font-medium text-sm">
            <span>Description</span>
            <span>Date</span>
            <span>Amount</span>
            <span>Status</span>
          </div>

          <!-- Table Rows -->
          {#each Array(6) as _}
            <div class="grid grid-cols-4 gap-4 items-center">
              <Skeleton class="h-4 w-32" />
              <Skeleton class="h-4 w-24" />
              <Skeleton class="h-4 w-20" />
              <Skeleton class="h-6 w-16" />
            </div>
          {/each}
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Grid Skeleton -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Grid Loading State</h3>
      <p class="text-muted-foreground text-sm">
        Skeleton for grid layouts
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="text-sm">Product Gallery</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {#each Array(8) as _}
            <div class="space-y-2">
              <Skeleton class="h-32 w-full rounded" />
              <Skeleton class="h-4 w-3/4" />
              <Skeleton class="h-3 w-1/2" />
            </div>
          {/each}
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Form Skeleton -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Form Loading State</h3>
      <p class="text-muted-foreground text-sm">
        Skeleton for form inputs
      </p>
    </div>

    <Card class="max-w-2xl">
      <CardHeader>
        <Skeleton class="h-7 w-48" />
        <Skeleton class="h-4 w-64 mt-2" />
      </CardHeader>
      <CardContent class="space-y-6">
        {#each Array(4) as _}
          <div class="space-y-2">
            <Skeleton class="h-4 w-24" />
            <Skeleton class="h-10 w-full" />
          </div>
        {/each}

        <div class="flex gap-3 pt-4">
          <Skeleton class="h-10 w-24" />
          <Skeleton class="h-10 w-24" />
        </div>
      </CardContent>
    </Card>
  </section>
</div>
