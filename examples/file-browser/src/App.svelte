<script lang="ts">
  import { TreeView } from '@composable-svelte/core';
  // TreeNode is not re-exported from the package root, though TreeView is. The
  // /components/ui subpath is the supported route and what the styleguide's own
  // TreeViewDemo uses.
  import type { TreeNode } from '@composable-svelte/core/components/ui';

  // Sample file system structure
  // `data` is a string: TreeView is not generic (its `<script>` carries no
  // `generics=` attribute), so TreeViewProps<T> stays at its `T = string`
  // default and a richer payload cannot be expressed. This example only ever
  // read the size — the `type` field it used to carry was never read, since the
  // emoji in each label already says which it is.
  const fileNodes: TreeNode[] = [
    {
      id: 'root',
      label: '📁 My Documents',
            children: [
        {
          id: 'projects',
          label: '📁 Projects',
                    children: [
            {
              id: 'svelte-app',
              label: '📁 svelte-app',
                            children: [
                {
                  id: 'src',
                  label: '📁 src',
                                    children: [
                    { id: 'app-svelte', label: '📄 App.svelte', data: '2.3 KB' },
                    { id: 'main-ts', label: '📄 main.ts', data: '0.5 KB' }
                  ]
                },
                { id: 'package-json', label: '📄 package.json', data: '1.2 KB' },
                { id: 'vite-config', label: '📄 vite.config.ts', data: '0.4 KB' }
              ]
            },
            {
              id: 'composable-svelte',
              label: '📁 composable-svelte',
                            lazy: true
            }
          ]
        },
        {
          id: 'photos',
          label: '📁 Photos',
                    children: [
            { id: 'vacation-jpg', label: '🖼️ vacation.jpg', data: '2.5 MB' },
            { id: 'family-jpg', label: '🖼️ family.jpg', data: '1.8 MB' }
          ]
        },
        {
          id: 'documents',
          label: '📁 Documents',
                    children: [
            { id: 'resume-pdf', label: '📄 resume.pdf', data: '125 KB' },
            { id: 'cover-letter', label: '📄 cover_letter.docx', data: '45 KB' }
          ]
        }
      ]
    }
  ];

  let selectedFile = $state<string | null>(null);
  let selectedSize = $state<string | null>(null);
  let log = $state<string[]>([]);

  function handleSelect(_nodeId: string, node: TreeNode) {
    selectedFile = node.label;
    selectedSize = node.data ?? null;
    log = [`Selected: ${node.label}`, ...log].slice(0, 5);
  }

  function handleExpand(_nodeId: string, node: TreeNode) {
    log = [`Expanded: ${node.label}`, ...log].slice(0, 5);
  }

  function handleCollapse(_nodeId: string, node: TreeNode) {
    log = [`Collapsed: ${node.label}`, ...log].slice(0, 5);
  }

  // Simulate lazy loading
  async function loadChildren(
    nodeId: string,
    _node: TreeNode
  ): Promise<TreeNode[]> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (nodeId === 'composable-svelte') {
      return [
        {
          id: 'cs-src',
          label: '📁 src',
                    children: [
            { id: 'cs-store', label: '📄 store.svelte.ts', data: '4.5 KB' },
            { id: 'cs-reducer', label: '📄 reducer.ts', data: '2.1 KB' }
          ]
        },
        { id: 'cs-readme', label: '📄 README.md', data: '3.2 KB' }
      ];
    }

    return [];
  }
</script>

