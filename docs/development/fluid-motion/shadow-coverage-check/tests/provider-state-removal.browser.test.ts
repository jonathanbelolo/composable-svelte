// Companion to the reviewer's unchanged repro: attribute removals are followed while the source exists, and the
// last synced state is kept after retirement (the retained instance renders itself; nothing follows a retired source).
import { beforeAll, expect, it } from 'vitest';
import { closedBadgeProvider, defineElements } from '../src/elements.js';
beforeAll(defineElements);
it('follows attribute removal before retirement and keeps the final synced state after it', () => {
  const source = document.createElement('closed-badge'); source.setAttribute('label', 'one'); source.setAttribute('animated', ''); document.body.append(source);
  const context = { document, diagnose: () => {}, signal: new AbortController().signal, reducedMotion: false } as never;
  const result = closedBadgeProvider().represent(source, context) as { node: HTMLElement; frame(t: number): void; retire(): { dispose(): void } | void; dispose(): void };
  document.body.append(result.node);
  try {
    source.removeAttribute('animated'); source.setAttribute('label', 'two'); result.frame(0);
    expect(result.node.hasAttribute('animated')).toBe(false);
    expect(result.node.getAttribute('label')).toBe('two');
    const retained = result.retire();
    source.setAttribute('label', 'after-retirement'); source.remove(); result.frame(1);
    expect(result.node.getAttribute('label')).toBe('two');
    retained?.dispose();
  } finally { result.dispose(); source.remove(); }
});
