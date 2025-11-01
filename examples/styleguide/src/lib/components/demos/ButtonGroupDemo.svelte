<script lang="ts">
  import { ButtonGroup } from '@composable-svelte/core/components/ui/button-group/index.js';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';

  let selectedView = $state('grid');
  let selectedAlign = $state('left');
  let selectedFormat = $state('bold');
</script>

<div class="space-y-12">
  <!-- Basic Button Group -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Button Group</h3>
      <p class="text-muted-foreground text-sm">
        Group related buttons together with connected styling
      </p>
    </div>

    <div class="flex flex-wrap gap-6">
      <ButtonGroup>
        <Button variant="outline">Left</Button>
        <Button variant="outline">Middle</Button>
        <Button variant="outline">Right</Button>
      </ButtonGroup>

      <ButtonGroup>
        <Button variant="outline">One</Button>
        <Button variant="outline">Two</Button>
        <Button variant="outline">Three</Button>
        <Button variant="outline">Four</Button>
      </ButtonGroup>
    </div>
  </section>

  <!-- View Switcher -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">View Switcher</h3>
      <p class="text-muted-foreground text-sm">
        Toggle between different view modes
      </p>
    </div>

    <div class="space-y-4">
      <ButtonGroup>
        <Button
          variant={selectedView === 'list' ? 'default' : 'outline'}
          onclick={() => selectedView = 'list'}
        >
          List
        </Button>
        <Button
          variant={selectedView === 'grid' ? 'default' : 'outline'}
          onclick={() => selectedView = 'grid'}
        >
          Grid
        </Button>
        <Button
          variant={selectedView === 'table' ? 'default' : 'outline'}
          onclick={() => selectedView = 'table'}
        >
          Table
        </Button>
      </ButtonGroup>

      <p class="text-sm text-muted-foreground">
        Selected view: <span class="font-medium text-foreground">{selectedView}</span>
      </p>
    </div>
  </section>

  <!-- Text Alignment -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Text Alignment Toolbar</h3>
      <p class="text-muted-foreground text-sm">
        Common toolbar pattern for text editors
      </p>
    </div>

    <div class="space-y-4">
      <ButtonGroup>
        <Button
          variant={selectedAlign === 'left' ? 'default' : 'outline'}
          size="sm"
          onclick={() => selectedAlign = 'left'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="15" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </Button>
        <Button
          variant={selectedAlign === 'center' ? 'default' : 'outline'}
          size="sm"
          onclick={() => selectedAlign = 'center'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="6" y1="12" x2="18" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </Button>
        <Button
          variant={selectedAlign === 'right' ? 'default' : 'outline'}
          size="sm"
          onclick={() => selectedAlign = 'right'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="9" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </Button>
      </ButtonGroup>

      <p class="text-sm text-muted-foreground">
        Alignment: <span class="font-medium text-foreground">{selectedAlign}</span>
      </p>
    </div>
  </section>

  <!-- Vertical Orientation -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Vertical Button Group</h3>
      <p class="text-muted-foreground text-sm">
        Stack buttons vertically
      </p>
    </div>

    <div class="flex flex-wrap gap-8">
      <ButtonGroup orientation="vertical">
        <Button variant="outline">Top</Button>
        <Button variant="outline">Middle</Button>
        <Button variant="outline">Bottom</Button>
      </ButtonGroup>

      <ButtonGroup orientation="vertical">
        <Button variant="outline">Profile</Button>
        <Button variant="outline">Settings</Button>
        <Button variant="outline">Billing</Button>
        <Button variant="outline">Logout</Button>
      </ButtonGroup>
    </div>
  </section>

  <!-- Different Variants -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Different Variants</h3>
      <p class="text-muted-foreground text-sm">
        Button groups work with any button variant
      </p>
    </div>

    <div class="space-y-4">
      <!-- Default variant -->
      <div class="space-y-2">
        <p class="text-sm font-medium">Default Variant</p>
        <ButtonGroup>
          <Button>One</Button>
          <Button>Two</Button>
          <Button>Three</Button>
        </ButtonGroup>
      </div>

      <!-- Secondary variant -->
      <div class="space-y-2">
        <p class="text-sm font-medium">Secondary Variant</p>
        <ButtonGroup>
          <Button variant="secondary">One</Button>
          <Button variant="secondary">Two</Button>
          <Button variant="secondary">Three</Button>
        </ButtonGroup>
      </div>

      <!-- Ghost variant -->
      <div class="space-y-2">
        <p class="text-sm font-medium">Ghost Variant</p>
        <ButtonGroup>
          <Button variant="ghost">One</Button>
          <Button variant="ghost">Two</Button>
          <Button variant="ghost">Three</Button>
        </ButtonGroup>
      </div>
    </div>
  </section>

  <!-- Different Sizes -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Different Sizes</h3>
      <p class="text-muted-foreground text-sm">
        Button groups adapt to button sizes
      </p>
    </div>

    <div class="space-y-4">
      <!-- Small -->
      <div class="space-y-2">
        <p class="text-sm font-medium">Small</p>
        <ButtonGroup>
          <Button variant="outline" size="sm">Left</Button>
          <Button variant="outline" size="sm">Middle</Button>
          <Button variant="outline" size="sm">Right</Button>
        </ButtonGroup>
      </div>

      <!-- Default -->
      <div class="space-y-2">
        <p class="text-sm font-medium">Default</p>
        <ButtonGroup>
          <Button variant="outline">Left</Button>
          <Button variant="outline">Middle</Button>
          <Button variant="outline">Right</Button>
        </ButtonGroup>
      </div>

      <!-- Large -->
      <div class="space-y-2">
        <p class="text-sm font-medium">Large</p>
        <ButtonGroup>
          <Button variant="outline" size="lg">Left</Button>
          <Button variant="outline" size="lg">Middle</Button>
          <Button variant="outline" size="lg">Right</Button>
        </ButtonGroup>
      </div>
    </div>
  </section>

  <!-- With Icons -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">With Icons</h3>
      <p class="text-muted-foreground text-sm">
        Icon-only or icon + text combinations
      </p>
    </div>

    <div class="space-y-4">
      <!-- Icon only -->
      <div class="space-y-2">
        <p class="text-sm font-medium">Icon Only</p>
        <ButtonGroup>
          <Button variant="outline" size="sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </Button>
          <Button variant="outline" size="sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"></path>
              <polyline points="8.5 9 12 4 15.5 9"></polyline>
            </svg>
          </Button>
          <Button variant="outline" size="sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.3-4.3"></path>
            </svg>
          </Button>
        </ButtonGroup>
      </div>

      <!-- Icon + Text -->
      <div class="space-y-2">
        <p class="text-sm font-medium">Icon + Text</p>
        <ButtonGroup>
          <Button variant="outline">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2">
              <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Z"></path>
              <polyline points="8.5 9 12 4 15.5 9"></polyline>
            </svg>
            Inbox
          </Button>
          <Button variant="outline">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2">
              <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"></path>
            </svg>
            Alerts
          </Button>
          <Button variant="outline">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
            </svg>
            Activity
          </Button>
        </ButtonGroup>
      </div>
    </div>
  </section>

  <!-- Pagination Style -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Pagination Style</h3>
      <p class="text-muted-foreground text-sm">
        Alternative pagination controls
      </p>
    </div>

    <ButtonGroup>
      <Button variant="outline">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        Previous
      </Button>
      <Button variant="outline">1</Button>
      <Button>2</Button>
      <Button variant="outline">3</Button>
      <Button variant="outline">4</Button>
      <Button variant="outline">5</Button>
      <Button variant="outline">
        Next
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ml-2">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </Button>
    </ButtonGroup>
  </section>

  <!-- With Badges -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">With Badges</h3>
      <p class="text-muted-foreground text-sm">
        Combine with badges for notification counts
      </p>
    </div>

    <ButtonGroup>
      <Button variant="outline">
        <div class="flex items-center gap-2">
          <span>Inbox</span>
          <Badge variant="default">12</Badge>
        </div>
      </Button>
      <Button variant="outline">
        <div class="flex items-center gap-2">
          <span>Drafts</span>
          <Badge variant="secondary">3</Badge>
        </div>
      </Button>
      <Button variant="outline">
        <div class="flex items-center gap-2">
          <span>Sent</span>
        </div>
      </Button>
    </ButtonGroup>
  </section>

  <!-- Disabled State -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Disabled Buttons</h3>
      <p class="text-muted-foreground text-sm">
        Individual buttons can be disabled within a group
      </p>
    </div>

    <ButtonGroup>
      <Button variant="outline">Active</Button>
      <Button variant="outline" disabled>Disabled</Button>
      <Button variant="outline">Active</Button>
    </ButtonGroup>
  </section>
</div>
