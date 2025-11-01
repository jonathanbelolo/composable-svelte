<script lang="ts">
  import { Carousel } from '@composable-svelte/core/components/ui/carousel/index.js';
  import type { CarouselSlide } from '@composable-svelte/core/components/ui/carousel/carousel.types.js';
  import { Card, CardContent } from '@composable-svelte/core/components/ui/card/index.js';
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';

  interface Product {
    name: string;
    price: string;
    image: string;
    badge?: string;
  }

  interface Testimonial {
    quote: string;
    author: string;
    role: string;
  }

  interface Feature {
    icon: string;
    title: string;
    description: string;
  }

  // Basic image slides
  const imageSlides: CarouselSlide<{ caption: string; color: string }>[] = [
    { id: 'slide-1', data: { caption: 'Mountain Landscape', color: 'from-blue-500 to-blue-700' } },
    { id: 'slide-2', data: { caption: 'Ocean Sunset', color: 'from-orange-500 to-pink-600' } },
    { id: 'slide-3', data: { caption: 'Forest Path', color: 'from-green-500 to-green-700' } },
    { id: 'slide-4', data: { caption: 'Desert Dunes', color: 'from-yellow-500 to-orange-600' } },
  ];

  // Product showcase slides
  const productSlides: CarouselSlide<Product>[] = [
    {
      id: 'product-1',
      data: {
        name: 'Wireless Headphones',
        price: '$299',
        image: '🎧',
        badge: 'Bestseller',
      },
    },
    {
      id: 'product-2',
      data: {
        name: 'Smart Watch',
        price: '$399',
        image: '⌚',
        badge: 'New',
      },
    },
    {
      id: 'product-3',
      data: {
        name: 'Laptop Stand',
        price: '$79',
        image: '💻',
      },
    },
    {
      id: 'product-4',
      data: {
        name: 'Mechanical Keyboard',
        price: '$159',
        image: '⌨️',
        badge: 'Popular',
      },
    },
  ];

  // Testimonials
  const testimonialSlides: CarouselSlide<Testimonial>[] = [
    {
      id: 'testimonial-1',
      data: {
        quote: 'This library has completely transformed how we build applications. The composable architecture makes our code so much cleaner.',
        author: 'Sarah Johnson',
        role: 'Senior Frontend Developer',
      },
    },
    {
      id: 'testimonial-2',
      data: {
        quote: 'Testing has never been easier. The TestStore API is intuitive and catches bugs before they reach production.',
        author: 'Michael Chen',
        role: 'Tech Lead',
      },
    },
    {
      id: 'testimonial-3',
      data: {
        quote: 'The type safety is incredible. TypeScript catches all my mistakes at compile time, saving hours of debugging.',
        author: 'Emily Rodriguez',
        role: 'Full Stack Engineer',
      },
    },
  ];

  // Feature highlights
  const featureSlides: CarouselSlide<Feature>[] = [
    {
      id: 'feature-1',
      data: {
        icon: '🎯',
        title: 'Type Safety',
        description: 'Full TypeScript support with complete type inference for state, actions, and effects.',
      },
    },
    {
      id: 'feature-2',
      data: {
        icon: '🧪',
        title: 'Testability',
        description: 'Comprehensive testing utilities with TestStore for exhaustive action testing.',
      },
    },
    {
      id: 'feature-3',
      data: {
        icon: '🔧',
        title: 'Composability',
        description: 'Build complex features from simple, reusable reducer pieces.',
      },
    },
    {
      id: 'feature-4',
      data: {
        icon: '⚡',
        title: 'Performance',
        description: 'Optimized for Svelte 5 with efficient reactivity and minimal re-renders.',
      },
    },
  ];

  let currentSlideIndex = $state(0);
  let autoPlayStatus = $state('Stopped');

  function handleSlideChange(index: number) {
    currentSlideIndex = index;
  }

  function handleAutoPlayStart() {
    autoPlayStatus = 'Playing';
  }

  function handleAutoPlayStop() {
    autoPlayStatus = 'Stopped';
  }
</script>

