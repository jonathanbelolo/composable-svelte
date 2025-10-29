# Composable Svelte Component Styleguide App - Detailed Plan

**Purpose**: Visual showcase and interactive demo board for all Phase 6 components. This is NOT a documentation site - it's a living style guide where developers can see and interact with every component we've built.

**Inspiration**: shadcn-svelte.com's visual design language, but simplified to pure component showcase.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Visual Design](#3-visual-design)
4. [Component Showcase Structure](#4-component-showcase-structure)
5. [Implementation Phases](#5-implementation-phases)
6. [File Structure](#6-file-structure)
7. [Key Features](#7-key-features)
8. [Testing Strategy](#8-testing-strategy)

---

## 1. Overview

### Goals

1. **Visual Verification**: Every Phase 6 component rendered and interactive
2. **Bug Detection**: Identify issues through real-world usage
3. **Design Validation**: Ensure consistent look and feel across components
4. **Developer Reference**: Quick visual reference for component capabilities
5. **Showcase Value**: Demonstrate Composable Svelte architecture in action
6. **Composition Examples**: Full-page demos showing components working together (like shadcn homepage)

### Non-Goals

- ❌ Installation instructions
- ❌ Usage tutorials
- ❌ Code examples (unless inline with demos)
- ❌ API documentation
- ❌ Multiple framework support docs

### Key Metrics

- **Coverage**: 100% of Phase 6 components showcased (~72 components total)
- **Interactivity**: All interactive components fully functional
- **Performance**: Fast load times, smooth animations
- **Visual Quality**: Polished, production-ready appearance

---

## 2. Architecture

### State Management

```typescript
// Styleguide uses Composable Svelte architecture
interface StyleguideState {
  // Navigation
  currentCategory: ComponentCategory | null;
  currentComponent: string | null;

  // UI State
  sidebarOpen: boolean;
  darkMode: boolean;

  // Component Demo States
  componentStates: Record<string, ComponentDemoState>;
}

type ComponentCategory =
  | 'navigation'      // Modal, Sheet, Drawer, Alert, Popover, Tooltip
  | 'forms'           // All form components
  | 'data-display'    // Table, TreeView, Tabs, Accordion, etc.
  | 'feedback'        // Toast, Progress, Spinner
  | 'layout'          // Card, Separator, etc.
```

### Navigation Flow

```
Home (Component Grid)
  ├─ Click Component Card
  └─→ Component Demo View (Modal or dedicated page)
       ├─ Interactive Demo
       ├─ Variant Showcase
       └─ State Controls
```

**Decision**: Use Modal for quick previews OR dedicated routes for deep dives?
- **Recommendation**: Dedicated routes (`/components/:componentName`) for better sharability

---

## 3. Visual Design

### Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  Header: Logo + "Component Showcase" + Theme Toggle    │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐  ┌─────────────────────────────────┐ │
│  │             │  │                                 │ │
│  │  Sidebar    │  │   Main Content Area            │ │
│  │  (optional) │  │                                 │ │
│  │             │  │   Component Grid or            │ │
│  │  Category   │  │   Component Demo View          │ │
│  │  Filters    │  │                                 │ │
│  │             │  │                                 │ │
│  └─────────────┘  └─────────────────────────────────┘ │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Color Scheme

- Use existing theme from product-gallery (already has dark mode support)
- Primary: Existing blue accent
- Background: Clean white/gray (light), dark gray (dark mode)
- Cards: Subtle shadows, rounded corners

### Typography

- Headings: Bold, clean sans-serif
- Component Names: Large, prominent
- Descriptions: 1-2 sentence summaries (optional)

---

## 4. Component Showcase Structure

### Home Page: Component Grid

Display all components as interactive cards organized by category.

**Card Design**:
```
┌─────────────────────────────┐
│  Icon/Preview               │
│                             │
│  Component Name             │
│  Brief description          │
│                             │
│  [View Demo →]              │
└─────────────────────────────┘
```

**Categories** (collapsible sections):

1. **Navigation Components** (10)
   - Modal
   - Sheet
   - Alert
   - AlertDialog
   - Drawer
   - Popover
   - Tooltip
   - Sidebar
   - Tabs
   - NavigationStack / DestinationRouter

2. **Form System** (7 core + 5 inputs = 12)
   - **Core**: Form, FormField, FormControl, FormItem, FormLabel, FormMessage, FormDescription
   - **Inputs**: Input, Textarea, Checkbox, Radio/RadioGroup, Switch

3. **Form Components (Advanced)** (5)
   - Select
   - Combobox
   - FileUpload
   - Calendar
   - DatePicker (if separate from Calendar)

4. **Data Display** (9)
   - DataTable (with Header, Pagination sub-components)
   - TreeView
   - Accordion (with Item, Trigger, Content)
   - Collapsible (with Trigger, Content)
   - Card (with Header, Title, Description, Content, Footer)
   - Carousel
   - Pagination
   - Command (with Input, List, Group, Item)
   - Toast/Toaster (with Action, Title, Description)

5. **Foundational Components** (9)
   - Button (3 variants: default, with loading, icon-only)
   - Label
   - Spinner
   - Separator
   - Panel
   - Box
   - AspectRatio

6. **Typography** (3)
   - Heading
   - Text
   - Kbd

7. **Visual Feedback** (5)
   - Banner (3 variants)
   - Empty (2 variants)
   - Progress
   - DropdownMenu

8. **Layout** (1)
   - ScrollArea

**Total**: ~72 components (includes variants and sub-components)

### Component Demo Page

Each component gets a dedicated demo page showing:

#### 1. Hero Demo
Large, primary example of the component in action with realistic data.

#### 2. Variants Section
Show different configurations:
- Sizes (if applicable)
- Variants (primary, secondary, destructive, etc.)
- States (default, hover, disabled, error)

#### 3. Interactive Playground
Controls to manipulate component state:
- Buttons to trigger actions
- Checkboxes to toggle props
- Inputs to change content

#### 4. Edge Cases (optional)
- Long text overflow
- Empty states
- Loading states
- Error states

### Composition Demo Pages

Full-page examples showing multiple components working together in realistic, production-ready layouts. These pages demonstrate real-world usage patterns and how components compose naturally.

**Purpose**:
- Show components integrated in complete user interfaces
- Demonstrate state management across multiple components
- Validate that components work well together
- Provide inspiration for developers building their own apps

**Demo Pages** (2-3 examples):

#### 1. Dashboard Example (`/showcase/dashboard`)

**Components Used**:
- Sidebar (navigation)
- Card (stat cards, content containers)
- DataTable (with pagination, sorting)
- Tabs (for switching views)
- DropdownMenu (user menu, action menus)
- Toast (notifications)
- Progress (loading indicators)
- Button (various actions)

**Layout Structure**:
```
┌─────────────────────────────────────────────────────────┐
│  Sidebar  │  Header (breadcrumbs + user menu)          │
│           ├─────────────────────────────────────────────┤
│  Nav      │  Stat Cards (4x cards with metrics)        │
│  Links    │                                             │
│           ├─────────────────────────────────────────────┤
│  - Home   │  Tabs: Overview | Analytics | Reports      │
│  - Users  │  ┌─────────────────────────────────────┐   │
│  - Data   │  │  DataTable                          │   │
│  - Config │  │  - Sortable columns                 │   │
│           │  │  - Row selection                    │   │
│           │  │  - Pagination                       │   │
│           │  └─────────────────────────────────────┘   │
└───────────┴─────────────────────────────────────────────┘
```

**Features**:
- Working state management (navigate tabs, sort table, trigger toasts)
- Realistic data (users, metrics, activities)
- Interactive elements (dropdowns, modals for actions)
- Responsive layout (collapses sidebar on mobile)

#### 2. Settings Page Example (`/showcase/settings`)

**Components Used**:
- Tabs (settings categories: Profile, Account, Preferences, Notifications)
- Form system (complete forms with validation)
- Input, Textarea (text fields)
- Switch (toggle settings)
- Select, Combobox (dropdowns)
- Checkbox, Radio (option groups)
- Separator (visual dividers)
- Button (save, cancel, reset actions)
- Alert (confirmation dialogs)
- Toast (save confirmations)

**Layout Structure**:
```
┌─────────────────────────────────────────────────────────┐
│  Settings                                  [Save] [Cancel]
├─────────────────────────────────────────────────────────┤
│  Tabs: Profile | Account | Preferences | Notifications  │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Profile Settings Form                          │   │
│  │  ──────────────────────────────────────────     │   │
│  │  Name: [Input_______________]                   │   │
│  │  Email: [Input_______________]                  │   │
│  │  Bio: [Textarea_______________                  │   │
│  │        ________________________]                │   │
│  │                                                  │   │
│  │  ──────────────────────────────────────────     │   │
│  │  Preferences                                     │   │
│  │  Theme: [Select: Light/Dark/Auto]               │   │
│  │  Language: [Combobox: English]                  │   │
│  │  [ ] Enable notifications                       │   │
│  │  [●] Email updates    [ ] SMS alerts            │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Features**:
- Complete form system showcase
- Tab navigation with route sync
- Form validation (show errors on submit)
- Unsaved changes warning (Alert dialog)
- Success toast on save

#### 3. (Optional) Landing Page Example (`/showcase/landing`)

**Components Used**:
- Card (feature cards, pricing cards)
- Button (CTAs, various variants)
- Heading, Text (typography)
- Carousel (testimonials or features)
- Accordion (FAQ section)
- Separator (section dividers)
- Banner (announcement bar)
- Modal (sign-up form)

**Layout Structure**:
```
┌─────────────────────────────────────────────────────────┐
│  Banner: "New Feature Released!" [×]                    │
├─────────────────────────────────────────────────────────┤
│  Hero Section                                           │
│  Large Heading + Description + [Get Started] button    │
├─────────────────────────────────────────────────────────┤
│  Features Grid (3x Card components)                     │
│  ┌────────┐  ┌────────┐  ┌────────┐                   │
│  │ Fast   │  │ Simple │  │ Secure │                    │
│  └────────┘  └────────┘  └────────┘                    │
├─────────────────────────────────────────────────────────┤
│  Carousel: Customer Testimonials                        │
├─────────────────────────────────────────────────────────┤
│  Accordion: FAQ                                          │
│  > What is this?                                        │
│  > How does it work?                                    │
│  > Pricing?                                             │
└─────────────────────────────────────────────────────────┘
```

**Features**:
- Marketing-focused composition
- Smooth animations (carousel transitions)
- Interactive FAQ (accordion)
- Modal trigger from CTA buttons

**Navigation**:
- Add "Showcase" section to header/sidebar
- Links: Dashboard | Settings | Landing
- Highlight current page
- Easy navigation back to component grid

**State Management**:
Each composition page has its own Composable Svelte store/reducer managing:
- Form state (Settings page)
- Table data + filters (Dashboard page)
- Modal/Sheet destinations (all pages)
- Toast notifications (all pages)

**Benefits**:
- Validates component integration patterns
- Demonstrates Composable Svelte architecture at scale
- Provides copy-paste examples for developers
- Identifies missing features or API gaps
- Showcases polished, production-ready UI

---

## 5. Implementation Phases

### Phase 1: Foundation (2-3 hours)

**Goal**: Basic app structure with routing

- [ ] Create SvelteKit app structure (`examples/styleguide`)
- [ ] Set up routing (`/`, `/components/:name`)
- [ ] Create base layout (Header + Main)
- [ ] Implement dark mode toggle (reuse from product-gallery)
- [ ] Create StyleguideStore with basic state
- [ ] Add Tailwind CSS configuration

**Deliverables**:
- Working app with home page
- Theme toggle functional
- Basic routing in place

### Phase 2: Component Registry (1-2 hours)

**Goal**: Centralized component metadata

- [ ] Create `component-registry.ts` with all component info
- [ ] Define ComponentMetadata type
- [ ] Organize components by category
- [ ] Add component descriptions
- [ ] Create helper functions for filtering/searching

**Data Structure**:
```typescript
interface ComponentMetadata {
  id: string;                    // 'modal', 'sheet', etc.
  name: string;                  // 'Modal', 'Sheet'
  category: ComponentCategory;
  description: string;           // 1-2 sentences
  hasDemo: boolean;              // Ready for showcase?
  route: string;                 // '/components/modal'
  tags: string[];                // ['navigation', 'overlay', 'animated']
}
```

### Phase 3: Home Page - Component Grid (2-3 hours)

**Goal**: Display all components in organized grid

- [ ] Create ComponentCard.svelte
- [ ] Create CategorySection.svelte (collapsible)
- [ ] Implement grid layout with Tailwind
- [ ] Add filtering by category
- [ ] Add search functionality (optional)
- [ ] Make cards clickable → navigate to demo

**Key Components**:
- `ComponentCard.svelte`: Displays single component info
- `CategorySection.svelte`: Groups components by category
- `ComponentGrid.svelte`: Main grid container

### Phase 4: Demo Page Template (2 hours)

**Goal**: Reusable template for component demos

- [ ] Create `ComponentDemoLayout.svelte`
- [ ] Add sections: Hero, Variants, Playground
- [ ] Create `DemoSection.svelte` (wrapper for each section)
- [ ] Add responsive design
- [ ] Create state controls panel

**Template Structure**:
```svelte
<ComponentDemoLayout {componentName}>
  <HeroDemo>
    <!-- Large primary example -->
  </HeroDemo>

  <VariantsSection>
    <!-- Different configurations -->
  </VariantsSection>

  <PlaygroundSection>
    <!-- Interactive controls -->
  </PlaygroundSection>
</ComponentDemoLayout>
```

### Phase 5: Priority Component Demos (8-10 hours)

**Goal**: Implement demos for high-priority components first

**Priority 1 - Navigation (3-4 hours)**:
- [ ] Modal demo
- [ ] Sheet demo
- [ ] Drawer demo
- [ ] Alert demo
- [ ] Popover demo
- [ ] Tooltip demo

**Priority 2 - Forms (3-4 hours)**:
- [ ] Form demo (complex example)
- [ ] Input variants
- [ ] Checkbox/Radio groups
- [ ] Select/Combobox comparison
- [ ] FileUpload demo
- [ ] DatePicker/Calendar

**Priority 3 - Data Display (2-3 hours)**:
- [ ] Table demo (sortable, filterable)
- [ ] TreeView demo
- [ ] Tabs demo
- [ ] Accordion demo
- [ ] Carousel demo

### Phase 6: Remaining Components (4-5 hours)

- [ ] Toast notifications demo
- [ ] Progress bars
- [ ] Spinner variations
- [ ] TreeView complex example
- [ ] Pagination demo
- [ ] Card layouts
- [ ] Separator examples
- [ ] ScrollArea demo
- [ ] DropdownMenu demo
- [ ] Collapsible sections

### Phase 6.5: Composition Demo Pages (6-8 hours)

**Goal**: Implement full-page composition examples showing components working together

**Dashboard Page** (2-3 hours):
- [ ] Create dashboard layout with Sidebar + content area
- [ ] Implement stat cards (4x Card components with metrics)
- [ ] Add Tabs for view switching (Overview, Analytics, Reports)
- [ ] Build DataTable with realistic data (sortable, paginated)
- [ ] Add DropdownMenu for user menu and actions
- [ ] Integrate Toast notifications (success, error, info)
- [ ] Create dashboard state/reducer/store
- [ ] Make responsive (collapsible sidebar on mobile)

**Settings Page** (2-3 hours):
- [ ] Create settings layout with Tabs (Profile, Account, Preferences, Notifications)
- [ ] Build Profile form (Input, Textarea, Select, Combobox)
- [ ] Add Preferences form (Switch, Checkbox, Radio groups)
- [ ] Implement form validation logic
- [ ] Add unsaved changes detection + Alert dialog
- [ ] Success Toast on save
- [ ] Create settings state/reducer/store
- [ ] Route sync for tab navigation

**Landing Page (Optional)** (2 hours):
- [ ] Hero section with Heading, Text, Button CTAs
- [ ] Feature grid (3x Card components)
- [ ] Carousel for testimonials
- [ ] Accordion for FAQ section
- [ ] Banner component (dismissible)
- [ ] Modal trigger for sign-up form

**Navigation Integration**:
- [ ] Add "Showcase" section to app header/sidebar
- [ ] Add links: Dashboard | Settings | Landing
- [ ] Highlight active showcase page
- [ ] Breadcrumb navigation

### Phase 7: Polish & Testing (3-4 hours)

- [ ] Visual consistency pass (spacing, colors, typography)
- [ ] Animation polish (ensure smooth transitions)
- [ ] Accessibility audit (keyboard navigation, ARIA labels)
- [ ] Responsive design testing (mobile, tablet, desktop)
- [ ] Dark mode verification across all demos
- [ ] Cross-browser testing
- [ ] Performance optimization (lazy loading, code splitting)

### Phase 8: Bug Fixes & Iteration (2-3 hours)

- [ ] Fix issues discovered during demos
- [ ] Refine component APIs based on usage
- [ ] Update component styling for consistency
- [ ] Add missing features identified during showcase
- [ ] Document known issues/limitations

---

## 6. File Structure

```
examples/styleguide/
├── src/
│   ├── routes/
│   │   ├── +page.svelte              # Home: Component grid
│   │   ├── +layout.svelte            # App layout
│   │   ├── components/
│   │   │   ├── [name]/
│   │   │   │   └── +page.svelte      # Component demo page
│   │   ├── showcase/
│   │   │   ├── dashboard/
│   │   │   │   └── +page.svelte      # Dashboard composition demo
│   │   │   ├── settings/
│   │   │   │   └── +page.svelte      # Settings composition demo
│   │   │   └── landing/
│   │   │       └── +page.svelte      # Landing page demo (optional)
│   │
│   ├── lib/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Header.svelte
│   │   │   │   ├── Sidebar.svelte (optional)
│   │   │   ├── showcase/
│   │   │   │   ├── ComponentCard.svelte
│   │   │   │   ├── CategorySection.svelte
│   │   │   │   ├── ComponentGrid.svelte
│   │   │   │   ├── ComponentDemoLayout.svelte
│   │   │   │   ├── DemoSection.svelte
│   │   │   │   ├── VariantShowcase.svelte
│   │   │   │   ├── PlaygroundControls.svelte
│   │   │   ├── demos/
│   │   │   │   ├── ModalDemo.svelte
│   │   │   │   ├── SheetDemo.svelte
│   │   │   │   ├── FormDemo.svelte
│   │   │   │   ├── TableDemo.svelte
│   │   │   │   ├── ... (one per component)
│   │   │
│   │   ├── stores/
│   │   │   ├── styleguide.store.ts
│   │   │   ├── styleguide.reducer.ts
│   │   │   ├── styleguide.types.ts
│   │   │   ├── showcase/
│   │   │   │   ├── dashboard.store.ts
│   │   │   │   ├── dashboard.reducer.ts
│   │   │   │   ├── dashboard.types.ts
│   │   │   │   ├── settings.store.ts
│   │   │   │   ├── settings.reducer.ts
│   │   │   │   └── settings.types.ts
│   │   │
│   │   ├── data/
│   │   │   ├── component-registry.ts   # Component metadata
│   │   │   ├── demo-data.ts            # Shared mock data
│   │   │
│   │   ├── utils/
│   │   │   ├── theme.ts                # Dark mode utilities
│   │   │
│   ├── app.css                         # Global styles
│   ├── app.html
│
├── tailwind.config.js
├── vite.config.ts
├── package.json
└── README.md
```

---

## 7. Key Features

### 1. Component Cards (Home Page)

**Features**:
- Hover effects (scale up, shadow)
- Click → navigate to demo
- Category badges
- Status indicators (if component is WIP)

**Visual States**:
- Default
- Hover
- Active (currently selected)

### 2. Component Demo Pages

**Common Elements**:
- Back button (← Components)
- Component name (large heading)
- Brief description
- Demo sections (Hero, Variants, Playground)

**Demo Sections**:

#### Hero Demo
- Large, realistic example
- Shows component in typical use case
- Working interactions

#### Variants Showcase
- Grid of different configurations
- Side-by-side comparisons
- Labels for each variant

#### Interactive Playground
- Controls panel (checkboxes, buttons, inputs)
- Live preview of component
- State displayed in UI (optional)

### 3. Search & Filter (Optional)

**Search**:
- Search by component name
- Search by tag/keyword
- Fuzzy matching

**Filters**:
- By category
- By tag
- By status (complete, WIP)

### 4. Theme Toggle

- Light/Dark mode switch
- Persists preference (localStorage)
- Smooth transition between themes
- Consistent with product-gallery theme

### 5. Responsive Design

**Breakpoints**:
- Mobile: Single column, stacked layout
- Tablet: 2 columns
- Desktop: 3-4 columns, optional sidebar

### 6. Keyboard Navigation

- Tab through component cards
- Enter to open demo
- Escape to go back
- Arrow keys for navigation (optional)

---

## 8. Testing Strategy

### Visual Testing

**Manual Checks**:
- [ ] Every component renders correctly
- [ ] All interactive elements work
- [ ] Animations are smooth
- [ ] No visual glitches or overlaps
- [ ] Consistent spacing and alignment

**Automated** (future):
- Playwright visual regression tests
- Screenshot comparisons

### Functional Testing

**Per Component Demo**:
- [ ] All interactive elements respond to user input
- [ ] State changes reflect in UI
- [ ] No console errors
- [ ] Proper error handling

**Navigation**:
- [ ] All links work
- [ ] Back button functions correctly
- [ ] Deep linking works (`/components/modal`)
- [ ] 404 page for invalid routes

### Accessibility Testing

**Checks**:
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] ARIA labels present
- [ ] Screen reader friendly
- [ ] Color contrast sufficient

**Tools**:
- axe DevTools
- Lighthouse audit
- Manual keyboard testing

### Performance Testing

**Metrics**:
- Page load time < 2s
- First Contentful Paint < 1s
- Interactive in < 3s
- Smooth 60fps animations

**Optimizations**:
- Lazy load component demos
- Code splitting by route
- Optimize images/assets
- Minimize bundle size

### Cross-Browser Testing

**Browsers**:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

**Devices**:
- Desktop (1920x1080, 1366x768)
- Tablet (iPad, Android)
- Mobile (iPhone, Android)

---

## 9. Component Demo Examples

### Example 1: Modal Demo

```svelte
<!-- /src/routes/components/modal/+page.svelte -->

<script lang="ts">
  import { ComponentDemoLayout, DemoSection } from '$lib/components/showcase';
  import { Modal } from '@composable-svelte/core/navigation-components';
  import { createStore } from '@composable-svelte/core';
  import { modalDemoReducer } from './modal-demo.reducer';

  const store = createStore({ /* ... */ }, modalDemoReducer);
</script>

<ComponentDemoLayout name="Modal">
  <!-- Hero Demo -->
  <DemoSection title="Basic Modal">
    <button onclick={() => store.dispatch({ type: 'openModal' })}>
      Open Modal
    </button>

    <Modal {store}>
      {#snippet children({ store: modalStore })}
        <div class="p-6">
          <h3 class="text-xl font-bold">Modal Title</h3>
          <p>Modal content goes here...</p>
          <button onclick={() => modalStore.dismiss()}>Close</button>
        </div>
      {/snippet}
    </Modal>
  </DemoSection>

  <!-- Variants -->
  <DemoSection title="Sizes">
    <!-- Small, Medium, Large modals -->
  </DemoSection>

  <!-- Playground -->
  <DemoSection title="Playground">
    <PlaygroundControls>
      <Checkbox label="Disable backdrop click" />
      <Checkbox label="Disable escape key" />
      <Select label="Size" options={['sm', 'md', 'lg', 'xl']} />
    </PlaygroundControls>
  </DemoSection>
</ComponentDemoLayout>
```

### Example 2: Form Demo

```svelte
<!-- /src/routes/components/form/+page.svelte -->

<ComponentDemoLayout name="Form">
  <!-- Hero Demo: Complete form -->
  <DemoSection title="Registration Form">
    <Form {store}>
      <!-- Full form with all field types -->
      <!-- Input, Textarea, Checkbox, Radio, Select -->
      <!-- Validation, error states, submit handling -->
    </Form>
  </DemoSection>

  <!-- Variants -->
  <DemoSection title="Field Types">
    <!-- Grid showing each form component -->
  </DemoSection>

  <!-- Edge Cases -->
  <DemoSection title="Validation States">
    <!-- Error, warning, success states -->
  </DemoSection>
</ComponentDemoLayout>
```

### Example 3: Table Demo

```svelte
<ComponentDemoLayout name="Table">
  <!-- Hero: Interactive table with real data -->
  <DemoSection title="User Table">
    <Table {store}>
      <!-- Sortable columns -->
      <!-- Row selection -->
      <!-- Pagination -->
    </Table>
  </DemoSection>

  <!-- Variants -->
  <DemoSection title="Table Styles">
    <!-- Bordered, Striped, Hoverable -->
  </DemoSection>

  <!-- Playground -->
  <DemoSection title="Interactive Controls">
    <!-- Toggle features: sorting, selection, pagination -->
  </DemoSection>
</ComponentDemoLayout>
```

---

## 10. Shared Demo Data

Create reusable mock data for demos:

```typescript
// src/lib/data/demo-data.ts

export const users = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'Admin' },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'User' },
  // ... more users
];

export const products = [
  { id: 1, name: 'Laptop', price: 999, stock: 15, category: 'Electronics' },
  { id: 2, name: 'Mouse', price: 29, stock: 50, category: 'Electronics' },
  // ... more products
];

export const tasks = [
  { id: 1, title: 'Implement feature X', status: 'In Progress', priority: 'High' },
  { id: 2, title: 'Fix bug Y', status: 'Done', priority: 'Medium' },
  // ... more tasks
];

export const treeData = {
  id: 'root',
  label: 'Project Root',
  children: [
    { id: 'src', label: 'src', children: [/* ... */] },
    { id: 'tests', label: 'tests', children: [/* ... */] },
  ]
};
```

---

## 11. Success Criteria

### MVP (Minimum Viable Product)

- [ ] Home page with component grid (all 31 components)
- [ ] At least 15 component demos implemented
- [ ] Navigation components fully showcased (Modal, Sheet, Drawer, Alert, Popover, Tooltip)
- [ ] Form components fully showcased
- [ ] Dark mode toggle working
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] No critical bugs

### Complete Version

- [ ] All 31 components have working demos
- [ ] Every demo shows multiple variants
- [ ] Interactive playgrounds for configurable components
- [ ] Search & filter functionality
- [ ] Smooth animations throughout
- [ ] Accessibility compliant (WCAG AA)
- [ ] Cross-browser tested
- [ ] Performance optimized (Lighthouse score > 90)

### Stretch Goals

- [ ] Code view toggle (show Svelte code for each demo)
- [ ] Export component configurations
- [ ] Share links to specific demos
- [ ] Embed demos in external sites (iframe)
- [ ] Theme customization (beyond light/dark)

---

## 12. Timeline Estimate

**Total Time**: ~34-43 hours (with composition demos)

### Week 1 (Foundation)
- Day 1-2: Phase 1-2 (Foundation + Registry) - 4-5 hours
- Day 3: Phase 3 (Component Grid) - 3 hours
- Day 4: Phase 4 (Demo Template) - 2 hours

### Week 2 (Component Demos)
- Day 5-7: Phase 5 (Priority demos) - 10 hours
- Day 8-9: Phase 6 (Remaining components) - 5 hours

### Week 3 (Composition & Polish)
- Day 10-11: Phase 6.5 (Composition demos: Dashboard + Settings) - 6-8 hours
- Day 12-13: Phase 7 (Polish & Testing) - 4 hours
- Day 14: Phase 8 (Bug fixes) - 3 hours

**Buffer**: +5 hours for unexpected issues

---

## 13. Dependencies

### From @composable-svelte/core

- All navigation components (Modal, Sheet, Drawer, Alert, Popover, Tooltip)
- All form components (11 total)
- All data display components (8 total)
- Feedback components (Toast, Progress, Spinner)
- Layout components (Separator, ScrollArea, DropdownMenu)

### External

- SvelteKit (routing, SSR)
- Tailwind CSS (styling)
- Motion One (animations already in use)

### Shared with product-gallery

- Theme configuration
- Dark mode utilities
- Base Tailwind setup

---

## 14. Notes

### Relationship to product-gallery

- product-gallery: Real-world e-commerce app (domain-specific integration demo)
- styleguide: Component showcase (visual reference + testing + composition examples)

**Both serve different purposes**:
- **product-gallery**: Domain-specific app (e-commerce) showing components in real business context
- **styleguide (component demos)**: Individual component capabilities and variations in isolation
- **styleguide (composition demos)**: Generic UI patterns (dashboard, settings, landing) showing component integration without domain logic

**Complementary value**:
- product-gallery validates components in a specific domain (e-commerce with products, cart, checkout)
- styleguide composition demos validate components in common UI patterns (admin dashboards, settings panels)

### Debugging Benefits

- Visual inspection of all components
- Easy to spot inconsistencies
- Quick manual testing
- Identifies missing features
- Validates design system

### Future Enhancements

- Automated visual regression testing
- Component usage analytics
- Performance benchmarks per component
- A/B testing different variants
- Integration with CI/CD pipeline

---

## 15. Open Questions

1. **Sidebar vs No Sidebar**: Do we want a persistent category sidebar or just the grid view?
   - **Recommendation**: Start without sidebar (cleaner), add later if needed

2. **Component Demo Routes**: Use dynamic route `[name]` or individual routes per component?
   - **Recommendation**: Dynamic route for simplicity

3. **Code Examples**: Show Svelte code alongside demos?
   - **Recommendation**: Phase 2 feature (post-MVP)

4. **Component Status**: Show completion status (✓ Complete, ⚠ WIP, ✗ Not Started)?
   - **Recommendation**: Yes, helpful for tracking progress

5. **Search Implementation**: Client-side or server-side?
   - **Recommendation**: Client-side (simple, fast, no backend needed)

---

## Appendix A: Component Registry Schema

```typescript
export const COMPONENT_REGISTRY: ComponentMetadata[] = [
  // Navigation Components
  {
    id: 'modal',
    name: 'Modal',
    category: 'navigation',
    description: 'Overlay dialog that focuses user attention on specific content',
    hasDemo: true,
    route: '/components/modal',
    tags: ['navigation', 'overlay', 'dialog', 'animated']
  },
  {
    id: 'sheet',
    name: 'Sheet',
    category: 'navigation',
    description: 'Slide-in panel from screen edge for contextual actions',
    hasDemo: true,
    route: '/components/sheet',
    tags: ['navigation', 'overlay', 'slide-in', 'animated']
  },
  // ... (continue for all 31 components)
];
```

---

## Appendix B: Demo Data Examples

See section 10 above for shared demo data structure.

---

## End of Plan

This styleguide app will serve as:
1. ✅ Visual verification of all Phase 6 components
2. ✅ Bug detection through real-world usage
3. ✅ Developer reference for component capabilities
4. ✅ Showcase of Composable Svelte architecture

**Next Step**: Review plan with team, then begin Phase 1 implementation.
