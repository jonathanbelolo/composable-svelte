# Phase 6: Component Library - Implementation TODO

**Strategy**: Foundation-First Hybrid (Vertical Slices)
**Timeline**: 5 weeks
**Status**: In Progress - Week 2, Day 4 Complete ✅

---

## Progress Tracking

- [x] **Week 1, Day 1**: Infrastructure & Theme System ✅
- [x] **Week 1, Day 2**: Foundational Atomic Components ✅
- [x] **Week 1, Day 3-5**: Form System (Reducer, Types, Zod Integration) ✅
- [x] **Week 2, Day 1**: Form UI Components ✅
- [x] **Week 2, Day 2**: Form Atomic Inputs ✅
- [x] **Week 2, Day 3**: Integrated Form Example (Browser Tested) ✅
- [x] **Week 2, Day 4**: Form Examples (Contact, Registration, Multi-Step) ✅
- [ ] **Week 2, Day 5**: Remaining Atomic Components
- [ ] **Week 3**: DataTable + Navigation Components
- [ ] **Week 4**: Remaining Stateful Components
- [ ] **Week 5**: Advanced Components + Polish

**Components Complete**: 23 / 50+
- Foundation: Button, Input, Label, Spinner, Card (6), Separator
- Form: Form, FormField, FormControl, FormItem, FormLabel, FormMessage, FormDescription (7)
- Inputs: Textarea, Checkbox, Radio, RadioGroup, Switch (5)

**Form System**: Complete with 23/23 unit tests passing ✅
**Examples**: 3 complete examples with 55 browser tests passing ✅
  - Contact Form (13 tests) - Basic integrated mode with async validation
  - Registration Form (17 tests) - Cross-field validation with Zod refinements
  - Multi-Step Form (25 tests) - 3-step wizard with data accumulation

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

### Day 5: Remaining Atomic Components (Batch)

**Goal**: Complete Tier 1 component library

#### Feedback Components
- [ ] **Badge** - Status indicator with variants
- [ ] **Avatar** - User image with fallback
- [ ] **Skeleton** - Loading placeholder
- [ ] **Progress** - Progress bar
- [ ] Already have: Spinner ✓

#### Layout Components
- [ ] Already have: Card ✓
- [ ] **Panel** - Generic content container
- [ ] **Box** - Primitive with padding/margin
- [ ] Already have: Separator ✓
- [ ] **Aspect Ratio** - Maintain aspect ratio wrapper

#### Typography Components
- [ ] **Heading** - H1-H6 with consistent styling
- [ ] **Text** - Paragraph with variants
- [ ] Already have: Label ✓
- [ ] **Kbd** - Keyboard key display

#### Visual Components
- [ ] **Alert** - Static informational message (not Alert Dialog)
- [ ] **Empty** - Empty state placeholder

#### Button Variants
- [ ] Already have: Button ✓
- [ ] **Button Group** - Multiple buttons together
- [ ] **Icon Button** - Button with icon only
- [ ] **Link Button** - Button styled as link

**Checkpoint**: ✅ All Tier 1 (Atomic) components complete

---

## Week 3: DataTable + Navigation Components (5 days)

### Day 1-2: DataTable System

**Goal**: Build complex stateful component with server integration

#### DataTable Reducer
- [ ] Create `components/data-table/table.reducer.ts`
- [ ] Define `TableState<T>` interface
  - [ ] data: T[]
  - [ ] sortColumn, sortDirection
  - [ ] filters: Filter<T>[]
  - [ ] pagination: { page, pageSize, total }
  - [ ] selectedRows: Set<string>
  - [ ] isLoading: boolean
- [ ] Define `TableAction<T>` type
  - [ ] dataLoaded, sortChanged, filterAdded, filterRemoved
  - [ ] pageChanged, pageSizeChanged
  - [ ] rowSelected, rowDeselected, allRowsSelected, selectionCleared
  - [ ] refreshTriggered
- [ ] Implement reducer with all actions
- [ ] Implement sorting logic (stable sort)
- [ ] Implement filtering logic
- [ ] Implement pagination logic
- [ ] Implement selection logic
- [ ] Test: All table operations work

#### DataTable Components
- [ ] Create `DataTable.svelte` - Main table container
- [ ] Create `DataTableHeader.svelte` - Column headers with sorting
- [ ] Create `DataTableBody.svelte` - Table rows
- [ ] Create `DataTableRow.svelte` - Single row
- [ ] Create `DataTablePagination.svelte` - Pagination controls
- [ ] Add row animations (Motion One)
- [ ] Add loading states
- [ ] Add empty state
- [ ] Test: Table renders correctly

