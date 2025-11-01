<script lang="ts">
  import { Avatar } from '@composable-svelte/core/components/ui/avatar/index.js';
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';
  import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@composable-svelte/core/components/ui/card/index.js';
</script>

<div class="space-y-12">
  <!-- Sizes -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Avatar Sizes</h3>
      <p class="text-muted-foreground text-sm">
        Avatars come in four different sizes
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-wrap items-end gap-6">
          <div class="flex flex-col items-center gap-2">
            <Avatar fallback="SM" size="sm" />
            <span class="text-xs text-muted-foreground">Small</span>
          </div>
          <div class="flex flex-col items-center gap-2">
            <Avatar fallback="MD" size="md" />
            <span class="text-xs text-muted-foreground">Medium</span>
          </div>
          <div class="flex flex-col items-center gap-2">
            <Avatar fallback="LG" size="lg" />
            <span class="text-xs text-muted-foreground">Large</span>
          </div>
          <div class="flex flex-col items-center gap-2">
            <Avatar fallback="XL" size="xl" />
            <span class="text-xs text-muted-foreground">X-Large</span>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Fallback Initials -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Fallback Initials</h3>
      <p class="text-muted-foreground text-sm">
        When no image is provided, initials are displayed
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-wrap gap-4">
          <Avatar fallback="AB" />
          <Avatar fallback="CD" />
          <Avatar fallback="EF" />
          <Avatar fallback="GH" />
          <Avatar fallback="IJ" />
          <Avatar fallback="KL" />
          <Avatar fallback="MN" />
          <Avatar fallback="OP" />
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Custom Styling -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Custom Styling</h3>
      <p class="text-muted-foreground text-sm">
        Avatars can be customized with rings, borders, and colors
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-wrap gap-4">
          <Avatar fallback="A" class="ring-2 ring-primary" />
          <Avatar fallback="B" class="ring-2 ring-destructive" />
          <Avatar fallback="C" class="ring-2 ring-green-500" />
          <Avatar fallback="D" class="ring-2 ring-yellow-500" />
          <Avatar fallback="E" class="ring-2 ring-blue-500 ring-offset-2 ring-offset-background" />
          <Avatar fallback="F" class="ring-2 ring-purple-500 ring-offset-2 ring-offset-background" />
          <Avatar fallback="G" class="border-4 border-primary" />
          <Avatar fallback="H" class="border-4 border-dashed border-primary" />
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Avatar Groups -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Avatar Groups</h3>
      <p class="text-muted-foreground text-sm">
        Stacked avatars for showing groups or teams
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Overlapping Avatars -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Team Members</CardTitle>
          <CardDescription>5 active contributors</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex -space-x-2">
            <Avatar fallback="AM" class="ring-2 ring-background" />
            <Avatar fallback="BP" class="ring-2 ring-background" />
            <Avatar fallback="CQ" class="ring-2 ring-background" />
            <Avatar fallback="DR" class="ring-2 ring-background" />
            <Avatar fallback="+2" class="ring-2 ring-background bg-primary text-primary-foreground" />
          </div>
        </CardContent>
      </Card>

      <!-- Larger Group -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Project Collaborators</CardTitle>
          <CardDescription>12 total members</CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex -space-x-3">
            {#each ['JS', 'KT', 'LU', 'MV'] as initials}
              <Avatar fallback={initials} size="lg" class="ring-2 ring-background" />
            {/each}
            <Avatar fallback="+8" size="lg" class="ring-2 ring-background bg-muted text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- With Status Indicators -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">With Status Indicators</h3>
      <p class="text-muted-foreground text-sm">
        Combine avatars with status badges
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="flex flex-wrap gap-6">
          <!-- Online -->
          <div class="relative">
            <Avatar fallback="JD" />
            <span class="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-background"></span>
          </div>

          <!-- Busy -->
          <div class="relative">
            <Avatar fallback="SM" />
            <span class="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-red-500 ring-2 ring-background"></span>
          </div>

          <!-- Away -->
          <div class="relative">
            <Avatar fallback="KL" />
            <span class="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-yellow-500 ring-2 ring-background"></span>
          </div>

          <!-- Offline -->
          <div class="relative">
            <Avatar fallback="AB" />
            <span class="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-gray-400 ring-2 ring-background"></span>
          </div>

          <!-- Large with status -->
          <div class="relative">
            <Avatar fallback="XY" size="lg" />
            <span class="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-green-500 ring-2 ring-background"></span>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- User Lists -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">User Lists</h3>
      <p class="text-muted-foreground text-sm">
        Avatars in list layouts with additional information
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Contact List -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Recent Contacts</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          {#each [
            { initials: 'AJ', name: 'Alice Johnson', status: 'online', role: 'Admin' },
            { initials: 'BS', name: 'Bob Smith', status: 'away', role: 'Developer' },
            { initials: 'CW', name: 'Carol White', status: 'offline', role: 'Designer' },
            { initials: 'DB', name: 'David Brown', status: 'online', role: 'Manager' }
          ] as contact}
            <div class="flex items-center gap-3 p-2 rounded hover:bg-accent transition-colors">
              <div class="relative">
                <Avatar fallback={contact.initials} size="sm" />
                <span class="absolute bottom-0 right-0 h-2 w-2 rounded-full ring-1 ring-background {
                  contact.status === 'online' ? 'bg-green-500' :
                  contact.status === 'away' ? 'bg-yellow-500' :
                  'bg-gray-400'
                }"></span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium truncate">{contact.name}</p>
                <p class="text-xs text-muted-foreground truncate">{contact.role}</p>
              </div>
              <Badge variant={contact.status === 'online' ? 'success' : contact.status === 'away' ? 'warning' : 'outline'} class="text-[10px]">
                {contact.status}
              </Badge>
            </div>
          {/each}
        </CardContent>
      </Card>

      <!-- Team Directory -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Team Directory</CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          {#each [
            { initials: 'EF', name: 'Emma Foster', email: 'emma@example.com' },
            { initials: 'GH', name: 'George Harris', email: 'george@example.com' },
            { initials: 'IJ', name: 'Iris Jackson', email: 'iris@example.com' },
            { initials: 'KL', name: 'Kyle Lopez', email: 'kyle@example.com' }
          ] as member}
            <div class="flex items-center gap-3 p-2 rounded hover:bg-accent transition-colors cursor-pointer">
              <Avatar fallback={member.initials} />
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium">{member.name}</p>
                <p class="text-xs text-muted-foreground truncate">{member.email}</p>
              </div>
            </div>
          {/each}
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Complex Example -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Profile Card</h3>
      <p class="text-muted-foreground text-sm">
        Complete user profile with avatar
      </p>
    </div>

    <Card class="max-w-md">
      <div class="relative h-32 bg-gradient-to-br from-blue-500 to-purple-500"></div>
      <CardContent class="pt-0">
        <div class="flex items-end gap-4 -mt-12 mb-4">
          <Avatar fallback="JD" size="xl" class="ring-4 ring-background" />
          <div class="flex-1 pb-2">
            <div class="flex items-center gap-2">
              <h3 class="font-semibold text-lg">John Doe</h3>
              <Badge variant="success" class="text-[10px]">
                <span class="mr-1">✓</span> Verified
              </Badge>
            </div>
            <p class="text-sm text-muted-foreground">@johndoe</p>
          </div>
        </div>

        <p class="text-sm mb-4">
          Full-stack developer passionate about building great user experiences.
          Love working with React, TypeScript, and Svelte.
        </p>

        <div class="flex flex-wrap gap-2 mb-4">
          <Badge variant="secondary">TypeScript</Badge>
          <Badge variant="secondary">React</Badge>
          <Badge variant="secondary">Svelte</Badge>
          <Badge variant="secondary">Node.js</Badge>
        </div>

        <div class="grid grid-cols-3 gap-4 py-4 border-t text-center">
          <div>
            <p class="text-xl font-bold">156</p>
            <p class="text-xs text-muted-foreground">Projects</p>
          </div>
          <div>
            <p class="text-xl font-bold">2.4k</p>
            <p class="text-xs text-muted-foreground">Followers</p>
          </div>
          <div>
            <p class="text-xl font-bold">892</p>
            <p class="text-xs text-muted-foreground">Following</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Grid Layout -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Grid Layout</h3>
      <p class="text-muted-foreground text-sm">
        Team members in a grid view
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Our Team</CardTitle>
        <CardDescription>Meet the people behind the product</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {#each [
            { initials: 'AM', name: 'Anna Miller' },
            { initials: 'BN', name: 'Ben Nelson' },
            { initials: 'CO', name: 'Claire Owens' },
            { initials: 'DP', name: 'Dan Parker' },
            { initials: 'EQ', name: 'Eva Quinn' },
            { initials: 'FR', name: 'Frank Roberts' },
            { initials: 'GS', name: 'Grace Scott' },
            { initials: 'HT', name: 'Henry Turner' },
            { initials: 'IU', name: 'Ivy Underwood' },
            { initials: 'JV', name: 'Jack Vincent' },
            { initials: 'KW', name: 'Kate Wilson' },
            { initials: 'LX', name: 'Leo Xavier' }
          ] as member}
            <div class="flex flex-col items-center text-center gap-2 p-3 rounded hover:bg-accent transition-colors cursor-pointer">
              <Avatar fallback={member.initials} size="lg" />
              <p class="text-xs font-medium truncate w-full">{member.name}</p>
            </div>
          {/each}
        </div>
      </CardContent>
    </Card>
  </section>
</div>
