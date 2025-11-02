# Phase 6: Component Library - Implementation TODO

**Strategy**: Foundation-First Hybrid (Vertical Slices)
**Timeline**: 5 weeks
**Status**: In Progress - Week 4 Complete → Starting Week 5 (Advanced Components) 🎯

---

## Progress Tracking

- [x] **Week 1, Day 1**: Infrastructure & Theme System ✅
- [x] **Week 1, Day 2**: Foundational Atomic Components ✅
- [x] **Week 1, Day 3-5**: Form System (Reducer, Types, Zod Integration) ✅
- [x] **Week 2, Day 1**: Form UI Components ✅
- [x] **Week 2, Day 2**: Form Atomic Inputs ✅
- [x] **Week 2, Day 3**: Integrated Form Example (Browser Tested) ✅
- [x] **Week 2, Day 4**: Form Examples (Contact, Registration, Multi-Step) ✅
- [x] **Week 2, Day 5**: Remaining Atomic Components ✅
- [x] **Week 3, Day 1-2**: DataTable System (Reducer, Components, Example) ✅
- [x] **Week 3, Day 3**: Tooltip Component (State-Driven with TestStore) ✅
- [x] **Week 3, Day 4**: Dropdown Menu Component (Reducer, Tests, Component) ✅
- [x] **Week 3, Day 5**: Calendar Component (Reducer, Tests, Component) ✅
- [x] **Week 4, Day 1**: Command Palette & Toast (Reducer, Tests, Components) ✅
- [x] **Week 4, Day 4**: TreeView Component (Reducer, Tests, Component, Example) ✅
- [x] **Week 4, Day 1-2**: Command Palette & Toast (Reducer, Tests, Components) ✅
- [x] **Week 4, Day 5**: Carousel Component (Reducer, Tests, Component) ✅ | File Upload (Reducer, Tests, Component) ✅
- [x] **Week 4, Day 6**: Slider Component (Component, Reducer, Tests) ✅
- [ ] **Week 5, Day 1-2**: Chart Component (D3 Wrapper) 🎯 CURRENT
- [ ] **Week 5, Day 2-3**: Rich Text Editor (Tiptap Wrapper)
- [ ] **Week 5, Day 4**: Infinite Scroll Component
- [ ] **Week 5, Day 5**: Code Editor (CodeMirror Wrapper)
- [ ] **Week 5+**: Documentation + Polish

**Components Complete**: 73 / 50+ (includes Slider)
- Foundation: Button (3), Input, Label, Spinner, Card (6), Separator
- Layout: Panel, Box, AspectRatio (3)
- Typography: Heading, Text, Kbd (3)
- Visual: Banner (3), Empty (2)
- Form System: Form, FormField, FormControl, FormItem, FormLabel, FormMessage, FormDescription (7)
- Form Inputs: Textarea, Checkbox, Radio, RadioGroup, Switch (5)
- DataTable: DataTable, DataTableHeader, DataTablePagination (3) ✅
- Tooltip: Tooltip, TooltipPrimitive, tooltip.reducer (3) ✅
- DropdownMenu: DropdownMenu, dropdown-menu.reducer, dropdown-menu.types (3) ✅
- Select: Select, select.reducer, select.types (3) ✅
- Pagination: Pagination, pagination.reducer, pagination.types (3) ✅
- Combobox: Combobox, combobox.reducer, combobox.types (3) ✅
- Accordion: Accordion, AccordionItem, AccordionTrigger, AccordionContent (4) ✅
- Collapsible: Collapsible, CollapsibleTrigger, CollapsibleContent (3) ✅
- TreeView: TreeView, tree-view.reducer, tree-view.types (3) ✅
- Carousel: Carousel, carousel.reducer, carousel.types (3) ✅
- FileUpload: FileUpload, file-upload.reducer, file-upload.types (3) ✅
- Command: Command, CommandInput, CommandList, CommandGroup, CommandItem, command.reducer, command.types (7) ✅
- Toast: Toast, Toaster, ToastAction, ToastTitle, ToastDescription, toast.reducer, toast.types (7) ✅
- Calendar: Calendar, calendar.reducer, calendar.types (3) ✅
- **Navigation Components** (from earlier phases): Modal, Sheet, Alert, Drawer, Popover, Sidebar, Tabs, NavigationStack, AnimatedNavigationStack, DestinationRouter (10) ✅
- **Form Components**: Input, Textarea, Checkbox, Radio, RadioGroup, Switch, Slider (7) ✅

**Form System**: Complete with 23/23 unit tests passing ✅
**Form Examples**: 3 complete examples with 55 browser tests passing ✅
  - Contact Form (13 tests) - Basic integrated mode with async validation
  - Registration Form (17 tests) - Cross-field validation with Zod refinements
  - Multi-Step Form (25 tests) - 3-step wizard with data accumulation

**DataTable System**: Complete with 8/8 browser tests passing ✅
**DataTable Example**: Product table with filtering, sorting, pagination (8 tests)

**Tooltip System**: Complete with 11/11 unit tests passing ✅
**Tooltip Tests**: Hover delay, presentation lifecycle, dismissal, state guards, full user flow

**DropdownMenu System**: Complete with 27/27 unit tests passing ✅
**DropdownMenu Tests**: Open/close/toggle, keyboard navigation, item highlighting, selection, edge cases

**Select System**: Complete with 30/30 unit tests passing ✅
**Select Tests**: Single/multi-select, search/filter, keyboard navigation, full user flows, edge cases

**Pagination System**: Complete with 23/23 unit tests passing ✅
**Pagination Tests**: Page navigation, boundary conditions, items per page, total items changes, edge cases

**Combobox System**: Complete with 36/36 unit tests passing ✅
**Combobox Tests**: Open/close/toggle, search/filter, async loading with debouncing, keyboard navigation, full user flows, edge cases
**Combobox Architecture**: Refactored to use dropdown state machine (idle/opening/open/closing) with centralized animations (150ms open, 100ms close) for cross-component coordination ✅

**Accordion System**: Complete with 31/31 unit tests passing ✅
**Accordion Tests**: Toggle, single/multiple mode, collapsible mode, expand/collapse, callbacks, items changes

**Collapsible System**: Complete with 24/24 unit tests passing ✅
**Collapsible Tests**: Toggle, disabled state, explicit expand/collapse, callbacks, edge cases

**TreeView System**: Complete with 32/32 unit tests passing ✅
**TreeView Tests**: Expand/collapse, single/multi-select, keyboard navigation, lazy loading, callbacks, edge cases
**TreeView Example**: File browser with lazy loading demonstration, activity log, and comprehensive README ✅

