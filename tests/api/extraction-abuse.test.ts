// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {POST} from '@/app/api/extract-receipt/route';
import {reserveProviderCall} from '@/lib/shared-budget';
import {maxExtractionRequestBytes,readExtractionForm,validateExtractionRequest} from '@/lib/extraction-request';
import {resetReceiptExtractionRateLimitForTests} from '@/lib/rate-limit';
import {configurePilotAccess,testPilotCookie} from './support/pilot';
vi.mock('@/lib/shared-budget',()=>({reserveProviderCall:vi.fn()}));
const budget=vi.mocked(reserveProviderCall);const url='https://app.example/api/extract-receipt';
function upload(bytes:Uint8Array<ArrayBuffer>=new Uint8Array([137,80,78,71,13,10,26,10]),headers:Record<string,string>={}){const form=new FormData();form.set('receipt',new File([bytes],'receipt.png',{type:'image/png'}));return new Request(url,{method:'POST',headers:{cookie:testPilotCookie(),...headers},body:form});}
beforeEach(()=>{configurePilotAccess();vi.stubEnv('GEMINI_API_KEY','test-only');resetReceiptExtractionRateLimitForTests();budget.mockReset().mockResolvedValue(null);});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
it('denies unauthenticated direct API calls before parsing uploads or reserving provider budget',async()=>{
 const parse=vi.fn();const response=await POST({headers:new Headers(),formData:parse} as unknown as Request);expect(response.status).toBe(401);expect((await response.json()).code).toBe('PILOT_ACCESS_REQUIRED');expect(parse).not.toHaveBeenCalled();expect(budget).not.toHaveBeenCalled();
});
it('rejects MIME spoofing and empty uploads before provider reservation',async()=>{
 for(const bytes of [new TextEncoder().encode('<script>alert(1)</script>'),new Uint8Array()]){const response=await POST(upload(bytes));expect(response.status).toBe(400);expect((await response.json()).code).toBe('INVALID_FILE_TYPE');}expect(budget).not.toHaveBeenCalled();
});
it('rejects cross-site uploads, malformed bodies and unsupported request types',async()=>{
 expect((await POST(upload(undefined,{origin:'https://evil.example'}))).status).toBe(403);
 expect((await POST(upload(undefined,{'sec-fetch-site':'cross-site'}))).status).toBe(403);
 expect((await POST(new Request(url,{method:'POST',headers:{cookie:testPilotCookie(),'Content-Type':'text/plain'},body:'test'}))).status).toBe(400);
 expect((await POST(new Request(url,{method:'POST',headers:{cookie:testPilotCookie(),'Content-Type':'multipart/form-data; boundary=bad'},body:'broken'}))).status).toBe(400);
 expect(budget).not.toHaveBeenCalled();
});
it('enforces actual bytes with absent or dishonest Content-Length',async()=>{
 for(const length of [undefined,'1']){const headers:Record<string,string>={'Content-Type':'multipart/form-data; boundary=test',cookie:testPilotCookie()};if(length)headers['Content-Length']=length;const response=await POST(new Request(url,{method:'POST',headers,body:new Uint8Array(maxExtractionRequestBytes+1)}));expect(response.status).toBe(413);}expect(budget).not.toHaveBeenCalled();
});
it('rejects declared oversized or malformed lengths before reading',()=>{
 for(const value of ['-1','invalid','1.5',String(maxExtractionRequestBytes+1)]){expect(()=>validateExtractionRequest(new Request(url,{headers:{'Content-Type':'multipart/form-data; boundary=test','Content-Length':value}}))).toThrow();}
});
it('times out a stalled upload rather than retaining an open reader',async()=>{
 const cancel=vi.fn();const stream=new ReadableStream({cancel});const request=new Request(url,{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary=test'},body:stream,duplex:'half'} as RequestInit);await expect(readExtractionForm(request,10)).rejects.toMatchObject({status:408});expect(cancel).toHaveBeenCalled();
});
it('provides an extraction kill switch without spending budget',async()=>{
 vi.stubEnv('LIVE_EXTRACTION_ENABLED','false');expect((await POST(upload())).status).toBe(503);expect(budget).not.toHaveBeenCalled();
});
it('bounds provider output tokens and rejects oversized response bodies without retrying',async()=>{
 const fetch=vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('x'.repeat(128*1024+1)));vi.stubGlobal('fetch',fetch);expect((await POST(upload())).status).toBe(502);expect(fetch).toHaveBeenCalledTimes(1);expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).generationConfig.maxOutputTokens).toBe(4096);
});
