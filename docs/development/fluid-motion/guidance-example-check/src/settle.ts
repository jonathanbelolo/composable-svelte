import type { RepresentationProvider } from '@composable-svelte/core/application/motion';

// A provider for content it knows cannot be represented faithfully once the page commits: a live player
// that cannot move. Settling the participant avoids animating a blank player; the real one stays usable
// until the commit and leaves with its page.
export const livePlayerProvider: RepresentationProvider = {
  name: 'live-player',
  represent(source) {
    if (source.localName !== 'iframe' || !source.hasAttribute('data-live-player')) return undefined;
    return { declined: 'playerNotMovable', settle: true };
  }
};
