import {chooseExport} from './support/actions';
import {test,expect,type Page,type Route} from './support/test';
import {readFile} from 'node:fs/promises';
import {gotoHome,uploadReceipts,highConfidenceExtraction} from './support/receipt';

const files=(count:number)=>Array.from({length:count},(_,i)=>({name:`parallel-${i}.png`,mimeType:'image/png',buffer:Buffer.from(`synthetic-${i}`)}));
async function stored(page:Page){return page.evaluate(()=>new Promise<{items:{id:string;status:string}[]}>(resolve=>{const open=indexedDB.open('receipt-expenses');open.onsuccess=()=>{const db=open.result;const tx=db.transaction('batches','readonly');const request=tx.objectStore('batches').get('current');request.onsuccess=()=>resolve(request.result);tx.oncomplete=()=>db.close();};}));}
async function heldQueue(page:Page){
 const held:Route[]=[];const pending=new Map<number,Route>();let active=0;let peak=0;
 await page.route('**/api/extract-receipt',route=>{const match=route.request().postDataBuffer()!.toString().match(/filename="parallel-(\d+)\.png"/);if(!match)throw new Error('Unexpected receipt request');pending.set(Number(match[1]),route);held.push(route);active++;peak=Math.max(peak,active);});
 async function finish(index:number,total:number,status=200,code?:string){const route=pending.get(index);if(!route)throw new Error(`Receipt ${index} is not active`);pending.delete(index);active--;await route.fulfill({status,json:status===200?{data:{...highConfidenceExtraction,merchantName:`Merchant ${total}`,totalAmount:total,currency:'USD'},requestId:`request-${total}`,extractedAt:'2026-11-08T00:00:00.000Z'}:{code,error:code==='RATE_LIMITED'?'Extraction allowance reached. Retry later or use sample receipts.':'Temporary extraction failure.'}});}
 return {held,finish,peak:()=>peak};
}

test('two slots refill independently, preserve out-of-order results and allow a failed receipt retry',async({page})=>{
 await gotoHome(page);const queue=await heldQueue(page);await uploadReceipts(page,files(5));await expect.poll(async()=>(await stored(page)).items.length).toBe(5);const ids=(await stored(page)).items.map(item=>item.id);
 await page.getByRole('button',{name:'Extract',exact:true}).click();await expect.poll(()=>queue.held.length).toBe(2);await expect(page.getByRole('progressbar')).toHaveCount(2);await expect(page.getByText('0 of 5 processed',{exact:true})).toBeVisible();
 // The second receipt completes first. Its slot refills without waiting for the first.
 await queue.finish(1,22);await expect.poll(()=>queue.held.length).toBe(3);await expect(page.locator('article').nth(1).getByTestId('receipt-status')).toHaveText('Ready');await expect(page.locator('article').nth(0).getByTestId('receipt-status')).toHaveText('Extracting');await expect(page.getByText('1 of 5 processed',{exact:true})).toBeVisible();
 const partialDownload=page.waitForEvent('download');await chooseExport(page,'JSON');const partial=JSON.parse(await readFile((await(await partialDownload).path())!,'utf8'));expect(partial).toHaveLength(1);expect(partial[0].receiptId).toBe(ids[1]);expect(partial[0].values.totalAmount).toBe('22');
 await queue.finish(2,0,503);await expect.poll(()=>queue.held.length).toBe(4);await queue.finish(0,11);await expect.poll(()=>queue.held.length).toBe(5);await queue.finish(3,44);await queue.finish(4,55);await expect(page.getByText('5 of 5 processed',{exact:true})).toBeVisible();await expect(page.locator('article').getByText('Ready',{exact:true})).toHaveCount(4);expect(queue.peak()).toBe(2);
 const failed=page.locator('article').nth(2);await failed.getByRole('button',{name:'Expand parallel-2.png',exact:true}).click();await expect(failed).toContainText('Temporary extraction failure.');await failed.getByRole('button',{name:'Retry',exact:true}).click();await expect.poll(()=>queue.held.length).toBe(6);await expect(page.getByRole('progressbar')).toHaveCount(1);await queue.finish(2,33);await expect(page.locator('article').getByText('Ready',{exact:true})).toHaveCount(5);
 const pending=page.waitForEvent('download');await chooseExport(page,'JSON');const records=JSON.parse(await readFile((await(await pending).path())!,'utf8'));expect(records.map((record:{receiptId:string})=>record.receiptId)).toEqual(ids);expect(records.map((record:{values:{totalAmount:string}})=>record.values.totalAmount)).toEqual(['11','22','33','44','55']);expect(records.every((record:{originalExtraction:{confidence:string}})=>record.originalExtraction.confidence==='high')).toBe(true);
 const csvPending=page.waitForEvent('download');await chooseExport(page,'CSV');const csv=await readFile((await(await csvPending).path())!,'utf8');for(const id of ids)expect(csv).toContain(id);for(const total of [11,22,33,44,55])expect(csv).toContain(`Merchant ${total}`);
});

for(const status of [429,503]){
 test(`an allowance response (${status}) pauses queued work and keeps the other active result`,async({page})=>{
  await gotoHome(page);const queue=await heldQueue(page);await uploadReceipts(page,files(5));await page.getByRole('button',{name:'Extract',exact:true}).click();await expect.poll(()=>queue.held.length).toBe(2);await queue.finish(0,0,status,'RATE_LIMITED');await expect(page.locator('article').nth(0).getByTestId('receipt-status')).toHaveText('Failed');expect(queue.held).toHaveLength(2);await queue.finish(1,22);await expect(page.getByText('2 of 5 processed · Paused',{exact:true})).toBeVisible();await expect(page.getByText('Extraction allowance reached. Retry later or use sample receipts.',{exact:true})).toBeVisible();await expect(page.locator('article').getByText('Queued',{exact:true})).toHaveCount(3);await expect(page.getByRole('button',{name:'Export',exact:true})).toBeEnabled();expect(queue.held).toHaveLength(2);
 });
}

test('refresh preserves completed results and makes both interrupted slots manually retryable',async({page})=>{
 await gotoHome(page);const queue=await heldQueue(page);await uploadReceipts(page,files(4));await page.getByRole('button',{name:'Extract',exact:true}).click();await expect.poll(()=>queue.held.length).toBe(2);await queue.finish(0,11);await expect.poll(()=>queue.held.length).toBe(3);await expect.poll(async()=>(await stored(page)).items.map(item=>item.status)).toEqual(['extracted','extracting','extracting','ready']);const ids=(await stored(page)).items.map(item=>item.id);
 await page.reload();await Promise.all(queue.held.map(route=>route.abort().catch(()=>{})));await expect(page.locator('article').getByText('Ready',{exact:true})).toHaveCount(1);await expect(page.locator('article').getByText('Failed',{exact:true})).toHaveCount(2);await expect(page.locator('article').getByText('Queued',{exact:true})).toHaveCount(1);expect(queue.held).toHaveLength(3);expect((await stored(page)).items.map(item=>item.id)).toEqual(ids);await expect(page.getByRole('button',{name:'Export',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Extract',exact:true}).click();await expect.poll(()=>queue.held.length).toBe(5);await expect(page.getByRole('progressbar')).toHaveCount(2);await page.getByRole('button',{name:'Stop remaining receipts',exact:true}).click();await queue.finish(1,22);await queue.finish(2,33);await expect(page.getByText('2 of 3 processed · Stopped',{exact:true})).toBeVisible();expect(queue.held).toHaveLength(5);await expect(page.locator('article').getByText('Ready',{exact:true})).toHaveCount(3);
});
