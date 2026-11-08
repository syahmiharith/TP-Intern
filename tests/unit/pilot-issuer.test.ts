// @vitest-environment node
import {expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
it('issues unique bounded codes only to a new private file outside the repository',()=>{
 const directory=mkdtempSync(join(tmpdir(),'receipt-pilot-test-'));const target=join(directory,'invites.json');
 try{
  const output=execFileSync(process.execPath,['scripts/create-pilot-invites.mjs',target],{encoding:'utf8'});const data=JSON.parse(readFileSync(target,'utf8'));expect(data.invites).toHaveLength(7);expect(new Set(data.invites.map((invite:{code:string})=>invite.code)).size).toBe(7);expect(data.invites.filter((invite:{label:string})=>invite.label.startsWith('Pilot '))).toHaveLength(5);expect(data.invites.at(-1).maxCalls).toBe(1);expect(statSync(target).mode&0o777).toBe(0o600);
  for(const invite of data.invites){expect(invite.code).toMatch(/^RTF-(?:[A-F0-9]{4}-){7}[A-F0-9]{4}$/);expect(output).not.toContain(invite.code);expect(JSON.stringify(data.configuration)).not.toContain(invite.code);expect(invite.maxCalls).toBeLessThanOrEqual(20);}
  expect(()=>execFileSync(process.execPath,['scripts/create-pilot-invites.mjs',target],{stdio:'pipe'})).toThrow();
  expect(()=>execFileSync(process.execPath,['scripts/create-pilot-invites.mjs',join(process.cwd(),'private-test-invites.json')],{stdio:'pipe'})).toThrow();
 }finally{rmSync(directory,{recursive:true,force:true});}
});
