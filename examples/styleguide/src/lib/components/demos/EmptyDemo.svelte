<script lang="ts">
  import { Empty } from '@composable-svelte/core/components/ui/empty/index.js';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';
  import { Card, CardContent } from '@composable-svelte/core/components/ui/card/index.js';
</script>

<div class="space-y-12">
  <!-- Basic Empty State -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Empty State</h3>
      <p class="text-muted-foreground text-sm">
        Simple empty state with title and description
      </p>
    </div>

    <Card>
      <CardContent class="p-0">
        <Empty
          title="No items found"
          description="Get started by creating your first item."
        />
      </CardContent>
    </Card>
  </section>

  <!-- With Action Button -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">With Action Button</h3>
      <p class="text-muted-foreground text-sm">
        Provide a clear call-to-action
      </p>
    </div>

    <Card>
      <CardContent class="p-0">
        <Empty
          title="No data yet"
          description="Start by uploading your first dataset to get insights."
        >
          <Button>Upload Data</Button>
        </Empty>
      </CardContent>
    </Card>
  </section>

  <!-- Search Results Empty -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Search Results Empty</h3>
      <p class="text-muted-foreground text-sm">
        When search returns no results
      </p>
    </div>

    <Card>
      <CardContent class="p-0">
        <Empty
          title="No results found"
          description="Try adjusting your search or filter to find what you're looking for."
        >
          {#snippet icon()}
            <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" stroke-width="2"></circle>
              <path d="m21 21-4.3-4.3" stroke-width="2" stroke-linecap="round"></path>
              <path d="M11 8v6" stroke-width="2" stroke-linecap="round"></path>
              <path d="M8 11h6" stroke-width="2" stroke-linecap="round"></path>
            </svg>
          {/snippet}
          <div class="flex gap-2">
            <Button variant="outline" size="sm">Clear Filters</Button>
            <Button size="sm">New Search</Button>
          </div>
        </Empty>
      </CardContent>
    </Card>
  </section>

  <!-- Inbox Empty -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Inbox Empty</h3>
      <p class="text-muted-foreground text-sm">
        All caught up message
      </p>
    </div>

    <Card>
      <CardContent class="p-0">
        <Empty
          title="Inbox Zero!"
          description="You're all caught up. No new messages at this time."
        >
          {#snippet icon()}
            <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z" stroke-width="2"></path>
              <polyline points="8.5 9 12 4 15.5 9" stroke-width="2"></polyline>
              <path d="m9 12 2 2 4-4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
          {/snippet}
        </Empty>
      </CardContent>
    </Card>
  </section>

  <!-- Projects Empty -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Projects Empty</h3>
      <p class="text-muted-foreground text-sm">
        Onboarding for new users
      </p>
    </div>

    <Card>
      <CardContent class="p-0">
        <Empty
          title="No projects yet"
          description="Create your first project to start organizing your work and collaborating with your team."
        >
          {#snippet icon()}
            <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" stroke-width="2"></path>
              <path d="M12 11v6" stroke-width="2" stroke-linecap="round"></path>
              <path d="M9 14h6" stroke-width="2" stroke-linecap="round"></path>
            </svg>
          {/snippet}
          <div class="space-y-2">
            <Button>Create Project</Button>
            <div class="text-xs text-muted-foreground">
              or <button class="text-primary hover:underline">import existing project</button>
            </div>
          </div>
        </Empty>
      </CardContent>
    </Card>
  </section>

  <!-- Error State -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Error State</h3>
      <p class="text-muted-foreground text-sm">
        When something goes wrong
      </p>
    </div>

    <Card>
      <CardContent class="p-0">
        <Empty
          title="Failed to load data"
          description="We couldn't retrieve your data. Please check your connection and try again."
        >
          {#snippet icon()}
            <svg class="w-12 h-12 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" stroke-width="2"></circle>
              <path d="M12 8v4" stroke-width="2" stroke-linecap="round"></path>
              <path d="M12 16h.01" stroke-width="2" stroke-linecap="round"></path>
            </svg>
          {/snippet}
          <Button variant="outline">Try Again</Button>
        </Empty>
      </CardContent>
    </Card>
  </section>

  <!-- Notifications Empty -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Notifications Empty</h3>
      <p class="text-muted-foreground text-sm">
        No notifications to display
      </p>
    </div>

    <Card>
      <CardContent class="p-0">
        <Empty
          title="No notifications"
          description="You're up to date! We'll notify you when something needs your attention."
        >
          {#snippet icon()}
            <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" stroke-width="2"></path>
              <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" stroke-width="2"></path>
            </svg>
          {/snippet}
        </Empty>
      </CardContent>
    </Card>
  </section>

  <!-- Multiple Empty States -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Gallery View</h3>
      <p class="text-muted-foreground text-sm">
        Empty states in different contexts
      </p>
    </div>

    <div class="grid md:grid-cols-2 gap-4">
      <Card>
        <CardContent class="p-0">
          <Empty
            title="No images"
            description="Upload images to your gallery"
          >
            {#snippet icon()}
              <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-width="2"></rect>
                <circle cx="9" cy="9" r="2" stroke-width="2"></circle>
                <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" stroke-width="2"></path>
              </svg>
            {/snippet}
            <Button size="sm">Add Images</Button>
          </Empty>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="p-0">
          <Empty
            title="No videos"
            description="Add videos to start watching"
          >
            {#snippet icon()}
              <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="m22 8-6 4 6 4V8Z" stroke-width="2" stroke-linejoin="round"></path>
                <rect x="2" y="6" width="14" height="12" rx="2" stroke-width="2"></rect>
              </svg>
            {/snippet}
            <Button size="sm">Upload Video</Button>
          </Empty>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="p-0">
          <Empty
            title="No documents"
            description="Share documents with your team"
          >
            {#snippet icon()}
              <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke-width="2"></path>
                <polyline points="14 2 14 8 20 8" stroke-width="2"></polyline>
              </svg>
            {/snippet}
            <Button size="sm">Add Document</Button>
          </Empty>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="p-0">
          <Empty
            title="No contacts"
            description="Build your network"
          >
            {#snippet icon()}
              <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke-width="2"></path>
                <circle cx="9" cy="7" r="4" stroke-width="2"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" stroke-width="2"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke-width="2"></path>
              </svg>
            {/snippet}
            <Button size="sm">Add Contact</Button>
          </Empty>
        </CardContent>
      </Card>
    </div>
  </section>
</div>
