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
  'Form Components - Advanced',
  'Data Display',
  'Data Visualization',
  'Code Components',
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
  { id: 'button-group', name: 'Button Group', category: 'Foundational Components', description: 'Grouped buttons with connected styling' },
  { id: 'icon-button', name: 'Icon Button', category: 'Foundational Components', description: 'Icon-only button' },
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

  // Form Components - Advanced
  { id: 'combobox', name: 'Combobox', category: 'Form Components - Advanced', description: 'Searchable select with async loading' },
  { id: 'calendar', name: 'Calendar', category: 'Form Components - Advanced', description: 'Date and range picker calendar' },
  { id: 'file-upload', name: 'File Upload', category: 'Form Components - Advanced', description: 'Drag & drop file upload with progress tracking' },

  // Visual Feedback
  { id: 'toast', name: 'Toast', category: 'Visual Feedback', description: 'Temporary notifications' },
  { id: 'progress', name: 'Progress', category: 'Visual Feedback', description: 'Progress indicator' },
  { id: 'spinner', name: 'Spinner', category: 'Visual Feedback', description: 'Loading spinner' },

  // Data Display
  { id: 'accordion', name: 'Accordion', category: 'Data Display', description: 'Collapsible sections for organizing content' },
  { id: 'collapsible', name: 'Collapsible', category: 'Data Display', description: 'Expandable/collapsible content sections' },
  { id: 'pagination', name: 'Pagination', category: 'Data Display', description: 'Page navigation controls' },
  { id: 'empty', name: 'Empty', category: 'Data Display', description: 'Empty state placeholder' },
  { id: 'carousel', name: 'Carousel', category: 'Data Display', description: 'Sliding content carousel with navigation' },
  { id: 'tree-view', name: 'Tree View', category: 'Data Display', description: 'Hierarchical tree with expand/collapse' },

  // Data Visualization
  { id: 'scatter-chart', name: 'Scatter Chart', category: 'Data Visualization', description: 'Interactive scatter plot with tooltips and selection - powered by Observable Plot' },
  { id: 'line-chart', name: 'Line Chart', category: 'Data Visualization', description: 'Time series line chart with hover interactions - state-driven visualization' },
  { id: 'bar-chart', name: 'Bar Chart', category: 'Data Visualization', description: 'Categorical bar chart with selection support - built with Composable Architecture' },

  // Code Components
  { id: 'code-highlight', name: 'Code Highlight', category: 'Code Components', description: 'Syntax highlighting for code snippets with Prism.js' },
  { id: 'code-editor', name: 'Code Editor', category: 'Code Components', description: 'Interactive code editor with CodeMirror 6' },
  { id: 'node-canvas', name: 'Node Canvas', category: 'Code Components', description: 'Node-based canvas editor with SvelteFlow for visual programming' },
  { id: 'streaming-chat', name: 'Streaming Chat', category: 'Code Components', description: 'Transport-agnostic streaming chat interface for LLM interactions' },
  { id: 'voice-input', name: 'Voice Input', category: 'Code Components', description: 'Standalone voice input with push-to-talk and conversation modes' },
  { id: 'collaborative-chat', name: 'Collaborative Chat', category: 'Code Components', description: 'Real-time presence tracking, typing indicators, and live cursors for multi-user chat' },
  { id: 'audio-player', name: 'Audio Player', category: 'Code Components', description: 'Embeddable audio player with playlist support, advanced controls, and modal expansion' },

  // Typography
  { id: 'heading', name: 'Heading', category: 'Typography', description: 'Semantic heading component' },
  { id: 'text', name: 'Text', category: 'Typography', description: 'Text component with variants' },
  { id: 'kbd', name: 'Kbd', category: 'Typography', description: 'Keyboard shortcut display' },

  // Layout
  { id: 'box', name: 'Box', category: 'Layout', description: 'Generic container component' },
  { id: 'panel', name: 'Panel', category: 'Layout', description: 'Content panel container' },
  { id: 'banner', name: 'Banner', category: 'Layout', description: 'Notification/announcement banner' },
];

export function getComponentsByCategory(category: ComponentCategory): ComponentInfo[] {
  return COMPONENT_REGISTRY.filter(c => c.category === category);
}

export function getComponentById(id: string): ComponentInfo | undefined {
  return COMPONENT_REGISTRY.find(c => c.id === id);
}
