import {chooseExport} from './support/actions';
import {test,expect} from '@playwright/test';
import {zipSync} from 'fflate';
import {readFile} from 'node:fs/promises';
import {createGeneratedReceiptPng,gotoHome,highConfidenceExtraction,uploadReceipts} from './support/receipt';

for(const width of [375,768,1280]){
 test(`ZIP selection joins the normal queue and survives refresh at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await gotoHome(page);const image=await createGeneratedReceiptPng(page);let calls=0;await page.route('**/api/extract-receipt',async route=>{calls++;await route.fulfill({json:{data:highConfidenceExtraction}});});
  const path='November/Client-breakfast-with-a-long-file-name-for-monthly-expenses.png';
  await uploadReceipts(page,[{name:'receipts.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({[path]:image.buffer,'notes.txt':Buffer.from('notes'),'nested.zip':Buffer.from('archive'),'other.png':image.buffer,'__MACOSX/._receipt.png':image.buffer}))}]);
  const picker=page.getByRole('region',{name:'Files in ZIP',exact:true});await expect(picker).toBeVisible();await expect(picker.getByRole('heading',{name:'Files in ZIP',exact:true})).toBeFocused();await expect(picker.getByRole('checkbox')).toHaveCount(4);await expect(picker.getByRole('checkbox',{name:'receipts.zip: notes.txt',exact:true})).toBeDisabled();await expect(picker.getByRole('checkbox',{name:'receipts.zip: nested.zip',exact:true})).toBeDisabled();expect(calls).toBe(0);await expect(page.locator('article')).toHaveCount(0);
  const choice=picker.getByRole('checkbox',{name:`receipts.zip: ${path}`,exact:true});await choice.focus();await page.keyboard.press('Space');await expect(choice).toBeChecked();await expect(picker.getByRole('button',{name:'Add 1 image',exact:true})).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await picker.getByRole('button',{name:'Add 1 image',exact:true}).click();await expect(picker).toHaveCount(0);await expect(page.locator('article')).toHaveCount(1);await expect(page.locator('article')).toContainText(path);expect(calls).toBe(0);
  await page.getByRole('button',{name:'Extract',exact:true}).click();await expect(page.locator('article').getByTestId('receipt-status')).toHaveText('Ready');expect(calls).toBe(1);
  await page.locator('article').getByRole('button',{name:`Expand ${path}`,exact:true}).click();await expect(page.getByAltText(`Inline preview of ${path}`)).toBeVisible();await page.getByLabel('Total Amount',{exact:true}).fill('12500');
  await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{const open=indexedDB.open('receipt-expenses');open.onsuccess=()=>{const db=open.result;const tx=db.transaction('batches','readonly');const get=tx.objectStore('batches').get('current');get.onsuccess=()=>resolve(get.result.items[0].formValues.totalAmount);tx.oncomplete=()=>db.close();};}))).toBe('12500');
  await page.reload();await expect(page.getByLabel('Total Amount',{exact:true})).toHaveValue('12500');const download=page.waitForEvent('download');await chooseExport(page,'CSV');const csv=await readFile((await(await download).path())!,'utf8');expect(csv).toContain(path);expect(csv).toContain('12500');
 });
}

test('ZIP import respects available slots, coexists with samples and skips duplicate images',async({page})=>{
 await gotoHome(page);await page.getByRole('button',{name:'Try samples',exact:true}).click();const image=await createGeneratedReceiptPng(page);const entries=Object.fromEntries(Array.from({length:5},(_,i)=>[`${i}.png`,image.buffer]));await uploadReceipts(page,[{name:'batch.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync(entries))}]);
 const picker=page.getByRole('region',{name:'Files in ZIP'});await expect(picker).toContainText('Choose up to 3 images');for(let i=0;i<3;i++)await picker.getByRole('checkbox',{name:`batch.zip: ${i}.png`,exact:true}).check();await expect(picker.getByRole('checkbox',{name:'batch.zip: 3.png',exact:true})).toBeDisabled();await picker.getByRole('button',{name:'Add 3 images',exact:true}).click();await expect(page.locator('article')).toHaveCount(3);await expect(page.getByRole('main').getByRole('alert')).toContainText('identical file skipped');await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{const open=indexedDB.open('receipt-expenses');open.onsuccess=()=>{const db=open.result;const tx=db.transaction('batches','readonly');const get=tx.objectStore('batches').get('current');get.onsuccess=()=>resolve(get.result.items.length);tx.oncomplete=()=>db.close();};}))).toBe(3);await page.reload();await expect(page.locator('article')).toHaveCount(3);
});

test('broken ZIP and corrupt image imports are recoverable and cancellation returns focus',async({page})=>{
 await gotoHome(page);await page.locator('input[type=file]').first().setInputFiles({name:'broken.zip',mimeType:'application/zip',buffer:Buffer.from('invalid')});await expect(page.getByRole('main').getByRole('alert')).toContainText('Could not open this ZIP');await expect(page.locator('input[type=file]')).toBeEnabled();
 const image=await createGeneratedReceiptPng(page);const archive={name:'mixed.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'bad.png':Buffer.from('not an image'),'good.png':image.buffer,'large.png':new Uint8Array(5*1024*1024+1)}))};await uploadReceipts(page,[archive]);const picker=page.getByRole('region',{name:'Files in ZIP'});await expect(picker.getByRole('checkbox',{name:'mixed.zip: large.png',exact:true})).toBeDisabled();await picker.getByRole('checkbox',{name:'mixed.zip: bad.png',exact:true}).check();await picker.getByRole('button',{name:'Add 1 image',exact:true}).click();await expect(picker.getByRole('alert')).toContainText('not a readable image');await expect(page.locator('article')).toHaveCount(0);
 await picker.getByRole('checkbox',{name:'mixed.zip: bad.png',exact:true}).uncheck();await picker.getByRole('checkbox',{name:'mixed.zip: good.png',exact:true}).check();await picker.getByRole('button',{name:'Add 1 image',exact:true}).click();await expect(page.locator('article')).toHaveCount(1);
 await uploadReceipts(page,[archive]);await picker.getByRole('button',{name:'Cancel ZIP import',exact:true}).click();await expect(picker).toHaveCount(0);await expect(page.getByLabel('Add files',{exact:true})).toBeFocused();
});

test('direct images and multiple ZIP files share one batch',async({page})=>{
 await gotoHome(page);const image=await createGeneratedReceiptPng(page);const second=Buffer.concat([image.buffer,Buffer.from('second')]);const third=Buffer.concat([image.buffer,Buffer.from('third')]);await uploadReceipts(page,[image,{name:'one.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'one.png':second}))},{name:'two.zip',mimeType:'application/zip',buffer:Buffer.from(zipSync({'two.png':third}))}]);
 const picker=page.getByRole('region',{name:'Files in ZIP'});await expect(page.locator('article')).toHaveCount(1);await picker.getByRole('checkbox',{name:'one.zip: one.png',exact:true}).check();await picker.getByRole('checkbox',{name:'two.zip: two.png',exact:true}).check();await picker.getByRole('button',{name:'Add 2 images',exact:true}).click();await expect(page.locator('article')).toHaveCount(3);
});


test('an unreadable ZIP does not discard independent image uploads',async({page})=>{
 await gotoHome(page);const image=await createGeneratedReceiptPng(page);await page.locator('input[type=file]').first().setInputFiles([image,{name:'broken.zip',mimeType:'application/zip',buffer:Buffer.from('invalid')}]);
 await expect(page.locator('article')).toHaveCount(1);await expect(page.locator('article')).toContainText(image.name);await expect(page.getByRole('main').getByRole('alert')).toContainText('broken.zip: Could not open this ZIP');await expect(page.getByRole('button',{name:'Extract',exact:true})).toBeEnabled();
});
