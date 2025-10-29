# Product Gallery Redesign Plan
## Visual Transformation Using Phase 6 Component Library

**Status**: Planning Phase
**Goal**: Transform the Product Gallery example into a visually stunning, production-ready e-commerce showcase
**Approach**: Leverage all 72 Phase 6 components to create a best-in-class UI/UX

---

## Current State Analysis

### What We Have Now
**Functional but Basic UI:**
- ✅ Fully functional reducer architecture with tree-based navigation
- ✅ Working Modal, Sheet, Alert, Popover navigation patterns
- ✅ Clean state management with Phase 3 DSL (`integrate()`, `scopeTo()`)
- ✅ 12 sample products with categories, pricing, stock status
- ❌ Minimal styling (basic borders, simple layout)
- ❌ No visual hierarchy or depth
- ❌ Limited use of component library (only navigation components)
- ❌ No animations beyond navigation transitions
- ❌ Plain text buttons and basic category filters
- ❌ No visual polish (shadows, gradients, icons)

### Screenshots Analyzed
1. **Main View** (`product-gallery-current-main.png`):
   - Simple product cards with emoji icons
   - Basic grid layout (4 columns)
   - Plain tabs for Grid/List/Favorites
   - Minimal sidebar with category buttons
   - No search, no filters beyond categories
   - No visual feedback on interactions

2. **Product Detail Modal** (`product-gallery-current-modal.png`):
   - Full-page modal with basic styling
   - Simple button grid for actions
   - Plain text specifications
   - No visual appeal or hierarchy

---

## Design Vision

### Inspiration: Modern E-Commerce Excellence
Think **Vercel**, **Linear**, **Stripe** - clean, elegant, highly polished.

**Core Principles:**
1. **Visual Hierarchy** - Clear focus, scannable layout
2. **Depth & Dimension** - Shadows, gradients, glass morphism
3. **Smooth Interactions** - Micro-animations, state feedback
4. **Information Density** - Rich without clutter
5. **Accessibility** - WCAG AA compliant, keyboard navigation
6. **Performance** - Optimized rendering, smooth 60fps

---

## Component Integration Strategy

### 1. Header & Navigation (TOP PRIORITY)

**Current:**
- Plain "Product Gallery" text
- Basic hamburger menu (mobile only)
- No branding, no utility nav

**Proposed - Premium E-Commerce Header:**

```svelte
<!-- App.svelte - New Header Section -->
<header class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
  <div class="container flex h-16 items-center justify-between px-4">
    <!-- Logo & Brand -->
    <div class="flex items-center gap-2">
      <Button variant="ghost" size="icon" class="lg:hidden" onclick={() => store.dispatch({ type: 'sidebarToggled' })}>
        <span class="text-xl">☰</span>
      </Button>
      <a href="/" class="flex items-center gap-2">
        <span class="text-2xl">🛍️</span>
        <Heading level={1} class="text-xl font-bold">Composable Shop</Heading>
      </a>
    </div>

    <!-- Search Bar (NEW - use Combobox) -->
    <div class="hidden md:flex flex-1 max-w-md mx-8">
      <Combobox
        placeholder="Search products..."
        items={searchResults}
        onSelect={(item) => store.dispatch({ type: 'productClicked', productId: item.id })}
        class="w-full"
      />
    </div>

    <!-- Utility Nav (NEW) -->
    <div class="flex items-center gap-2">
      <!-- Search (Mobile) -->
      <Button variant="ghost" size="icon" class="md:hidden">
        <span class="text-lg">🔍</span>
      </Button>

      <!-- Favorites Badge (with Tooltip) -->
      <Tooltip content={`${favoriteCount} favorites`} delayMs={300}>
        <Button
          variant="ghost"
          size="icon"
          onclick={() => store.dispatch({ type: 'viewModeChanged', mode: 'favorites' })}
          class="relative"
        >
          <span class="text-lg">❤️</span>
          {#if favoriteCount > 0}
            <Badge variant="destructive" class="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
              {favoriteCount}
            </Badge>
          {/if}
        </Button>
      </Tooltip>

      <!-- Cart Badge (with Dropdown Menu) -->
      <DropdownMenu>
        {#snippet trigger()}
          <Button variant="ghost" size="icon" class="relative">
            <span class="text-lg">🛒</span>
            {#if cartTotal > 0}
              <Badge class="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {cartTotal}
              </Badge>
            {/if}
          </Button>
        {/snippet}
        {#snippet content()}
          <!-- Mini cart preview with quick actions -->
          <div class="w-80 p-4">
            {#if cartItems.length === 0}
              <Empty icon="🛒" title="Your cart is empty" description="Add some products to get started" />
            {:else}
              <!-- Cart item list -->
              {#each cartItems.slice(0, 3) as item}
                <div class="flex items-center gap-3 py-2">
                  <span class="text-2xl">{item.product.image}</span>
                  <div class="flex-1">
                    <Text size="sm" weight="medium">{item.product.name}</Text>
                    <Text size="xs" variant="muted">{item.quantity}x {formatPrice(item.product.price)}</Text>
                  </div>
                </div>
              {/each}
              {#if cartItems.length > 3}
                <Text size="xs" variant="muted" class="text-center py-2">
                  +{cartItems.length - 3} more items
                </Text>
              {/if}
              <Separator class="my-2" />
              <Button variant="default" class="w-full">Checkout</Button>
            {/if}
          </div>
        {/snippet}
      </DropdownMenu>

      <!-- Theme Toggle (NEW - use Switch) -->
      <Tooltip content="Toggle theme">
        <Switch checked={isDark} onchange={(checked) => themeManager.set(checked ? 'dark' : 'light')} />
      </Tooltip>
    </div>
  </div>
</header>
```

