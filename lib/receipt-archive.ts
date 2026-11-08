import { Unzip, UnzipInflate, unzipSync } from "fflate";
import { maxReceiptImageSizeBytes } from "./receipt";

export const maxArchiveBytes = 25 * 1024 * 1024;
const maxArchiveEntries = 200;
const imageTypes: Record<string,string> = {jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp"};
export type ArchiveEntry = {name:string;size:number;type:string;reason?:string};
export type ArchiveSource = {name:string;bytes:Uint8Array;entries:ArchiveEntry[]};
export function isZip(file: Pick<File,"name"|"type">) {
  return /\.zip$/i.test(file.name) || ["application/zip","application/x-zip-compressed"].includes(file.type);
}

/** Inspect central-directory metadata without inflating any entry. */
export function inspectArchive(bytes:Uint8Array):ArchiveEntry[] {
  if(bytes.length>maxArchiveBytes)throw new Error("ZIP files must be 25 MB or smaller.");
  const entries:ArchiveEntry[]=[];const seen=new Set<string>();let count=0;
  try { unzipSync(bytes,{filter:entry=>{
    if(++count>maxArchiveEntries)throw new Error("This ZIP contains more than 200 entries. Split it into smaller archives.");
    const name=entry.name.replace(/\\/g,"/");
    if(name.endsWith("/")||name.split("/").includes("__MACOSX")||name.split("/").pop()!.startsWith("._")||name.split("/").pop()===".DS_Store")return false;
    const type=imageTypes[name.split(".").pop()!.toLowerCase()]||"";
    const reason=/^(?:\/|[a-z]:)/i.test(name)||name.split("/").includes("..")?"Unsafe file path":
      seen.has(name)?"Duplicate file path":!type?"Unsupported file type":
      ![0,8].includes(entry.compression)?"Unsupported ZIP compression":
      entry.originalSize>maxReceiptImageSizeBytes?"Larger than 5 MB":entry.originalSize===0?"Empty file":undefined;
    seen.add(name);entries.push({name,size:entry.originalSize,type,reason});return false;
  }}); } catch(error) {
    if(error instanceof Error && error.message.startsWith("This ZIP"))throw error;
    throw new Error("Could not open this ZIP. Try an unencrypted ZIP file.");
  }
  return entries;
}

/** Inflate selected entries in bounded chunks; never recurse into nested archives. */
export async function extractArchive(source:ArchiveSource,names:readonly string[]):Promise<File[]> {
  const wanted=new Map(source.entries.filter(entry=>names.includes(entry.name)&&!entry.reason).map(entry=>[entry.name,entry]));
  if(wanted.size!==names.length||wanted.size>5)throw new Error("Choose up to five supported images.");
  let failure:Error|undefined;
  const files:File[]=[];const found=new Set<string>();const active:{terminate:()=>void}[]=[];
  const unzip=new Unzip(entry=>{
    const name=entry.name.replace(/\\/g,"/");const info=wanted.get(name);if(!info)return;
    if(found.has(name))throw new Error("Duplicate file paths cannot be imported.");found.add(name);active.push(entry);
    let size=0;const chunks:Uint8Array<ArrayBuffer>[]=[];
    entry.ondata=(error,chunk,final)=>{
      if(failure)return;
      if(error){failure=new Error(`${name}: could not decompress this file.`);return;}
      size+=chunk.length;
      if(size>maxReceiptImageSizeBytes){failure=new Error(`${name}: file is larger than 5 MB.`);return;}
      chunks.push(new Uint8Array(chunk));
      if(final){if(size!==info.size){failure=new Error(`${name}: ZIP contents do not match its file list.`);return;}const data=new Uint8Array(size);let offset=0;for(const part of chunks){data.set(part,offset);offset+=part.length;}
        const valid=info.type==="image/png"?[137,80,78,71,13,10,26,10].every((byte,index)=>data[index]===byte):info.type==="image/jpeg"?data[0]===255&&data[1]===216&&data[2]===255:String.fromCharCode(...data.subarray(0,4))==="RIFF"&&String.fromCharCode(...data.subarray(8,12))==="WEBP";
        if(!valid){failure=new Error(`${name}: not a readable image. Use an unencrypted ZIP with JPG, PNG or WEBP images.`);return;}
        files.push(new File([data], name,{type:info.type}));}
    };entry.start();
  });unzip.register(UnzipInflate);
  try{
    for(let offset=0;offset<source.bytes.length;offset+=4096){
      unzip.push(source.bytes.subarray(offset,offset+4096),offset+4096>=source.bytes.length);
      if(failure)throw failure;
      // Yield regularly so keyboard and UI updates are not starved by large archives.
      if(offset%262144===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(files.length!==wanted.size)throw new Error("Some selected files could not be read. Try another ZIP.");
    return names.map(name=>files.find(file=>file.name===name)!);
  }finally{active.forEach(entry=>entry.terminate());}
}
