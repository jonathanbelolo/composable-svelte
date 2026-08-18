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
// These use `export *` rather than naming the components, so that each
// component's reducer, state factory and — most importantly — its prop types
// travel with it. Naming only the components left `SelectOption`, `TreeNode`,
// `ComboboxOption` and friends unreachable from every public entry point, which
// made those props impossible to type and `Collapsible` impossible to use at
// all (it hard-requires a store whose reducer could not be imported).
export * from './accordion/index.js';
export * from './collapsible/index.js';

// Interactive
export * from './tooltip/index.js';
export * from './dropdown-menu/index.js';
export * from './select/index.js';
export * from './combobox/index.js';
export * from './pagination/index.js';
export * from './calendar/index.js';
export * from './carousel/index.js';
export * from './tree-view/index.js';
export * from './file-upload/index.js';

// `AccordionItem` is both a component (accordion/AccordionItem.svelte) and the
// item type in accordion.types.ts. The component wins the `export *` above, so
// the type is re-exported under a distinct name to keep it usable.
export type { AccordionItem as AccordionItemData } from './accordion/accordion.types.js';

// Command Palette
export {
	Command,
	CommandInput,
	CommandList,
	CommandGroup,
	CommandItem
} from '../command/index.js';

// Toast/Notifications
export {
	Toaster,
	Toast,
	ToastTitle,
	ToastDescription,
	ToastAction
} from '../toast/index.js';