**Components Used:**
- `Button` (multiple variants: ghost, icon)
- `Heading`
- `Combobox` (search with async filtering)
- `Tooltip` (for badges and icons)
- `Badge` (cart/favorite counts)
- `DropdownMenu` (mini cart preview)
- `Empty` (empty cart state)
- `Text` (typography)
- `Separator`
- `Switch` (theme toggle)

---

### 2. Sidebar - Rich Category Filter

**Current:**
- Plain button list
- Simple selected state
- No visual hierarchy

**Proposed - Advanced Filter Sidebar:**

```svelte
<!-- CategoryFilter.svelte - COMPLETE REDESIGN -->
<div class="flex flex-col h-full p-6 space-y-6 bg-muted/30">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <Heading level={2} size="lg">Filters</Heading>
    {#if selectedCategories.length > 0}
      <Button variant="ghost" size="sm" onclick={handleClearAll}>
        Clear All
      </Button>
    {/if}
  </div>

  <!-- Search within categories (NEW) -->
  <Input
    type="search"
    placeholder="Search categories..."
    bind:value={categorySearch}
    class="w-full"
  />

  <!-- Category Accordion (MAJOR UPGRADE) -->
  <Accordion allowMultiple>
    {#snippet children()}
      <AccordionItem value="categories">
        {#snippet trigger()}
          <AccordionTrigger>
            <div class="flex items-center gap-2">
              <span class="text-lg">📂</span>
              <span class="font-semibold">Categories</span>
              {#if selectedCategories.length > 0}
                <Badge variant="secondary">{selectedCategories.length}</Badge>
              {/if}
            </div>
          </AccordionTrigger>
        {/snippet}
        {#snippet content()}
          <AccordionContent>
            <div class="space-y-2 pl-4">
              {#each filteredCategories as category}
                <button
                  onclick={() => onCategoryToggle(category.id)}
                  class="w-full flex items-center gap-3 p-3 rounded-lg transition-all group
                         {selectedCategories.includes(category.id)
                           ? 'bg-primary text-primary-foreground shadow-sm'
                           : 'hover:bg-accent'}"
                >
                  <span class="text-2xl transition-transform group-hover:scale-110">{category.icon}</span>
                  <div class="flex-1 text-left">
                    <Text size="sm" weight="medium">{category.label}</Text>
                    <Text size="xs" variant="muted">{category.count} items</Text>
                  </div>
                  {#if selectedCategories.includes(category.id)}
                    <span class="text-lg">✓</span>
                  {/if}
                </button>
              {/each}
            </div>
          </AccordionContent>
        {/snippet}
      </AccordionItem>

      <!-- Price Range Filter (NEW) -->
      <AccordionItem value="price">
        {#snippet trigger()}
          <AccordionTrigger>
            <div class="flex items-center gap-2">
              <span class="text-lg">💰</span>
              <span class="font-semibold">Price Range</span>
            </div>
          </AccordionTrigger>
        {/snippet}
        {#snippet content()}
          <AccordionContent>
            <div class="space-y-4 pl-4">
              <div class="flex items-center gap-4">
                <Input type="number" placeholder="Min" value={priceMin} class="w-full" />
                <Separator orientation="horizontal" class="w-4" />
                <Input type="number" placeholder="Max" value={priceMax} class="w-full" />
              </div>
              <Text size="xs" variant="muted">
                Showing products from {formatPrice(priceMin)} to {formatPrice(priceMax)}
              </Text>
            </div>
          </AccordionContent>
        {/snippet}
      </AccordionItem>

      <!-- Stock Status Filter (NEW) -->
      <AccordionItem value="stock">
        {#snippet trigger()}
          <AccordionTrigger>
            <div class="flex items-center gap-2">
              <span class="text-lg">📦</span>
              <span class="font-semibold">Availability</span>
            </div>
          </AccordionTrigger>
        {/snippet}
        {#snippet content()}
          <AccordionContent>
            <div class="space-y-2 pl-4">
              <label class="flex items-center gap-2 p-2 rounded-lg hover:bg-accent cursor-pointer">
                <Checkbox checked={showInStock} onchange={(checked) => showInStock = checked} />
                <Text size="sm">In Stock ({inStockCount})</Text>
              </label>
              <label class="flex items-center gap-2 p-2 rounded-lg hover:bg-accent cursor-pointer">
                <Checkbox checked={showOutOfStock} onchange={(checked) => showOutOfStock = checked} />
                <Text size="sm">Out of Stock ({outOfStockCount})</Text>
              </label>
            </div>
          </AccordionContent>
        {/snippet}
      </AccordionItem>
    {/snippet}
  </Accordion>

  <!-- Active Filters Summary (NEW) -->
  {#if activeFilters.length > 0}
    <Card variant="outline">
      {#snippet children()}
        <CardHeader>
          <CardTitle>Active Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="flex flex-wrap gap-2">
            {#each activeFilters as filter}
              <Badge variant="secondary" class="flex items-center gap-1">
                {filter.label}
                <button onclick={() => removeFilter(filter)} class="ml-1 hover:text-destructive">
                  ✕
                </button>
              </Badge>
            {/each}
          </div>
        </CardContent>
      {/snippet}
    </Card>
  {/if}
</div>
```

