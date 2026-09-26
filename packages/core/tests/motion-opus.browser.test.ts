import { it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from 'vitest-browser-svelte';
import { flushSync, tick } from 'svelte';
const animations = vi.hoisted(() => ({ entrances: vi.fn(), exits: vi.fn(), tracks: vi.fn(), completeTrack: () => { } }));
vi.mock('../src/lib/animation/animate.js', async (importOriginal) => ({
    ...await importOriginal<typeof import('../src/lib/animation/animate.js')>(),
    animateTooltipIn: animations.entrances.mockImplementation(() => new Promise<void>(() => { })),
    animateTooltipOut: animations.exits.mockImplementation(() => Promise.resolve()),
    animateCarouselTrack: animations.tracks.mockImplementation(() => new Promise<void>(resolve => { animations.completeTrack = resolve; }))
}));
import Tooltip from './test-components/TooltipReviewHarness.svelte';
import Carousel from '../src/lib/components/ui/carousel/Carousel.svelte';
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('does not restart tooltip entrance when hover state or position changes in the same phase', async () => {
    const view = render(Tooltip);
    const wrapper = view.container.querySelector('button')!.parentElement!;
    flushSync(() => wrapper.dispatchEvent(new MouseEvent('mouseenter')));
    await expect.poll(() => animations.entrances.mock.calls.length, { interval: 1 }).toBe(1);
    flushSync(() => wrapper.dispatchEvent(new MouseEvent('mouseleave')));
    window.dispatchEvent(new Event('resize'));
    await tick();
    expect(animations.entrances).toHaveBeenCalledTimes(1);
});
it('keeps a running carousel completion alive when duration configuration changes', async () => {
    const changes = vi.fn();
    const view = render(Carousel, { slides: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], transitionDuration: 300, onSlideChange: changes });
    const next = view.container.querySelector<HTMLButtonElement>('[aria-label="Next slide"]')!;
    flushSync(() => next.click());
    await tick();
    expect(animations.tracks).toHaveBeenCalledTimes(1);
    await view.rerender({ transitionDuration: 500, autoPlayInterval: 50000 });
    expect(animations.tracks).toHaveBeenCalledTimes(1);
    animations.completeTrack();
    await tick();
    await Promise.resolve();
    flushSync(() => next.click());
    expect(changes).toHaveBeenCalledTimes(2);
});
