import { test, expect } from './support/test';

test('search and sharing metadata identify the product, its author and canonical entry', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Receipt-to-Form | Receipt to CSV & JSON');
  const canonical = 'https://receipt-to-form-syahmiharith.vercel.app';
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonical);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /editable expenses.*CSV or JSON/);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', await page.title());
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  const data = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
  expect(data['@type']).toBe('SoftwareApplication');
  expect(data.url).toBe(canonical);
  expect(data.author.name).toBe('Zulsyahmi Zulkefli');
  expect(data.author.url).toBe('https://portfolio-syahmiharith.vercel.app');
  expect(data).not.toHaveProperty('aggregateRating');
  const imageUrl = await page.locator('meta[property="og:image"]').getAttribute('content');
  const image = await request.get(new URL(imageUrl!).pathname);
  expect(image.ok()).toBe(true);
  expect(image.headers()['content-type']).toContain('image/png');
  expect((await image.body()).subarray(1, 4).toString()).toBe('PNG');
  const robots = await request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain(`Sitemap: ${canonical}/sitemap.xml`);
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain(`<loc>${canonical}</loc>`);
});
