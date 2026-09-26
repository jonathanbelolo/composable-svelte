import { describe, it, expect, afterEach } from 'vitest';
import { tick } from 'svelte';
import { clickOutside } from '../src/lib/actions/clickOutside.js';
import { render, cleanup } from 'vitest-browser-svelte';
import BackdropOwnershipHarness from './test-components/BackdropOwnershipHarness.svelte';

afterEach(cleanup);

function dispatchPointerDown(element: HTMLElement) {
  element.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0
    })
  );
}

describe('Modal, Sheet, Drawer, and Alert backdrop dismissal regression', () => {
  describe('Modal backdrop ownership', () => {
    it('positive regression: clicking backdrop dismisses modal', async () => {
      render(BackdropOwnershipHarness, { componentType: 'modal' });
      await expect.poll(() => document.querySelector('[data-testid="modal-content"]')).not.toBeNull();

      const backdrop = document.querySelector<HTMLElement>('.test-backdrop');
      expect(backdrop).not.toBeNull();
      dispatchPointerDown(backdrop!);

      await expect.poll(() => document.querySelector('[data-testid="dismiss-count"]')?.textContent).toBe('1');
    });

    it('negative regression: clicking inside modal content does not dismiss modal', async () => {
      render(BackdropOwnershipHarness, { componentType: 'modal' });
      await expect.poll(() => document.querySelector('[data-testid="content-button"]')).not.toBeNull();

      const contentButton = document.querySelector<HTMLElement>('[data-testid="content-button"]');
      dispatchPointerDown(contentButton!);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(document.querySelector('[data-testid="dismiss-count"]')?.textContent).toBe('0');
    });
  });

  describe('Alert backdrop ownership', () => {
    it('positive regression: clicking backdrop dismisses alert', async () => {
      render(BackdropOwnershipHarness, { componentType: 'alert' });
      await expect.poll(() => document.querySelector('[data-testid="alert-content"]')).not.toBeNull();

      const backdrop = document.querySelector<HTMLElement>('.test-backdrop');
      expect(backdrop).not.toBeNull();
      dispatchPointerDown(backdrop!);

      await expect.poll(() => document.querySelector('[data-testid="dismiss-count"]')?.textContent).toBe('1');
    });

    it('negative regression: clicking inside alert content does not dismiss alert', async () => {
      render(BackdropOwnershipHarness, { componentType: 'alert' });
      await expect.poll(() => document.querySelector('[data-testid="content-button"]')).not.toBeNull();

      const contentButton = document.querySelector<HTMLElement>('[data-testid="content-button"]');
      dispatchPointerDown(contentButton!);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(document.querySelector('[data-testid="dismiss-count"]')?.textContent).toBe('0');
    });
  });

  describe('Drawer backdrop ownership', () => {
    it('positive regression: clicking backdrop dismisses drawer', async () => {
      render(BackdropOwnershipHarness, { componentType: 'drawer' });
      await expect.poll(() => document.querySelector('[data-testid="drawer-content"]')).not.toBeNull();

      const backdrop = document.querySelector<HTMLElement>('.test-backdrop');
      expect(backdrop).not.toBeNull();
      dispatchPointerDown(backdrop!);

      await expect.poll(() => document.querySelector('[data-testid="dismiss-count"]')?.textContent).toBe('1');
    });

    it('negative regression: clicking inside drawer content does not dismiss drawer', async () => {
      render(BackdropOwnershipHarness, { componentType: 'drawer' });
      await expect.poll(() => document.querySelector('[data-testid="content-button"]')).not.toBeNull();

      const contentButton = document.querySelector<HTMLElement>('[data-testid="content-button"]');
      dispatchPointerDown(contentButton!);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(document.querySelector('[data-testid="dismiss-count"]')?.textContent).toBe('0');
    });

    it('disabled regression: disableClickOutside blocks dismissal until dynamically toggled', async () => {
      render(BackdropOwnershipHarness, { componentType: 'drawer', disableClickOutside: true });
      await expect.poll(() => document.querySelector('.test-backdrop')).not.toBeNull();

      const backdrop = document.querySelector<HTMLElement>('.test-backdrop')!;
      dispatchPointerDown(backdrop);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(document.querySelector('[data-testid="dismiss-count"]')?.textContent).toBe('0');

      const toggleBtn = document.querySelector<HTMLElement>('[data-testid="toggle-disable"]')!;
      toggleBtn.click();
      await tick();
      dispatchPointerDown(backdrop);

      await expect.poll(() => document.querySelector('[data-testid="dismiss-count"]')?.textContent).toBe('1');
    });
  });

  describe('Sheet backdrop ownership', () => {
    it('positive regression: clicking backdrop dismisses sheet', async () => {
      render(BackdropOwnershipHarness, { componentType: 'sheet' });
      await expect.poll(() => document.querySelector('[data-testid="sheet-content"]')).not.toBeNull();

      const backdrop = document.querySelector<HTMLElement>('.test-backdrop');
      expect(backdrop).not.toBeNull();
      dispatchPointerDown(backdrop!);

      await expect.poll(() => document.querySelector('[data-testid="dismiss-count"]')?.textContent).toBe('1');
    });

    it('negative regression: clicking inside sheet content does not dismiss sheet', async () => {
      render(BackdropOwnershipHarness, { componentType: 'sheet' });
      await expect.poll(() => document.querySelector('[data-testid="content-button"]')).not.toBeNull();

      const contentButton = document.querySelector<HTMLElement>('[data-testid="content-button"]');
      dispatchPointerDown(contentButton!);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(document.querySelector('[data-testid="dismiss-count"]')?.textContent).toBe('0');
    });

    it('teardown controls: closing sheet tears down click listener cleanly without errors', async () => {
      render(BackdropOwnershipHarness, { componentType: 'sheet' });
      await expect.poll(() => document.querySelector('.test-backdrop')).not.toBeNull();

      const toggleOpen = document.querySelector<HTMLElement>('[data-testid="toggle-open"]')!;
      toggleOpen.click();
      await expect.poll(() => document.querySelector('.test-backdrop')).toBeNull();

      dispatchPointerDown(document.body);
      expect(document.querySelector('[data-testid="dismiss-count"]')?.textContent).toBe('0');
    });
  });
});

it('cancels an accepted deferred outside click when its layer is destroyed', async () => {
 let calls=0;
 const node=document.createElement('div');document.body.append(node);
 const action=clickOutside(node,()=>{calls++;});
 dispatchPointerDown(document.body);
 action.destroy();node.remove();
 await new Promise(resolve=>setTimeout(resolve,10));
 expect(calls).toBe(0);
});

it('delivers a live outside click before teardown', async () => {
 let calls=0;
 const node=document.createElement('div');document.body.append(node);
 const action=clickOutside(node,()=>{calls++;});
 try { dispatchPointerDown(document.body);await expect.poll(()=>calls).toBe(1); }
 finally { action.destroy();node.remove(); }
});
