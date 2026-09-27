import { beforeAll, expect, it } from 'vitest';
import { defineElements, closedBadgeProvider } from '../src/elements.js';
beforeAll(defineElements);
it('component-owned representation follows source label and animated attributes before retirement', () => {
 const source=document.createElement('closed-badge'); source.setAttribute('label','before'); document.body.append(source);
 const context={ document, diagnose:()=>{} } as any;
 const result=closedBadgeProvider().represent(source, context) as any;
 document.body.append(result.node);
 try {
  expect(result.node.getAttribute('label')).toBe('before');
  source.setAttribute('label','after'); source.setAttribute('animated','');
  result.frame();
  expect(result.node.getAttribute('label')).toBe('after');
  expect(result.node.hasAttribute('animated')).toBe(true);
 } finally { result.dispose(); source.remove(); }
});
