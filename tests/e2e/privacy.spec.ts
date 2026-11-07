import {test,expect} from '@playwright/test';
import {gotoHome} from './support/receipt';
test('provider name is only disclosed in opt-in privacy details',async({page})=>{
 await gotoHome(page);
 await expect(page.getByText('Receipt images are sent to an AI provider for extraction.',{exact:true})).toBeVisible();
 const details=page.locator('details').filter({has:page.getByText('Privacy & storage',{exact:true})});
 await expect(details).not.toHaveAttribute('open');
 await expect(details.getByText(/Live extraction uses Google Gemini/)).toBeHidden();
 await details.locator('summary').focus();await page.keyboard.press('Enter');
 await expect(details.getByText(/Live extraction uses Google Gemini/)).toBeVisible();
 await page.keyboard.press('Enter');await expect(details.getByText(/Live extraction uses Google Gemini/)).toBeHidden();
 await page.getByRole('button',{name:'Try two sample receipts'}).click();
 await expect(page.locator('article')).toHaveCount(2);
 for(const card of await page.locator('article').all()){
  expect(await card.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  await expect(card.getByText(/Gemini/)).toHaveCount(0);
 }
});
