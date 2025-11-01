# Missing Component Demos - Style Guide TODO

This document tracks components that exist in the codebase but don't yet have demos in the style guide.

**Last Updated:** 2025-11-01
**Total Missing:** 17 components + 1 non-existent component

---

## Current Style Guide Status

✅ **Completed (29/32 registered components have demos)**

❌ **Incomplete:**
- **Scroll Area** - Listed in registry but component doesn't exist in codebase
  - **Action:** Remove from registry OR implement the component

---

## Components to Add to Style Guide (17 total)

### 🔴 High Priority (6 components)
Essential user-facing components commonly needed in applications.

- [ ] **Accordion** (`packages/core/src/components/ui/accordion/`)
  - Category: Data Display
  - Description: Collapsible sections for organizing content
  - Use cases: FAQs, settings panels, content organization

- [ ] **Combobox** (`packages/core/src/components/ui/combobox/`)
  - Category: Form Components Advanced
  - Description: Searchable dropdown with autocomplete
  - Use cases: Searchable selects, command palettes, filters

- [ ] **Calendar** (`packages/core/src/components/ui/calendar/`)
  - Category: Form Components Advanced
  - Description: Date picker/calendar component
  - Use cases: Date selection, scheduling, booking forms

- [ ] **File Upload** (`packages/core/src/components/ui/file-upload/`)
  - Category: Form Components Advanced
  - Description: File selection and upload interface
  - Use cases: Avatar upload, document upload, media galleries

- [ ] **Pagination** (`packages/core/src/components/ui/pagination/`)
  - Category: Data Display
  - Description: Page navigation controls
  - Use cases: Data tables, search results, blog posts

- [ ] **Collapsible** (`packages/core/src/components/ui/collapsible/`)
  - Category: Data Display
  - Description: Expandable/collapsible content sections
  - Use cases: Show more/less, expandable lists, details panels

---

### 🟡 Medium Priority (6 components)
Nice-to-have components that enhance user experience.

- [ ] **Carousel** (`packages/core/src/components/ui/carousel/`)
  - Category: Data Display
  - Description: Image/content slider with navigation
  - Use cases: Image galleries, testimonials, feature showcases

- [ ] **Tree View** (`packages/core/src/components/ui/tree-view/`)
  - Category: Data Display
  - Description: Hierarchical tree structure display
  - Use cases: File systems, org charts, nested navigation

- [ ] **Button Group** (`packages/core/src/components/ui/button-group/`)
  - Category: Foundational Components
  - Description: Grouped buttons with shared styling
  - Use cases: Toolbar buttons, segmented controls, toggle groups

- [ ] **Icon Button** (`packages/core/src/components/ui/icon-button/`)
  - Category: Foundational Components
  - Description: Button with icon only (no text)
  - Use cases: Toolbars, compact actions, mobile interfaces

- [ ] **Banner** (`packages/core/src/components/ui/banner/`)
  - Category: Layout
  - Description: Notification/announcement banner
  - Use cases: Site-wide notices, cookie consent, updates

- [ ] **Empty** (`packages/core/src/components/ui/empty/`)
  - Category: Data Display
  - Description: Empty state placeholder
  - Use cases: No results, empty lists, onboarding

---

### 🟢 Low Priority (5 components)
Utility and typography components (less demo-worthy or redundant with existing components).

- [ ] **Heading** (`packages/core/src/components/ui/heading/`)
  - Category: Typography
  - Description: Semantic heading component
  - Use cases: Page titles, section headers
  - Note: May be simple wrapper, limited demo value

- [ ] **Text** (`packages/core/src/components/ui/text/`)
  - Category: Typography
  - Description: Text component with variants
  - Use cases: Body text, captions, labels
  - Note: May be simple wrapper, limited demo value

- [ ] **Kbd** (`packages/core/src/components/ui/kbd/`)
  - Category: Typography
  - Description: Keyboard shortcut display
  - Use cases: Keyboard shortcuts, command hints

- [ ] **Box** (`packages/core/src/components/ui/box/`)
  - Category: Layout
  - Description: Generic container component
  - Use cases: Layout boxes, containers
  - Note: Similar to Card, may have limited unique value

- [ ] **Panel** (`packages/core/src/components/ui/panel/`)
  - Category: Layout
  - Description: Content panel container
  - Use cases: Sidebar panels, content sections
  - Note: Similar to Card, may have limited unique value

---

## Implementation Plan

### Phase 1: Complete Current Registry
**Goal:** Handle the Scroll Area issue
- [ ] Decision: Remove Scroll Area from registry OR implement the component
- [ ] Update component-registry.ts accordingly

### Phase 2: High Priority Components (Recommended Next)
**Goal:** Add 6 most valuable components
- [ ] Add Accordion, Combobox, Calendar, File Upload, Pagination, Collapsible
- [ ] Update component-registry.ts with new categories
- [ ] Create comprehensive demos for each
- [ ] Estimated effort: 2-3 days

### Phase 3: Medium Priority Components
**Goal:** Enhance the style guide with nice-to-have components
- [ ] Add Carousel, Tree View, Button Group, Icon Button, Banner, Empty
- [ ] Estimated effort: 1-2 days

### Phase 4: Low Priority Components (Optional)
**Goal:** Complete coverage (if valuable)
- [ ] Evaluate if Heading/Text/Kbd/Box/Panel demos add value
- [ ] Implement only if they showcase unique patterns
- [ ] Estimated effort: 0.5-1 day

---

## New Categories Needed

The following categories exist in the registry but have no components yet:

1. **Form Components Advanced** - For Combobox, Calendar, File Upload
2. **Data Display** - For Accordion, Carousel, Collapsible, Tree View, Pagination, Empty
3. **Typography** - For Heading, Text, Kbd
4. **Layout** - For Box, Panel, Banner

---

## Notes

- **Total Components in Codebase:** 37
- **Currently in Style Guide:** 29 demos (32 registered, 1 missing component)
- **Remaining to Add:** 17 components
- **Progress:** 62% complete (29/46 actual components showcased)

---

## Quick Reference

### Components by Category (Existing Codebase)

**Navigation Components (10):** ✅ All complete
- Modal, Sheet, Drawer, Sidebar, Alert, Popover, Dropdown Menu, Tabs, Navigation Stack, Breadcrumb

**Form System - Basic (9):** ✅ All complete
- Form, Input, Label, Checkbox, Radio Group, Switch, Textarea, Select, Slider

**Form System - Advanced (3):** ❌ None complete
- Combobox, Calendar, File Upload

**Foundational Components (10):** ✅ 8/10 complete
- ✅ Button, Card, Separator, Badge, Avatar, Tooltip, Skeleton, Aspect Ratio
- ❌ Button Group, Icon Button

**Data Display (7):** ❌ None complete
- Accordion, Carousel, Collapsible, Tree View, Pagination, Empty, ~~Scroll Area (doesn't exist)~~

**Typography (3):** ❌ None complete
- Heading, Text, Kbd

**Visual Feedback (3):** ✅ All complete
- Toast, Progress, Spinner

**Layout (3):** ❌ None complete
- Box, Panel, Banner