**Components Used:**
- `Heading`, `Button`, `Input`, `Badge`, `Text`, `Separator`
- `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`
- `Checkbox`
- `Card`, `CardHeader`, `CardTitle`, `CardContent`

---

### 3. Product Cards - Premium Design

**Current:**
- Basic borders
- No depth or shadows
- Plain emoji icons
- Minimal hover states

**Proposed - Elevated Product Cards:**

```svelte
<!-- ProductCard.svelte - COMPLETE REDESIGN -->
<Card
  class="group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer"
  onclick={onclick}
>
  {#snippet children()}
    <!-- Favorite Badge (Floating) -->
    {#if product.isFavorite}
      <div class="absolute top-3 right-3 z-10">
        <Badge variant="destructive" class="shadow-lg">
          <span class="text-sm">❤️</span>
        </Badge>
      </div>
    {/if}

    <!-- Stock Overlay (if out of stock) -->
    {#if !isInStock(product)}
      <div class="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
        <Badge variant="secondary" class="text-base px-4 py-2">
          Out of Stock
        </Badge>
      </div>
    {/if}

    <!-- Image Section with Gradient Background -->
    <div class="relative h-48 bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center overflow-hidden">
      <!-- Product Image (scaled up) -->
      <div class="text-8xl transition-transform duration-300 group-hover:scale-110">
        {product.image}
      </div>

      <!-- Quick Actions (Hover Overlay) -->
      <div class="absolute inset-0 bg-background/90 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2">
        <Tooltip content="Quick View">
          <Button
            variant="ghost"
            size="icon"
            onclick={(e) => { e.stopPropagation(); handleQuickView(); }}
          >
            <span class="text-xl">👁️</span>
          </Button>
        </Tooltip>
        <Tooltip content="Add to Cart">
          <Button
            variant="default"
            size="icon"
            disabled={!isInStock(product)}
            onclick={(e) => { e.stopPropagation(); handleAddToCart(); }}
          >
            <span class="text-xl">🛒</span>
          </Button>
        </Tooltip>
        <Tooltip content="Toggle Favorite">
          <Button
            variant="ghost"
            size="icon"
            onclick={(e) => { e.stopPropagation(); handleFavoriteToggle(); }}
          >
            <span class="text-xl">{product.isFavorite ? '❤️' : '🤍'}</span>
          </Button>
        </Tooltip>
      </div>
    </div>

    <CardContent class="p-4 space-y-2">
      <!-- Category Badge -->
      <div class="flex items-center gap-2">
        <Badge variant="outline" class="text-xs capitalize">
          {getCategoryIcon(product.category)} {product.category}
        </Badge>
        {#if product.stock < 10 && product.stock > 0}
          <Badge variant="secondary" class="text-xs">
            Only {product.stock} left
          </Badge>
        {/if}
      </div>

      <!-- Product Name -->
      <Heading level={3} size="base" class="line-clamp-2 min-h-[3rem]">
        {product.name}
      </Heading>

      <!-- Product Description (Grid view only) -->
      {#if viewMode === 'grid'}
        <Text size="sm" variant="muted" class="line-clamp-2 min-h-[2.5rem]">
          {product.description}
        </Text>
      {/if}

      <!-- Price & Stock -->
      <div class="flex items-center justify-between pt-2">
        <div>
          <Text size="xl" weight="bold" class="text-primary">
            {formatPrice(product.price)}
          </Text>
          {#if product.stock > 0}
            <div class="flex items-center gap-1 mt-1">
              <span class="w-2 h-2 rounded-full bg-green-500"></span>
              <Text size="xs" variant="muted">In Stock</Text>
            </div>
          {/if}
        </div>

        <!-- Rating (NEW - using Skeleton for now, could add real rating system) -->
        <div class="flex items-center gap-1">
          <span class="text-yellow-500">⭐</span>
          <Text size="sm" weight="medium">4.5</Text>
          <Text size="xs" variant="muted">(24)</Text>
        </div>
      </div>
    </CardContent>
  {/snippet}
</Card>
```

