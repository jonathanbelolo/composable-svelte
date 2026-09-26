import {it,expect,vi} from 'vitest';
import {normalizeApplicationURL,captureApplicationRouting} from '../src/lib/application/routing.js';
import {defineApplication} from '../src/lib/application/definition.js';
import {Effect} from '../src/lib/effect.js';
import type {Reducer} from '../src/lib/types.js';
it.each([['https://example.test/a/../page?x=1#target','/page?x=1#target'],['/a/../page?x=1#target','/page?x=1#target'],['https://example.test','/']])('normalizes injected request URL %s to browser port format', (input,expected)=>expect(normalizeApplicationURL(input,true)).toBe(expected));
it.each(['relative','//example.test/path','ftp://example.test/path','mailto:someone@example.test'])('rejects ambiguous or unsupported injected URL %s',input=>expect(()=>normalizeApplicationURL(input,true)).toThrow());
it('route decisions must return root-relative URLs',()=>expect(()=>normalizeApplicationURL('https://elsewhere.test/path')).toThrow('root-relative'));
it('definition captures immutable pure routing decisions without executing them',()=>{
 const serialize=vi.fn((state:number)=>`/${state}`),request=vi.fn(()=>undefined),initialState=vi.fn(()=>0);const config:{fragment:'native';serialize:(state:number)=>string;request:()=>undefined}={fragment:'native',serialize,request};const reducer:Reducer<number,{type:'noop'}>=state=>[state,Effect.none()];defineApplication(reducer,{initialState,routing:config});expect(serialize).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled();expect(initialState).not.toHaveBeenCalled();const captured=captureApplicationRouting(config);config.serialize=()=>'/mutated';expect(captured.serialize).toBe(serialize);expect(Object.isFrozen(captured)).toBe(true);
});
it('invalid dynamic fragment and policy declarations fail before browser attachment',()=>{
 expect(()=>captureApplicationRouting({fragment:'automatic',serialize:()=> '/',request:()=>undefined} as never)).toThrow('fragment policy');expect(()=>captureApplicationRouting({fragment:'native',serialize:()=> '/',request:()=>undefined,writePolicy:'push'} as never)).toThrow('pure decision');
});

it('root-relative URL cannot disguise a different origin with a backslash',()=>{expect(()=>normalizeApplicationURL('/\\\\other.example/path')).toThrow('origin');});
