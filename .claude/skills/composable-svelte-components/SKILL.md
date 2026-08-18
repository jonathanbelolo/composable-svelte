---
name: composable-svelte-components
description: UI component library reference for Composable Svelte. Use when implementing designs, choosing components, styling layouts, or working with shadcn-svelte components. Covers component props, variants, accessibility patterns, visual composition, and when to use which component. For specialized components see composable-svelte-graphics (3D), composable-svelte-code (editors/media), composable-svelte-charts (visualization), composable-svelte-maps (geospatial).
---

# Composable Svelte Components

This skill covers the UI component library for Composable Svelte applications.

**For Specialized Components**: See dedicated skills for graphics (3D), code (editors/media), charts (data viz), and maps (geospatial).

---

## 🚨 COMPLETE IMPORTS REFERENCE — ONLY THESE EXIST 🚨

**This is the authoritative list of every component exported by the library. If a component or subcomponent is not listed here, it DOES NOT EXIST. Do not invent components. Do not assume subcomponents exist based on other libraries.**

### From `@composable-svelte/core/components/ui`

```typescript
// Buttons
import { Button } from '@composable-svelte/core/components/ui';
import { ButtonGroup } from '@composable-svelte/core/components/ui';
import { IconButton } from '@composable-svelte/core/components/ui';

// Form inputs
import { Input } from '@composable-svelte/core/components/ui';
import { Label } from '@composable-svelte/core/components/ui';
import { Textarea } from '@composable-svelte/core/components/ui';
import { Checkbox } from '@composable-svelte/core/components/ui';
import { Radio, RadioGroup } from '@composable-svelte/core/components/ui';
import { Switch } from '@composable-svelte/core/components/ui';
import { Slider } from '@composable-svelte/core/components/ui';
import { Select } from '@composable-svelte/core/components/ui';       // Single component — NO SelectTrigger/SelectContent/SelectItem
import { Combobox } from '@composable-svelte/core/components/ui';

// Display
import { Badge } from '@composable-svelte/core/components/ui';
import { Avatar } from '@composable-svelte/core/components/ui';       // Single component — NO AvatarImage/AvatarFallback
import { Skeleton } from '@composable-svelte/core/components/ui';
import { Progress } from '@composable-svelte/core/components/ui';
import { Spinner } from '@composable-svelte/core/components/ui';
import { Empty } from '@composable-svelte/core/components/ui';

// Card (HAS subcomponents)
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@composable-svelte/core/components/ui';

// Layout
import { Panel } from '@composable-svelte/core/components/ui';
import { Box } from '@composable-svelte/core/components/ui';
import { AspectRatio } from '@composable-svelte/core/components/ui';
import { Separator } from '@composable-svelte/core/components/ui';

// Typography
import { Heading } from '@composable-svelte/core/components/ui';
import { Text } from '@composable-svelte/core/components/ui';
import { Kbd } from '@composable-svelte/core/components/ui';

// Banner (HAS subcomponents)
import { Banner, BannerTitle, BannerDescription } from '@composable-svelte/core/components/ui';

// Breadcrumb (HAS subcomponents)
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis } from '@composable-svelte/core/components/ui';

// Accordion (HAS subcomponents)
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@composable-svelte/core/components/ui';

// Collapsible (HAS subcomponents)
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@composable-svelte/core/components/ui';

// Overlays
import { Tooltip } from '@composable-svelte/core/components/ui';
import { DropdownMenu } from '@composable-svelte/core/components/ui';

// Other
import { Pagination } from '@composable-svelte/core/components/ui';
import { Calendar } from '@composable-svelte/core/components/ui';
import { Carousel } from '@composable-svelte/core/components/ui';
import { TreeView } from '@composable-svelte/core/components/ui';
import { FileUpload } from '@composable-svelte/core/components/ui';
```

### From `@composable-svelte/core/components/data-table`

```typescript
import { DataTable, DataTableHeader, DataTablePagination } from '@composable-svelte/core/components/data-table';
import { createTableReducer, createInitialState } from '@composable-svelte/core/components/data-table';
```

**There is no `Table` component.** For sorting/filtering/pagination use `DataTable`;
for a static list, plain HTML plus Tailwind is fine (see the DataTable section).

