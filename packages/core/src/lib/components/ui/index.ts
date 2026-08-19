/**
 * UI Component Library Exports
 *
 * @packageDocumentation
 */

// Button
export { Button } from './button/index.js';
export { ButtonGroup } from './button-group/index.js';
export { IconButton } from './icon-button/index.js';

// Form Elements
export { Input } from './input/index.js';
export { Label } from './label/index.js';
export { Textarea } from './textarea/index.js';
export { Checkbox } from './checkbox/index.js';
export { Radio, RadioGroup } from './radio/index.js';
export { Switch } from './switch/index.js';
export { Slider } from './slider/index.js';

// Feedback
export { Spinner } from './spinner/index.js';
export { Badge } from './badge/index.js';
export { Avatar } from './avatar/index.js';
export { Skeleton } from './skeleton/index.js';
export { Progress } from './progress/index.js';

// Layout
export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card/index.js';
export { Separator } from './separator/index.js';
export { Panel } from './panel/index.js';
export { Box } from './box/index.js';
export { AspectRatio } from './aspect-ratio/index.js';

// Navigation
export {
	Breadcrumb,
	BreadcrumbList,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbPage,
	BreadcrumbSeparator,
	BreadcrumbEllipsis
} from './breadcrumb/index.js';

// Typography
export { Heading } from './heading/index.js';
export { Text } from './text/index.js';
export { Kbd } from './kbd/index.js';

// Visual
export { Banner, BannerTitle, BannerDescription } from './banner/index.js';
export { Empty } from './empty/index.js';

// Content Organization
//
// Listed explicitly rather than with `export *`. Each component's reducer,
// state factory and — most importantly — its prop types have to travel with it:
// naming only the components left `SelectOption`, `TreeNode`, `ComboboxOption`
// and friends unreachable from every public entry point, which made those props
// impossible to type and `Collapsible` impossible to use at all. But `export *`
// then swept up internal helpers (`formatFileSize`, `getCalendarDays`, …) that
// nothing outside their own directory references, so the surface is enumerated
// here instead of inferred.

export {
	Accordion,
	AccordionItem,
	AccordionTrigger,
	AccordionContent,
	createInitialAccordionState,
	accordionReducer
} from './accordion/index.js';
export type {
	AccordionState,
	AccordionAction,
	AccordionDependencies
} from './accordion/index.js';
// `AccordionItem` is both a component and the item type in accordion.types.ts.
// The component keeps the name; the type gets a distinct one.
export type { AccordionItem as AccordionItemData } from './accordion/accordion.types.js';

export {
	Collapsible,
	CollapsibleTrigger,
	CollapsibleContent,
	createInitialCollapsibleState,
	collapsibleReducer
} from './collapsible/index.js';
export type {
	CollapsibleState,
	CollapsibleAction,
	CollapsibleDependencies
} from './collapsible/index.js';

// Interactive

export { Tooltip, TooltipPrimitive, tooltipReducer, initialTooltipState } from './tooltip/index.js';
export type {
	TooltipState,
	TooltipAction,
	TooltipDependencies,
	TooltipContent
} from './tooltip/index.js';

export {
	DropdownMenu,
	createInitialDropdownMenuState,
	dropdownMenuReducer
} from './dropdown-menu/index.js';
export type {
	MenuItem,
	DropdownMenuState,
	DropdownMenuAction,
	DropdownMenuDependencies,
	DropdownMenuPresentationEvent
} from './dropdown-menu/index.js';

export { Select, createInitialSelectState, selectReducer } from './select/index.js';
export type {
	SelectOption,
	SelectState,
	SelectAction,
	SelectDependencies
} from './select/index.js';

export { Combobox, createInitialComboboxState, comboboxReducer } from './combobox/index.js';
export type {
	ComboboxOption,
	ComboboxState,
	ComboboxAction,
	ComboboxDependencies
} from './combobox/index.js';
// `DropdownState` / `DropdownStatus` are members of `ComboboxState`, so they
// have to be nameable — but those names are too generic to sit in a shared
// namespace.
export type {
	DropdownState as ComboboxDropdownState,
	DropdownStatus as ComboboxDropdownStatus
} from './combobox/combobox.types.js';

export {
	Pagination,
	createInitialPaginationState,
	paginationReducer
} from './pagination/index.js';
export type {
	PaginationState,
	PaginationAction,
	PaginationDependencies
} from './pagination/index.js';

// The six date helpers in calendar.types.ts are deliberately not re-exported —
// nothing outside calendar/ uses them.
export { Calendar, createInitialCalendarState, calendarReducer } from './calendar/index.js';
export type {
	CalendarMode,
	DateRange,
	CalendarState,
	CalendarAction,
	CalendarDependencies
} from './calendar/index.js';

export { Carousel, createInitialCarouselState, carouselReducer } from './carousel/index.js';
export type {
	CarouselSlide,
	CarouselDirection,
	CarouselState,
	CarouselAction,
	CarouselDependencies,
	CarouselProps
} from './carousel/index.js';

export { TreeView, createInitialTreeViewState, treeViewReducer } from './tree-view/index.js';
export type {
	TreeNode,
	TreeViewState,
	TreeViewAction,
	TreeViewDependencies
} from './tree-view/index.js';

// `generateFileId` and `formatFileSize` are deliberately not re-exported.
export {
	FileUpload,
	createInitialFileUploadState,
	fileUploadReducer
} from './file-upload/index.js';
export type {
	UploadStatus,
	UploadedFile,
	ValidationErrorType,
	FileUploadState,
	FileUploadAction,
	FileValidationConfig,
	FileUploadDependencies,
	FileUploadProps
} from './file-upload/index.js';
// Renamed: the API layer exports a `ValidationError` *class* from the root
// entry, and two different `ValidationError`s in one package is a trap.
export type { ValidationError as FileValidationError } from './file-upload/file-upload.types.js';
