import {randomBytes,createHash} from 'node:crypto';
import {realpath,writeFile} from 'node:fs/promises';
import {dirname,isAbsolute,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const target=process.argv[2];
if(!target||!isAbsolute(target))throw new Error('Provide an absolute output path in an existing private directory outside this repository.');
const root=await realpath(fileURLToPath(new URL('..',import.meta.url)));
const parent=await realpath(dirname(target));
const output=resolve(parent,target.split('/').at(-1));
const fromRoot=relative(root,output);
if(!fromRoot||(!fromRoot.startsWith('..'+ '/')))throw new Error('Keep invite credentials outside the repository.');
const createdAt=new Date().toISOString();
const expiresAt=new Date(Date.now()+14*86400000).toISOString();
const specs=[...Array.from({length:5},(_,i)=>({label:`Pilot ${i+1}`,maxCalls:20,expiresAt})),{label:'Owner',maxCalls:20,expiresAt},{label:'Release verification',maxCalls:1,expiresAt:new Date(Date.now()+86400000).toISOString()}];
const invites=specs.map(spec=>{const hex=randomBytes(16).toString('hex').toUpperCase();const code='RTF-'+hex.match(/.{4}/g).join('-');return {...spec,code,hash:createHash('sha256').update(code).digest('hex')};});
await writeFile(output,JSON.stringify({createdAt,sessionSecret:randomBytes(32).toString('base64url'),invites,configuration:invites.map(({hash,expiresAt,maxCalls})=>({hash,expiresAt,maxCalls}))},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(`Created five unassigned pilot codes, an owner code and a single-call verification code in ${output}. Keep this file private; no codes were printed.`);