### From `@composable-svelte/core/components/form`

```typescript
import { Form, FormField, FormControl, FormItem, FormLabel, FormMessage, FormDescription } from '@composable-svelte/core/components/form';
import { createFormReducer, createInitialFormState } from '@composable-svelte/core/components/form';
```

### From `@composable-svelte/core/components/toast`

```typescript
import { Toaster, Toast, ToastTitle, ToastDescription, ToastAction,
         toastReducer, createInitialToastState } from '@composable-svelte/core/components/toast';
```

### From `@composable-svelte/core/components/command`

```typescript
import { Command, CommandInput, CommandList, CommandGroup, CommandItem } from '@composable-svelte/core/components/command';
```

### From `@composable-svelte/core/components/image-gallery`

```typescript
import { ImageGallery, ImageLightbox } from '@composable-svelte/core/components/image-gallery';
```

### Navigation Components (from `@composable-svelte/core`)

```typescript
import { Modal } from '@composable-svelte/core';
import { Sheet } from '@composable-svelte/core';
import { Alert } from '@composable-svelte/core';
import { Drawer } from '@composable-svelte/core';
import { Popover } from '@composable-svelte/core';
import { Sidebar } from '@composable-svelte/core';
import { Tabs } from '@composable-svelte/core';
import { NavigationStack } from '@composable-svelte/core';
import { AnimatedNavigationStack } from '@composable-svelte/core';
```

### ❌ COMPONENTS THAT DO NOT EXIST

These are commonly hallucinated from other libraries. They are NOT available:

- `Table`, `TableHeader`, `TableRow`, `TableHead`, `TableBody`, `TableCell` — use `DataTable` from `@composable-svelte/core/components/data-table` instead
- `AvatarImage`, `AvatarFallback` — `Avatar` is a single component with `src`, `fallback`, and `alt` props
- `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue` — `Select` is a single component with `options`, `value`, and `onchange` props
- `TabsList`, `TabsTrigger`, `TabsContent` — `Tabs` is a single component from `@composable-svelte/core`
- `RadioGroupItem` — use `Radio` from the `Radio, RadioGroup` export
- `AlertTitle`, `AlertDescription`, `AlertActions` — `Alert` is a navigation component from `@composable-svelte/core`

---

## COMPONENT LIBRARY OVERVIEW

Composable Svelte includes 77 components (68 high-level + 9 primitives) for building modern UIs. All components integrate with the Composable Architecture via props and state management.

**Integration Pattern**:
- Props for configuration (labels, variants, styles)
- State from `$store` (subscription) or `$derived(store.state)` (rune-based) for reactive data
- Dispatch actions for user interactions

**Icons**: Components use inline SVGs for structural icons (chevrons, arrows, checkmarks) — these are not currently configurable via props. For application-level icons, use `lucide-svelte` (the recommended icon library). Verify icon names against https://lucide.dev/icons/ — do NOT guess icon names.

```svelte
import { ChevronDown, Plus, Search } from 'lucide-svelte';
```

Note: The 22 components with hardcoded inline SVGs (accordion chevron, breadcrumb separator, pagination arrows, etc.) cannot currently be swapped for custom icons. This is a known limitation.

**Package Organization**:
- `@composable-svelte/core` - UI components (this skill)
- `@composable-svelte/graphics` - 3D graphics (see composable-svelte-graphics skill)
- `@composable-svelte/code` - Code editors, media players (see composable-svelte-code skill)
- `@composable-svelte/charts` - Data visualization (see composable-svelte-charts skill)
- `@composable-svelte/maps` - Interactive maps (see composable-svelte-maps skill)

---

## 🎨 STYLING SETUP — REQUIRED

**These components ship no scoped CSS.** Every visual style is a Tailwind utility
class (`bg-popover`, `text-muted-foreground`, `border-border`, …). If the consuming
app has no Tailwind pipeline, or Tailwind cannot resolve the theme tokens,
components render unstyled or **transparent** — see-through popovers, dropdowns
and select menus. This is the single most common integration bug.

Two things are required in the consuming app:

1. **Import the library stylesheet once**, at the app entry.
2. **Let Tailwind scan the library**, so its classes are not purged.

