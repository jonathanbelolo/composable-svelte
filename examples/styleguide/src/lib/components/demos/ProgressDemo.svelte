<script lang="ts">
  import { Progress } from '@composable-svelte/core/components/ui/progress/index.js';
  import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@composable-svelte/core/components/ui/card/index.js';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';

  let progress = $state(0);
  let uploadProgress = $state(45);
  let downloadProgress = $state(78);

  function startProgress() {
    progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      if (progress >= 100) {
        clearInterval(interval);
      }
    }, 200);
  }
</script>

<div class="space-y-12">
  <!-- Basic Progress -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Progress Bars</h3>
      <p class="text-muted-foreground text-sm">
        Show progress with different values
      </p>
    </div>

    <Card>
      <CardContent class="pt-6 space-y-6">
        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span>0%</span>
            <span class="text-muted-foreground">Just started</span>
          </div>
          <Progress value={0} />
        </div>

        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span>25%</span>
            <span class="text-muted-foreground">Quarter complete</span>
          </div>
          <Progress value={25} />
        </div>

        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span>50%</span>
            <span class="text-muted-foreground">Halfway there</span>
          </div>
          <Progress value={50} />
        </div>

        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span>75%</span>
            <span class="text-muted-foreground">Almost done</span>
          </div>
          <Progress value={75} />
        </div>

        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span>100%</span>
            <span class="text-muted-foreground">Complete!</span>
          </div>
          <Progress value={100} />
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Interactive Progress -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Progress</h3>
      <p class="text-muted-foreground text-sm">
        Animated progress demonstration
      </p>
    </div>

    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>File Upload</CardTitle>
            <CardDescription>Watch the progress update</CardDescription>
          </div>
          <Button onclick={startProgress} disabled={progress > 0 && progress < 100}>
            {progress === 0 ? 'Start' : progress === 100 ? 'Reset' : 'In Progress...'}
          </Button>
        </div>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <div class="flex justify-between text-sm">
            <span class="font-medium">Uploading...</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>

        {#if progress === 100}
          <div class="flex items-center gap-2 text-sm text-green-600">
            <span>✓</span>
            <span>Upload complete!</span>
          </div>
        {/if}
      </CardContent>
    </Card>
  </section>

  <!-- Custom Sizes -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Custom Sizes</h3>
      <p class="text-muted-foreground text-sm">
        Progress bars in different heights
      </p>
    </div>

    <Card>
      <CardContent class="pt-6 space-y-6">
        <div class="space-y-2">
          <span class="text-xs text-muted-foreground">Extra Small (h-1)</span>
          <Progress value={60} class="h-1" />
        </div>

        <div class="space-y-2">
          <span class="text-xs text-muted-foreground">Small (h-2)</span>
          <Progress value={60} class="h-2" />
        </div>

        <div class="space-y-2">
          <span class="text-xs text-muted-foreground">Default (h-4)</span>
          <Progress value={60} />
        </div>

        <div class="space-y-2">
          <span class="text-xs text-muted-foreground">Large (h-6)</span>
          <Progress value={60} class="h-6" />
        </div>

        <div class="space-y-2">
          <span class="text-xs text-muted-foreground">Extra Large (h-8)</span>
          <Progress value={60} class="h-8" />
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Custom Colors -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Custom Colors</h3>
      <p class="text-muted-foreground text-sm">
        Different color variants for different states
      </p>
    </div>

    <Card>
      <CardContent class="pt-6 space-y-6">
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">Success</span>
            <Badge variant="success" class="text-[10px]">Complete</Badge>
          </div>
          <Progress value={100} indicatorClass="bg-green-500" />
        </div>

        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">Warning</span>
            <Badge variant="warning" class="text-[10px]">75%</Badge>
          </div>
          <Progress value={75} indicatorClass="bg-yellow-500" />
        </div>

        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">Error</span>
            <Badge variant="destructive" class="text-[10px]">Failed</Badge>
          </div>
          <Progress value={45} indicatorClass="bg-red-500" />
        </div>

        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">Info</span>
            <Badge variant="default" class="text-[10px]">Processing</Badge>
          </div>
          <Progress value={30} indicatorClass="bg-blue-500" />
        </div>

        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium">Gradient</span>
            <Badge variant="secondary" class="text-[10px]">Syncing</Badge>
          </div>
          <Progress value={60} indicatorClass="bg-gradient-to-r from-purple-500 to-pink-500" />
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Practical Examples -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Practical Examples</h3>
      <p class="text-muted-foreground text-sm">
        Real-world usage scenarios
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- File Upload -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">File Upload Status</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-2">
            <div class="flex justify-between text-sm">
              <span>document.pdf</span>
              <span class="text-muted-foreground">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} class="h-2" />
            <p class="text-xs text-muted-foreground">2.4 MB of 5.3 MB</p>
          </div>

          <div class="space-y-2">
            <div class="flex justify-between text-sm">
              <span>image.png</span>
              <span class="text-green-600">Complete</span>
            </div>
            <Progress value={100} class="h-2" indicatorClass="bg-green-500" />
            <p class="text-xs text-muted-foreground">1.8 MB uploaded</p>
          </div>

          <div class="space-y-2">
            <div class="flex justify-between text-sm">
              <span>video.mp4</span>
              <span class="text-muted-foreground">12%</span>
            </div>
            <Progress value={12} class="h-2" />
            <p class="text-xs text-muted-foreground">15.2 MB of 124.7 MB</p>
          </div>
        </CardContent>
      </Card>

      <!-- Download Progress -->
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Download Progress</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-3">
            <div class="flex items-center gap-3">
              <div class="text-3xl">📥</div>
              <div class="flex-1">
                <p class="text-sm font-medium">Update Package v2.4.1</p>
                <p class="text-xs text-muted-foreground">234 MB</p>
              </div>
            </div>

            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span>Downloading...</span>
                <span>{downloadProgress}%</span>
              </div>
              <Progress value={downloadProgress} />
              <div class="flex justify-between text-xs text-muted-foreground">
                <span>182 MB of 234 MB</span>
                <span>~2 min remaining</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>

  <!-- Steps/Wizard Progress -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Multi-Step Progress</h3>
      <p class="text-muted-foreground text-sm">
        Track progress through multi-step processes
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>Setup Wizard</CardTitle>
        <CardDescription>Complete all steps to finish setup</CardDescription>
      </CardHeader>
      <CardContent class="space-y-6">
        <!-- Overall Progress -->
        <div class="space-y-2">
          <div class="flex justify-between text-sm font-medium">
            <span>Overall Progress</span>
            <span>Step 2 of 4 (50%)</span>
          </div>
          <Progress value={50} class="h-3" />
        </div>

        <!-- Individual Steps -->
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-green-500 text-white text-sm font-medium">
              ✓
            </div>
            <div class="flex-1">
              <p class="text-sm font-medium">Account Created</p>
              <Progress value={100} class="h-1 mt-1" indicatorClass="bg-green-500" />
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-medium">
              2
            </div>
            <div class="flex-1">
              <p class="text-sm font-medium">Profile Setup (In Progress)</p>
              <Progress value={60} class="h-1 mt-1" />
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground text-sm font-medium">
              3
            </div>
            <div class="flex-1">
              <p class="text-sm font-medium text-muted-foreground">Payment Method</p>
              <Progress value={0} class="h-1 mt-1" />
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-muted-foreground text-sm font-medium">
              4
            </div>
            <div class="flex-1">
              <p class="text-sm font-medium text-muted-foreground">Confirmation</p>
              <Progress value={0} class="h-1 mt-1" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  </section>

  <!-- Storage/Quota Progress -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Storage & Quota</h3>
      <p class="text-muted-foreground text-sm">
        Visualize storage usage and limits
      </p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle class="text-sm">Storage Usage</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-2">
            <div class="flex justify-between text-sm">
              <span class="font-medium">Used Storage</span>
              <span>7.5 GB of 10 GB</span>
            </div>
            <Progress value={75} indicatorClass="bg-orange-500" />
            <p class="text-xs text-muted-foreground">You're using 75% of your storage</p>
          </div>

          <div class="grid grid-cols-3 gap-3 text-center text-xs pt-2 border-t">
            <div>
              <p class="text-muted-foreground">Documents</p>
              <p class="font-medium">2.1 GB</p>
            </div>
            <div>
              <p class="text-muted-foreground">Photos</p>
              <p class="font-medium">4.2 GB</p>
            </div>
            <div>
              <p class="text-muted-foreground">Other</p>
              <p class="font-medium">1.2 GB</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle class="text-sm">API Rate Limit</CardTitle>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="space-y-2">
            <div class="flex justify-between text-sm">
              <span class="font-medium">Requests Used</span>
              <span>950 of 1,000</span>
            </div>
            <Progress value={95} indicatorClass="bg-red-500" />
            <p class="text-xs text-destructive">⚠ Approaching rate limit</p>
          </div>

          <div class="text-xs text-muted-foreground pt-2 border-t">
            <p>Resets in 2 hours 15 minutes</p>
            <p class="mt-1">Upgrade for higher limits</p>
          </div>
        </CardContent>
      </Card>
    </div>
  </section>
</div>
