import {test,expect} from '@playwright/test';
import {gotoHome,uploadReceipt,mockExtractionResponse,highConfidenceExtraction} from './support/receipt';
import {readFile} from 'node:fs/promises';
test('samples and uploads use one direct-export queue and one export toolbar',async({page})=>{
 await mockExtractionResponse(page,highConfidenceExtraction);await gotoHome(page);
 await page.getByRole('button',{name:'Try samples'}).click();await uploadReceipt(page);
 await expect(page.locator('article')).toHaveCount(3);
 await page.getByRole('button',{name:'Extract 1 file',exact:true}).click();
 await expect(page.locator('article').filter({hasText:'sample-receipt.png'}).getByText('Ready',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:/Export expenses CSV/})).toHaveCount(1);
 await expect(page.locator('article').getByRole('button',{name:/Export/})).toHaveCount(0);
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Export expenses CSV (3)',exact:true}).click();
 expect(await readFile((await (await pending).path())!,'utf8')).toContain('Sample cafe.png');
 await page.reload();await expect(page.locator('article')).toHaveCount(3);
 await expect(page.getByRole('button',{name:'Export expenses CSV (3)',exact:true})).toBeEnabled();
});