**Calendar System**: Complete with 25/25 unit tests passing ✅
**Calendar Tests**: Single/range selection, month navigation, date validation, bounds checking, callbacks, edge cases

---

## Week 1: Foundation + Form System Start (5 days)

### Day 1: Infrastructure & Theme System ✅ COMPLETE

**Goal**: Establish foundation without conflicting with existing testing infrastructure

#### Testing Infrastructure ✅
- [x] Confirmed existing Vitest + @vitest/browser setup
- [x] Avoided creating conflicting Playwright config
- [x] Component directory structure created
  - [x] `packages/core/src/components/ui/`
  - [x] `packages/core/tests/browser/`
  - [x] `packages/core/tests/visual/`

#### Theme System Setup ✅
- [x] Create base theme CSS with CSS variables
  - [x] Color variables (light mode)
  - [x] Color variables (dark mode)
  - [x] Radius variables
  - [x] Shadow variables
  - [x] Transition variables
  - [x] File: `packages/core/src/styles/theme.css`
- [x] Configure Tailwind
  - [x] Map CSS variables to Tailwind theme
  - [x] Dark mode class strategy
  - [x] Shadow, radius, transition utilities
  - [x] Chart color utilities
  - [x] File: `packages/core/tailwind.config.ts`
- [x] Create theme utilities
  - [x] `createThemeManager()` with Svelte 5 runes
  - [x] Theme persistence (localStorage)
  - [x] System preference detection
  - [x] File: `packages/core/src/styles/theme.svelte.ts`

#### Animation Preset Extensions ✅
- [x] Extend `animation/spring-config.ts` with new presets
  - [x] Toast preset (0.4s, bounce 0.3)
  - [x] Dropdown preset (0.2s, bounce 0.2)
  - [x] Popover preset (0.25s, bounce 0.25)
  - [x] Tooltip preset (0.15s, bounce 0.1)
  - [x] Button preset (0.2s, bounce 0.4)
  - [x] List item preset (0.3s, bounce 0.25)
  - [x] Collapse preset (0.35s, bounce 0.25)

**Checkpoint**: ✅ Theme system ready, animation presets extended, testing infra confirmed

**Note**: CLI tool deferred - will use manual copy-paste initially, can add CLI later if needed

---

### Day 2: Foundational Atomic Components ✅ COMPLETE

**Goal**: Establish Tier 1 patterns and APIs

#### Button Component (Foundation for all patterns) ✅
- [x] Create `components/ui/button/Button.svelte`
- [x] Implement variant system (default, primary, secondary, destructive, outline, ghost, link)
- [x] Implement size system (sm, md, lg, icon)
- [x] Add loading state with inline Spinner
- [x] Add disabled state
- [x] Implement action dispatch pattern
  - [x] `action` prop (optional)
  - [x] `dispatch` prop (optional)
  - [x] `onclick` fallback
- [x] Add Tailwind styling with CSS variables
- [x] Add accessibility attributes
- [ ] Create visual regression tests (pending)
- [ ] Create interaction tests (pending)
- [ ] Create examples (pending):
  - [ ] Basic button
  - [ ] Button with action dispatch
  - [ ] Loading button
  - [ ] Button group

#### Input Component (Form integration foundation) ✅
- [x] Create `components/ui/input/Input.svelte`
- [x] Implement types (text, email, password, number, tel, url, search)
- [x] Add disabled state
- [x] Add error state styling
- [x] Implement value binding with $bindable
- [x] Add accessibility (aria-invalid, aria-describedby)
- [ ] Add action dispatch for change/blur (pending)
- [ ] Create interaction tests (pending)
- [ ] Create examples (pending):
  - [ ] Controlled input
  - [ ] Input with validation
  - [ ] Disabled input

#### Label Component (Accessibility foundation) ✅
- [x] Create `components/ui/label/Label.svelte`
- [x] Implement `for` attribute handling
- [x] Add error state styling
- [ ] Add required indicator (pending)
- [ ] Create examples (pending)

#### Additional Foundation Components ✅
- [x] **Spinner** - Loading indicator
  - [x] Create component with size variants (sm, md, lg)
  - [x] Add to registry
- [x] **Card** - Container component
  - [x] Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
  - [x] Add to registry
- [x] **Separator** - Visual divider
  - [x] Horizontal and vertical variants
  - [x] Add to registry

**Checkpoint**: ✅ Foundation components created, patterns established. Testing and examples deferred to after Form system validation.

---

### Day 3-5: Form System - Reducer & Types ✅ COMPLETE

**Goal**: Build the core form state management (see FORM-SYSTEM-DESIGN.md)

#### Form Types & State ✅
- [x] Create `components/form/form.types.ts`
  - [x] `FormState<T>` interface
  - [x] `FieldState` interface
  - [x] `FormConfig<T>` interface
  - [x] `FormAction<T>` discriminated union
  - [x] `FormDependencies` interface
- [x] Create initial state factory
  - [x] `createInitialFormState(config)`
  - [x] Test: Generates correct initial state

#### Form Reducer Implementation ✅
- [x] Create `components/form/form.reducer.ts`
- [x] Implement `createFormReducer(config)` factory
- [x] Implement action handlers:
  - [x] `fieldChanged` - Update field value, trigger debounced validation
  - [x] `fieldBlurred` - Mark touched, trigger validation
  - [x] `fieldFocused` - Focus tracking
  - [x] `fieldValidationStarted` - Run Zod + async validators
  - [x] `fieldValidationCompleted` - Update field error state
  - [x] `formValidationStarted` - Validate entire form
  - [x] `formValidationCompleted` - Update all field errors
  - [x] `submitTriggered` - Start validation flow
  - [x] `submissionStarted` - Run onSubmit handler
  - [x] `submissionSucceeded` - Update success state
  - [x] `submissionFailed` - Update error state
  - [x] `formReset` - Reset to initial or new data
  - [x] `setFieldValue` - Programmatic field update
  - [x] `setFieldError` - Programmatic error setting
  - [x] `clearFieldError` - Programmatic error clearing

#### Zod Integration ✅
- [x] Implement field-level Zod validation
  - [x] Extract field schema from main schema
  - [x] Parse single field value
  - [x] Map Zod errors to string messages
- [x] Implement form-level Zod validation
  - [x] Parse entire form data
  - [x] Map errors to field errors map
  - [x] Handle cross-field validation (refinements)
- [x] Test: Zod validation works correctly
- [x] **FIXED**: Updated to use Zod 4.x API (`.issues` instead of `.errors`)

