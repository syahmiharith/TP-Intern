import { test as base } from '@playwright/test';
/** Workflow suites mock provider requests. Keep the pilot preflight equally explicit;
 * access-gate tests override this route and live-provider suites use the real endpoint. */
export const test=base.extend({
  page:async({page},run)=>{
    await page.route('**/api/pilot-access',route=>route.fulfill({json:{authorized:true}}));
    await run(page);
  }
});
export {expect} from '@playwright/test';
export type {Page,Route,Request,Locator} from '@playwright/test';
