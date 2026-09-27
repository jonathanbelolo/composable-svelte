import { beforeAll, expect, it } from 'vitest';
import { defineElements, closedBadgeProvider } from '../src/elements.js';
beforeAll(defineElements);
it('state sync preserves the framework sizing installed after represent', () => {
 const source=document.createElement('closed-badge');source.setAttribute('label','before');document.body.append(source);
 const result=closedBadgeProvider().represent(source, {document,diagnose:()=>{}} as any) as any;
 const holder=document.createElement('div');holder.style.cssText='width:240px;height:72px;';document.body.append(holder);holder.append(result.node);
 // Exact provided-node sizing from the reviewed core projection.ts:383.
 result.node.style.setProperty('width','100%');result.node.style.setProperty('height','100%');result.node.style.setProperty('display','block');
 try { expect(result.node.getBoundingClientRect().width).toBe(240); source.setAttribute('label','after');result.frame();expect(result.node.getAttribute('label')).toBe('after');expect(result.node.getBoundingClientRect().width).toBe(240); }
 finally {result.dispose();holder.remove();source.remove();}
});