**Components Used:**
- `Card`, `CardContent`
- `Badge` (multiple variants)
- `Button` (with Tooltip)
- `Tooltip`
- `Heading`, `Text`

**Visual Enhancements:**
- Gradient backgrounds
- Hover lift animation (-translate-y-1)
- Shadow elevations (shadow-xl on hover)
- Quick action overlay
- Badge system for status
- Blur effects (backdrop-blur)
- Scale animations on hover

---

### 4. Product List View - DataTable Integration

**Current:**
- Same card design, just stacked vertically
- No sorting, no bulk actions

**Proposed - Premium DataTable View:**

```svelte
<!-- ProductList.svelte - Add DataTable Mode -->
{#if viewMode === 'table'}
  <DataTable
    data={filteredProducts}
    columns={[
      { key: 'image', label: '', width: '60px', sortable: false },
      { key: 'name', label: 'Product', sortable: true },
      { key: 'category', label: 'Category', sortable: true },
      { key: 'price', label: 'Price', sortable: true },
      { key: 'stock', label: 'Stock', sortable: true },
      { key: 'actions', label: '', width: '120px', sortable: false }
    ]}
    pageSize={10}
    class="w-full"
  >
    {#snippet rowCell(product, column)}
      {#if column.key === 'image'}
        <span class="text-3xl">{product.image}</span>
      {:else if column.key === 'name'}
        <div>
          <Text weight="medium">{product.name}</Text>
          {#if product.isFavorite}
            <Badge variant="outline" size="sm" class="ml-2">❤️</Badge>
          {/if}
        </div>
      {:else if column.key === 'category'}
        <Badge variant="outline" class="capitalize">
          {getCategoryIcon(product.category)} {product.category}
        </Badge>
      {:else if column.key === 'price'}
        <Text weight="medium" class="text-primary">{formatPrice(product.price)}</Text>
      {:else if column.key === 'stock'}
        {#if product.stock > 0}
          <Badge variant="success">{product.stock} in stock</Badge>
        {:else}
          <Badge variant="destructive">Out of stock</Badge>
        {/if}
      {:else if column.key === 'actions'}
        <div class="flex items-center gap-1">
          <Tooltip content="View">
            <Button variant="ghost" size="icon" onclick={() => onProductClick(product.id)}>
              👁️
            </Button>
          </Tooltip>
          <Tooltip content="Add to Cart">
            <Button variant="ghost" size="icon" disabled={!isInStock(product)}>
              🛒
            </Button>
          </Tooltip>
        </div>
      {/if}
    {/snippet}
  </DataTable>
{/if}
```

**Components Used:**
- `DataTable`, `DataTableHeader`, `DataTablePagination`
- `Badge`, `Button`, `Tooltip`, `Text`

---

### 5. Product Detail Modal - Sheet-Based Design

**Current:**
- Full-page modal
- Simple button grid
- Basic specs list

**Proposed - Rich Sheet with Tabs:**

