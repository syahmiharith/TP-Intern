import {expect,test,type Route} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {gotoHome,highConfidenceExtraction,uploadReceipts} from './support/receipt';

for(const width of [375,768,1280]){
 test(`review actions match the saved revision at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await gotoHome(page);
  await expect(page.getByRole('button',{name:'Clear all saved receipts'})).toBeHidden();
  await page.getByRole('button',{name:'Try samples'}).click();
  const row=page.locator('article').first();
  if(width<1024){
   await row.getByRole('button',{name:'Show receipt image',exact:true}).focus();await page.keyboard.press('Enter');
   await expect(row.getByAltText('Inline preview of Sample cafe.png')).toBeVisible();
   await row.getByRole('button',{name:'Show form',exact:true}).focus();await page.keyboard.press('Enter');
   await expect(row.getByLabel('Total Amount',{exact:true})).toBeVisible();
  }
  await expect(row.getByRole('button',{name:'Save changes',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Extract',exact:true})).toHaveCount(0);
  const toggle=row.getByRole('button',{name:'Collapse Sample cafe.png',exact:true});
  await row.getByRole('button',{name:'Deselect Sample cafe.png',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded','true');
  await row.getByRole('button',{name:'Select Sample cafe.png',exact:true}).click();
  await row.getByRole('button',{name:'Mark reviewed',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(row.getByText('Reviewed',{exact:true})).toBeVisible();
  await expect(row.getByText('Needs review',{exact:true})).toHaveCount(0);
  await expect(row.getByRole('button',{name:'Mark reviewed',exact:true})).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded','true');
  await row.getByLabel('Total Amount',{exact:true}).fill('15.00');
  await expect(row.getByText('Unsaved changes',{exact:true})).toBeVisible();
  await expect(row.getByRole('button',{name:'Mark reviewed',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Export expenses CSV (0)',exact:true})).toBeDisabled();
  await row.getByRole('button',{name:'Discard changes',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(row.getByText('Reviewed',{exact:true})).toBeVisible();
  await expect(row.getByLabel('Total Amount',{exact:true})).toHaveValue('12.5');
  await expect(page.getByRole('button',{name:'Export expenses CSV (1)',exact:true})).toBeEnabled();
  await expect(row.getByRole('button',{name:'Save changes',exact:true})).toHaveCount(0);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export expenses CSV (1)',exact:true}).focus();await page.keyboard.press('Enter');
  expect(await readFile((await (await download).path())!,'utf8')).toContain('"12.5"');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

test('a failed receipt can retry independently without changing a successful receipt',async({page})=>{
 let calls=0;
 await page.route('**/api/extract-receipt',async route=>{
  calls+=1;await route.fulfill(calls===1?{status:503,json:{error:'Reading is temporarily unavailable.'}}:{json:{data:highConfidenceExtraction}});
 });
 await gotoHome(page);await uploadReceipts(page,[
  {name:'retry.png',mimeType:'image/png',buffer:Buffer.from('retry')},
  {name:'success.png',mimeType:'image/png',buffer:Buffer.from('success')}
 ]);
 await page.getByRole('button',{name:'Extract 2 files',exact:true}).click();
 const failed=page.locator('article').filter({hasText:'retry.png'});
 const successful=page.locator('article').filter({hasText:'success.png'});
 await expect(failed.getByRole('button',{name:'Retry',exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Try samples'})).toBeEnabled();
 await expect(failed.getByLabel('Merchant Name',{exact:true})).toHaveCount(0);
 await failed.getByRole('button',{name:'Deselect retry.png',exact:true}).click();
 await failed.getByRole('button',{name:'Retry',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(failed.getByText('Needs review',{exact:true})).toBeVisible();
 await expect(successful.getByText('Needs review',{exact:true})).toBeVisible();
 await expect(successful.getByText(/FamilyMart · KRW/)).toBeVisible();
 await successful.getByRole('button',{name:'Expand success.png',exact:true}).click();
 await successful.getByRole('button',{name:'Mark reviewed',exact:true}).click();
 await expect(successful.getByText('Reviewed',{exact:true})).toBeVisible();
 await expect(successful.getByText('Needs review',{exact:true})).toHaveCount(0);
 expect(calls).toBe(3);
});

test('queue counts reflect completed requests and stopping waits for the current receipt',async({page})=>{
 let held:Route|undefined;let calls=0;
 await page.route('**/api/extract-receipt',async route=>{calls+=1;held=route;});
 await gotoHome(page);await uploadReceipts(page,[0,1,2].map(i=>({name:`queue-${i}.png`,mimeType:'image/png',buffer:Buffer.from(`queue-${i}`)})));
 await page.getByRole('button',{name:'Extract 3 files',exact:true}).click();
 await expect(page.getByText('0 of 3 processed',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Extract',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Extract',exact:true})).toHaveCSS('opacity','0.4');
 await expect(page.getByRole('button',{name:'Delete queue-0.png',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Stop queue after current receipt',exact:true}).click();
 await expect(page.getByRole('button',{name:'Stopping after current receipt',exact:true})).toBeDisabled();
 await expect.poll(()=>Boolean(held)).toBe(true);await held!.fulfill({json:{data:highConfidenceExtraction}});
 await expect(page.getByText('1 of 3 processed · Stopped',{exact:true})).toBeVisible();
 await expect(page.locator('article').getByText('Queued',{exact:true})).toHaveCount(2);
 expect(calls).toBe(1);
});


test('an unreadable image keeps an actionable preview and keyboard exit',async({page})=>{
 await gotoHome(page);await uploadReceipts(page,[{name:'unreadable.png',mimeType:'image/png',buffer:Buffer.from('not an image')}]);
 await page.getByRole('button',{name:'Preview unreadable.png',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('alert')).toHaveText('This image could not be displayed. Close the preview and try another file.');
 await expect(dialog.getByRole('button',{name:'Zoom in',exact:true})).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'Close preview',exact:true})).toBeFocused();
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Preview unreadable.png',exact:true})).toBeFocused();
});

for (const width of [375, 768, 1280]) {
 test(`currency search, notes and footer placement at ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:900});
  await gotoHome(page);
  await page.getByRole('button',{name:'Try samples',exact:true}).click();
  const row=page.locator('article').first();
  const currency=row.getByRole('combobox',{name:'Currency',exact:true});
  await currency.click();
  await expect(row.getByRole('listbox',{name:'Currencies'}).getByRole('option')).toHaveCount(await page.evaluate(()=>Intl.supportedValuesOf('currency').length));
  await currency.fill('Malaysian');
  await expect(row.getByRole('option',{name:'MYR Malaysian Ringgit'})).toBeVisible();
  await currency.press('ArrowDown');
  const active=await currency.getAttribute('aria-activedescendant');
  expect(active).toContain('MYR');
  await currency.press('Enter');
  await expect(currency).toHaveValue('MYR');
  await expect(row.getByRole('listbox')).toBeHidden();
  await currency.click();
  await currency.fill('yen');
  await row.getByRole('option',{name:'JPY Japanese Yen'}).click();
  await expect(currency).toHaveValue('JPY');
  await currency.click();
  await currency.fill('USD');
  await currency.press('Enter');
  const notes=row.getByLabel('Notes',{exact:true});
  await notes.fill('');
  await notes.pressSequentially('Lunch with client',{delay:10});
  await expect(notes).toHaveValue('Lunch with client');
  await expect(row.getByTestId('receipt-status')).toHaveText('Unsaved changes');
  await expect(row.getByText('Extraction confidence high',{exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>new Promise(resolve=>{const open=indexedDB.open('receipt-expenses');open.onsuccess=()=>{const db=open.result;const tx=db.transaction('batches','readonly');const get=tx.objectStore('batches').get('current');get.onsuccess=()=>resolve(get.result.items[0].formValues.notes);tx.oncomplete=()=>db.close();};}))).toBe('Lunch with client');
  await page.reload();
  await expect(notes).toHaveValue('Lunch with client');
  await row.getByRole('button',{name:'Save changes',exact:true}).click();
  await row.getByRole('button',{name:'Mark reviewed',exact:true}).click();
  await expect(row.getByTestId('receipt-status')).toHaveText('Reviewed');
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export expenses CSV (1)',exact:true}).click();
  const csv=await readFile((await (await pending).path())!,'utf8');
  expect(csv).toContain('"Lunch with client"');
  expect(csv).toContain('"USD"');
  const toolbar=page.getByLabel('Batch actions',{exact:true});
  const footer=page.locator('footer');
  await footer.scrollIntoViewIfNeeded();
  const gap=await page.evaluate(()=>document.querySelector('footer')!.getBoundingClientRect().top-document.querySelector('[aria-label="Batch actions"]')!.getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(12);
  expect(gap).toBeLessThanOrEqual(24);
  await expect(toolbar.getByRole('button',{name:'Export expenses CSV (1)',exact:true})).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}

test('long filenames remain within a narrow receipt card',async({page})=>{
 await page.setViewportSize({width:360,height:900});
 await gotoHome(page);
 await page.route('**/api/extract-receipt',route=>route.fulfill({json:{data:highConfidenceExtraction}}));
 const name='Expense-receipt-with-an-extended-filename-for-the-monthly-finance-review.png';
 await uploadReceipts(page,[{name,mimeType:'image/png',buffer:Buffer.from('synthetic narrow layout')}]);
 await page.getByRole('button',{name:'Extract 1 file',exact:true}).click();
 await page.getByRole('button',{name:`Expand ${name}`,exact:true}).click();
 await expect(page.getByRole('combobox',{name:'Currency',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
