// ============================================================================
// Component Registry
// ============================================================================

export interface ComponentInfo {
  id: string;
  name: string;
  category: string;
  description: string;
}

export const COMPONENT_CATEGORIES = [
  'Navigation Components',
  'Form System',
  'Form Components Advanced',
  'Data Display',
  'Foundational Components',
  'Typography',
  'Visual Feedback',
  'Layout'
] as const;

export type ComponentCategory = typeof COMPONENT_CATEGORIES[number];

// Placeholder registry - will be populated as components are added
export const COMPONENT_REGISTRY: ComponentInfo[] = [
  // Navigation Components
  { id: 'modal', name: 'Modal', category: 'Navigation Components', description: 'Full-screen overlay dialogs' },
  { id: 'sheet', name: 'Sheet', category: 'Navigation Components', description: 'Bottom/side sliding panels' },
  { id: 'drawer', name: 'Drawer', category: 'Navigation Components', description: 'Permanent side navigation' },
  { id: 'sidebar', name: 'Sidebar', category: 'Navigation Components', description: 'Collapsible side panel' },
  { id: 'alert', name: 'Alert', category: 'Navigation Components', description: 'Action confirmation dialogs' },
  { id: 'popover', name: 'Popover', category: 'Navigation Components', description: 'Floating context panels' },
  { id: 'dropdown-menu', name: 'Dropdown Menu', category: 'Navigation Components', description: 'Context menus' },
  { id: 'tabs', name: 'Tabs', category: 'Navigation Components', description: 'Tabbed content panels' },
  { id: 'navigation-stack', name: 'Navigation Stack', category: 'Navigation Components', description: 'Stack-based navigation' },
  { id: 'breadcrumb', name: 'Breadcrumb', category: 'Navigation Components', description: 'Hierarchical navigation' },

  // Foundational Components
  { id: 'button', name: 'Button', category: 'Foundational Components', description: 'Interactive button element' },
  { id: 'card', name: 'Card', category: 'Foundational Components', description: 'Content container' },
  { id: 'separator', name: 'Separator', category: 'Foundational Components', description: 'Visual divider' },
  { id: 'badge', name: 'Badge', category: 'Foundational Components', description: 'Status indicator' },
  { id: 'avatar', name: 'Avatar', category: 'Foundational Components', description: 'User profile image' },
  { id: 'tooltip', name: 'Tooltip', category: 'Foundational Components', description: 'Hover information' },
  { id: 'skeleton', name: 'Skeleton', category: 'Foundational Components', description: 'Loading placeholder' },
  { id: 'aspect-ratio', name: 'Aspect Ratio', category: 'Foundational Components', description: 'Responsive container ratio' },

  // Form System (Basic)
  { id: 'form', name: 'Form', category: 'Form System', description: 'Form container with validation' },
  { id: 'input', name: 'Input', category: 'Form System', description: 'Text input field' },
  { id: 'label', name: 'Label', category: 'Form System', description: 'Form field label' },
  { id: 'checkbox', name: 'Checkbox', category: 'Form System', description: 'Boolean selection' },
  { id: 'radio-group', name: 'Radio Group', category: 'Form System', description: 'Single selection from options' },
  { id: 'switch', name: 'Switch', category: 'Form System', description: 'Toggle switch' },
  { id: 'textarea', name: 'Textarea', category: 'Form System', description: 'Multi-line text input' },
  { id: 'select', name: 'Select', category: 'Form System', description: 'Dropdown selection' },
  { id: 'slider', name: 'Slider', category: 'Form System', description: 'Range input slider' },

  // Visual Feedback
  { id: 'toast', name: 'Toast', category: 'Visual Feedback', description: 'Temporary notifications' },
  { id: 'progress', name: 'Progress', category: 'Visual Feedback', description: 'Progress indicator' },
  { id: 'spinner', name: 'Spinner', category: 'Visual Feedback', description: 'Loading spinner' },
];

export function getComponentsByCategory(category: ComponentCategory): ComponentInfo[] {
  return COMPONENT_REGISTRY.filter(c => c.category === category);
}

export function getComponentById(id: string): ComponentInfo | undefined {
  return COMPONENT_REGISTRY.find(c => c.id === id);
}
