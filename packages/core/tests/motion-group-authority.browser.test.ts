import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, tick, unmount } from 'svelte';
import MotionGroupAuthorityHost from './fixtures/MotionGroupAuthorityHost.svelte';
import { TargetRegistry } from '../src/lib/application/renderer/target-registry.js';

const mounted: Array<{ component: ReturnType<typeof mount>; target: HTMLElement }> = [];
afterEach(async () => {
  while (mounted.length) {
    const current = mounted.pop()!;
    await unmount(current.component);
    current.target.remove();
  }
  vi.restoreAllMocks();
});
async function frame(): Promise<void> { await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())); }
async function waitFor(predicate: () => boolean, message: string): Promise<void> {
  const started = performance.now();
  while (!predicate()) {
    if (performance.now() - started > 2000) throw new Error(message);
    await frame();
  }
}

describe('useMotionGroup authority and managed-owner cleanup', () => {
  it('a later public-handle challenger displaces an active same-policy group atomically', async () => {
    const target = document.createElement('div'); document.body.appendChild(target);
    const bind = vi.spyOn(TargetRegistry.prototype, 'bind');
    const component = mount(MotionGroupAuthorityHost, { target }); mounted.push({ component, target });
    await tick();

    const incumbentIndex = bind.mock.calls.findIndex((call) =>
      call[1].some((entry) => entry.node.dataset.testid === 'shared-first'),
    );
    const incumbent = bind.mock.results[incumbentIndex]!.value;
    target.querySelector<HTMLButtonElement>('[data-testid="first-update"]')!.click(); flushSync();
    await waitFor(() => incumbent.current?.live === true, 'incumbent group did not start');
    const incumbentRun = incumbent.current!;

    target.querySelector<HTMLButtonElement>('[data-testid="admit-successor"]')!.click(); flushSync(); await tick();
    const successorIndex = bind.mock.calls.findIndex((call, index) =>
      index !== incumbentIndex && call[1].some((entry) => entry.node.dataset.testid === 'shared-first'),
    );
    const successor = bind.mock.results[successorIndex]!.value;
    expect(incumbent.live).toBe(false); expect(incumbentRun.live).toBe(false);
    expect(successor.live).toBe(true);

    const first = target.querySelector<HTMLElement>('[data-testid="shared-first"]')!;
    const second = target.querySelector<HTMLElement>('[data-testid="shared-second"]')!;
    const firstWrites: number[] = []; const secondWrites: number[] = [];
    const firstSet = first.style.setProperty.bind(first.style); const secondSet = second.style.setProperty.bind(second.style);
    first.style.setProperty = (property, value, priority) => { if (property === 'opacity') firstWrites.push(Number(value)); firstSet(property, value ?? '', priority); };
    second.style.setProperty = (property, value, priority) => { if (property === 'opacity') secondWrites.push(Number(value)); secondSet(property, value ?? '', priority); };
    target.querySelector<HTMLButtonElement>('[data-testid="successor-update"]')!.click(); flushSync();
    await waitFor(() => firstWrites.some((value) => value > 0 && value < 1), 'successor did not write first target');
    await waitFor(() => secondWrites.some((value) => value > 0 && value < 1), 'successor did not write second target');
    expect(successor.current?.live).toBe(true);
  });

  it('replacement and dismissal retire each child-owned group run without late writes while the root remains hosted', async () => {
    const target = document.createElement('div'); document.body.appendChild(target);
    const bind = vi.spyOn(TargetRegistry.prototype, 'bind');
    const component = mount(MotionGroupAuthorityHost, { target }); mounted.push({ component, target });
    await tick();

    const firstBindingIndex = bind.mock.calls.findIndex((call) =>
      call[1].some((entry) => entry.node.dataset.testid === 'managed-first'),
    );
    const rootBindingIndex = bind.mock.calls.findIndex((call) =>
      call[1].some((entry) => entry.node.dataset.testid === 'shared-first'),
    );
    const rootOwner = bind.mock.calls[rootBindingIndex]![0];
    const firstChildOwner = bind.mock.calls[firstBindingIndex]![0];
    expect(firstChildOwner).not.toBe(rootOwner);
    const firstBinding = bind.mock.results[firstBindingIndex]!.value;
    const firstNode = target.querySelector<HTMLElement>('[data-testid="managed-first"]')!;
    const firstWrites: number[] = []; const firstSet = firstNode.style.setProperty.bind(firstNode.style);
    firstNode.style.setProperty = (property, value, priority) => { if (property === 'opacity') firstWrites.push(Number(value)); firstSet(property, value ?? '', priority); };
    target.querySelector<HTMLButtonElement>('[data-testid="managed-update"]')!.click(); flushSync();
    await waitFor(() => firstBinding.current?.live === true && firstWrites.some((value) => value > 0 && value < 1), 'first managed group did not start');
    const firstRun = firstBinding.current!;

    target.querySelector<HTMLButtonElement>('[data-testid="replace-child"]')!.click(); flushSync(); await tick();
    const writesAfterReplace = firstWrites.length;
    expect(firstNode.isConnected).toBe(false);
    expect(firstBinding.live).toBe(false); expect(firstRun.live).toBe(false);
    expect(bind.mock.results.filter((result) => result.value?.record.live)).toHaveLength(2);
    await frame(); await frame(); expect(firstWrites).toHaveLength(writesAfterReplace);

    const secondNode = target.querySelector<HTMLElement>('[data-testid="managed-first"]')!;
    const secondBindingIndex = bind.mock.calls.findIndex((call, index) =>
      index > firstBindingIndex && call[1].some((entry) => entry.node === secondNode),
    );
    const secondChildOwner = bind.mock.calls[secondBindingIndex]![0];
    expect(secondChildOwner).not.toBe(rootOwner);
    expect(secondChildOwner).not.toBe(firstChildOwner);
    const secondBinding = bind.mock.results[secondBindingIndex]!.value;
    const secondWrites: number[] = []; const secondSet = secondNode.style.setProperty.bind(secondNode.style);
    secondNode.style.setProperty = (property, value, priority) => { if (property === 'opacity') secondWrites.push(Number(value)); secondSet(property, value ?? '', priority); };
    target.querySelector<HTMLButtonElement>('[data-testid="managed-update"]')!.click(); flushSync();
    await waitFor(() => secondBinding.current?.live === true && secondWrites.some((value) => value > 0 && value < 1), 'replacement managed group did not start');
    const secondRun = secondBinding.current!;

    target.querySelector<HTMLButtonElement>('[data-testid="remove-child"]')!.click(); flushSync(); await tick();
    const writesAfterDismiss = secondWrites.length;
    expect(target.querySelector('[data-testid="managed-surface"]')).toBeNull();
    expect(target.querySelector('[data-testid="remove-child"]')).not.toBeNull();
    expect(secondBinding.live).toBe(false); expect(secondRun.live).toBe(false);
    await frame(); await frame(); expect(secondWrites).toHaveLength(writesAfterDismiss);
  });
});
