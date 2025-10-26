import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { page } from 'vitest/browser';
import { focusTrap } from '../../../src/lib/actions/focusTrap.js';

// ============================================================================
// Focus Trap Action Tests
// ============================================================================

describe('focusTrap action', () => {
  let container: HTMLDivElement;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    // Create container with focusable elements
    container = document.createElement('div');
    container.innerHTML = `
      <button id="btn1">Button 1</button>
      <button id="btn2">Button 2</button>
      <button id="btn3">Button 3</button>
    `;
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up
    if (cleanup) {
      cleanup();
      cleanup = undefined;
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('auto-focuses first focusable element on mount', async () => {
    const result = focusTrap(container, { autoFocus: true });
    cleanup = result.destroy;

    // Wait for setTimeout to execute
    await new Promise(resolve => setTimeout(resolve, 10));

    // First button should be focused
    const btn1 = container.querySelector('#btn1') as HTMLButtonElement;
    expect(document.activeElement).toBe(btn1);
  });

  it('does not auto-focus when autoFocus is false', async () => {
    const previousFocus = document.activeElement;
    const result = focusTrap(container, { autoFocus: false });
    cleanup = result.destroy;

    // Wait for setTimeout to execute
    await new Promise(resolve => setTimeout(resolve, 10));

    // Focus should not have changed
    expect(document.activeElement).toBe(previousFocus);
  });

  it('traps Tab key at end of focusable elements', async () => {
    const result = focusTrap(container, { autoFocus: false });
    cleanup = result.destroy;

    const btn3 = container.querySelector('#btn3') as HTMLButtonElement;
    btn3.focus();
    expect(document.activeElement).toBe(btn3);

    // Simulate Tab key
    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true
    });

    container.dispatchEvent(tabEvent);

    // Should wrap to first button
    await new Promise(resolve => setTimeout(resolve, 10));
    const btn1 = container.querySelector('#btn1') as HTMLButtonElement;
    expect(document.activeElement).toBe(btn1);
  });

  it('traps Shift+Tab key at start of focusable elements', async () => {
    const result = focusTrap(container, { autoFocus: false });
    cleanup = result.destroy;

    const btn1 = container.querySelector('#btn1') as HTMLButtonElement;
    btn1.focus();
    expect(document.activeElement).toBe(btn1);

    // Simulate Shift+Tab key
    const shiftTabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });

    container.dispatchEvent(shiftTabEvent);

    // Should wrap to last button
    await new Promise(resolve => setTimeout(resolve, 10));
    const btn3 = container.querySelector('#btn3') as HTMLButtonElement;
    expect(document.activeElement).toBe(btn3);
  });

  it('returns focus to returnFocus element on destroy', async () => {
    const triggerButton = document.createElement('button');
    triggerButton.id = 'trigger';
    document.body.appendChild(triggerButton);
    triggerButton.focus();

    const result = focusTrap(container, {
      autoFocus: true,
      returnFocus: triggerButton
    });

    // Wait for auto-focus
    await new Promise(resolve => setTimeout(resolve, 10));

    // Focus should have moved to first button
    const btn1 = container.querySelector('#btn1') as HTMLButtonElement;
    expect(document.activeElement).toBe(btn1);

    // Destroy focus trap
    result.destroy();

    // Wait for return focus
    await new Promise(resolve => setTimeout(resolve, 10));

    // Focus should have returned to trigger button
    expect(document.activeElement).toBe(triggerButton);

    // Clean up
    document.body.removeChild(triggerButton);
  });

  it('returns focus to previously focused element if returnFocus not provided', async () => {
    const previousButton = document.createElement('button');
    previousButton.id = 'previous';
    document.body.appendChild(previousButton);
    previousButton.focus();

    expect(document.activeElement).toBe(previousButton);

    const result = focusTrap(container, { autoFocus: true });

    // Wait for auto-focus
    await new Promise(resolve => setTimeout(resolve, 10));

    // Destroy focus trap
    result.destroy();

    // Wait for return focus
    await new Promise(resolve => setTimeout(resolve, 10));

    // Focus should have returned to previous button
    expect(document.activeElement).toBe(previousButton);

    // Clean up
    document.body.removeChild(previousButton);
  });

  it('ignores non-Tab keys', async () => {
    const result = focusTrap(container, { autoFocus: true });
    cleanup = result.destroy;

    // Wait for auto-focus
    await new Promise(resolve => setTimeout(resolve, 10));

    const btn1 = container.querySelector('#btn1') as HTMLButtonElement;
    expect(document.activeElement).toBe(btn1);

    // Simulate Enter key (should be ignored)
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true
    });

    container.dispatchEvent(enterEvent);

    // Focus should not have changed
    expect(document.activeElement).toBe(btn1);
  });

  it('handles container with no focusable elements gracefully', async () => {
    // Create container with no focusable elements
    const emptyContainer = document.createElement('div');
    emptyContainer.innerHTML = '<div>No buttons here</div>';
    document.body.appendChild(emptyContainer);

    // Should not throw
    const result = focusTrap(emptyContainer, { autoFocus: true });

    // Wait for auto-focus attempt
    await new Promise(resolve => setTimeout(resolve, 10));

    // Clean up
    result.destroy();
    document.body.removeChild(emptyContainer);
  });

  it('only considers visible focusable elements', async () => {
    // Create container with visible and hidden buttons
    const mixedContainer = document.createElement('div');
    mixedContainer.innerHTML = `
      <button id="visible1">Visible 1</button>
      <button id="hidden" style="display: none;">Hidden</button>
      <button id="visible2">Visible 2</button>
    `;
    document.body.appendChild(mixedContainer);

    const result = focusTrap(mixedContainer, { autoFocus: false });

    // Focus visible2
    const visible2 = mixedContainer.querySelector('#visible2') as HTMLButtonElement;
    visible2.focus();

    // Simulate Tab key
    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true
    });

    mixedContainer.dispatchEvent(tabEvent);

    // Should wrap to visible1 (skipping hidden)
    await new Promise(resolve => setTimeout(resolve, 10));
    const visible1 = mixedContainer.querySelector('#visible1') as HTMLButtonElement;
    expect(document.activeElement).toBe(visible1);

    // Clean up
    result.destroy();
    document.body.removeChild(mixedContainer);
  });
});
