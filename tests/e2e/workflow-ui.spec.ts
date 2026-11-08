import {chooseExport} from './support/actions';
import {expect,test,type Route} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {currentCurrencies} from '../../lib/currencies';
import {gotoHome,highConfidenceExtraction,uploadReceipts,mockExtractionResponse,createGeneratedReceiptPng} from './support/receipt';

for(const width of [375,768,1280]){
 test(`one status and all details on expansion at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await gotoHome(page);await page.getByRole('button',{name:'Try samples',exact:true}).click();
  const row=page.locator('article').first();
  await expect(row.getByTestId('receipt-status')).toHaveCount(1);
  await expect(row.getByTestId('receipt-status')).toHaveText('Ready');
  const select=row.getByRole('button',{name:'Deselect Sample cafe.png',exact:true});
  await expect(select).toHaveCSS('border-width','0px');
  await expect(row.getByLabel('Merchant Name',{exact:true})).toBeVisible();
  await expect(row.getByRole('list',{name:'Notes',exact:true})).toBeVisible();
  await expect(row.getByAltText('Inline preview of Sample cafe.png')).toBeVisible();
  await expect(row.getByRole('button',{name:/Save changes|Discard changes|Mark reviewed/})).toHaveCount(0);
  await row.getByRole('button',{name:'Collapse Sample cafe.png',exact:true}).click();
  await expect(row.getByLabel('Merchant Name',{exact:true})).toHaveCount(0);
  await expect(row.getByRole('list',{name:'Notes',exact:true})).toHaveCount(0);
  await expect(row.locator('p')).toHaveCount(0);
  await expect(row.getByTestId('receipt-status')).toHaveCount(1);
  await row.getByRole('button',{name:'Expand Sample cafe.png',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(row.getByLabel('Merchant Name',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
 test(`contextual fields, live line items and footer at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await mockExtractionResponse(page,{...highConfidenceExtraction,currency:'USD'});await gotoHome(page);
  await uploadReceipts(page,[{name:'items.png',mimeType:'image/png',buffer:Buffer.from('synthetic items')}]);
  await page.getByRole('button',{name:'Extract',exact:true}).click();const row=page.locator('article');
  await expect(row.getByTestId('receipt-status')).toHaveText('Ready');await row.getByRole('button',{name:'Expand items.png',exact:true}).click();
  const total=row.getByLabel('Total Amount',{exact:true});await expect(total).toHaveAttribute('type','text');await expect(total).toHaveAttribute('inputmode','decimal');
  await expect(row.getByLabel('Date',{exact:true})).toHaveAttribute('type','date');
  const type=row.getByRole('combobox',{name:'Receipt Type',exact:true});await type.fill('Transport');await type.press('ArrowDown');await type.press('Enter');await expect(type).toHaveValue('Transport');
  await expect(row.locator('select')).toHaveCount(0);
  const currency=row.getByRole('combobox',{name:'Currency',exact:true});await currency.click();await expect(row.getByRole('listbox',{name:'Currencies'}).getByRole('option')).toHaveCount(currentCurrencies.length);await currency.fill('Malaysian');await currency.press('Enter');await expect(currency).toHaveValue('MYR');
  await row.getByLabel('Item 1 name',{exact:true}).fill('Client lunch');await row.getByLabel('Item 1 quantity',{exact:true}).fill('1.25');await row.getByLabel('Item 1 price',{exact:true}).fill('2.75');
  await expect(total).toHaveValue('12000');
  await expect(page.getByRole('button',{name:'Export',exact:true})).toBeEnabled();
  await page.waitForTimeout(300);await page.reload();
  await expect(row.getByLabel('Item 1 name',{exact:true})).toHaveValue('Client lunch');await expect(row.getByLabel('Item 1 quantity',{exact:true})).toHaveValue('1.25');await expect(row.getByLabel('Item 1 price',{exact:true})).toHaveValue('2.75');
  const download=page.waitForEvent('download');await chooseExport(page,'JSON');
  const [record]=JSON.parse(await readFile((await(await download).path())!,'utf8'));
  expect(record.schemaVersion).toBe(2);expect(record.items[0]).toEqual({name:'Client lunch',quantity:'1.25',price:'2.75'});expect(record.originalExtraction.items[0].name).toBe('Coffee');expect(record.originalExtraction.confidence).toBe('high');
  const csvDownload=page.waitForEvent('download');await chooseExport(page,'CSV');const csv=await readFile((await(await csvDownload).path())!,'utf8');expect(csv).toContain('Client lunch');expect(csv).toContain('2.75');expect(csv).toContain(record.receiptId);
  await row.getByLabel('Item 1 price',{exact:true}).fill('1e3');await expect(page.getByRole('button',{name:'Export',exact:true})).toBeDisabled();await row.getByLabel('Item 1 price',{exact:true}).fill('-2.50');await expect(page.getByRole('button',{name:'Export',exact:true})).toBeEnabled();
  await row.getByRole('button',{name:'Add item',exact:true}).click();await expect(row.getByLabel('Item 2 name',{exact:true})).toBeFocused();await row.getByRole('button',{name:'Remove item 2',exact:true}).click();await expect(row.getByRole('button',{name:'Add item',exact:true})).toBeFocused();
  const gap=await page.evaluate(()=>document.querySelector('footer')!.getBoundingClientRect().top-document.querySelector('[aria-label="Batch actions"]')!.getBoundingClientRect().bottom);expect(gap).toBeGreaterThanOrEqual(12);expect(gap).toBeLessThanOrEqual(24);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

test('inline receipt image supports zoom, keyboard pan, dragging and rotation',async({page})=>{
 await gotoHome(page);await page.getByRole('button',{name:'Try samples',exact:true}).click();const row=page.locator('article').first();
 const image=row.getByAltText('Inline preview of Sample cafe.png');await expect(image).toBeVisible();
 await row.getByRole('button',{name:'Zoom in image',exact:true}).click();const viewer=row.getByRole('region',{name:'Receipt image viewer',exact:true});
 await viewer.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');await expect.poll(()=>viewer.evaluate(el=>el.scrollLeft>0||el.scrollTop>0)).toBe(true);
 await viewer.evaluate(el=>el.scrollTo(0,0));const box=(await viewer.boundingBox())!;await page.mouse.move(box.x+box.width*.75,box.y+box.height*.75);await page.mouse.down();await page.mouse.move(box.x+box.width*.25,box.y+box.height*.25,{steps:4});await page.mouse.up();expect(await viewer.evaluate(el=>el.scrollLeft>0||el.scrollTop>0)).toBe(true);
 const before=await image.evaluate(el=>getComputedStyle(el).transform);await row.getByRole('button',{name:'Rotate image clockwise',exact:true}).click();await expect.poll(()=>image.evaluate(el=>getComputedStyle(el).transform)).not.toBe(before);
 await row.getByRole('button',{name:'Zoom out image',exact:true}).click();await expect(row.getByRole('button',{name:'Zoom out image',exact:true})).toBeDisabled();
});

test('bottom border follows real pending state and retry without a percentage',async({page})=>{
 let held:Route|undefined;await page.route('**/api/extract-receipt',route=>{held=route;});await gotoHome(page);await uploadReceipts(page,[await createGeneratedReceiptPng(page)]);
 await page.getByRole('button',{name:'Extract',exact:true}).click();const row=page.locator('article');const progress=row.getByRole('progressbar');await expect(progress).toBeVisible();expect(await progress.getAttribute('aria-valuenow')).toBeNull();
 const segment=progress.locator('span');const before=await segment.evaluate(el=>getComputedStyle(el).transform);await expect.poll(()=>segment.evaluate(el=>getComputedStyle(el).transform)).not.toBe(before);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(segment).toHaveCSS('animation-name','none');await expect.poll(()=>Boolean(held)).toBe(true);await held!.fulfill({status:503,json:{error:'Unavailable'}});await expect(progress).toHaveCount(0);
 await row.getByRole('button',{name:/^Expand /}).click();held=undefined;await row.getByRole('button',{name:'Retry',exact:true}).click();await expect(progress).toBeVisible();await expect.poll(()=>Boolean(held)).toBe(true);await held!.fulfill({json:{data:highConfidenceExtraction}});await expect(progress).toHaveCount(0);await expect(row.getByTestId('receipt-status')).toHaveText('Ready');
});

test('queue stopping preserves both active receipts and unprocessed work',async({page})=>{
 const held:Route[]=[];await page.route('**/api/extract-receipt',route=>{held.push(route);});await gotoHome(page);await uploadReceipts(page,[0,1,2].map(i=>({name:`queue-${i}.png`,mimeType:'image/png',buffer:Buffer.from(`queue ${i}`)})));
 await page.getByRole('button',{name:'Extract',exact:true}).click();await expect.poll(()=>held.length).toBe(2);await expect(page.getByRole('progressbar')).toHaveCount(2);await expect(page.getByText('0 of 3 processed',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Stop remaining receipts',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'Finishing active receipts',exact:true})).toBeDisabled();await held[1].fulfill({json:{data:highConfidenceExtraction}});await expect(page.getByText('1 of 3 processed',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Finishing active receipts',exact:true})).toBeDisabled();await held[0].fulfill({json:{data:highConfidenceExtraction}});await expect(page.getByText('2 of 3 processed · Stopped',{exact:true})).toBeVisible();expect(held).toHaveLength(2);await expect(page.locator('article').getByText('Queued',{exact:true})).toHaveCount(1);
});

test('long filenames stay inside a 360px row and selection is borderless',async({page})=>{
 await page.setViewportSize({width:360,height:900});await gotoHome(page);await uploadReceipts(page,[{name:'Expense-receipt-with-an-extended-filename-for-the-monthly-finance-review.png',mimeType:'image/png',buffer:Buffer.from('longname')}]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const button=page.locator('article').getByRole('button',{name:/^Deselect /});await expect(button).toHaveCSS('border-width','0px');await button.click();await expect(page.locator('article').getByRole('button',{name:/^Select /})).toHaveCSS('border-width','0px');
});

for (const width of [375, 768, 1280]) {
 test(`merchant wraps, grows and shrinks without changing its value at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await gotoHome(page);
  await page.getByRole('button',{name:'Try samples',exact:true}).click();
  const merchant=page.getByRole('textbox',{name:'Merchant Name',exact:true}).first();
  const shortHeight=(await merchant.boundingBox())!.height;
  expect(shortHeight).toBeGreaterThanOrEqual(44);expect(shortHeight).toBeLessThanOrEqual(46);
  const long='North Street Specialty Coffee and Bakery Collective, International Markets and Events Division — Downtown Riverside Branch '.repeat(4).trim();
  await merchant.fill(long);
  await expect.poll(async()=>(await merchant.boundingBox())!.height).toBeGreaterThan(shortHeight);
  expect(await merchant.evaluate(el=>el.scrollHeight<=el.clientHeight+1&&el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await expect(merchant).toHaveValue(long);
  await merchant.fill('Cafe');await expect.poll(async()=>(await merchant.boundingBox())!.height).toBeLessThanOrEqual(shortHeight+1);
  await merchant.fill(long);
  await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{const open=indexedDB.open('receipt-expenses');open.onsuccess=()=>{const db=open.result;const tx=db.transaction('batches','readonly');const get=tx.objectStore('batches').get('current');get.onsuccess=()=>resolve(get.result.items[0].formValues.merchantName);tx.oncomplete=()=>db.close();};}))).toBe(long);
  await page.reload();await expect(merchant).toHaveValue(long);await expect.poll(async()=>(await merchant.boundingBox())!.height).toBeGreaterThan(shortHeight);
  if(width===375){const mobileHeight=(await merchant.boundingBox())!.height;await page.setViewportSize({width:1280,height:900});await expect.poll(async()=>(await merchant.boundingBox())!.height).toBeLessThan(mobileHeight);await expect(merchant).toHaveValue(long);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

test('duplicate note lines appear once without changing saved or original content',async({page})=>{
 const notes=['Tax included.\nCheck the date.',' tax  included ','• CHECK THE DATE.'];
 await mockExtractionResponse(page,{...highConfidenceExtraction,notes});await gotoHome(page);await uploadReceipts(page,[await createGeneratedReceiptPng(page)]);
 await page.getByRole('button',{name:'Extract',exact:true}).click();const row=page.locator('article');await expect(row.getByTestId('receipt-status')).toHaveText('Ready');await row.getByRole('button',{name:/^Expand /}).click();
 await expect(row.getByRole('list',{name:'Notes',exact:true}).getByRole('listitem')).toHaveText(['Tax included.','Check the date.']);
 await expect(row.getByRole('list',{name:'Extraction notes',exact:true})).toHaveCount(0);
 const download=page.waitForEvent('download');await chooseExport(page,'JSON');
 const [record]=JSON.parse(await readFile((await(await download).path())!,'utf8'));expect(record.originalExtraction.notes).toEqual(notes);expect(record.values.notes).toBe(notes.join('\n'));
});

for (const width of [375,768,1280]) {
 test(`item names wrap and shrink while quantities and prices stay compact at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await mockExtractionResponse(page,highConfidenceExtraction);await gotoHome(page);
  await uploadReceipts(page,[await createGeneratedReceiptPng(page)]);await page.getByRole('button',{name:'Extract',exact:true}).click();
  const row=page.locator('article');await expect(row.getByTestId('receipt-status')).toHaveText('Ready');await row.getByRole('button',{name:/^Expand /}).click();
  const name=row.getByLabel('Item 1 name',{exact:true});const qty=row.getByLabel('Item 1 quantity',{exact:true});const price=row.getByLabel('Item 1 price',{exact:true});
  const short=(await name.boundingBox())!.height;expect(short).toBeGreaterThanOrEqual(44);expect(short).toBeLessThanOrEqual(46);
  const long='Specialty coffee and freshly baked sourdough breakfast for the international events team '.repeat(4).trim();
  await name.fill(long);await expect.poll(async()=>(await name.boundingBox())!.height).toBeGreaterThan(short);
  expect(await name.evaluate(el=>el.scrollHeight<=el.clientHeight+1&&el.scrollWidth<=el.clientWidth+1)).toBe(true);
  for(const input of [qty,price]){const box=(await input.boundingBox())!;expect(box.height).toBeLessThanOrEqual(46);expect(box.width).toBeLessThanOrEqual(80);}
  await name.fill('Coffee');await expect.poll(async()=>(await name.boundingBox())!.height).toBeLessThanOrEqual(short+1);await name.fill(long);
  await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{const open=indexedDB.open('receipt-expenses');open.onsuccess=()=>{const db=open.result;const tx=db.transaction('batches','readonly');const get=tx.objectStore('batches').get('current');get.onsuccess=()=>resolve(get.result.items[0].lineItems[0].name);tx.oncomplete=()=>db.close();};}))).toBe(long);
  await page.reload();await expect(name).toHaveValue(long);await expect.poll(async()=>(await name.boundingBox())!.height).toBeGreaterThan(short);
  if(width===375){const mobile=(await name.boundingBox())!.height;await page.setViewportSize({width:1280,height:900});await expect.poll(async()=>(await name.boundingBox())!.height).toBeLessThan(mobile);}
  const download=page.waitForEvent('download');await chooseExport(page,'JSON');const [record]=JSON.parse(await readFile((await(await download).path())!,'utf8'));expect(record.items[0].name).toBe(long);expect(record.originalExtraction.items[0].name).toBe('Coffee');
  const csvDownload=page.waitForEvent('download');await chooseExport(page,'CSV');expect(await readFile((await(await csvDownload).path())!,'utf8')).toContain(long);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

test('non-transaction findings appear once while field validation remains available',async({page})=>{
 const notes=['Image is a web form, not a traditional receipt.','Currency and total amount are not applicable as no transaction is present.','Date is not visible on the form.','Date could not be confidently extracted. Please enter it manually.','Total amount could not be confidently extracted. Please enter it manually.','Currency could not be confidently extracted. Please enter it manually.'];
 await mockExtractionResponse(page,{...highConfidenceExtraction,date:null,totalAmount:null,currency:null,notes});await gotoHome(page);await uploadReceipts(page,[await createGeneratedReceiptPng(page)]);await page.getByRole('button',{name:'Extract',exact:true}).click();
 const row=page.locator('article');await expect(row.getByTestId('receipt-status')).toHaveText('Needs attention');await row.getByRole('button',{name:/^Expand /}).click();
 await expect(row.getByRole('list',{name:'Notes',exact:true}).getByRole('listitem')).toHaveText(['No transaction found in this web form.']);await expect(row.getByRole('list',{name:'Extraction notes',exact:true})).toHaveCount(0);
 await expect(row.getByLabel('Date',{exact:true})).toHaveAttribute('aria-invalid','true');await expect(row.getByLabel('Total Amount',{exact:true})).toHaveAttribute('aria-invalid','true');await expect(page.getByRole('button',{name:'Export',exact:true})).toBeDisabled();
});
