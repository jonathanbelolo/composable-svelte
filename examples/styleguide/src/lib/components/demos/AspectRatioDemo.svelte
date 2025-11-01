<script lang="ts">
  import { AspectRatio } from '@composable-svelte/core/components/ui/aspect-ratio/index.js';
  import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@composable-svelte/core/components/ui/card/index.js';
</script>

<div class="space-y-12">
  <!-- Common Ratios -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Common Aspect Ratios</h3>
      <p class="text-muted-foreground text-sm">
        Standard aspect ratios for media content
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- 16:9 Widescreen -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">16:9 - Widescreen (Default)</CardTitle>
          <CardDescription>Standard for modern video content</CardDescription>
        </CardHeader>
        <CardContent>
          <AspectRatio ratio={16/9}>
            <div class="w-full h-full bg-gradient-to-br from-blue-500 to-purple-500 rounded flex items-center justify-center text-white font-semibold">
              16:9 Ratio
            </div>
          </AspectRatio>
        </CardContent>
      </Card>

      <!-- 4:3 Standard -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">4:3 - Standard</CardTitle>
          <CardDescription>Classic TV and monitor ratio</CardDescription>
        </CardHeader>
        <CardContent>
          <AspectRatio ratio={4/3}>
            <div class="w-full h-full bg-gradient-to-br from-green-500 to-teal-500 rounded flex items-center justify-center text-white font-semibold">
              4:3 Ratio
            </div>
          </AspectRatio>
        </CardContent>
      </Card>

      <!-- 1:1 Square -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">1:1 - Square</CardTitle>
          <CardDescription>Social media posts, Instagram</CardDescription>
        </CardHeader>
        <CardContent>
          <AspectRatio ratio={1}>
            <div class="w-full h-full bg-gradient-to-br from-pink-500 to-rose-500 rounded flex items-center justify-center text-white font-semibold">
              1:1 Ratio
            </div>
          </AspectRatio>
        </CardContent>
      </Card>

      <!-- 21:9 Ultrawide -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">21:9 - Ultrawide</CardTitle>
          <CardDescription>Cinematic, ultrawide monitors</CardDescription>
        </CardHeader>
        <CardContent>
          <AspectRatio ratio={21/9}>
            <div class="w-full h-full bg-gradient-to-br from-orange-500 to-red-500 rounded flex items-center justify-center text-white font-semibold">
              21:9 Ratio
            </div>
          </AspectRatio>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Social Media Ratios -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Social Media Ratios</h3>
      <p class="text-muted-foreground text-sm">
        Optimized for different platforms
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Instagram Post -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Instagram Post (1:1)</CardTitle>
        </CardHeader>
        <CardContent>
          <AspectRatio ratio={1}>
            <div class="w-full h-full bg-gradient-to-br from-purple-400 via-pink-500 to-red-500 rounded flex items-center justify-center text-white font-semibold text-sm">
              Square Post
            </div>
          </AspectRatio>
        </CardContent>
      </Card>

      <!-- Instagram Story -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Instagram Story (9:16)</CardTitle>
        </CardHeader>
        <CardContent>
          <AspectRatio ratio={9/16}>
            <div class="w-full h-full bg-gradient-to-b from-indigo-500 to-purple-600 rounded flex items-center justify-center text-white font-semibold text-sm">
              Vertical Story
            </div>
          </AspectRatio>
        </CardContent>
      </Card>

      <!-- YouTube -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">YouTube (16:9)</CardTitle>
        </CardHeader>
        <CardContent>
          <AspectRatio ratio={16/9}>
            <div class="w-full h-full bg-gradient-to-br from-red-500 to-red-600 rounded flex items-center justify-center text-white font-semibold text-sm">
              YouTube Video
            </div>
          </AspectRatio>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- With Images -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Image Containers</h3>
      <p class="text-muted-foreground text-sm">
        Maintain consistent aspect ratios for images
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {#each [
        { ratio: 1, label: 'Square' },
        { ratio: 16/9, label: 'Landscape' },
        { ratio: 9/16, label: 'Portrait' },
        { ratio: 4/3, label: 'Standard' }
      ] as item}
        <Card>
          <CardContent class="pt-6">
            <AspectRatio ratio={item.ratio}>
              <div class="w-full h-full bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-800 rounded flex items-center justify-center">
                <div class="text-center">
                  <div class="text-4xl mb-2">🖼️</div>
                  <div class="text-sm font-medium text-muted-foreground">{item.label}</div>
                </div>
              </div>
            </AspectRatio>
            <p class="text-xs text-center text-muted-foreground mt-2">
              Ratio: {item.ratio.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      {/each}
    </div>
  </section>

  <!-- Video Embeds -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Video Embed Containers</h3>
      <p class="text-muted-foreground text-sm">
        Perfect for embedding responsive videos
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- Standard Video -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Standard Video Player</CardTitle>
        </CardHeader>
        <CardContent>
          <AspectRatio ratio={16/9}>
            <div class="w-full h-full bg-black rounded flex items-center justify-center">
              <div class="text-center text-white">
                <div class="text-6xl mb-4">▶️</div>
                <p class="text-sm opacity-80">16:9 Video Player</p>
              </div>
            </div>
          </AspectRatio>
        </CardContent>
      </Card>

      <!-- Vertical Video -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Vertical/Mobile Video</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="max-w-xs mx-auto">
            <AspectRatio ratio={9/16}>
              <div class="w-full h-full bg-black rounded flex items-center justify-center">
                <div class="text-center text-white">
                  <div class="text-4xl mb-2">▶️</div>
                  <p class="text-xs opacity-80">9:16 Vertical</p>
                </div>
              </div>
            </AspectRatio>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Product Images -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Product Gallery</h3>
      <p class="text-muted-foreground text-sm">
        Consistent sizing for product images
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Featured Products</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          {#each Array(8) as _, i}
            <div class="space-y-2">
              <AspectRatio ratio={1}>
                <div class="w-full h-full bg-gradient-to-br from-blue-{(i % 3 + 3) * 100} to-purple-{(i % 3 + 4) * 100} rounded-lg flex items-center justify-center">
                  <span class="text-3xl">🛍️</span>
                </div>
              </AspectRatio>
              <div>
                <p class="text-sm font-medium">Product {i + 1}</p>
                <p class="text-xs text-muted-foreground">$29.99</p>
              </div>
            </div>
          {/each}
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Custom Ratios -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Custom Aspect Ratios</h3>
      <p class="text-muted-foreground text-sm">
        Create any aspect ratio you need
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <!-- Golden Ratio -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Golden Ratio (1.618:1)</CardTitle>
          <CardDescription>Phi - naturally pleasing proportion</CardDescription>
        </CardHeader>
        <CardContent>
          <AspectRatio ratio={1.618}>
            <div class="w-full h-full bg-gradient-to-br from-amber-400 to-yellow-600 rounded flex items-center justify-center text-white font-semibold">
              φ = 1.618
            </div>
          </AspectRatio>
        </CardContent>
      </Card>

      <!-- 2:1 Panorama -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">2:1 Panorama</CardTitle>
          <CardDescription>Wide panoramic shots</CardDescription>
        </CardHeader>
        <CardContent>
          <AspectRatio ratio={2}>
            <div class="w-full h-full bg-gradient-to-r from-sky-400 to-blue-500 rounded flex items-center justify-center text-white font-semibold">
              Panorama
            </div>
          </AspectRatio>
        </CardContent>
      </Card>

      <!-- 3:2 -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">3:2 Classic Photo</CardTitle>
          <CardDescription>35mm film photography</CardDescription>
        </CardHeader>
        <CardContent>
          <AspectRatio ratio={3/2}>
            <div class="w-full h-full bg-gradient-to-br from-slate-600 to-slate-800 rounded flex items-center justify-center text-white font-semibold">
              3:2 Photo
            </div>
          </AspectRatio>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Responsive Grid -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Responsive Image Grid</h3>
      <p class="text-muted-foreground text-sm">
        AspectRatio ensures consistent height across different image sizes
      </p>
    </div>

    <Card>
      <CardContent class="pt-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each [
            { ratio: 16/9, color: 'blue', icon: '🌄' },
            { ratio: 1, color: 'green', icon: '🌳' },
            { ratio: 4/3, color: 'purple', icon: '🏔️' },
            { ratio: 16/9, color: 'red', icon: '🌅' },
            { ratio: 1, color: 'yellow', icon: '🌻' },
            { ratio: 4/3, color: 'pink', icon: '🌺' }
          ] as item}
            <AspectRatio ratio={item.ratio}>
              <div class="w-full h-full bg-gradient-to-br from-{item.color}-400 to-{item.color}-600 rounded-lg flex items-center justify-center">
                <span class="text-5xl">{item.icon}</span>
              </div>
            </AspectRatio>
          {/each}
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- With Overlay -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">With Overlays</h3>
      <p class="text-muted-foreground text-sm">
        Add content overlays while maintaining aspect ratio
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardContent class="pt-6">
          <AspectRatio ratio={16/9}>
            <div class="relative w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg overflow-hidden">
              <div class="absolute inset-0 flex flex-col items-center justify-center text-white p-6">
                <h3 class="text-2xl font-bold mb-2">Featured Content</h3>
                <p class="text-sm opacity-90 text-center">
                  This overlay maintains position regardless of container width
                </p>
              </div>
            </div>
          </AspectRatio>
        </CardContent>
      </Card>

      <Card>
        <CardContent class="pt-6">
          <AspectRatio ratio={1}>
            <div class="relative w-full h-full bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg overflow-hidden">
              <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-white">
                <h4 class="font-semibold mb-1">Card Title</h4>
                <p class="text-xs opacity-90">Bottom overlay with gradient</p>
              </div>
            </div>
          </AspectRatio>
        </CardContent>
      </Card>
    </div>
  </section>
</div>