**Tailwind v4** — one import does both:

```css
@import 'tailwindcss';
@import '@composable-svelte/core/styles/tailwind.css';
```

**Tailwind v3** — preset plus the exported content glob:

```js
import composableSvelte, { contentGlob } from '@composable-svelte/core/tailwind-preset';
export default {
  presets: [composableSvelte],
  content: ['./src/**/*.{html,js,svelte,ts}', contentGlob]
};
```
```css
@import '@composable-svelte/core/styles/globals.css';
```

`contentGlob` must be listed explicitly — Tailwind v3 does not merge a preset's
own `content`.

Do **not** hand-author `--popover` / `--color-popover` in app CSS to work around a
transparent component, and do not import both `styles/globals.css` and
`styles/theme.css`. Dark mode is the `dark` class on `<html>`.

👉 Full setup, theme overriding and troubleshooting: the **"Styling & Theming"**
section of `packages/core/README.md`. Read it before writing component code in a
new app rather than reconstructing it from memory.

---

## NAVIGATION COMPONENTS

**Purpose**: Overlay-based UI elements for state-driven navigation.

**Integration Pattern**: State-driven open/close via store, dismiss via PresentationAction.

See **composable-svelte-navigation** skill for implementation details. This section provides REFERENCE only.

> ⚠️ These are **NOT** `open` / `onOpenChange` components. Each takes a scoped
> destination store. They render nothing when that store is `null` *and* no
> `presentation` is mid-flight — a non-idle `presentation` keeps them mounted so
> the exit animation can finish (`ModalPrimitive.svelte:88-91`). Any example
> showing `<Modal open={true}>` is wrong.

### Shared props

`Modal`, `Sheet`, `Drawer`, `Alert` and `Popover` share one signature
(`navigation-components/Modal.svelte:16-66`):

- `store: ScopedDestinationStore<State, Action> | null` — **required**; `null` means not presented
- `presentation?: PresentationState<any>` — omit for instant show/hide
- `onPresentationComplete?: () => void`
- `onDismissalComplete?: () => void`
- `springConfig?: Partial<SpringConfig>`
- `unstyled?: boolean`
- `class?: string`
- `backdropClass?: string` — Modal/Sheet/Drawer/Alert only (Popover has no backdrop)
- `disableClickOutside?: boolean`
- `disableEscapeKey?: boolean`

The children snippet receives `{ visible, store }` — plus `height` on Sheet
(`Sheet.svelte:151`) and `side, width` on Drawer (`Drawer.svelte:155`).

**Per-component extras**:

| Component | Extra props |
|---|---|
| `Sheet` | `side?: 'bottom' \| 'left' \| 'right'` (default `'bottom'`), `height?: string` (default `'60vh'`) |
| `Drawer` | `side?: 'left' \| 'right'` (default `'left'`), `width?: string` (default `'320px'`) |
| `Popover` | `style?: string` — caller supplies absolute positioning |
| `Alert` | none |
| `Modal` | none |

```svelte
import { Modal } from '@composable-svelte/core';

{#if detailStore}
  <Modal
    store={detailStore}
    presentation={store.state.presentation}
    onDismissalComplete={() => store.dispatch({
      type: 'presentation', event: { type: 'dismissalCompleted' }
    })}
  >
    {#snippet children({ store: scoped })}
      <ProductDetail store={scoped} onBack={() => scoped.dismiss()} />
    {/snippet}
  </Modal>
{/if}
```

Get the store from `scopeToDestination(...)`; dismiss with `scoped.dismiss()` —
`dismiss()` lives on the *scoped* store, not the parent.

### Tabs

**Props** (`navigation-components/Tabs.svelte:14-29`):
- `store: ScopedDestinationStore<State, Action> | null` — **required**; renders nothing when `null`
- `tabs: string[]` — plain strings, **not** `{ value, label }` objects
- `activeTab: number` — a numeric **index**, not a string key
- `onTabChange: (index: number) => void`
- `unstyled?`, `tabListClass?`, `tabClass?`, `class?`

```svelte
<Tabs
  store={scopedStore}
  tabs={['Overview', 'Analytics', 'Reports']}
  activeTab={store.state.activeTabIndex}
  onTabChange={(index) => store.dispatch({ type: 'tabChanged', index })}
/>
```