```svelte
<!-- ProductDetail.svelte - ENHANCED DESIGN -->
<div class="flex flex-col h-full">
  <!-- Sticky Header with Actions -->
  <div class="sticky top-0 z-10 flex items-center gap-4 px-6 py-4 border-b bg-background/95 backdrop-blur">
    <Button variant="ghost" size="icon" onclick={onBack}>
      <span class="text-xl">←</span>
    </Button>
    <Heading level={1} size="xl" class="flex-1">Product Details</Heading>

    <!-- Header Actions -->
    <div class="flex items-center gap-2">
      <Tooltip content="Share Product">
        <Button variant="ghost" size="icon" onclick={() => store.dispatch({ type: 'shareButtonTapped' })}>
          <span class="text-lg">🔗</span>
        </Button>
      </Tooltip>
      <Tooltip content="Toggle Favorite">
        <Button variant="ghost" size="icon" onclick={() => handleFavoriteToggle()}>
          <span class="text-lg">{product.isFavorite ? '❤️' : '🤍'}</span>
        </Button>
      </Tooltip>
      <DropdownMenu>
        {#snippet trigger()}
          <Button variant="ghost" size="icon">
            <span class="text-lg">⋮</span>
          </Button>
        {/snippet}
        {#snippet content()}
          <div class="w-48">
            <button class="w-full text-left px-4 py-2 hover:bg-accent">Edit Product</button>
            <button class="w-full text-left px-4 py-2 hover:bg-accent text-destructive"
                    onclick={() => store.dispatch({ type: 'deleteButtonTapped' })}>
              Delete Product
            </button>
          </div>
        {/snippet}
      </DropdownMenu>
    </div>
  </div>

  <!-- Scrollable Content -->
  <div class="flex-1 overflow-y-auto">
    <!-- Hero Section with Carousel -->
    <div class="relative h-80 bg-gradient-to-br from-primary/5 to-secondary/5">
      <Carousel autoPlay interval={5000} showIndicators>
        {#snippet children()}
          <!-- Slide 1: Main Image -->
          <div class="flex items-center justify-center h-full">
            <div class="text-9xl">{product.image}</div>
          </div>
          <!-- Slide 2: Alt View (placeholder) -->
          <div class="flex items-center justify-center h-full">
            <div class="text-9xl opacity-75">{product.image}</div>
          </div>
          <!-- Slide 3: Detail View -->
          <div class="flex items-center justify-center h-full">
            <div class="text-7xl">{product.image}</div>
          </div>
        {/snippet}
      </Carousel>

      <!-- Stock Badge (Floating) -->
      <div class="absolute top-4 right-4">
        {#if isInStock(product)}
          <Badge variant="success" class="shadow-lg">
            <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse mr-2"></span>
            In Stock ({product.stock} available)
          </Badge>
        {:else}
          <Badge variant="destructive" class="shadow-lg">Out of Stock</Badge>
        {/if}
      </div>
    </div>

    <!-- Product Info Section -->
    <div class="px-6 py-6 space-y-6">
      <!-- Title & Price Row -->
      <div>
        <div class="flex items-start justify-between gap-4 mb-2">
          <Heading level={2} size="2xl">{product.name}</Heading>
          <div class="text-right">
            <Text size="3xl" weight="bold" class="text-primary">{formatPrice(product.price)}</Text>
            <Text size="sm" variant="muted">Free shipping</Text>
          </div>
        </div>

        <!-- Category & Rating -->
        <div class="flex items-center gap-3">
          <Badge variant="outline" class="capitalize">
            {getCategoryIcon(product.category)} {product.category}
          </Badge>
          <Separator orientation="vertical" class="h-4" />
          <div class="flex items-center gap-1">
            <span class="text-yellow-500">⭐⭐⭐⭐⭐</span>
            <Text size="sm" weight="medium">4.5</Text>
            <Text size="sm" variant="muted">(24 reviews)</Text>
          </div>
        </div>
      </div>

      <Separator />

      <!-- Description -->
      <div>
        <Text size="base" class="leading-relaxed">{product.description}</Text>
      </div>

      <Separator />

      <!-- Tabs for Details -->
      <Tabs value="specifications">
        {#snippet children()}
          <div class="border-b">
            <div class="flex gap-4" role="tablist">
              <button role="tab" class="px-4 py-2 border-b-2 border-primary font-medium">
                Specifications
              </button>
              <button role="tab" class="px-4 py-2 border-b-2 border-transparent text-muted-foreground hover:text-foreground">
                Reviews (24)
              </button>
              <button role="tab" class="px-4 py-2 border-b-2 border-transparent text-muted-foreground hover:text-foreground">
                Shipping & Returns
              </button>
            </div>
          </div>

          <!-- Specifications Tab Content -->
          <div class="py-6">
            <div class="grid grid-cols-2 gap-x-8 gap-y-4">
              {#each Object.entries(product.specs) as [key, value]}
                <div class="flex flex-col gap-1">
                  <Text size="sm" variant="muted">{key}</Text>
                  <Text size="base" weight="medium">{value}</Text>
                </div>
              {/each}
            </div>
          </div>
        {/snippet}
      </Tabs>

      <!-- Related Products (NEW) -->
      <div class="space-y-4">
        <Heading level={3} size="lg">You May Also Like</Heading>
        <div class="grid grid-cols-2 gap-4">
          {#each relatedProducts.slice(0, 4) as related}
            <Card class="cursor-pointer hover:shadow-lg transition-shadow" onclick={() => handleRelatedClick(related.id)}>
              {#snippet children()}
                <CardContent class="p-3">
                  <div class="text-4xl text-center mb-2">{related.image}</div>
                  <Text size="sm" weight="medium" class="line-clamp-1">{related.name}</Text>
                  <Text size="sm" weight="medium" class="text-primary">{formatPrice(related.price)}</Text>
                </CardContent>
              {/snippet}
            </Card>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <!-- Sticky Footer with CTA -->
  <div class="sticky bottom-0 z-10 flex items-center gap-3 px-6 py-4 border-t bg-background/95 backdrop-blur">
    <Button
      variant="outline"
      size="lg"
      class="flex-1"
      onclick={() => store.dispatch({ type: 'quickViewButtonTapped' })}
    >
      <span class="text-lg mr-2">👁️</span>
      Quick View
    </Button>
    <Button
      variant="default"
      size="lg"
      class="flex-[2]"
      disabled={!isInStock(product)}
      onclick={() => store.dispatch({ type: 'addToCartButtonTapped' })}
    >
      <span class="text-lg mr-2">🛒</span>
      Add to Cart - {formatPrice(product.price)}
    </Button>
  </div>
</div>
```