<main>
  <div class="container">
    <h1>File Browser</h1>
    <p class="subtitle">TreeView Component Demo</p>

    <div class="layout">
      <div class="tree-panel">
        <div class="panel-header">
          <h2>📂 File System</h2>
        </div>
        <div class="tree-container">
          <TreeView
            nodes={fileNodes}
            initialExpandedIds={['root']}
            onSelect={handleSelect}
            onExpand={handleExpand}
            onCollapse={handleCollapse}
            loadChildren={loadChildren}
          />
        </div>
        <div class="tree-footer">
          <p class="hint">💡 Use arrow keys to navigate</p>
          <p class="hint">↵ Enter to select, Space to expand/collapse</p>
        </div>
      </div>

      <div class="info-panel">
        <div class="panel-header">
          <h2>ℹ️ Details</h2>
        </div>
        <div class="details">
          {#if selectedFile}
            <div class="detail-item">
              <span class="label">Selected:</span>
              <span class="value">{selectedFile}</span>
            </div>
            {#if selectedSize}
              <div class="detail-item">
                <span class="label">Size:</span>
                <span class="value">{selectedSize}</span>
              </div>
            {/if}
          {:else}
            <p class="placeholder">Select a file or folder to view details</p>
          {/if}
        </div>

        <div class="log-section">
          <h3>Activity Log</h3>
          <div class="log">
            {#if log.length === 0}
              <p class="placeholder">No activity yet</p>
            {:else}
              {#each log as entry}
                <div class="log-entry">{entry}</div>
              {/each}
            {/if}
          </div>
        </div>

        <div class="features">
          <h3>Features Demonstrated</h3>
          <ul>
            <li>✅ Hierarchical tree structure</li>
            <li>✅ Expand/collapse nodes</li>
            <li>✅ Keyboard navigation</li>
            <li>✅ Selection state</li>
            <li>✅ Lazy loading (composable-svelte folder)</li>
            <li>✅ Callback handlers</li>
            <li>✅ Custom data payload</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
  }

  main {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-height: 100vh;
    padding: 2rem 1rem;
  }

  .container {
    background: white;
    border-radius: 1rem;
    padding: 2rem;
    max-width: 1200px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  h1 {
    margin: 0 0 0.5rem 0;
    color: #333;
    text-align: center;
  }

  .subtitle {
    margin: 0 0 2rem 0;
    color: #666;
    text-align: center;
    font-size: 0.9rem;
  }

  .layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    margin-top: 2rem;
  }

  @media (max-width: 768px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }

  .tree-panel,
  .info-panel {
    background: #f7fafc;
    border-radius: 0.75rem;
    overflow: hidden;
    border: 1px solid #e2e8f0;
  }

  .panel-header {
    background: #667eea;
    color: white;
    padding: 1rem 1.5rem;
  }

  .panel-header h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .tree-container {
    padding: 1rem;
    max-height: 400px;
    overflow-y: auto;
    background: white;
  }

  .tree-footer {
    padding: 1rem 1.5rem;
    background: #edf2f7;
    border-top: 1px solid #e2e8f0;
  }

  .hint {
    margin: 0.25rem 0;
    font-size: 0.85rem;
    color: #4a5568;
  }

  .details {
    padding: 1.5rem;
    background: white;
    min-height: 120px;
  }

  .detail-item {
    display: flex;
    margin-bottom: 0.75rem;
  }

  .label {
    font-weight: 600;
    color: #4a5568;
    min-width: 80px;
  }

  .value {
    color: #2d3748;
  }

  .placeholder {
    color: #a0aec0;
    font-style: italic;
    margin: 0;
  }

  .log-section {
    padding: 1.5rem;
    background: #edf2f7;
    border-top: 1px solid #e2e8f0;
  }

  .log-section h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    color: #2d3748;
  }

  .log {
    background: white;
    border-radius: 0.5rem;
    padding: 1rem;
    min-height: 100px;
    max-height: 150px;
    overflow-y: auto;
    border: 1px solid #e2e8f0;
  }

  .log-entry {
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    background: #f7fafc;
    border-radius: 0.25rem;
    font-size: 0.9rem;
    color: #2d3748;
    border-left: 3px solid #667eea;
  }

  .log-entry:last-child {
    margin-bottom: 0;
  }

  .features {
    padding: 1.5rem;
    background: white;
    border-top: 1px solid #e2e8f0;
  }

  .features h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    color: #2d3748;
  }

  .features ul {
    margin: 0;
    padding-left: 0;
    list-style: none;
  }

  .features li {
    padding: 0.5rem 0;
    color: #4a5568;
    font-size: 0.9rem;
  }
</style>
