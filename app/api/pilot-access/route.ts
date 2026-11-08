import { acceptPilotCode, clearPilotSessionCookie, pilotAccessConfigured, pilotSessionCookie, readPilotSession } from "@/lib/pilot-access";
import { checkReceiptExtractionRateLimit } from "@/lib/rate-limit";

export const runtime="nodejs";
export const maxDuration=10;
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export function GET(request:Request){return reply({authorized:Boolean(readPilotSession(request))});}
export function DELETE(request:Request){
  const origin=request.headers.get("origin");
  if(request.headers.get("sec-fetch-site")==="cross-site"||(origin&&origin!==new URL(request.url).origin))return reply({error:"Open this app to end your pilot session."},403);
  const response=reply({authorized:false});response.headers.set("Set-Cookie",clearPilotSessionCookie());return response;
}
export async function POST(request:Request){
  const limit=checkReceiptExtractionRateLimit(request);if(limit)return limit;
  const origin=request.headers.get("origin");
  if(request.headers.get("sec-fetch-site")==="cross-site"||(origin&&origin!==new URL(request.url).origin))return reply({error:"Open this app to enter your pilot code."},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))return reply({error:"Enter a valid pilot code."},400);
  if(!pilotAccessConfigured())return reply({error:"Live extraction is temporarily unavailable. Try sample receipts."},503);
  const reader=request.body?.getReader();if(!reader)return reply({error:"Enter a valid pilot code."},400);
  let timer:ReturnType<typeof setTimeout>|undefined;
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("timeout")),3000);});
  try {
    const chunks:Uint8Array[]=[];let size=0;
    while(true){const {done,value}=await Promise.race([reader.read(),timeout]);if(done)break;size+=value.byteLength;if(size>1024)return reply({error:"Enter a valid pilot code."},413);chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const invite=acceptPilotCode(JSON.parse(new TextDecoder().decode(bytes)).code);
    if(!invite)return reply({error:"This pilot code is invalid or has expired."},403);
    const response=reply({authorized:true});response.headers.set("Set-Cookie",pilotSessionCookie(invite));return response;
  }catch{return reply({error:"Enter a valid pilot code."},400);}
  finally{clearTimeout(timer);void reader.cancel().catch(()=>{});reader.releaseLock();}
}