**Components Used:**
- `Button`, `Heading`, `Text`, `Badge`, `Separator`
- `Tooltip`, `DropdownMenu`
- `Carousel` (new - for product images)
- `Tabs` (for organized content)
- `Card`, `CardContent` (for related products)

**Visual Enhancements:**
- Sticky header/footer for persistent actions
- Carousel for multiple product views
- Gradient hero section
- Floating badges with shadows
- Backdrop blur effects
- Related products grid
- Tab-based content organization
- Animated pulse on stock badge

---

### 6. Empty States & Loading

**New Additions:**

```svelte
<!-- Empty State for No Products -->
{#if filteredProducts.length === 0}
  <div class="flex items-center justify-center h-full p-12">
    <Empty
      icon="📦"
      title="No products found"
      description="Try adjusting your filters or search query"
    >
      {#snippet action()}
        <Button variant="default" onclick={handleClearFilters}>
          Clear All Filters
        </Button>
      {/snippet}
    </Empty>
  </div>
{/if}

<!-- Loading State (use Skeleton) -->
{#if isLoading}
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {#each Array(8) as _}
      <Card>
        {#snippet children()}
          <Skeleton class="h-48 w-full" />
          <CardContent class="p-4 space-y-2">
            <Skeleton class="h-4 w-3/4" />
            <Skeleton class="h-4 w-1/2" />
            <Skeleton class="h-6 w-1/4 mt-4" />
          </CardContent>
        {/snippet}
      </Card>
    {/each}
  </div>
{/if}

<!-- Loading Product Detail -->
{#if isLoadingProduct}
  <div class="flex flex-col h-full">
    <Skeleton class="h-16 w-full" /> <!-- Header -->
    <Skeleton class="h-80 w-full" /> <!-- Hero -->
    <div class="flex-1 p-6 space-y-4">
      <Skeleton class="h-8 w-3/4" />
      <Skeleton class="h-4 w-full" />
      <Skeleton class="h-4 w-full" />
      <Skeleton class="h-4 w-2/3" />
    </div>
  </div>
{/if}
```

**Components Used:**
- `Empty`
- `Skeleton`

---

### 7. Toast Notifications

**Add Toast System for Feedback:**

```svelte
<!-- App.svelte - Add Toaster -->
<Toaster position="top-right" />

<!-- Dispatch toasts on actions -->
<script>
  function handleAddToCart() {
    store.dispatch({ type: 'cartItemAdded', productId, quantity: 1 });

    // Show success toast
    addToast({
      type: 'success',
      title: 'Added to cart',
      description: `${product.name} has been added to your cart`,
      duration: 3000
    });
  }

  function handleFavoriteToggle() {
    store.dispatch({ type: 'favoriteToggled', productId });

    addToast({
      type: product.isFavorite ? 'info' : 'success',
      title: product.isFavorite ? 'Removed from favorites' : 'Added to favorites',
      description: product.name,
      duration: 2000
    });
  }

  function handleDelete() {
    store.dispatch({ type: 'productDeleted', productId });

    addToast({
      type: 'destructive',
      title: 'Product deleted',
      description: `${product.name} has been removed`,
      duration: 3000,
      action: {
        label: 'Undo',
        onClick: () => handleUndo()
      }
    });
  }
</script>
```

**Components Used:**
- `Toast`, `Toaster`, `ToastAction`, `ToastTitle`, `ToastDescription`

---

## Implementation Phases

### Phase 1: Foundation (Day 1)
**Goal**: Set up component imports and basic structure

- [ ] Import all necessary components from `@composable-svelte/core`
- [ ] Add theme system to App.svelte
- [ ] Restructure App.svelte with new header
- [ ] Add Toaster component
- [ ] Test basic layout and theme switching

**Files Modified:**
- `App.svelte` - Header restructure
- `lib/styles.css` - Theme enhancements

---

