import {afterEach,expect,it,vi} from 'vitest';
import {receiptClientIp} from '@/lib/client-ip';
import {checkReceiptExtractionRateLimit,resetReceiptExtractionRateLimitForTests} from '@/lib/rate-limit';
afterEach(()=>{vi.unstubAllEnvs();resetReceiptExtractionRateLimitForTests();});
it('uses the edge-supplied IP on Vercel and ignores spoofed fallback headers',()=>{
 vi.stubEnv('VERCEL','1');const request=new Request('https://app.example',{headers:{'x-vercel-forwarded-for':'203.0.113.4','x-forwarded-for':'198.51.100.9','x-real-ip':'192.0.2.3'}});expect(receiptClientIp(request)).toBe('203.0.113.4');
});
it('shares a safe bucket on other production hosts and canonicalizes IPv6',()=>{
 vi.stubEnv('NODE_ENV','production');vi.stubEnv('VERCEL','');expect(receiptClientIp(new Request('https://app.example',{headers:{'x-forwarded-for':'198.51.100.9'}}))).toBe('unknown');vi.stubEnv('VERCEL','1');expect(receiptClientIp(new Request('https://app.example',{headers:{'x-vercel-forwarded-for':'2001:0db8:0000:0000:0000:0000:0000:0001'}}))).toBe('[2001:db8::1]');
});
it('bounds limiter memory and recovers expired entries',()=>{
 vi.useFakeTimers();try{for(let i=0;i<4096;i++){const request=new Request('https://app.example',{headers:{'x-forwarded-for':`10.${Math.floor(i/256)}.${i%256}.1`}});expect(checkReceiptExtractionRateLimit(request)).toBeNull();}const request=new Request('https://app.example',{headers:{'x-forwarded-for':'192.0.2.10'}});expect(checkReceiptExtractionRateLimit(request)?.status).toBe(429);vi.advanceTimersByTime(60001);expect(checkReceiptExtractionRateLimit(request)).toBeNull();}finally{vi.useRealTimers();}
});
