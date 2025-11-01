<script lang="ts">
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';
  import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@composable-svelte/core/components/ui/card/index.js';
</script>

<div class="space-y-12">
  <!-- Variants -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Badge Variants</h3>
      <p class="text-muted-foreground text-sm">
        Different badge styles for various contexts
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-wrap gap-3">
          <Badge variant="default">Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Use Cases -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Common Use Cases</h3>
      <p class="text-muted-foreground text-sm">
        Practical examples of badge usage
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Status Indicators -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Task Status</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm">Setup Database</span>
            <Badge variant="success">Completed</Badge>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm">Write Tests</span>
            <Badge variant="warning">In Progress</Badge>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm">Deploy to Production</span>
            <Badge variant="outline">Pending</Badge>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm">Fix Critical Bug</span>
            <Badge variant="destructive">Urgent</Badge>
          </div>
        </CardContent>
      </Card>

      <!-- Notification Counts -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Notifications</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm">Messages</span>
            <Badge variant="default">12</Badge>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm">Comments</span>
            <Badge variant="default">3</Badge>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm">Mentions</span>
            <Badge variant="destructive">5</Badge>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm">Updates</span>
            <Badge variant="secondary">24</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- With Icons -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Badges with Icons</h3>
      <p class="text-muted-foreground text-sm">
        Combine badges with icons for enhanced meaning
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-wrap gap-3">
          <Badge variant="success">
            <span class="mr-1">✓</span> Verified
          </Badge>
          <Badge variant="warning">
            <span class="mr-1">⚠</span> Warning
          </Badge>
          <Badge variant="destructive">
            <span class="mr-1">✗</span> Error
          </Badge>
          <Badge variant="default">
            <span class="mr-1">ℹ</span> Info
          </Badge>
          <Badge variant="secondary">
            <span class="mr-1">★</span> Featured
          </Badge>
          <Badge variant="outline">
            <span class="mr-1">◷</span> Pending
          </Badge>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- In Context -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Badges in Context</h3>
      <p class="text-muted-foreground text-sm">
        Examples of badges used in real-world scenarios
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Product Card -->
      <Card>
        <div class="relative">
          <div class="h-32 bg-gradient-to-br from-blue-500 to-purple-500 rounded-t-lg"></div>
          <div class="absolute top-2 right-2">
            <Badge variant="success">New</Badge>
          </div>
        </div>
        <CardHeader>
          <CardTitle class="text-sm">Premium Plan</CardTitle>
          <CardDescription>Best value for teams</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex items-center gap-2">
            <Badge variant="outline">Popular</Badge>
            <Badge variant="warning">50% Off</Badge>
          </div>
        </CardContent>
      </Card>

      <!-- User Profile -->
      <Card>
        <CardHeader>
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-blue-500"></div>
              <div>
                <p class="text-sm font-medium">Alice Johnson</p>
                <p class="text-xs text-muted-foreground">@alice</p>
              </div>
            </div>
            <Badge variant="success">
              <span class="mr-1">✓</span> Pro
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div class="flex flex-wrap gap-2">
            <Badge variant="secondary">Developer</Badge>
            <Badge variant="outline">React</Badge>
            <Badge variant="outline">TypeScript</Badge>
          </div>
        </CardContent>
      </Card>

      <!-- Issue Tracker -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <CardTitle class="text-sm">Bug Report #423</CardTitle>
            <Badge variant="destructive">High</Badge>
          </div>
          <CardDescription>Login page not responding</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex flex-wrap gap-2">
            <Badge variant="secondary">Bug</Badge>
            <Badge variant="outline">Frontend</Badge>
            <Badge variant="warning">In Progress</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Size Variations -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Custom Sizes</h3>
      <p class="text-muted-foreground text-sm">
        Badges can be customized with different sizes
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-wrap items-center gap-4">
          <Badge variant="default" class="text-[10px] px-1.5 py-0">XS</Badge>
          <Badge variant="default" class="text-xs px-2 py-0.5">Small</Badge>
          <Badge variant="default">Default</Badge>
          <Badge variant="default" class="text-sm px-3 py-1">Large</Badge>
          <Badge variant="default" class="text-base px-4 py-1.5">XL</Badge>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Interactive Badges -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Examples</h3>
      <p class="text-muted-foreground text-sm">
        Badges used in interactive components
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Filter Tags -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Active Filters</CardTitle>
          <CardDescription>Click to remove</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex flex-wrap gap-2">
            {#each ['TypeScript', 'React', 'Svelte', 'Node.js'] as tag}
              <button class="group">
                <Badge variant="secondary" class="cursor-pointer group-hover:bg-secondary/60">
                  {tag}
                  <span class="ml-1 opacity-60 group-hover:opacity-100">×</span>
                </Badge>
              </button>
            {/each}
          </div>
        </CardContent>
      </Card>

      <!-- Category Pills -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Categories</CardTitle>
          <CardDescription>Select a category</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex flex-wrap gap-2">
            {#each [
              { label: 'All', count: 42 },
              { label: 'Active', count: 12 },
              { label: 'Pending', count: 8 },
              { label: 'Archived', count: 22 }
            ] as category}
              <button class="group">
                <Badge variant="outline" class="cursor-pointer group-hover:bg-accent">
                  {category.label}
                  <span class="ml-1.5 text-[10px] opacity-60">{category.count}</span>
                </Badge>
              </button>
            {/each}
          </div>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Combined Examples -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Complex Examples</h3>
      <p class="text-muted-foreground text-sm">
        Real-world applications combining multiple concepts
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Project Dashboard</CardTitle>
        <CardDescription>Overview of active projects</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          {#each [
            { name: 'E-commerce Platform', status: 'success', priority: 'High', team: 'Frontend', progress: '85%' },
            { name: 'Mobile App Redesign', status: 'warning', priority: 'Medium', team: 'Design', progress: '60%' },
            { name: 'API Documentation', status: 'destructive', priority: 'Low', team: 'Backend', progress: '30%' },
            { name: 'User Analytics', status: 'outline', priority: 'Medium', team: 'Data', progress: '45%' }
          ] as project}
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
              <div class="flex-1">
                <p class="font-medium text-sm">{project.name}</p>
                <div class="flex flex-wrap gap-2 mt-2">
                  <Badge variant={project.status === 'success' ? 'success' : project.status === 'warning' ? 'warning' : project.status === 'destructive' ? 'destructive' : 'outline'}>
                    {project.status === 'success' ? 'On Track' : project.status === 'warning' ? 'At Risk' : project.status === 'destructive' ? 'Delayed' : 'Not Started'}
                  </Badge>
                  <Badge variant="secondary">{project.team}</Badge>
                  <Badge variant="outline" class="text-[10px]">Priority: {project.priority}</Badge>
                </div>
              </div>
              <div class="text-right">
                <p class="text-sm font-medium">{project.progress}</p>
                <p class="text-xs text-muted-foreground">Complete</p>
              </div>
            </div>
          {/each}
        </div>
      </CardContent>
    </Card>
  </section>
</div>