### Phase 2: Header & Navigation (Day 1-2)
**Goal**: Premium header with search and utilities

- [ ] Implement new header with Combobox search
- [ ] Add cart dropdown with DropdownMenu
- [ ] Add favorites badge with Tooltip
- [ ] Add theme toggle with Switch
- [ ] Implement search functionality
- [ ] Add responsive mobile menu

**Files Modified:**
- `App.svelte` - Header section
- `app.reducer.ts` - Add search actions
- `app.types.ts` - Add search state

---

### Phase 3: Sidebar Filters (Day 2)
**Goal**: Rich filter sidebar with Accordion

- [ ] Redesign CategoryFilter with Accordion
- [ ] Add price range inputs
- [ ] Add stock status checkboxes
- [ ] Add active filters summary with Card
- [ ] Implement filter logic in reducer

**Files Modified:**
- `features/category-filter/CategoryFilter.svelte` - Complete redesign
- `app.reducer.ts` - Enhanced filter logic
- `app.types.ts` - Extended filter state

---

### Phase 4: Product Cards (Day 2-3)
**Goal**: Elevated cards with hover states

- [ ] Redesign ProductCard.svelte with Card component
- [ ] Add gradient backgrounds
- [ ] Implement hover overlay with quick actions
- [ ] Add Badge system for categories/stock
- [ ] Add Tooltip to hover actions
- [ ] Implement animations (lift, scale)

**Files Modified:**
- `features/product-list/ProductCard.svelte` - Complete redesign

---

### Phase 5: Product List & Table (Day 3)
**Goal**: Multiple view modes

- [ ] Keep grid/list views
- [ ] Add DataTable view mode
- [ ] Implement sorting controls
- [ ] Add view mode toggle in header
- [ ] Add Empty states
- [ ] Add Skeleton loading states

**Files Modified:**
- `features/product-list/ProductList.svelte` - Add DataTable mode
- `app.types.ts` - Add 'table' to ViewMode

---

### Phase 6: Product Detail (Day 3-4)
**Goal**: Rich sheet with Carousel and Tabs

- [ ] Redesign ProductDetail with sticky header/footer
- [ ] Add Carousel for product images
- [ ] Implement Tabs for specifications/reviews
- [ ] Add related products grid
- [ ] Add floating badges
- [ ] Implement backdrop blur effects

**Files Modified:**
- `features/product-detail/ProductDetail.svelte` - Complete redesign

---

### Phase 7: Toasts & Feedback (Day 4)
**Goal**: User feedback system

- [ ] Integrate Toast system
- [ ] Add success toasts for cart actions
- [ ] Add info toasts for favorites
- [ ] Add destructive toasts for delete
- [ ] Add undo functionality

**Files Modified:**
- `App.svelte` - Add Toaster
- All action handlers - Add toast calls

---

### Phase 8: Polish & Animations (Day 4-5)
**Goal**: Final touches

- [ ] Add micro-animations throughout
- [ ] Test all interactions
- [ ] Verify accessibility (keyboard nav, ARIA)
- [ ] Test dark mode consistency
- [ ] Add loading states everywhere
- [ ] Performance optimization

**Files Modified:**
- All components - Final polish

---

## Component Checklist

### Components to Integrate (35 total)

**Foundation (11):**
- [x] Button (multiple variants)
- [x] Card, CardHeader, CardTitle, CardContent, CardFooter
- [x] Badge
- [x] Heading
- [x] Text
- [x] Separator
- [x] Kbd (for keyboard shortcuts)
- [x] Spinner (loading states)
- [x] Skeleton (loading placeholders)
- [ ] Empty (no results states)
- [ ] Avatar (user profile - optional)

**Form & Input (5):**
- [x] Input
- [x] Label
- [x] Checkbox
- [x] Switch (theme toggle)
- [ ] Radio, RadioGroup (if adding sorting options)

**Navigation & Interaction (8):**
- [x] Tooltip
- [x] DropdownMenu
- [x] Accordion, AccordionItem, AccordionTrigger, AccordionContent
- [x] Tabs (already exists in navigation-components)
- [ ] Pagination (if adding product pagination)
- [ ] TreeView (if adding nested categories)

**Data Display (3):**
- [x] DataTable, DataTableHeader, DataTablePagination
- [ ] Collapsible (expandable product details)

**Feedback (4):**
- [x] Toast, Toaster, ToastAction, ToastTitle, ToastDescription
- [ ] Progress (upload/loading progress)
- [ ] Banner (promotional messages)

**Media (2):**
- [x] Carousel (product images)
- [ ] AspectRatio (consistent image sizing)

**Advanced (2):**
- [x] Combobox (search)
- [ ] Command (quick actions - Cmd+K)

