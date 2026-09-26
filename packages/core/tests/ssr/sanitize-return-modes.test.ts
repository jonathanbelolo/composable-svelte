import { it, expect, expectTypeOf, vi, afterEach } from 'vitest';
import DOMPurify from 'isomorphic-dompurify';
import {sanitizeHTML,createSanitizer,defaultSanitizeOptions, type SanitizeOptions} from '../../src/lib/ssr/sanitize.js';
afterEach(()=>vi.restoreAllMocks());
it('rejects filtered TrustedHTML without caller policy before invoking peer',()=>{
 const sanitize=vi.spyOn(DOMPurify,'sanitize');
 expect(()=>sanitizeHTML('<p id="x">x</p>',{...defaultSanitizeOptions,domPurifyConfig:{RETURN_TRUSTED_TYPE:true,SANITIZE_NAMED_PROPS:true,ADD_ATTR:['id']}})).toThrow('TRUSTED_TYPES_POLICY');
 expect(sanitize).not.toHaveBeenCalled();
});
it('delegates native Trusted Types mode once when peer data-URL policy is requested',()=>{
 const sanitize=vi.spyOn(DOMPurify,'sanitize');
 const result=sanitizeHTML('<p id="x" data-a="a">x</p>',{...defaultSanitizeOptions,allowDataUri:true,domPurifyConfig:{RETURN_TRUSTED_TYPE:true,SANITIZE_NAMED_PROPS:true,ADD_ATTR:['id']}});
 expect(String(result)).toBe('<p id="user-content-x">x</p>');expect(sanitize).toHaveBeenCalledTimes(1);
});
it.each(['RETURN_DOM','RETURN_DOM_FRAGMENT'] as const)('empty input preserves %s return shape',flag=>{
 const value=sanitizeHTML('',{...defaultSanitizeOptions,domPurifyConfig:{[flag]:true}}) as unknown as Node;
 expect(value.nodeType).toBe(flag==='RETURN_DOM'?1:11);
});
it('reports unsupported sanitization environment deliberately',()=>{
 const previous=DOMPurify.isSupported;DOMPurify.isSupported=false;
 try{expect(()=>sanitizeHTML('<p>x</p>')).toThrow('unsupported environment');}finally{DOMPurify.isSupported=previous;}
});
it('reports invalid peer DOM result deliberately',()=>{
 vi.spyOn(DOMPurify,'sanitize').mockReturnValueOnce('unchanged');
 expect(()=>sanitizeHTML('<p>x</p>')).toThrow('did not return a DOM node');
});
it('empty filtered TrustedHTML uses supplied policy exactly once for its result',()=>{
 class HTMLValue {constructor(readonly html:string){}toString(){return this.html;}}
 const policy={createHTML:(value:string)=>new HTMLValue(value),createScriptURL:(value:string)=>value};
 const result=sanitizeHTML('',{...defaultSanitizeOptions,domPurifyConfig:{RETURN_TRUSTED_TYPE:true,TRUSTED_TYPES_POLICY:policy}});
 expect(result).toBeInstanceOf(HTMLValue);expect(result.html).toBe('');
});
it('DOM return modes take precedence over Trusted Types without requiring policy',()=>{
 const node=sanitizeHTML('',{domPurifyConfig:{RETURN_DOM:true,RETURN_TRUSTED_TYPE:true}});
 expect(node.nodeType).toBe(1);
 const fragment=sanitizeHTML('',{domPurifyConfig:{RETURN_DOM:true,RETURN_DOM_FRAGMENT:true,RETURN_TRUSTED_TYPE:true}});
 expect(fragment.nodeType).toBe(11);
});

it('preserves static return modes and explicit policy result types',()=>{
 expectTypeOf(sanitizeHTML('')).toEqualTypeOf<string>();
 expectTypeOf(sanitizeHTML('',{domPurifyConfig:{RETURN_DOM:true}})).toEqualTypeOf<HTMLElement>();
 expectTypeOf(sanitizeHTML('',{domPurifyConfig:{RETURN_DOM_FRAGMENT:true}})).toEqualTypeOf<DocumentFragment>();
 const policy={createHTML:(html:string)=>({html,toString(){return html;}}),createScriptURL:(url:string)=>url};
 const sanitizer=createSanitizer({domPurifyConfig:{RETURN_TRUSTED_TYPE:true,TRUSTED_TYPES_POLICY:policy}});
 expectTypeOf(sanitizer('')).toEqualTypeOf<{html:string;toString():string}>();
 const dynamic=(options:SanitizeOptions)=>sanitizeHTML('',options);
 expectTypeOf(dynamic).returns.toEqualTypeOf<unknown>();
 const native=()=>sanitizeHTML('',{allowDataUri:true,domPurifyConfig:{RETURN_TRUSTED_TYPE:true}});
 expectTypeOf(native).returns.toEqualTypeOf<unknown>();
});

it('filtered policy applies named-property sanitization once and preserves hook ownership',()=>{
 class HTMLValue {constructor(readonly html:string){}toString(){return this.html;}}
 const policy={createHTML:(html:string)=>new HTMLValue(html),createScriptURL:(url:string)=>url};
 const sanitize=vi.spyOn(DOMPurify,'sanitize');const hook=vi.fn();DOMPurify.addHook('uponSanitizeAttribute',hook);
 try{
  const result=sanitizeHTML('<p id="x">safe</p><img src="data:image/png;base64,AAAA">',{...defaultSanitizeOptions,domPurifyConfig:{ADD_ATTR:['id'],SANITIZE_NAMED_PROPS:true,RETURN_TRUSTED_TYPE:true,TRUSTED_TYPES_POLICY:policy}});
  expect(result.html).toBe('<p id="user-content-x">safe</p><img>');expect(sanitize).toHaveBeenCalledTimes(1);
  const calls=hook.mock.calls.length;DOMPurify.sanitize('<p title="external">outside</p>');expect(hook.mock.calls.length).toBeGreaterThan(calls);
 }finally{DOMPurify.removeHook('uponSanitizeAttribute');}
});