See **composable-svelte-navigation** for the full navigation patterns —
scoping, presentation lifecycle and the destination reducers.

---

## FORM COMPONENTS

**Purpose**: User input elements that integrate with Composable Architecture.

**Integration Pattern**: Value from `$store` (subscription) or `$derived(store.state)` (rune-based), dispatch on change, validation state from store.

See **composable-svelte-forms** skill for full patterns.

### Input

Text input field with variants.

**Types** (`components/ui/input/Input.svelte:46`): `'text' | 'email' | 'password' |
'number' | 'tel' | 'url' | 'search'`. `date` and `time` render fine at runtime but
are outside the declared union, so they fail `svelte-check` — use `Calendar` or a
plain `<input type="date">`.

**Props**:
- `type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search'`
- `value?: string | number` — coerced to a number when `type="number"` (`Input.svelte:51`)
- `oninput?: (e: Event & { currentTarget: HTMLInputElement }) => void`
- `placeholder: string` - Placeholder text
- `disabled: boolean` - Disabled state

```typescript
import { Input } from '@composable-svelte/core/components/ui';

<Input
  type="text"
  value={$store.name}
  oninput={(e) => store.dispatch({ type: 'nameChanged', name: e.currentTarget.value })}
  placeholder="Enter name"
  disabled={$store.isSubmitting}
/>

{#if $store.nameError}
  <span class="error">{$store.nameError}</span>
{/if}
```

> ⚠️ None of these take an `onValueChange` / `onCheckedChange` callback. Those
> props do not exist and are silently ignored. See **composable-svelte-forms** →
> INPUT COMPONENT WIRING REFERENCE for the same table in a form context.

### Select

Dropdown selector.

**Props** (`components/ui/select/Select.svelte`):
- `options: SelectOption<T>[]` — `{ value, label, disabled?, description? }`
- `value?: T | T[] | null` — `$bindable`
- `onchange?: (value: T | T[] | null) => void` — **not** `onValueChange`
- `placeholder?`, `searchable?`, `multiple?`, `disabled?`, `class?`

```svelte
import { Select } from '@composable-svelte/core/components/ui';

<Select
  value={store.state.category}
  options={[
    { label: 'Electronics', value: 'electronics' },
    { label: 'Clothing', value: 'clothing' }
  ]}
  onchange={(value) => store.dispatch({ type: 'categoryChanged', category: value })}
  placeholder="Select category"
/>
```

### Checkbox

Boolean toggle. It accepts **no children** (no `children` prop, nothing rendered
for one), so the label must be supplied by the caller.

**Props** (`components/ui/checkbox/Checkbox.svelte:25-37`):
- `checked?: boolean` — `$bindable`
- `indeterminate?: boolean`, `disabled?: boolean`, `class?: string`
- plus arbitrary `<input>` attributes via restProps (this is how you get `onchange`)

```svelte
<label class="flex items-center gap-2">
  <Checkbox
    checked={store.state.agreeToTerms}
    onchange={(e) => store.dispatch({ type: 'toggleTerms', checked: e.currentTarget.checked })}
  />
  <span>I agree to the terms and conditions</span>
</label>
```

### RadioGroup

Mutually exclusive options. **No callback prop exists** — `RadioGroup` declares no
restProps, so anything you pass beyond the props below is dropped. Selection is
captured by an internal handler that assigns to the bindable `value`.

**Props** (`components/ui/radio/RadioGroup.svelte:23-35`):
- `value?: string | null` — `$bindable`; the only way to read the selection
- `name?: string`, `class?: string`, `children`

`Radio` takes `value: string`, `disabled?`, `class?`, children, and throws if used
outside a `RadioGroup`.

```svelte
<script lang="ts">
  let plan = $state(store.state.plan);
  $effect(() => store.dispatch({ type: 'planChanged', plan }));
</script>

<RadioGroup bind:value={plan}>
  <Radio value="free">Free</Radio>
  <Radio value="pro">Pro ($9/mo)</Radio>
</RadioGroup>
```

If you want a pure dispatch flow with no local mirror, use native
`<input type="radio">` instead.

