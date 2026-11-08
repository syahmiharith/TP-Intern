import {describe,expect,it} from "vitest";
import {zipSync} from "fflate";
import {extractArchive,inspectArchive,isZip,maxArchiveBytes} from "@/lib/receipt-archive";
const png=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);
function source(bytes:Uint8Array){return{name:"receipts.zip",bytes,entries:inspectArchive(bytes)};}

describe("ZIP receipt import",()=>{
 it("recognizes ZIP filenames and MIME types",()=>{expect(isZip({name:"Receipts.ZIP",type:""})).toBe(true);expect(isZip({name:"archive",type:"application/zip"})).toBe(true);expect(isZip({name:"photo.png",type:"image/png"})).toBe(false);});
 it("lists nested images and explains unsupported entries without inflating them",()=>{
  const entries=inspectArchive(zipSync({"folder/Cafe.PNG":png,"notes.txt":new Uint8Array([1]),"nested.zip":new Uint8Array([1]),"__MACOSX/._Cafe.PNG":png,"empty/":new Uint8Array()}));
  expect(entries.map(entry=>[entry.name,entry.type,entry.reason])).toEqual([["folder/Cafe.PNG","image/png",undefined],["notes.txt","","Unsupported file type"],["nested.zip","","Unsupported file type"]]);
 });
 it.each([0,6] as const)("extracts only chosen images with ZIP compression level %s",async level=>{
  const archive=source(zipSync({"folder/a.png":png,"b.png":new Uint8Array([...png,4]),"notes.txt":new Uint8Array([1])},{level}));
  const files=await extractArchive(archive,["b.png"]);expect(files).toHaveLength(1);expect(files[0].name).toBe("b.png");expect(files[0].type).toBe("image/png");expect(files[0].size).toBe(png.length+1);
 });
 it("preserves JPEG and WebP MIME types from supported filenames",async()=>{
  const jpg=new Uint8Array([255,216,255,224]);const webp=new TextEncoder().encode("RIFF0000WEBP");
  const files=await extractArchive(source(zipSync({"photo.jpeg":jpg,"scan.webp":webp})),["photo.jpeg","scan.webp"]);
  expect(files.map(file=>file.type)).toEqual(["image/jpeg","image/webp"]);
 });
 it("rejects invalid and oversized archives and excessive entry counts",()=>{
  expect(()=>inspectArchive(new Uint8Array([1,2,3]))).toThrow();expect(()=>inspectArchive(new Uint8Array(maxArchiveBytes+1))).toThrow("25 MB");
  expect(()=>inspectArchive(zipSync(Object.fromEntries(Array.from({length:201},(_,i)=>[`${i}.png`,png]))))).toThrow("200 entries");
 });
 it("marks oversized files unavailable and rejects disguised images",async()=>{
  const archive=source(zipSync({"large.png":new Uint8Array(5*1024*1024+1),"fake.png":new Uint8Array([1,2,3])}));expect(archive.entries[0].reason).toBe("Larger than 5 MB");await expect(extractArchive(archive,["large.png"])).rejects.toThrow("supported images");await expect(extractArchive(archive,["fake.png"])).rejects.toThrow("not a readable image");
 });
 it("limits actual inflated output even when declared sizes are false",async()=>{
  const bytes=zipSync({"bomb.png":new Uint8Array(7*1024*1024)});const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let i=0;i<bytes.length-24;i++)if(view.getUint32(i,true)===0x02014b50)view.setUint32(i+24,1,true);
  await expect(extractArchive(source(bytes),["bomb.png"])).rejects.toThrow("larger than 5 MB");
 });
 it("enforces the five-image selection boundary",async()=>{
  const archive=source(zipSync(Object.fromEntries(Array.from({length:6},(_,i)=>[`${i}.png`,png]))));await expect(extractArchive(archive,archive.entries.map(entry=>entry.name))).rejects.toThrow("five");
 });
});
