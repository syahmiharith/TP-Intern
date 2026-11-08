import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type PilotInvite = { hash: string; expiresAt: string; maxCalls: number };
const cookieName = () => process.env.NODE_ENV==="production"?"__Host-rtf-pilot":"rtf-pilot";
const sessionSeconds = 24 * 60 * 60;

function configuration(): { invites: PilotInvite[]; secret: string } | null {
  const secret=process.env.PILOT_SESSION_SECRET;
  if(!secret || secret.length<32)return null;
  try {
    const invites=JSON.parse(process.env.PILOT_INVITE_HASHES??"") as PilotInvite[];
    if(!Array.isArray(invites)||invites.length<1||invites.length>20||invites.some(invite=>!invite || !/^[a-f0-9]{64}$/.test(invite.hash)||!Number.isFinite(Date.parse(invite.expiresAt))||!Number.isSafeInteger(invite.maxCalls)||invite.maxCalls<1||invite.maxCalls>20))return null;
    return {invites,secret};
  } catch {return null;}
}

export function pilotAccessConfigured(){return configuration()!==null;}
export function pilotCodeHash(code:string){return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");}
function equal(a:string,b:string){const left=Buffer.from(a);const right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
function sign(value:string,secret:string){return createHmac("sha256",secret).update(value).digest("base64url");}

export function acceptPilotCode(code:unknown):PilotInvite|null {
  const config=configuration();
  if(!config||typeof code!=="string"||code.length>100||!/^RTF-(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/i.test(code.trim()))return null;
  const hash=pilotCodeHash(code);
  return config.invites.find(invite=>equal(invite.hash,hash)&&Date.parse(invite.expiresAt)>Date.now())??null;
}

export function pilotSessionCookie(invite:PilotInvite){
  const config=configuration();if(!config)throw new Error("Pilot access unavailable");
  const expires=Math.min(Math.floor(Date.parse(invite.expiresAt)/1000),Math.floor(Date.now()/1000)+sessionSeconds);
  const payload=Buffer.from(JSON.stringify({hash:invite.hash,expires})).toString("base64url");
  const secure=process.env.NODE_ENV==="production"?"; Secure":"";
  return `${cookieName()}=${payload}.${sign(payload,config.secret)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(0,expires-Math.floor(Date.now()/1000))}${secure}`;
}

export function readPilotSession(request:Request):PilotInvite|null {
  const config=configuration();if(!config)return null;
  const cookies=request.headers.get("cookie")??"";
  if(cookies.length>8192)return null;
  const name=cookieName();
  const token=cookies.split(";").map(value=>value.trim()).find(value=>value.startsWith(`${name}=`))?.slice(name.length+1);
  if(!token||token.length>512)return null;
  const [payload,signature,...extra]=token.split(".");
  if(!payload||!signature||extra.length||!equal(signature,sign(payload,config.secret)))return null;
  try {
    const session=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
    if(!Number.isSafeInteger(session.expires)||session.expires<=Date.now()/1000||session.expires>Date.now()/1000+sessionSeconds+1)return null;
    return config.invites.find(invite=>invite.hash===session.hash&&Date.parse(invite.expiresAt)>Date.now()&&session.expires<=Date.parse(invite.expiresAt)/1000)??null;
  } catch {return null;}
}

export function pilotAccessRequired(){return Response.json({code:"PILOT_ACCESS_REQUIRED",error:"Enter your pilot code to extract receipts."},{status:401,headers:{"Cache-Control":"no-store"}});}
export function clearPilotSessionCookie(){return `${cookieName()}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.NODE_ENV==="production"?"; Secure":""}`;}
