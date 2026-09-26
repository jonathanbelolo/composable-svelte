import {describe,it,expect} from 'vitest';
import {resetPasswordReducer,createInitialResetPasswordState} from '../src/lib/flows/reset-password/reducer.js';
import {isAuthError,toAuthError} from '../src/lib/errors/helpers.js';
import {authErrorFromResponse} from '../src/lib/http/errors.js';
import {createMockAuthDeps} from '../src/lib/testing/index.js';
import type {AuthError} from '../src/lib/errors/types.js';
describe('auth remaining runtime boundaries',()=>{
 it('replacing an expired token recovers, re-providing it does not erase its verdict',()=>{const s={...createInitialResetPasswordState('old'),error:{code:'token_expired' as const,message:'expired'}};const deps=createMockAuthDeps();expect(resetPasswordReducer(s,{type:'tokenProvided',token:'new'},deps)[0].error).toBeNull();expect(resetPasswordReducer(s,{type:'tokenProvided',token:'old'},deps)[0]).toBe(s);});
 it.each([
 {code:'ECONNREFUSED',message:'foreign'},
 {code:'mfa_required',message:'mfa'},
 {code:'mfa_required',message:'mfa',challengeId:'c',methods:['password']},
 {code:'reauthentication_required',message:'reauth',methods:[123]},
 {code:'rate_limited',message:'limit',retryAfterSeconds:'10'},
 {code:'rate_limited',message:'limit',retryAfterSeconds:Infinity},
 {code:'account_locked',message:'locked',until:new Date()},
 {code:'unknown',message:'unknown',status:NaN}
 ])('rejects malformed domain payload %j',value=>{expect(isAuthError(value)).toBe(false);expect(toAuthError(value).code).toBe('unknown');});
 it('preserves every legitimate domain arm',()=>{const errors:AuthError[]=[{code:'invalid_credentials',message:'x'},{code:'mfa_required',message:'x',challengeId:'c',methods:['totp','recovery_code']},{code:'email_unverified',message:'x',email:'x'},{code:'email_taken',message:'x'},{code:'account_locked',message:'x',until:'2026'},{code:'rate_limited',message:'x',retryAfterSeconds:0},{code:'token_expired',message:'x'},{code:'oauth_denied',message:'x',provider:'a'},{code:'oauth_state_mismatch',message:'x'},{code:'reauthentication_required',message:'x',methods:['password','totp']},{code:'network',message:'x'},{code:'unknown',message:'x',status:500}];for(const error of errors){expect(isAuthError(error)).toBe(true);expect(toAuthError(error)).toEqual(error);}});
 it.each(['mfa_required','reauthentication_required'])('malformed %s method payload degrades to supported methods',async code=>{for(const methods of ['totp',1,{},null,[123,'alien']]){const e=await authErrorFromResponse(Response.json({error:{code,challenge_id:'c',methods,message:42}},{status:401}),'fallback');expect(isAuthError(e)).toBe(true);expect(e.message).toBe('fallback');expect(e).toMatchObject({methods:code==='mfa_required'?['totp']:['password']});}});
 it.each([{code:'email_taken',email:4},{code:'account_locked',locked_until:{}},{code:'oauth_denied',provider:[]},{code:'rate_limited',retry_after_seconds:'4'},{code:'mfa_required',challenge_id:4}])('wire fields cannot violate domain output %j',async error=>{expect(isAuthError(await authErrorFromResponse(Response.json({error},{status:400}),'fallback'))).toBe(true);});
 it.each(['https://a.test/authorize','https://a.test/authorize?client_id=x#finish','/authorize?client_id=x#finish'])('mock OAuth preserves URL parts %s',async oauthAuthorizeUrl=>{const deps=createMockAuthDeps({oauthAuthorizeUrl,oauthProviders:['g it']});const {authorizeUrl}=await deps.beginOAuth('g it');const url=new URL(authorizeUrl,'https://base.test');expect(url.searchParams.get('provider')).toBe('g it');expect(url.searchParams.get('state')).toBeTruthy();if(oauthAuthorizeUrl.includes('client_id'))expect(url.searchParams.get('client_id')).toBe('x');if(oauthAuthorizeUrl.includes('#'))expect(url.hash).toBe('#finish');});
});