**Already Using (Navigation):**
- [x] Modal
- [x] Sheet
- [x] Alert
- [x] Popover
- [x] Sidebar

---

## Visual Design Tokens

### Color Palette Enhancements
```css
/* Add to lib/styles.css */
:root {
  /* Gradients */
  --gradient-primary: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%);
  --gradient-accent: linear-gradient(135deg, hsl(var(--accent)) 0%, hsl(var(--primary) / 0.2) 100%);

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);

  /* Animations */
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;

  /* Blur */
  --blur-sm: blur(4px);
  --blur-md: blur(8px);
  --blur-lg: blur(16px);
}
```

### Typography Scale
```css
/* Enhanced typography */
.text-3xl {
  font-size: 1.875rem; /* 30px */
  line-height: 2.25rem;
}

.text-4xl {
  font-size: 2.25rem; /* 36px */
  line-height: 2.5rem;
}
```

---

## Success Metrics

### Before vs After Comparison

**Functionality**: ✅ No Regressions
- All existing features must work
- All navigation flows intact
- All reducer logic unchanged
- All tests passing

**Visual Impact**: 🎨 Dramatic Improvement
- **Component Usage**: 5 → 35+ components
- **Visual Depth**: Flat → Layered with shadows/gradients
- **Interactivity**: Basic hovers → Rich animations + micro-interactions
- **Information Density**: Low → High (but not cluttered)
- **Accessibility**: Basic → WCAG AA compliant
- **Polish Score**: 2/10 → 9/10

**Performance**: ⚡ Maintained
- 60fps animations
- <100ms interaction feedback
- Optimized re-renders

---

## Risk Mitigation

### Potential Issues

1. **Over-Engineering Risk**
   - **Risk**: Too many components slow down dev
   - **Mitigation**: Progressive enhancement, ship MVP first

2. **Performance Risk**
   - **Risk**: Too many animations/effects
   - **Mitigation**: Use `will-change`, GPU acceleration, lazy load

3. **Accessibility Risk**
   - **Risk**: Complex interactions break keyboard nav
   - **Mitigation**: Test with keyboard-only, screen readers

4. **Reducer Complexity Risk**
   - **Risk**: Adding features breaks existing logic
   - **Mitigation**: Keep reducer pure, add new actions carefully

---

## Next Steps

1. **Review & Approve Plan** - Get user feedback on design direction
2. **Phase 1 Implementation** - Start with foundation
3. **Iterate & Test** - Build incrementally, test each phase
4. **Polish & Deploy** - Final touches, performance tuning

---

## Appendix: Component Map

### Current Component Usage (5)
```
App.svelte
├── Sidebar (navigation)
├── Modal (navigation)
│   └── ProductDetail
│       ├── Sheet (navigation) x2
│       ├── Modal (navigation)
│       ├── Alert (navigation)
│       └── Popover (navigation)
└── ProductList
    └── ProductCard
```

### Target Component Usage (35+)
```
App.svelte
├── Header (NEW)
│   ├── Button x5
│   ├── Heading
│   ├── Combobox (search)
│   ├── Tooltip x3
│   ├── Badge x2
│   ├── DropdownMenu (cart)
│   │   ├── Empty (empty cart)
│   │   ├── Text
│   │   └── Separator
│   └── Switch (theme)
├── Sidebar
│   └── CategoryFilter (REDESIGNED)
│       ├── Heading
│       ├── Button
│       ├── Input (search)
│       ├── Accordion
│       │   ├── AccordionItem x3
│       │   ├── AccordionTrigger
│       │   └── AccordionContent
│       ├── Checkbox x2
│       ├── Badge
│       ├── Text
│       ├── Separator
│       └── Card (active filters)
│           ├── CardHeader
│           ├── CardTitle
│           └── CardContent
├── ProductList
│   ├── Skeleton (loading)
│   ├── Empty (no results)
│   ├── DataTable (table view)
│   │   ├── DataTableHeader
│   │   └── DataTablePagination
│   └── ProductCard (REDESIGNED)
│       ├── Card
│       ├── CardContent
│       ├── Badge x3
│       ├── Button x3
│       ├── Tooltip x3
│       ├── Heading
│       └── Text x4
├── Modal
│   └── ProductDetail (REDESIGNED)
│       ├── Button x4
│       ├── Heading x3
│       ├── Text x8
│       ├── Badge x4
│       ├── Separator x3
│       ├── Tooltip x2
│       ├── DropdownMenu
│       ├── Carousel
│       ├── Tabs
│       ├── Card x4 (related products)
│       │   └── CardContent
│       ├── Sheet x2
│       ├── Modal
│       └── Alert
└── Toaster (NEW)
    ├── Toast
    ├── ToastAction
    ├── ToastTitle
    └── ToastDescription
```

---

**End of Plan**
