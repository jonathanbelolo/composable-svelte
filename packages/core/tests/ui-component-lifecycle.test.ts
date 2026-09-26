/// <reference types="vite/client" />
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync, mount, hydrate, unmount } from 'svelte';
import type { ComponentProps } from 'svelte';
import avatarSSR from './avatar-hydration.html?raw';
import Avatar from '../src/lib/components/ui/avatar/Avatar.svelte';
import Badge from '../src/lib/components/ui/badge/Badge.svelte';
import BreadcrumbEllipsis from '../src/lib/components/ui/breadcrumb/BreadcrumbEllipsis.svelte';
// A typed consumer must be able to use the attributes already forwarded at runtime.
const badgeProps: ComponentProps<typeof Badge> = { id: 'badge-1', role: 'status', title: 'Active', class: ['badge', { active: true }] };
afterEach(() => vi.restoreAllMocks());
const sourceA = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
const sourceB = sourceA + '#second';
const emit = (image: HTMLImageElement, event: string) => flushSync(() => image.dispatchEvent(new Event(event)));
describe('Avatar source ownership', () => {
    it('recovers from an error when the source changes', async () => {
        const view = render(Avatar, { src: sourceA, fallback: 'JD' });
        const first = view.container.querySelector('img')!;
        emit(first, 'error');
        expect(view.container.querySelector('img')).toBeNull();
        await view.rerender({ src: sourceB });
        const second = view.container.querySelector('img')!;
        expect(second.getAttribute('src')).toBe(sourceB);
        emit(second, 'load');
        expect(second.classList.contains('invisible')).toBe(false);
        expect(view.container.textContent).not.toContain('JD');
    });
    it('shows fallback while a replacement loads and ignores events from a detached image', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(false);
        const view = render(Avatar, { src: sourceA, fallback: 'JD' });
        const first = view.container.querySelector('img')!;
        emit(first, 'load');
        await view.rerender({ src: sourceB });
        const second = view.container.querySelector('img')!;
        expect(second).not.toBe(first);
        expect(second.classList.contains('invisible')).toBe(true);
        expect(view.container.textContent).toContain('JD');
        emit(first, 'load');
        emit(first, 'error');
        expect(view.container.querySelector('img')).toBe(second);
        expect(second.classList.contains('invisible')).toBe(true);
        emit(second, 'load');
        expect(second.classList.contains('invisible')).toBe(false);
        await view.rerender({ src: sourceA });
    const third = view.container.querySelector('img')!;
    expect(third).not.toBe(first);
    emit(first, 'load'); emit(first, 'error');
    expect(view.container.querySelector('img')).toBe(third);
    expect(view.container.textContent).toContain('JD');
    await view.rerender({ src: undefined });
        expect(view.container.querySelector('img')).toBeNull();
        expect(view.container.textContent).toContain('JD');
    });
});
it('forwards typed Badge attributes', () => {
    const view = render(Badge, badgeProps);
    const badge = view.container.querySelector('#badge-1')!;
    expect(badge.getAttribute('role')).toBe('status');
    expect(badge.getAttribute('title')).toBe('Active');
});
it('exposes breadcrumb omission text while hiding only the decorative icon', () => {
    const view = render(BreadcrumbEllipsis);
    const text = view.container.querySelector('.sr-only')!;
    expect(text.textContent).toBe('More');
    expect(text.closest('[aria-hidden="true"]')).toBeNull();
    expect(text.parentElement?.getAttribute('role')).not.toBe('presentation');
    expect(view.container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
});


describe('Avatar element lifecycle', () => {
  it('accepts events from the current image in a detached subtree', async () => {
    const target = document.createElement('div');
    const component = mount(Avatar, {target, props:{src:sourceA,fallback:'DET'}});
    try {
      flushSync();const image=target.querySelector('img')!;
      expect(image.isConnected).toBe(false);
      emit(image,'load');
      expect(target.textContent).not.toContain('DET');
      emit(image,'error');
      expect(target.textContent).toContain('DET');
    } finally {await unmount(component);}
  });
  it('composes consumer image handlers with internal state transitions', () => {
    const onload=vi.fn();const onerror=vi.fn();
    const view=render(Avatar,{src:sourceA,fallback:'HAND',onload,onerror});
    const image=view.container.querySelector('img')!;
    emit(image,'load');expect(onload).toHaveBeenCalledTimes(1);expect(view.container.textContent).not.toContain('HAND');
    emit(image,'error');expect(onerror).toHaveBeenCalledTimes(1);expect(view.container.textContent).toContain('HAND');
  });
  it('reconciles an image completed before hydration of actual SSR markup', async () => {
    const target=document.createElement('div');document.body.append(target);
    target.innerHTML=avatarSSR;
    const image=target.querySelector('img')!;
    if(!image.complete) await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('fixture image failed'));});
    expect(image.naturalWidth).toBeGreaterThan(0);expect(target.textContent).toContain('HY');
    const component=hydrate(Avatar,{target,props:{src:image.getAttribute('src')!,fallback:'HY'}});
    try {flushSync();expect(target.querySelector('img')).toBe(image);expect(target.textContent).not.toContain('HY');}
    finally {await unmount(component);target.remove();}
  });
});
