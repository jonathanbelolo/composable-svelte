/**
 * Keyboard navigation utilities for accessible components.
 * Adapted from Radix UI Roving Focus patterns.
 */

export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/**
 * Handle arrow key navigation in a list.
 *
 * @param event - Keyboard event
 * @param currentIndex - Current focused index
 * @param itemCount - Total number of items
 * @param orientation - List orientation (horizontal or vertical)
 * @returns New index to focus, or null if key not handled
 *
 * @example
 * ```typescript
 * function handleKeyDown(event: KeyboardEvent) {
 *   const newIndex = handleArrowNavigation(
 *     event,
 *     activeIndex,
 *     tabs.length,
 *     'horizontal'
 *   );
 *
 *   if (newIndex !== null) {
 *     setActiveIndex(newIndex);
 *   }
 * }
 * ```
 */
export function handleArrowNavigation(
  event: KeyboardEvent,
  currentIndex: number,
  itemCount: number,
  orientation: 'horizontal' | 'vertical' = 'vertical'
): number | null {
  const key = event.key as ArrowKey;

  // Determine next/previous keys based on orientation
  const nextKeys: ArrowKey[] =
    orientation === 'horizontal' ? ['ArrowRight'] : ['ArrowDown'];
  const prevKeys: ArrowKey[] =
    orientation === 'horizontal' ? ['ArrowLeft'] : ['ArrowUp'];

  if (nextKeys.includes(key)) {
    event.preventDefault();
    return (currentIndex + 1) % itemCount; // Wrap to start
  }

  if (prevKeys.includes(key)) {
    event.preventDefault();
    return (currentIndex - 1 + itemCount) % itemCount; // Wrap to end
  }

  // Home key: jump to first item
  if (event.key === 'Home') {
    event.preventDefault();
    return 0;
  }

  // End key: jump to last item
  if (event.key === 'End') {
    event.preventDefault();
    return itemCount - 1;
  }

  return null; // Key not handled
}

/**
 * Create a focus trap that keeps focus within a container.
 *
 * Used for modals and dialogs to prevent Tab from leaving the modal.
 *
 * @param container - Container element to trap focus within
 * @returns Cleanup function
 *
 * @example
 * ```typescript
 * $effect(() => {
 *   if (visible) {
 *     const cleanup = createFocusTrap(containerElement);
 *     return cleanup;
 *   }
 * });
 * ```
 */
export function createFocusTrap(container: HTMLElement): () => void {
  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;

    const focusableElements = Array.from(
      container.querySelectorAll<HTMLElement>(focusableSelector)
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    // Shift+Tab on first element: focus last
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement?.focus();
      return;
    }

    // Tab on last element: focus first
    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement?.focus();
      return;
    }
  };

  container.addEventListener('keydown', handleKeyDown);

  // Focus first element initially
  const firstFocusable = container.querySelector<HTMLElement>(focusableSelector);
  firstFocusable?.focus();

  return () => {
    container.removeEventListener('keydown', handleKeyDown);
  };
}
