import {chooseExport} from './support/actions';
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createGeneratedReceiptPng, gotoHome, uploadReceipt, extractButton, expandCurrentReceipt } from './support/receipt';
test('deployed real-provider extraction through reviewed CSV', async ({ page, baseURL }, info) => {
  test.skip(process.env.RUN_LIVE_GEMINI_E2E !== '1', 'Enable RUN_LIVE_GEMINI_E2E for live provider verification.');
  const localServer = !baseURL || ['localhost', '127.0.0.1', '[::1]'].includes(new URL(baseURL).hostname);
  test.skip(localServer && !process.env.GEMINI_API_KEY, 'Local live verification requires GEMINI_API_KEY.');
  test.setTimeout(120000);
  await gotoHome(page);
  await uploadReceipt(page, await createGeneratedReceiptPng(page));
  let responsePromise = page.waitForResponse(r => r.url().includes('/api/extract-receipt'));
  await extractButton(page, /^Extract$/i).click();
  let response = await responsePromise;
  console.log(JSON.stringify({ status: response.status(), requestId: response.headers()['x-request-id'] }));
  if (response.status() === 503) {
    await expect(page.getByRole('button', { name: 'Extract', exact: true })).toBeEnabled();
    await info.attach('provider-transient-failure', {
      body: JSON.stringify({ status: 503, requestId: response.headers()['x-request-id'], recovery: 'explicit user retry' }),
      contentType: 'application/json'
    });
    await page.waitForTimeout(2000);
    responsePromise = page.waitForResponse(r => r.url().includes('/api/extract-receipt'));
    await extractButton(page, /^Extract$/i).click();
    response = await responsePromise;
    console.log(JSON.stringify({ retryStatus: response.status(), requestId: response.headers()['x-request-id'] }));
  }
  expect(response.status(), 'Live provider extraction should succeed').toBe(200);
  await expandCurrentReceipt(page, 'live-gemini-receipt.png');
  const confidence = (await page.getByText(/^Extraction confidence (high|medium|low)$/i).innerText()).toLowerCase().replace('extraction confidence ', '');
  expect(Number(await page.getByLabel('Total Amount', { exact: true }).inputValue())).toBeGreaterThan(0);
  await page.getByRole('textbox', { name: 'Merchant Name', exact: true }).fill('Sample Receipt Mart');
  await page.getByLabel('Date', { exact: true }).fill('2026-05-11');
  await page.getByLabel('Currency', { exact: true }).fill('MYR');
  await page.getByLabel('Total Amount', { exact: true }).fill('22.80');
  const csvDownload = page.waitForEvent('download');
  await chooseExport(page,'CSV');
  const csv = await readFile((await (await csvDownload).path())!, 'utf8');
  expect(csv).toContain('"22.80"');
  expect(csv).toContain('"live-gemini-receipt.png"');
  const jsonDownload = page.waitForEvent('download');
  await chooseExport(page,'JSON');
  const records = JSON.parse(await readFile((await (await jsonDownload).path())!, 'utf8'));
  expect(records[0].originalExtraction.confidence).toBe(confidence);
  expect(csv).toContain(records[0].receiptId);
  expect(records[0].values.totalAmount).toBe('22.80');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled();
});
