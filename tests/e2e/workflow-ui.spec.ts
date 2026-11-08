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
  await page.getByRole('button',{name:'Extract 1 file',exact:true}).click();const row=page.locator('article');
  await expect(row.getByTestId('receipt-status')).toHaveText('Ready');await row.getByRole('button',{name:'Expand items.png',exact:true}).click();
  const total=row.getByLabel('Total Amount',{exact:true});await expect(total).toHaveAttribute('type','text');await expect(total).toHaveAttribute('inputmode','decimal');
  await expect(row.getByLabel('Date',{exact:true})).toHaveAttribute('type','date');
  const type=row.getByRole('combobox',{name:'Receipt Type',exact:true});await type.fill('Transport');await type.press('ArrowDown');await type.press('Enter');await expect(type).toHaveValue('Transport');
  await expect(row.locator('select')).toHaveCount(0);
  const currency=row.getByRole('combobox',{name:'Currency',exact:true});await currency.click();await expect(row.getByRole('listbox',{name:'Currencies'}).getByRole('option')).toHaveCount(currentCurrencies.length);await currency.fill('Malaysian');await currency.press('Enter');await expect(currency).toHaveValue('MYR');
  await row.getByLabel('Item 1 name',{exact:true}).fill('Client lunch');await row.getByLabel('Item 1 quantity',{exact:true}).fill('1.25');await row.getByLabel('Item 1 price',{exact:true}).fill('2.75');
  await expect(total).toHaveValue('12000');
  await expect(page.getByRole('button',{name:'Export expenses CSV (1)',exact:true})).toBeEnabled();
  await page.waitForTimeout(300);await page.reload();
  await expect(row.getByLabel('Item 1 name',{exact:true})).toHaveValue('Client lunch');await expect(row.getByLabel('Item 1 quantity',{exact:true})).toHaveValue('1.25');await expect(row.getByLabel('Item 1 price',{exact:true})).toHaveValue('2.75');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();
  const [record]=JSON.parse(await readFile((await(await download).path())!,'utf8'));
  expect(record.schemaVersion).toBe(2);expect(record.items[0]).toEqual({name:'Client lunch',quantity:'1.25',price:'2.75'});expect(record.originalExtraction.items[0].name).toBe('Coffee');expect(record.originalExtraction.confidence).toBe('high');
  const csvDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Export expenses CSV (1)',exact:true}).click();const csv=await readFile((await(await csvDownload).path())!,'utf8');expect(csv).toContain('Client lunch');expect(csv).toContain('2.75');expect(csv).toContain(record.receiptId);
  await row.getByLabel('Item 1 price',{exact:true}).fill('1e3');await expect(page.getByRole('button',{name:'Export expenses CSV (0)',exact:true})).toBeDisabled();await row.getByLabel('Item 1 price',{exact:true}).fill('-2.50');await expect(page.getByRole('button',{name:'Export expenses CSV (1)',exact:true})).toBeEnabled();
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
 await page.getByRole('button',{name:'Extract 1 file',exact:true}).click();const row=page.locator('article');const progress=row.getByRole('progressbar');await expect(progress).toBeVisible();expect(await progress.getAttribute('aria-valuenow')).toBeNull();
 const segment=progress.locator('span');const before=await segment.evaluate(el=>getComputedStyle(el).transform);await expect.poll(()=>segment.evaluate(el=>getComputedStyle(el).transform)).not.toBe(before);
 await page.emulateMedia({reducedMotion:'reduce'});await expect(segment).toHaveCSS('animation-name','none');await expect.poll(()=>Boolean(held)).toBe(true);await held!.fulfill({status:503,json:{error:'Unavailable'}});await expect(progress).toHaveCount(0);
 await row.getByRole('button',{name:/^Expand /}).click();held=undefined;await row.getByRole('button',{name:'Retry',exact:true}).click();await expect(progress).toBeVisible();await expect.poll(()=>Boolean(held)).toBe(true);await held!.fulfill({json:{data:highConfidenceExtraction}});await expect(progress).toHaveCount(0);await expect(row.getByTestId('receipt-status')).toHaveText('Ready');
});

test('queue stopping preserves completed receipts and unprocessed work',async({page})=>{
 let held:Route|undefined;let calls=0;await page.route('**/api/extract-receipt',route=>{calls++;held=route;});await gotoHome(page);await uploadReceipts(page,[0,1,2].map(i=>({name:`queue-${i}.png`,mimeType:'image/png',buffer:Buffer.from(`queue ${i}`)})));
 await page.getByRole('button',{name:'Extract 3 files',exact:true}).click();await expect(page.getByText('0 of 3 processed',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Stop queue after current receipt',exact:true}).click();await expect(page.getByRole('button',{name:'Stopping after current receipt',exact:true})).toBeDisabled();await expect.poll(()=>Boolean(held)).toBe(true);await held!.fulfill({json:{data:highConfidenceExtraction}});await expect(page.getByText('1 of 3 processed · Stopped',{exact:true})).toBeVisible();expect(calls).toBe(1);await expect(page.locator('article').getByText('Queued',{exact:true})).toHaveCount(2);
});

test('long filenames stay inside a 360px row and selection is borderless',async({page})=>{
 await page.setViewportSize({width:360,height:900});await gotoHome(page);await uploadReceipts(page,[{name:'Expense-receipt-with-an-extended-filename-for-the-monthly-finance-review.png',mimeType:'image/png',buffer:Buffer.from('longname')}]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const button=page.locator('article').getByRole('button',{name:/^Deselect /});await expect(button).toHaveCSS('border-width','0px');await button.click();await expect(page.locator('article').getByRole('button',{name:/^Select /})).toHaveCSS('border-width','0px');
});