### Switch

Toggle switch.

**Props** (`components/ui/switch/Switch.svelte:27`, `$bindable` at `:43`):
- `checked?: boolean` — `$bindable`
- `disabled?`, `class?`, plus restProps spread onto the `<button>`

There is no `onCheckedChange`. The component defines an internal `onclick` toggle,
but restProps are spread **after** it, so a caller-supplied `onclick` replaces that
handler — which is what makes one-way `checked` + `onclick` keep the store as the
single source of truth.

```svelte
<Switch
  checked={store.state.notifications}
  onclick={() => store.dispatch({ type: 'notificationsToggled' })}
/>
```

### Textarea

Multi-line text input.

**Props**: `value`, `oninput`, `rows`, `placeholder`.

### Combobox

Autocomplete dropdown.

**Props** (`components/ui/combobox/Combobox.svelte`):
- `options?: ComboboxOption<T>[]`
- `value?: T | null` — `$bindable`
- `onchange?: (value: T | null) => void` — **not** `onValueChange`
- `loadOptions?: (query: string) => Promise<ComboboxOption<T>[]>` — async mode; **not** `onSearchChange`
- `debounceDelay?: number` (default 300), `placeholder?`, `disabled?`, `class?`

---

## DATA DISPLAY COMPONENTS

**Purpose**: Display data from store.state, often derived/computed.

**Integration Pattern**: Map from store.state arrays, use $derived for filtering/sorting.

### DataTable

Tabular data display with sorting/filtering/pagination.

**When to use**: Lists of structured data, data grids.

> There is no `Table` component, and `DataTable` has no `data` or `columns` prop.
> It is store-driven; `columns` belongs to `DataTableHeader`.

**Props** (`components/data-table/DataTable.svelte:15-50`):
- `store: Store<TableState<T>, TableAction<T>>` — **required**
- `row: Snippet<[T]>` — **required**
- `header?: Snippet`, `footer?: Snippet`
- `emptyMessage?`, `loadingMessage?`, `class?`, `tableClass?`

```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { DataTable, DataTableHeader, DataTablePagination,
           createTableReducer, createInitialState }
    from '@composable-svelte/core/components/data-table';

  const store = createStore({
    initialState: createInitialState<User>({ initialData: users, pageSize: 10 }),
    reducer: createTableReducer<User>()
  });
</script>

<DataTable {store}>
  {#snippet header()}
    <DataTableHeader {store} columns={[
      { key: 'name', label: 'Name', sortable: true },
      { key: 'email', label: 'Email' }
    ]} />
  {/snippet}
  {#snippet row(user: User)}
    <tr class="border-b">
      <td class="p-4">{user.name}</td>
      <td class="p-4">{user.email}</td>
    </tr>
  {/snippet}
</DataTable>
<DataTablePagination {store} pageSizeOptions={[10, 25, 50]} />
```

Working reference: `examples/data-table/src/App.svelte`.

For simple tables with no sorting, filtering or pagination, plain HTML plus
Tailwind is lighter and perfectly acceptable:

```svelte
<table class="w-full text-sm">
  <thead>
    <tr class="border-b text-left text-muted-foreground">
      <th class="px-4 py-3 font-medium">Name</th>
      <th class="px-4 py-3 font-medium">Email</th>
      <th class="px-4 py-3 font-medium">Status</th>
    </tr>
  </thead>
  <tbody>
    {#each $store.users as user (user.id)}
      <tr class="border-b hover:bg-muted/50">
        <td class="px-4 py-3">{user.name}</td>
        <td class="px-4 py-3">{user.email}</td>
        <td class="px-4 py-3">{user.status}</td>
      </tr>
    {/each}
  </tbody>
</table>
```

### Card

Container for related content with header/footer.

**When to use**: Product cards, user profiles, content previews.

```typescript
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@composable-svelte/core/components/ui';

{#each $store.products as product (product.id)}
  <Card>
    <CardHeader>
      <CardTitle>{product.name}</CardTitle>
      <CardDescription>{product.category}</CardDescription>
    </CardHeader>
    <CardContent>
      <p>${product.price}</p>
      <Button onclick={() => store.dispatch({ type: 'addToCart', productId: product.id })}>
        Add to Cart
      </Button>
    </CardContent>
  </Card>
{/each}
```

