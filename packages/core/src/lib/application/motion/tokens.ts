import {exactKeys,milliseconds,visualCopy} from './data.js';
export type Easing = 'linear'|'ease'|'ease-in'|'ease-out'|'ease-in-out';
export interface MotionTokens {readonly durationMs:number;readonly easing:Easing;readonly amplitude:number;readonly reduction:'instant';readonly disabled:boolean}
export type TokenOverrides = Partial<MotionTokens>;
export const defaultMotionTokens:MotionTokens=Object.freeze({durationMs:180,easing:'ease-out',amplitude:1,reduction:'instant',disabled:false});
export function validateTokens(input:TokenOverrides):void {
 exactKeys(input,['durationMs','easing','amplitude','reduction','disabled'],'tokens');
 if(input.durationMs!==undefined)milliseconds(input.durationMs,'durationMs');
 if(input.easing!==undefined&&!['linear','ease','ease-in','ease-out','ease-in-out'].includes(input.easing))throw new TypeError('Unsupported easing');
 if(input.amplitude!==undefined&&(!Number.isFinite(input.amplitude)||input.amplitude<0))throw new RangeError('Invalid amplitude');
 if(input.reduction!==undefined&&input.reduction!=='instant')throw new TypeError('Unsupported reduction');
 if(input.disabled!==undefined&&typeof input.disabled!=='boolean')throw new TypeError('disabled must be boolean');
}
/** Pure playback policy: stable projection does not depend on these preferences. */
export function resolveMotionTokens(options:{theme?:TokenOverrides;preset?:TokenOverrides;instance?:TokenOverrides;reducedMotion?:boolean}={}):Readonly<MotionTokens&{reduced:boolean}> {
 const data=visualCopy(options);exactKeys(data,['theme','preset','instance','reducedMotion'],'token layers');
 const tokens={...defaultMotionTokens};
 for(const layer of [data.theme,data.preset,data.instance])if(layer!==undefined){validateTokens(layer);Object.assign(tokens,layer);}
 if(data.reducedMotion!==undefined&&typeof data.reducedMotion!=='boolean')throw new TypeError('reducedMotion must be boolean');
 const reduced=data.reducedMotion===true;
 if(tokens.disabled||reduced){tokens.durationMs=0;tokens.amplitude=0;}
 return Object.freeze({...tokens,reduced});
}
