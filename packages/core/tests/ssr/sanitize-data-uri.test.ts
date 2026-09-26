import {describe,it,expect,vi,afterEach} from 'vitest';
import DOMPurify from 'isomorphic-dompurify';
import {sanitizeHTML,createSanitizer,defaultSanitizeOptions} from '../../src/lib/ssr/sanitize.js';
afterEach(()=>vi.restoreAllMocks());
const image='<img src="data:image/png;base64,AAAA" data-id="kept" alt="safe">';
describe('B009-03 data URLs versus data attributes',()=>{
 it('preserves legacy default data-attribute suppression',()=>expect(sanitizeHTML(image)).toBe('<img alt="safe">'));
 it('explicit data-attribute opt-in remains independent of data URLs',()=>expect(sanitizeHTML(image,{...defaultSanitizeOptions,domPurifyConfig:{ALLOW_DATA_ATTR:true}})).toBe(DOMPurify.sanitize('<img data-id="kept" alt="safe">',{ALLOWED_TAGS:['img'],ALLOWED_ATTR:['alt'],ALLOW_DATA_ATTR:true})));
 it('explicitly allows DOMPurify-supported data images without enabling script protocols',()=>{const result=sanitizeHTML(image+'<a href="javascript:alert(1)">x</a>',{...defaultSanitizeOptions,allowDataUri:true});expect(result).toContain('src="data:image/png;base64,AAAA"');expect(result).not.toContain('javascript:');});
 for(const value of ['DATA:image/png;base64,AAAA','  data:image/png;base64,AAAA','d\na\rta:image/png;base64,AAAA','d&#97;ta:image/png;base64,AAAA'])it(`blocks parsed data scheme ${JSON.stringify(value)}`,()=>expect(sanitizeHTML(`<img src="${value}">`)).not.toContain('src='));
 for(const value of ['%64ata:image/png;base64,AAAA','data%3Aimage/png;base64,AAAA','/images/data:icon.png','https://example.test/image.png'])it(`preserves non-data URL ${value}`,()=>expect(sanitizeHTML(`<img src="${value}">`)).toContain('src='));
 for(const value of ['data:image/png;base64,AAAA 1x','https://example.test/x 1x, data:image/png;base64,AAAA 2x','https://example.test/x 1x, d\na\tta:image/png;base64,AAAA 2x'])it(`rejects data candidates anywhere in srcset: ${JSON.stringify(value)}`,()=>{const result=sanitizeHTML(`<img srcset="${value}" data-safe="true">`,{...defaultSanitizeOptions,domPurifyConfig:{ADD_ATTR:['srcset'],ALLOW_DATA_ATTR:true}});expect(result).not.toContain('srcset=');expect(result).toContain('data-safe="true"');});
 it('preserves all-safe srcset and separate data attribute policy',()=>{const result=sanitizeHTML('<img srcset="/a.png 1x, /b.png 2x" data-id="x">',{...defaultSanitizeOptions,domPurifyConfig:{ADD_ATTR:['srcset'],ALLOW_DATA_ATTR:false}});expect(result).toContain('srcset=');expect(result).not.toContain('data-id');});
 it('alternating presets do not retain call policy',()=>{const deny=createSanitizer(defaultSanitizeOptions);const allow=createSanitizer({...defaultSanitizeOptions,allowDataUri:true});for(let i=0;i<3;i++){expect(deny(image)).not.toContain('src=');expect(allow(image)).toContain('src=');}});
 it('uses no hook mutation and survives sanitizer exceptions on minimum-peer hook APIs',()=>{const add=vi.spyOn(DOMPurify,'addHook');const remove=vi.spyOn(DOMPurify,'removeHook').mockImplementation(()=>{throw new Error('legacy hook removal must not be used');});const sanitize=vi.spyOn(DOMPurify,'sanitize');sanitize.mockImplementationOnce(()=>{throw new Error('actual failure');});expect(()=>sanitizeHTML(image)).toThrow('actual failure');expect(sanitizeHTML(image,{...defaultSanitizeOptions,allowDataUri:true})).toContain('src=');expect(add).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();});
 for(const outerAllow of [false,true])it(`rejects nested shared-peer hook entry and resets guard (outer=${outerAllow})`,()=>{
 const hook=()=>sanitizeHTML(image,{...defaultSanitizeOptions,allowDataUri:!outerAllow});
 DOMPurify.addHook('uponSanitizeAttribute',hook);
 try {expect(()=>sanitizeHTML(image,{...defaultSanitizeOptions,allowDataUri:outerAllow})).toThrow('Reentrant sanitizeHTML');}
 finally {DOMPurify.removeHook('uponSanitizeAttribute');}
 expect(sanitizeHTML(image)).toBe('<img alt="safe">');
 });
 it('removes URL attributes inside sanitized template content',()=>{const result=sanitizeHTML('<p>prefix</p><template><img src="data:image/png;base64,AAAA" alt="inside"></template>',{...defaultSanitizeOptions,domPurifyConfig:{ADD_TAGS:['template']}});expect(result).toContain('<template>');expect(result).toContain('alt="inside"');expect(result).not.toContain('src=');});
 it('retains whole-document and DOM-return custom configuration',()=>{const result=sanitizeHTML('<!doctype html><html><head><title>Title</title></head><body>'+image+'</body></html>',{...defaultSanitizeOptions,domPurifyConfig:{WHOLE_DOCUMENT:true,ALLOWED_TAGS:['html','head','title','body','img','!doctype']}});expect(result).toContain('<!DOCTYPE html>');expect(result).toContain('<title>Title</title>');expect(result).not.toContain('src=');const node=sanitizeHTML(image,{...defaultSanitizeOptions,domPurifyConfig:{RETURN_DOM:true}}) as unknown as HTMLElement;expect(node.nodeType).toBe(1);expect(node.querySelector('img')!.hasAttribute('src')).toBe(false);});
});

it('preserves legacy custom Trusted Types output compatibility',()=>{class HTMLValue{constructor(readonly html:string){}toString(){return this.html;}}const policy={createHTML:(html:string)=>new HTMLValue(html),createScriptURL:(url:string)=>url};const options={...defaultSanitizeOptions,allowDataUri:true,domPurifyConfig:{RETURN_TRUSTED_TYPE:true,TRUSTED_TYPES_POLICY:policy}};expect(sanitizeHTML('<p>hello</p>',options)).toBeInstanceOf(HTMLValue);});

it('custom Trusted Types output contains the filtered data-URL policy', () => {
 class HTMLValue { constructor(readonly html: string) {} toString() { return this.html; } }
 const policy = {createHTML: (html: string) => new HTMLValue(html), createScriptURL: (url: string) => url};
 const value = sanitizeHTML('<img src="data:image/png;base64,AAAA"><p>safe</p>', {...defaultSanitizeOptions, domPurifyConfig: {RETURN_TRUSTED_TYPE: true, TRUSTED_TYPES_POLICY: policy}});
 expect(value).toBeInstanceOf(HTMLValue); expect(String(value)).toBe('<img><p>safe</p>');
});
