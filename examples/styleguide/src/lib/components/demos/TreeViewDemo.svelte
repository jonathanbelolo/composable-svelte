<script lang="ts">
  import { TreeView } from '@composable-svelte/core/components/ui/tree-view/index.js';
  import type { TreeNode } from '@composable-svelte/core/components/ui/tree-view/tree-view.types.js';
  import { Card, CardContent, CardHeader, CardTitle } from '@composable-svelte/core/components/ui/card/index.js';
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';

  // File system example
  const fileSystemNodes: TreeNode[] = [
    {
      id: '1',
      label: 'src',
      icon: '📁',
      children: [
        {
          id: '1-1',
          label: 'components',
          icon: '📁',
          children: [
            { id: '1-1-1', label: 'Button.svelte', icon: '📄' },
            { id: '1-1-2', label: 'Card.svelte', icon: '📄' },
            { id: '1-1-3', label: 'Modal.svelte', icon: '📄' },
          ],
        },
        {
          id: '1-2',
          label: 'lib',
          icon: '📁',
          children: [
            { id: '1-2-1', label: 'utils.ts', icon: '📝' },
            { id: '1-2-2', label: 'store.ts', icon: '📝' },
          ],
        },
        {
          id: '1-3',
          label: 'routes',
          icon: '📁',
          children: [
            { id: '1-3-1', label: '+page.svelte', icon: '📄' },
            { id: '1-3-2', label: '+layout.svelte', icon: '📄' },
          ],
        },
      ],
    },
    {
      id: '2',
      label: 'public',
      icon: '📁',
      children: [
        { id: '2-1', label: 'favicon.png', icon: '🖼️' },
        { id: '2-2', label: 'logo.svg', icon: '🖼️' },
      ],
    },
    {
      id: '3',
      label: 'package.json',
      icon: '📦',
    },
    {
      id: '4',
      label: 'README.md',
      icon: '📖',
    },
  ];

  // Organization chart
  const orgChartNodes: TreeNode[] = [
    {
      id: 'ceo',
      label: 'Sarah Johnson',
      icon: '👤',
      data: { role: 'CEO' },
      children: [
        {
          id: 'cto',
          label: 'Michael Chen',
          icon: '👤',
          data: { role: 'CTO' },
          children: [
            {
              id: 'eng-lead',
              label: 'Emily Rodriguez',
              icon: '👤',
              data: { role: 'Engineering Lead' },
              children: [
                { id: 'dev-1', label: 'Alex Kim', icon: '👤', data: { role: 'Senior Developer' } },
                { id: 'dev-2', label: 'Jordan Lee', icon: '👤', data: { role: 'Developer' } },
              ],
            },
            {
              id: 'devops-lead',
              label: 'Chris Taylor',
              icon: '👤',
              data: { role: 'DevOps Lead' },
            },
          ],
        },
        {
          id: 'cmo',
          label: 'David Brown',
          icon: '👤',
          data: { role: 'CMO' },
          children: [
            { id: 'marketing-1', label: 'Lisa Wang', icon: '👤', data: { role: 'Marketing Manager' } },
            { id: 'marketing-2', label: 'Tom Anderson', icon: '👤', data: { role: 'Content Lead' } },
          ],
        },
      ],
    },
  ];

  // Product categories
  const productCategories: TreeNode[] = [
    {
      id: 'electronics',
      label: 'Electronics',
      icon: '💻',
      children: [
        {
          id: 'computers',
          label: 'Computers',
          icon: '🖥️',
          children: [
            { id: 'laptops', label: 'Laptops (24)', icon: '💻' },
            { id: 'desktops', label: 'Desktops (15)', icon: '🖥️' },
            { id: 'tablets', label: 'Tablets (32)', icon: '📱' },
          ],
        },
        {
          id: 'audio',
          label: 'Audio',
          icon: '🎧',
          children: [
            { id: 'headphones', label: 'Headphones (45)', icon: '🎧' },
            { id: 'speakers', label: 'Speakers (28)', icon: '🔊' },
            { id: 'microphones', label: 'Microphones (12)', icon: '🎤' },
          ],
        },
      ],
    },
    {
      id: 'clothing',
      label: 'Clothing',
      icon: '👕',
      children: [
        { id: 'mens', label: "Men's Clothing (156)", icon: '👔' },
        { id: 'womens', label: "Women's Clothing (203)", icon: '👗' },
        { id: 'kids', label: "Kids' Clothing (98)", icon: '👶' },
      ],
    },
    {
      id: 'home',
      label: 'Home & Garden',
      icon: '🏠',
      children: [
        { id: 'furniture', label: 'Furniture (67)', icon: '🪑' },
        { id: 'kitchen', label: 'Kitchen (89)', icon: '🍴' },
        { id: 'garden', label: 'Garden (42)', icon: '🌱' },
      ],
    },
  ];

  // Features tree
  const featureNodes: TreeNode[] = [
    {
      id: 'state',
      label: 'State Management',
      icon: '🗂️',
      children: [
        { id: 'state-1', label: 'Reducers', icon: '⚙️' },
        { id: 'state-2', label: 'Effects', icon: '⚡' },
        { id: 'state-3', label: 'Store', icon: '📦' },
      ],
    },
    {
      id: 'testing',
      label: 'Testing',
      icon: '🧪',
      children: [
        { id: 'test-1', label: 'TestStore', icon: '🔬' },
        { id: 'test-2', label: 'Assertions', icon: '✅' },
      ],
    },
    {
      id: 'navigation',
      label: 'Navigation',
      icon: '🧭',
      children: [
        { id: 'nav-1', label: 'Modal', icon: '📱' },
        { id: 'nav-2', label: 'Sheet', icon: '📋' },
        { id: 'nav-3', label: 'Stack', icon: '📚' },
      ],
    },
  ];

  // Lazy loading example
  const lazyNodes: TreeNode[] = [
    {
      id: 'folder-1',
      label: 'Documents',
      icon: '📁',
      lazy: true,
    },
    {
      id: 'folder-2',
      label: 'Pictures',
      icon: '📁',
      lazy: true,
    },
    {
      id: 'folder-3',
      label: 'Downloads',
      icon: '📁',
      lazy: true,
    },
  ];

  async function loadChildren(nodeId: string): Promise<TreeNode[]> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Return mock children based on parent
    return [
      { id: `${nodeId}-1`, label: 'File 1.pdf', icon: '📄' },
      { id: `${nodeId}-2`, label: 'File 2.doc', icon: '📝' },
      { id: `${nodeId}-3`, label: 'File 3.jpg', icon: '🖼️' },
    ];
  }

  let selectedNode = $state<string | null>(null);
  let expandedNode = $state<string | null>(null);

  function handleFileSelect(nodeId: string, node: TreeNode) {
    selectedNode = `${node.label} (${nodeId})`;
  }

  function handleExpand(nodeId: string, node: TreeNode) {
    expandedNode = `Expanded: ${node.label}`;
  }

  function handleCollapse(nodeId: string, node: TreeNode) {
    expandedNode = `Collapsed: ${node.label}`;
  }
