// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GET,POST,DELETE} from '@/app/api/pilot-access/route';
import {acceptPilotCode,pilotAccessConfigured,pilotCodeHash,pilotSessionCookie,readPilotSession} from '@/lib/pilot-access';
import {resetReceiptExtractionRateLimitForTests} from '@/lib/rate-limit';
import {configurePilotAccess,testPilotCode,testPilotCookie} from './support/pilot';
function session(cookie:string){return readPilotSession(new Request(url,{headers:{cookie}}));}
const url='https://app.example/api/pilot-access';
function request(code:unknown=testPilotCode,headers:Record<string,string>={}){return new Request(url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({code})});}
beforeEach(()=>{configurePilotAccess();resetReceiptExtractionRateLimitForTests();});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
it('exchanges a private code for a signed HttpOnly session without echoing the code',async()=>{
 vi.stubEnv('NODE_ENV','production');const response=await POST(request());expect(response.status).toBe(200);const cookie=response.headers.get('set-cookie')!;expect(cookie).toContain('HttpOnly');expect(cookie).toContain('SameSite=Strict');expect(cookie).toContain('Secure');expect(cookie).toContain('Path=/');expect(cookie).not.toContain(testPilotCode);expect(response.headers.get('cache-control')).toBe('no-store');expect(await response.json()).toEqual({authorized:true});
 expect(readPilotSession(new Request(url,{headers:{cookie:cookie.split(';')[0]}}))?.hash).toBe(pilotCodeHash(testPilotCode));
});
it('rejects invalid, malformed and expired codes without setting a session',async()=>{
 for(const code of [null,{},'',testPilotCode.replace('0000','1111'),'x'.repeat(200)]){const response=await POST(request(code));expect(response.status).toBe(403);expect(response.headers.get('set-cookie')).toBeNull();}
 vi.stubEnv('PILOT_INVITE_HASHES',JSON.stringify([{hash:pilotCodeHash(testPilotCode),expiresAt:'2000-01-01',maxCalls:20}]));expect((await POST(request())).status).toBe(403);
});
it('fails closed for missing, malformed or excessive configuration',async()=>{
 for(const raw of ['', '{}','[]',JSON.stringify([{hash:pilotCodeHash(testPilotCode),expiresAt:'2099-01-01',maxCalls:21}])]){vi.stubEnv('PILOT_INVITE_HASHES',raw);expect(pilotAccessConfigured()).toBe(false);expect((await POST(request())).status).toBe(503);}
});
it('blocks foreign browser origins and oversized code requests',async()=>{
 expect((await POST(request(testPilotCode,{origin:'https://evil.example'}))).status).toBe(403);
 expect((await POST(request(testPilotCode,{'sec-fetch-site':'cross-site'}))).status).toBe(403);
 expect((await POST(request('x'.repeat(1100)))).status).toBe(413);
 expect((await POST(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'broken'}))).status).toBe(400);
});
it('limits repeated code guesses without consuming provider calls',async()=>{
 for(let i=0;i<15;i++)expect((await POST(request('wrong'))).status).toBe(403);
 const response=await POST(request());expect(response.status).toBe(429);expect(response.headers.get('Retry-After')).toBeTruthy();
});
it('rejects forged sessions, expiration, key rotation and invite revocation',()=>{
 const cookie=testPilotCookie();expect(session(cookie)).toBeTruthy();
 expect(session(cookie+'x')).toBeNull();
 vi.stubEnv('PILOT_SESSION_SECRET','rotated-test-key-that-is-at-least-32-characters');expect(session(cookie)).toBeNull();
 configurePilotAccess();vi.stubEnv('PILOT_INVITE_HASHES',JSON.stringify([{hash:pilotCodeHash(testPilotCode.replace('0000','1111')),expiresAt:'2099-01-01',maxCalls:20}]));expect(session(cookie)).toBeNull();
});
it('expires a session after 24 hours and never extends the invite expiry',()=>{
 const now=Date.now();const cookie=testPilotCookie();vi.spyOn(Date,'now').mockReturnValue(now+86401000);expect(session(cookie)).toBeNull();
 vi.spyOn(Date,'now').mockReturnValue(now);vi.stubEnv('PILOT_INVITE_HASHES',JSON.stringify([{hash:pilotCodeHash(testPilotCode),expiresAt:new Date(now+60000).toISOString(),maxCalls:20}]));const short=pilotSessionCookie(acceptPilotCode(testPilotCode)!);expect(short).toMatch(/Max-Age=60/);
});
it('reports authorization only and never reveals code configuration',async()=>{
 expect(await GET(new Request(url)).json()).toEqual({authorized:false});expect(await GET(new Request(url,{headers:{cookie:testPilotCookie()}})).json()).toEqual({authorized:true});
});

it('ends this browser session and rejects cross-site logout',async()=>{const response=DELETE(new Request(url,{method:'DELETE'}));expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toContain('Max-Age=0');expect(DELETE(new Request(url,{method:'DELETE',headers:{origin:'https://evil.example'}})).status).toBe(403);});
