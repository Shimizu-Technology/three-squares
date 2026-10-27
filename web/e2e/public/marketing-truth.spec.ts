import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/health', route => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/v1/config*', route => route.fulfill({ json: {
    enable_storefront_three_squares: true,
    enable_storefront_catering: true,
    enable_storefront_latte_stone: false,
  } }));
  await page.route('**/api/v1/homepage_sections*', route => route.fulfill({ json: { grouped: { hero: [], category_card: [] } } }));
  await page.route('**/api/v1/locations*', route => route.fulfill({ json: { locations: [] } }));
  await page.route('**/api/v1/collections*', route => route.fulfill({ json: { collections: [] } }));
  await page.route('**/api/v1/products*', route => route.fulfill({ json: {
    products: [], meta: { page: 1, per_page: 12, total: 0 },
  } }));
  await page.route('**/api/v1/cart*', route => route.fulfill({ json: {
    items: [], item_count: 0, subtotal_cents: 0,
  } }));
});

test('home and about lead with food, the exact slogan, and both places', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('Good Food, Good Mood, Good Service');
  await expect(page.getByRole('heading', { name: 'Meals and catering' })).toBeVisible();
  await expect(page.getByText('Shop by Business')).toHaveCount(0);
  await expect(page.getByText('Latte Stone Cookies')).toHaveCount(0);
  await expect(page.locator('footer')).toContainText('Good Food, Good Mood, Good Service');

  await page.goto('/about');
  await expect(page.getByRole('heading', { name: 'Two places in Tamuning' })).toBeVisible();
  await expect(page.getByRole('link', { name: /View Main menu/i })).toHaveAttribute('href', '/menu/three-squares-main');
  await expect(page.getByRole('link', { name: /View Donki menu/i })).toHaveAttribute('href', '/menu/three-squares-donki');
  await expect(page.locator('main, body').last()).not.toContainText(/since 2016|HUBZone|reviewers on Yelp/i);
});

test('catering separates menu ordering from quote requests without unsupported terms', async ({ page }) => {
  await page.goto('/catering');
  await expect(page.locator('h1')).toHaveText('Food for your gathering');
  await expect(page.getByRole('link', { name: 'Browse catering items' })).toHaveAttribute('href', '/products?business_line=catering');
  await expect(page.locator('body')).not.toContainText(/\$12\.99|\$15\.99|\$24\.99|\$34\.99|50% deposit|48 hours notice|24-48 hours|Invoice\/PO/i);
  await page.getByRole('button', { name: 'Request a quote', exact: true }).first().click();
  const dialog = page.locator('dialog[aria-labelledby="catering-form-title"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Share your event details so the team can discuss a quote.');
  await expect(dialog).toContainText('Submitting this form requests a quote. It does not confirm availability or place an order.');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();

  await page.goto('/locations');
  await expect(page.locator('h1')).toHaveText('Main or Donki?');
  await expect(page.getByRole('link', { name: 'View Three Squares Main menu' })).toHaveAttribute('href', '/menu/three-squares-main');
  await expect(page.getByRole('link', { name: 'View Three Squares @ Donki menu' })).toHaveAttribute('href', '/menu/three-squares-donki');
  await expect(page.locator('body')).not.toContainText(/until sold out|HUBZone/i);
});

test('a homepage card without a photo does not borrow another dish image', async ({ page }) => {
  await page.route('**/api/v1/homepage_sections*', route => route.fulfill({ json: {
    grouped: { hero: [], category_card: [{
      id: 1, title: 'Catering', subtitle: 'Ask about an event',
      button_text: 'Learn more', button_link: '/catering', image_url: null,
    }] },
  } }));
  await page.goto('/');
  const card = page.locator('a[href="/catering"]').filter({ has: page.getByRole('heading', { name: 'Catering', exact: true }) });
  await expect(card.locator('[data-photo-state="unavailable"]')).toBeVisible();
  await expect(card.locator('img[src="/images/Cheeseburger.jpg"]')).toHaveCount(0);
});