#### Async Validation ✅
- [x] Implement async validator execution
  - [x] Run after Zod validation passes
  - [x] Handle async errors
  - [x] Debouncing handled by reducer
- [x] Test: Async validation works

#### Validation Modes ✅
- [x] Implement `onBlur` mode
- [x] Implement `onChange` mode with debouncing
- [x] Implement `onSubmit` mode
- [x] Implement `all` mode
- [x] Test: All modes work correctly

#### Comprehensive TestStore Tests ✅
- [x] **23/23 tests passing** (100% coverage)
- [x] Field validation tests (8 tests)
- [x] Form validation tests (2 tests)
- [x] Form submission tests (4 tests)
- [x] Cross-field validation tests (1 test)
- [x] Debounced validation tests (1 test)
- [x] Validation mode tests (2 tests)
- [x] Form reset tests (2 tests)
- [x] Programmatic control tests (3 tests)
- [x] **FIXED**: TestStore partial matching issues documented and resolved

#### TestStore Documentation ✅
- [x] Added comprehensive warning about partial matching limitation in browser tests
- [x] Documented recommended pattern (type-only matching + state assertions)
- [x] Added JSDoc warnings on `receive()` method

**Checkpoint**: ✅ Form reducer complete, Zod integration works, all tests passing!

---

## Week 2: Form System Complete + Atomic Expansion (5 days)

### Day 1: Form Components ✅ COMPLETE

**Goal**: Build UI components backed by form reducer

#### Form Component ✅
- [x] Create `components/form/Form.svelte`
- [x] Create form store from config
- [x] Provide store to context
- [x] Handle form submission
- [x] Test: Form creates store correctly

#### FormField Component ✅
- [x] Create `components/form/FormField.svelte`
- [x] Get store from context
- [x] Derive field state
- [x] Render children with field state
- [x] Test: Field state reactive

#### FormControl Component ✅
- [x] Create `components/form/FormControl.svelte`
- [x] Handle change/blur/focus events
- [x] Dispatch field actions
- [x] Add data attributes (error, touched, dirty)
- [x] Test: Events dispatch correctly

#### FormItem, FormLabel, FormMessage, FormDescription ✅
- [x] Create `FormItem.svelte` (wrapper)
- [x] Create `FormLabel.svelte` (label with error styling)
- [x] Create `FormMessage.svelte` (error/loading messages with spinner)
- [x] Create `FormDescription.svelte` (helper text)
- [x] Test: All components render correctly

**Checkpoint**: ✅ Form components work together - Context-based architecture complete!

---

### Day 2: Form Atomic Inputs ✅ COMPLETE

**Goal**: Build form-specific input components

#### Textarea ✅
- [x] Create `components/ui/textarea/Textarea.svelte`
- [x] Implement rows prop
- [x] Add resize control (none, vertical, horizontal, both)
- [x] Bindable value with $bindable
- [x] Add to registry

#### Checkbox ✅
- [x] Create `components/ui/checkbox/Checkbox.svelte`
- [x] Implement checked state
- [x] Add indeterminate state (with visual dash)
- [x] Bindable checked with $bindable
- [x] Add accessibility (role="checkbox", aria-checked)
- [x] Add to registry

#### Radio & RadioGroup ✅
- [x] Create `components/ui/radio/Radio.svelte`
- [x] Create `components/ui/radio/RadioGroup.svelte`
- [x] Implement group selection with context
- [x] Bindable value on RadioGroup
- [x] Add accessibility (role="radio", role="radiogroup")
- [x] Add to registry

#### Switch ✅
- [x] Create `components/ui/switch/Switch.svelte`
- [x] Implement toggle animation with Motion One
- [x] Spring physics using SPRING_PRESETS.button
- [x] Bindable checked with $bindable
- [x] Add accessibility (role="switch", aria-checked)
- [x] Add to registry

**Checkpoint**: ✅ All form inputs complete with animations!

---

### Day 3: Integrated Form Example + Browser Tests ✅ COMPLETE

**Goal**: Real-world integrated form example with comprehensive browser testing

#### Contact Form Example (Integrated Mode) ✅
- [x] Create `examples/contact-form` directory
- [x] Setup Vite browser testing configuration
- [x] Define ContactFormData Zod schema
- [x] Create contactFormConfig with async validation
- [x] Integrate form reducer into parent app reducer using `scope()`
- [x] Define AppState with contactForm, submissionHistory, successMessage
- [x] Define AppAction with parent observation of form events
- [x] Create reactive store wrapper for integrated mode
  - [x] Use `$state()` for reactive form state
  - [x] Use `$effect()` to sync with parent store
  - [x] Fixed: Proper reactivity tracking for Svelte 5
- [x] Implement App.svelte with full form UI
  - [x] Name, Email, Message fields with validation
  - [x] Success message with auto-dismiss
  - [x] Submission history tracking
  - [x] All using integrated mode pattern

#### Browser Tests (13/13 passing) ✅
- [x] Initial render tests (3 tests)
  - [x] Renders all form fields
  - [x] No success message initially
  - [x] No submission history initially
- [x] Field validation tests (4 tests)
  - [x] Name too short error
  - [x] Invalid email error
  - [x] Message too short error
  - [x] Errors clear when input becomes valid
- [x] Form submission tests (4 tests)
  - [x] Successfully submits valid form
  - [x] Adds submission to history
  - [x] Dismisses success message when clicked
  - [x] Does not submit invalid form
- [x] Async validation tests (2 tests)
  - [x] Shows validating state during async validation
  - [x] Rejects blocked email domains

#### Issues Fixed ✅
- [x] **Fixed**: Missing `$lib` Vite alias
- [x] **Fixed**: Wrong import paths (Form vs UI components)
- [x] **Fixed**: Missing Textarea export
- [x] **Fixed**: JSDoc parsing error in Form.svelte
- [x] **Fixed**: FormField snippet signature (added `send` function)
- [x] **Fixed**: Non-reactive store wrapper (added `$state()` + `$effect()`)
- [x] **Fixed**: Wrong state access (`submission.status` → `isSubmitting`)

#### Documentation ✅
- [x] Created comprehensive forms-guide.md
  - [x] Form state structure reference
  - [x] Two form modes explained (standalone vs integrated)
  - [x] Complete integrated mode example
  - [x] All 6 common pitfalls documented with solutions
  - [x] Browser testing guide
  - [x] Component API reference
  - [x] Summary checklist

**Checkpoint**: ✅ Integrated form example works in browser! All lessons learned documented.

#### Test Suite Structure ✅
- [x] Create `tests/form.test.ts`
- [x] Setup test utilities and fixtures

