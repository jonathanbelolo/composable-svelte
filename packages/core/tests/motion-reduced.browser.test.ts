import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { animateTooltipIn, animateTooltipOut, animateCarouselTrack } from '../src/lib/animation/animate.js';
import Tooltip from './test-components/TooltipReviewHarness.svelte';
import Carousel from '../src/lib/components/ui/carousel/Carousel.svelte';
// The dedicated qualification config uses a real reduced-motion browser context.
// The normal repository browser suite emulates only the preference query.
beforeEach(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        return;
    const original = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation(query => {
        const media = original(query);
        if (query === '(prefers-reduced-motion: reduce)')
            Object.defineProperty(media, 'matches', { value: true });
        return media;
    });
});
afterEach(() => vi.restoreAllMocks());
it.each(['entrance', 'exit', 'track'] as const)('sets reduced-motion %s endpoint without starting an animation', async (kind) => {
    expect(window.matchMedia('(prefers-reduced-motion: reduce)').matches).toBe(true);
    const element = document.createElement('div');
    document.body.append(element);
    try {
        const completion = kind === 'entrance' ? animateTooltipIn(element) : kind === 'exit' ? animateTooltipOut(element) : animateCarouselTrack(element, -100, 300);
        if (kind === 'track')
            expect(element.style.transform).toBe('translateX(-100%)');
        else
            expect(element.style.opacity).toBe(kind === 'entrance' ? '1' : '0');
        expect(element.getAnimations()).toHaveLength(0);
        await completion;
    }
    finally {
        element.remove();
    }
});
it('completes tooltip entrance and exit with reduced motion', async () => {
    const view = render(Tooltip);
    const wrapper = view.container.querySelector('button')!.parentElement!;
    wrapper.dispatchEvent(new MouseEvent('mouseenter'));
    await expect.poll(() => view.container.querySelector('[role="tooltip"]')?.getAttribute('data-state')).toBe('presented');
    wrapper.dispatchEvent(new MouseEvent('mouseleave'));
    await expect.poll(() => view.container.querySelector('[role="tooltip"]')).toBeNull();
});
it('continues autoplay with instant track completion under reduced motion', async () => {
    const onSlideChange = vi.fn();
    const view = render(Carousel, { slides: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], transitionDuration: 0, autoPlayInterval: 25, onSlideChange });
    await expect.poll(() => onSlideChange.mock.calls.length, { interval: 5 }).toBeGreaterThanOrEqual(3);
    view.unmount();
});
