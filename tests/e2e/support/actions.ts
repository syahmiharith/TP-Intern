import type { Page } from '@playwright/test';

export async function chooseExport(page:Page,format:'CSV'|'JSON') {
  await page.getByRole('button',{name:'Export',exact:true}).click();
  await page.getByRole('menu',{name:'Export format',exact:true}).getByRole('menuitem',{name:format,exact:true}).click();
}