### Badge

Small label/tag.

**Variants** (`components/ui/badge/Badge.svelte:5`): `default`, `secondary`, `destructive`, `outline`, `success`, `warning`.

```typescript
import { Badge } from '@composable-svelte/core/components/ui';

<Badge variant={$store.status === 'active' ? 'success' : 'secondary'}>
  {$store.status}
</Badge>
```

### Avatar

User profile image with fallback.

```typescript
import { Avatar } from '@composable-svelte/core/components/ui';

<Avatar
  src={$store.user?.avatarUrl}
  alt={$store.user?.name}
  fallback={$store.user?.initials}
/>
```

---

## FEEDBACK COMPONENTS

**Purpose**: Communicate loading states, errors, and notifications.

**Integration Pattern**: Render based on loading/error/success state from store.

### Toast

Temporary notification.

**When to use**: Success messages, errors, notifications.

> There is no imperative `toast.success()` / `toast.error()` API — the package
> exports no such object. Toasts are reducer-driven: compose `toastReducer` into
> your state and dispatch `toastAdded`.

```svelte
<script lang="ts">
  import { Toaster } from '@composable-svelte/core/components/toast';
</script>

<!-- Controlled: you own the state, you render it -->
<Toaster toasts={store.state.toasts.toasts} position="bottom-right" />
```

```typescript
// In the reducer — toastReducer is composed in via scope()
case 'itemAdded':
  return [
    { ...state, items: [...state.items, action.item] },
    Effect.none()
  ];

// From a component or effect
store.dispatch({
  type: 'toasts',
  action: { type: 'toastAdded', toast: { variant: 'success', description: 'Item added' } }
});
```

Available toast actions: `toastAdded`, `toastDismissed`, `toastAutoDismissed`,
`toastActionClicked`, `allToastsDismissed`, `maxToastsChanged`,
`defaultDurationChanged`, `positionChanged`.

> ⚠️ When you pass the `toasts` prop, `Toaster`'s own dismiss button dispatches to
> its **internal** store and has no visible effect — auto-dismiss must come from
> your composed `toastReducer` (which emits `Effect.afterDelay` →
> `toastAutoDismissed`). Rendering `<Toaster />` with no `toasts` prop uses an
> internal store you cannot dispatch to.

### Progress

Linear progress indicator.

**When to use**: Upload progress, loading progress.

```typescript
import { Progress } from '@composable-svelte/core/components/ui';

{#if $store.uploadProgress !== null}
  <Progress value={$store.uploadProgress} max={100} />
  <p>{$store.uploadProgress}% uploaded</p>
{/if}
```

### Skeleton

Loading placeholder with a pulse animation (`animate-pulse`).

**When to use**: Content placeholders during loading.

```typescript
import { Skeleton } from '@composable-svelte/core/components/ui';

{#if $store.isLoading}
  <Skeleton class="h-4 w-full mb-2" />
  <Skeleton class="h-4 w-3/4 mb-2" />
  <Skeleton class="h-4 w-1/2" />
{:else}
  <p>{$store.content}</p>
{/if}
```

### Spinner

Loading spinner.

**Props** (`components/ui/spinner/Spinner.svelte:22`):
- `size?: 'sm' | 'md' | 'lg'` (default `'md'`) — `'small'`/`'medium'`/`'large'` are
  not valid and produce an unsized spinner
- `class?: string`

```svelte
import { Spinner } from '@composable-svelte/core/components/ui';

{#if store.state.isLoading}
  <Spinner size="lg" />
{/if}
```

---

## LAYOUT COMPONENTS

**Purpose**: Organize UI with expand/collapse, tabs, resizable panels.

**Integration Pattern**: Expanded/active state lives in store, dispatch on user interaction.

### Accordion

Expandable/collapsible sections.

**When to use**: FAQs, collapsible content sections.

> `Accordion` **owns its expansion state internally** — it calls `createStore()`
> itself (`components/ui/accordion/Accordion.svelte:92`). Do not try to drive it
> from your store; observe it with `onExpand` / `onCollapse` instead.