#### TestStore Tests
- [ ] Test: Sorting changes
- [ ] Test: Multi-column sorting
- [ ] Test: Filtering
- [ ] Test: Filter composition
- [ ] Test: Pagination
- [ ] Test: Row selection
- [ ] Test: Bulk selection
- [ ] Test: Data loading

#### Examples
- [ ] Product list example
- [ ] User management example
- [ ] Analytics dashboard example

**Checkpoint**: ✅ DataTable system complete

---

### Day 3-4: Navigation Component Extensions

**Goal**: Extend Phase 4 navigation with more overlay types

#### Popover Component
- [ ] Create `navigation-components/Popover.svelte`
- [ ] Create `PopoverPrimitive.svelte`
- [ ] Integrate `destination` + `presentation` pattern
- [ ] Add floating-ui positioning
- [ ] Add Motion One animations
- [ ] Test: Popover opens/closes with animations

#### Tooltip Component
- [ ] Create `navigation-components/Tooltip.svelte`
- [ ] Create `TooltipPrimitive.svelte`
- [ ] Integrate `destination` + `presentation` pattern
- [ ] Add hover delay (300ms)
- [ ] Add positioning logic
- [ ] Add Motion One animations
- [ ] Test: Tooltip shows on hover with delay

#### Dropdown Menu Component
- [ ] Create `navigation-components/DropdownMenu.svelte`
- [ ] Create `DropdownMenuPrimitive.svelte`
- [ ] Integrate `destination` + `presentation` pattern
- [ ] Menu items as navigation destinations
- [ ] Add keyboard navigation (arrows, enter, esc)
- [ ] Add nested menu support
- [ ] Add Motion One animations
- [ ] Test: Menu navigation works

#### Context Menu Component
- [ ] Create `navigation-components/ContextMenu.svelte`
- [ ] Create `ContextMenuPrimitive.svelte`
- [ ] Right-click trigger
- [ ] Position at cursor
- [ ] Integrate `destination` + `presentation` pattern
- [ ] Add Motion One animations
- [ ] Test: Context menu on right-click

#### Hover Card Component
- [ ] Create `navigation-components/HoverCard.svelte`
- [ ] Create `HoverCardPrimitive.svelte`
- [ ] Hover trigger with delay
- [ ] Integrate `destination` + `presentation` pattern
- [ ] Add Motion One animations
- [ ] Test: Hover card shows on hover

#### Navigation Tests
- [ ] Browser tests for all components
- [ ] Animation tests
- [ ] Keyboard navigation tests
- [ ] Destination pattern tests

**Checkpoint**: ✅ Navigation components complete

---

### Day 5: Pagination + Slider Components

**Goal**: Complete utility components

#### Pagination Component
- [ ] Create `components/pagination/Pagination.svelte`
- [ ] Page number display
- [ ] Previous/Next buttons
- [ ] Jump to page
- [ ] Items per page selector
- [ ] Test: Pagination controls work

#### Slider Component
- [ ] Create `components/ui/slider/Slider.svelte`
- [ ] Single value slider
- [ ] Range slider (two handles)
- [ ] Add action dispatch
- [ ] Add accessibility (role="slider")
- [ ] Test: Slider works

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

### Day 3: Select & Combobox

**Goal**: Build dropdown selection components

#### Select Component
- [ ] Create `components/select/select.reducer.ts`
- [ ] Define state (items, selected, isOpen)
- [ ] Implement selection logic
- [ ] Test: Select works

- [ ] Create `Select.svelte` components
- [ ] Add keyboard navigation
- [ ] Create examples

#### Combobox Component
- [ ] Create `components/combobox/combobox.reducer.ts`
- [ ] Define state (query, items, filtered, selected, isOpen, isLoading)
- [ ] Implement search with debouncing
- [ ] Implement async item loading
- [ ] Test: Combobox search and selection works

- [ ] Create `Combobox.svelte` components
- [ ] Add keyboard navigation
- [ ] Create examples (autocomplete)

**Checkpoint**: ✅ Select and Combobox complete

---

### Day 4: Content Organization Components

**Goal**: Build Tabs, Accordion, Collapsible, TreeView

#### Tabs Component
- [ ] Create `components/tabs/tabs.reducer.ts`
- [ ] Define state (tabs, activeTab)
- [ ] Implement tab switching
- [ ] Test: Tab switching works

