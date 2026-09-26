import { describe, it, expect, vi } from 'vitest';
import { api, apiAll, apiFireAndForget } from '../../src/lib/api/effect-api.js';
import { createMockAPI } from '../../src/lib/api/testing/mock-client.js';
import type { APIClient } from '../../src/lib/api/types.js';
import { APIError } from '../../src/lib/api/errors.js';
import { parseRetryAfter } from '../../src/lib/api/retry.js';

describe('independent application error boundary controls', () => {
  for (const variant of ['api', 'all', 'fire'] as const) {
    for (const location of ['mapper', 'dispatch'] as const) {
      it(`${variant} preserves ${location} error without an API failure action`, async () => {
        const client = createMockAPI({'GET /test': {ok:true}});
        const defect = new Error('application defect');
        const failure = vi.fn(() => ({type:'failed'}));
        const success = () => { if (location === 'mapper') throw defect; return {type:'success'}; };
        const request = {method:'GET' as const,url:'/test'};
        const effect = variant === 'api' ? api(client,request,success,failure) : variant === 'all' ? apiAll(client,[request],success,failure) : apiFireAndForget(client,request,success);
        expect(effect._tag).toBe('Run');
        if (effect._tag !== 'Run') throw new Error('expected Run');
        const dispatch = vi.fn(() => { throw defect; });
        await expect(effect.execute(dispatch)).rejects.toBe(defect);
        expect(failure).not.toHaveBeenCalled();
        expect(dispatch).toHaveBeenCalledTimes(location === 'mapper' ? 0 : 1);
      });
    }
  }
  it('parses ISO year as a date, never as seconds', () => {
    vi.useFakeTimers();
    try { vi.setSystemTime(new Date('2026-09-18T12:00:00Z')); expect(parseRetryAfter({'retry-after':'2026-09-18T12:01:00Z'})).toBe(60000); }
    finally { vi.useRealTimers(); }
  });
  it.each(['12seconds','-1','1.5','1e3','Infinity','9'.repeat(310)])('rejects malformed or nonfinite delay %s', value => { expect(parseRetryAfter({'retry-after':value})).toBeNull(); });
});

describe('parallel request observation', () => {
  it('observes earlier rejections when another client request throws synchronously', async () => {
    const first = new Error('first rejection');
    const second = new Error('second synchronous throw');
    const request = vi.fn().mockRejectedValueOnce(first).mockImplementationOnce(() => { throw second; }).mockResolvedValueOnce({ data: 3, status: 200, headers: {} });
    const client = { ...createMockAPI({}), request } as APIClient;
    const failure = vi.fn(() => ({type:'failed'}));
    const success = vi.fn(() => ({type:'success'}));
    const dispatch = vi.fn();
    const effect = apiAll(client, ['/one','/two','/three'].map(url => ({ method: 'GET' as const, url })), success, failure);
    if (effect._tag !== 'Run') throw new Error('expected Run');
    await effect.execute(dispatch);
    expect(request).toHaveBeenCalledTimes(3);
    expect(failure).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(success).not.toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
});

 it('fails fast with the actual settled error while observing later sibling rejection', async () => {
   let rejectSibling!: (error: unknown) => void;
   const sibling = new Promise<never>((_, reject) => { rejectSibling = reject; });
   const winning = new APIError('synchronous failure', 503);
   const late = new APIError('later sibling failure', 504);
   const request = vi.fn().mockReturnValueOnce(sibling).mockImplementationOnce(() => { throw winning; });
   const client: APIClient = { ...createMockAPI({}), request };
   const failure = vi.fn(() => ({ type: 'failed' }));
   const success = vi.fn(() => ({ type: 'loaded' }));
   const dispatch = vi.fn();
   const effect = apiAll(client, [{method:'GET',url:'/first'}, {method:'GET',url:'/second'}], success, failure);
   if (effect._tag !== 'Run') throw new Error('expected Run');
   await effect.execute(dispatch);
   expect(request).toHaveBeenCalledTimes(2);
   expect(failure).toHaveBeenCalledExactlyOnceWith(winning);
   expect(dispatch).toHaveBeenCalledExactlyOnceWith({type:'failed'});
   rejectSibling(late);
   // Let the runtime report an unhandled rejection if Promise.all did not observe it.
   await new Promise(resolve => setTimeout(resolve, 0));
   expect(failure).toHaveBeenCalledTimes(1);
   expect(success).not.toHaveBeenCalled();
 });
 it('retains a normalized foreign error as non-enumerable cause', async () => {
   const root = new Error('root');
   const original = new TypeError('foreign', {cause: root});
   const client: APIClient = {...createMockAPI({}), request: vi.fn().mockRejectedValue(original)};
   const failure=vi.fn((_error: APIError)=>({type:'failed'}));
   const effect=api(client,{method:'GET',url:'/foreign'},()=>({type:'loaded'}),failure);
   if(effect._tag !== 'Run')throw new Error('expected Run');
   await effect.execute(vi.fn());
   const normalized=failure.mock.calls[0]?.[0];
   expect(normalized).toBeInstanceOf(APIError);
   expect(normalized).toMatchObject({message:'foreign',name:'APIError',cause:original});
   expect(Object.keys(normalized!)).not.toContain('cause');
 });
