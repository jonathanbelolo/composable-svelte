/** Internal conservative HTML snapshot capability. Unsupported content skips. */
export type CaptureOutcome = {kind:'captured';node:HTMLDivElement;rect:DOMRectReadOnly;ancestorOpacity:number;scale:readonly [number,number]}|{kind:'skipped';reason:string};
/** Choreography capture may sample foreign ancestor opacity (applied once by the plane); transforms stay unsupported. */
export interface CaptureOptions {readonly foreignAncestorOpacity?:'reject'|'sample'|undefined;
 /** `sample2d`: translate/scale transforms on the source or ancestors (e.g. foreign leases) are measured and applied once on the copy. */
 readonly transforms?:'reject'|'sample2d'|undefined;
 /** Choreography only: decorative image copies (src/currentSrc, empty alt, no listeners or identity). */
 readonly images?:boolean|undefined}
/** Accumulated 2D scale of the source and its ancestors, or undefined for rotation/skew/3D (unsupported). */
export function accumulatedScale(source:HTMLElement):readonly [number,number]|undefined{
 const win=source.ownerDocument.defaultView;if(!win)return undefined;let sx=1,sy=1;
 for(let node:HTMLElement|null=source;node;node=node.parentElement){const style=win.getComputedStyle(node);if(style.rotate&&style.rotate!=='none')return undefined;if(style.scale&&style.scale!=='none'){const [ix,iy=ix]=style.scale.trim().split(/\s+/).map(Number);if(!Number.isFinite(ix!)||!Number.isFinite(iy!)||ix!<=0||iy!<=0)return undefined;sx*=ix!;sy*=iy!;}const transform=style.transform;if(transform==='none')continue;const match=/^matrix\(([^)]+)\)$/.exec(transform);if(!match)return undefined;const [a,b,c,d]=match[1]!.split(',').map(Number);if(!Number.isFinite(a!)||!Number.isFinite(d!)||Math.abs(b!)>1e-9||Math.abs(c!)>1e-9||a!<=0||d!<=0)return undefined;sx*=a!;sy*=d!;}
 return [sx,sy];
}
/** Product of ancestor opacities (foreign appearance), excluding the source itself. */
export function ancestorOpacity(source:HTMLElement):number{const win=source.ownerDocument.defaultView;if(!win)return 1;let product=1;for(let node=source.parentElement;node;node=node.parentElement)product*=Number.parseFloat(win.getComputedStyle(node).opacity)||0;return product;}
const allowed = new Set(['DIV','SPAN','P','H1','H2','H3','H4','H5','H6','UL','OL','LI','B','STRONG','I','EM','SMALL','BR','BUTTON','A','SECTION','ARTICLE']);
const properties=['color','background-color','font-family','font-size','font-weight','line-height','letter-spacing','text-align','white-space','padding-top','padding-right','padding-bottom','padding-left','border-top-width','border-right-width','border-bottom-width','border-left-width','border-style','border-color','border-radius','box-sizing','display','width','height','margin-top','margin-right','margin-bottom','margin-left','opacity'] as const;
export function captureHTML(source:HTMLElement,options:CaptureOptions={}):CaptureOutcome {
 const sampleOpacity=options.foreignAncestorOpacity==='sample';
 const sample2d=options.transforms==='sample2d';
 const images=options.images===true;
 const scale=sample2d?accumulatedScale(source):([1,1] as const);
 if(!scale)return{kind:'skipped',reason:'transformed-space'};
 if(!source.isConnected)return{kind:'skipped',reason:'disconnected'};
 const win=source.ownerDocument.defaultView;if(!win)return{kind:'skipped',reason:'no-window'};
 for(let node:HTMLElement|null=source;node;node=node.parentElement){const style=win.getComputedStyle(node);if((style.transform!=='none'&&!sample2d)||style.perspective!=='none'||style.filter!=='none'||style.contain!=='none'||style.clipPath!=='none'||style.maskImage!=='none')return{kind:'skipped',reason:'transformed-space'};if(node!==source&&style.opacity!=='1'&&!sampleOpacity)return{kind:'skipped',reason:'ancestor-opacity'};if(node!==source&&[style.overflowX,style.overflowY].some(value=>value!=='visible'))return{kind:'skipped',reason:'clipped-space'};}
 const rect=source.getBoundingClientRect();if(![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)||rect.width<=0||rect.height<=0)return{kind:'skipped',reason:'missing-geometry'};
 let count=0;const copy=(node:Node):Node|null=>{
  if(++count>128)throw new Error('snapshot-budget');
  if(node.nodeType===Node.TEXT_NODE)return source.ownerDocument.createTextNode(node.textContent??'');
  if(node.nodeType!==Node.ELEMENT_NODE)return null;
  const element=node as HTMLElement;if(element.namespaceURI!=='http://www.w3.org/1999/xhtml'||!(allowed.has(element.tagName)||(images&&element.tagName==='IMG')))throw new Error('unsupported-content');
  if(element.tagName==='IMG'){const img=source.ownerDocument.createElement('img');const style=win.getComputedStyle(element);img.src=(element as HTMLImageElement).currentSrc||(element as HTMLImageElement).src;img.alt='';img.draggable=false;for(const property of properties)img.style.setProperty(property,style.getPropertyValue(property));img.style.objectFit=style.objectFit;return img;}
  const out=source.ownerDocument.createElement(element.tagName==='BUTTON'||element.tagName==='A'?'span':element.tagName.toLowerCase());
  const style=win.getComputedStyle(element);if(['flex','inline-flex','grid','inline-grid','table','inline-table','contents'].includes(style.display)||style.position!=='static'||style.cssFloat!=='none'||(style.transform!=='none'&&!(sample2d&&element===source))||style.perspective!=='none'||style.filter!=='none')throw new Error('unsupported-layout');if(element.shadowRoot||style.backgroundImage!=='none'||['::before','::after'].some(pseudo=>!['none','normal',''].includes(win.getComputedStyle(element,pseudo).content)))throw new Error('unsupported-rendering');for(const property of properties)out.style.setProperty(property,style.getPropertyValue(property));
  for(const child of element.childNodes){const next=copy(child);if(next)out.appendChild(next);}return out;
 };
 try{const visual=copy(source);const after=source.getBoundingClientRect();if(rect.x!==after.x||rect.y!==after.y||rect.width!==after.width||rect.height!==after.height)return{kind:'skipped',reason:'unstable-geometry'};if(!visual)return{kind:'skipped',reason:'empty'};const node=source.ownerDocument.createElement('div');node.inert=true;node.setAttribute('aria-hidden','true');const [sx,sy]=scale;node.style.cssText=`position:fixed;left:${rect.x}px;top:${rect.y}px;width:${rect.width/sx}px;height:${rect.height/sy}px;pointer-events:none;overflow:hidden;contain:strict;`+(sx!==1||sy!==1?`transform-origin:0 0;transform:scale(${sx},${sy});`:'');node.appendChild(visual);return{kind:'captured',node,rect,ancestorOpacity:sampleOpacity?ancestorOpacity(source):1,scale};}catch(error){return{kind:'skipped',reason:error instanceof Error?error.message:'capture-failed'};}
}
