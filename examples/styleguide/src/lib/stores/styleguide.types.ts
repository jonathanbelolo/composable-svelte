// ============================================================================
// State Types
// ============================================================================

export type Theme = 'light' | 'dark';

export interface StyleguideState {
  theme: Theme;
  selectedComponent: string | null;
}

// ============================================================================
// Action Types
// ============================================================================

export type StyleguideAction =
  | { type: 'themeToggled' }
  | { type: 'componentSelected'; componentId: string }
  | { type: 'homeSelected' };

// ============================================================================
// Initial State Factory
// ============================================================================

export function createInitialStyleguideState(): StyleguideState {
  return {
    theme: 'light',
    selectedComponent: null
  };
}