#### Field Validation Tests ✅
- [x] Test: Field value updates on change
- [x] Test: Debounced validation triggers
- [x] Test: Field validation on blur
- [x] Test: Field touched state updates
- [x] Test: Field dirty state updates
- [x] Test: Field error cleared on change
- [x] Test: Validation errors displayed
- [x] Test: Async validation works
- [x] Test: Async validation errors shown

#### Form Validation Tests ✅
- [x] Test: Form validates all fields on submit
- [x] Test: Form shows all errors on invalid submit
- [x] Test: Form prevents submission with errors
- [x] Test: Form submits with valid data
- [x] Test: Cross-field validation works (password confirmation)
- [x] Test: Submit count increments

#### Submission Tests ✅
- [x] Test: Submission starts after valid form
- [x] Test: Submission loading state works
- [x] Test: Submission success updates state
- [x] Test: Submission failure shows error
- [x] Test: Last submitted timestamp updates

#### Form Management Tests ✅
- [x] Test: Form reset clears all fields
- [x] Test: Form reset with new data works
- [x] Test: Programmatic field value setting
- [x] Test: Programmatic error setting
- [x] Test: Programmatic error clearing

#### Validation Mode Tests ✅
- [x] Test: onBlur mode only validates on blur
- [x] Test: onChange mode validates on change (debounced)
- [x] Test: onSubmit mode only validates on submit
- [x] Test: all mode validates on blur and change

**Checkpoint**: ✅ 23/23 tests passing - 100% TestStore coverage for form system!

---

### Day 4: Form Examples ✅ COMPLETE

**Goal**: Create real-world form examples

#### Contact Form Example ✅
- [x] Create `examples/contact-form/` - Complete integrated example
- [x] Implement name, email, message fields
- [x] Add Zod schema with validation rules
- [x] Add async email validation (@blocked.com domain check)
- [x] Add submission handler with success tracking
- [x] Add success/error states (banner + history)
- [x] Browser tests: 13/13 passing
- [x] Document: Comprehensive README with patterns

#### Registration Form Example ✅
- [x] Create `examples/registration-form/` - Complete integrated example
- [x] Implement username, email, password, confirmPassword
- [x] Add Zod schema with refinements (password match using `.refine()`)
- [x] Add async username/email availability checks
- [x] Add submission handler with success screen
- [x] Browser tests: 17/17 passing
- [x] Document: Cross-field validation pattern in README

#### Multi-Step Form Example ✅
- [x] Create `examples/multi-step-form/` - Complete wizard example
- [x] Implement 3-step wizard (personal info, address, review)
- [x] Validate each step before progression
- [x] Accumulate data across steps in parent state
- [x] Show interactive progress indicator (StepIndicator component)
- [x] Bidirectional navigation with data preservation
- [x] Review step with edit capabilities
- [x] Final submission with all accumulated data
- [x] Browser tests: 25/25 passing
- [x] Document: Multi-step form pattern in README

**Checkpoint**: ✅ Form system complete with 3 examples and 55 browser tests passing!

---

### Day 5: Remaining Atomic Components (Batch) ✅ COMPLETE

**Goal**: Complete Tier 1 component library

#### Feedback Components ✅
- [x] **Badge** - Status indicator with variants
- [x] **Avatar** - User image with fallback
- [x] **Skeleton** - Loading placeholder
- [x] **Progress** - Progress bar
- [x] Already have: Spinner ✓

#### Layout Components ✅
- [x] Already have: Card ✓
- [x] **Panel** - Generic content container
- [x] **Box** - Primitive with padding/margin
- [x] Already have: Separator ✓
- [x] **AspectRatio** - Maintain aspect ratio wrapper

#### Typography Components ✅
- [x] **Heading** - H1-H6 with consistent styling
- [x] **Text** - Paragraph with variants
- [x] Already have: Label ✓
- [x] **Kbd** - Keyboard key display

#### Visual Components ✅
- [x] **Banner** - Static informational message (replaces Alert)
- [x] **Empty** - Empty state placeholder

#### Button Variants ✅
- [x] Already have: Button ✓
- [x] **ButtonGroup** - Multiple buttons together
- [x] **IconButton** - Button with icon only
- [x] Button (link variant) - Available via `variant="link"` prop

**Checkpoint**: ✅ All Tier 1 (Atomic) components complete

---

## Week 3: DataTable + Additional UI Components (5 days)

**Note**: Navigation components (Modal, Sheet, Alert, AlertDialog, Drawer, Popover, Sidebar, Tabs, NavigationStack, DestinationRouter) already exist from earlier phases (Phases 2-4) in `packages/core/src/navigation-components/`. Week 3 focuses on DataTable and remaining utility components.

### Day 1-2: DataTable System ✅ COMPLETE

**Goal**: Build complex stateful component with server integration

#### DataTable Reducer ✅
- [x] Create `components/data-table/table.reducer.ts`
- [x] Define `TableState<T>` interface
  - [x] data: T[]
  - [x] sortColumn, sortDirection
  - [x] filters: Filter<T>[]
  - [x] pagination: { page, pageSize, total }
  - [x] isLoading: boolean
  - [x] error: string | null
- [x] Define `TableAction<T>` type
  - [x] dataLoaded, sortChanged, filterAdded, filterRemoved, filtersCleared
  - [x] pageChanged, pageSizeChanged
- [x] Implement reducer with all actions
- [x] Implement sorting logic (stable sort)
- [x] Implement filtering logic (operator-based: equals, contains, greaterThan, lessThan)
- [x] Implement pagination logic
- [x] Test: All table operations work

#### DataTable Components ✅
- [x] Create `DataTable.svelte` - Main table container with snippets
- [x] Create `DataTableHeader.svelte` - Column headers with sorting controls
- [x] Create `DataTablePagination.svelte` - Full pagination controls
  - [x] Page size selector
  - [x] First/Previous/Next/Last buttons
  - [x] Page indicator
  - [x] Items count display
- [x] Add loading states (Spinner component)
- [x] Add empty state (Empty component)
- [x] Add error state
- [x] Test: Table renders correctly

#### Browser Tests (8/8 passing) ✅
- [x] Initial render tests (2 tests)
  - [x] Renders table with paginated products
  - [x] Renders pagination controls
- [x] Filtering tests (2 tests)
  - [x] Filters products by Electronics category
  - [x] Clears filters correctly
- [x] Sorting tests (1 test)
  - [x] Sorts by column (ascending/descending)
- [x] Pagination tests (2 tests)
  - [x] Navigates to next page
  - [x] Changes page size dynamically
- [x] Combined operations test (1 test)
  - [x] Filter + sort + pagination work together

