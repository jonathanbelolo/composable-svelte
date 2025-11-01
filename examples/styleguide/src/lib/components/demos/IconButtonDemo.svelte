<script lang="ts">
  import { IconButton } from '@composable-svelte/core/components/ui/icon-button/index.js';
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';

  let loading1 = $state(false);
  let loading2 = $state(false);

  function simulateLoading(setter: (val: boolean) => void) {
    setter(true);
    setTimeout(() => setter(false), 2000);
  }
</script>

<div class="space-y-12">
  <!-- Basic Icon Buttons -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Icon Buttons</h3>
      <p class="text-muted-foreground text-sm">
        Icon-only buttons for compact interfaces
      </p>
    </div>

    <div class="flex flex-wrap gap-4">
      <IconButton aria-label="Close">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6 6 18"></path>
          <path d="m6 6 12 12"></path>
        </svg>
      </IconButton>

      <IconButton aria-label="Search">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.3-4.3"></path>
        </svg>
      </IconButton>

      <IconButton aria-label="Settings">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </IconButton>

      <IconButton aria-label="Bell">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
        </svg>
      </IconButton>

      <IconButton aria-label="Heart">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path>
        </svg>
      </IconButton>
    </div>
  </section>

  <!-- Variants -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Variants</h3>
      <p class="text-muted-foreground text-sm">
        Different visual styles
      </p>
    </div>

    <div class="flex flex-wrap gap-4">
      <div class="space-y-2">
        <p class="text-xs font-medium text-muted-foreground">Default</p>
        <IconButton variant="default" aria-label="Plus">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14"></path>
            <path d="M12 5v14"></path>
          </svg>
        </IconButton>
      </div>

      <div class="space-y-2">
        <p class="text-xs font-medium text-muted-foreground">Secondary</p>
        <IconButton variant="secondary" aria-label="Plus">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14"></path>
            <path d="M12 5v14"></path>
          </svg>
        </IconButton>
      </div>

      <div class="space-y-2">
        <p class="text-xs font-medium text-muted-foreground">Outline</p>
        <IconButton variant="outline" aria-label="Plus">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14"></path>
            <path d="M12 5v14"></path>
          </svg>
        </IconButton>
      </div>

      <div class="space-y-2">
        <p class="text-xs font-medium text-muted-foreground">Ghost</p>
        <IconButton variant="ghost" aria-label="Plus">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14"></path>
            <path d="M12 5v14"></path>
          </svg>
        </IconButton>
      </div>

      <div class="space-y-2">
        <p class="text-xs font-medium text-muted-foreground">Destructive</p>
        <IconButton variant="destructive" aria-label="Trash">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18"></path>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
          </svg>
        </IconButton>
      </div>
    </div>
  </section>

  <!-- Sizes -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Sizes</h3>
      <p class="text-muted-foreground text-sm">
        Small, medium, and large sizes
      </p>
    </div>

    <div class="flex items-center gap-4">
      <IconButton variant="outline" size="sm" aria-label="Small">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="m9 12 2 2 4-4"></path>
        </svg>
      </IconButton>

      <IconButton variant="outline" size="md" aria-label="Medium">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="m9 12 2 2 4-4"></path>
        </svg>
      </IconButton>

      <IconButton variant="outline" size="lg" aria-label="Large">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="m9 12 2 2 4-4"></path>
        </svg>
      </IconButton>
    </div>
  </section>

  <!-- Loading State -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Loading State</h3>
      <p class="text-muted-foreground text-sm">
        Show loading spinner during async operations
      </p>
    </div>

    <div class="flex gap-4">
      <IconButton
        variant="default"
        loading={loading1}
        onclick={() => simulateLoading(v => loading1 = v)}
        aria-label="Save"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="17 21 17 13 7 13 7 21"></polyline>
          <polyline points="7 3 7 8 15 8"></polyline>
        </svg>
      </IconButton>

      <IconButton
        variant="outline"
        loading={loading2}
        onclick={() => simulateLoading(v => loading2 = v)}
        aria-label="Refresh"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
          <path d="M21 3v5h-5"></path>
        </svg>
      </IconButton>
    </div>
  </section>

  <!-- Disabled State -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Disabled State</h3>
      <p class="text-muted-foreground text-sm">
        Disabled buttons are not interactive
      </p>
    </div>

    <div class="flex gap-4">
      <IconButton variant="default" disabled aria-label="Disabled">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14"></path>
          <path d="M12 5v14"></path>
        </svg>
      </IconButton>

      <IconButton variant="outline" disabled aria-label="Disabled">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14"></path>
          <path d="M12 5v14"></path>
        </svg>
      </IconButton>

      <IconButton variant="ghost" disabled aria-label="Disabled">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14"></path>
          <path d="M12 5v14"></path>
        </svg>
      </IconButton>
    </div>
  </section>

  <!-- Common Use Cases -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Common Use Cases</h3>
      <p class="text-muted-foreground text-sm">
        Icon buttons in real-world scenarios
      </p>
    </div>

    <div class="space-y-6">
      <!-- Header toolbar -->
      <div class="border rounded-lg p-4">
        <div class="flex items-center justify-between mb-4">
          <h4 class="font-semibold">Header Toolbar</h4>
          <div class="flex gap-2">
            <IconButton variant="ghost" size="sm" aria-label="Search">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.3-4.3"></path>
              </svg>
            </IconButton>
            <IconButton variant="ghost" size="sm" aria-label="Notifications">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path>
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path>
              </svg>
            </IconButton>
            <IconButton variant="ghost" size="sm" aria-label="Settings">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </IconButton>
          </div>
        </div>
        <p class="text-sm text-muted-foreground">Application header with icon-only actions</p>
      </div>

      <!-- Card actions -->
      <div class="border rounded-lg p-4">
        <div class="flex items-start justify-between mb-2">
          <div class="flex-1">
            <h4 class="font-semibold">Card with Actions</h4>
            <p class="text-sm text-muted-foreground mt-1">Icon buttons for card-level actions</p>
          </div>
          <div class="flex gap-1">
            <IconButton variant="ghost" size="sm" aria-label="Edit">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </IconButton>
            <IconButton variant="ghost" size="sm" aria-label="More options">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="12" cy="5" r="1"></circle>
                <circle cx="12" cy="19" r="1"></circle>
              </svg>
            </IconButton>
          </div>
        </div>
      </div>

      <!-- Floating action button -->
      <div class="border rounded-lg p-4 bg-muted/50 relative h-64 flex items-center justify-center">
        <div class="text-center text-sm text-muted-foreground">
          Content area
        </div>
        <div class="absolute bottom-4 right-4">
          <IconButton variant="default" size="lg" aria-label="Add new item">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14"></path>
              <path d="M12 5v14"></path>
            </svg>
          </IconButton>
        </div>
        <p class="absolute bottom-2 left-4 text-xs text-muted-foreground">Floating Action Button</p>
      </div>
    </div>
  </section>
</div>