**Props** (`Accordion.svelte:47-77`):
- `items?: AccordionItem[]`, `initialExpandedIds?: string[]`
- `allowMultiple?: boolean`, `collapsible?: boolean`
- `onExpand?: (id: string) => void`, `onCollapse?: (id: string) => void`
- `class?: string`

`AccordionItem` takes `id: string` (**not** `value`), `disabled?`, `class?`.
`AccordionTrigger` takes only `class?` plus children — no `onclick`, no `expanded`.

```svelte
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
  from '@composable-svelte/core/components/ui';

<Accordion
  initialExpandedIds={['faq-1']}
  allowMultiple
  onExpand={(id) => store.dispatch({ type: 'faqExpanded', id })}
>
  {#each store.state.faqItems as item (item.id)}
    <AccordionItem id={item.id}>
      <AccordionTrigger>{item.question}</AccordionTrigger>
      <AccordionContent>{item.answer}</AccordionContent>
    </AccordionItem>
  {/each}
</Accordion>
```

### Collapsible

> 🚫 **Currently unusable from a consumer app.** `Collapsible` requires a
> `store: Store<CollapsibleState, CollapsibleAction>`, but `collapsibleReducer`
> and `createInitialCollapsibleState` are not re-exported from any public entry
> point — `components/ui/index.ts` exposes only the three Svelte components, so
> there is no way to construct the store it needs. It has no `open` /
> `onOpenChange` props.
>
> Use `Accordion` with a single item, or plain markup, until the reducer is
> exported.

---

## SPECIALIZED COMPONENT PACKAGES

For specialized components beyond standard UI, see dedicated skills:

### 3D Graphics
**Skill**: `composable-svelte-graphics`
**Package**: `@composable-svelte/graphics`
**Components**: Scene, Camera, Light, Mesh
**Use cases**: 3D visualizations, WebGPU/WebGL rendering, geometry (box, sphere, cylinder, torus, plane)

### Code & Media
**Skill**: `composable-svelte-code`
**Package**: `@composable-svelte/code`
**Components**: CodeEditor, CodeHighlight, AudioPlayer, VideoEmbed, VoiceInput, NodeCanvas, StreamingChat
**Use cases**: Code editing, syntax highlighting, media playback, voice recognition, visual programming, chat interfaces

### Charts & Data Visualization
**Skill**: `composable-svelte-charts`
**Package**: `@composable-svelte/charts`
**Components**: Chart, ChartPrimitive, ChartTooltip
**Use cases**: Data visualization, interactive charts, statistical plots

### Maps & Geospatial
**Skill**: `composable-svelte-maps`
**Package**: `@composable-svelte/maps`
**Components**: Map, MapPrimitive, GeoJSONLayer, HeatmapLayer, Popup, TileProviderControl
**Use cases**: Interactive maps, geospatial data, location-based features

---

## COMPONENT SELECTION DECISION TREE

### Navigation Components

```
What kind of overlay?
│
├─ Full-screen important action → Modal
├─ Bottom panel (mobile-first) → Sheet
├─ Side panel (navigation/settings) → Drawer
├─ Quick confirmation (yes/no) → Alert
└─ Contextual menu (dropdown) → Popover
```

### Form Components

```
What kind of input?
│
├─ Single line text → Input
├─ Multi-line text → Textarea
├─ Boolean toggle → Checkbox or Switch
├─ One from many options → RadioGroup or Select
├─ Autocomplete/search → Combobox
└─ Date/time → Calendar, or a plain <input type="date"> (Input's type union excludes date/time)
```

### Data Display

```
What kind of data?
│
├─ Tabular data → DataTable
├─ List of items → Cards or List
├─ Status/label → Badge
├─ User profile → Avatar
└─ Metrics/stats → Card with metrics
```

### Feedback

```
What kind of feedback?
│
├─ Loading state → Spinner or Skeleton
├─ Progress indicator → Progress
├─ Success/error notification → Toast
└─ Confirmation needed → Alert
```

---

## CUSTOM COMPONENT GUIDELINES

**Principles for Building Custom Components:**