<div class="space-y-12">
  <!-- Basic Carousel -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Carousel</h3>
      <p class="text-muted-foreground text-sm">
        Simple image carousel with navigation and pagination
      </p>
    </div>

    <div class="h-[400px]">
      <Carousel slides={imageSlides} class="h-full rounded-lg overflow-hidden">
        {#snippet children({ slide, index })}
          <div class="h-full w-full bg-gradient-to-br {slide.data?.color} flex items-center justify-center">
            <div class="text-center text-white">
              <div class="text-6xl mb-4">📸</div>
              <h4 class="text-3xl font-bold mb-2">{slide.data?.caption}</h4>
              <p class="text-lg opacity-90">Slide {index + 1}</p>
            </div>
          </div>
        {/snippet}
      </Carousel>
    </div>
  </section>

  <!-- Auto-play Carousel -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Auto-play Carousel</h3>
      <p class="text-muted-foreground text-sm">
        Automatically advances every 3 seconds
      </p>
      <div class="mt-2">
        <Badge variant={autoPlayStatus === 'Playing' ? 'success' : 'default'}>
          {autoPlayStatus}
        </Badge>
      </div>
    </div>

    <div class="h-[300px]">
      <Carousel
        slides={featureSlides}
        autoPlayInterval={3000}
        onAutoPlayStart={handleAutoPlayStart}
        onAutoPlayStop={handleAutoPlayStop}
        class="h-full rounded-lg border bg-card"
      >
        {#snippet children({ slide })}
          <div class="h-full flex flex-col items-center justify-center p-12 text-center">
            <div class="text-6xl mb-6">{slide.data?.icon}</div>
            <h4 class="text-2xl font-bold mb-4">{slide.data?.title}</h4>
            <p class="text-muted-foreground text-lg max-w-md">
              {slide.data?.description}
            </p>
          </div>
        {/snippet}
      </Carousel>
    </div>
  </section>

  <!-- Product Carousel -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Product Showcase</h3>
      <p class="text-muted-foreground text-sm">
        E-commerce product carousel with custom styling
      </p>
    </div>

    <div class="h-[350px]">
      <Carousel
        slides={productSlides}
        loop={true}
        class="h-full rounded-lg"
        slideClass="px-4"
      >
        {#snippet children({ slide })}
          <Card class="h-full mx-auto max-w-md">
            <CardContent class="p-0">
              <div class="flex flex-col h-full">
                <div class="flex-1 flex items-center justify-center bg-muted/30 relative">
                  <div class="text-9xl">{slide.data?.image}</div>
                  {#if slide.data?.badge}
                    <div class="absolute top-4 right-4">
                      <Badge variant="primary">{slide.data.badge}</Badge>
                    </div>
                  {/if}
                </div>
                <div class="p-6 text-center">
                  <h4 class="text-xl font-semibold mb-2">{slide.data?.name}</h4>
                  <p class="text-2xl font-bold text-primary mb-4">{slide.data?.price}</p>
                  <button class="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
                    Add to Cart
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        {/snippet}
      </Carousel>
    </div>
  </section>

  <!-- Testimonials Carousel -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Testimonials</h3>
      <p class="text-muted-foreground text-sm">
        Customer reviews carousel without arrows
      </p>
    </div>

    <div class="h-[300px]">
      <Carousel
        slides={testimonialSlides}
        showArrows={false}
        onSlideChange={handleSlideChange}
        class="h-full"
      >
        {#snippet children({ slide })}
          <div class="h-full flex flex-col items-center justify-center p-12">
            <Card class="max-w-2xl">
              <CardContent class="p-8">
                <div class="text-center space-y-6">
                  <div class="text-4xl text-primary/20">"</div>
                  <p class="text-lg text-muted-foreground italic">
                    {slide.data?.quote}
                  </p>
                  <div class="border-t pt-6">
                    <p class="font-semibold text-lg">{slide.data?.author}</p>
                    <p class="text-sm text-muted-foreground">{slide.data?.role}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        {/snippet}
      </Carousel>
    </div>
    <div class="text-center text-sm text-muted-foreground">
      Currently showing review {currentSlideIndex + 1} of {testimonialSlides.length}
    </div>
  </section>

  <!-- No Loop Carousel -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Non-Looping Carousel</h3>
      <p class="text-muted-foreground text-sm">
        Navigation stops at first and last slides
      </p>
    </div>

    <div class="h-[250px]">
      <Carousel
        slides={imageSlides}
        loop={false}
        initialIndex={0}
        class="h-full rounded-lg overflow-hidden"
      >
        {#snippet children({ slide, index })}
          <div class="h-full w-full bg-gradient-to-br {slide.data?.color} flex items-center justify-center">
            <div class="text-center text-white">
              <h4 class="text-4xl font-bold mb-2">{slide.data?.caption}</h4>
              <p class="text-lg opacity-90">
                Slide {index + 1} of {imageSlides.length}
                {#if index === 0}
                  (First)
                {:else if index === imageSlides.length - 1}
                  (Last)
                {/if}
              </p>
            </div>
          </div>
        {/snippet}
      </Carousel>
    </div>
  </section>

  <!-- Minimal Carousel -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Minimal Carousel</h3>
      <p class="text-muted-foreground text-sm">
        No navigation controls, keyboard only
      </p>
    </div>

    <div class="h-[200px]">
      <Carousel
        slides={featureSlides}
        showArrows={false}
        showDots={false}
        class="h-full rounded-lg border bg-card"
      >
        {#snippet children({ slide })}
          <div class="h-full flex items-center justify-center p-8">
            <div class="text-center">
              <div class="text-5xl mb-3">{slide.data?.icon}</div>
              <h4 class="text-xl font-semibold">{slide.data?.title}</h4>
            </div>
          </div>
        {/snippet}
      </Carousel>
    </div>
    <p class="text-xs text-center text-muted-foreground">
      Use arrow keys (← →) to navigate
    </p>
  </section>
</div>
