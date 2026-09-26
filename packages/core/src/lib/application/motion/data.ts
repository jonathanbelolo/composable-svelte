/** Private pure data boundary; this is not a sandbox against executable Proxies. */
export function visualCopy<T>(input: T): T {
  const active = new Set<object>();
  function copy(value: unknown, depth: number): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object' || !value) throw new TypeError('Motion definitions contain finite visual data only');
    if (depth > 128) throw new RangeError('Motion data exceeds maximum nesting depth 128');
    if (active.has(value)) throw new TypeError('Cyclic motion data');
    const prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value) && prototype !== Array.prototype) throw new TypeError('Motion data requires plain arrays');
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new TypeError('Motion data requires plain objects');
    active.add(value);
    const result: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : Object.create(null);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      for (const key of Object.keys(descriptors)) {
        if (key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key)) throw new TypeError('Motion arrays contain indices only');
      }
      if (Object.keys(descriptors).length - 1 !== descriptors.length!.value) throw new TypeError('Motion arrays must be dense');
    }
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(value) && key === 'length') continue;
      if (!('value' in descriptor)) throw new TypeError('Motion data cannot contain accessors');
      if (!descriptor.enumerable) throw new TypeError('Motion data properties must be enumerable');
      if (!Array.isArray(value) && descriptor.value === undefined) continue;
      Object.defineProperty(result,key,{value:copy(descriptor.value,depth+1),enumerable:true});
    }
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError('Motion data cannot contain symbol keys');
    active.delete(value);
    return Object.freeze(result);
  }
  return copy(input,0) as T;
}
export function exactKeys(value: unknown, keys: readonly string[], label: string): void {
 if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be a record`);
 for (const key of Object.keys(value)) if (!keys.includes(key)) throw new TypeError(`${label}: unsupported option ${key}`);
}
export const MAX_MOTION_MS = 2_147_483_647;
export function milliseconds(value: number, label: string): number {
 if (!Number.isFinite(value) || value < 0 || value > MAX_MOTION_MS) throw new RangeError(`${label} must be finite nonnegative milliseconds within timer range`);
 return Object.is(value,-0)?0:value;
}
