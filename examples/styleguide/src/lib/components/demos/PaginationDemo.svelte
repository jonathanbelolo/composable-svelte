<script lang="ts">
  import { Pagination } from '@composable-svelte/core/components/ui/pagination/index.js';
  import { Card, CardHeader, CardTitle, CardContent } from '@composable-svelte/core/components/ui/card/index.js';
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';

  // Sample data for demonstrations
  let currentPage1 = $state(1);
  let currentPage2 = $state(1);
  let currentPage3 = $state(1);
  let currentPage4 = $state(5);
  let itemsPerPage = $state(10);

  // Generate sample items for display
  function getItems(page: number, perPage: number, total: number) {
    const start = (page - 1) * perPage;
    const end = Math.min(start + perPage, total);
    return Array.from({ length: end - start }, (_, i) => ({
      id: start + i + 1,
      title: `Item ${start + i + 1}`,
      description: `This is a description for item #${start + i + 1}`
    }));
  }

  const items1 = $derived(getItems(currentPage1, 10, 50));
  const items3 = $derived(getItems(currentPage3, itemsPerPage, 245));
</script>

<div class="space-y-12">
  <!-- Basic Pagination -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Pagination</h3>
      <p class="text-muted-foreground text-sm">
        Simple page navigation with smart ellipsis handling
      </p>
    </div>

    <div class="max-w-4xl space-y-4">
      <!-- Display items -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each items1 as item}
          <Card>
            <CardContent class="p-4">
              <div class="flex items-center justify-between">
                <div>
                  <h4 class="font-semibold text-sm">{item.title}</h4>
                  <p class="text-xs text-muted-foreground mt-1">{item.description}</p>
                </div>
                <Badge variant="secondary">#{item.id}</Badge>
              </div>
            </CardContent>
          </Card>
        {/each}
      </div>

      <!-- Pagination controls -->
      <div class="flex justify-center pt-4 border-t">
        <Pagination
          totalItems={50}
          itemsPerPage={10}
          bind:currentPage={currentPage1}
        />
      </div>
    </div>
  </section>

  <!-- Compact Pagination -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Compact Pagination</h3>
      <p class="text-muted-foreground text-sm">
        Fewer items - shows all pages without ellipsis
      </p>
    </div>

    <div class="max-w-2xl space-y-4">
      <div class="flex justify-center">
        <Pagination
          totalItems={25}
          itemsPerPage={5}
          bind:currentPage={currentPage2}
          maxPageButtons={7}
        />
      </div>

      <div class="text-center text-sm text-muted-foreground">
        Viewing page {currentPage2} of {Math.ceil(25 / 5)}
      </div>
    </div>
  </section>

  <!-- With Items Per Page Selector -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">With Items Per Page Selector</h3>
      <p class="text-muted-foreground text-sm">
        Allow users to control page size
      </p>
    </div>

    <div class="max-w-4xl space-y-4">
      <!-- Display items -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {#each items3 as item}
          <div class="border rounded-lg p-3 hover:bg-accent transition-colors">
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium text-sm">{item.title}</p>
                <p class="text-xs text-muted-foreground">ID: {item.id}</p>
              </div>
            </div>
          </div>
        {/each}
      </div>

      <!-- Pagination with items per page -->
      <div class="flex justify-between items-center pt-4 border-t flex-wrap gap-4">
        <Pagination
          totalItems={245}
          bind:itemsPerPage
          bind:currentPage={currentPage3}
          showItemsPerPage={true}
          itemsPerPageOptions={[10, 20, 30, 50]}
          class="flex-1"
        />
      </div>

      <div class="text-sm text-muted-foreground text-center">
        Showing {((currentPage3 - 1) * itemsPerPage) + 1} to {Math.min(currentPage3 * itemsPerPage, 245)} of 245 items
      </div>
    </div>
  </section>

  <!-- Large Dataset -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Large Dataset</h3>
      <p class="text-muted-foreground text-sm">
        Smart ellipsis for many pages (1000 items total)
      </p>
    </div>

    <div class="max-w-2xl space-y-6">
      <Pagination
        totalItems={1000}
        itemsPerPage={10}
        bind:currentPage={currentPage4}
        maxPageButtons={7}
      />

      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-muted-foreground">Total Items:</span>
          <span class="font-medium">1,000</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted-foreground">Total Pages:</span>
          <span class="font-medium">100</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted-foreground">Current Page:</span>
          <span class="font-medium">{currentPage4}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-muted-foreground">Items on Page:</span>
          <span class="font-medium">10</span>
        </div>
      </div>
    </div>
  </section>

  <!-- Different Configurations -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Different Configurations</h3>
      <p class="text-muted-foreground text-sm">
        Various page button limits
      </p>
    </div>

    <div class="max-w-4xl space-y-8">
      <!-- 5 max buttons -->
      <div class="space-y-2">
        <p class="text-sm font-medium">Max 5 Page Buttons</p>
        <Pagination
          totalItems={500}
          itemsPerPage={10}
          maxPageButtons={5}
        />
      </div>

      <!-- 7 max buttons (default) -->
      <div class="space-y-2">
        <p class="text-sm font-medium">Max 7 Page Buttons (Default)</p>
        <Pagination
          totalItems={500}
          itemsPerPage={10}
          maxPageButtons={7}
        />
      </div>

      <!-- 9 max buttons -->
      <div class="space-y-2">
        <p class="text-sm font-medium">Max 9 Page Buttons</p>
        <Pagination
          totalItems={500}
          itemsPerPage={10}
          maxPageButtons={9}
        />
      </div>
    </div>
  </section>

  <!-- Table Example -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Table Pagination Example</h3>
      <p class="text-muted-foreground text-sm">
        Common use case with data tables
      </p>
    </div>

    <div class="max-w-4xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Users List</CardTitle>
        </CardHeader>
        <CardContent class="p-0">
          <!-- Table -->
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="border-b bg-muted/50">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">ID</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Email</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                {#each Array.from({ length: 10 }, (_, i) => ({
                  id: ((currentPage1 - 1) * 10) + i + 1,
                  name: `User ${((currentPage1 - 1) * 10) + i + 1}`,
                  email: `user${((currentPage1 - 1) * 10) + i + 1}@example.com`,
                  status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'inactive' : 'pending'
                })) as user}
                  <tr class="hover:bg-muted/50">
                    <td class="px-4 py-3 text-sm">{user.id}</td>
                    <td class="px-4 py-3 text-sm font-medium">{user.name}</td>
                    <td class="px-4 py-3 text-sm text-muted-foreground">{user.email}</td>
                    <td class="px-4 py-3 text-sm">
                      <Badge variant={user.status === 'active' ? 'success' : user.status === 'pending' ? 'warning' : 'default'}>
                        {user.status}
                      </Badge>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <!-- Pagination in footer -->
          <div class="border-t p-4">
            <Pagination
              totalItems={50}
              itemsPerPage={10}
              bind:currentPage={currentPage1}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Edge Cases -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Edge Cases</h3>
      <p class="text-muted-foreground text-sm">
        Single page and empty states
      </p>
    </div>

    <div class="max-w-2xl space-y-6">
      <!-- Single page -->
      <div class="space-y-2">
        <p class="text-sm font-medium">Single Page (No Navigation Needed)</p>
        <Pagination
          totalItems={5}
          itemsPerPage={10}
        />
      </div>

      <!-- Exactly 2 pages -->
      <div class="space-y-2">
        <p class="text-sm font-medium">Exactly 2 Pages</p>
        <Pagination
          totalItems={20}
          itemsPerPage={10}
        />
      </div>

      <!-- Small dataset -->
      <div class="space-y-2">
        <p class="text-sm font-medium">Small Dataset (15 items, 5 per page)</p>
        <Pagination
          totalItems={15}
          itemsPerPage={5}
        />
      </div>
    </div>
  </section>
</div>
