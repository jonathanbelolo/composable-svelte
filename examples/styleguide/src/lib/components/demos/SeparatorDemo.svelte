<script lang="ts">
  import { Separator } from '@composable-svelte/core/components/ui/separator/index.js';
  import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@composable-svelte/core/components/ui/card/index.js';
</script>

<div class="space-y-12">
  <!-- Basic Demo -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Separator</h3>
      <p class="text-muted-foreground text-sm">
        Visual divider to separate content sections
      </p>
    </div>

    <Card>
      <CardContent class="pt-6 space-y-4">
        <div>
          <h4 class="text-sm font-medium">Section One</h4>
          <p class="text-sm text-muted-foreground">This is the first section content.</p>
        </div>

        <Separator />

        <div>
          <h4 class="text-sm font-medium">Section Two</h4>
          <p class="text-sm text-muted-foreground">This is the second section content.</p>
        </div>

        <Separator />

        <div>
          <h4 class="text-sm font-medium">Section Three</h4>
          <p class="text-sm text-muted-foreground">This is the third section content.</p>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Vertical Separator -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Vertical Separator</h3>
      <p class="text-muted-foreground text-sm">
        Separators can be oriented vertically
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="flex h-24 items-center gap-4">
          <div class="flex-1 text-center">
            <p class="text-2xl font-bold">42</p>
            <p class="text-xs text-muted-foreground">Projects</p>
          </div>

          <Separator orientation="vertical" />

          <div class="flex-1 text-center">
            <p class="text-2xl font-bold">156</p>
            <p class="text-xs text-muted-foreground">Tasks</p>
          </div>

          <Separator orientation="vertical" />

          <div class="flex-1 text-center">
            <p class="text-2xl font-bold">89%</p>
            <p class="text-xs text-muted-foreground">Complete</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- In Lists -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">In Menu Lists</h3>
      <p class="text-muted-foreground text-sm">
        Common usage in navigation and menu components
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Navigation Menu -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Navigation Menu</CardTitle>
        </CardHeader>
        <CardContent class="space-y-1">
          <button class="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent">
            Dashboard
          </button>
          <button class="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent">
            Projects
          </button>
          <button class="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent">
            Tasks
          </button>

          <Separator class="my-2" />

          <button class="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent">
            Settings
          </button>
          <button class="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent text-destructive">
            Logout
          </button>
        </CardContent>
      </Card>

      <!-- Settings Menu -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Settings</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            <p class="text-sm font-medium">Profile Settings</p>
            <p class="text-xs text-muted-foreground">Manage your account</p>
          </div>

          <Separator />

          <div>
            <p class="text-sm font-medium">Notifications</p>
            <p class="text-xs text-muted-foreground">Configure alerts</p>
          </div>

          <Separator />

          <div>
            <p class="text-sm font-medium">Privacy</p>
            <p class="text-xs text-muted-foreground">Control your data</p>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- With Text Labels -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">With Text Labels</h3>
      <p class="text-muted-foreground text-sm">
        Separators with centered text labels
      </p>
    </div>

    <Card>
      <CardContent class="pt-6 space-y-6">
        <div>
          <p class="text-sm">Content before separator</p>
        </div>

        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <Separator />
          </div>
          <div class="relative flex justify-center text-xs uppercase">
            <span class="bg-card px-2 text-muted-foreground">Or continue with</span>
          </div>
        </div>

        <div>
          <p class="text-sm">Content after separator</p>
        </div>

        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <Separator />
          </div>
          <div class="relative flex justify-center text-xs uppercase">
            <span class="bg-card px-2 text-muted-foreground">2024</span>
          </div>
        </div>

        <div>
          <p class="text-sm">More content</p>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Different Styles -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Usage Examples</h3>
      <p class="text-muted-foreground text-sm">
        Different contexts where separators are useful
      </p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Form Section Dividers -->
      <Card>
        <CardHeader>
          <CardTitle>User Profile</CardTitle>
          <CardDescription>Update your profile information</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-2">
            <label class="text-sm font-medium">Personal Information</label>
            <input
              type="text"
              placeholder="Full Name"
              class="w-full px-3 py-2 text-sm rounded border"
            />
            <input
              type="email"
              placeholder="Email"
              class="w-full px-3 py-2 text-sm rounded border"
            />
          </div>

          <Separator />

          <div class="space-y-2">
            <label class="text-sm font-medium">Contact Details</label>
            <input
              type="tel"
              placeholder="Phone"
              class="w-full px-3 py-2 text-sm rounded border"
            />
            <input
              type="text"
              placeholder="Address"
              class="w-full px-3 py-2 text-sm rounded border"
            />
          </div>
        </CardContent>
      </Card>

      <!-- Content Sections -->
      <Card>
        <CardHeader>
          <CardTitle>Article</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div>
            <h4 class="font-medium mb-2">Introduction</h4>
            <p class="text-sm text-muted-foreground">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </p>
          </div>

          <Separator />

          <div>
            <h4 class="font-medium mb-2">Main Content</h4>
            <p class="text-sm text-muted-foreground">
              Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
            </p>
          </div>

          <Separator />

          <div>
            <h4 class="font-medium mb-2">Conclusion</h4>
            <p class="text-sm text-muted-foreground">
              Ut enim ad minim veniam, quis nostrud exercitation.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>
</div>
