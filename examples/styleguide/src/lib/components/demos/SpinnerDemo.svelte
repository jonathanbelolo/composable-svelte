<script lang="ts">
  import { Spinner } from '@composable-svelte/core/components/ui/spinner/index.js';
  import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@composable-svelte/core/components/ui/card/index.js';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';
</script>

<div class="space-y-12">
  <!-- Basic Spinners -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Spinners</h3>
      <p class="text-muted-foreground text-sm">
        Loading indicators in different sizes
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-wrap items-end gap-8">
          <div class="flex flex-col items-center gap-2">
            <Spinner size="sm" />
            <span class="text-xs text-muted-foreground">Small</span>
          </div>

          <div class="flex flex-col items-center gap-2">
            <Spinner size="md" />
            <span class="text-xs text-muted-foreground">Medium</span>
          </div>

          <div class="flex flex-col items-center gap-2">
            <Spinner size="lg" />
            <span class="text-xs text-muted-foreground">Large</span>
          </div>

          <div class="flex flex-col items-center gap-2">
            <Spinner size="xl" />
            <span class="text-xs text-muted-foreground">X-Large</span>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- In Buttons -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Loading Buttons</h3>
      <p class="text-muted-foreground text-sm">
        Spinners integrated with button components
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-wrap gap-4">
          <Button disabled>
            <Spinner size="sm" class="mr-2" />
            Loading...
          </Button>

          <Button variant="primary" disabled>
            <Spinner size="sm" class="mr-2" />
            Submitting
          </Button>

          <Button variant="destructive" disabled>
            <Spinner size="sm" class="mr-2" />
            Deleting
          </Button>

          <Button variant="outline" disabled>
            <Spinner size="sm" class="mr-2" />
            Processing
          </Button>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Loading States -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Loading States</h3>
      <p class="text-muted-foreground text-sm">
        Common loading state patterns
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Card Loading -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Content Loading</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex flex-col items-center justify-center py-12 gap-4">
            <Spinner size="lg" />
            <p class="text-sm text-muted-foreground">Loading content...</p>
          </div>
        </CardContent>
      </Card>

      <!-- Inline Loading -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Inline Spinner</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <div class="flex items-center gap-3">
              <Spinner size="sm" />
              <span class="text-sm">Fetching data...</span>
            </div>
            <div class="flex items-center gap-3">
              <Spinner size="sm" />
              <span class="text-sm">Saving changes...</span>
            </div>
            <div class="flex items-center gap-3">
              <Spinner size="sm" />
              <span class="text-sm">Uploading files...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Full Page Loading -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Full Page Loading</h3>
      <p class="text-muted-foreground text-sm">
        Center spinners for full-page loading states
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="relative min-h-[400px] rounded-lg border-2 border-dashed flex items-center justify-center">
          <div class="text-center space-y-4">
            <Spinner size="xl" />
            <div>
              <p class="font-medium">Loading Application</p>
              <p class="text-sm text-muted-foreground mt-1">Please wait while we prepare your dashboard</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- With Text -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">With Status Messages</h3>
      <p class="text-muted-foreground text-sm">
        Combine spinners with descriptive text
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
            <Spinner size="sm" class="mt-0.5" />
            <div>
              <p class="text-sm font-medium">Analyzing document</p>
              <p class="text-xs text-muted-foreground mt-1">This may take a few moments</p>
            </div>
          </div>

          <div class="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
            <Spinner size="sm" class="mt-0.5" />
            <div>
              <p class="text-sm font-medium">Generating report</p>
              <p class="text-xs text-muted-foreground mt-1">Processing 1,234 records</p>
            </div>
          </div>

          <div class="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
            <Spinner size="sm" class="mt-0.5" />
            <div>
              <p class="text-sm font-medium">Syncing data</p>
              <p class="text-xs text-muted-foreground mt-1">Connected to server</p>
            </div>
          </div>

          <div class="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
            <Spinner size="sm" class="mt-0.5" />
            <div>
              <p class="text-sm font-medium">Building project</p>
              <p class="text-xs text-muted-foreground mt-1">Running optimizations</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Empty States with Spinner -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Empty State Loading</h3>
      <p class="text-muted-foreground text-sm">
        Loading indicators for initially empty content
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">User List</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex flex-col items-center justify-center py-16 gap-4">
            <Spinner />
            <div class="text-center">
              <p class="text-sm font-medium">Loading users</p>
              <p class="text-xs text-muted-foreground mt-1">Fetching from database</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex flex-col items-center justify-center py-16 gap-4">
            <Spinner />
            <div class="text-center">
              <p class="text-sm font-medium">Loading activity</p>
              <p class="text-xs text-muted-foreground mt-1">Retrieving recent events</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Modal/Dialog Loading -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Modal Loading</h3>
      <p class="text-muted-foreground text-sm">
        Loading states within modals and dialogs
      </p>
    </div>

    <Card class="max-w-md">
      <CardHeader>
        <CardTitle>Processing Request</CardTitle>
        <CardDescription>Your request is being processed</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-6">
          <div class="flex items-center gap-3 p-4 rounded-lg bg-primary/10">
            <Spinner size="sm" />
            <div class="flex-1">
              <p class="text-sm font-medium">Step 1: Validating data</p>
              <p class="text-xs text-muted-foreground mt-1">Checking inputs...</p>
            </div>
          </div>

          <div class="flex items-center gap-3 p-4 rounded-lg bg-muted/30">
            <div class="w-4 h-4 rounded-full bg-muted" />
            <div class="flex-1">
              <p class="text-sm font-medium text-muted-foreground">Step 2: Processing payment</p>
              <p class="text-xs text-muted-foreground mt-1">Waiting...</p>
            </div>
          </div>

          <div class="flex items-center gap-3 p-4 rounded-lg bg-muted/30">
            <div class="w-4 h-4 rounded-full bg-muted" />
            <div class="flex-1">
              <p class="text-sm font-medium text-muted-foreground">Step 3: Sending confirmation</p>
              <p class="text-xs text-muted-foreground mt-1">Waiting...</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Table Loading -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Table Loading</h3>
      <p class="text-muted-foreground text-sm">
        Loading states for data tables
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="text-sm">Transactions</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          <div class="grid grid-cols-4 gap-4 pb-2 border-b font-medium text-sm">
            <span>Description</span>
            <span>Date</span>
            <span>Amount</span>
            <span>Status</span>
          </div>

          <div class="flex flex-col items-center justify-center py-12 gap-4">
            <Spinner />
            <p class="text-sm text-muted-foreground">Loading transactions...</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>
</div>
