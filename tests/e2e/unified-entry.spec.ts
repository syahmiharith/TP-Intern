import { test, expect } from '@playwright/test';
import { highConfidenceExtraction, createGeneratedReceiptPng } from './support/receipt';
import { extractionToFormValues } from '../../lib/receipt';
const branded='https://receipt-to-form-syahmiharith.vercel.app';
const legacy='https://tp-intern-malaysia.vercel.app';
test.beforeEach(async ({page,baseURL})=>{
 test.skip(!baseURL?.includes('127.0.0.1'),'Host routing fixtures run against local server only.');
 await page.route(/^https:\/\/(tp-intern-malaysia|receipt-to-form-syahmiharith)\.vercel\.app\/.*/,async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/seed') return route.fulfill({contentType:'text/html',body:'<title>Storage fixture</title>'});
  const response=await route.fetch({url:baseURL+url.pathname+url.search});await route.fulfill({response});
 });
});
test.afterEach(async ({page})=>{await page.unrouteAll({behavior:'wait'});});
for(const state of ['pending','extracting','unsupported','branded'] as const){
 test(`legacy ${state} data stays recoverable`,async({page})=>{
  const entry=state==='branded'?branded:legacy;
  await page.goto(entry+'/seed');
  const png=await createGeneratedReceiptPng(page);
  const values=extractionToFormValues(highConfidenceExtraction);
  const item={id:'legacy-one',selected:true,expanded:true,status:state==='extracting'?'extracting':'needs-review',progress:100,extraction:highConfidenceExtraction,savedValues:values,formValues:{...values,totalAmount:'28.00'},reviewedAt:new Date().toISOString(),editedAt:Date.now(),errors:{},previewUrl:''};
  await page.evaluate(async({item,bytes,state})=>{await new Promise<void>((resolve,reject)=>{
   const open=indexedDB.open('receipt-expenses',2);open.onupgradeneeded=()=>{open.result.createObjectStore('batches');open.result.createObjectStore('images');};
   open.onsuccess=()=>{const db=open.result;const tx=db.transaction(['batches','images'],'readwrite');tx.objectStore('batches').put({schemaVersion:state==='unsupported'?99:2,items:[item]},'current');tx.objectStore('images').put({name:'legacy.png',type:'image/png',lastModified:0,bytes:new Uint8Array(bytes).buffer},item.id);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  });},{item,bytes:Array.from(png.buffer),state});
  await page.goto(entry);
  if(state==='unsupported') await expect(page.getByText(/Saved data could not be opened/)).toBeVisible();
  else{
   if(state!=='branded') await expect(page.getByText(/recovering receipts saved at the old address/)).toBeVisible();
   await expect(page.getByLabel('Total Amount',{exact:true})).toHaveValue('28.00');
   if(state!=='branded') await expect(page.getByRole('button',{name:'Try two sample receipts'})).toBeDisabled();
   if(state==='extracting') await expect(page.getByText('Extraction interrupted. Retry when ready.',{exact:true})).toBeVisible();
  }
  expect(new URL(page.url()).origin).toBe(entry);
  await page.getByRole('button',{name:'Clear saved receipts'}).click();
  await expect(page).toHaveURL(branded+'/');
  await expect(page.getByRole('button',{name:'Try two sample receipts'})).toBeEnabled();
 });
}
test('empty legacy redirects to branded entry',async({page})=>{await page.goto(legacy);await expect(page).toHaveURL(branded+'/');await expect(page.getByRole('button',{name:'Try two sample receipts'})).toBeEnabled();});
test('unreadable legacy storage never redirects',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(IDBFactory.prototype,'open',{configurable:true,value(){throw new Error('Storage unavailable');}});});await page.goto(legacy);
 await expect(page.getByText(/Saved data could not be opened/)).toBeVisible();expect(new URL(page.url()).origin).toBe(legacy);
});
