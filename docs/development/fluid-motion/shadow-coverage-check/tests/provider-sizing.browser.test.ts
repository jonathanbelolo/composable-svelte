// Interim sizing regression (the reviewer's own probe runs when published): following the source must not remove the
// framework's placement styling from the provided node.
import { beforeAll, expect, it } from 'vitest';
import { closedBadgeProvider, defineElements } from '../src/elements.js';
beforeAll(defineElements);
it('frame() keeps framework styling on the provided node (stays 240 px wide)', () => {
  const source = document.createElement('closed-badge'); source.setAttribute('label', 'size'); document.body.append(source);
  const context = { document, diagnose: () => {}, signal: new AbortController().signal, reducedMotion: false } as never;
  const result = closedBadgeProvider().represent(source, context) as { node: HTMLElement; frame(t: number): void; dispose(): void };
  const holder = document.createElement('div'); holder.style.cssText = 'width:240px;height:60px;position:relative';
  holder.append(result.node); document.body.append(holder);
  result.node.style.cssText = 'display:block;width:100%;height:100%;';
  try {
    expect(result.node.getBoundingClientRect().width).toBe(240);
    source.setAttribute('label', 'changed'); result.frame(0);
    expect(result.node.getAttribute('label')).toBe('changed');
    expect(result.node.getAttribute('style')).toContain('width: 100%');
    expect(result.node.getBoundingClientRect().width).toBe(240);
  } finally { result.dispose(); holder.remove(); source.remove(); }
});
