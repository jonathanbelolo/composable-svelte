<script lang="ts">
  import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@composable-svelte/core/components/ui/card/index.js';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';
</script>

<div class="space-y-12">
  <!-- Interactive Demo -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Card Examples</h3>
      <p class="text-muted-foreground text-sm">
        Cards are flexible content containers
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <!-- Basic Card -->
      <Card>
        <CardHeader>
          <CardTitle>Basic Card</CardTitle>
          <CardDescription>A simple card with title and description</CardDescription>
        </CardHeader>
        <CardContent>
          <p class="text-sm">
            This is the card content area. You can put any content here.
          </p>
        </CardContent>
        <CardFooter class="flex justify-between">
          <Button variant="outline">Cancel</Button>
          <Button>Action</Button>
        </CardFooter>
      </Card>

      <!-- Card with Badge -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <CardTitle>Product Card</CardTitle>
            <Badge variant="success">New</Badge>
          </div>
          <CardDescription>Premium subscription plan</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="space-y-2">
            <p class="text-3xl font-bold">$29<span class="text-lg text-muted-foreground">/mo</span></p>
            <ul class="text-sm space-y-1 text-muted-foreground">
              <li>✓ Unlimited projects</li>
              <li>✓ Priority support</li>
              <li>✓ Advanced analytics</li>
            </ul>
          </div>
        </CardContent>
        <CardFooter>
          <Button class="w-full">Subscribe Now</Button>
        </CardFooter>
      </Card>

      <!-- Stats Card -->
      <Card>
        <CardHeader>
          <CardDescription>Total Revenue</CardDescription>
          <CardTitle class="text-3xl">$45,231</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex items-center gap-2 text-sm">
            <span class="text-green-600">↑ 12.5%</span>
            <span class="text-muted-foreground">from last month</span>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Variants -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Card Layouts</h3>
      <p class="text-muted-foreground text-sm">
        Different card configurations
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Horizontal Card -->
      <Card>
        <div class="flex flex-col md:flex-row">
          <div class="w-full md:w-48 h-48 bg-gradient-to-br from-purple-500 to-pink-500 rounded-t-lg md:rounded-l-lg md:rounded-tr-none"></div>
          <div class="flex-1">
            <CardHeader>
              <CardTitle>Image Card</CardTitle>
              <CardDescription>Card with image thumbnail</CardDescription>
            </CardHeader>
            <CardContent>
              <p class="text-sm">
                This card demonstrates a horizontal layout with an image.
              </p>
            </CardContent>
            <CardFooter>
              <Button variant="link">Learn more →</Button>
            </CardFooter>
          </div>
        </div>
      </Card>

      <!-- Notification Card -->
      <Card class="border-l-4 border-l-primary">
        <CardHeader>
          <div class="flex items-start justify-between">
            <div>
              <CardTitle>New Comment</CardTitle>
              <CardDescription>2 minutes ago</CardDescription>
            </div>
            <Badge variant="primary">Unread</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p class="text-sm">
            John Doe commented on your post: "Great work on the new feature!"
          </p>
        </CardContent>
        <CardFooter class="gap-2">
          <Button variant="ghost" size="sm">Mark as Read</Button>
          <Button variant="ghost" size="sm">Reply</Button>
        </CardFooter>
      </Card>
    </div>
  </section>

  <!-- Interactive States -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Cards</h3>
      <p class="text-muted-foreground text-sm">
        Clickable and hoverable cards
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      {#each [
        { title: 'Analytics', icon: '📊', description: 'View detailed analytics' },
        { title: 'Settings', icon: '⚙️', description: 'Manage your preferences' },
        { title: 'Support', icon: '💬', description: 'Get help and support' }
      ] as item}
        <Card class="cursor-pointer hover:shadow-lg hover:border-primary/50 transition-all">
          <CardHeader>
            <div class="text-4xl mb-2">{item.icon}</div>
            <CardTitle>{item.title}</CardTitle>
            <CardDescription>{item.description}</CardDescription>
          </CardHeader>
        </Card>
      {/each}
    </div>
  </section>

  <!-- Complex Example -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Complex Card Example</h3>
      <p class="text-muted-foreground text-sm">
        Card with multiple sections and interactions
      </p>
    </div>

    <Card class="max-w-2xl">
      <CardHeader>
        <div class="flex items-start justify-between">
          <div>
            <CardTitle>Team Dashboard</CardTitle>
            <CardDescription>Overview of your team's activity</CardDescription>
          </div>
          <Button variant="outline" size="sm">Export</Button>
        </div>
      </CardHeader>
      <CardContent class="space-y-6">
        <!-- Team Members -->
        <div>
          <h4 class="text-sm font-medium mb-3">Team Members (4)</h4>
          <div class="space-y-2">
            {#each [
              { name: 'Alice Johnson', role: 'Admin', status: 'online' },
              { name: 'Bob Smith', role: 'Developer', status: 'online' },
              { name: 'Carol White', role: 'Designer', status: 'offline' },
              { name: 'David Brown', role: 'Developer', status: 'away' }
            ] as member}
              <div class="flex items-center justify-between p-2 rounded hover:bg-accent">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                    {member.name[0]}
                  </div>
                  <div>
                    <p class="text-sm font-medium">{member.name}</p>
                    <p class="text-xs text-muted-foreground">{member.role}</p>
                  </div>
                </div>
                <Badge variant={member.status === 'online' ? 'success' : member.status === 'away' ? 'warning' : 'default'}>
                  {member.status}
                </Badge>
              </div>
            {/each}
          </div>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-4 pt-4 border-t">
          <div class="text-center">
            <p class="text-2xl font-bold">24</p>
            <p class="text-xs text-muted-foreground">Projects</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold">156</p>
            <p class="text-xs text-muted-foreground">Tasks</p>
          </div>
          <div class="text-center">
            <p class="text-2xl font-bold">89%</p>
            <p class="text-xs text-muted-foreground">Completed</p>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button class="w-full">View Full Dashboard</Button>
      </CardFooter>
    </Card>
  </section>
</div>
