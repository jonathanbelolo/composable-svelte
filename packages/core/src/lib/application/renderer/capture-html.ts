/** Internal conservative HTML snapshot capability. Unsupported content skips. */
export type CaptureOutcome = {kind:'captured';node:HTMLDivElement;rect:DOMRectReadOnly}|{kind:'skipped';reason:string};
const allowed = new Set(['DIV','SPAN','P','H1','H2','H3','H4','H5','H6','UL','OL','LI','B','STRONG','I','EM','SMALL','BR','BUTTON','A','SECTION','ARTICLE']);
const properties=['color','background-color','font-family','font-size','font-weight','line-height','letter-spacing','text-align','white-space','padding-top','padding-right','padding-bottom','padding-left','border-top-width','border-right-width','border-bottom-width','border-left-width','border-style','border-color','border-radius','box-sizing','display','width','height','margin-top','margin-right','margin-bottom','margin-left','opacity'] as const;
export function captureHTML(source:HTMLElement):CaptureOutcome {
 if(!source.isConnected)return{kind:'skipped',reason:'disconnected'};
 const win=source.ownerDocument.defaultView;if(!win)return{kind:'skipped',reason:'no-window'};
 for(let node:HTMLElement|null=source;node;node=node.parentElement){const style=win.getComputedStyle(node);if(style.transform!=='none'||style.perspective!=='none'||style.filter!=='none'||style.contain!=='none'||style.clipPath!=='none'||style.maskImage!=='none')return{kind:'skipped',reason:'transformed-space'};if(node!==source&&style.opacity!=='1')return{kind:'skipped',reason:'ancestor-opacity'};if(node!==source&&[style.overflowX,style.overflowY].some(value=>value!=='visible'))return{kind:'skipped',reason:'clipped-space'};}
 const rect=source.getBoundingClientRect();if(![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0)return{kind:'skipped',reason:'missing-geometry'};
 let count=0;const copy=(node:Node):Node|null=>{
  if(++count>128)throw new Error('snapshot-budget');
  if(node.nodeType===Node.TEXT_NODE)return source.ownerDocument.createTextNode(node.textContent??'');
  if(node.nodeType!==Node.ELEMENT_NODE)return null;
  const element=node as HTMLElement;if(element.namespaceURI!=='http://www.w3.org/1999/xhtml'||!allowed.has(element.tagName))throw new Error('unsupported-content');
  const out=source.ownerDocument.createElement(element.tagName==='BUTTON'||element.tagName==='A'?'span':element.tagName.toLowerCase());
  const style=win.getComputedStyle(element);if(['flex','inline-flex','grid','inline-grid','table','inline-table','contents'].includes(style.display)||style.position!=='static'||style.cssFloat!=='none'||style.transform!=='none'||style.perspective!=='none'||style.filter!=='none')throw new Error('unsupported-layout');if(element.shadowRoot||style.backgroundImage!=='none'||['::before','::after'].some(pseudo=>!['none','normal',''].includes(win.getComputedStyle(element,pseudo).content)))throw new Error('unsupported-rendering');for(const property of properties)out.style.setProperty(property,style.getPropertyValue(property));
  for(const child of element.childNodes){const next=copy(child);if(next)out.appendChild(next);}return out;
 };
 try{const visual=copy(source);const after=source.getBoundingClientRect();if(rect.x!==after.x||rect.y!==after.y||rect.width!==after.width||rect.height!==after.height)return{kind:'skipped',reason:'unstable-geometry'};if(!visual)return{kind:'skipped',reason:'empty'};const node=source.ownerDocument.createElement('div');node.inert=true;node.setAttribute('aria-hidden','true');node.style.cssText=`position:fixed;left:${rect.x}px;top:${rect.y}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;overflow:hidden;contain:strict;`;node.appendChild(visual);return{kind:'captured',node,rect};}catch(error){return{kind:'skipped',reason:error instanceof Error?error.message:'capture-failed'};}
}