1. **No `$state` for Application State**: All state that affects behavior or can be tested must be in the store
2. **Dispatch Actions**: User interactions dispatch actions to the store
3. **Read from Store**: Render based on `$store` (subscription) or `$derived(store.state)` (rune-based)
4. **Use `$derived`**: For computed values derived from store state
5. **Props for Configuration**: Static configuration (labels, styles) can be props

**Example Custom Component:**

```svelte
<script lang="ts">
  import type { Store } from '@composable-svelte/core';

  // Runes mode: $props(), not `export let`. Mixing `export let` with $derived
  // is a compile error.
  let {
    store,
    label,
    variant = 'primary'
  }: {
    store: Store<State, Action>;
    label: string;
    variant?: 'primary' | 'secondary';
  } = $props();

  const isDisabled = $derived(store.state.isLoading || store.state.hasErrors);
  const displayText = $derived(
    store.state.count > 0 ? `${label} (${store.state.count})` : label
  );
</script>

<button
  class={variant}
  disabled={isDisabled}
  onclick={() => store.dispatch({ type: 'buttonClicked' })}
>
  {displayText}
</button>
```

---

## ACCESSIBILITY PATTERNS

### Keyboard Navigation

All interactive components support keyboard navigation:
- **Tab**: Move focus between elements
- **Enter/Space**: Activate buttons, toggles
- **Escape**: Close modals, popovers, dropdowns
- **Arrow keys**: Navigate lists, select options

### Screen Reader Support

Components include ARIA attributes:
- `aria-label`: Descriptive labels
- `aria-expanded`: Expanded/collapsed state
- `aria-selected`: Selected state
- `role`: Semantic roles

### Focus Management

Components manage focus:
- Modal traps focus inside dialog
- Popover returns focus to trigger on close
- Forms focus first invalid field on submit

---

## STYLING PATTERNS

### Tailwind Integration

All components use Tailwind CSS classes. Most (51 of them) merge the `class` prop
with their defaults through `cn()` → `tailwind-merge`, so a conflicting class of
yours wins. A few — `Carousel` and `FileUpload` — concatenate the string instead,
so both classes survive and CSS source order decides; use an explicit override or
`!important` there if a conflict matters.

```svelte
<Button class="bg-primary text-primary-foreground hover:bg-primary/90">
  Click me
</Button>
```

Setup (required, and the cause of transparent components when missed) is in
**STYLING SETUP** above.

### Custom Styles

Override with custom CSS:

```svelte
<Card class="custom-card">
  <CardContent>
    ...
  </CardContent>
</Card>

<style>
  .custom-card {
    background: linear-gradient(to right, #667eea 0%, #764ba2 100%);
  }
</style>
```

---

## SUMMARY

This skill covers the component library for Composable Svelte:

1. **Navigation Components**: Modal, Sheet, Drawer, Alert, Popover, Tabs
2. **Form Components**: Input, Select, Checkbox, RadioGroup, Switch, Textarea, Combobox
3. **Data Display**: DataTable, Card, Badge, Avatar
4. **Feedback**: Toast, Progress, Skeleton, Spinner
5. **Layout**: Accordion (Collapsible is not currently usable — see its section)
6. **3D Graphics**: Scene, Camera, Light, Mesh (box, sphere, cylinder, torus, plane)
7. **Component Selection**: Decision trees for choosing components
8. **Custom Components**: Guidelines for building custom components
9. **Accessibility**: Keyboard, screen reader, focus management
10. **Styling**: Tailwind is REQUIRED — see STYLING SETUP

**Remember**: Props for config, state in store, dispatch for interactions.

**The five corrections most worth carrying**:
- `Select` / `Combobox` use `onchange`, never `onValueChange`
- `Checkbox` / `Switch` / `RadioGroup` expose `$bindable` state, not a change callback
  (Checkbox takes native `onchange` via restProps, Switch takes `onclick`; RadioGroup takes neither)
- Navigation components take `store`, never `open` / `onOpenChange`
- `Tabs` takes `tabs: string[]` and a numeric `activeTab`
- There is no `Table` component and no imperative `toast.*` API

For navigation implementation, see **composable-svelte-navigation** skill.
For form integration, see **composable-svelte-forms** skill.
For core architecture, see **composable-svelte-core** skill.
For testing components, see **composable-svelte-testing** skill.
