<script lang="ts">
  import { Kbd } from '@composable-svelte/core/components/ui/kbd/index.js';
  import { Card, CardContent } from '@composable-svelte/core/components/ui/card/index.js';
</script>

<div class="space-y-12">
  <!-- Basic Keyboard Keys -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Keyboard Keys</h3>
      <p class="text-muted-foreground text-sm">
        Display individual keyboard keys
      </p>
    </div>

    <div class="flex flex-wrap gap-2">
      <Kbd>Ctrl</Kbd>
      <Kbd>Alt</Kbd>
      <Kbd>Shift</Kbd>
      <Kbd>Enter</Kbd>
      <Kbd>Esc</Kbd>
      <Kbd>Tab</Kbd>
      <Kbd>Space</Kbd>
      <Kbd>Delete</Kbd>
    </div>
  </section>

  <!-- Key Combinations -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Key Combinations</h3>
      <p class="text-muted-foreground text-sm">
        Show keyboard shortcuts with multiple keys
      </p>
    </div>

    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1">
          <Kbd>Ctrl</Kbd>
          <span class="text-muted-foreground">+</span>
          <Kbd>C</Kbd>
        </div>
        <span class="text-sm text-muted-foreground">Copy</span>
      </div>

      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1">
          <Kbd>Ctrl</Kbd>
          <span class="text-muted-foreground">+</span>
          <Kbd>V</Kbd>
        </div>
        <span class="text-sm text-muted-foreground">Paste</span>
      </div>

      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1">
          <Kbd>Ctrl</Kbd>
          <span class="text-muted-foreground">+</span>
          <Kbd>Shift</Kbd>
          <span class="text-muted-foreground">+</span>
          <Kbd>Z</Kbd>
        </div>
        <span class="text-sm text-muted-foreground">Redo</span>
      </div>

      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1">
          <Kbd>Ctrl</Kbd>
          <span class="text-muted-foreground">+</span>
          <Kbd>K</Kbd>
        </div>
        <span class="text-sm text-muted-foreground">Open command palette</span>
      </div>
    </div>
  </section>

  <!-- Sizes -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Sizes</h3>
      <p class="text-muted-foreground text-sm">
        Small, base, and large keyboard keys
      </p>
    </div>

    <div class="flex items-center gap-4">
      <div class="space-y-2">
        <p class="text-xs font-medium text-muted-foreground">Small</p>
        <Kbd size="sm">Esc</Kbd>
      </div>

      <div class="space-y-2">
        <p class="text-xs font-medium text-muted-foreground">Base (Default)</p>
        <Kbd size="base">Esc</Kbd>
      </div>

      <div class="space-y-2">
        <p class="text-xs font-medium text-muted-foreground">Large</p>
        <Kbd size="lg">Esc</Kbd>
      </div>
    </div>
  </section>

  <!-- Arrow Keys -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Arrow Keys</h3>
      <p class="text-muted-foreground text-sm">
        Directional navigation keys
      </p>
    </div>

    <div class="space-y-3">
      <div class="flex justify-center">
        <Kbd>↑</Kbd>
      </div>
      <div class="flex justify-center gap-2">
        <Kbd>←</Kbd>
        <Kbd>↓</Kbd>
        <Kbd>→</Kbd>
      </div>
    </div>
  </section>

  <!-- Function Keys -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Function Keys</h3>
      <p class="text-muted-foreground text-sm">
        F1-F12 and special function keys
      </p>
    </div>

    <div class="flex flex-wrap gap-2">
      {#each Array.from({ length: 12 }, (_, i) => `F${i + 1}`) as key}
        <Kbd size="sm">{key}</Kbd>
      {/each}
    </div>
  </section>

  <!-- Shortcut Documentation -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Shortcut Documentation</h3>
      <p class="text-muted-foreground text-sm">
        Document keyboard shortcuts for your application
      </p>
    </div>

    <Card>
      <CardContent class="p-6">
        <h4 class="font-semibold mb-4">Editor Shortcuts</h4>
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm">Save</span>
            <div class="flex items-center gap-1">
              <Kbd size="sm">Ctrl</Kbd>
              <span class="text-muted-foreground text-xs">+</span>
              <Kbd size="sm">S</Kbd>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-sm">Open file</span>
            <div class="flex items-center gap-1">
              <Kbd size="sm">Ctrl</Kbd>
              <span class="text-muted-foreground text-xs">+</span>
              <Kbd size="sm">O</Kbd>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-sm">Find</span>
            <div class="flex items-center gap-1">
              <Kbd size="sm">Ctrl</Kbd>
              <span class="text-muted-foreground text-xs">+</span>
              <Kbd size="sm">F</Kbd>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-sm">Replace</span>
            <div class="flex items-center gap-1">
              <Kbd size="sm">Ctrl</Kbd>
              <span class="text-muted-foreground text-xs">+</span>
              <Kbd size="sm">H</Kbd>
            </div>
          </div>

          <div class="flex items-center justify-between">
            <span class="text-sm">Toggle comment</span>
            <div class="flex items-center gap-1">
              <Kbd size="sm">Ctrl</Kbd>
              <span class="text-muted-foreground text-xs">+</span>
              <Kbd size="sm">/</Kbd>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Platform Specific -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Platform Specific</h3>
      <p class="text-muted-foreground text-sm">
        Show different shortcuts for different platforms
      </p>
    </div>

    <div class="grid md:grid-cols-2 gap-4">
      <Card>
        <CardContent class="p-6">
          <h4 class="font-semibold mb-4 flex items-center gap-2">
            <span>macOS</span>
          </h4>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm">Copy</span>
              <div class="flex items-center gap-1">
                <Kbd size="sm">⌘</Kbd>
                <span class="text-muted-foreground text-xs">+</span>
                <Kbd size="sm">C</Kbd>
              </div>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-sm">Paste</span>
              <div class="flex items-center gap-1">
                <Kbd size="sm">⌘</Kbd>
                <span class="text-muted-foreground text-xs">+</span>
                <Kbd size="sm">V</Kbd>
              </div>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-sm">Spotlight</span>
              <div class="flex items-center gap-1">
                <Kbd size="sm">⌘</Kbd>
                <span class="text-muted-foreground text-xs">+</span>
                <Kbd size="sm">Space</Kbd>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="p-6">
          <h4 class="font-semibold mb-4">Windows/Linux</h4>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-sm">Copy</span>
              <div class="flex items-center gap-1">
                <Kbd size="sm">Ctrl</Kbd>
                <span class="text-muted-foreground text-xs">+</span>
                <Kbd size="sm">C</Kbd>
              </div>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-sm">Paste</span>
              <div class="flex items-center gap-1">
                <Kbd size="sm">Ctrl</Kbd>
                <span class="text-muted-foreground text-xs">+</span>
                <Kbd size="sm">V</Kbd>
              </div>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-sm">Search</span>
              <div class="flex items-center gap-1">
                <Kbd size="sm">Win</Kbd>
                <span class="text-muted-foreground text-xs">+</span>
                <Kbd size="sm">S</Kbd>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Numbers and Special Characters -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Numbers and Special Characters</h3>
      <p class="text-muted-foreground text-sm">
        Number keys and special character keys
      </p>
    </div>

    <div class="space-y-4">
      <div>
        <p class="text-sm font-medium mb-2">Numbers</p>
        <div class="flex flex-wrap gap-1">
          {#each Array.from({ length: 10 }, (_, i) => `${i}`) as num}
            <Kbd size="sm">{num}</Kbd>
          {/each}
        </div>
      </div>

      <div>
        <p class="text-sm font-medium mb-2">Special Characters</p>
        <div class="flex flex-wrap gap-2">
          <Kbd size="sm">~</Kbd>
          <Kbd size="sm">!</Kbd>
          <Kbd size="sm">@</Kbd>
          <Kbd size="sm">#</Kbd>
          <Kbd size="sm">$</Kbd>
          <Kbd size="sm">%</Kbd>
          <Kbd size="sm">^</Kbd>
          <Kbd size="sm">&</Kbd>
          <Kbd size="sm">*</Kbd>
          <Kbd size="sm">(</Kbd>
          <Kbd size="sm">)</Kbd>
          <Kbd size="sm">-</Kbd>
          <Kbd size="sm">+</Kbd>
          <Kbd size="sm">=</Kbd>
        </div>
      </div>
    </div>
  </section>

  <!-- In Help Text -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">In Help Text</h3>
      <p class="text-muted-foreground text-sm">
        Use inline within explanatory text
      </p>
    </div>

    <Card>
      <CardContent class="p-6 space-y-4">
        <p class="text-sm">
          Press <Kbd size="sm">Ctrl</Kbd> + <Kbd size="sm">K</Kbd> to open the command palette.
        </p>

        <p class="text-sm">
          Use <Kbd size="sm">↑</Kbd> and <Kbd size="sm">↓</Kbd> arrows to navigate, then press <Kbd size="sm">Enter</Kbd> to select.
        </p>

        <p class="text-sm">
          Toggle the sidebar with <Kbd size="sm">Ctrl</Kbd> + <Kbd size="sm">B</Kbd> or click the menu icon.
        </p>

        <p class="text-sm">
          Tip: Hold <Kbd size="sm">Shift</Kbd> while clicking to select multiple items.
        </p>
      </CardContent>
    </Card>
  </section>
</div>