#### Example Application ✅
- [x] Create `examples/data-table/` directory
- [x] Setup Vite browser testing configuration
- [x] Create App.svelte with product data (15 products)
- [x] Implement filter buttons (Electronics, Clear Filters)
- [x] Implement DataTable with 4 columns (Name, Price, Category, In Stock)
- [x] Add pagination with custom page sizes [3, 5, 10, 20]
- [x] All browser tests passing (8/8)

#### Issues Fixed ✅
- [x] **Fixed**: Missing `$lib` Vite alias in vite.config.ts
- [x] **Fixed**: Incorrect createStore call signature (config object vs separate params)
- [x] **Fixed**: Test selector conflicts - added `data-testid="page-indicator"`
- [x] **Fixed**: Missing page size option (added [3, 5, 10, 20])

**Checkpoint**: ✅ DataTable system complete with comprehensive browser tests!

---

### Day 3: Tooltip Component ✅ COMPLETE

**Goal**: Build hover-triggered tooltip with state-driven animations

#### Tooltip Component ✅
- [x] Create `components/ui/tooltip/Tooltip.svelte`
- [x] Create `components/ui/tooltip/TooltipPrimitive.svelte`
- [x] Create `components/ui/tooltip/tooltip.reducer.ts`
- [x] Implement hover delay (300ms configurable)
- [x] Implement PresentationState lifecycle (idle → presenting → presented → dismissing)
- [x] Add positioning logic (top, bottom, left, right)
- [x] Add Motion One animations (animateTooltipIn/Out)
- [x] Comprehensive TestStore tests (11/11 passing)
  - [x] Hover delay tests
  - [x] Presentation lifecycle tests
  - [x] Dismissal lifecycle tests
  - [x] State guard tests
  - [x] Custom hover delay tests
  - [x] Full user flow tests
- [x] Test: Tooltip shows on hover with delay
- [x] Test: Tooltip cancels if hover ends before delay
- [x] Test: Tooltip animations work correctly
- [x] Test: Fake timer support working perfectly

**Issues Fixed**:
- [x] TestStore `advanceTime()` now properly supports fake timers
- [x] TestStore `receive()` uses polling pattern with `vi.waitFor()`
- [x] Added deep equality for nested object matching in actions
- [x] Comprehensive fake timer documentation added

**Checkpoint**: ✅ Tooltip complete with state-driven architecture, 11 tests passing in 4ms!

---

### Day 4: Dropdown Menu Component ✅ COMPLETE

**Goal**: Build interactive menu with full keyboard navigation

#### Dropdown Menu Component ✅
- [x] Create `components/ui/dropdown-menu/dropdown-menu.types.ts`
  - [x] MenuItem interface (id, label, icon, disabled, isSeparator, shortcut)
  - [x] DropdownMenuState (isOpen, highlightedIndex, items)
  - [x] DropdownMenuAction (9 action types)
  - [x] createInitialDropdownMenuState() factory
- [x] Create `components/ui/dropdown-menu/dropdown-menu.reducer.ts`
  - [x] Pure reducer with all 9 action handlers
  - [x] findNextEnabledIndex() helper for smart navigation
  - [x] Automatically skips disabled and separator items
  - [x] Wrapping navigation (arrows loop around)
  - [x] Home/End key support
  - [x] Selection triggers onSelect via Effect.run()
- [x] Create `components/ui/dropdown-menu/DropdownMenu.svelte`
  - [x] Trigger button with ARIA attributes
  - [x] Comprehensive keyboard navigation (arrows, home, end, enter, escape)
  - [x] Mouse interaction (hover to highlight, click to select)
  - [x] Click-outside detection using $effect()
  - [x] Conditional rendering based on state
  - [x] Themeable with CSS variables
- [x] Comprehensive TestStore tests (27/27 passing)
  - [x] Open/Close/Toggle tests (5 tests)
  - [x] Keyboard Navigation tests (7 tests)
  - [x] Item Highlighting tests (3 tests)
  - [x] Item Selection tests (4 tests)
  - [x] Full User Flows tests (3 tests)
  - [x] Edge Cases tests (5 tests)
- [x] Create index.ts with exports
- [x] Add to component registry

**Key Features**:
- ✅ Full keyboard accessibility (arrows, home, end, enter, escape)
- ✅ Automatic skip of disabled/separator items
- ✅ Wrapping navigation
- ✅ Click-outside handling
- ✅ Hover highlighting
- ✅ Selection callback via Effect system
- ✅ Reducer-based state management
- ✅ NO CSS animations (state-driven only)

**Checkpoint**: ✅ Dropdown Menu complete with 27 tests passing in 5ms!

#### Context Menu Component (optional)
- [ ] Create `components/ui/context-menu/ContextMenu.svelte`
- [ ] Right-click trigger
- [ ] Position at cursor
- [ ] Menu items with keyboard nav
- [ ] Test: Context menu on right-click

#### Select Component ✅
- [x] Create `components/ui/select/select.types.ts`
  - [x] SelectOption interface (value, label, disabled, description)
  - [x] SelectState (options, selected, isOpen, highlightedIndex, searchQuery, filteredOptions, isMulti)
  - [x] SelectAction (15 action types: opened, closed, toggled, optionSelected, optionToggled, searchChanged, etc.)
  - [x] createInitialSelectState() factory
- [x] Create `components/ui/select/select.reducer.ts`
  - [x] Pure reducer with all 15 action handlers
  - [x] filterOptions() helper for search
  - [x] findNextEnabledIndex() helper for keyboard navigation
  - [x] Single-select closes dropdown, multi-select stays open
  - [x] Search automatically highlights first result
  - [x] Selection triggers onChange via Effect.run()
- [x] Create `components/ui/select/Select.svelte`
  - [x] $bindable for two-way value binding
  - [x] Full keyboard navigation (arrows, home, end, enter, escape)
  - [x] Search input with filtering
  - [x] Multi-select with checkboxes
  - [x] Single-select with checkmark
  - [x] Clear button
  - [x] Click-outside detection
  - [x] Disabled state support
- [x] Comprehensive TestStore tests (30/30 passing)
  - [x] Single Select tests (4 tests)
  - [x] Multi-Select tests (3 tests)
  - [x] Search/Filter tests (5 tests)
  - [x] Keyboard Navigation tests (9 tests)
  - [x] Manual Highlight tests (2 tests)
  - [x] Full User Flows tests (3 tests)
  - [x] Edge Cases tests (4 tests)
- [x] Create index.ts with exports
- [x] Add to component registry

