import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const BUSINESS_LINE_LABELS = {
  three_squares: 'Three Squares',
  latte_stone: 'Latte Stone Cookies',
  catering: 'Catering',
} as const;

async function seedCartWithBusinessLine(
  page: Page,
  request: APIRequestContext,
  businessLine: keyof typeof BUSINESS_LINE_LABELS
) {
  await page.goto('/');
  const apiBaseUrl = process.env.VITE_API_BASE_URL || 'http://localhost:3000';

  const seeded = await page.evaluate(() => {
    const sessionId = `pw-storefront-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem('cart_session_id', sessionId);
    localStorage.setItem(
      'three-squares-cart',
      JSON.stringify({
        state: { sessionId },
        version: 0,
      })
    );
    return { sessionId };
  });

  const productsResponse = await request.get(`${apiBaseUrl}/api/v1/products`, {
    params: {
      business_line: businessLine,
      per_page: '10',
    },
  });
  test.skip(!productsResponse.ok(), `Unable to fetch products for ${businessLine}`);
  const productsData = await productsResponse.json();
  const product = productsData?.products?.[0];
  test.skip(!product?.id, `No product found for ${businessLine}`);

  const addResponse = await request.post(`${apiBaseUrl}/api/v1/cart/items`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Session-ID': seeded.sessionId,
    },
    data: {
      product_id: product.id,
      quantity: 1,
    },
  });
  test.skip(!addResponse.ok(), `Cart add failed for ${businessLine}`);
  await page.reload();
  await expect(page.locator('nav button[aria-label*="Shopping cart with"]').first()).toHaveAttribute(
    'aria-label',
    /Shopping cart with [1-9]\d* item/,
    { timeout: 10000 }
  );
}

test.describe('Storefront Routes', () => {
  test('business storefront routes redirect into products query context', async ({ page }) => {
    await page.goto('/shop/catering');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/products\?business_line=catering/);
    await expect(page.locator('h1').first()).toContainText('Catering Menu');
  });

  test('storefront route keeps existing query params while enforcing business_line', async ({ page }) => {
    await page.goto('/shop/three-squares?search=chicken');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/products\?/);
    await expect(page).toHaveURL(/business_line=three_squares/);
    await expect(page).toHaveURL(/search=chicken/);
  });

  test('switching storefront with cross-context cart can be cancelled', async ({ page, request }) => {
    await seedCartWithBusinessLine(page, request, 'catering');

    const initialUrl = page.url();
    const dialogPromise = page.waitForEvent('dialog', { timeout: 10000 });

    const shopLink = page.locator('nav >> text=Shop').first();
    await shopLink.hover();
    await page.waitForTimeout(300);
    await page.locator('nav a:has-text("Latte Stone Cookies")').first().click();

    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('different storefront context');
    await dialog.dismiss();

    await expect(page).toHaveURL(initialUrl);
    await expect(page).not.toHaveURL(/business_line=latte_stone/);
  });

  test('switching storefront with cross-context cart can be confirmed', async ({ page, request }) => {
    await seedCartWithBusinessLine(page, request, 'catering');

    const dialogPromise = page.waitForEvent('dialog', { timeout: 10000 });

    const shopLink = page.locator('nav >> text=Shop').first();
    await shopLink.hover();
    await page.waitForTimeout(300);
    await page.locator('nav a:has-text("Latte Stone Cookies")').first().click();

    const dialog = await dialogPromise;
    expect(dialog.message()).toContain(BUSINESS_LINE_LABELS.latte_stone);
    await dialog.accept();

    await expect(page).toHaveURL(/business_line=latte_stone/);
    await expect(page.locator('h1').first()).toContainText('Latte Stone Cookie Shop');
  });
});
