import {exactKeys,visualCopy} from './data.js';
export type LengthUnit = 'px' | '%' | 'rem';
export type NumericUnit = 'number' | LengthUnit;
export interface LengthValue {readonly value:number;readonly unit:LengthUnit}
export interface ColorValue {readonly r:number;readonly g:number;readonly b:number;readonly a?:number|undefined}
export type SizeProperty = 'width'|'height'|'min-width'|'min-height'|'max-width'|'max-height';
export type ColorProperty = 'color'|'background-color'|'border-top-color'|'border-right-color'|'border-bottom-color'|'border-left-color';
export type BuiltinMotionProperty = 'opacity'|'transform'|SizeProperty|ColorProperty;
export type MotionProperty = BuiltinMotionProperty|`--${string}`;
export type MotionValue<P extends MotionProperty> = P extends 'transform' ? string : P extends ColorProperty ? ColorValue | `#${string}` : P extends SizeProperty ? number | LengthValue : number;
export interface NumericDescriptor {readonly unit:NumericUnit;readonly interpolation:'number'}
export type NumericDescriptors = Readonly<Record<`--${string}`,NumericDescriptor>>;
export interface NormalizedValue {
 readonly css:string;
 readonly kind:'number'|'length'|'color'|'transform';
 readonly values:readonly number[];
 readonly unit:NumericUnit|'rgba'|'transform';
 readonly native:'interpolate'|'stable-fallback';
 readonly ticker:'interpolate'|'stable-fallback';
}
const sizes = new Set<string>(['width','height','min-width','min-height','max-width','max-height']);
const colors = new Set<string>(['color','background-color','border-top-color','border-right-color','border-bottom-color','border-left-color']);
/** Maximum permitted length in UTF-16 code units for a transform CSS value. */
const MAX_TRANSFORM_LENGTH = 4096;
export function validateProperty(property:string,numeric:NumericDescriptors):asserts property is MotionProperty {
 if (property==='opacity'||property==='transform'||sizes.has(property)||colors.has(property)) return;
 if (!/^--[a-zA-Z_][a-zA-Z0-9_-]*$/.test(property)||!Object.hasOwn(numeric,property)) throw new TypeError(`Unsupported motion property ${property}`);
}
export function validateNumericDescriptors(numeric:NumericDescriptors):void {
 if(numeric===null||typeof numeric!=='object'||Array.isArray(numeric))throw new TypeError('numeric descriptors must be a record');
 for(const [property,descriptor] of Object.entries(numeric)) {
  if(!/^--[a-zA-Z_][a-zA-Z0-9_-]*$/.test(property))throw new TypeError('Invalid numeric custom property');
  exactKeys(descriptor,['unit','interpolation'],'numeric descriptor');
  if(!['number','px','%','rem'].includes(descriptor.unit)||descriptor.interpolation!=='number')throw new TypeError('Invalid numeric descriptor');
 }
}
function finite(value:unknown):number {if(typeof value!=='number'||!Number.isFinite(value))throw new TypeError('Motion value must be finite');return Object.is(value,-0)?0:value;}
function normalized(css:string,kind:NormalizedValue['kind'],values:number[],unit:NormalizedValue['unit'],native:NormalizedValue['native']='interpolate',ticker:NormalizedValue['ticker']='interpolate'):NormalizedValue {
 return Object.freeze({css,kind,values:Object.freeze(values),unit,native,ticker});
}
export function normalizeMotionValue(property:MotionProperty,value:unknown,numeric:NumericDescriptors={}):NormalizedValue {
 value=visualCopy(value);numeric=visualCopy(numeric);
 validateNumericDescriptors(numeric);
 validateProperty(property,numeric);
 if(property==='transform') {
  if(typeof value!=='string'||!value.trim()||value.length>MAX_TRANSFORM_LENGTH||/[;{}<>\\\'"!\[\]\x00-\x1f]|\/\*|\*\//.test(value))throw new TypeError('Transform must be a bounded CSS value, not declarations or markup');
  let depth=0;
  for(let i=0;i<value.length;i++){
   if(value[i]==='(')depth++;
   else if(value[i]===')'){depth--;if(depth<0)break;}
  }
  if(depth!==0)throw new TypeError('Transform must be a bounded CSS value, not declarations or markup');
  return normalized(value,'transform',[],'transform','interpolate','stable-fallback');
 }
 if(colors.has(property)) {
  let rgba:ColorValue;
  if(typeof value==='string') {
   if(!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value))throw new TypeError('Color requires hexadecimal or RGBA channels');
   let hex=value.slice(1);if(hex.length<=4)hex=[...hex].map(c=>c+c).join('');
   rgba={r:parseInt(hex.slice(0,2),16),g:parseInt(hex.slice(2,4),16),b:parseInt(hex.slice(4,6),16),a:hex.length===8?parseInt(hex.slice(6,8),16)/255:1};
  } else {if(!value||typeof value!=='object')throw new TypeError('Color requires RGBA channels');exactKeys(value,['r','g','b','a'],'color');rgba=value as ColorValue;}
  const channels=[finite(rgba.r),finite(rgba.g),finite(rgba.b)],alpha=finite(rgba.a??1);
  if(channels.some(c=>c<0||c>255)||alpha<0||alpha>1)throw new RangeError('Color channel out of range');
  return normalized(`rgba(${channels.join(', ')}, ${alpha})`,'color',[...channels,alpha],'rgba');
 }
 if(sizes.has(property)) {
  let amount:number,unit:LengthUnit;
  if(typeof value==='number'){amount=finite(value);unit='px';}
  else{if(!value||typeof value!=='object')throw new TypeError('Length requires number or unit descriptor');exactKeys(value,['value','unit'],'length');const length=value as LengthValue;amount=finite(length.value);unit=length.unit;}
  if(amount<0||!['px','%','rem'].includes(unit))throw new RangeError('Invalid size value/unit');
  return normalized(`${amount}${unit}`,'length',[amount],unit);
 }
 const amount=finite(value);
 if(property==='opacity'&&(amount<0||amount>1))throw new RangeError('Opacity must be between 0 and 1');
 const unit=property==='opacity'?'number':numeric[property as `--${string}`]!.unit;
 return normalized(`${amount}${unit==='number'?'':unit}`,unit==='number'?'number':'length',[amount],unit,property==='opacity'?'interpolate':'stable-fallback');
}
/** Different units and transform strings have no implicit ticker parser. */
export function interpolation(from:NormalizedValue,to:NormalizedValue):Readonly<{native:boolean;ticker:boolean;fallback:'stable'}> {
 return Object.freeze({native:from.native==='interpolate'&&to.native==='interpolate',ticker:from.ticker==='interpolate'&&to.ticker==='interpolate'&&from.kind===to.kind&&from.unit===to.unit,fallback:'stable'});
}