- [ ] Create `Tabs.svelte` components
- [ ] Add keyboard navigation
- [ ] Create examples

#### Accordion Component
- [ ] Create `components/accordion/accordion.reducer.ts`
- [ ] Define state (items, expandedItems)
- [ ] Implement expand/collapse with animations
- [ ] Test: Accordion works

- [ ] Create `Accordion.svelte` components
- [ ] Add Motion One animations
- [ ] Create examples

#### Collapsible Component
- [ ] Create `components/collapsible/Collapsible.svelte`
- [ ] Implement toggle with animation
- [ ] Test: Collapsible works

#### TreeView Component
- [ ] Create `components/tree/tree.reducer.ts`
- [ ] Define state (nodes, expanded, selected)
- [ ] Implement expand/collapse
- [ ] Implement selection
- [ ] Implement lazy loading
- [ ] Test: TreeView works

- [ ] Create `TreeView.svelte` components
- [ ] Add keyboard navigation
- [ ] Create examples (file browser)

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

## Week 5: Advanced Components + Polish (5 days)

### Day 1-2: Calendar & Date Picker

**Goal**: Build date selection components

#### Calendar Reducer
- [ ] Create `components/calendar/calendar.reducer.ts`
- [ ] Define state (selectedDate, selectedRange, viewMonth, viewYear)
- [ ] Implement date selection
- [ ] Implement range selection
- [ ] Implement month/year navigation
- [ ] Implement date constraints (min/max, disabled dates)
- [ ] Test: Calendar state management works

#### Calendar Components
- [ ] Create `Calendar.svelte`
- [ ] Create `DatePicker.svelte`
- [ ] Create `RangePicker.svelte`
- [ ] Add keyboard navigation
- [ ] Test: Date selection works

#### Examples
- [ ] Booking form example
- [ ] Date range filter example

**Checkpoint**: ✅ Calendar system complete

---

### Day 3: Advanced Wrapper - Chart Component

**Goal**: Integrate D3 with reducer state

#### Chart Reducer
- [ ] Create `components/chart/chart.reducer.ts`
- [ ] Define state (data, selectedPoints, hoveredPoint, zoom)
- [ ] Implement point selection
- [ ] Implement hover tracking
- [ ] Implement zoom state
- [ ] Test: Chart state works

#### Chart Component
- [ ] Create `Chart.svelte` with D3 integration
- [ ] Implement reactive D3 rendering
- [ ] Connect user interactions to reducer
- [ ] Test: Chart renders and interactions work

#### Examples
- [ ] Line chart example
- [ ] Bar chart example
- [ ] Interactive scatter plot

**Checkpoint**: ✅ Chart component complete

---

### Day 4: Advanced Wrapper - Rich Text Editor

**Goal**: Integrate Tiptap with reducer state

#### Editor Reducer
- [ ] Create `components/rich-text/editor.reducer.ts`
- [ ] Define state (content, selection, isSaving, lastSaved)
- [ ] Implement content change tracking
- [ ] Implement auto-save with debouncing
- [ ] Test: Editor state management works

#### Editor Component
- [ ] Create `RichTextEditor.svelte` with Tiptap
- [ ] Create `Toolbar.svelte` for formatting
- [ ] Connect Tiptap to reducer
- [ ] Implement auto-save effects
- [ ] Test: Editor works

#### Examples
- [ ] Document editor example
- [ ] Comment editor example

**Checkpoint**: ✅ Rich text editor complete

---

### Day 5: Final Components + Documentation

**Goal**: Finish remaining components and polish

#### Infinite Scroll Component
- [ ] Create `components/infinite-scroll/scroll.reducer.ts`
- [ ] Define state (items, page, hasMore, isLoading)
- [ ] Implement load more effect
- [ ] Test: Infinite scroll works

- [ ] Create `InfiniteScroll.svelte`
- [ ] Add intersection observer
- [ ] Create examples

#### Code Editor (Optional if time)
- [ ] Wrap CodeMirror with reducer state
- [ ] Basic example

#### Documentation Pass
- [ ] Review all component APIs
- [ ] Ensure all examples work
- [ ] Create migration guide from shadcn-svelte
- [ ] Create integration guide for parent reducers
- [ ] Document styling customization
- [ ] Document animation customization

#### Final Testing
- [ ] Run all TestStore tests
- [ ] Run all browser tests
- [ ] Run all accessibility tests
- [ ] Visual regression test pass
- [ ] Test CLI on fresh project

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