</script>

<div class="space-y-12">
  <!-- Basic Tree View -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">File System Tree</h3>
      <p class="text-muted-foreground text-sm">
        Hierarchical file browser with expand/collapse
      </p>
      {#if selectedNode}
        <div class="mt-2">
          <Badge variant="primary">Selected: {selectedNode}</Badge>
        </div>
      {/if}
    </div>

    <Card>
      <CardContent class="p-4">
        <TreeView
          nodes={fileSystemNodes}
          initialExpandedIds={['1', '1-1']}
          onSelect={handleFileSelect}
          class="border rounded-md p-2"
        />
      </CardContent>
    </Card>
  </section>

  <!-- Organization Chart -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Organization Chart</h3>
      <p class="text-muted-foreground text-sm">
        Company hierarchy with expandable teams
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Company Structure</CardTitle>
      </CardHeader>
      <CardContent>
        <TreeView
          nodes={orgChartNodes}
          initialExpandedIds={['ceo', 'cto']}
          class="border rounded-md p-2"
        />
      </CardContent>
    </Card>
  </section>

  <!-- Product Categories -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Product Categories</h3>
      <p class="text-muted-foreground text-sm">
        E-commerce navigation with product counts
      </p>
    </div>

    <div class="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle class="text-base">Browse Products</CardTitle>
        </CardHeader>
        <CardContent>
          <TreeView
            nodes={productCategories}
            initialExpandedIds={['electronics', 'computers']}
            class="border rounded-md p-2"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-base">Features Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <TreeView
            nodes={featureNodes}
            initialExpandedIds={['state']}
            class="border rounded-md p-2"
          />
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Multi-select Tree -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Multi-Select Mode</h3>
      <p class="text-muted-foreground text-sm">
        Select multiple items at once
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">Select Features to Install</CardTitle>
      </CardHeader>
      <CardContent>
        <TreeView
          nodes={featureNodes}
          multiSelect={true}
          class="border rounded-md p-2"
        />
        <div class="mt-4 text-xs text-muted-foreground">
          Hold Ctrl/Cmd to select multiple items
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Lazy Loading -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Lazy Loading</h3>
      <p class="text-muted-foreground text-sm">
        Load children on demand with loading states
      </p>
      {#if expandedNode}
        <div class="mt-2">
          <Badge variant="secondary">{expandedNode}</Badge>
        </div>
      {/if}
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">Remote Folders</CardTitle>
      </CardHeader>
      <CardContent>
        <TreeView
          nodes={lazyNodes}
          loadChildren={loadChildren}
          onExpand={handleExpand}
          onCollapse={handleCollapse}
          class="border rounded-md p-2"
        />
        <div class="mt-4 text-xs text-muted-foreground">
          Click folder icons to load children (simulated 1s delay)
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Keyboard Navigation -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Keyboard Navigation</h3>
      <p class="text-muted-foreground text-sm">
        Full keyboard accessibility support
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="text-base">Try Keyboard Controls</CardTitle>
      </CardHeader>
      <CardContent>
        <TreeView
          nodes={fileSystemNodes}
          initialExpandedIds={['1']}
          class="border rounded-md p-2 mb-4"
        />

        <div class="space-y-2 text-sm">
          <div class="grid grid-cols-2 gap-2">
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 text-xs bg-muted rounded border">↑</kbd>
              <span class="text-muted-foreground">Previous item</span>
            </div>
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 text-xs bg-muted rounded border">↓</kbd>
              <span class="text-muted-foreground">Next item</span>
            </div>
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 text-xs bg-muted rounded border">→</kbd>
              <span class="text-muted-foreground">Expand node</span>
            </div>
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 text-xs bg-muted rounded border">←</kbd>
              <span class="text-muted-foreground">Collapse node</span>
            </div>
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 text-xs bg-muted rounded border">Enter</kbd>
              <span class="text-muted-foreground">Select node</span>
            </div>
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 text-xs bg-muted rounded border">Home</kbd>
              <span class="text-muted-foreground">First item</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Disabled Nodes -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Disabled Nodes</h3>
      <p class="text-muted-foreground text-sm">
        Some nodes can be disabled
      </p>
    </div>

    <Card>
      <CardContent class="p-4">
        <TreeView
          nodes={[
            {
              id: 'enabled-1',
              label: 'Available Feature',
              icon: '✅',
              children: [
                { id: 'enabled-1-1', label: 'Sub-feature 1', icon: '📌' },
                { id: 'enabled-1-2', label: 'Sub-feature 2', icon: '📌' },
              ],
            },
            {
              id: 'disabled-1',
              label: 'Coming Soon',
              icon: '🔒',
              disabled: true,
              children: [
                { id: 'disabled-1-1', label: 'Future Feature', icon: '⏳' },
              ],
            },
            {
              id: 'enabled-2',
              label: 'Another Available Feature',
              icon: '✅',
            },
          ]}
          class="border rounded-md p-2"
        />
      </CardContent>
    </Card>
  </section>
</div>
