/**
 * Component exports for @composable-svelte/core
 * Separated into its own file for better organization
 */

// ============================================================================
// UI Components
// ============================================================================

// Layout & Structure
export { default as Box } from './components/ui/box/Box.svelte';
export { default as Panel } from './components/ui/panel/Panel.svelte';
export { default as Separator } from './components/ui/separator/Separator.svelte';
export { default as AspectRatio } from './components/ui/aspect-ratio/AspectRatio.svelte';

// Typography
export { default as Text } from './components/ui/text/Text.svelte';
export { default as Heading } from './components/ui/heading/Heading.svelte';

// Interactive Elements
export { default as Button } from './components/ui/button/Button.svelte';
export { default as IconButton } from './components/ui/icon-button/IconButton.svelte';
export { default as ButtonGroup } from './components/ui/button-group/ButtonGroup.svelte';
export { default as Kbd } from './components/ui/kbd/Kbd.svelte';

// Form Controls
export { default as Input } from './components/ui/input/Input.svelte';
export { default as Textarea } from './components/ui/textarea/Textarea.svelte';
export { default as Checkbox } from './components/ui/checkbox/Checkbox.svelte';
export { default as Radio } from './components/ui/radio/Radio.svelte';
export { default as RadioGroup } from './components/ui/radio/RadioGroup.svelte';
export { default as Switch } from './components/ui/switch/Switch.svelte';
export { default as Slider } from './components/ui/slider/Slider.svelte';
export { default as Select } from './components/ui/select/Select.svelte';
export { default as Combobox } from './components/ui/combobox/Combobox.svelte';
export { default as Label } from './components/ui/label/Label.svelte';
export { default as FileUpload } from './components/ui/file-upload/FileUpload.svelte';

// Display Components
export { default as Card } from './components/ui/card/Card.svelte';
export { default as CardHeader } from './components/ui/card/CardHeader.svelte';
export { default as CardTitle } from './components/ui/card/CardTitle.svelte';
export { default as CardDescription } from './components/ui/card/CardDescription.svelte';
export { default as CardContent } from './components/ui/card/CardContent.svelte';
export { default as CardFooter } from './components/ui/card/CardFooter.svelte';

export { default as Badge } from './components/ui/badge/Badge.svelte';
export { default as Avatar } from './components/ui/avatar/Avatar.svelte';
export { default as Tooltip } from './components/ui/tooltip/Tooltip.svelte';
export { default as TooltipPrimitive } from './components/ui/tooltip/TooltipPrimitive.svelte';

// Feedback Components
export { default as Progress } from './components/ui/progress/Progress.svelte';
export { default as Spinner } from './components/ui/spinner/Spinner.svelte';
export { default as Skeleton } from './components/ui/skeleton/Skeleton.svelte';
export { default as Empty } from './components/ui/empty/Empty.svelte';

// Banner & Alerts
export { default as Banner } from './components/ui/banner/Banner.svelte';
export { default as BannerTitle } from './components/ui/banner/BannerTitle.svelte';
export { default as BannerDescription } from './components/ui/banner/BannerDescription.svelte';

// Navigation UI
export { default as Breadcrumb } from './components/ui/breadcrumb/Breadcrumb.svelte';
export { default as BreadcrumbList } from './components/ui/breadcrumb/BreadcrumbList.svelte';
export { default as BreadcrumbItem } from './components/ui/breadcrumb/BreadcrumbItem.svelte';
export { default as BreadcrumbLink } from './components/ui/breadcrumb/BreadcrumbLink.svelte';
export { default as BreadcrumbPage } from './components/ui/breadcrumb/BreadcrumbPage.svelte';
export { default as BreadcrumbSeparator } from './components/ui/breadcrumb/BreadcrumbSeparator.svelte';
export { default as BreadcrumbEllipsis } from './components/ui/breadcrumb/BreadcrumbEllipsis.svelte';

export { default as Pagination } from './components/ui/pagination/Pagination.svelte';
export { default as DropdownMenu } from './components/ui/dropdown-menu/DropdownMenu.svelte';
export { default as TreeView } from './components/ui/tree-view/TreeView.svelte';

// Interactive Containers
export { default as Accordion } from './components/ui/accordion/Accordion.svelte';
export { default as AccordionItem } from './components/ui/accordion/AccordionItem.svelte';
export { default as AccordionTrigger } from './components/ui/accordion/AccordionTrigger.svelte';
export { default as AccordionContent } from './components/ui/accordion/AccordionContent.svelte';

export { default as Collapsible } from './components/ui/collapsible/Collapsible.svelte';
export { default as CollapsibleTrigger } from './components/ui/collapsible/CollapsibleTrigger.svelte';
export { default as CollapsibleContent } from './components/ui/collapsible/CollapsibleContent.svelte';

// Advanced Components
export { default as Calendar } from './components/ui/calendar/Calendar.svelte';
export { default as Carousel } from './components/ui/carousel/Carousel.svelte';

// Media Components
export { default as ImageGallery } from './components/image-gallery/ImageGallery.svelte';
export { default as ImageLightbox } from './components/image-gallery/ImageLightbox.svelte';

// Re-export image gallery types and utilities
export type {
	GalleryImage,
	ImageGalleryState,
	ImageGalleryAction,
	ImageGalleryDependencies,
	ImageGalleryConfig,
	LightboxState,
	TouchState,
	PresentationEvent as ImageGalleryPresentationEvent
} from './components/image-gallery/image-gallery.types.js';

export {
	imageGalleryReducer,
	createInitialImageGalleryState
} from './components/image-gallery/image-gallery.reducer.js';

// ============================================================================
// Navigation Components
// ============================================================================

// High-level navigation components
export { default as Modal } from './navigation-components/Modal.svelte';
export { default as Sheet } from './navigation-components/Sheet.svelte';
export { default as Drawer } from './navigation-components/Drawer.svelte';
export { default as Sidebar } from './navigation-components/Sidebar.svelte';
export { default as Popover } from './navigation-components/Popover.svelte';
export { default as Alert } from './navigation-components/Alert.svelte';
export { default as Tabs } from './navigation-components/Tabs.svelte';

export { default as NavigationStack } from './navigation-components/NavigationStack.svelte';
export { default as AnimatedNavigationStack } from './navigation-components/AnimatedNavigationStack.svelte';
export { default as DestinationRouter } from './navigation-components/DestinationRouter.svelte';

// Primitive components (for advanced users)
export { default as ModalPrimitive } from './navigation-components/primitives/ModalPrimitive.svelte';
export { default as SheetPrimitive } from './navigation-components/primitives/SheetPrimitive.svelte';
export { default as DrawerPrimitive } from './navigation-components/primitives/DrawerPrimitive.svelte';
export { default as SidebarPrimitive } from './navigation-components/primitives/SidebarPrimitive.svelte';
export { default as PopoverPrimitive } from './navigation-components/primitives/PopoverPrimitive.svelte';
export { default as AlertPrimitive } from './navigation-components/primitives/AlertPrimitive.svelte';
export { default as TabsPrimitive } from './navigation-components/primitives/TabsPrimitive.svelte';
export { default as NavigationStackPrimitive } from './navigation-components/primitives/NavigationStackPrimitive.svelte';