**Key Features**:
- ✅ Single and multi-select modes
- ✅ Search/filter by label and description
- ✅ Full keyboard accessibility
- ✅ $bindable for two-way binding
- ✅ Clear button
- ✅ Skip disabled items in navigation
- ✅ Reducer-based state management
- ✅ NO CSS animations (state-driven only)

**Checkpoint**: ✅ Select complete with 30 tests passing in 5ms!

#### Calendar Component (optional)
- [ ] Create `components/ui/calendar/Calendar.svelte`
- [ ] Month view with date selection
- [ ] Range selection
- [ ] Min/max date constraints
- [ ] Test: Calendar selection works

**Checkpoint**: ✅ Additional UI components complete

---

### Day 5: Pagination + Slider Components

**Goal**: Complete utility components

#### Pagination Component ✅
- [x] Create `components/ui/pagination/pagination.types.ts`
  - [x] PaginationState (currentPage, totalItems, itemsPerPage, totalPages, maxPageButtons)
  - [x] PaginationAction (7 action types)
  - [x] createInitialPaginationState() factory
- [x] Create `components/ui/pagination/pagination.reducer.ts`
  - [x] Pure reducer with all 7 action handlers
  - [x] recomputeTotalPages() helper
  - [x] Automatic page adjustment when bounds change
  - [x] Callbacks via Effect.run()
- [x] Create `components/ui/pagination/Pagination.svelte`
  - [x] Smart page button generation with ellipsis
  - [x] First, previous, next, last navigation
  - [x] Direct page selection
  - [x] Items per page selector (optional)
  - [x] $bindable for current page
  - [x] Boundary validation
- [x] Comprehensive TestStore tests (23/23 passing)
  - [x] Page Navigation tests (5 tests)
  - [x] Boundary Conditions tests (4 tests)
  - [x] Items Per Page tests (4 tests)
  - [x] Total Items Changes tests (4 tests)
  - [x] Edge Cases tests (4 tests)
  - [x] Full User Flow tests (2 tests)
- [x] Create index.ts with exports
- [x] Add to component registry

**Key Features**:
- ✅ Smart page button algorithm with ellipsis
- ✅ Always shows first and last pages
- ✅ Centers current page in visible window
- ✅ Boundary validation (no invalid pages)
- ✅ Automatic page adjustment
- ✅ Items per page control
- ✅ $bindable for two-way binding
- ✅ Reducer-based state management

**Checkpoint**: ✅ Pagination complete with 23 tests passing in 4ms!

#### Slider Component ✅ COMPLETE
- [x] Create `components/ui/slider/Slider.svelte`
- [x] Single value slider
- [x] Range slider (two handles)
- [x] Add action dispatch
- [x] Add accessibility (role="slider")
- [x] Component complete and in styleguide

**Checkpoint**: ✅ Week 3 complete

---

## Week 4: Remaining Stateful Components (5 days)

### Day 1-2: Command Palette & Toast

**Goal**: Build search and notification systems

#### Command Palette
- [ ] Create `components/command/command.reducer.ts`
- [ ] Define `CommandState` interface
  - [ ] query: string
  - [ ] filteredItems: CommandItem[]
  - [ ] selectedIndex: number
  - [ ] recentCommands: CommandItem[]
  - [ ] isOpen: boolean
- [ ] Define `CommandAction` type
  - [ ] queryChanged, itemSelected, itemExecuted
  - [ ] keyboardNavigation (up, down, enter, escape)
- [ ] Implement fuzzy search effect
- [ ] Implement keyboard navigation
- [ ] Test: Command search and selection works

- [ ] Create `Command.svelte` components
- [ ] Create examples (app-wide command palette)

#### Toast System
- [ ] Create `components/toast/toast.reducer.ts`
- [ ] Define `ToastState` interface
  - [ ] toasts: Toast[]
  - [ ] maxVisible: number
  - [ ] queue: Toast[]
- [ ] Define `ToastAction` type
  - [ ] toastAdded, toastDismissed, toastAutoDismissed
- [ ] Implement queue with max visible
- [ ] Implement auto-dismiss effects (Effect.afterDelay)
- [ ] Implement manual dismissal
- [ ] Test: Queue and dismissal work

- [ ] Create `Toaster.svelte`, `Toast.svelte` components
- [ ] Add Motion One animations (slide in/out)
- [ ] Create examples (global toast system)

**Checkpoint**: ✅ Command and Toast complete

---

### Day 3: Select & Combobox ✅ COMPLETE

**Goal**: Build dropdown selection components

#### Select Component ✅
- [x] Create `components/select/select.reducer.ts`
- [x] Define state (items, selected, isOpen)
- [x] Implement selection logic
- [x] Test: Select works (30 tests passing)

- [x] Create `Select.svelte` components
- [x] Add keyboard navigation
- [x] Create examples

#### Combobox Component ✅
- [x] Create `components/combobox/combobox.reducer.ts`
- [x] Define state (query, items, filtered, selected, isOpen, isLoading)
- [x] Implement search with debouncing
- [x] Implement async item loading
- [x] Test: Combobox search and selection works (36 tests passing)

- [x] Create `Combobox.svelte` components
- [x] Add keyboard navigation
- [x] Full async loading support with loading states
- [x] Debounced search (300ms default)
- [x] Two-way binding with $bindable
- [x] Clear button functionality

**Checkpoint**: ✅ Select and Combobox complete - 66 total tests passing!

---

### Day 4: Content Organization Components

**Goal**: Build Tabs, Accordion, Collapsible, TreeView

#### Tabs Component ✅ ALREADY EXISTS
**⚠️ IMPORTANT NOTE (2nd reminder)**: Tabs component already exists from Phase 2!
- [x] Located at: `packages/core/src/navigation-components/Tabs.svelte`
- [x] Already has keyboard navigation (arrows, home, end)
- [x] Already has TabsPrimitive for navigation integration
- [x] **DO NOT** create a new tabs component - it's already complete from earlier phases
- [ ] ~~Create `components/tabs/tabs.reducer.ts`~~ (Not needed - uses navigation pattern)
- [ ] ~~Define state (tabs, activeTab)~~ (Not needed - uses parent state)
- [ ] ~~Implement tab switching~~ (Already done)
- [ ] ~~Test: Tab switching works~~ (Already tested in navigation tests)
- [ ] ~~Create `Tabs.svelte` components~~ (Already exists)
- [ ] ~~Add keyboard navigation~~ (Already has full keyboard nav)
- [ ] ~~Create examples~~ (Skip for now)

