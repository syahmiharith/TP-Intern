import { vi } from "vitest";
import { acceptPilotCode, pilotCodeHash, pilotSessionCookie } from "@/lib/pilot-access";
export const testPilotCode="RTF-0000-0000-0000-0000-0000-0000-0000-0000";
export function configurePilotAccess(){
  vi.stubEnv("PILOT_SESSION_SECRET","test-only-session-key-not-for-deployment-000000");
  vi.stubEnv("PILOT_INVITE_HASHES",JSON.stringify([{hash:pilotCodeHash(testPilotCode),expiresAt:"2099-01-01T00:00:00.000Z",maxCalls:20}]));
}
export function testPilotCookie(){return pilotSessionCookie(acceptPilotCode(testPilotCode)!).split(";")[0];}
export function budgetRequest(headers:Record<string,string>={}){return new Request("http://localhost",{headers:{cookie:testPilotCookie(),...headers}});}
