<script lang="ts">
  import { Banner, BannerTitle, BannerDescription } from '@composable-svelte/core/components/ui/banner/index.js';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';
</script>

<div class="space-y-12">
  <!-- Basic Variants -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Banner Variants</h3>
      <p class="text-muted-foreground text-sm">
        Different banner styles for various message types
      </p>
    </div>

    <div class="space-y-4">
      <Banner variant="default">
        <BannerTitle>Default Banner</BannerTitle>
        <BannerDescription>This is a standard informational banner.</BannerDescription>
      </Banner>

      <Banner variant="success">
        <BannerTitle>Success!</BannerTitle>
        <BannerDescription>Your changes have been saved successfully.</BannerDescription>
      </Banner>

      <Banner variant="warning">
        <BannerTitle>Warning</BannerTitle>
        <BannerDescription>Please review your settings before continuing.</BannerDescription>
      </Banner>

      <Banner variant="destructive">
        <BannerTitle>Error</BannerTitle>
        <BannerDescription>Something went wrong. Please try again.</BannerDescription>
      </Banner>
    </div>
  </section>

  <!-- With Actions -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">With Action Buttons</h3>
      <p class="text-muted-foreground text-sm">
        Banners can include action buttons
      </p>
    </div>

    <div class="space-y-4">
      <Banner variant="success">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <BannerTitle>Update Available</BannerTitle>
            <BannerDescription>A new version is available with bug fixes and improvements.</BannerDescription>
          </div>
          <div class="flex gap-2 shrink-0">
            <Button variant="outline" size="sm">Later</Button>
            <Button size="sm">Update Now</Button>
          </div>
        </div>
      </Banner>

      <Banner variant="warning">
        <div class="flex items-center justify-between gap-4">
          <div>
            <BannerTitle>Trial Ending Soon</BannerTitle>
            <BannerDescription>Your trial ends in 3 days. Upgrade to continue using premium features.</BannerDescription>
          </div>
          <Button size="sm">Upgrade</Button>
        </div>
      </Banner>
    </div>
  </section>

  <!-- Use Cases -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Common Use Cases</h3>
      <p class="text-muted-foreground text-sm">
        Real-world banner examples
      </p>
    </div>

    <div class="space-y-4">
      <Banner>
        <div class="flex items-start gap-3">
          <svg class="w-5 h-5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke-width="2"></circle>
            <path d="M12 16v-4M12 8h.01" stroke-width="2" stroke-linecap="round"></path>
          </svg>
          <div class="flex-1">
            <BannerTitle>Maintenance Scheduled</BannerTitle>
            <BannerDescription>System maintenance on Saturday, 2:00 AM - 4:00 AM UTC. Services may be temporarily unavailable.</BannerDescription>
          </div>
        </div>
      </Banner>

      <Banner variant="warning">
        <div class="flex items-start gap-3">
          <svg class="w-5 h-5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" stroke-width="2"></path>
            <path d="M12 9v4M12 17h.01" stroke-width="2" stroke-linecap="round"></path>
          </svg>
          <div class="flex-1">
            <BannerTitle>Cookies Notice</BannerTitle>
            <BannerDescription>We use cookies to enhance your experience. By continuing to visit this site you agree to our use of cookies.</BannerDescription>
            <div class="flex gap-2 mt-3">
              <Button variant="outline" size="sm">Learn More</Button>
              <Button size="sm">Accept</Button>
            </div>
          </div>
        </div>
      </Banner>

      <Banner variant="success">
        <div class="flex items-start gap-3">
          <svg class="w-5 h-5 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke-width="2"></circle>
            <path d="m9 12 2 2 4-4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
          <div class="flex-1">
            <BannerTitle>Payment Successful</BannerTitle>
            <BannerDescription>Your subscription has been activated. Welcome to Premium!</BannerDescription>
          </div>
        </div>
      </Banner>
    </div>
  </section>
</div>