#### Accordion Component ✅
- [x] Create `components/accordion/accordion.reducer.ts`
- [x] Define state (items, expandedIds, allowMultiple, collapsible)
- [x] Implement expand/collapse with centralized animations
- [x] Test: Accordion works (31/31 tests passing)

- [x] Create `Accordion.svelte`, `AccordionItem.svelte`, `AccordionTrigger.svelte`, `AccordionContent.svelte`
- [x] Add centralized Motion One animations (animateAccordionExpand/Collapse)
- [x] Single and multiple expansion modes
- [x] Collapsible/non-collapsible modes
- [x] Callbacks (onExpand, onCollapse)

#### Collapsible Component ✅
- [x] Create `components/collapsible/Collapsible.svelte`
- [x] Create `CollapsibleTrigger.svelte`, `CollapsibleContent.svelte`
- [x] Implement toggle with centralized animations
- [x] Test: Collapsible works (24/24 tests passing)
- [x] Uses centralized animation system

#### TreeView Component ✅
- [x] Create `components/ui/tree-view/tree-view.types.ts`
  - [x] TreeNode interface (id, label, icon, disabled, children, data, lazy)
  - [x] TreeViewState (nodes, expandedIds, selectedIds, highlightedId, loadingIds, isMultiSelect)
  - [x] TreeViewAction (17 action types)
  - [x] createInitialTreeViewState() factory
- [x] Create `components/ui/tree-view/tree-view.reducer.ts`
  - [x] Pure reducer with all 17 action handlers
  - [x] Helper functions (findNodeById, getAllVisibleNodeIds, findParentNodeId)
  - [x] Expand/collapse with lazy loading support
  - [x] Single and multi-select modes
  - [x] Full keyboard navigation (arrows, home, end, enter, space)
  - [x] Async children loading with Effect.run()
- [x] Create `components/ui/tree-view/TreeView.svelte`
  - [x] Recursive rendering using Svelte 5 snippets
  - [x] Full keyboard navigation handlers
  - [x] ARIA accessibility attributes
  - [x] Loading spinner for lazy-loaded nodes
  - [x] Visual selection and highlight indicators
- [x] Comprehensive TestStore tests (32/32 passing)
  - [x] Expand/collapse tests (5 tests)
  - [x] Selection tests (7 tests)
  - [x] Keyboard navigation tests (8 tests)
  - [x] Lazy loading tests (2 tests)
  - [x] Callback tests (3 tests)
  - [x] Edge case tests (7 tests)
- [x] Create examples/file-browser/ (complete working example)
  - [x] Realistic file system structure
  - [x] Visual icons for different file types
  - [x] Lazy loading demonstration
  - [x] Activity log and details panel
  - [x] Full keyboard navigation hints
  - [x] Comprehensive README

**Checkpoint**: ✅ Content organization components complete

---

### Day 5: Carousel & File Upload

**Goal**: Build media and upload components

#### Carousel Component
- [ ] Create `components/carousel/Carousel.svelte`
- [ ] Implement slide navigation
- [ ] Add auto-play option
- [ ] Add swipe gestures
- [ ] Add indicators
- [ ] Test: Carousel navigation works

#### File Upload Component
- [ ] Create `components/file-upload/upload.reducer.ts`
- [ ] Define state (files, progress, errors, isUploading)
- [ ] Implement multi-file queue
- [ ] Implement progress tracking effects
- [ ] Implement retry logic
- [ ] Test: Upload queue works

- [ ] Create `FileUpload.svelte` components
- [ ] Add drag-and-drop
- [ ] Create examples

**Checkpoint**: ✅ Week 4 complete

---

## Week 5: Advanced Components + Polish (5+ days)

**Current Status**: 🎯 Starting advanced component wrappers

### Day 1-2: Chart Component (D3 Wrapper) 🎯 CURRENT

**Goal**: Integrate D3 with reducer state for interactive data visualization

#### Chart Reducer
- [ ] Create `packages/core/src/components/chart/chart.reducer.ts`
- [ ] Define `ChartState` interface
  - [ ] data: DataPoint[]
  - [ ] selectedPoints: Set<string>
  - [ ] hoveredPoint: string | null
  - [ ] zoom: { scale: number; x: number; y: number }
  - [ ] isLoading: boolean
- [ ] Define `ChartAction` discriminated union
  - [ ] dataLoaded, pointHovered, pointClicked
  - [ ] zoomed, resetZoom
- [ ] Implement pure reducer with all action handlers
- [ ] Test: Chart state management works

#### Chart Component
- [ ] Create `packages/core/src/components/chart/Chart.svelte`
- [ ] Integrate D3 for rendering (scales, axes, points)
- [ ] Implement reactive D3 updates with $effect
- [ ] Connect user interactions (click, hover, zoom) to reducer
- [ ] Add TypeScript types for chart configurations
- [ ] Test: Chart renders and interactions work

#### TestStore Tests
- [ ] Create `packages/core/tests/chart.test.ts`
- [ ] Test: Point selection (single, multiple, toggle)
- [ ] Test: Hover state tracking
- [ ] Test: Zoom state updates
- [ ] Test: Reset zoom functionality
- [ ] Test: Data loading states

#### Examples
- [ ] Create `examples/chart/` directory
- [ ] Line chart example with time series data
- [ ] Bar chart example with categorical data
- [ ] Interactive scatter plot with selection
- [ ] Comprehensive README with usage patterns

**Checkpoint**: ✅ Chart component complete

---

### Day 2-3: Rich Text Editor (Tiptap Wrapper)

**Goal**: Integrate Tiptap with reducer state for document editing

#### Editor Reducer
- [ ] Create `packages/core/src/components/rich-text-editor/editor.reducer.ts`
- [ ] Define `EditorState` interface
  - [ ] content: JSONContent
  - [ ] selection: { from: number; to: number }
  - [ ] isSaving: boolean
  - [ ] lastSaved: Date | null
  - [ ] isCollaborating: boolean (optional)
- [ ] Define `EditorAction` discriminated union
  - [ ] contentChanged, selectionChanged
  - [ ] saveTriggered, saveCompleted, saveFailed
  - [ ] boldButtonTapped, italicButtonTapped, headingButtonTapped
- [ ] Implement auto-save with debouncing (Effect.afterDelay)
- [ ] Test: Editor state management works

#### Editor Components
- [ ] Create `packages/core/src/components/rich-text-editor/RichTextEditor.svelte`
- [ ] Create `packages/core/src/components/rich-text-editor/Toolbar.svelte`
- [ ] Integrate Tiptap editor instance
- [ ] Connect Tiptap callbacks to reducer actions
- [ ] Implement toolbar formatting buttons
- [ ] Sync external content changes with $effect
- [ ] Add saving indicator UI
- [ ] Test: Editor works with Tiptap

