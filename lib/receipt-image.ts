/** Check content independently of a caller-controlled filename or MIME label. */
export function receiptImageType(bytes: Uint8Array): string | null {
  if ([137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value)) return "image/png";
  if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return "image/jpeg";
  if (String.fromCharCode(...bytes.subarray(0,4))==="RIFF" && String.fromCharCode(...bytes.subarray(8,12))==="WEBP") return "image/webp";
  return null;
}
