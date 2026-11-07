import {test,expect} from '@playwright/test';
import {gotoHome} from './support/receipt';
test('provider name is only disclosed in opt-in privacy details',async({page})=>{
 await gotoHome(page);
 await expect(page.getByText('Uploads are sent to an external AI service.',{exact:true})).toBeVisible();
 const footer=page.getByRole('contentinfo');
 expect(await footer.evaluate(el=>el.getBoundingClientRect().top>=innerHeight)).toBe(true);
 await footer.scrollIntoViewIfNeeded();
 await expect(footer.getByRole('link',{name:/More work/})).toHaveAttribute('href','https://portfolio-syahmiharith.vercel.app/');
 await expect(footer.getByRole('link',{name:/Source code/})).toHaveAttribute('href','https://github.com/syahmiharith/receipt-to-form');
 const feedback=footer.getByRole('link',{name:/Report a problem/});
 const href=new URL((await feedback.getAttribute('href'))!);
 expect(href.pathname).toBe('/syahmiharith/receipt-to-form/issues/new');
 expect(href.searchParams.get('body')).toContain('Do not attach real receipts');
 await expect(feedback).toHaveAttribute('target','_blank');
 const details=footer.locator('details').filter({has:page.getByText('Privacy & storage',{exact:true})});
 await expect(details).not.toHaveAttribute('open');
 await expect(details.getByText(/Live extraction uses Google Gemini/)).toBeHidden();
 await details.locator('summary').focus();await page.keyboard.press('Enter');
 await expect(details.getByText(/Live extraction uses Google Gemini/)).toBeVisible();
 await page.keyboard.press('Enter');await expect(details.getByText(/Live extraction uses Google Gemini/)).toBeHidden();
 await page.getByRole('button',{name:'Try samples'}).click();
 await expect(page.locator('article')).toHaveCount(2);
 for(const card of await page.locator('article').all()){
  expect(await card.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
  await expect(card.getByText(/Gemini/)).toHaveCount(0);
 }
});