#### TestStore Tests
- [ ] Create `packages/core/tests/rich-text-editor.test.ts`
- [ ] Test: Content changes trigger auto-save
- [ ] Test: Debounced save (1 second delay)
- [ ] Test: Save success updates lastSaved
- [ ] Test: Save failure shows error
- [ ] Test: Formatting actions dispatch correctly

#### Examples
- [ ] Create `examples/rich-text-editor/` directory
- [ ] Document editor example with auto-save
- [ ] Comment editor example (simpler)
- [ ] Comprehensive README with Tiptap integration patterns

**Checkpoint**: ✅ Rich text editor complete

---

### Day 4: Infinite Scroll Component

**Goal**: Build load-more pagination with reducer state

#### Infinite Scroll Reducer
- [ ] Create `packages/core/src/components/infinite-scroll/infinite-scroll.reducer.ts`
- [ ] Define `InfiniteScrollState` interface
  - [ ] items: T[]
  - [ ] page: number
  - [ ] hasMore: boolean
  - [ ] isLoading: boolean
  - [ ] error: string | null
- [ ] Define `InfiniteScrollAction` discriminated union
  - [ ] loadMoreTriggered, itemsLoaded, loadMoreFailed
  - [ ] reset, scrolledToBottom
- [ ] Implement load more effect (Effect.run with async)
- [ ] Test: Infinite scroll state works

#### Infinite Scroll Component
- [ ] Create `packages/core/src/components/infinite-scroll/InfiniteScroll.svelte`
- [ ] Add Intersection Observer for scroll detection
- [ ] Render items with snippets for customization
- [ ] Show loading spinner at bottom
- [ ] Show "No more items" message when hasMore is false
- [ ] Test: Component triggers load more correctly

#### TestStore Tests
- [ ] Create `packages/core/tests/infinite-scroll.test.ts`
- [ ] Test: Load more triggers on scroll
- [ ] Test: Items accumulate correctly
- [ ] Test: hasMore becomes false when no more data
- [ ] Test: Error state handling
- [ ] Test: Reset clears items

#### Examples
- [ ] Create `examples/infinite-scroll/` directory
- [ ] Product list example with infinite scroll
- [ ] Social feed example
- [ ] README with load more patterns

**Checkpoint**: ✅ Infinite scroll complete

---

### Day 5: Code Editor (CodeMirror Wrapper)

**Goal**: Integrate CodeMirror with reducer state for code editing

#### Code Editor Reducer
- [ ] Create `packages/core/src/components/code-editor/code-editor.reducer.ts`
- [ ] Define `CodeEditorState` interface
  - [ ] content: string
  - [ ] language: string
  - [ ] cursorPosition: { line: number; column: number }
  - [ ] selection: { from: number; to: number } | null
  - [ ] errors: LintError[]
  - [ ] isLinting: boolean
- [ ] Define `CodeEditorAction` discriminated union
  - [ ] contentChanged, languageChanged
  - [ ] formatTriggered, lintTriggered
  - [ ] lintCompleted, lintFailed
  - [ ] cursorMoved, selectionChanged
- [ ] Implement lint effect (Effect.run with async)
- [ ] Test: Code editor state works

#### Code Editor Component
- [ ] Create `packages/core/src/components/code-editor/CodeEditor.svelte`
- [ ] Integrate CodeMirror 6
- [ ] Connect editor callbacks to reducer
- [ ] Add language mode support (JS, TS, HTML, CSS, etc.)
- [ ] Add theme support (light/dark)
- [ ] Sync external content changes with $effect
- [ ] Test: Editor works with CodeMirror

#### TestStore Tests
- [ ] Create `packages/core/tests/code-editor.test.ts`
- [ ] Test: Content changes dispatch actions
- [ ] Test: Language switching
- [ ] Test: Lint triggers and completes
- [ ] Test: Format triggers
- [ ] Test: Cursor and selection tracking

#### Examples
- [ ] Create `examples/code-editor/` directory
- [ ] Multi-language code editor example
- [ ] Live code preview example (HTML/CSS/JS)
- [ ] README with CodeMirror integration patterns

**Checkpoint**: ✅ Code editor complete

---

### Days 6+: Documentation + Polish

**Goal**: Final polish and comprehensive documentation

#### Documentation Pass
- [ ] Review all component APIs for consistency
- [ ] Ensure all 73+ components have examples
- [ ] Create **migration guide from shadcn-svelte**
- [ ] Create **integration guide for parent reducers**
- [ ] Document **styling customization** (CSS variables, Tailwind)
- [ ] Document **animation customization** (Motion One, spring configs)
- [ ] Document **advanced wrapper patterns** (D3, Tiptap, CodeMirror)
- [ ] Create **complete example app** showcasing all components

#### Final Testing
- [ ] Run all TestStore tests (ensure 100% pass)
- [ ] Run all browser tests (ensure 100% pass)
- [ ] Run all accessibility tests (0 violations)
- [ ] Visual regression test pass
- [ ] Test component registry/CLI on fresh project

#### Styleguide Polish
- [ ] Ensure all 73+ components are in styleguide
- [ ] Add category filters to styleguide
- [ ] Add search functionality
- [ ] Add dark mode toggle
- [ ] Deploy styleguide to demo site

**Checkpoint**: ✅ Phase 6 Complete!

---

## Completion Criteria

### All Components (50+)
- [ ] 20+ Tier 1 (Atomic) components
- [ ] 15+ Tier 2 (Stateful) components
- [ ] 5+ Tier 3 (Advanced) components

### Quality Gates
- [ ] All components have visual regression tests
- [ ] All stateful components have TestStore tests (90%+ coverage)
- [ ] All components have accessibility tests (0 violations)
- [ ] All components have examples
- [ ] All components have API documentation
- [ ] CLI tool works on fresh projects
- [ ] All animations use Motion One (0 CSS transitions)
- [ ] Dark mode works for all components

### Documentation
- [ ] Component catalog complete
- [ ] Integration guides written
- [ ] Migration guide from shadcn-svelte
- [ ] Form system guide published
- [ ] Testing guide published
- [ ] Example app showcasing all components

---

## Notes

- **Priority**: Form system is most critical - validate architecture early
- **Testing**: Don't skip TestStore tests for stateful components
- **Flexibility**: Order can adjust based on learnings from Form system
- **Integration**: Test atomic components in context of stateful components
- **Documentation**: Document patterns as we discover them

---

## Next Phase

After Phase 6 completion:
- **Phase 5**: Polish, optimization, final documentation, 1.0.0 release
