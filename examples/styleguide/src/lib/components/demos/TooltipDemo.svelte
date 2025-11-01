<script lang="ts">
  import { Tooltip } from '@composable-svelte/core/components/ui/tooltip/index.js';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';
  import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@composable-svelte/core/components/ui/card/index.js';
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';
  import { IconButton } from '@composable-svelte/core/components/ui/icon-button/index.js';
</script>

<div class="space-y-12">
  <!-- Basic Usage -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Tooltips</h3>
      <p class="text-muted-foreground text-sm">
        Hover over elements to see tooltips
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-wrap gap-4">
          <Tooltip content="This is a tooltip">
            <Button>Hover me</Button>
          </Tooltip>

          <Tooltip content="Click to save your changes">
            <Button variant="primary">Save</Button>
          </Tooltip>

          <Tooltip content="This action cannot be undone">
            <Button variant="destructive">Delete</Button>
          </Tooltip>

          <Tooltip content="View more options">
            <Button variant="outline">Options</Button>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Positions -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Tooltip Positions</h3>
      <p class="text-muted-foreground text-sm">
        Tooltips can appear on all four sides
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-col items-center gap-8 py-8">
          <!-- Top -->
          <Tooltip content="Tooltip on top" position="top">
            <Button variant="outline">Top</Button>
          </Tooltip>

          <!-- Middle row -->
          <div class="flex items-center gap-16">
            <Tooltip content="Tooltip on left" position="left">
              <Button variant="outline">Left</Button>
            </Tooltip>

            <div class="px-8 py-4 border-2 border-dashed rounded">
              Hover around
            </div>

            <Tooltip content="Tooltip on right" position="right">
              <Button variant="outline">Right</Button>
            </Tooltip>
          </div>

          <!-- Bottom -->
          <Tooltip content="Tooltip on bottom" position="bottom">
            <Button variant="outline">Bottom</Button>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- With Icons -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Icon Tooltips</h3>
      <p class="text-muted-foreground text-sm">
        Tooltips are perfect for icon buttons
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-wrap gap-3">
          <Tooltip content="Settings">
            <button class="p-2 rounded hover:bg-accent transition-colors">
              ⚙️
            </button>
          </Tooltip>

          <Tooltip content="Notifications">
            <button class="p-2 rounded hover:bg-accent transition-colors relative">
              🔔
              <span class="absolute top-1 right-1 h-2 w-2 bg-destructive rounded-full"></span>
            </button>
          </Tooltip>

          <Tooltip content="Search">
            <button class="p-2 rounded hover:bg-accent transition-colors">
              🔍
            </button>
          </Tooltip>

          <Tooltip content="User Profile">
            <button class="p-2 rounded hover:bg-accent transition-colors">
              👤
            </button>
          </Tooltip>

          <Tooltip content="Help & Documentation">
            <button class="p-2 rounded hover:bg-accent transition-colors">
              ❓
            </button>
          </Tooltip>

          <Tooltip content="Dark Mode">
            <button class="p-2 rounded hover:bg-accent transition-colors">
              🌙
            </button>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Disabled State -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Disabled Tooltips</h3>
      <p class="text-muted-foreground text-sm">
        Tooltips can be disabled when needed
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-wrap gap-4">
          <Tooltip content="This tooltip is enabled">
            <Button>Enabled Tooltip</Button>
          </Tooltip>

          <Tooltip content="You won't see this" disabled>
            <Button variant="secondary">Disabled Tooltip</Button>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Custom Delay -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Custom Delays</h3>
      <p class="text-muted-foreground text-sm">
        Control how quickly tooltips appear
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-wrap gap-4">
          <Tooltip content="No delay" delay={0}>
            <Button variant="outline">Instant (0ms)</Button>
          </Tooltip>

          <Tooltip content="Fast tooltip" delay={100}>
            <Button variant="outline">Fast (100ms)</Button>
          </Tooltip>

          <Tooltip content="Default delay">
            <Button variant="outline">Default (300ms)</Button>
          </Tooltip>

          <Tooltip content="Slow tooltip" delay={800}>
            <Button variant="outline">Slow (800ms)</Button>
          </Tooltip>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Practical Examples -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Practical Examples</h3>
      <p class="text-muted-foreground text-sm">
        Common tooltip use cases
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Toolbar -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Text Editor Toolbar</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex flex-wrap gap-1 p-2 bg-muted/30 rounded">
            <Tooltip content="Bold (Ctrl+B)">
              <button class="p-2 rounded hover:bg-accent font-bold text-sm">B</button>
            </Tooltip>
            <Tooltip content="Italic (Ctrl+I)">
              <button class="p-2 rounded hover:bg-accent italic text-sm">I</button>
            </Tooltip>
            <Tooltip content="Underline (Ctrl+U)">
              <button class="p-2 rounded hover:bg-accent underline text-sm">U</button>
            </Tooltip>
            <div class="w-px bg-border mx-1"></div>
            <Tooltip content="Align Left">
              <button class="p-2 rounded hover:bg-accent">⬅</button>
            </Tooltip>
            <Tooltip content="Align Center">
              <button class="p-2 rounded hover:bg-accent">↔</button>
            </Tooltip>
            <Tooltip content="Align Right">
              <button class="p-2 rounded hover:bg-accent">➡</button>
            </Tooltip>
            <div class="w-px bg-border mx-1"></div>
            <Tooltip content="Insert Link">
              <button class="p-2 rounded hover:bg-accent">🔗</button>
            </Tooltip>
            <Tooltip content="Insert Image">
              <button class="p-2 rounded hover:bg-accent">🖼</button>
            </Tooltip>
          </div>
        </CardContent>
      </Card>

      <!-- Status Indicators -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Status Indicators</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm">Server Status</span>
            <Tooltip content="All systems operational">
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 bg-green-500 rounded-full"></span>
                <Badge variant="success" class="text-[10px]">Online</Badge>
              </div>
            </Tooltip>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-sm">Database</span>
            <Tooltip content="Response time: 45ms">
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 bg-green-500 rounded-full"></span>
                <Badge variant="success" class="text-[10px]">Healthy</Badge>
              </div>
            </Tooltip>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-sm">API Service</span>
            <Tooltip content="Elevated response times detected">
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 bg-yellow-500 rounded-full"></span>
                <Badge variant="warning" class="text-[10px]">Degraded</Badge>
              </div>
            </Tooltip>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-sm">Cache</span>
            <Tooltip content="Service unavailable - investigating">
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 bg-red-500 rounded-full"></span>
                <Badge variant="destructive" class="text-[10px]">Down</Badge>
              </div>
            </Tooltip>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Help Text -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Help Text & Hints</h3>
      <p class="text-muted-foreground text-sm">
        Provide additional context without cluttering the UI
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Account Settings</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <label class="text-sm font-medium">Email Address</label>
            <Tooltip content="We'll never share your email with anyone">
              <span class="text-muted-foreground cursor-help">ℹ️</span>
            </Tooltip>
          </div>
          <input
            type="email"
            placeholder="you@example.com"
            class="w-full px-3 py-2 text-sm rounded border"
          />
        </div>

        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <label class="text-sm font-medium">Display Name</label>
            <Tooltip content="This will be visible to other users">
              <span class="text-muted-foreground cursor-help">ℹ️</span>
            </Tooltip>
          </div>
          <input
            type="text"
            placeholder="John Doe"
            class="w-full px-3 py-2 text-sm rounded border"
          />
        </div>

        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <label class="text-sm font-medium">API Key</label>
            <Tooltip content="Keep this secret! Used for API authentication">
              <span class="text-muted-foreground cursor-help">⚠️</span>
            </Tooltip>
          </div>
          <input
            type="password"
            value="sk_live_..."
            class="w-full px-3 py-2 text-sm rounded border font-mono"
          />
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Interactive Elements -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Complex Interactions</h3>
      <p class="text-muted-foreground text-sm">
        Tooltips on various interactive elements
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Dashboard Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          <!-- Action Buttons -->
          <div class="flex flex-wrap gap-2">
            <Tooltip content="Download report as PDF">
              <Button size="sm" variant="outline">
                📥 Export
              </Button>
            </Tooltip>

            <Tooltip content="Share with team members">
              <Button size="sm" variant="outline">
                🔗 Share
              </Button>
            </Tooltip>

            <Tooltip content="Refresh data from server">
              <Button size="sm" variant="outline">
                🔄 Refresh
              </Button>
            </Tooltip>

            <Tooltip content="Configure dashboard layout">
              <Button size="sm" variant="outline">
                ⚙️ Settings
              </Button>
            </Tooltip>
          </div>

          <!-- Quick Stats with Tooltips -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t">
            <Tooltip content="Total revenue this month">
              <div class="p-3 rounded border cursor-help hover:border-primary/50 transition-colors">
                <p class="text-xs text-muted-foreground">Revenue</p>
                <p class="text-lg font-bold">$12,450</p>
              </div>
            </Tooltip>

            <Tooltip content="New customers acquired">
              <div class="p-3 rounded border cursor-help hover:border-primary/50 transition-colors">
                <p class="text-xs text-muted-foreground">Customers</p>
                <p class="text-lg font-bold">142</p>
              </div>
            </Tooltip>

            <Tooltip content="Conversion rate (last 30 days)">
              <div class="p-3 rounded border cursor-help hover:border-primary/50 transition-colors">
                <p class="text-xs text-muted-foreground">Conversion</p>
                <p class="text-lg font-bold">3.2%</p>
              </div>
            </Tooltip>

            <Tooltip content="Average order value">
              <div class="p-3 rounded border cursor-help hover:border-primary/50 transition-colors">
                <p class="text-xs text-muted-foreground">Avg Order</p>
                <p class="text-lg font-bold">$87.50</p>
              </div>
            </Tooltip>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>
</div>
