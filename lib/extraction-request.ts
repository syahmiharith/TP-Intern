import { maxReceiptImageSizeBytes, type ExtractionErrorCode } from "./receipt";

export class ExtractionRequestError extends Error {
  constructor(message: string, public status = 400, public code:ExtractionErrorCode = "INVALID_REQUEST") { super(message); }
}

export const maxExtractionRequestBytes = maxReceiptImageSizeBytes + 64 * 1024;

/** Reject browser cross-site use before reading a body or reserving provider budget.
 * This is a browser-origin check, not authentication for direct API clients. */
export function validateExtractionRequest(request: Request) {
  if (request.headers.get("sec-fetch-site")==="cross-site") throw new ExtractionRequestError("Extract receipts from this app.",403);
  const origin=request.headers.get("origin");
  if (origin && origin!==new URL(request.url).origin) throw new ExtractionRequestError("Extract receipts from this app.",403);
  const type=request.headers.get("content-type");
  if (!type || !/^multipart\/form-data\s*;/i.test(type)) throw new ExtractionRequestError("Upload a receipt image using multipart form data.");
  const length=request.headers.get("content-length");
  if(length!==null && (!/^\d+$/.test(length)||!Number.isSafeInteger(Number(length)))) throw new ExtractionRequestError("Invalid upload length.");
  if(length!==null && Number(length)>maxExtractionRequestBytes) throw new ExtractionRequestError("Receipt upload is too large.",413,"FILE_TOO_LARGE");
}

/** Enforce a real byte ceiling even with chunked or dishonest Content-Length. */
export async function readExtractionForm(request: Request, timeoutMs=10_000): Promise<FormData> {
  if(!request.body) {
    try { return await request.formData(); } catch { throw new ExtractionRequestError("Could not read this receipt upload."); }
  }
  const reader=request.body.getReader();
  const chunks:Uint8Array[]=[];let size=0;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new ExtractionRequestError("Receipt upload timed out.",408)),timeoutMs);});
  try {
    while(true) {
      const {done,value}=await Promise.race([reader.read(),deadline]);
      if(done)break;
      size+=value.byteLength;
      if(size>maxExtractionRequestBytes)throw new ExtractionRequestError("Receipt upload is too large.",413,"FILE_TOO_LARGE");
      chunks.push(value);
    }
    const body=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
    return await new Response(body,{headers:{"Content-Type":request.headers.get("content-type")!}}).formData();
  } catch(error) {
    void reader.cancel().catch(()=>{});
    if(error instanceof ExtractionRequestError)throw error;
    throw new ExtractionRequestError("Could not read this receipt upload.");
  } finally {clearTimeout(timer);reader.releaseLock();}
}
